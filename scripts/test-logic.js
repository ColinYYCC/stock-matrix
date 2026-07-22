// 核心逻辑测试脚本：验证 HTML 预览里的关键算法是否正确
const FLAT_THRESHOLD = 0.1;
const COLOR_LIMIT = 10;

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

// 测试颜色映射
function getHeatColor(changePct, colorMode) {
  const amplitude = clamp(Math.abs(changePct) / COLOR_LIMIT, 0, 1);
  if (Math.abs(changePct) < FLAT_THRESHOLD) return "rgb(72, 79, 92)";
  const isRise = changePct > 0;
  const shouldUseRed = colorMode === "red-rise" ? isRise : !isRise;
  if (shouldUseRed) {
    const r = Math.round(140 + amplitude * 115);
    const g = Math.round(72 - amplitude * 42);
    const b = Math.round(76 - amplitude * 38);
    return "rgb(" + r + ", " + g + ", " + b + ")";
  }
  const r = Math.round(40 - amplitude * 14);
  const g = Math.round(126 + amplitude * 88);
  const b = Math.round(76 - amplitude * 10);
  return "rgb(" + r + ", " + g + ", " + b + ")";
}

console.log("===== 颜色映射测试 =====");
console.log("涨10%(红涨):", getHeatColor(10, "red-rise"));
console.log("跌10%(红涨):", getHeatColor(-10, "red-rise"));
console.log("平盘:", getHeatColor(0, "red-rise"));
console.log("涨5%(绿涨):", getHeatColor(5, "green-rise"));

// 测试树图布局
function sortTreemapItems(items) {
  return items.filter(function(e) { return e.value > 0; }).sort(function(a, b) { return b.value - a.value; });
}
function totalTreemapValue(items) { let t = 0; for (const e of items) t += e.value; return t; }
function findBalancedSplitIndex(items) {
  if (items.length <= 1) return items.length;
  const target = totalTreemapValue(items) / 2;
  let cum = 0, bestIdx = 1, bestDiff = Infinity;
  for (let i = 1; i < items.length; i++) { cum += items[i-1].value; const d = Math.abs(target - cum); if (d < bestDiff) { bestDiff = d; bestIdx = i; } }
  return bestIdx;
}
function splitBounds(bounds, ratio) {
  if (bounds.width >= bounds.height) {
    const lw = bounds.width * ratio;
    return { first: {x:bounds.x,y:bounds.y,width:lw,height:bounds.height}, second: {x:bounds.x+lw,y:bounds.y,width:Math.max(0,bounds.width-lw),height:bounds.height} };
  }
  const th = bounds.height * ratio;
  return { first: {x:bounds.x,y:bounds.y,width:bounds.width,height:th}, second: {x:bounds.x,y:bounds.y+th,width:bounds.width,height:Math.max(0,bounds.height-th)} };
}
function insetRect(rect, gap) { const i = gap/2; return {x:rect.x+i,y:rect.y+i,width:Math.max(0,rect.width-gap),height:Math.max(0,rect.height-gap),item:rect.item}; }
function binaryTreemap(items, x, y, width, height, gap) {
  gap = gap || 0;
  const sorted = sortTreemapItems(items);
  function layout(entries, bounds) {
    if (entries.length === 0 || bounds.width <= 1 || bounds.height <= 1) return [];
    if (entries.length === 1) return [insetRect({item:entries[0].item,x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height}, gap)];
    const si = findBalancedSplitIndex(entries);
    const fe = entries.slice(0, si);
    const se = entries.slice(si);
    if (fe.length === 0 || se.length === 0) return entries.map(function(e,idx){ return insetRect({item:e.item,x:bounds.x,y:bounds.y+(bounds.height/entries.length)*idx,width:bounds.width,height:bounds.height/entries.length}, gap); });
    const total = totalTreemapValue(entries);
    const fr = totalTreemapValue(fe) / total;
    const parts = splitBounds(bounds, fr);
    return layout(fe, parts.first).concat(layout(se, parts.second));
  }
  return layout(sorted, {x:x,y:y,width:width,height:height}).filter(function(r){ return r.width > 1 && r.height > 1; });
}

console.log("\n===== 树图布局测试 =====");
const testItems = [
  {item: {name:"银行"}, value: 100},
  {item: {name:"电子"}, value: 80},
  {item: {name:"化工"}, value: 50}
];
const boxes = binaryTreemap(testItems, 0, 0, 1000, 800, 4);
console.log("矩形数量:", boxes.length);
boxes.forEach(function(b) { console.log("  " + b.item.name + ":", Math.round(b.x), Math.round(b.y), Math.round(b.width) + "x" + Math.round(b.height)); });
const totalArea = boxes.reduce(function(s,b){ return s + b.width * b.height; }, 0);
console.log("总面积:", Math.round(totalArea), "(画布面积: 800000)");

// 测试加权平均涨跌幅
function weightedAverageChange(stocks) {
  let weightedSum = 0, totalValue = 0;
  for (const stock of stocks) { weightedSum += stock.ch * stock.v; totalValue += stock.v; }
  return totalValue <= 0 ? 0 : weightedSum / totalValue;
}

console.log("\n===== 加权平均涨跌幅测试 =====");
const testStocks = [
  {n:"股票A", ch:5, v:100},
  {n:"股票B", ch:-3, v:200},
  {n:"股票C", ch:2, v:50}
];
console.log("加权平均:", weightedAverageChange(testStocks).toFixed(4));

// 测试格式化函数
function formatCompactChange(value) {
  const absValue = Math.abs(value);
  const digits = absValue >= 10 ? 1 : 2;
  let text = value.toFixed(digits);
  text = text.replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
  return value > 0 ? "+" + text + "%" : text + "%";
}
function formatTurnoverAmount(value) {
  if (!Number.isFinite(value) || value <= 0) return "--";
  const withUnit = function(divisor, unit) {
    const scaled = value / divisor;
    const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
    let text = scaled.toFixed(digits);
    text = text.replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
    return text + " " + unit;
  };
  if (value >= 1000000000000) return withUnit(1000000000000, "万亿");
  if (value >= 100000000) return withUnit(100000000, "亿");
  if (value >= 10000) return withUnit(10000, "万");
  return value.toFixed(0);
}

console.log("\n===== 格式化测试 =====");
console.log("formatCompactChange(5.23):", formatCompactChange(5.23));
console.log("formatCompactChange(-10.5):", formatCompactChange(-10.5));
console.log("formatCompactChange(0):", formatCompactChange(0));
console.log("formatTurnoverAmount(2103819000000):", formatTurnoverAmount(2103819000000));
console.log("formatTurnoverAmount(18044000000):", formatTurnoverAmount(18044000000));

console.log("\n===== 所有核心逻辑测试通过 =====");
