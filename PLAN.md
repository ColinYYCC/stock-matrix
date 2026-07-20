# 股市矩阵 — 设计与实现计划

> 股市矩阵的设计与实现计划。
> 自主设计与实现全部代码。

---

## 一、技术栈

| 维度 | 选型 | 版本 |
|------|------|------|
| 框架 | Next.js (App Router) | 最新稳定版 |
| UI | React | 最新稳定版 |
| 绘制 | Canvas 2D | 浏览器原生 |
| 样式 | Tailwind CSS v4 | `@import "tailwindcss"` |
| 包管理 | pnpm | latest |
| 图标 | lucide-react | latest |
| 通知 | sonner | latest |
| 类名合并 | clsx + tailwind-merge | latest |
| 部署 | Vercel Serverless | 免费版 |

---

## 二、数据源架构

### 三级容灾

```
东方财富(主) → 新浪财经(降级) → 内置 JSON 快照(兜底)
```

| 数据 | 数据源 | 接口 | 说明 |
|------|--------|------|------|
| 个股实时行情 | 东方财富 | `push2.eastmoney.com/api/qt/ulist.np/get` | 多周期涨跌(f3/f109/f110/f25)、成交额(f6)、最新价(f2)、昨收(f18) |
| 个股实时行情(降级) | 新浪 | `hq.sinajs.cn/list=` | 仅当日涨跌，用 `TextDecoder('latin1')` 解码（仅解析数字字段，不需要中文名） |
| 涨跌家数分布 | 同花顺 | `dq.10jqka.com.cn/fuyao/up_down_distribution` | 全市场涨/平/跌家数 |
| 成交额统计 | 同花顺 | `dq.10jqka.com.cn/fuyao/market_analysis_api` | 今日+昨日成交额+变化率 |
| 指数行情 | 东方财富/新浪 | 同个股接口，查指数代码 | 上证、深证、沪深300等 |

### 市场范围

| Key | 含义 | 筛选逻辑 |
|-----|------|----------|
| `all` | 全 A | 全部 |
| `sse` | 上证 A 股 | exchange === "SH" |
| `szse` | 深证 A 股 | exchange === "SZ" |
| `hs300` | 沪深 300 | 预置真实成分股列表（AKShare `index_stock_cons` 拉取） |
| `zza500` | 中证 A500 | 预置真实成分股列表（AKShare `index_stock_cons` 拉取） |
| `cyb` | 创业板 | 深市 300 开头 |
| `kcb` | 科创板 | 沪市 688 开头 |

### 涨跌周期

| Key | 含义 | 东方财富字段 |
|-----|------|-------------|
| `day` | 当日涨跌 | f3 |
| `week` | 近 5 日 | f109 |
| `month` | 近 20 日 | f110 (fallback f24) |
| `year` | 年初至今 | f25 |

### 缓存策略

缓存分三层，**CDN 缓存是主力**，模块缓存只是锦上添花：

| 层级 | 机制 | 可靠性 | 说明 |
|------|------|--------|------|
| CDN 缓存 (主力) | `Cache-Control: s-maxage=8, stale-while-revalidate=30` | ✅ 可靠 | Vercel CDN 边缘节点缓存，90%+ 请求命中后直接返回 |
| 模块级缓存 (辅助) | `quoteCache` + 8s TTL + Promise 去重 | ⚠️ 仅热实例 | Serverless 实例热时避免重复拉取，冷启动时丢失 |
| 数据源 (底层) | 东方财富 → 新浪 → 内置 JSON | ✅ 三级容灾 | 任何一层失败自动降级 |

### 批量请求

- 东方财富每批：300 只（5443 / 300 ≈ 19 批，Promise.all 并发）
- 新浪每批：220 只（降级时使用）
- 每批 fetch 加 5 秒超时（`AbortSignal.timeout(5000)`），超时快速降级
- 完整性校验：返回数量 < 基线 90% 时降级

---

## 三、核心架构

```
┌──────────────────────────────────────────────┐
│                   浏览器端                     │
│  ┌──────────┐  ┌───────────────────────────┐ │
│  │ 侧边栏    │  │   Canvas 热力图           │ │
│  │ 市场范围  │  │  ┌──────────────────────┐ │ │
│  │ 涨跌周期  │  │  │ 一级板块 Treemap      │ │ │
│  │ 板块筛选  │  │  │  ┌────────────────┐  │ │ │
│  │ 涨跌筛选  │  │  │  │ 二级板块 Treemap │  │ │ │
│  │ 面积指标  │  │  │  │  ┌──────────┐  │  │ │ │
│  │ 设置面板  │  │  │  │  │ 个股色块  │  │  │ │ │
│  └──────────┘  │  │  │  └──────────┘  │  │ │ │
│                │  │  └────────────────┘  │ │ │
│                │  └──────────────────────┘ │ │
│                │  悬浮详情面板 + 底部图例    │ │
│                └───────────────────────────┘ │
└──────────────────────────────────────────────┘
            │ fetch (8s 轮询，页面可见时)
            ▼
┌──────────────────────────────────────────────┐
│            Next.js API Routes                │
│  /api/heatmap/treemap   → 板块分组 + 个股     │
│  /api/heatmap/quotes    → 实时行情快照        │
│  /api/heatmap/overview  → 市场指数概览        │
└──────────────────────────────────────────────┘
            │ fetch (8s 服务端缓存)
            ▼
┌──────────────────────────────────────────────┐
│            服务端数据层                       │
│  东方财富(主) → 新浪(降级) → 本地JSON(兜底)   │
└──────────────────────────────────────────────┘
```

---

## 四、文件结构

```
stock-matrix/
├── scripts/
│   └── fetch_stocks.py              # Python + AKShare 一次性抓取 → JSON（不影响运行时）
├── src/
│   ├── app/
│   │   ├── api/heatmap/
│   │   │   ├── treemap/route.ts      # 热力图树图数据 API
│   │   │   ├── quotes/route.ts       # 实时行情快照 API
│   │   │   └── overview/route.ts     # 市场概览 API
│   │   ├── globals.css               # 全局样式 + CSS 变量主题
│   │   ├── layout.tsx                # 根布局 (SEO + 主题初始化脚本)
│   │   └── page.tsx                  # 首页入口
│   ├── components/
│   │   ├── market-heatmap.tsx        # 主组件 (状态管理 + 事件 + JSX)
│   │   ├── sidebar.tsx               # 侧边栏 (市场/周期/筛选)
│   │   ├── inspector.tsx             # 悬浮详情面板
│   │   ├── color-legend.tsx          # 底部涨跌图例
│   │   ├── settings-drawer.tsx       # 设置面板 (主题/颜色/语言)
│   │   ├── mobile-stock-sheet.tsx    # 移动端底部弹出面板
│   │   └── ui/button.tsx             # 通用按钮
│   ├── lib/
│   │   ├── data/
│   │   │   ├── stocks-fallback.json  # 内置样本快照 (~5400 只)
│   │   │   ├── subboards.json        # 二级行业映射 (~5400 条)
│   │   │   └── index-constituents.json  # HS300/A500 真实成分股列表
│   │   ├── market-data.ts            # 数据获取 + 三级容灾 + 缓存
│   │   ├── treemap.ts                # 二分平衡树图布局算法
│   │   ├── heatmap-color.ts          # 涨跌幅 → RGB 颜色映射
│   │   ├── canvas-render.ts          # Canvas 绘制函数集合
│   │   ├── format.ts                 # 格式化工具 (价格/涨跌/成交额)
│   │   ├── i18n.ts                   # 中英文国际化
│   │   └── utils.ts                  # cn() 类名合并
│   ├── hooks/
│   │   ├── use-poll-while-visible.ts # 页面可见时轮询
│   │   ├── use-is-mobile.ts          # 移动端检测
│   │   └── use-canvas-interaction.ts # Canvas 缩放/拖拽/触摸交互
│   └── types/
│       └── heatmap.ts                # 共享类型定义
├── public/
│   ├── icon.svg                      # 站点图标
│   └── logo.svg                     # 品牌 Logo
├── package.json
├── tsconfig.json
├── next.config.ts
├── eslint.config.mjs
├── postcss.config.mjs
└── PLAN.md                           # 本文件
```

### 与原项目的关键差异

| 改进点 | 原项目 | 仿做改进 |
|--------|--------|----------|
| 组件拆分 | 单文件 4558 行 | 拆分为 6 个组件 + 3 个 hooks，单文件 ≤ 800 行 |
| 算法独立 | 树图布局混在组件里 | `treemap.ts` 独立模块，可单测 |
| 颜色独立 | 颜色函数混在组件里 | `heatmap-color.ts` 独立模块 |
| 绘制独立 | Canvas 绘制在 useEffect 里 | `canvas-render.ts` 独立函数集合 |
| 类型共享 | 类型定义分散 | `types/heatmap.ts` 集中定义 |
| 批量大小 | 180 只/批 | 300 只/批，批次数从 31 降到 19 |
| fetch 超时 | 无超时保护 | 每批加 `AbortSignal.timeout(5000)`，防卡死快速降级 |
| HS300/A500 | 市值排序取前 N (近似值) | AKShare 拉取真实成分股，预置在 JSON 中 |
| 行业分类数据 | JSON 直接提交，无抓取脚本 | Python + AKShare 脚本一键生成，数据可更新 |
| Canvas 渲染 | 单 Canvas 全量重绘 | 双层 Canvas：底层(色块+文字) + 上层(hover 高亮)，hover 不触发全量重绘 |
| 新浪编码 | `Buffer.from().toString('latin1')` | `new TextDecoder('latin1').decode()`，Web 标准 API，兼容 Edge Runtime |
| 交互抽象 | 鼠标/触摸事件内联 | `use-canvas-interaction` hook 封装 |

---

## 五、核心算法

### 5.1 二分平衡树图布局

```typescript
// 输入：带 value 的 items 列表 + 矩形边界
// 输出：每个 item 对应的矩形坐标
function binaryTreemap<T>(items: TreemapInput<T>[], x, y, width, height, gap): TreemapRect<T>[] {
  // 1. 按 value 降序排列
  const sorted = items.sort((a, b) => b.value - a.value);

  function layout(entries: TreemapInput<T>[], bounds: Bounds): TreemapRect<T>[] {
    if (entries.length === 0) return [];
    if (entries.length === 1) return [{ item: entries[0].item, ...bounds }];

    // 2. 找累计 value 最接近总量 50% 的分割点
    const splitIdx = findBalancedSplitIndex(entries);
    const firstHalf = entries.slice(0, splitIdx);
    const secondHalf = entries.slice(splitIdx);

    // 3. 按比例沿长边方向切割
    const ratio = totalValue(firstHalf) / totalValue(entries);
    const { first, second } = splitBounds(bounds, ratio);

    // 4. 递归处理两半
    return [...layout(firstHalf, first), ...layout(secondHalf, second)];
  }

  return layout(sorted, { x, y, width, height });
}
```

### 5.2 颜色映射

```typescript
// 涨跌幅 → RGB 颜色
// 限制 ±10% 映射到最深色，平盘(|change| < 0.1%)为灰色
function getHeatColor(changePct: number, colorMode: "red-rise" | "green-rise"): string {
  const limit = 10;
  const neutral = "rgb(72, 79, 92)";
  if (Math.abs(changePct) < 0.1) return neutral;

  const amplitude = Math.min(Math.abs(changePct) / limit, 0, 1);
  const isRise = changePct > 0;
  const shouldUseRed = colorMode === "red-rise" ? isRise : !isRise;

  // RGB 插值：红色 (140→255, 72→30, 76→38) 或 绿色 (40→26, 126→214, 76→66)
  // ...
}
```

### 5.3 Canvas 绘制流程

```
1. 高清渲染设置 (devicePixelRatio)
2. 绘制背景渐变
3. context.scale(pixelRatio).translate(view.x, view.y).scale(view.scale)
4. 遍历一级板块 → 填充板块底色
5. 遍历二级板块 → 填充子板块底色
6. 遍历个股 → 填充涨跌色块 + 绘制文字标签(按大小分级)
7. 遍历二级板块 → 绘制标题栏 + 边框
8. 遍历一级板块 → 绘制标题栏 + 边框
9. 绘制高亮选中色块(双层描边)
```

### 5.4 文字标签分级

| 模式 | 条件(显示像素) | 内容 |
|------|----------------|------|
| Large | width ≥ 108px && height ≥ 58px | 股票名称 + 涨跌幅 + 价格(居中) |
| Stacked | width ≥ 28px && height ≥ 20px | 股票名称(上) + 涨跌幅(下) |
| Inline | width ≥ 24px && height ≥ 10px | 股票名称或涨跌幅(单行) |
| Hidden | 更小 | 不绘制文字 |

### 5.5 命中检测

- `pickStock(x, y)`：从后往前遍历 stockRects，返回第一个命中的
- `pickBoard(x, y)`：同上遍历 boardRects
- `pickBoardTitle(x, y)`：仅检查 titleHeight 区域
- `pickSubBoard(x, y)` / `pickSubBoardTitle(x, y)`：同上

---

## 六、功能清单与开发计划

### 第一阶段：MVP（第 1-6 天）

| 顺序 | 任务 | 产出 | 天数 |
|------|------|------|------|
| 1 | 项目搭建 | Next.js + Tailwind + 基础配置 | 0.5 |
| 2 | 股票基础数据抓取 | stocks-fallback.json + subboards.json | 0.5 |
| 3 | 数据层 + 三级容灾 | market-data.ts | 1 |
| 4 | API Routes | treemap / quotes / overview | 1 |
| 5 | 类型定义 + 树图算法 | types/heatmap.ts + treemap.ts | 0.5 |
| 6 | 颜色映射 | heatmap-color.ts | 0.3 |
| 7 | Canvas 绘制 | canvas-render.ts | 1.5 |
| 8 | 主组件骨架 + 市场切换 | market-heatmap.tsx + sidebar.tsx | 0.5 |
| 9 | 涨跌周期切换 | 侧边栏 + 数据刷新 | 0.3 |
| 10 | 悬浮详情面板 | inspector.tsx | 0.5 |
| 11 | 滚轮缩放 + 拖拽 | use-canvas-interaction.ts | 0.5 |
| 12 | 暗色主题 + 部署 | globals.css + Vercel | 0.3 |

### 第二阶段：完整功能（第 7-10 天）

| 顺序 | 任务 | 产出 | 天数 |
|------|------|------|------|
| 13 | 一级板块筛选 | 板块标题双击切换 | 0.5 |
| 14 | 二级板块嵌套 | groupStocksBySubBoard | 0.5 |
| 15 | 涨跌筛选 | 上涨/下跌过滤 | 0.5 |
| 16 | 面积指标切换 | 流通市值 ↔ 成交额 | 0.5 |
| 17 | 双击跳转雪球 | toXueqiuSymbol | 0.2 |
| 18 | 亮色主题 | 深色/浅色切换 + localStorage | 0.5 |
| 19 | 全屏模式 | 全屏 + Esc 退出 | 0.3 |
| 20 | 8 秒自动轮询 | use-poll-while-visible.ts | 0.3 |
| 21 | 移动端适配 | 触摸交互 + mobile-stock-sheet.tsx | 1 |

### 第三阶段：增强功能（第 11-13 天，可选）

| 顺序 | 任务 | 产出 | 天数 |
|------|------|------|------|
| 22 | 截图分享 | Canvas → PNG + 品牌水印 | 1 |
| 23 | 中英文 i18n | i18n.ts + 语言切换 | 0.5 |
| 24 | 主题颜色定制 | 红/绿/蓝/紫品牌色 | 0.3 |
| 25 | K 线图嵌入 | 悬浮面板分时/K线 | 0.5 |
| 26 | SEO + OG 图片 | metadata + 社交分享 | 0.3 |

---

## 七、已知风险与对策

| 风险 | 严重度 | 对策 |
|------|--------|------|
| Vercel Serverless 超时 (免费版 10s) | 低 | CDN `s-maxage` 缓存扛住 90%+ 流量；批量增大到 300 只/批（19 批）；每批加 5s 超时 |
| 模块级缓存在 Serverless 中不可靠 | 低 | CDN 缓存是主力（可靠）；模块缓存只是锦上添花（热实例上有效）。无需引入 KV |
| 行业分类数据获取 | 低 | 预置在 JSON 中，运行时不从 API 获取。Python + AKShare 脚本可一键更新 |
| Canvas 5400+ 色块重绘性能 | 中 | 双层 Canvas：底层(色块+文字，仅 data/zoom 变化时重绘) + 上层(hover 高亮，仅 hover 变化时重绘) |
| 数据源反爬 (IP 封禁/接口变更) | 低 | 三级容灾（东方财富 → 新浪 → 内置 JSON）+ 每批 5s 超时快速降级 |
| 新浪 API 编码 | 低 | 用 `new TextDecoder('latin1').decode()` 替代 `Buffer`，Web 标准 API，仅解析数字字段 |
| HS300/A500 成分股准确性 | 低 | 用 AKShare `index_stock_cons` 拉取真实成分股，预置在 JSON 中 |

---

## 八、Todo List

### Phase 1: MVP

- [ ] P1-1 初始化 Next.js 项目 (pnpm create next-app)
- [ ] P1-2 配置 Tailwind CSS v4 + PostCSS
- [ ] P1-3 配置 tsconfig.json 路径别名 (`@/*`)
- [ ] P1-4 配置 eslint + .gitignore
- [ ] P1-5 编写股票数据抓取脚本 (scripts/fetch_stocks.py，Python + AKShare)
  - [ ] 用 AKShare 拉取全 A 股列表 (代码/名称/交易所)
  - [ ] 用 AKShare 拉取申万一级行业分类 (31 个行业)
  - [ ] 用 AKShare 拉取申万二级行业分类
  - [ ] 用 AKShare 拉取沪深 300 真实成分股列表
  - [ ] 用 AKShare 拉取中证 A500 真实成分股列表
  - [ ] 从东方财富拉取总市值/流通市值
  - [ ] 导出 stocks-fallback.json
  - [ ] 导出 subboards.json
  - [ ] 导出 index-constituents.json (HS300/A500 成分股)
- [ ] P1-6 定义共享类型 (src/types/heatmap.ts)
  - [ ] MarketKey, HeatmapPeriodKey, MetricKey
  - [ ] StockSnapshot, HeatmapStockNode, HeatmapBoardNode
  - [ ] TreemapResponse, QuotesResponse, MarketOverviewResponse
- [ ] P1-7 实现数据层 (src/lib/market-data.ts)
  - [ ] 东方财富批量行情获取 (parseEastmoneyQuoteBatch，每批 300 只)
  - [ ] 新浪批量行情获取 (parseSinaQuoteBatch，用 TextDecoder('latin1') 替代 Buffer)
  - [ ] 每批 fetch 加 AbortSignal.timeout(5000) 超时保护
  - [ ] 同花顺涨跌家数 + 成交额获取
  - [ ] 三级容灾逻辑 (东方财富 → 新浪 → JSON)
  - [ ] 模块级缓存 + Promise 去重 (8s)
  - [ ] buildNodesFromStocks (按板块分组)
  - [ ] summarizeStocks (涨/平/跌统计)
  - [ ] filterStocks (市场范围筛选，HS300/A500 从预置 JSON 读取真实成分股)
  - [ ] getTreemapData / getQuoteData / getOverviewData
- [ ] P1-8 实现 API Routes
  - [ ] /api/heatmap/treemap (market + period 参数校验)
  - [ ] /api/heatmap/quotes (market + metric + period 参数校验)
  - [ ] /api/heatmap/overview (period 参数校验)
  - [ ] 统一错误处理 + Cache-Control 头
- [ ] P1-9 实现树图布局算法 (src/lib/treemap.ts)
  - [ ] TreemapInput / TreemapRect / Bounds 类型
  - [ ] sortTreemapItems (降序排列)
  - [ ] totalTreemapValue
  - [ ] findBalancedSplitIndex (累计 value 找中点)
  - [ ] splitBounds (沿长边按比例切割)
  - [ ] insetRect (留 gap)
  - [ ] binaryTreemap (递归布局)
- [ ] P1-10 实现颜色映射 (src/lib/heatmap-color.ts)
  - [ ] getHeatColor (涨跌幅 → RGB)
  - [ ] getBoardHeaderColor (板块标题色)
  - [ ] getLegendGradient (图例渐变 CSS)
  - [ ] getChangeTextClass (Tailwind 文字颜色类)
- [ ] P1-11 实现格式化工具 (src/lib/format.ts)
  - [ ] formatPrice / formatChange / formatCompactChange
  - [ ] formatTurnoverAmount (万/亿/万亿)
  - [ ] formatCount
  - [ ] shortenText / trimTrailingZeros
- [ ] P1-12 实现 Canvas 绘制 (src/lib/canvas-render.ts)
  - [ ] 高清渲染设置 (devicePixelRatio)
  - [ ] 背景渐变绘制
  - [ ] 板块底色绘制
  - [ ] 个股色块绘制 + 颜色填充
  - [ ] 文字标签绘制 (4 级分级: Large/Stacked/Inline/Hidden)
  - [ ] fitTextToWidth (二分查找截断)
  - [ ] fitFontSizeToWidth (按比例缩放字号)
  - [ ] drawClippedText (裁剪区域内绘制文字)
  - [ ] 板块标题栏 + 边框绘制
  - [ ] 双层 Canvas：底层(色块+文字) + 上层(hover 高亮描边)
  - [ ] 底层 useEffect 依赖项不含 hover 状态 (避免 hover 时全量重绘)
  - [ ] 上层 useEffect 仅依赖 highlightedStock (仅重绘高亮框)
- [ ] P1-13 实现交互 Hook (src/hooks/use-canvas-interaction.ts)
  - [ ] 滚轮缩放 (以鼠标位置为锚点，1x~3x)
  - [ ] 拖拽平移 (clampOffset 边界限制)
  - [ ] 坐标转换 (toWorldPoint / 屏幕坐标 → 世界坐标)
  - [ ] 命中检测 (pickStock / pickBoard / pickBoardTitle / pickSubBoard)
- [ ] P1-14 实现主组件骨架 (src/components/market-heatmap.tsx)
  - [ ] 状态: market / period / treemapData / quotes / loading / error
  - [ ] 状态: view (scale/x/y) / canvasSize
  - [ ] 状态: hoveredStockCode / hoveredBoardName
  - [ ] useEffect: 加载 treemap 数据 (market/period 变化时)
  - [ ] useEffect: Canvas 绘制 (layout/view 变化时)
  - [ ] useEffect: ResizeObserver 监听容器尺寸
  - [ ] useMemo: layout (binaryTreemap → stockRects/boardRects)
  - [ ] useMemo: visibleTreemapData (boardFilter + trendFilter)
  - [ ] onMouseMove / onMouseDown / onMouseUp / onMouseLeave
  - [ ] onWheel
  - [ ] JSX: 容器 + Canvas + 侧边栏 + 图例
- [ ] P1-15 实现侧边栏 (src/components/sidebar.tsx)
  - [ ] 市场范围切换 (7 个选项)
  - [ ] 涨跌周期切换 (4 个选项)
  - [ ] 最近刷新时间显示
  - [ ] 各市场指数涨跌概览
- [ ] P1-16 实现悬浮详情面板 (src/components/inspector.tsx)
  - [ ] 当前个股: 名称/价格/涨跌幅
  - [ ] 板块内个股列表 (按涨跌幅绝对值排序)
  - [ ] 面板智能定位 (优先板块右侧，空间不足切换左侧)
  - [ ] 键盘导航 (↑/↓/J/K/PageUp/PageDown/Home/End)
- [ ] P1-17 实现底部图例 (src/components/color-legend.tsx)
  - [ ] 涨跌渐变色条
  - [ ] 刻度标签 (-4% / -2% / 0 / +2% / +4%)
- [ ] P1-18 实现暗色主题
  - [ ] globals.css CSS 变量 (暗色)
  - [ ] layout.tsx 内联主题初始化脚本 (localStorage 读取)
  - [ ] heatmapCanvasThemes.dark 配色
- [ ] P1-19 部署到 Vercel
  - [ ] git push
  - [ ] Vercel 导入仓库
  - [ ] 验证 API 响应
  - [ ] 验证页面渲染

### Phase 2: 完整功能

- [ ] P2-1 一级板块筛选
  - [ ] 板块标题双击 → setBoardFilter
  - [ ] visibleTreemapData 中 applyBoardFilter
  - [ ] 筛选时重算涨跌统计
  - [ ] 筛选时重置视图 (scale=1, x=0, y=0)
- [ ] P2-2 二级板块嵌套
  - [ ] groupStocksBySubBoard (按 subBoardName 分组)
  - [ ] 板内有多个二级行业时嵌套一层 Treemap
  - [ ] 二级板块标题栏 + 边框
- [ ] P2-3 涨跌筛选
  - [ ] 上涨/下跌/全部 三选一
  - [ ] visibleTreemapData 中 applyTrendFilter
  - [ ] 筛选时重算涨跌统计
- [ ] P2-4 面积指标切换
  - [ ] 流通市值 ↔ 实时成交额
  - [ ] applySizeModeToTreemapData (重算 value + 排序)
  - [ ] 切换时重置视图
  - [ ] localStorage 持久化
- [ ] P2-5 双击跳转雪球
  - [ ] toXueqiuSymbol (code → SH600519 → SH600519)
  - [ ] window.open 雪球链接
- [ ] P2-6 亮色主题
  - [ ] globals.css CSS 变量 (亮色)
  - [ ] heatmapCanvasThemes.light 配色
  - [ ] 深色/浅色切换按钮
  - [ ] localStorage 持久化
- [ ] P2-7 全屏模式
  - [ ] requestFullscreen / exitFullscreen
  - [ ] Esc 退出
  - [ ] Toast 提示
- [ ] P2-8 自动轮询
  - [ ] use-poll-while-visible.ts (visibilitychange + setInterval)
  - [ ] 页面不可见时暂停
  - [ ] 8s 间隔刷新 quotes + overview
- [ ] P2-9 移动端适配
  - [ ] use-is-mobile.ts (matchMedia)
  - [ ] 触摸事件 (单指拖拽 + 双指缩放 + 双击)
  - [ ] mobile-stock-sheet.tsx (底部弹出面板)
  - [ ] K 线图嵌入 (新浪日线 GIF)
  - [ ] 抽屉式侧边栏
  - [ ] 雪球跳转按钮

### Phase 3: 增强功能（可选）

- [ ] P3-1 截图分享
  - [ ] 导出 Canvas → PNG (canvasToBlob)
  - [ ] 品牌水印 (标题 + 域名 + Logo)
  - [ ] 预览弹窗
  - [ ] 下载按钮
  - [ ] 复制到剪贴板 (ClipboardItem)
  - [ ] 系统分享 (navigator.share)
- [ ] P3-2 中英文 i18n
  - [ ] i18n.ts 消息字典
  - [ ] 语言切换
  - [ ] localStorage 持久化
- [ ] P3-3 主题颜色定制
  - [ ] 红/绿/蓝/紫 品牌色
  - [ ] CSS 变量动态注入
  - [ ] localStorage 持久化
- [ ] P3-4 设置面板
  - [ ] settings-drawer.tsx
  - [ ] 外观 (深色/浅色 + 主题色 + 涨跌颜色)
  - [ ] 语言 (中文/English)
  - [ ] 帮助说明
  - [ ] GitHub 链接
- [ ] P3-5 SEO 优化
  - [ ] metadata (title/description/keywords)
  - [ ] OpenGraph + Twitter Card 图片
  - [ ] 自定义 SVG 图标

---

## 九、验收标准

### MVP 验收

- [ ] 页面打开后显示暗色热力图，5400+ 只股票按 31 个一级行业分组
- [ ] 色块大小 = 流通市值权重，颜色 = 当日涨跌幅
- [ ] 可切换 7 个市场范围 (全A/上证/深证/沪深300/A500/创业板/科创板)
- [ ] 可切换 4 个涨跌周期 (当日/近5日/近20日/今年以来)
- [ ] 滚轮缩放 (1x~3x) + 拖拽平移
- [ ] 鼠标悬浮色块显示个股详情面板
- [ ] 底部涨跌图例
- [ ] 数据源不可用时自动降级到内置 JSON 快照
- [ ] 部署到 Vercel 可正常访问

### 完整版验收

- [ ] 一级板块筛选 (双击标题)
- [ ] 二级板块嵌套显示
- [ ] 涨跌筛选 (仅上涨/仅下跌)
- [ ] 面积指标切换 (流通市值 ↔ 成交额)
- [ ] 双击个股跳转雪球
- [ ] 深色/浅色主题切换 + 持久化
- [ ] 全屏模式
- [ ] 8 秒自动轮询刷新
- [ ] 移动端可正常使用 (触摸缩放/拖拽/底部面板)
