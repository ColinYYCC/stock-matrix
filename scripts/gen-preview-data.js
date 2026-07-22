/**
 * 从 fallback 数据提取前 1000 只股票（精简字段），用于 HTML 预览
 * 这个脚本只是辅助生成预览数据，不影响项目原有代码
 */
const fs = require("fs");
const path = require("path");

const stocks = require("../src/lib/data/stocks-fallback.json");
const subboards = require("../src/lib/data/subboards.json");

// 合并子板块信息，按市值降序取前 1000 只
const merged = stocks.stocks
  .map((s) => {
    const sb = subboards.subboards[s.code];
    return {
      c: s.code,
      n: s.name,
      b: s.boardName,
      sb: sb ? sb.subBoardName : s.boardName,
      p: s.price,
      ch: s.changePct,
      v: s.floatMarketCap,
    };
  })
  .sort((a, b) => b.v - a.v)
  .slice(0, 1000);

console.log("总股票数:", merged.length);
console.log("JSON大小:", JSON.stringify(merged).length, "字节");

const outPath = path.join(__dirname, "preview-data.json");
fs.writeFileSync(outPath, JSON.stringify(merged));
console.log("数据已写入:", outPath);
