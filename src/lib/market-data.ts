/**
 * 数据获取层 + 三级容灾 + 模块缓存
 *
 * 三级容灾架构：
 *   东方财富(主) → 新浪财经(降级) → 内置 JSON 快照(兜底)
 *
 * 改进点（相比原项目）：
 * 1. 东方财富每批 300 只（原 180），批次数从 31 降到 19
 * 2. 每批 fetch 加 AbortSignal.timeout(5000)，超时快速降级
 * 3. 新浪编码用 TextDecoder('latin1') 替代 Buffer（Web 标准 API，兼容 Edge Runtime）
 * 4. HS300/A500 从预置 JSON 读取真实成分股（原项目用市值排序近似值）
 */
import fallbackMarketSnapshot from "@/lib/data/stocks-fallback.json";
import indexConstituents from "@/lib/data/index-constituents.json";
import { CST_OFFSET_MS } from "@/lib/trading-hours";
import {
  discoverStocks,
  baselineStocks,
  type StockSnapshot,
} from "@/lib/stock-discovery";
import {
  type HeatmapBoardNode,
  type HeatmapPeriodKey,
  type HeatmapStockNode,
  type MarketDataSource,
  type MarketKey,
  type MarketOverviewItem,
  type MarketOverviewResponse,
  type QuotesResponse,
  type QuoteValue,
  type TreemapResponse,
  isHeatmapPeriodKey,
  isMarketKey,
  marketKeys,
  heatmapPeriodKeys,
} from "@/types/heatmap";

// 复用 types 中的类型守卫
export { isMarketKey, isHeatmapPeriodKey, marketKeys, heatmapPeriodKeys };

// ============ 内部类型 ============

/** 远程拉取到的单只股票行情 */
type RemoteQuoteValue = {
  price: number;
  changes: Partial<Record<HeatmapPeriodKey, number>>;
  turnoverAmount: number;
};

/** 一批行情快照 */
type QuoteSnapshot = {
  timestamp: number;
  updatedAt: string;
  quotes: Record<string, RemoteQuoteValue>;
  source: "direct";
};

/** 同花顺涨跌家数接口返回 */
type UpDownDistributionResponse = {
  data?: {
    last_update_time?: string;
    up?: number | string;
    flat?: number | string;
    down?: number | string;
  };
};

/** 同花顺成交额接口返回 */
type TurnoverResponse = {
  data?: {
    charts?: {
      header?: Array<{ key?: string; val?: number | string }>;
    };
  };
};

/** 市场概览快照 */
type MarketSummarySnapshot = {
  timestamp: number;
  updatedAt: string;
  advanceCount: number;
  flatCount: number;
  declineCount: number;
  turnoverAmount: number;
  turnoverPreviousAmount: number;
  turnoverDelta: number;
  source: "direct";
};

/** 指数行情值 */
type MarketIndexValue = {
  name: string;
  price: number;
  changes: Partial<Record<HeatmapPeriodKey, number>>;
};

/** 指数快照 */
type MarketIndexSnapshot = {
  timestamp: number;
  updatedAt: string;
  summaries: Partial<Record<MarketKey, MarketIndexValue>>;
  source: "direct";
};

// ============ 常量配置 ============

const sinaQuoteBaseUrl = "https://hq.sinajs.cn/list=";
const eastmoneyQuoteBaseUrl = "https://push2.eastmoney.com/api/qt/ulist.np/get";
const upDownDistributionUrl =
  "https://dq.10jqka.com.cn/fuyao/up_down_distribution/distribution/v2/realtime";
const turnoverSummaryUrl =
  "https://dq.10jqka.com.cn/fuyao/market_analysis_api/chart/v1/get_chart_data?chart_key=turnover_minute";

/** 各市场范围对应的指数代码（用于新浪接口） */
const marketIndexSymbols: Record<MarketKey, string> = {
  all: "sz399317",
  sse: "sh000001",
  szse: "sz399107",
  hs300: "sh000300",
  zza500: "sh000510",
  cyb: "sz399006",
  kcb: "sh000680",
};

/** 各市场范围对应的东方财富 secid */
const marketIndexSecids: Record<MarketKey, string> = {
  all: "0.399317",
  sse: "1.000001",
  szse: "0.399107",
  hs300: "1.000300",
  zza500: "1.000510",
  cyb: "0.399006",
  kcb: "1.000680",
};

const sinaRequestHeaders = {
  Referer: "https://finance.sina.com.cn/",
  "User-Agent": "Mozilla/5.0 (compatible; StockMatrix/1.0)",
  Accept: "*/*",
};

const eastmoneyRequestHeaders = {
  Referer: "https://quote.eastmoney.com/",
  "User-Agent": "Mozilla/5.0 (compatible; StockMatrix/1.0)",
  Accept: "application/json, text/plain, */*",
};

const summaryRequestHeaders = {
  Referer: "https://q.10jqka.com.cn/",
  "User-Agent": "Mozilla/5.0 (compatible; StockMatrix/1.0)",
  Accept: "application/json, text/plain, */*",
};

/** 模块缓存 TTL：8 秒 */
const quoteCacheMs = 8_000;
const summaryCacheMs = 8_000;
/** 新浪每批最多 220 只 */
const sinaBatchSize = 220;
/** 东方财富每批最多 300 只（改进：原项目 180） */
const eastmoneyBatchSize = 300;
/** 平盘阈值：涨跌幅绝对值 < 0.1% 视为平盘 */
const flatThreshold = 0.1;
/** 每批请求超时时间：5 秒（改进：原项目无超时保护） */
const fetchTimeoutMs = 5_000;

/** 东方财富请求需要的字段列表 */
const eastmoneyQuoteFields = [
  "f2", // 最新价
  "f3", // 当日涨跌幅
  "f6", // 成交额
  "f12", // 代码
  "f13", // 市场标识
  "f14", // 名称
  "f18", // 昨收
  "f24", // 60日涨跌幅（month 的兜底）
  "f25", // 年初至今涨跌幅
  "f109", // 近5日涨跌幅
  "f110", // 近20日涨跌幅
  "f124", // 行情时间戳
  "f127", // 近3日涨跌幅
  "f160", // 近10日涨跌幅
] as const;

// ============ 加载 JSON 快照数据 ============

const fallbackSnapshotSeed = fallbackMarketSnapshot as {
  updatedAt: string;
  stockCount: number;
  boardCount: number;
};

const constituentsSeed = indexConstituents as {
  updatedAt: string;
  hs300: string[];
  zza500: string[];
};

/** HS300 真实成分股集合（改进：从预置 JSON 读取，而非市值排序近似值） */
const hs300Set = new Set(constituentsSeed.hs300);
/** A500 真实成分股集合 */
const zza500Set = new Set(constituentsSeed.zza500);

// ============ 模块级缓存 ============

let quoteCache: QuoteSnapshot | null = null;
let quotePromise: Promise<QuoteSnapshot> | null = null;
let summaryCache: MarketSummarySnapshot | null = null;
let summaryPromise: Promise<MarketSummarySnapshot> | null = null;
let indexCache: MarketIndexSnapshot | null = null;
let indexPromise: Promise<MarketIndexSnapshot> | null = null;
let hasLoggedFallbackWarning = false;

/** 收盘数据锁定标记：一旦检测到已收盘且获取到有效数据，就锁定不再刷新 */
let isMarketClosedAndLocked = false;
let lockDateString = ""; // 记录锁定时的日期，用于次日自动解锁

/** 标记收盘锁定状态（在多处调用，逻辑完全一致） */
function applyMarketCloseLock(): void {
  isMarketClosedAndLocked = true;
  const cst = new Date(Date.now() + CST_OFFSET_MS);
  lockDateString = `${cst.getUTCFullYear()}-${cst.getUTCMonth() + 1}-${cst.getUTCDate()}`;
}

/** 判断当前是否已收盘（15:00 之后）且应该锁定数据 */
function shouldLockAfterMarketClose(): boolean {
  const now = new Date();
  const cst = new Date(now.getTime() + CST_OFFSET_MS);
  const dayOfWeek = cst.getUTCDay();
  // 周六=6, 周日=0，周末也锁定
  if (dayOfWeek === 0 || dayOfWeek === 6) return true;

  const timeMinutes = cst.getUTCHours() * 60 + cst.getUTCMinutes();
  // 下午收盘 15:00 = 900 分钟（15*60），之后锁定数据
  return timeMinutes >= 900;
}

/** 检查是否需要解锁（次日开盘前自动解锁） */
function checkAndResetLockIfNewDay(): void {
  const now = new Date();
  const cst = new Date(now.getTime() + CST_OFFSET_MS);
  const currentDateString = `${cst.getUTCFullYear()}-${cst.getUTCMonth() + 1}-${cst.getUTCDate()}`;

  // 如果日期变了，重置锁定状态
  if (isMarketClosedAndLocked && lockDateString && lockDateString !== currentDateString) {
    isMarketClosedAndLocked = false;
    lockDateString = "";
    // 清除缓存，确保第二天获取最新数据
    quoteCache = null;
    summaryCache = null;
    indexCache = null;
  }
}

// ============ 工具函数 ============

/** 把值转成数字，无法转换返回 0 */
function safeNumber(value: number | string | undefined): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

/** 把值转成数字，无法转换返回 null */
function parseFiniteValue(value: number | string | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * 从 changes 对象中取出指定周期的涨跌幅。
 * - 当日周期（day）：取不到时退回 fallback 值（stock.changePct）
 * - 其他周期（week/month/year）：取不到时返回 NaN，不拿当日涨跌幅冒充
 *   前端通过 isNaN() 判断后显示灰色，不会展示错误数据
 */
function extractPeriodChange(
  changes: Partial<Record<HeatmapPeriodKey, number>> | undefined,
  period: HeatmapPeriodKey,
  fallback = 0
): number {
  const selected = changes?.[period];
  if (typeof selected === "number" && Number.isFinite(selected)) return selected;

  // 只有当日周期才允许退回 fallback 值
  if (period === "day") return fallback;

  // 其他周期没有数据就返回 NaN，不冒充
  return Number.NaN;
}

/** 把 "600519.SH" 格式转换成东方财富的 "1.600519" 格式 */
function buildEastmoneySecid(code: string): string {
  const [symbol, exchange] = code.split(".");
  return `${exchange === "SH" ? 1 : 0}.${symbol}`;
}

/** 把东方财富返回的 f12+f13 转成 "600519.SH" 格式 */
function decodeEastmoneySymbol(symbol: number | string | undefined, marketFlag: number | string | undefined): string | null {
  const normalizedSymbol = String(symbol ?? "").trim();
  if (!normalizedSymbol) return null;
  const market = Number(marketFlag) === 1 ? "SH" : /^[489]/.test(normalizedSymbol) ? "BJ" : "SZ";
  return `${normalizedSymbol}.${market}`;
}

/** 把东方财富的秒级时间戳转成 ISO 字符串 */
function formatEastmoneyTime(value: number | string | undefined): string {
  const seconds = parseFiniteValue(value);
  if (!seconds || seconds <= 0) return "";
  return new Date(seconds * 1000).toISOString();
}

/** 解析同花顺的时间字符串，返回北京时间 ISO 格式 */
function formatShanghaiTime(value: string | undefined): string {
  const trimmed = value?.trim();
  // 同花顺的时间字符串本身就是北京时间，fallback 时用 UTC+8
  if (!trimmed) return new Date(Date.now() + CST_OFFSET_MS).toISOString().replace("Z", "+08:00");
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    return `${trimmed.replace(" ", "T")}+08:00`;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return new Date(Date.now() + CST_OFFSET_MS).toISOString().replace("Z", "+08:00");
  // parsed.toISOString() 返回 UTC 时间（前端会用 timeZone: 'Asia/Shanghai' 显示，所以没问题）
  return parsed.toISOString();
}

/** 解析新浪的日期+时间（北京时间），返回北京时间 ISO 格式 */
function formatSinaTime(dateText: string | undefined, timeText: string | undefined): string {
  const normalizedDate = String(dateText ?? "").trim();
  const normalizedTime = String(timeText ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate) || !/^\d{2}:\d{2}:\d{2}$/.test(normalizedTime)) {
    // 新浪返回的日期时间就是北京时间，fallback 时用当前 UTC 时间戳 +8 小时
    return new Date(Date.now() + CST_OFFSET_MS).toISOString().replace("Z", "+08:00");
  }
  // 新浪的日期+时间字段本身就是北京时间，直接拼接 +08:00
  return `${normalizedDate}T${normalizedTime}+08:00`;
}

/** 确保值是正数，否则返回 1（避免树图算法除零） */
function normalizeAreaValue(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/**
 * 获取股票的实时面积权重值
 *
 * 用实时价格重新计算流通市值，使色块大小随行情变化：
 *   floatShares = floatMarketCap / snapshotPrice（流通股本，日内不变）
 *   liveFloatMarketCap = floatShares × livePrice
 *
 * 如果没有实时价格或快照价格无效，退回到静态流通市值。
 */
function getLiveStockAreaValue(
  stock: StockSnapshot,
  quote: RemoteQuoteValue | undefined
): number {
  const baseCap = stock.floatMarketCap || stock.totalMarketCap || stock.price * 1_000_000;
  const livePrice = quote?.price;
  if (livePrice && livePrice > 0 && stock.price > 0) {
    const floatShares = baseCap / stock.price;
    return normalizeAreaValue(floatShares * livePrice);
  }
  return normalizeAreaValue(baseCap);
}

/** 获取股票的成交额 */
function getStockTurnover(stock: StockSnapshot): number {
  return Number.isFinite(stock.turnoverAmount) && (stock.turnoverAmount ?? 0) > 0 ? stock.turnoverAmount ?? 0 : 0;
}

/** 兜底估算成交额（JSON 快照没有实时成交额时用） */
function estimateFallbackTurnover(stock: StockSnapshot): number {
  const cap = stock.floatMarketCap || stock.totalMarketCap || stock.price * 1_000_000;
  const activityRatio = 0.012 + Math.min(Math.abs(stock.changePct), 10) * 0.002;
  return Math.round(cap * activityRatio);
}

/** 判断一只股票是否属于指定市场范围 */
function isInMarketScope(stock: StockSnapshot, market: MarketKey): boolean {
  if (market === "all") return true;
  if (market === "sse") return stock.exchange === "SH";
  if (market === "szse") return stock.exchange === "SZ";
  if (market === "cyb") return stock.exchange === "SZ" && stock.code.startsWith("300");
  if (market === "kcb") return stock.exchange === "SH" && stock.code.startsWith("688");
  if (market === "hs300") return hs300Set.has(stock.code);
  return zza500Set.has(stock.code);
}

/** 按市场范围筛选股票 */
function filterByMarketScope(stocks: StockSnapshot[], market: MarketKey): StockSnapshot[] {
  return stocks.filter((stock) => isInMarketScope(stock, market));
}

/** 把板块名转成哈希 code（用于前端 key） */
function boardNameToCode(name: string): string {
  return name
    .split("")
    .reduce((hash, ch) => (hash * 33 + ch.charCodeAt(0)) >>> 0, 5381)
    .toString(16)
    .padStart(8, "0");
}

/** 把 "600519.SH" 转成新浪格式 "sh600519" */
function codeToSinaSymbol(code: string): string {
  const [symbol, exchange] = code.split(".");
  return `${exchange.toLowerCase()}${symbol}`;
}

/** 把新浪格式 "sh600519" 转成 "600519.SH" */
function decodeSinaSymbol(symbol: string): string | null {
  if (symbol.startsWith("sh")) return `${symbol.slice(2)}.SH`;
  if (symbol.startsWith("sz")) return `${symbol.slice(2)}.SZ`;
  if (symbol.startsWith("bj")) return `${symbol.slice(2)}.BJ`;
  return null;
}

// ============ 新浪行情解析 ============

/** 解析新浪批量行情返回的文本 */
function parseSinaQuotes(rawText: string) {
  const quotes: Record<string, RemoteQuoteValue> = {};
  let updatedAt = "";
  const pattern = /var hq_str_([a-z]{2}\d+)="([^"]*)";/g;

  for (const match of rawText.matchAll(pattern)) {
    const code = decodeSinaSymbol(match[1]);
    if (!code) continue;

    const fields = match[2].split(",");
    if (fields.length < 32) continue;

    const price = safeNumber(fields[3]);
    const previousClose = safeNumber(fields[2]);
    const turnoverAmount = safeNumber(fields[9]);

    if (price <= 0 || previousClose <= 0) continue;

    const changePct = ((price - previousClose) / previousClose) * 100;
    quotes[code] = {
      price,
      changes: { day: changePct },
      turnoverAmount,
    };

    if (!updatedAt) {
      updatedAt = formatSinaTime(fields[30], fields[31]);
    }
  }

  return {
    updatedAt: updatedAt || new Date().toISOString(),
    quotes,
  };
}

// ============ 东方财富行情解析 ============

/** 解析东方财富批量行情返回的 JSON */
function parseEastmoneyQuotes(payload: unknown) {
  const quotes: Record<string, RemoteQuoteValue> = {};
  let updatedAt = "";
  const diff = (payload as { data?: { diff?: unknown[] } }).data?.diff;

  if (!Array.isArray(diff)) {
    return { updatedAt: new Date().toISOString(), quotes };
  }

  for (const item of diff) {
    const row = item as Record<string, number | string | undefined>;
    const code = decodeEastmoneySymbol(row.f12, row.f13);
    if (!code) continue;

    const price = parseFiniteValue(row.f2) ?? 0;
    const previousClose = parseFiniteValue(row.f18) ?? 0;
    if (price <= 0) continue;

    const dayChangePct =
      parseFiniteValue(row.f3) ?? (previousClose > 0 ? ((price - previousClose) / previousClose) * 100 : 0);
    // 只在数据真实存在时才写入对应周期，不拿当日涨跌幅冒充
    const weekChangePct = parseFiniteValue(row.f109);
    const monthChangePct = parseFiniteValue(row.f110) ?? parseFiniteValue(row.f24);
    const yearChangePct = parseFiniteValue(row.f25);
    const turnoverAmount = parseFiniteValue(row.f6) ?? 0;

    const changes: Partial<Record<HeatmapPeriodKey, number>> = { day: dayChangePct };
    if (weekChangePct !== null) changes.week = weekChangePct;
    if (monthChangePct !== null) changes.month = monthChangePct;
    if (yearChangePct !== null) changes.year = yearChangePct;

    quotes[code] = {
      price,
      changes,
      turnoverAmount,
    };

    const timestamp = formatEastmoneyTime(row.f124);
    if (timestamp && (!updatedAt || timestamp > updatedAt)) {
      updatedAt = timestamp;
    }
  }

  return {
    updatedAt: updatedAt || new Date().toISOString(),
    quotes,
  };
}

// ============ 网络请求函数 ============

/** 从新浪拉取一批股票行情 */
async function fetchSinaQuotes(symbols: string[]): Promise<{ updatedAt: string; quotes: Record<string, RemoteQuoteValue> }> {
  const response = await fetch(`${sinaQuoteBaseUrl}${symbols.join(",")}`, {
    headers: sinaRequestHeaders,
    next: { revalidate: 0 },
    cache: "no-store",
    signal: AbortSignal.timeout(fetchTimeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Sina quote request failed: ${response.status}`);
  }

  // 改进：用 TextDecoder 替代 Buffer，兼容 Edge Runtime
  const rawText = new TextDecoder("latin1").decode(await response.arrayBuffer());
  return parseSinaQuotes(rawText);
}

/** 从东方财富拉取一批股票行情 */
async function fetchEastmoneyQuotes(secids: string[]): Promise<{ updatedAt: string; quotes: Record<string, RemoteQuoteValue> }> {
  const params = new URLSearchParams({
    secids: secids.join(","),
    ut: "bd1d9ddb04089700cf9c27f6f7426281",
    fltt: "2",
    invt: "2",
    fields: eastmoneyQuoteFields.join(","),
  });
  const response = await fetch(`${eastmoneyQuoteBaseUrl}?${params.toString()}`, {
    headers: eastmoneyRequestHeaders,
    next: { revalidate: 0 },
    cache: "no-store",
    signal: AbortSignal.timeout(fetchTimeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Eastmoney quote request failed: ${response.status}`);
  }

  return parseEastmoneyQuotes(await response.json());
}

// ============ 指数行情 ============

/** 解析新浪指数行情 */
function parseSinaIndexData(rawText: string) {
  const symbolToMarket = new Map(
    Object.entries(marketIndexSymbols).map(([market, symbol]) => [symbol, market as MarketKey])
  );
  const summaries: Partial<Record<MarketKey, MarketIndexValue>> = {};
  const pattern = /var hq_str_s_([a-z]{2}\d+)="([^"]*)";/g;

  for (const match of rawText.matchAll(pattern)) {
    const market = symbolToMarket.get(match[1]);
    if (!market) continue;

    const fields = match[2].split(",");
    if (fields.length < 4) continue;

    const name = fields[0]?.trim();
    const price = safeNumber(fields[1]);
    const changePct = safeNumber(fields[3]);

    if (!name || price <= 0 || !Number.isFinite(changePct)) continue;

    summaries[market] = {
      name,
      price,
      changes: { day: changePct },
    };
  }

  return summaries;
}

/** 解析东方财富指数行情，返回 summaries 和最新时间戳 */
function parseEastmoneyIndexData(payload: unknown): {
  summaries: Partial<Record<MarketKey, MarketIndexValue>>;
  latestTimestamp: string;
} {
  const secidToMarket = new Map(
    Object.entries(marketIndexSecids).map(([market, secid]) => [secid, market as MarketKey])
  );
  const summaries: Partial<Record<MarketKey, MarketIndexValue>> = {};
  const diff = (payload as { data?: { diff?: unknown[] } }).data?.diff;

  if (!Array.isArray(diff)) return { summaries, latestTimestamp: "" };

  let latestTimestamp = "";

  for (const item of diff) {
    const row = item as Record<string, number | string | undefined>;
    const symbol = String(row.f12 ?? "").trim();
    const marketFlag = Number(row.f13);
    const market = secidToMarket.get(`${marketFlag}.${symbol}`);
    if (!market) continue;

    const name = String(row.f14 ?? "").trim();
    const price = parseFiniteValue(row.f2) ?? 0;
    const dayChangePct = parseFiniteValue(row.f3);

    if (!name || price <= 0 || dayChangePct === null) continue;

    // 只在数据真实存在时才写入对应周期，不拿当日涨跌幅冒充
    const weekChangePct = parseFiniteValue(row.f109);
    const monthChangePct = parseFiniteValue(row.f110) ?? parseFiniteValue(row.f24);
    const yearChangePct = parseFiniteValue(row.f25);

    const changes: Partial<Record<HeatmapPeriodKey, number>> = { day: dayChangePct };
    if (weekChangePct !== null) changes.week = weekChangePct;
    if (monthChangePct !== null) changes.month = monthChangePct;
    if (yearChangePct !== null) changes.year = yearChangePct;

    summaries[market] = {
      name,
      price,
      changes,
    };

    // 提取真实时间戳 f124
    const timestamp = formatEastmoneyTime(row.f124);
    if (timestamp && (!latestTimestamp || timestamp > latestTimestamp)) {
      latestTimestamp = timestamp;
    }
  }

  return { summaries, latestTimestamp };
}

/** 从东方财富拉取指数快照 */
async function fetchEastmoneyMarketIndex(): Promise<MarketIndexSnapshot> {
  const params = new URLSearchParams({
    secids: Object.values(marketIndexSecids).join(","),
    ut: "bd1d9ddb04089700cf9c27f6f7426281",
    fltt: "2",
    invt: "2",
    fields: eastmoneyQuoteFields.join(","),
  });
  const response = await fetch(`${eastmoneyQuoteBaseUrl}?${params.toString()}`, {
    headers: eastmoneyRequestHeaders,
    next: { revalidate: 0 },
    cache: "no-store",
    signal: AbortSignal.timeout(fetchTimeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Eastmoney index request failed: ${response.status}`);
  }

  const { summaries, latestTimestamp: indexTimestamp } = parseEastmoneyIndexData(await response.json());

  if (Object.keys(summaries).length < marketKeys.length * 0.75) {
    throw new Error("Eastmoney index snapshot is incomplete");
  }

  // 使用真实数据时间戳 f124，而不是 Date.now()
  const updatedAt = indexTimestamp || new Date().toISOString();

  return {
    timestamp: Date.now(),
    updatedAt,
    summaries,
    source: "direct",
  };
}

/** 从新浪拉取指数快照 */
async function fetchSinaMarketIndex(): Promise<MarketIndexSnapshot> {
  const symbols = Object.values(marketIndexSymbols).map((symbol) => `s_${symbol}`);
  const response = await fetch(`${sinaQuoteBaseUrl}${symbols.join(",")}`, {
    headers: sinaRequestHeaders,
    next: { revalidate: 0 },
    cache: "no-store",
    signal: AbortSignal.timeout(fetchTimeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Sina index request failed: ${response.status}`);
  }

  const rawText = new TextDecoder("latin1").decode(await response.arrayBuffer());
  const summaries = parseSinaIndexData(rawText);

  if (Object.keys(summaries).length < marketKeys.length * 0.75) {
    throw new Error("Sina index snapshot is incomplete");
  }

  return {
    timestamp: Date.now(),
    // 用 Date.now()（UTC 毫秒戳）直接加 8 小时得到北京时间，不依赖服务端时区设置
    updatedAt: new Date(Date.now() + CST_OFFSET_MS).toISOString().replace("Z", "+08:00"),
    summaries,
    source: "direct",
  };
}

/** 指数快照：东方财富 → 新浪 */
async function fetchMarketIndex(): Promise<MarketIndexSnapshot> {
  try {
    return await fetchEastmoneyMarketIndex();
  } catch {
    return fetchSinaMarketIndex();
  }
}

// ============ 行情快照（所有个股） ============

/** 从远程拉取全市场行情快照（东方财富 → 新浪 → 抛异常触发兜底） */
async function fetchQuotesFromRemote(stocks: StockSnapshot[]): Promise<QuoteSnapshot> {
  const secids = stocks.map((stock) => buildEastmoneySecid(stock.code));
  const eastmoneyBatches: string[][] = [];

  // 改进：每批 300 只（原项目 180 只）
  for (let index = 0; index < secids.length; index += eastmoneyBatchSize) {
    eastmoneyBatches.push(secids.slice(index, index + eastmoneyBatchSize));
  }

  try {
    const eastmoneyResults = await Promise.all(
      eastmoneyBatches.map((batch) => fetchEastmoneyQuotes(batch))
    );
    const eastmoneyQuotes: Record<string, RemoteQuoteValue> = {};
    let eastmoneyUpdatedAt = "";

    for (const result of eastmoneyResults) {
      Object.assign(eastmoneyQuotes, result.quotes);
      if (result.updatedAt && (!eastmoneyUpdatedAt || result.updatedAt > eastmoneyUpdatedAt)) {
        eastmoneyUpdatedAt = result.updatedAt;
      }
    }

    // 完整性校验：返回数量 < 基线 90% 时降级
    if (Object.keys(eastmoneyQuotes).length < stocks.length * 0.9) {
      throw new Error("Eastmoney quote snapshot is incomplete");
    }

    return {
      timestamp: Date.now(),
      updatedAt: eastmoneyUpdatedAt || new Date().toISOString(),
      quotes: eastmoneyQuotes,
      source: "direct",
    };
  } catch {
    // 东方财富失败，降级到新浪
  }

  // 新浪降级：仅当日涨跌幅
  const symbols = stocks.map((stock) => codeToSinaSymbol(stock.code));
  const batches: string[][] = [];

  for (let index = 0; index < symbols.length; index += sinaBatchSize) {
    batches.push(symbols.slice(index, index + sinaBatchSize));
  }

  const results = await Promise.all(batches.map((batch) => fetchSinaQuotes(batch)));
  const quotes: Record<string, RemoteQuoteValue> = {};
  let updatedAt = "";

  for (const result of results) {
    Object.assign(quotes, result.quotes);
    if (result.updatedAt && (!updatedAt || result.updatedAt > updatedAt)) {
      updatedAt = result.updatedAt;
    }
  }

  if (Object.keys(quotes).length < stocks.length * 0.9) {
    throw new Error("Sina quote snapshot is incomplete");
  }

  return {
    timestamp: Date.now(),
    updatedAt: updatedAt || new Date().toISOString(),
    quotes,
    source: "direct",
  };
}

// ============ 市场概览（涨跌家数 + 成交额） ============

/** 从同花顺拉取涨跌家数和成交额 */
async function fetchSummaryFromRemote(): Promise<MarketSummarySnapshot> {
  const [distributionResponse, turnoverResponse] = await Promise.all([
    fetch(upDownDistributionUrl, {
      headers: summaryRequestHeaders,
      next: { revalidate: 0 },
      cache: "no-store",
      signal: AbortSignal.timeout(fetchTimeoutMs),
    }),
    fetch(turnoverSummaryUrl, {
      headers: summaryRequestHeaders,
      next: { revalidate: 0 },
      cache: "no-store",
      signal: AbortSignal.timeout(fetchTimeoutMs),
    }),
  ]);

  if (!distributionResponse.ok) {
    throw new Error(`Up/down summary request failed: ${distributionResponse.status}`);
  }
  if (!turnoverResponse.ok) {
    throw new Error(`Turnover summary request failed: ${turnoverResponse.status}`);
  }

  const distribution = (await distributionResponse.json()) as UpDownDistributionResponse;
  const turnover = (await turnoverResponse.json()) as TurnoverResponse;
  const turnoverAmount = safeNumber(
    turnover.data?.charts?.header?.find((item) => item.key === "turnover")?.val
  );
  const turnoverPreviousAmount = safeNumber(
    turnover.data?.charts?.header?.find((item) => item.key === "turnover_pre")?.val
  );
  const turnoverDelta = safeNumber(
    turnover.data?.charts?.header?.find((item) => item.key === "turnover_change")?.val
  );

  return {
    timestamp: Date.now(),
    updatedAt: formatShanghaiTime(distribution.data?.last_update_time),
    advanceCount: safeNumber(distribution.data?.up),
    flatCount: safeNumber(distribution.data?.flat),
    declineCount: safeNumber(distribution.data?.down),
    turnoverAmount,
    turnoverPreviousAmount,
    turnoverDelta,
    source: "direct",
  };
}

// ============ 模块级缓存 + Promise 去重 ============

async function getCachedMarketIndex() {
  const now = Date.now();

  // 先检查是否需要跨日解锁
  checkAndResetLockIfNewDay();

  // 收盘后锁定机制
  if (isMarketClosedAndLocked && indexCache) {
    return indexCache;
  }

  if (shouldLockAfterMarketClose() && indexCache && !isMarketClosedAndLocked) {
    applyMarketCloseLock();
    return indexCache;
  }

  if (indexCache && now - indexCache.timestamp < quoteCacheMs) {
    return indexCache;
  }

  if (indexPromise) {
    return indexPromise;
  }

  indexPromise = fetchMarketIndex()
    .then((snapshot) => {
      indexCache = snapshot;
      if (shouldLockAfterMarketClose() && !isMarketClosedAndLocked) {
        applyMarketCloseLock();
      }
      return snapshot;
    })
    .catch((error) => {
      if (indexCache) return indexCache;
      throw error;
    })
    .finally(() => {
      indexPromise = null;
    });

  return indexPromise;
}

async function getCachedQuotes() {
  const now = Date.now();

  // 先检查是否需要跨日解锁
  checkAndResetLockIfNewDay();

  // 收盘后锁定机制：如果已收盘且已有有效缓存，直接返回缓存数据
  if (isMarketClosedAndLocked && quoteCache) {
    return quoteCache;
  }

  // 检查是否刚进入收盘状态，需要锁定
  if (shouldLockAfterMarketClose() && quoteCache && !isMarketClosedAndLocked) {
    applyMarketCloseLock();
    return quoteCache;
  }

  if (quoteCache && now - quoteCache.timestamp < quoteCacheMs) {
    return quoteCache;
  }

  if (quotePromise) {
    return quotePromise;
  }

  quotePromise = fetchQuotesFromRemote(dynamicStocks)
    .then((snapshot) => {
      quoteCache = snapshot;
      if (shouldLockAfterMarketClose() && !isMarketClosedAndLocked) {
        applyMarketCloseLock();
      }
      return snapshot;
    })
    .catch((error) => {
      if (quoteCache) return quoteCache;
      throw error;
    })
    .finally(() => {
      quotePromise = null;
    });

  return quotePromise;
}

async function getCachedSummary() {
  const now = Date.now();

  // 先检查是否需要跨日解锁
  checkAndResetLockIfNewDay();

  // 收盘后锁定机制
  if (isMarketClosedAndLocked && summaryCache) {
    return summaryCache;
  }

  if (shouldLockAfterMarketClose() && summaryCache && !isMarketClosedAndLocked) {
    applyMarketCloseLock();
    return summaryCache;
  }

  if (summaryCache && now - summaryCache.timestamp < summaryCacheMs) {
    return summaryCache;
  }

  if (summaryPromise) {
    return summaryPromise;
  }

  summaryPromise = fetchSummaryFromRemote()
    .then((snapshot) => {
      summaryCache = snapshot;
      if (shouldLockAfterMarketClose() && !isMarketClosedAndLocked) {
        applyMarketCloseLock();
      }
      return snapshot;
    })
    .catch((error) => {
      if (summaryCache) return summaryCache;
      throw error;
    })
    .finally(() => {
      summaryPromise = null;
    });

  return summaryPromise;
}

// ============ 数据构建函数 ============

/** 把股票列表按一级行业分组，构建热力图节点树 */
function groupStocksByBoard(
  stocks: StockSnapshot[],
  liveQuotes: Record<string, RemoteQuoteValue>,
  period: HeatmapPeriodKey
): HeatmapBoardNode[] {
  const boardMap = new Map<string, HeatmapStockNode[]>();

  for (const stock of stocks) {
    const current = boardMap.get(stock.boardName) ?? [];
    const quote = liveQuotes[stock.code];

    current.push({
      code: stock.code,
      name: stock.name,
      boardName: stock.boardName,
      subBoardName: stock.subBoardName,
      value: getLiveStockAreaValue(stock, quote),
      exchange: stock.exchange,
      price: quote?.price ?? stock.price,
      changePct: extractPeriodChange(quote?.changes, period, stock.changePct),
      turnoverAmount: quote?.turnoverAmount ?? getStockTurnover(stock),
    });

    boardMap.set(stock.boardName, current);
  }

  return Array.from(boardMap.entries())
    .map(([name, children]) => {
      children.sort((left, right) => right.value - left.value);
      const total = children.reduce((sum, stock) => sum + stock.value, 0);

      return {
        code: boardNameToCode(name),
        name,
        value: total,
        stockCount: children.length,
        children,
      };
    })
    .sort((left, right) => right.value - left.value);
}

/** 统计涨/平/跌家数和成交额 */
function summarizeMarketBreadth(
  stocks: StockSnapshot[],
  liveQuotes: Record<string, RemoteQuoteValue>,
  period: HeatmapPeriodKey
) {
  let advanceCount = 0;
  let flatCount = 0;
  let declineCount = 0;
  let turnoverAmount = 0;

  for (const stock of stocks) {
    const quote = liveQuotes[stock.code];
    const changePct = extractPeriodChange(quote?.changes, period, stock.changePct);

    // NaN 表示无数据，计入平盘（不误导用户）
    if (Number.isNaN(changePct)) {
      flatCount += 1;
    } else if (changePct > flatThreshold) {
      advanceCount += 1;
    } else if (changePct < -flatThreshold) {
      declineCount += 1;
    } else {
      flatCount += 1;
    }

    turnoverAmount += quote?.turnoverAmount ?? getStockTurnover(stock);
  }

  return {
    advanceCount,
    flatCount,
    declineCount,
    turnoverAmount,
    turnoverPreviousAmount: Number.NaN,
    turnoverDelta: Number.NaN,
  };
}

/** 加权平均涨跌幅（按市值权重，跳过无数据的股票） */
function computeWeightedChange(
  stocks: StockSnapshot[],
  liveQuotes: Record<string, RemoteQuoteValue>,
  period: HeatmapPeriodKey
): number {
  let weightedSum = 0;
  let totalValue = 0;

  for (const stock of stocks) {
    const quote = liveQuotes[stock.code];
    const value = getLiveStockAreaValue(stock, quote);
    const changePct = extractPeriodChange(quote?.changes, period, stock.changePct);
    // 跳过无数据的股票，不纳入加权计算
    if (Number.isNaN(changePct)) continue;
    weightedSum += changePct * value;
    totalValue += value;
  }

  return totalValue > 0 ? weightedSum / totalValue : Number.NaN;
}

// ============ 兜底函数 ============

/** 获取兜底快照（带估算成交额） */
function loadFallbackStocks(): StockSnapshot[] {
  return baselineStocks.map((stock) => ({
    ...stock,
    turnoverAmount: estimateFallbackTurnover(stock),
  }));
}

/** 兜底 treemap 数据 */
function buildFallbackTreemap(
  market: MarketKey,
  period: HeatmapPeriodKey,
  indexChangePct?: number
): TreemapResponse {
  const snapshot = loadFallbackStocks();
  const marketStocks = filterByMarketScope(snapshot, market);
  const nodes = groupStocksByBoard(marketStocks, {}, period);
  const fallbackIndexChangePct = computeWeightedChange(marketStocks, {}, period);

  return {
    market,
    period,
    updatedAt: fallbackSnapshotSeed.updatedAt,
    stockCount: marketStocks.length,
    boardCount: nodes.length,
    summary: {
      ...summarizeMarketBreadth(marketStocks, {}, period),
      indexChangePct: Number.isFinite(indexChangePct) ? indexChangePct : fallbackIndexChangePct,
    },
    nodes,
    source: "fallback" as MarketDataSource,
  };
}

/** 兜底 quotes 数据 */
function buildFallbackQuotes(market: MarketKey, period: HeatmapPeriodKey): QuotesResponse {
  const snapshot = loadFallbackStocks();
  const marketStocks = filterByMarketScope(snapshot, market);
  const quotes: Record<string, QuoteValue> = {};

  for (const stock of marketStocks) {
    quotes[stock.code] = {
      price: stock.price,
      changePct: extractPeriodChange(undefined, period, stock.changePct),
      turnoverAmount: getStockTurnover(stock) || estimateFallbackTurnover(stock),
    };
  }

  return {
    market,
    period,
    updatedAt: fallbackSnapshotSeed.updatedAt,
    quotes,
    source: "fallback" as MarketDataSource,
  };
}

// ============ 动态股票列表 + 按市场范围筛选 ============

/** 动态股票列表缓存（由 discoverStocks 提供，包含运行时发现的新股） */
let dynamicStocks: StockSnapshot[] = baselineStocks;

// ============ 对外接口函数 ============

/** 获取热力图树图数据 */
export async function getTreemapData(
  market: MarketKey,
  period: HeatmapPeriodKey = "day"
): Promise<TreemapResponse> {
  // 先动态发现股票列表（含新股）
  dynamicStocks = await discoverStocks();

  const [quoteResult, summaryResult, indexResult] = await Promise.allSettled([
    getCachedQuotes(),
    getCachedSummary(),
    getCachedMarketIndex(),
  ]);

  const remoteIndexSummary =
    indexResult.status === "fulfilled" ? indexResult.value.summaries[market] : null;
  const remoteIndexChangePct = extractPeriodChange(remoteIndexSummary?.changes, period, Number.NaN);

  // 行情拉取失败 → 用兜底数据
  if (quoteResult.status !== "fulfilled") {
    if (!hasLoggedFallbackWarning) {
      console.warn("Falling back to bundled market heatmap snapshot:", {
        quotes: quoteResult.reason,
      });
      hasLoggedFallbackWarning = true;
    }
    return buildFallbackTreemap(market, period, remoteIndexChangePct);
  }

  hasLoggedFallbackWarning = false;

  const marketStocks = filterByMarketScope(dynamicStocks, market);
  const nodes = groupStocksByBoard(marketStocks, quoteResult.value.quotes, period);
  const computedSummary = summarizeMarketBreadth(marketStocks, quoteResult.value.quotes, period);
  const computedIndexChangePct = computeWeightedChange(marketStocks, quoteResult.value.quotes, period);
  const remoteSummary = summaryResult.status === "fulfilled" ? summaryResult.value : null;

  return {
    market,
    period,
    updatedAt: remoteSummary?.updatedAt ?? quoteResult.value.updatedAt,
    stockCount: marketStocks.length,
    boardCount: nodes.length,
    summary: {
      advanceCount:
        market === "all" && period === "day" && remoteSummary
          ? remoteSummary.advanceCount
          : computedSummary.advanceCount,
      flatCount:
        market === "all" && period === "day" && remoteSummary
          ? remoteSummary.flatCount
          : computedSummary.flatCount,
      declineCount:
        market === "all" && period === "day" && remoteSummary
          ? remoteSummary.declineCount
          : computedSummary.declineCount,
      turnoverAmount:
        market === "all" && remoteSummary ? remoteSummary.turnoverAmount : computedSummary.turnoverAmount,
      turnoverPreviousAmount:
        market === "all" && remoteSummary
          ? remoteSummary.turnoverPreviousAmount
          : computedSummary.turnoverPreviousAmount,
      turnoverDelta:
        market === "all" && remoteSummary ? remoteSummary.turnoverDelta : computedSummary.turnoverDelta,
      indexChangePct: Number.isFinite(remoteIndexChangePct) ? remoteIndexChangePct : computedIndexChangePct,
    },
    nodes,
    source: "direct" as MarketDataSource,
  };
}

/** 获取实时行情快照 */
export async function getQuoteData(
  market: MarketKey,
  period: HeatmapPeriodKey = "day"
): Promise<QuotesResponse> {
  // 先动态发现股票列表（含新股）
  dynamicStocks = await discoverStocks();

  const quoteResult = await Promise.allSettled([getCachedQuotes()]);

  if (quoteResult[0].status !== "fulfilled") {
    if (!hasLoggedFallbackWarning) {
      console.warn("Falling back to bundled market heatmap quotes:", {
        quotes: quoteResult[0].reason,
      });
      hasLoggedFallbackWarning = true;
    }
    return buildFallbackQuotes(market, period);
  }

  hasLoggedFallbackWarning = false;

  const marketStocks = filterByMarketScope(dynamicStocks, market);
  const quotes: Record<string, QuoteValue> = {};

  for (const stock of marketStocks) {
    const quote = quoteResult[0].value.quotes[stock.code];
    quotes[stock.code] = {
      price: quote?.price ?? stock.price,
      changePct: extractPeriodChange(quote?.changes, period, stock.changePct),
      turnoverAmount: quote?.turnoverAmount ?? getStockTurnover(stock),
    };
  }

  return {
    market,
    period,
    updatedAt: quoteResult[0].value.updatedAt,
    quotes,
    source: "direct" as MarketDataSource,
  };
}

/** 获取市场概览（各指数涨跌幅） */
export async function getOverviewData(
  period: HeatmapPeriodKey = "day"
): Promise<MarketOverviewResponse> {
  // 先动态发现股票列表（含新股）
  dynamicStocks = await discoverStocks();

  const [quoteResult, indexResult] = await Promise.allSettled([
    getCachedQuotes(),
    getCachedMarketIndex(),
  ]);

  if (quoteResult.status !== "fulfilled") {
    if (!hasLoggedFallbackWarning) {
      console.warn("Falling back to bundled market heatmap overview:", {
        quotes: quoteResult.reason,
      });
      hasLoggedFallbackWarning = true;
    }

    const fallbackMarkets: MarketOverviewItem[] = marketKeys.map((market) => {
      const stocks = filterByMarketScope(dynamicStocks, market);
      const changePct = computeWeightedChange(stocks, {}, period);
      return {
        market,
        changePct: Number.isFinite(changePct) ? changePct : Number.NaN,
        stockCount: stocks.length,
        updatedAt: fallbackSnapshotSeed.updatedAt,
      };
    });

    return {
      period,
      updatedAt: fallbackSnapshotSeed.updatedAt,
      markets: fallbackMarkets,
      source: "fallback" as MarketDataSource,
    };
  }

  hasLoggedFallbackWarning = false;

  const liveQuotes = quoteResult.value.quotes;
  const indexSummaries = indexResult.status === "fulfilled" ? indexResult.value.summaries : null;

  const markets: MarketOverviewItem[] = marketKeys.map((market) => {
    const stocks = filterByMarketScope(dynamicStocks, market);
    const remoteIndex = indexSummaries?.[market];
    const remoteIndexChange = extractPeriodChange(remoteIndex?.changes, period, Number.NaN);
    const changePct = Number.isFinite(remoteIndexChange)
      ? remoteIndexChange
      : computeWeightedChange(stocks, liveQuotes, period);

    return {
      market,
      changePct: Number.isFinite(changePct) ? changePct : Number.NaN,
      stockCount: stocks.length,
      updatedAt: quoteResult.value.updatedAt,
    };
  });

  return {
    period,
    updatedAt: quoteResult.value.updatedAt,
    markets,
    source: "direct" as MarketDataSource,
  };
}
