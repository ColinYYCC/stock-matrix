/**
 * 生成 iOS 26 Liquid Glass 风格的 HTML 预览文件
 *
 * 这个脚本读取 preview-data.json，把数据内联到一个独立的 HTML 文件里。
 * 生成的 HTML 文件可以双击直接用浏览器打开，不需要启动服务器。
 *
 * 用法：node scripts/gen-preview-html.js
 * 输出：ios26-preview.html（在项目根目录）
 */
const fs = require("fs");
const path = require("path");

// 读取预览数据
const stockData = JSON.parse(
  fs.readFileSync(path.join(__dirname, "preview-data.json"), "utf-8")
);

// 读取原项目 logo（icon.svg），去掉深色背景后转成 base64 内联到 HTML 里
// iOS 26 风格下 logo 直接浮在毛玻璃面板上，不需要深色底
const logoSvgContent = fs.readFileSync(
  path.join(__dirname, "..", "public", "icon.svg"), "utf-8"
).replace(/<rect[^>]*fill="#15191f"[^>]*\/>/, "");
const logoBase64 = Buffer.from(logoSvgContent).toString("base64");
const logoSrc = "data:image/svg+xml;base64," + logoBase64;

// ============ CSS 样式（iOS 26 Liquid Glass 风格） ============

const CSS = `
/* ===== 重置和基础样式 ===== */
* { margin: 0; padding: 0; box-sizing: border-box; }

:root {
  /* 暗色主题（默认） */
  --bg-start: #0a0e1a;
  --bg-end: #131826;
  /* 背景彩色光斑：让毛玻璃面板后面有内容可以模糊，否则 blur 纯色看不出效果 */
  --bg-blobs:
    radial-gradient(circle at 12% 18%, rgba(239, 68, 68, 0.18), transparent 38%),
    radial-gradient(circle at 88% 82%, rgba(52, 211, 153, 0.14), transparent 38%),
    radial-gradient(circle at 72% 12%, rgba(99, 102, 241, 0.12), transparent 35%),
    radial-gradient(circle at 28% 78%, rgba(168, 85, 247, 0.1), transparent 35%);
  --glass-bg: rgba(255, 255, 255, 0.09);
  --glass-bg-hover: rgba(255, 255, 255, 0.14);
  --glass-bg-active: rgba(255, 255, 255, 0.18);
  --glass-border: rgba(255, 255, 255, 0.14);
  --glass-border-strong: rgba(255, 255, 255, 0.22);
  --glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.37);
  --glass-inset-glow: inset 0 1px 0 rgba(255, 255, 255, 0.15);

  --text-primary: rgba(255, 255, 255, 0.95);
  --text-secondary: rgba(255, 255, 255, 0.6);
  --text-tertiary: rgba(255, 255, 255, 0.4);

  --brand: #ef4444;
  --brand-glow: rgba(239, 68, 68, 0.4);

  --canvas-bg: #10141b;
  --neutral-color: rgb(72, 79, 92);

  --rise-color: #f87171;
  --fall-color: #34d399;
}

[data-theme="light"] {
  --bg-start: #eef1f6;
  --bg-end: #e2e8f0;
  /* 亮色主题的光斑颜色更淡，避免太花 */
  --bg-blobs:
    radial-gradient(circle at 12% 18%, rgba(239, 68, 68, 0.1), transparent 38%),
    radial-gradient(circle at 88% 82%, rgba(52, 211, 153, 0.08), transparent 38%),
    radial-gradient(circle at 72% 12%, rgba(99, 102, 241, 0.08), transparent 35%),
    radial-gradient(circle at 28% 78%, rgba(168, 85, 247, 0.06), transparent 35%);
  --glass-bg: rgba(255, 255, 255, 0.55);
  --glass-bg-hover: rgba(255, 255, 255, 0.75);
  --glass-bg-active: rgba(255, 255, 255, 0.85);
  --glass-border: rgba(0, 0, 0, 0.08);
  --glass-border-strong: rgba(0, 0, 0, 0.12);
  --glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
  --glass-inset-glow: inset 0 1px 0 rgba(255, 255, 255, 0.7);

  --text-primary: rgba(0, 0, 0, 0.88);
  --text-secondary: rgba(0, 0, 0, 0.5);
  --text-tertiary: rgba(0, 0, 0, 0.3);

  --canvas-bg: #e9eef5;
  --neutral-color: rgb(100, 110, 125);

  --rise-color: #dc2626;
  --fall-color: #059669;
}

html, body {
  height: 100vh;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "PingFang SC", "Microsoft YaHei", sans-serif;
  -webkit-font-smoothing: antialiased;
  color: var(--text-primary);
  /* 背景先铺彩色光斑，再铺渐变底色，这样毛玻璃面板 blur 时能看到光斑被模糊 */
  background: var(--bg-blobs), linear-gradient(135deg, var(--bg-start), var(--bg-end));
  transition: background 0.4s ease;
}

/* ===== 主布局 ===== */
.app {
  display: grid;
  grid-template-columns: 200px 1fr;
  grid-template-rows: 1fr auto;
  height: 100vh;
  gap: 8px;
  padding: 8px;
}

/* ===== 侧边栏（毛玻璃面板） ===== */
.sidebar {
  grid-row: 1 / 3;
  background: var(--glass-bg);
  backdrop-filter: blur(40px) saturate(1.5);
  -webkit-backdrop-filter: blur(40px) saturate(1.5);
  border: 1px solid var(--glass-border);
  border-radius: 24px;
  box-shadow: var(--glass-shadow), var(--glass-inset-glow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: background 0.3s ease;
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px 6px;
}

.sidebar-logo {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  filter: drop-shadow(0 2px 8px var(--brand-glow));
}

.sidebar-title {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-body {
  flex: 1;
  /* 严禁滚动：用 hidden 代替 auto，内容超出直接裁切而非出滚动条 */
  overflow: hidden;
  padding: 0 8px 6px;
}

/* 最近刷新时间（胶囊） */
.update-pill {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--glass-bg);
  margin-bottom: 6px;
}
.update-label {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-secondary);
}
.update-time {
  font-size: 10px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* 市场切换按钮列表 */
.market-list { display: flex; flex-direction: column; gap: 2px; }
.market-btn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 10px;
  border-radius: 10px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
}
.market-btn:hover { background: var(--glass-bg-hover); }
.market-btn.active {
  background: var(--glass-bg-active);
  box-shadow: var(--glass-inset-glow), 0 0 0 1px var(--glass-border-strong);
}
.market-btn .change {
  font-size: 12px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* 玻璃分组卡片 */
.glass-card {
  background: var(--glass-bg);
  border-radius: 14px;
  padding: 7px;
  margin-top: 6px;
}
.glass-card-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

/* iOS 分段控件 */
.segmented {
  display: flex;
  background: var(--glass-bg);
  border-radius: 9px;
  padding: 2px;
  gap: 2px;
}
.segmented button {
  flex: 1;
  padding: 5px 3px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}
.segmented button.active {
  background: var(--glass-bg-active);
  color: var(--text-primary);
  box-shadow: 0 1px 3px rgba(0,0,0,0.15), var(--glass-inset-glow);
}

/* 下拉选择 */
.select-wrap {
  position: relative;
}
.select-wrap select {
  width: 100%;
  padding: 5px 8px;
  border-radius: 9px;
  border: 1px solid var(--glass-border);
  background: var(--glass-bg);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  appearance: none;
}

/* 市场概览统计 */
.overview-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 4px;
  text-align: center;
}
.overview-item .label { font-size: 10px; font-weight: 600; }
.overview-item .count {
  font-size: 15px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  margin-top: 1px;
}

/* 成交额 */
.turnover-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--glass-border);
}
.turnover-item .label { font-size: 9px; color: var(--text-secondary); }
.turnover-item .value {
  font-size: 12px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  margin-top: 1px;
}

/* 底部操作按钮 */
.sidebar-footer {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px;
  border-top: 1px solid var(--glass-border);
}
.action-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 10px;
  border: none;
  background: var(--glass-bg);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}
.action-btn:hover { background: var(--glass-bg-hover); }
.action-btn svg { width: 14px; height: 14px; flex-shrink: 0; }

/* ===== 热力图区域 ===== */
.heatmap-area {
  grid-column: 2;
  grid-row: 1;
  position: relative;
  background: var(--canvas-bg);
  border-radius: 24px;
  overflow: hidden;
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-inset-glow);
  transition: background 0.3s ease;
}
.heatmap-canvas {
  position: absolute;
  inset: 0;
}

/* 色块 */
.stock-block {
  position: absolute;
  border-radius: 2px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 2px;
  cursor: pointer;
  transition: filter 0.15s ease, transform 0.1s ease;
}
.stock-block:hover {
  filter: brightness(1.15);
  z-index: 10;
}
.stock-block .name {
  font-size: 11px;
  font-weight: 600;
  color: rgba(255,255,255,0.95);
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
  line-height: 1.1;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.stock-block .change {
  font-size: 10px;
  font-weight: 600;
  color: rgba(255,255,255,0.9);
  font-variant-numeric: tabular-nums;
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
}

/* 板块标题 */
.board-title {
  position: absolute;
  padding: 3px 6px;
  font-size: 11px;
  font-weight: 700;
  color: rgba(255,255,255,0.95);
  text-shadow: 0 1px 2px rgba(0,0,0,0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}

/* 主题切换按钮（右上角浮动） */
.theme-toggle {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 50;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  border: 1px solid var(--glass-border-strong);
  background: var(--glass-bg-active);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  color: var(--text-primary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--glass-shadow), var(--glass-inset-glow);
  transition: all 0.2s ease;
}
.theme-toggle:hover { background: var(--glass-bg-hover); }
.theme-toggle svg { width: 18px; height: 18px; }

/* 加载遮罩 */
.loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(10, 14, 26, 0.7);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}
[data-theme="light"] .loading-overlay {
  background: rgba(238, 241, 246, 0.7);
}
.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid var(--glass-border);
  border-top-color: var(--brand);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.loading-text { font-size: 15px; font-weight: 600; }

/* ===== 底部图例（浮动玻璃条） ===== */
.legend {
  grid-column: 2;
  grid-row: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  border-radius: 20px;
  background: var(--glass-bg);
  backdrop-filter: blur(40px) saturate(1.5);
  -webkit-backdrop-filter: blur(40px) saturate(1.5);
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow), var(--glass-inset-glow);
}
.legend-left { display: flex; align-items: center; gap: 8px; }
.legend-right { display: flex; align-items: center; gap: 12px; }

.icon-btn {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  border: none;
  background: var(--glass-bg);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}
.icon-btn:hover { background: var(--glass-bg-hover); color: var(--text-primary); }
.icon-btn svg { width: 14px; height: 14px; }

/* 渐变色条 */
.legend-bar {
  display: flex;
  align-items: center;
  gap: 6px;
}
.legend-gradient {
  position: relative;
  width: 180px;
  height: 14px;
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px var(--glass-border);
}
.legend-ticks {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
  font-size: 8px;
  font-weight: 700;
  color: white;
  text-shadow: 0 1px 2px rgba(0,0,0,0.55);
}

/* 分享按钮 */
.share-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 999px;
  border: none;
  background: var(--brand);
  color: white;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 16px var(--brand-glow);
  transition: all 0.2s ease;
}
.share-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 20px var(--brand-glow); }
.share-btn svg { width: 12px; height: 12px; }

/* ===== 设置面板（底部弹出抽屉） ===== */
.settings-overlay {
  position: fixed;
  inset: 0;
  z-index: 10010;
  display: none;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}
.settings-overlay.open { display: flex; }

.settings-drawer {
  width: 100%;
  max-width: 720px;
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  border-radius: 32px 32px 0 0;
  background: var(--glass-bg);
  backdrop-filter: blur(60px) saturate(1.8);
  -webkit-backdrop-filter: blur(60px) saturate(1.8);
  border: 1px solid var(--glass-border-strong);
  border-bottom: none;
  box-shadow: 0 -24px 80px rgba(0,0,0,0.4), var(--glass-inset-glow);
  overflow: hidden;
  animation: slideUp 0.35s cubic-bezier(0.32, 0.72, 0, 1);
}
@keyframes slideUp {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

.settings-handle {
  width: 36px;
  height: 5px;
  border-radius: 999px;
  background: var(--glass-border-strong);
  margin: 8px auto 4px;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 8px 20px 14px;
  border-bottom: 1px solid var(--glass-border);
}
.settings-header h2 { font-size: 18px; font-weight: 700; }
.settings-header p { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }

.settings-close {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  border: none;
  background: var(--glass-bg-active);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.settings-close:hover { background: var(--glass-bg-hover); color: var(--text-primary); }

.settings-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px 24px;
}

/* 设置面板的 Tab 导航（分段控件） */
.settings-tabs {
  display: flex;
  background: var(--glass-bg);
  border-radius: 12px;
  padding: 4px;
  gap: 2px;
  margin-bottom: 20px;
}
.settings-tabs button {
  flex: 1;
  padding: 8px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.settings-tabs button.active {
  background: var(--glass-bg-active);
  color: var(--text-primary);
  box-shadow: 0 1px 3px rgba(0,0,0,0.12), var(--glass-inset-glow);
}
.settings-tabs button svg { width: 14px; height: 14px; }

/* iOS 设置行 */
.settings-group {
  background: var(--glass-bg);
  border-radius: 16px;
  overflow: hidden;
  margin-bottom: 16px;
}
.settings-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--glass-border);
  cursor: pointer;
  transition: background 0.15s ease;
}
.settings-row:last-child { border-bottom: none; }
.settings-row:hover { background: var(--glass-bg-hover); }
.settings-row .icon-box {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.settings-row .label { flex: 1; font-size: 14px; font-weight: 500; }
.settings-row .check {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: 2px solid var(--glass-border-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.settings-row.selected .check {
  background: var(--brand);
  border-color: var(--brand);
}
.settings-row.selected .check::after {
  content: '';
  width: 6px;
  height: 10px;
  border: 2px solid white;
  border-top: 0;
  border-left: 0;
  transform: rotate(45deg) translate(-1px, -1px);
}

.help-item {
  padding: 12px 16px;
  border-bottom: 1px solid var(--glass-border);
  font-size: 13px;
  color: var(--text-secondary);
}
.help-item:last-child { border-bottom: none; }

/* 颜色模式预览 */
.color-preview {
  font-size: 14px;
  font-weight: 700;
}

/* 提示气泡 */
.tip-bubble {
  position: absolute;
  bottom: 100%;
  left: 0;
  margin-bottom: 8px;
  width: 256px;
  padding: 10px;
  border-radius: 14px;
  background: var(--glass-bg-active);
  backdrop-filter: blur(40px);
  -webkit-backdrop-filter: blur(40px);
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-secondary);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
  z-index: 40;
}
.tip-wrap:hover .tip-bubble,
.tip-wrap:focus-within .tip-bubble { opacity: 1; }
.tip-bubble p { margin-bottom: 4px; }
.tip-bubble p:last-child { margin-bottom: 0; }
`;

// ============ HTML 模板 ============

const HTML = `
<div class="app" id="app">
  <!-- 侧边栏 -->
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <img class="sidebar-logo" src="${logoSrc}" alt="" />
      <span class="sidebar-title">股市矩阵</span>
    </div>
    <div class="sidebar-body" id="sidebarBody">
      <!-- 最近刷新时间 -->
      <div class="update-pill">
        <span class="update-label">最近刷新</span>
        <span class="update-time" id="updateTime">--:--:--</span>
      </div>
      <!-- 市场切换 -->
      <div class="market-list" id="marketList"></div>
      <!-- 板块筛选 -->
      <div class="glass-card">
        <div class="glass-card-label">一级板块</div>
        <div class="select-wrap">
          <select id="boardFilter">
            <option value="__all__">全部板块</option>
          </select>
        </div>
      </div>
      <!-- 涨跌筛选（分段控件） -->
      <div class="glass-card">
        <div class="glass-card-label">涨跌筛选</div>
        <div class="segmented" id="trendFilter">
          <button data-value="__all__" class="active">全部</button>
          <button data-value="__rising__">上涨</button>
          <button data-value="__falling__">下跌</button>
        </div>
      </div>
      <!-- 面积指标（分段控件） -->
      <div class="glass-card">
        <div class="glass-card-label">面积指标</div>
        <div class="segmented" id="sizeMode">
          <button data-value="marketCap" class="active">流通市值</button>
          <button data-value="turnover">成交额</button>
        </div>
      </div>
      <!-- 涨跌周期（分段控件） -->
      <div class="glass-card">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span class="glass-card-label" style="margin-bottom:0;">涨跌区间</span>
          <span id="periodLabel" style="font-size:10px;font-weight:600;color:var(--text-primary);">当日涨跌</span>
        </div>
        <div class="segmented" id="periodFilter" style="margin-top:6px;">
          <button data-value="day" class="active">日</button>
          <button data-value="week">周</button>
          <button data-value="month">月</button>
          <button data-value="year">年</button>
        </div>
      </div>
      <!-- 市场概览 -->
      <div class="glass-card" id="overviewCard">
        <div class="overview-grid">
          <div class="overview-item">
            <div class="label" style="color:var(--rise-color);">上涨</div>
            <div class="count" id="riseCount" style="color:var(--rise-color);">0</div>
          </div>
          <div class="overview-item">
            <div class="label" style="color:var(--text-secondary);">平盘</div>
            <div class="count" id="flatCount">0</div>
          </div>
          <div class="overview-item">
            <div class="label" style="color:var(--fall-color);">下跌</div>
            <div class="count" id="fallCount" style="color:var(--fall-color);">0</div>
          </div>
        </div>
        <div class="turnover-grid">
          <div class="turnover-item">
            <div class="label">成交额</div>
            <div class="value" id="turnoverAmount">--</div>
          </div>
          <div class="turnover-item">
            <div class="label">比昨日 <span id="turnoverTrend">持平</span></div>
            <div class="value" id="turnoverDelta">--</div>
          </div>
        </div>
      </div>
    </div>
    <!-- 底部操作按钮 -->
    <div class="sidebar-footer">
      <button class="action-btn" id="resetViewBtn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.36 2.64L3 8"/><path d="M3 3v5h5"/></svg>
        重置视图
      </button>
      <button class="action-btn" id="fullscreenBtn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
        全屏
      </button>
      <button class="action-btn" id="settingsBtn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        设置
      </button>
    </div>
  </aside>

  <!-- 热力图区域 -->
  <div class="heatmap-area" id="heatmapArea">
    <div class="heatmap-canvas" id="heatmapCanvas"></div>
    <!-- 主题切换按钮 -->
    <button class="theme-toggle" id="themeToggle" title="切换主题">
      <svg id="themeIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
    </button>
    <!-- 加载遮罩 -->
    <div class="loading-overlay" id="loadingOverlay" style="display:none;">
      <div class="spinner"></div>
      <div class="loading-text">热力图加载中...</div>
    </div>
  </div>

  <!-- 底部图例 -->
  <div class="legend">
    <div class="legend-left">
      <div class="tip-wrap" style="position:relative;">
        <button class="icon-btn" id="tipsBtn" title="操作提示">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
        </button>
        <div class="tip-bubble" id="tipBubble">
          <p>· 色块大小反映流通市值</p>
          <p>· 颜色深浅反映涨跌幅度</p>
          <p>· 双击股票可跳转雪球查看详情</p>
          <p>· 滚轮放大查看细节</p>
          <p>· 放大后按住鼠标拖动可平移画面</p>
          <p>· 悬停时按 ↑/↓ 可滚动详情列表</p>
          <p>· 全屏模式查看效果更佳</p>
        </div>
      </div>
      <a href="https://github.com/ColinYYCC/stock-matrix" target="_blank" rel="noopener noreferrer" class="icon-btn" title="GitHub 项目" style="text-decoration:none;">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5C5.65.5.5 5.66.5 12.03c0 5.1 3.3 9.43 7.87 10.95.58.1.79-.25.79-.56l-.02-2.16c-3.2.7-3.88-1.55-3.88-1.55-.52-1.34-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.78 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.3 1.19-3.1-.12-.3-.52-1.5.11-3.13 0 0 .97-.31 3.19 1.18a10.9 10.9 0 0 1 5.8 0c2.21-1.5 3.18-1.18 3.18-1.18.64 1.63.24 2.83.12 3.13.74.8 1.18 1.84 1.18 3.1 0 4.43-2.69 5.4-5.25 5.68.41.36.78 1.08.78 2.18l-.01 3.23c0 .31.2.67.8.55A11.54 11.54 0 0 0 23.5 12.03C23.5 5.66 18.35.5 12 .5Z"/></svg>
      </a>
    </div>
    <div class="legend-right">
      <div class="legend-bar">
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--fall-color)" stroke-width="2" style="width:12px;height:12px;"><path d="M23 18l-9.5-9.5-5 5L1 6"/><path d="M17 18h6v-6"/></svg>
        <div class="legend-gradient" id="legendGradient"><div class="legend-ticks" id="legendTicks"></div></div>
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--rise-color)" stroke-width="2" style="width:12px;height:12px;"><path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/></svg>
      </div>
      <button class="share-btn" id="shareBtn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/></svg>
        <span>分享</span>
      </button>
    </div>
  </div>
</div>

<!-- 设置面板 -->
<div class="settings-overlay" id="settingsOverlay">
  <div class="settings-drawer">
    <div class="settings-handle"></div>
    <div class="settings-header">
      <div>
        <h2>设置</h2>
        <p>自定义显示效果、语言和交互方式。</p>
      </div>
      <button class="settings-close" id="settingsCloseBtn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
      </button>
    </div>
    <div class="settings-body" id="settingsBody">
      <!-- Tab 导航 -->
      <div class="settings-tabs" id="settingsTabs">
        <button data-tab="appearance" class="active">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>
          外观
        </button>
        <button data-tab="help">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
          帮助
        </button>
        <button data-tab="project">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/></svg>
          项目
        </button>
      </div>
      <!-- 外观 Tab 内容 -->
      <div id="tabAppearance">
        <div class="settings-group">
          <div class="settings-row" id="modeLight" data-mode="light">
            <div class="icon-box" style="background:rgba(250,204,21,0.15);color:#facc15;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            </div>
            <span class="label">明亮模式</span>
            <div class="check"></div>
          </div>
          <div class="settings-row selected" id="modeDark" data-mode="dark">
            <div class="icon-box" style="background:rgba(99,102,241,0.15);color:#818cf8;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
            </div>
            <span class="label">暗黑模式</span>
            <div class="check"></div>
          </div>
        </div>
        <div class="settings-group">
          <div class="settings-row selected" id="colorRedRise" data-color="red-rise">
            <div class="icon-box" style="background:rgba(239,68,68,0.15);color:#f87171;">
              <svg viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px;"><circle cx="12" cy="12" r="6"/></svg>
            </div>
            <span class="label">红涨绿跌</span>
            <div class="check"></div>
          </div>
          <div class="settings-row" id="colorGreenRise" data-color="green-rise">
            <div class="icon-box" style="background:rgba(52,211,153,0.15);color:#34d399;">
              <svg viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px;"><circle cx="12" cy="12" r="6"/></svg>
            </div>
            <span class="label">绿涨红跌</span>
            <div class="check"></div>
          </div>
        </div>
      </div>
      <!-- 帮助 Tab 内容 -->
      <div id="tabHelp" style="display:none;">
        <div class="settings-group">
          <div class="help-item">色块大小反映流通市值</div>
          <div class="help-item">颜色深浅反映涨跌幅度</div>
          <div class="help-item">双击股票可跳转雪球查看详情；双击板块标题可筛选或清除筛选</div>
          <div class="help-item">滚轮放大查看细节</div>
          <div class="help-item">放大后按住鼠标拖动可平移画面</div>
          <div class="help-item">悬停时按 ↑/↓ 或 J/K 可滚动详情列表</div>
          <div class="help-item">全屏模式查看效果更佳</div>
        </div>
      </div>
      <!-- 项目 Tab 内容 -->
      <div id="tabProject" style="display:none;">
        <div class="settings-group">
          <div class="settings-row" style="cursor:default;">
            <div class="icon-box" style="background:rgba(100,116,139,0.15);color:#64748b;">
              <svg viewBox="0 0 24 24" fill="currentColor" style="width:16px;height:16px;"><path d="M12 .5C5.65.5.5 5.66.5 12.03c0 5.1 3.3 9.43 7.87 10.95.58.1.79-.25.79-.56l-.02-2.16c-3.2.7-3.88-1.55-3.88-1.55-.52-1.34-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.78 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.3 1.19-3.1-.12-.3-.52-1.5.11-3.13 0 0 .97-.31 3.19 1.18a10.9 10.9 0 0 1 5.8 0c2.21-1.5 3.18-1.18 3.18-1.18.64 1.63.24 2.83.12 3.13.74.8 1.18 1.84 1.18 3.1 0 4.43-2.69 5.4-5.25 5.68.41.36.78 1.08.78 2.18l-.01 3.23c0 .31.2.67.8.55A11.54 11.54 0 0 0 23.5 12.03C23.5 5.66 18.35.5 12 .5Z"/></svg>
            </div>
            <div style="flex:1;">
              <div class="label">GitHub 项目</div>
              <div style="font-size:12px;color:var(--text-secondary);">浏览源代码、提交反馈或收藏项目</div>
            </div>
          </div>
        </div>
        <a href="https://github.com/ColinYYCC/stock-matrix" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:12px;background:var(--glass-bg);color:var(--text-primary);text-decoration:none;font-size:13px;font-weight:600;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/></svg>
          github.com/ColinYYCC/stock-matrix
        </a>
      </div>
    </div>
  </div>
</div>
`;

// ============ JavaScript 逻辑 ============

const JS = `
// ===== 内联股票数据（1000 只，按市值降序） =====
const STOCK_DATA = __DATA__;

// ===== 常量 =====
const FLAT_THRESHOLD = 0.1;
const COLOR_LIMIT = 10;
const NEUTRAL_COLOR = "rgb(72, 79, 92)";

const MARKET_OPTIONS = [
  { key: "all", label: "A 股全图" },
  { key: "sse", label: "上证 A 股" },
  { key: "szse", label: "深证 A 股" },
  { key: "hs300", label: "沪深 300" },
  { key: "zza500", label: "中证 A500" },
  { key: "cyb", label: "创业板" },
  { key: "kcb", label: "科创板" },
];

const PERIOD_LABELS = { day: "当日涨跌", week: "近 5 日涨跌", month: "近 20 日涨跌", year: "今年以来" };
const PERIOD_COMPACT = { day: "日", week: "周", month: "月", year: "年" };

// ===== 状态 =====
let state = {
  market: "all",
  period: "day",
  boardFilter: "__all__",
  trendFilter: "__all__",
  sizeMode: "marketCap",
  displayMode: "dark",
  priceColorMode: "red-rise",
  settingsTab: "appearance",
};

// ===== 颜色映射（从 heatmap-color.ts 移植） =====
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getHeatColor(changePct, colorMode) {
  const amplitude = clamp(Math.abs(changePct) / COLOR_LIMIT, 0, 1);
  if (Math.abs(changePct) < FLAT_THRESHOLD) return NEUTRAL_COLOR;
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

function getBoardHeaderColor(changePct, colorMode) {
  const amplitude = clamp(Math.abs(changePct) / COLOR_LIMIT, 0, 1);
  if (Math.abs(changePct) < FLAT_THRESHOLD) return "rgb(51, 58, 70)";
  const isRise = changePct > 0;
  const shouldUseRed = colorMode === "red-rise" ? isRise : !isRise;
  if (shouldUseRed) {
    return "rgb(" + Math.round(120 + amplitude * 60) + ", " + Math.round(58 - amplitude * 12) + ", " + Math.round(66 - amplitude * 10) + ")";
  }
  return "rgb(" + Math.round(46 - amplitude * 10) + ", " + Math.round(102 + amplitude * 36) + ", " + Math.round(70 - amplitude * 6) + ")";
}

function getChangeTextClass(changePct, colorMode) {
  if (Math.abs(changePct) < FLAT_THRESHOLD) return "var(--text-secondary)";
  const isRise = changePct > 0;
  const shouldUseRed = colorMode === "red-rise" ? isRise : !isRise;
  return shouldUseRed ? "var(--rise-color)" : "var(--fall-color)";
}

function formatCompactChange(value) {
  const absValue = Math.abs(value);
  const digits = absValue >= 10 ? 1 : 2;
  let text = value.toFixed(digits);
  text = text.replace(/\\.0+$/, "").replace(/(\\.\\d*[1-9])0+$/, "$1");
  return value > 0 ? "+" + text + "%" : text + "%";
}

function formatCount(value) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatTurnoverAmount(value) {
  if (!Number.isFinite(value) || value <= 0) return "--";
  const withUnit = function(divisor, unit) {
    const scaled = value / divisor;
    const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
    let text = scaled.toFixed(digits);
    text = text.replace(/\\.0+$/, "").replace(/(\\.\\d*[1-9])0+$/, "$1");
    return text + " " + unit;
  };
  if (value >= 1000000000000) return withUnit(1000000000000, "万亿");
  if (value >= 100000000) return withUnit(100000000, "亿");
  if (value >= 10000) return withUnit(10000, "万");
  return value.toFixed(0);
}

function formatPrice(value) {
  return value.toFixed(value >= 100 ? 1 : 2);
}

function formatChange(value) {
  return value > 0 ? "+" + value.toFixed(2) + "%" : value.toFixed(2) + "%";
}

// ===== 二分平衡树图布局（从 treemap.ts 移植） =====
function sortTreemapItems(items) {
  return items.filter(function(e) { return e.value > 0; }).sort(function(a, b) { return b.value - a.value; });
}

function totalTreemapValue(items) {
  let total = 0;
  for (const entry of items) total += entry.value;
  return total;
}

function findBalancedSplitIndex(items) {
  if (items.length <= 1) return items.length;
  const target = totalTreemapValue(items) / 2;
  let cumulative = 0;
  let bestIndex = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < items.length; i++) {
    cumulative += items[i - 1].value;
    const diff = Math.abs(target - cumulative);
    if (diff < bestDiff) { bestDiff = diff; bestIndex = i; }
  }
  return bestIndex;
}

function splitBounds(bounds, ratio) {
  if (bounds.width >= bounds.height) {
    const leftWidth = bounds.width * ratio;
    return {
      first: { x: bounds.x, y: bounds.y, width: leftWidth, height: bounds.height },
      second: { x: bounds.x + leftWidth, y: bounds.y, width: Math.max(0, bounds.width - leftWidth), height: bounds.height }
    };
  }
  const topHeight = bounds.height * ratio;
  return {
    first: { x: bounds.x, y: bounds.y, width: bounds.width, height: topHeight },
    second: { x: bounds.x, y: bounds.y + topHeight, width: bounds.width, height: Math.max(0, bounds.height - topHeight) }
  };
}

function insetRect(rect, gap) {
  const inset = gap / 2;
  return { x: rect.x + inset, y: rect.y + inset, width: Math.max(0, rect.width - gap), height: Math.max(0, rect.height - gap), item: rect.item };
}

function binaryTreemap(items, x, y, width, height, gap) {
  gap = gap || 0;
  const sortedItems = sortTreemapItems(items);
  function layout(entries, bounds) {
    if (entries.length === 0 || bounds.width <= 1 || bounds.height <= 1) return [];
    if (entries.length === 1) {
      return [insetRect({ item: entries[0].item, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }, gap)];
    }
    const splitIndex = findBalancedSplitIndex(entries);
    const firstEntries = entries.slice(0, splitIndex);
    const secondEntries = entries.slice(splitIndex);
    if (firstEntries.length === 0 || secondEntries.length === 0) {
      return entries.map(function(entry, index) {
        return insetRect({ item: entry.item, x: bounds.x, y: bounds.y + (bounds.height / entries.length) * index, width: bounds.width, height: bounds.height / entries.length }, gap);
      });
    }
    const total = totalTreemapValue(entries);
    const firstRatio = totalTreemapValue(firstEntries) / total;
    const parts = splitBounds(bounds, firstRatio);
    return layout(firstEntries, parts.first).concat(layout(secondEntries, parts.second));
  }
  return layout(sortedItems, { x: x, y: y, width: width, height: height }).filter(function(r) { return r.width > 1 && r.height > 1; });
}

// ===== 按二级行业分组 =====
function groupStocksBySubBoard(stocks) {
  const map = {};
  for (const stock of stocks) {
    const key = stock.sb || stock.b;
    if (!map[key]) map[key] = [];
    map[key].push(stock);
  }
  return Object.keys(map).map(function(name) {
    const children = map[name];
    return {
      name: name,
      value: children.reduce(function(s, c) { return s + c.v; }, 0),
      children: children.slice().sort(function(a, b) { return b.v - a.v; })
    };
  }).sort(function(a, b) { return b.value - a.value; });
}

// ===== 加权平均涨跌幅 =====
function weightedAverageChange(stocks) {
  let weightedSum = 0, totalValue = 0;
  for (const stock of stocks) {
    weightedSum += stock.ch * stock.v;
    totalValue += stock.v;
  }
  return totalValue <= 0 ? 0 : weightedSum / totalValue;
}

// ===== 筛选数据 =====
function filterStocks() {
  let stocks = STOCK_DATA.slice();

  // 市场筛选（根据股票代码前缀模拟）
  if (state.market === "sse") stocks = stocks.filter(function(s) { return s.c.indexOf("6") === 0 || s.c.indexOf("9") === 0; });
  else if (state.market === "szse") stocks = stocks.filter(function(s) { return s.c.indexOf("0") === 0 || s.c.indexOf("3") === 0; });
  else if (state.market === "hs300") stocks = stocks.slice(0, 300);
  else if (state.market === "zza500") stocks = stocks.slice(0, 500);
  else if (state.market === "cyb") stocks = stocks.filter(function(s) { return s.c.indexOf("3") === 0; });
  else if (state.market === "kcb") stocks = stocks.filter(function(s) { return s.c.indexOf("688") === 0; });

  // 涨跌筛选
  if (state.trendFilter === "__rising__") stocks = stocks.filter(function(s) { return s.ch > FLAT_THRESHOLD; });
  else if (state.trendFilter === "__falling__") stocks = stocks.filter(function(s) { return s.ch < -FLAT_THRESHOLD; });

  // 板块筛选
  if (state.boardFilter !== "__all__") stocks = stocks.filter(function(s) { return s.b === state.boardFilter; });

  return stocks;
}

// ===== 渲染热力图 =====
function renderHeatmap() {
  const canvas = document.getElementById("heatmapCanvas");
  const area = document.getElementById("heatmapArea");
  canvas.innerHTML = "";

  const width = area.clientWidth;
  const height = area.clientHeight;
  if (width < 10 || height < 10) return;

  const stocks = filterStocks();
  if (stocks.length === 0) return;

  // 按一级行业分组
  const boardMap = {};
  for (const stock of stocks) {
    if (!boardMap[stock.b]) boardMap[stock.b] = [];
    boardMap[stock.b].push(stock);
  }
  const boards = Object.keys(boardMap).map(function(name) {
    const children = boardMap[name];
    return { name: name, value: children.reduce(function(s, c) { return s + c.v; }, 0), children: children };
  }).sort(function(a, b) { return b.value - a.value; });

  // 计算板块布局
  const boardBoxes = binaryTreemap(
    boards.map(function(b) { return { item: b, value: b.value }; }),
    0, 0, width, height, 4
  );

  for (const boardBox of boardBoxes) {
    const boardChangePct = weightedAverageChange(boardBox.item.children);
    const titleHeight = boardBox.width < 84 || boardBox.height < 54 ? 0 : clamp(Math.round(Math.min(Math.max(boardBox.height * 0.09, 14), 24)), 12, 24);
    const padding = boardBox.width > 110 && boardBox.height > 90 ? 3 : 2;
    const contentX = boardBox.x + padding;
    const contentY = boardBox.y + titleHeight + padding;
    const contentWidth = Math.max(0, boardBox.width - padding * 2);
    const contentHeight = Math.max(0, boardBox.height - titleHeight - padding * 2);

    // 板块标题
    if (titleHeight > 0) {
      const title = document.createElement("div");
      title.className = "board-title";
      title.style.left = boardBox.x + "px";
      title.style.top = boardBox.y + "px";
      title.style.width = boardBox.width + "px";
      title.style.height = titleHeight + "px";
      title.style.background = getBoardHeaderColor(boardChangePct, state.priceColorMode);
      title.textContent = boardBox.item.name;
      canvas.appendChild(title);
    }

    if (contentWidth <= 2 || contentHeight <= 2) continue;

    // 按二级行业分组
    const subBoards = groupStocksBySubBoard(boardBox.item.children);
    const shouldNestSubBoards = subBoards.length > 1;

    let stockBoxes;
    if (!shouldNestSubBoards) {
      stockBoxes = binaryTreemap(
        boardBox.item.children.map(function(s) { return { item: s, value: s.v }; }),
        contentX, contentY, contentWidth, contentHeight, 1.5
      );
    } else {
      const subBoardBoxes = binaryTreemap(
        subBoards.map(function(sb) { return { item: sb, value: sb.value }; }),
        contentX, contentY, contentWidth, contentHeight,
        boardBox.width > 96 && boardBox.height > 72 ? 2 : 1
      );
      stockBoxes = [];
      for (const subBox of subBoardBoxes) {
        const subTitleHeight = subBox.width < 52 || subBox.height < 34 ? 0 : clamp(Math.round(Math.min(Math.max(subBox.height * 0.11, 10), 18)), 9, 18);
        const subPadding = subBox.width > 82 && subBox.height > 56 ? 2 : 1;
        const subContentX = subBox.x + subPadding;
        const subContentY = subBox.y + subTitleHeight + subPadding;
        const subContentWidth = Math.max(0, subBox.width - subPadding * 2);
        const subContentHeight = Math.max(0, subBox.height - subTitleHeight - subPadding * 2);

        if (subTitleHeight > 0) {
          const subTitle = document.createElement("div");
          subTitle.className = "board-title";
          subTitle.style.left = subBox.x + "px";
          subTitle.style.top = subBox.y + "px";
          subTitle.style.width = subBox.width + "px";
          subTitle.style.height = subTitleHeight + "px";
          subTitle.style.fontSize = "9px";
          subTitle.style.background = getBoardHeaderColor(subBox.item.children[0].ch, state.priceColorMode);
          subTitle.textContent = subBox.item.name;
          canvas.appendChild(subTitle);
        }

        if (subContentWidth > 2 && subContentHeight > 2) {
          const boxes = binaryTreemap(
            subBox.item.children.map(function(s) { return { item: s, value: s.v }; }),
            subContentX, subContentY, subContentWidth, subContentHeight,
            subBox.width > 56 && subBox.height > 38 ? 1 : 0.5
          );
          stockBoxes = stockBoxes.concat(boxes);
        }
      }
    }

    // 渲染色块
    for (const box of stockBoxes) {
      const stock = box.item;
      const block = document.createElement("div");
      block.className = "stock-block";
      block.style.left = box.x + "px";
      block.style.top = box.y + "px";
      block.style.width = box.width + "px";
      block.style.height = box.height + "px";
      block.style.background = getHeatColor(stock.ch, state.priceColorMode);
      block.title = stock.n + " (" + stock.c + ") " + formatPrice(stock.p) + " " + formatChange(stock.ch);

      // 根据色块大小决定显示什么文字
      if (box.width >= 50 && box.height >= 28) {
        const nameEl = document.createElement("div");
        nameEl.className = "name";
        nameEl.textContent = stock.n;
        block.appendChild(nameEl);
        if (box.width >= 60 && box.height >= 40) {
          const changeEl = document.createElement("div");
          changeEl.className = "change";
          changeEl.textContent = formatCompactChange(stock.ch);
          block.appendChild(changeEl);
        }
      } else if (box.width >= 30 && box.height >= 16) {
        const nameEl = document.createElement("div");
        nameEl.className = "name";
        nameEl.style.fontSize = "9px";
        nameEl.textContent = stock.n;
        block.appendChild(nameEl);
      }

      canvas.appendChild(block);
    }
  }
}

// ===== 渲染侧边栏 =====
function renderSidebar() {
  // 市场列表
  const marketList = document.getElementById("marketList");
  marketList.innerHTML = "";
  for (const option of MARKET_OPTIONS) {
    const btn = document.createElement("button");
    btn.className = "market-btn" + (state.market === option.key ? " active" : "");
    const label = document.createElement("span");
    label.textContent = option.label;
    const change = document.createElement("span");
    change.className = "change";
    // 计算该市场的加权涨跌
    let marketStocks = STOCK_DATA;
    if (option.key === "sse") marketStocks = STOCK_DATA.filter(function(s) { return s.c.indexOf("6") === 0; });
    else if (option.key === "szse") marketStocks = STOCK_DATA.filter(function(s) { return s.c.indexOf("0") === 0 || s.c.indexOf("3") === 0; });
    else if (option.key === "hs300") marketStocks = STOCK_DATA.slice(0, 300);
    else if (option.key === "zza500") marketStocks = STOCK_DATA.slice(0, 500);
    else if (option.key === "cyb") marketStocks = STOCK_DATA.filter(function(s) { return s.c.indexOf("3") === 0; });
    else if (option.key === "kcb") marketStocks = STOCK_DATA.filter(function(s) { return s.c.indexOf("688") === 0; });
    const avgChange = weightedAverageChange(marketStocks);
    change.textContent = formatCompactChange(avgChange);
    change.style.color = getChangeTextClass(avgChange, state.priceColorMode);
    btn.appendChild(label);
    btn.appendChild(change);
    btn.onclick = function() { state.market = option.key; renderAll(); };
    marketList.appendChild(btn);
  }

  // 板块筛选下拉框
  const boardFilter = document.getElementById("boardFilter");
  const currentValue = boardFilter.value;
  boardFilter.innerHTML = '<option value="__all__">全部板块</option>';
  const boards = {};
  for (const s of STOCK_DATA) { boards[s.b] = true; }
  Object.keys(boards).sort().forEach(function(name) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    boardFilter.appendChild(opt);
  });
  boardFilter.value = currentValue;

  // 市场概览
  const stocks = filterStocks();
  let rise = 0, flat = 0, fall = 0;
  for (const s of stocks) {
    if (s.ch > FLAT_THRESHOLD) rise++;
    else if (s.ch < -FLAT_THRESHOLD) fall++;
    else flat++;
  }
  document.getElementById("riseCount").textContent = formatCount(rise);
  document.getElementById("flatCount").textContent = formatCount(flat);
  document.getElementById("fallCount").textContent = formatCount(fall);

  // 成交额（用市值模拟一个数字）
  const totalValue = stocks.reduce(function(s, c) { return s + c.v; }, 0);
  const mockTurnover = totalValue * 0.02;
  document.getElementById("turnoverAmount").textContent = formatTurnoverAmount(mockTurnover);
  const mockDelta = mockTurnover * 0.15;
  document.getElementById("turnoverDelta").textContent = formatTurnoverAmount(Math.abs(mockDelta));
  const trendEl = document.getElementById("turnoverTrend");
  trendEl.textContent = "放量";
  trendEl.style.color = state.priceColorMode === "red-rise" ? "var(--rise-color)" : "var(--fall-color)";

  // 更新时间
  document.getElementById("updateTime").textContent = new Date().toLocaleTimeString("zh-CN");

  // 周期标签
  document.getElementById("periodLabel").textContent = PERIOD_LABELS[state.period];
}

// ===== 渲染图例渐变条 =====
function renderLegend() {
  const steps = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
  const gradient = steps.map(function(step, index) {
    const position = (index / (steps.length - 1)) * 100;
    return getHeatColor(step, state.priceColorMode) + " " + position.toFixed(2) + "%";
  }).join(", ");
  document.getElementById("legendGradient").style.background = "linear-gradient(to right, " + gradient + ")";

  const ticks = [-4, -2, 0, 2, 4];
  document.getElementById("legendTicks").innerHTML = ticks.map(function(t) {
    return "<span>" + (t === 0 ? "0" : formatCompactChange(t)) + "</span>";
  }).join("");
}

// ===== 渲染全部 =====
function renderAll() {
  showLoading(true);
  // 用 setTimeout 让浏览器先画出 loading 遮罩
  setTimeout(function() {
    renderSidebar();
    renderHeatmap();
    renderLegend();
    showLoading(false);
  }, 50);
}

function showLoading(show) {
  document.getElementById("loadingOverlay").style.display = show ? "flex" : "none";
}

// ===== 事件绑定 =====

// 分段控件通用处理
function setupSegmented(id, stateKey, onChange) {
  const container = document.getElementById(id);
  const buttons = container.querySelectorAll("button");
  buttons.forEach(function(btn) {
    btn.onclick = function() {
      buttons.forEach(function(b) { b.classList.remove("active"); });
      btn.classList.add("active");
      state[stateKey] = btn.dataset.value;
      if (onChange) onChange();
      renderAll();
    };
  });
}

setupSegmented("trendFilter", "trendFilter");
setupSegmented("sizeMode", "sizeMode");
setupSegmented("periodFilter", "period");

// 板块筛选
document.getElementById("boardFilter").onchange = function(e) {
  state.boardFilter = e.target.value;
  renderAll();
};

// 重置视图
document.getElementById("resetViewBtn").onclick = function() {
  renderHeatmap();
};

// 全屏
document.getElementById("fullscreenBtn").onclick = function() {
  const area = document.getElementById("heatmapArea");
  if (!document.fullscreenElement) {
    area.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
};

// 设置面板
document.getElementById("settingsBtn").onclick = function() {
  document.getElementById("settingsOverlay").classList.add("open");
};
document.getElementById("settingsCloseBtn").onclick = function() {
  document.getElementById("settingsOverlay").classList.remove("open");
};
document.getElementById("settingsOverlay").onclick = function(e) {
  if (e.target === this) this.classList.remove("open");
};

// 设置面板 Tab 切换
document.getElementById("settingsTabs").querySelectorAll("button").forEach(function(btn) {
  btn.onclick = function() {
    document.getElementById("settingsTabs").querySelectorAll("button").forEach(function(b) { b.classList.remove("active"); });
    btn.classList.add("active");
    state.settingsTab = btn.dataset.tab;
    document.getElementById("tabAppearance").style.display = state.settingsTab === "appearance" ? "block" : "none";
    document.getElementById("tabHelp").style.display = state.settingsTab === "help" ? "block" : "none";
    document.getElementById("tabProject").style.display = state.settingsTab === "project" ? "block" : "none";
  };
});

// 显示模式切换
document.getElementById("modeLight").onclick = function() { setDisplayMode("light"); };
document.getElementById("modeDark").onclick = function() { setDisplayMode("dark"); };

function setDisplayMode(mode) {
  state.displayMode = mode;
  document.documentElement.setAttribute("data-theme", mode);
  document.getElementById("modeLight").classList.toggle("selected", mode === "light");
  document.getElementById("modeDark").classList.toggle("selected", mode === "dark");
  // 更新主题图标
  const icon = document.getElementById("themeIcon");
  if (mode === "light") {
    icon.innerHTML = '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>';
  } else {
    icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
  }
}

// 涨跌颜色切换
document.getElementById("colorRedRise").onclick = function() { setPriceColorMode("red-rise"); };
document.getElementById("colorGreenRise").onclick = function() { setPriceColorMode("green-rise"); };

function setPriceColorMode(mode) {
  state.priceColorMode = mode;
  document.getElementById("colorRedRise").classList.toggle("selected", mode === "red-rise");
  document.getElementById("colorGreenRise").classList.toggle("selected", mode === "green-rise");
  // 更新 CSS 变量
  if (mode === "red-rise") {
    document.documentElement.style.setProperty("--rise-color", "#f87171");
    document.documentElement.style.setProperty("--fall-color", "#34d399");
  } else {
    document.documentElement.style.setProperty("--rise-color", "#34d399");
    document.documentElement.style.setProperty("--fall-color", "#f87171");
  }
  renderAll();
}

// 主题切换按钮
document.getElementById("themeToggle").onclick = function() {
  setDisplayMode(state.displayMode === "dark" ? "light" : "dark");
};

// 分享按钮（模拟）
document.getElementById("shareBtn").onclick = function() {
  alert("截图分享功能在预览版中暂不可用，完整版支持生成并下载热力图截图。");
};

// 窗口大小变化时重新渲染
let resizeTimer;
window.addEventListener("resize", function() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderHeatmap, 200);
});

// ===== 启动 =====
renderAll();
`;

// ============ 组装最终 HTML ============

// 把 JS 里的 __DATA__ 占位符替换成实际股票数据
const JS_WITH_DATA = JS.replace("__DATA__", JSON.stringify(stockData));

const finalHTML = `<!DOCTYPE html>
<html lang="zh-CN" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>股市矩阵 · iOS 26 Liquid Glass 预览</title>
  <style>${CSS}</style>
</head>
<body>
${HTML}
<script>${JS_WITH_DATA}</script>
</body>
</html>
`;

// 写入 HTML 文件
const outputPath = path.join(__dirname, "..", "ios26-preview.html");
fs.writeFileSync(outputPath, finalHTML);
console.log("HTML 预览文件已生成:", outputPath);
console.log("文件大小:", (finalHTML.length / 1024).toFixed(1), "KB");
