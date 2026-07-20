/**
 * 股票图片 URL 工具函数
 *
 * 把股票代码转换成东方财富分时图和新浪日线 K 线图的图片地址，
 * 供悬浮详情面板（Inspector）和 Canvas 主组件共用，避免重复定义。
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

/** 获取新浪日线 K 线图 URL（近期日 K 线） */
export function getDailyKlineUrl(code: string) {
  const { symbol, market } = parseStockCode(code);
  const marketPrefix = market === "SH" ? "sh" : market === "SZ" ? "sz" : "bj";
  return `https://image.sinajs.cn/newchart/daily/n/${marketPrefix}${symbol}.gif`;
}
