/**
 * 股票图片 URL 工具函数
 *
 * 把股票代码转换成分时迷你图和日线 K 线图的图片地址（均走自家代理接口，
 * 上游分别是东方财富/新浪图床），供悬浮详情面板（Inspector）和
 * 移动端底部弹层共用，避免重复定义。
 */

/** 从股票代码 "600519.SH" 解析出纯代码 "600519" 和市场标识 "SH" */
function parseStockCode(code: string) {
  const [symbol = "", market = "SH"] = code.split(".");
  return { symbol, market: market.toUpperCase() };
}

/**
 * 获取分时迷你图 URL：走自家代理接口 /api/chart/sparkline（不再直连东方财富）。
 * 原因见 src/app/api/chart/sparkline/route.ts 头注释：直连受 6 连接排队限制
 * 且无缓存头，换子板块整批重来；自家接口同域并发 + 60 秒缓存。
 * 详情面板（inspector.tsx）与移动端底部弹层（mobile-stock-sheet.tsx）共用本函数。
 */
export function getSparklineUrl(code: string) {
  const { symbol, market } = parseStockCode(code);
  const marketPrefix = market === "SH" ? "sh" : market === "SZ" ? "sz" : "bj";
  return `/api/chart/sparkline?code=${marketPrefix}${symbol}`;
}

/**
 * 获取日线 K 线图 URL：走自家代理接口 /api/chart/kline（不再直连新浪图床）。
 * 原因见 src/app/api/chart/kline/route.ts 头注释：新浪直连慢且只缓存 60 秒，
 * 自家接口带缓存头 + 同域并发，第二次看同一只股票秒出。
 * 详情面板（inspector.tsx）与移动端底部弹层（mobile-stock-sheet.tsx）共用本函数。
 */
export function getDailyKlineUrl(code: string) {
  const { symbol, market } = parseStockCode(code);
  const marketPrefix = market === "SH" ? "sh" : market === "SZ" ? "sz" : "bj";
  return `/api/chart/kline?code=${marketPrefix}${symbol}`;
}
