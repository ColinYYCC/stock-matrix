/**
 * 热力图项目的共享类型定义
 *
 * 这些类型在服务端（API Routes、数据层）和客户端（组件、Canvas 绘制）之间共享，
 * 保证前后端数据结构一致。
 */

// ============ 市场范围 ============

/** 可选的市场范围标识：全A / 上证 / 深证 / 沪深300 / 中证A500 / 创业板 / 科创板 */
export const marketKeys = ["all", "sse", "szse", "hs300", "zza500", "cyb", "kcb"] as const;

/** 市场范围类型 */
export type MarketKey = (typeof marketKeys)[number];

// ============ 涨跌周期 ============

/** 涨跌周期标识：当日 / 近5日 / 近20日 / 年初至今 */
export const heatmapPeriodKeys = ["day", "week", "month", "year"] as const;

/** 涨跌周期类型 */
export type HeatmapPeriodKey = (typeof heatmapPeriodKeys)[number];

// ============ 面积指标 ============

/** 面积指标标识：流通市值 / 成交额 */
export type HeatmapSizeMode = "marketCap" | "turnover";

// ============ 涨跌颜色模式 ============

/** 涨跌颜色模式：红涨绿跌 / 绿涨红跌 */
export type PriceColorMode = "red-rise" | "green-rise";

// ============ 显示模式 ============

/** 暗色 / 亮色 */
export type DisplayMode = "dark" | "light";

// ============ 主题颜色 ============

/** 主题颜色选项 */
export type ThemeColorKey = "green" | "red" | "blue" | "violet";

// ============ 交易所 ============

/** 交易所代码：上海 / 深圳 / 北京 */
export type ExchangeCode = "SH" | "SZ" | "BJ";

// ============ 数据源 ============

/** 数据来源：实时拉取 / 内置快照兜底 */
export type MarketDataSource = "direct" | "fallback";

// ============ 前端内部类型 ============

/** 客户端用的行情快照（key 是股票代码如 "600519.SH"） */
export type QuoteMap = Record<
  string,
  { price: number; changePct: number; turnoverAmount: number }
>;

/** Canvas 上个股色块的坐标和尺寸信息 */
export type StockRect = {
  code: string;
  name: string;
  boardName: string;
  subBoardName: string;
  value: number;
  x: number;
  y: number;
  width: number;
  height: number;
  price: number;
  changePct: number;
};

/** Canvas 上一级行业板块的坐标和尺寸信息 */
export type BoardRect = {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  stockCount: number;
  titleHeight: number;
  changePct: number;
};

/** Canvas 上二级行业板块的坐标和尺寸信息 */
export type SubBoardRect = {
  name: string;
  boardName: string;
  x: number;
  y: number;
  width: number;
  height: number;
  stockCount: number;
  titleHeight: number;
  changePct: number;
};

/** 树图布局算法的输入项 */
export type TreemapInput<T> = {
  item: T;
  value: number;
};

/** 树图布局算法的输出矩形 */
export type TreemapRect<T> = {
  item: T;
  x: number;
  y: number;
  width: number;
  height: number;
};

/** 矩形边界 */
export type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** 树图布局结果 */
export type TreemapLayout = {
  stockRects: StockRect[];
  boardRects: BoardRect[];
  subBoardRects: SubBoardRect[];
};

/** 视图状态（缩放比例和偏移） */
export type ViewState = {
  scale: number;
  x: number;
  y: number;
};

// ============ 服务端 API 类型 ============

/** 个股节点（热力图中的一只股票） */
export type HeatmapStockNode = {
  code: string;
  name: string;
  boardName: string;
  subBoardName: string;
  value: number;
  exchange: ExchangeCode;
  price: number;
  changePct: number;
  turnoverAmount: number;
};

/** 一级行业板块节点 */
export type HeatmapBoardNode = {
  code: string;
  name: string;
  value: number;
  stockCount: number;
  children: HeatmapStockNode[];
};

/** /api/heatmap/treemap 接口返回的完整数据 */
export type TreemapResponse = {
  market: MarketKey;
  period: HeatmapPeriodKey;
  updatedAt: string;
  stockCount: number;
  boardCount: number;
  summary: {
    advanceCount: number;
    flatCount: number;
    declineCount: number;
    turnoverAmount: number;
    turnoverPreviousAmount: number;
    turnoverDelta: number;
    indexChangePct?: number;
  };
  nodes: HeatmapBoardNode[];
  source: MarketDataSource;
};

/** 单只股票的行情值 */
export type QuoteValue = {
  price: number;
  changePct: number;
  turnoverAmount: number;
};

/** /api/heatmap/quotes 接口返回的数据 */
export type QuotesResponse = {
  market: MarketKey;
  period: HeatmapPeriodKey;
  updatedAt: string;
  quotes: Record<string, QuoteValue>;
  source: MarketDataSource;
};

/** 单个市场范围的概览信息 */
export type MarketOverviewItem = {
  market: MarketKey;
  changePct: number;
  stockCount: number;
  updatedAt: string;
};

/** /api/heatmap/overview 接口返回的数据 */
export type MarketOverviewResponse = {
  period: HeatmapPeriodKey;
  updatedAt: string;
  markets: MarketOverviewItem[];
  source: MarketDataSource;
};

// ============ 类型守卫函数 ============

/** 判断字符串是否是合法的 MarketKey */
export function isMarketKey(value: string): value is MarketKey {
  return marketKeys.includes(value as MarketKey);
}

/** 判断字符串是否是合法的 HeatmapPeriodKey */
export function isHeatmapPeriodKey(value: string): value is HeatmapPeriodKey {
  return heatmapPeriodKeys.includes(value as HeatmapPeriodKey);
}

// ============ 国际化 ============

/** 支持的语言 */
export type Locale = "zh" | "en";
