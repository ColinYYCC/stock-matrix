/**
 * 股票图片 URL 工具函数
 *
 * 把股票代码转换成分时迷你图和日线 K 线图的图片地址，供悬浮详情面板
 * （Inspector）和移动端底部弹层共用，避免重复定义。
 * - 迷你图：直连东方财富。国内图床直连快（单张 35-72ms）；2026-09-20 实测
 *   经海外服务器（Vercel）转发会被东方财富限流/超时（502），不可走代理。
 * - K 线：走自家代理 /api/chart/kline。新浪直连慢（部分访客单张 1-2 秒）
 *   且只允许缓存 60 秒；自家接口带数据缓存，60 秒内全站只拉一次上游。
 */

/** 从股票代码 "600519.SH" 解析出纯代码 "600519" 和市场标识 "SH" */
function parseStockCode(code: string) {
  const [symbol = "", market = "SH"] = code.split(".");
  return { symbol, market: market.toUpperCase() };
}

/** 获取东方财富分时图 URL（当天分时走势） */
export function getSparklineUrl(code: string) {
  const { symbol, market } = parseStockCode(code);
  // 东方财富市场编号：上海=1，深圳/北京=0
  const marketId = market === "SH" ? "1" : "0";
  return `https://webquotepic.eastmoney.com/GetPic.aspx?nid=${marketId}.${symbol}&imageType=RJY`;
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
