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
import subboardSnapshot from "@/lib/data/subboards.json";
import indexConstituents from "@/lib/data/index-constituents.json";
import {
  type ExchangeCode,
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

// ============ 面积指标类型（用于 API 层） ============

export const metricKeys = ["1", "2", "3", "4", "5", "6"] as const;
export type MetricKey = (typeof metricKeys)[number];

export function isMetricKey(value: string): value is MetricKey {
  return metricKeys.includes(value as MetricKey);
}

/** 从面积指标 key 推算涨跌周期 */
export function periodFromMetricKey(metric: MetricKey): HeatmapPeriodKey {
  if (metric === "3") return "week";
  if (metric === "4") return "month";
  if (metric === "5" || metric === "6") return "year";
  return "day";
}

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

/** 股票基础数据（从 JSON 快照加载） */
type StockSnapshot = {
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
  stocks: Array<Omit<StockSnapshot, "subBoardName">>;
};

const subboardSeed = subboardSnapshot as {
  updatedAt: string;
  count: number;
  subboards: Record<string, { sectorName: string; subBoardName: string }>;
};

const constituentsSeed = indexConstituents as {
  updatedAt: string;
  hs300: string[];
  zza500: string[];
};

/** 把 JSON 快照数据合并成带二级行业信息的完整股票列表 */
const baselineStocks: StockSnapshot[] = fallbackSnapshotSeed.stocks.map((stock) => {
  const mapped = subboardSeed.subboards[stock.code];
  return {
    ...stock,
    boardName: mapped?.sectorName ?? stock.boardName,
    subBoardName: mapped?.subBoardName ?? stock.boardName,
  };
});

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

/** 从 changes 对象中取出指定周期的涨跌幅，取不到就退回当日涨幅 */
function extractPeriodChange(
  changes: Partial<Record<HeatmapPeriodKey, number>> | undefined,
  period: HeatmapPeriodKey,
  fallback = 0
): number {
  const selected = changes?.[period];
  if (typeof selected === "number" && Number.isFinite(selected)) return selected;
  const day = changes?.day;
  return typeof day === "number" && Number.isFinite(day) ? day : fallback;
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

/** 解析同花顺的时间字符串 */
function formatShanghaiTime(value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return new Date().toISOString();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    return `${trimmed.replace(" ", "T")}+08:00`;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

/** 解析新浪的日期+时间 */
function formatSinaTime(dateText: string | undefined, timeText: string | undefined): string {
  const normalizedDate = String(dateText ?? "").trim();
  const normalizedTime = String(timeText ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate) || !/^\d{2}:\d{2}:\d{2}$/.test(normalizedTime)) {
    return new Date().toISOString();
  }
  return `${normalizedDate}T${normalizedTime}+08:00`;
}

/** 确保值是正数，否则返回 1（避免树图算法除零） */
function normalizeAreaValue(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/** 获取股票的面积权重值（流通市值优先） */
function getStockAreaValue(stock: StockSnapshot): number {
  return normalizeAreaValue(stock.floatMarketCap || stock.totalMarketCap || stock.price * 1_000_000);
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

  // 用 TextDecoder 解码 latin1（改进：原项目用 Buffer.from().toString('latin1')，不兼容 Edge Runtime）
  const decoder = new TextDecoder("latin1");

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
    const weekChangePct = parseFiniteValue(row.f109) ?? dayChangePct;
    const monthChangePct = parseFiniteValue(row.f110) ?? parseFiniteValue(row.f24) ?? dayChangePct;
    const yearChangePct = parseFiniteValue(row.f25) ?? dayChangePct;
    const turnoverAmount = parseFiniteValue(row.f6) ?? 0;

    quotes[code] = {
      price,
      changes: {
        day: dayChangePct,
        week: weekChangePct,
        month: monthChangePct,
        year: yearChangePct,
      },
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

/** 解析东方财富指数行情 */
function parseEastmoneyIndexData(payload: unknown) {
  const secidToMarket = new Map(
    Object.entries(marketIndexSecids).map(([market, secid]) => [secid, market as MarketKey])
  );
  const summaries: Partial<Record<MarketKey, MarketIndexValue>> = {};
  const diff = (payload as { data?: { diff?: unknown[] } }).data?.diff;

  if (!Array.isArray(diff)) return summaries;

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

    summaries[market] = {
      name,
      price,
      changes: {
        day: dayChangePct,
        week: parseFiniteValue(row.f109) ?? dayChangePct,
        month: parseFiniteValue(row.f110) ?? parseFiniteValue(row.f24) ?? dayChangePct,
        year: parseFiniteValue(row.f25) ?? dayChangePct,
      },
    };
  }

  return summaries;
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

  const summaries = parseEastmoneyIndexData(await response.json());

  if (Object.keys(summaries).length < marketKeys.length * 0.75) {
    throw new Error("Eastmoney index snapshot is incomplete");
  }

  return {
    timestamp: Date.now(),
    updatedAt: new Date().toISOString(),
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
    updatedAt: new Date().toISOString(),
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
async function fetchQuotesFromRemote(): Promise<QuoteSnapshot> {
  const secids = baselineStocks.map((stock) => buildEastmoneySecid(stock.code));
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
    if (Object.keys(eastmoneyQuotes).length < baselineStocks.length * 0.9) {
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
  const symbols = baselineStocks.map((stock) => codeToSinaSymbol(stock.code));
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

  if (Object.keys(quotes).length < baselineStocks.length * 0.9) {
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

  if (indexCache && now - indexCache.timestamp < quoteCacheMs) {
    return indexCache;
  }

  if (indexPromise) {
    return indexPromise;
  }

  indexPromise = fetchMarketIndex()
    .then((snapshot) => {
      indexCache = snapshot;
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

  if (quoteCache && now - quoteCache.timestamp < quoteCacheMs) {
    return quoteCache;
  }

  if (quotePromise) {
    return quotePromise;
  }

  quotePromise = fetchQuotesFromRemote()
    .then((snapshot) => {
      quoteCache = snapshot;
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

  if (summaryCache && now - summaryCache.timestamp < summaryCacheMs) {
    return summaryCache;
  }

  if (summaryPromise) {
    return summaryPromise;
  }

  summaryPromise = fetchSummaryFromRemote()
    .then((snapshot) => {
      summaryCache = snapshot;
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
      value: getStockAreaValue(stock),
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

    if (changePct > flatThreshold) {
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
    turnoverPreviousAmount: 0,
    turnoverDelta: 0,
  };
}

/** 加权平均涨跌幅（按市值权重） */
function computeWeightedChange(
  stocks: StockSnapshot[],
  liveQuotes: Record<string, RemoteQuoteValue>,
  period: HeatmapPeriodKey
): number {
  let weightedSum = 0;
  let totalValue = 0;

  for (const stock of stocks) {
    const value = getStockAreaValue(stock);
    const quote = liveQuotes[stock.code];
    const changePct = extractPeriodChange(quote?.changes, period, stock.changePct);
    weightedSum += changePct * value;
    totalValue += value;
  }

  return totalValue > 0 ? weightedSum / totalValue : 0;
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
      changePct: stock.changePct,
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

// ============ 预计算各市场范围的基础股票列表 ============

const stocksByMarket: Record<MarketKey, StockSnapshot[]> = {
  all: baselineStocks,
  sse: baselineStocks.filter((stock) => isInMarketScope(stock, "sse")),
  szse: baselineStocks.filter((stock) => isInMarketScope(stock, "szse")),
  hs300: baselineStocks.filter((stock) => isInMarketScope(stock, "hs300")),
  zza500: baselineStocks.filter((stock) => isInMarketScope(stock, "zza500")),
  cyb: baselineStocks.filter((stock) => isInMarketScope(stock, "cyb")),
  kcb: baselineStocks.filter((stock) => isInMarketScope(stock, "kcb")),
};

// ============ 对外接口函数 ============

/** 获取热力图树图数据 */
export async function getTreemapData(
  market: MarketKey,
  period: HeatmapPeriodKey = "day"
): Promise<TreemapResponse> {
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

  const marketStocks = stocksByMarket[market];
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

  const marketStocks = stocksByMarket[market];
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
      const stocks = stocksByMarket[market];
      const changePct = computeWeightedChange(stocks, {}, period);
      return {
        market,
        changePct: Number.isFinite(changePct) ? changePct : 0,
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
    const stocks = stocksByMarket[market];
    const remoteIndex = indexSummaries?.[market];
    const remoteIndexChange = extractPeriodChange(remoteIndex?.changes, period, Number.NaN);
    const changePct = Number.isFinite(remoteIndexChange)
      ? remoteIndexChange
      : computeWeightedChange(stocks, liveQuotes, period);

    return {
      market,
      changePct: Number.isFinite(changePct) ? changePct : 0,
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
