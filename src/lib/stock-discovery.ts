/**
 * 运行时动态股票发现模块
 *
 * 从东方财富 clist 分页接口获取全 A 股列表，自动发现新上市股票，
 * 与静态基线 (stocks-fallback.json) 合并后供 market-data.ts 使用。
 *
 * 设计原则：
 * - 新股上市当天自动出现，不依赖 GitHub Actions 或手动跑脚本
 * - 行业分类逻辑与 fetch_stocks.py 完全一致
 * - 静态 JSON 降为兜底，API 失败时仍可用
 * - 缓存 TTL 按交易时段动态调整：开市 15 分钟、休市 1 小时
 * - 总数预检：先查 total，没变就跳过全量拉取，降低 API 负载
 */
import fallbackMarketSnapshot from "@/lib/data/stocks-fallback.json";
import subboardSnapshot from "@/lib/data/subboards.json";
import { isTradingHours } from "@/lib/trading-hours";
import type { ExchangeCode } from "@/types/heatmap";

// ============ 类型定义 ============

/** 股票快照（与 market-data.ts 中的 StockSnapshot 一致） */
export type StockSnapshot = {
  code: string;
  exchange: ExchangeCode;
  name: string;
  boardName: string;
  subBoardName: string;
  price: number;
  changePct: number;
  totalMarketCap: number;
  floatMarketCap: number;
  turnoverAmount?: number;
};

// ============ 申万二级行业 → 大板块映射表 ============
// 与 fetch_stocks.py 中 INDUSTRY_TO_BOARD 完全一致

const INDUSTRY_TO_BOARD: Record<string, string> = {
  // ===== 金融 (8) =====
  国有大型银行: "金融", 股份制银行: "金融", 城商行: "金融",
  农商行: "金融", 证券: "金融", 保险: "金融", 多元金融: "金融",
  银行: "金融",

  // ===== 半导体 (1) =====
  半导体: "半导体",

  // ===== 新能源 (5) =====
  光伏设备: "新能源", 电池: "新能源", 风电设备: "新能源",
  其他电源设备: "新能源", 电机: "新能源",

  // ===== AI与软件 (3) =====
  IT服务: "AI与软件", 软件开发: "AI与软件", 互联网电商: "AI与软件",

  // ===== 消费电子 (5) =====
  消费电子: "消费电子", 光学光电子: "消费电子", 元件: "消费电子",
  其他电子: "消费电子", 计算机设备: "消费电子",

  // ===== 通信 (2) =====
  通信设备: "通信", 通信服务: "通信",

  // ===== 汽车 (5) =====
  汽车零部件: "汽车", 乘用车: "汽车", 商用车: "汽车",
  摩托车及其他: "汽车", 汽车服务: "汽车",

  // ===== 国防航天 (5) =====
  航空装备: "国防航天", 军工电子: "国防航天", 航天装备: "国防航天",
  地面兵装: "国防航天", 航海装备: "国防航天",

  // ===== 医药制药 (5) =====
  化学制药: "医药制药", 中药: "医药制药", 生物制品: "医药制药",
  医药商业: "医药制药", 医疗服务: "医药制药",

  // ===== 医疗健康 (3) =====
  医疗器械: "医疗健康", 医疗美容: "医疗健康", 化妆品: "医疗健康",

  // ===== 化工材料 (10) =====
  化学制品: "化工材料", 化学原料: "化工材料", 农化制品: "化工材料",
  化学纤维: "化工材料", 塑料: "化工材料", 橡胶: "化工材料",
  非金属材料: "化工材料", 电子化学品: "化工材料", 玻璃玻纤: "化工材料",
  炼化及贸易: "化工材料",

  // ===== 机械装备 (6) =====
  通用设备: "机械装备", 专用设备: "机械装备", 工程机械: "机械装备",
  轨交设备: "机械装备", 自动化设备: "机械装备", 油服工程: "机械装备",

  // ===== 食品饮料 (6) =====
  白酒: "食品饮料", 调味发酵品: "食品饮料", 食品加工: "食品饮料",
  饮料乳品: "食品饮料", 休闲食品: "食品饮料", 非白酒: "食品饮料",

  // ===== 消费零售 (17) =====
  一般零售: "消费零售", 专业连锁: "消费零售", 贸易: "消费零售",
  家居用品: "消费零售", 服装家纺: "消费零售", 纺织制造: "消费零售",
  饰品: "消费零售", 珠宝首饰: "消费零售", 钟表: "消费零售",
  包装印刷: "消费零售", 文娱用品: "消费零售", 造纸: "消费零售",
  旅游及景区: "消费零售", 酒店餐饮: "消费零售", 小家电: "消费零售",
  厨卫电器: "消费零售", 家电零部件: "消费零售",

  // ===== 资源周期 (13) =====
  工业金属: "资源周期", 小金属: "资源周期", 能源金属: "资源周期",
  贵金属: "资源周期", 煤炭开采: "资源周期", 焦炭: "资源周期",
  油气开采: "资源周期", 普钢: "资源周期", 特钢: "资源周期",
  冶钢原料: "资源周期", 燃气: "资源周期", 水泥: "资源周期",

  // ===== 地产基建 (8) =====
  房地产开发: "地产基建", 房地产服务: "地产基建", 房屋建设: "地产基建",
  装修装饰: "地产基建", 基础建设: "地产基建", 专业工程: "地产基建",
  工程咨询服务: "地产基建", 装修建材: "地产基建",

  // ===== 电力公用 (3) =====
  电力: "电力公用", 电网设备: "电力公用", 环保设备: "电力公用",

  // ===== 传媒 (4) =====
  游戏: "传媒", 影视院线: "传媒", 出版: "传媒", 电视广播: "传媒",

  // ===== 农林牧渔 (10) =====
  养殖业: "农林牧渔", 种植业: "农林牧渔", 林业: "农林牧渔",
  渔业: "农林牧渔", 饲料: "农林牧渔", 农业综合: "农林牧渔",
  农产品加工: "农林牧渔", 农药兽药: "农林牧渔", 动物疫苗: "农林牧渔",
  动物保健: "农林牧渔",

  // ===== 交运物流 (4) =====
  航运港口: "交运物流", 航空机场: "交运物流", 铁路公路: "交运物流",
  物流: "交运物流",

  // ===== 其他兜底 =====
  照明设备: "消费电子",
  广告营销: "传媒",
  数字媒体: "传媒",
  环境治理: "电力公用",
  水处理: "电力公用",
  专业服务: "消费零售",
  综合: "综合",

  // ===== 补充缺失的子行业映射 =====
  金属新材料: "化工材料",
  教育: "传媒",
  个护用品: "消费零售",
  白色家电: "消费零售",
  黑色家电: "消费零售",
  体育: "消费零售",
  其他家电: "消费零售",
  旅游零售: "消费零售",
};

// ============ 个别公司特殊处理白名单 ============
// 与 fetch_stocks.py 中 STOCK_OVERRIDE 完全一致

const STOCK_OVERRIDE: Record<string, string> = {
  // === 家电零部件 → 汽车（主营汽车热管理/汽车零部件）===
  "002050.SZ": "汽车",  // 三花智控
  "000404.SZ": "消费零售",  // 长虹华意
  "600619.SH": "汽车",  // 海立股份
  "002011.SZ": "汽车",  // 盾安环境

  // === 停牌股修正 ===
  "600439.SH": "消费零售",  // 瑞贝卡
  "920305.BJ": "AI与软件",  // 云创退
  "300333.SZ": "消费电子",  // 兆日科技

  // === 发电企业错配在新能源设备 ===
  "920239.BJ": "电力公用",  // 长虹能源
  "688717.SH": "电力公用",  // 艾罗能源
  "688429.SH": "电力公用",  // 时创能源
  "688223.SH": "电力公用",  // 晶科能源
  "688303.SH": "电力公用",  // 大全能源
  "300438.SZ": "电力公用",  // 鹏辉能源
  "000809.SZ": "电力公用",  // 和展能源
  "000695.SZ": "电力公用",  // 滨海能源

  // === 医疗服务机构错配在医药制药 ===
  "603716.SH": "医疗健康",  // 塞力医疗
  "603108.SH": "医疗健康",  // 润达医疗
  "600763.SH": "医疗健康",  // 通策医疗
  "002622.SZ": "医疗健康",  // 皓宸医疗
  "002173.SZ": "医疗健康",  // 创新医疗

  // === 纯软件公司错配在消费电子 ===
  "300588.SZ": "AI与软件",  // 熙菱信息
  "300659.SZ": "AI与软件",  // 中孚信息
};

// ============ clist 接口配置 ============

const CLIST_HOSTS = [
  "push2delay.eastmoney.com",
  "82.push2.eastmoney.com",
  "7.push2.eastmoney.com",
  "48.push2.eastmoney.com",
  "push2.eastmoney.com",
];

const CLIST_PATH = "/api/qt/clist/get";
const CLIST_FS = "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048";
const CLIST_PAGE_SIZE = 100;
const CLIST_CONCURRENCY = 4;
const CLIST_FIELDS = "f2,f3,f6,f12,f13,f14,f18,f20,f21,f24,f25,f100,f109,f110,f124";
const CLIST_UT = "bd1d9ddb04089700cf9c27f6f7426281";
const CLIST_TIMEOUT_MS = 15_000;
const CLIST_MAX_RETRIES = 3;

const CLIST_HEADERS = {
  Referer: "https://quote.eastmoney.com/",
  "User-Agent": "Mozilla/5.0 (compatible; StockMatrix/1.0)",
  Accept: "application/json, text/plain, */*",
};

// ============ 静态基线数据 ============

const fallbackSeed = fallbackMarketSnapshot as {
  updatedAt: string;
  stockCount: number;
  boardCount: number;
  stocks: Array<Omit<StockSnapshot, "subBoardName">>;
};

const subboardSeed = subboardSnapshot as {
  updatedAt: string;
  count: number;
  subboards: Record<string, { sectorName: string; subBoardName: string }>;
};

/** 静态基线股票列表（从 JSON 快照加载，作为兜底和合并基础） */
export const baselineStocks: StockSnapshot[] = fallbackSeed.stocks.map((stock) => {
  const mapped = subboardSeed.subboards[stock.code];
  return {
    ...stock,
    boardName: mapped?.sectorName ?? stock.boardName,
    subBoardName: mapped?.subBoardName ?? stock.boardName,
  };
});

// ============ 工具函数 ============

/** 安全转数字，无效返回 0 */
function safeNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

/** 清理股票名称：全角转半角、去多余空格 */
function cleanName(raw: string): string {
  let name = raw
    .replace("\uFF21", "A")
    .replace("\uFF22", "B")
    .replace("\u3000", " ");
  while (name.includes("  ")) {
    name = name.replace("  ", " ");
  }
  return name.trim();
}

/** 判断交易所：f13=1 → SH，代码以 4/8/9 开头 → BJ，其余 → SZ */
function determineExchange(code: string, marketFlag: number): ExchangeCode {
  if (marketFlag === 1) return "SH";
  if (/^[489]/.test(code)) return "BJ";
  return "SZ";
}

// ============ 对外函数：行业分类 ============

/** 根据申万二级行业名返回大板块名，未匹配返回 null */
export function classifyByIndustry(rawIndustry: string): string | null {
  if (!rawIndustry || rawIndustry === "-") return null;
  const clean = rawIndustry.replace("Ⅱ", "").replace("Ⅰ", "").trim();
  if (!clean) return null;
  return INDUSTRY_TO_BOARD[clean] ?? null;
}

// ============ 对外函数：clist 解析 ============

/** 解析东方财富 clist 接口返回的 JSON（支持单页或多页） */
export function parseClistStocks(payload: unknown | unknown[]): StockSnapshot[] {
  const payloads = Array.isArray(payload) ? payload : [payload];
  const stocks: StockSnapshot[] = [];
  const seenCodes = new Set<string>();

  for (const singlePayload of payloads) {
    const diff = (singlePayload as { data?: { diff?: unknown[] } })?.data?.diff;
    if (!Array.isArray(diff)) continue;

    for (const item of diff) {
      const row = item as Record<string, unknown>;
      const codeRaw = String(row.f12 ?? "").trim();
      if (!codeRaw) continue;

      const price = safeNumber(row.f2);
      if (price <= 0) continue;

      const marketFlag = safeNumber(row.f13);
      const exchange = determineExchange(codeRaw, marketFlag);
      const fullCode = `${codeRaw}.${exchange}`;

      if (seenCodes.has(fullCode)) continue;
      seenCodes.add(fullCode);

      const name = cleanName(String(row.f14 ?? "").trim());
      const changePct = safeNumber(row.f3);
      const totalCap = safeNumber(row.f20);
      const floatCap = safeNumber(row.f21);
      const rawIndustry = String(row.f100 ?? "").trim();

      // 行业分类
      let boardName = classifyByIndustry(rawIndustry) ?? "其他";

      // 白名单覆盖
      if (fullCode in STOCK_OVERRIDE) {
        boardName = STOCK_OVERRIDE[fullCode];
      }

      // 子板块名 = 申万二级行业名（去 Ⅱ 后缀）
      let subBoardName = rawIndustry
        ? rawIndustry.replace("Ⅱ", "").replace("Ⅰ", "").trim()
        : boardName;
      if (!subBoardName) subBoardName = boardName;

      stocks.push({
        code: fullCode,
        exchange,
        name,
        price,
        changePct,
        totalMarketCap: totalCap,
        floatMarketCap: floatCap,
        boardName,
        subBoardName,
      });
    }
  }

  return stocks;
}

// ============ 对外函数：合并逻辑 ============

/**
 * 将动态发现的股票列表与静态基线合并
 *
 * 合并策略：
 * - 动态列表中的股票：更新价格/市值等动态字段，subBoardName 优先用基线值
 * - 基线中有但动态未返回的股票：保留（可能停牌）
 * - 新股（不在基线中）：直接使用动态数据
 */
export function mergeDiscoveredWithBaseline(
  discovered: StockSnapshot[],
  baseline: StockSnapshot[]
): StockSnapshot[] {
  const baselineMap = new Map(baseline.map((s) => [s.code, s]));
  const result: StockSnapshot[] = [];
  const discoveredCodes = new Set<string>();

  for (const stock of discovered) {
    discoveredCodes.add(stock.code);
    const old = baselineMap.get(stock.code);
    const boardName = stock.code in STOCK_OVERRIDE ? STOCK_OVERRIDE[stock.code] : stock.boardName;

    if (old) {
      // 已有股票：保留基线的 subBoardName，更新动态字段
      result.push({
        ...stock,
        boardName,
        subBoardName: old.subBoardName || stock.subBoardName,
      });
    } else {
      // 新股：使用动态数据
      result.push({ ...stock, boardName });
    }
  }

  // 保留基线中未被动态返回的股票（可能停牌）
  for (const stock of baseline) {
    if (!discoveredCodes.has(stock.code)) {
      result.push(stock);
    }
  }

  return result;
}

// ============ clist API 请求 ============

/** 拉取 clist 一页数据 */
async function fetchClistPage(pageNum: number): Promise<unknown> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < CLIST_MAX_RETRIES; attempt++) {
    const host = CLIST_HOSTS[attempt % CLIST_HOSTS.length];
    const url =
      `https://${host}${CLIST_PATH}` +
      `?pn=${pageNum}&pz=${CLIST_PAGE_SIZE}&po=1&np=1` +
      `&ut=${CLIST_UT}&fltt=2&invt=2&fid=f12` +
      `&fs=${CLIST_FS}&fields=${CLIST_FIELDS}`;

    try {
      const response = await fetch(url, {
        headers: CLIST_HEADERS,
        next: { revalidate: 0 },
        cache: "no-store",
        signal: AbortSignal.timeout(CLIST_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < CLIST_MAX_RETRIES - 1) {
        await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
      }
    }
  }

  throw lastError ?? new Error("fetchClistPage failed");
}

/**
 * 并发拉取全部分页，返回 payloads 和总股票数。
 *
 * 注意：discoverStocks() 现在内联了此逻辑以支持总数预检优化。
 * 此函数保留供外部调用或测试使用。
 */
async function fetchAllClistPages(): Promise<{ payloads: unknown[]; total: number }> {
  // 先拉第一页获取总数
  const firstPayload = (await fetchClistPage(1)) as {
    data?: { total?: number };
  };
  const total = firstPayload.data?.total ?? 0;
  if (total <= 0) {
    throw new Error(`clist total is invalid: ${total}`);
  }

  const pageCount = Math.ceil(total / CLIST_PAGE_SIZE);
  if (pageCount <= 1) {
    return { payloads: [firstPayload], total };
  }

  // 并发拉取剩余页
  const payloads: unknown[] = [firstPayload];
  const remainingPages = Array.from({ length: pageCount - 1 }, (_, i) => i + 2);

  // 分批并发，每批 CLIST_CONCURRENCY 个
  for (let i = 0; i < remainingPages.length; i += CLIST_CONCURRENCY) {
    const batch = remainingPages.slice(i, i + CLIST_CONCURRENCY);
    const results = await Promise.allSettled(batch.map((p) => fetchClistPage(p)));
    for (const result of results) {
      if (result.status === "fulfilled") {
        payloads.push(result.value);
      }
    }
  }

  return { payloads, total };
}

// ============ 模块缓存 ============

/** 开市期间缓存 TTL：15 分钟（新股上市后最多 15 分钟出现） */
const DISCOVERY_CACHE_MS_TRADING = 15 * 60 * 1000;
/** 休市期间缓存 TTL：1 小时（休市时不会上新股，不需要频繁刷新） */
const DISCOVERY_CACHE_MS_CLOSED = 60 * 60 * 1000;

/** 根据当前是否为交易时段，返回对应的缓存 TTL */
function getDiscoveryCacheMs(): number {
  return isTradingHours() ? DISCOVERY_CACHE_MS_TRADING : DISCOVERY_CACHE_MS_CLOSED;
}

let discoveryCache: StockSnapshot[] | null = null;
let discoveryCacheTimestamp = 0;
let discoveryPromise: Promise<StockSnapshot[]> | null = null;

/** 上次发现的总股票数（用于总数预检，避免无新股时全量拉取） */
let lastDiscoveryTotal = 0;

/** 测试用：重置缓存 */
export function __resetDiscoveryCacheForTest(): void {
  discoveryCache = null;
  discoveryCacheTimestamp = 0;
  discoveryPromise = null;
  lastDiscoveryTotal = 0;
}

// ============ 主函数：动态发现股票 ============

/**
 * 动态发现全 A 股列表
 *
 * 流程：
 * 1. 检查缓存（开市 15 分钟 / 休市 1 小时）
 * 2. 先拉第一页获取总数 — 如果总数没变，跳过全量拉取，直接延长缓存
 * 3. 总数变了 → 全量拉取所有分页
 * 4. 解析 + 行业分类
 * 5. 与静态基线合并
 * 6. 缓存并返回
 *
 * 失败时回退到静态基线（不抛异常）
 */
export async function discoverStocks(): Promise<StockSnapshot[]> {
  const now = Date.now();

  // 缓存命中（TTL 按交易时段动态调整）
  if (discoveryCache && now - discoveryCacheTimestamp < getDiscoveryCacheMs()) {
    return discoveryCache;
  }

  // Promise 去重：避免并发重复请求
  if (discoveryPromise) {
    return discoveryPromise;
  }

  discoveryPromise = (async () => {
    try {
      // --- 总数预检：先拉第一页，检查 total 是否变化 ---
      const firstPayload = (await fetchClistPage(1)) as {
        data?: { total?: number };
      };
      const total = firstPayload.data?.total ?? 0;
      if (total <= 0) {
        throw new Error(`clist total is invalid: ${total}`);
      }

      // 总数没变 且 已有缓存 → 跳过全量拉取，延长缓存时间
      if (lastDiscoveryTotal === total && discoveryCache) {
        discoveryCacheTimestamp = Date.now();
        return discoveryCache;
      }

      // 总数变了（或首次运行）→ 全量拉取所有分页
      const pageCount = Math.ceil(total / CLIST_PAGE_SIZE);
      const payloads: unknown[] = [firstPayload];

      if (pageCount > 1) {
        const remainingPages = Array.from({ length: pageCount - 1 }, (_, i) => i + 2);

        // 分批并发，每批 CLIST_CONCURRENCY 个
        for (let i = 0; i < remainingPages.length; i += CLIST_CONCURRENCY) {
          const batch = remainingPages.slice(i, i + CLIST_CONCURRENCY);
          const results = await Promise.allSettled(batch.map((p) => fetchClistPage(p)));
          for (const result of results) {
            if (result.status === "fulfilled") {
              payloads.push(result.value);
            }
          }
        }
      }

      const discovered = parseClistStocks(payloads);

      // 完整性校验：拉到的数量 >= API 声称的总数的 80%
      if (discovered.length < total * 0.8) {
        throw new Error(
          `Discovered stock count ${discovered.length} is too low (API total: ${total})`
        );
      }

      const merged = mergeDiscoveredWithBaseline(discovered, baselineStocks);
      discoveryCache = merged;
      discoveryCacheTimestamp = Date.now();
      lastDiscoveryTotal = total;
      return merged;
    } catch (error) {
      console.warn("Stock discovery failed, falling back to baseline:", error);
      // 回退到静态基线
      if (!discoveryCache) {
        discoveryCache = baselineStocks;
        discoveryCacheTimestamp = Date.now();
      }
      return discoveryCache;
    } finally {
      discoveryPromise = null;
    }
  })();

  return discoveryPromise;
}
