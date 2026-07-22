// 检查 HTML 里 JS 引用的所有 getElementById 是否都有对应的 HTML 元素
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "ios26-preview.html"), "utf-8");

// 提取 HTML 部分和 JS 部分
const htmlPart = html.match(/<body>([\s\S]*?)<script>/)[1];
const jsPart = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// 找出 JS 里所有 getElementById 的 ID
const idRefs = jsPart.match(/getElementById\(["']([^"']+)["']\)/g) || [];
const referencedIds = idRefs.map(function(m) {
  const match = m.match(/getElementById\(["']([^"']+)["']\)/);
  return match ? match[1] : null;
}).filter(Boolean);

// 找出 JS 里所有 querySelector("#xxx") 的 ID
const queryRefs = jsPart.match(/querySelector\(["']#([^"']+)["']\)/g) || [];
queryRefs.forEach(function(m) {
  const match = m.match(/querySelector\(["']#([^"']+)["']\)/);
  if (match) referencedIds.push(match[1]);
});

// 去重
const uniqueIds = [...new Set(referencedIds)];

console.log("===== JS 引用的元素 ID =====");
console.log("共引用 " + uniqueIds.length + " 个 ID");

let missing = [];
uniqueIds.forEach(function(id) {
  // 在 HTML 里查找 id="xxx"
  const regex = new RegExp('id="' + id + '"');
  if (regex.test(htmlPart)) {
    console.log("  [OK] " + id);
  } else {
    console.log("  [缺失] " + id);
    missing.push(id);
  }
});

if (missing.length > 0) {
  console.log("\n警告: 以下 " + missing.length + " 个 ID 在 HTML 中不存在:");
  missing.forEach(function(id) { console.log("  - " + id); });
} else {
  console.log("\n所有引用的 ID 都存在于 HTML 中");
}

// 检查 JS 里有没有调用 alert（在 Node 里没有，但浏览器里有）
console.log("\n===== 其他检查 =====");
console.log("alert 调用:", (jsPart.match(/alert\(/g) || []).length, "处");
console.log("requestFullscreen 调用:", (jsPart.match(/requestFullscreen/g) || []).length, "处");
console.log("localStorage 调用:", (jsPart.match(/localStorage/g) || []).length, "处");
console.log("fetch 调用:", (jsPart.match(/fetch\(/g) || []).length, "处");
