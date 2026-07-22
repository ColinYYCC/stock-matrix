# 股市矩阵（stock-matrix）

一个高度重构优化的 A 股市场热力图项目，把整个 A 股市场浓缩成一张可交互的市场云图，色块大小代表个股流通市值权重，颜色深浅代表涨跌幅，支持沪深全 A 股、沪深 300、中证 A500、创业板、科创板等多个市场范围。

<p align="center">
  <a href="https://stock-matrix-six.vercel.app/">
    <img src="https://img.shields.io/badge/在线预览-stock--matrix--six.vercel.app-1f6feb?style=for-the-badge&logo=vercel&logoColor=white" alt="在线预览" />
  </a>
</p>

---

## ✨ 此项目基于 [wenyuanw/a-share-heatmap](https://github.com/wenyuanw/a-share-heatmap)

特别感谢原作者 wenyuanw 提供的基础架构和优秀实现。本项目的核心算法和交互理念深受原项目启发。**如果您喜欢本项目，请同样支持原作者的 [A 股市场热力图](https://github.com/wenyuanw/a-share-heatmap) 项目，欢迎给原作者 Star 🌟**。

## 🚀 核心改进与优化

本项目并非简单复刻，而是针对架构、性能和维护性进行了全面重构：

| 改进点 | 原项目 | 本项目的改进 |
|------|------|------------|
| 项目架构 | 单文件 4558 行 | 拆分为 6 个组件 + 3 个 hooks，单文件 ≤ 800 行 |
| 算法解耦 | 树图布局混在组件内 | `treemap.ts` 独立模块，可单独测试 |
| 颜色处理 | 颜色计算混在组件内 | `heatmap-color.ts` 独立模块 |
| 渲染引擎 | Canvas 绘制在 useEffect 内 | `canvas-render.ts` 独立函数集合 |
| 类型定义 | 类型分散在各处 | `types/heatmap.ts` 集中定义，复用更方便 |
| 数据请求 | 180 只/批 × 31 批 | 300 只/批 × 19 批，效率提升约 39% |
| 超时保护 | 无超时控制 | 每批加 5s 超时保护，防卡死快速降级 |
| 成分股准确性 | HS300/A500 用市值排序近似 | 集成 AKShare 真实成分股数据 |
| 行业数据获取 | JSON 静态提交 | 提供 Python 抓取脚本，数据可一键更新 |
| Canvas 性能 | 单 Canvas 全量重绘 | 双层 Canvas：底层(色块+文字) + 上层(hover 高亮) |
| 编码兼容性 | `Buffer.from()` | `new TextDecoder('latin1')` 兼容 Edge Runtime |
| 交互封装 | 事件内联处理 | `use-canvas-interaction` hook 封装 |

## 🌟 功能特性

### 市场观察
- **多市场范围**：全 A 股、上证 A 股、深证 A 股、沪深 300、中证 A500、创业板、科创板 
- **多周期分析**：当日、近 5 日、近 20 日、今年以来涨跌区间切换
- **板块下钻**：可聚焦查看单个一级行业板块内部热力图

### 交互体验
- **画布操作**：滚轮缩放（1x-3x）、拖拽平移，以鼠标位置为锚点
- **悬浮详情**：实时显示个股名称、价格、涨跌幅及板块内所有股票
- **板块切换**：双击板块标题快速筛选/取消筛选
- **移动端支持**：触摸手势、底部弹出面板

### 视觉设计
- **颜色映射**：红绿配色精准映射股价涨跌幅
- **双层渲染**：色块与文字的独立渲染层，hover 高亮不触发全量重绘
- **主题切换**：深色/浅色主题，localStorage 持久化
- **文字分级**：根据色块大小智能显示（名称+涨跌/名称/涨跌/隐藏）

### 数据架构
- **三级容灾**：东方财富（主）→ 新浪财经（降级）→ 内置 JSON（兜底）
- **智能缓存**：CDN 缓存主力 + 模块级缓存辅助，秒级更新 + 缓存降级
- **批量优化**：每批最多 300 只股票，5 秒超时保护

## 🛠️ 技术栈

- **框架**：Next.js (App Router)
- **语言**：TypeScript + React
- **绘制**：Canvas 2D（双层渲染）
- **样式**：Tailwind CSS v4
- **包管理**：pnpm
- **部署**：Vercel Serverless

## 📦 快速开始

```bash
# 克隆本仓库
git clone https://github.com/ColinYYCC/stock-matrix.git

# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev
```

访问 [http://localhost:3000](http://localhost:3000) 体验股市矩阵。

## 🚀 一键部署

点击下方按钮可直接部署到 Vercel：

[![Deploy with Vercel](https://img.shields.io/badge/Deploy%20with-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com/new/clone?repository-url=https://github.com/ColinYYCC/stock-matrix)

## 📁 项目结构

```
stock-matrix/
├── scripts/                           # 数据抓取脚本
│   └── fetch_stocks.py               # Python + AKShare 一次性抓取
├── src/
│   ├── app/
│   │   ├── api/heatmap/              # API 接口
│   │   ├── layout.tsx
│   │   └── page.tsx                  # 首页入口
│   ├── components/                   # React 组件
│   │   ├── market-heatmap.tsx        # 主组件
│   │   ├── sidebar.tsx               # 侧边栏
│   │   ├── inspector.tsx             # 悬浮详情面板
│   │   └── ...
│   ├── lib/                          # 核心算法
│   │   ├── data/                      # 预置数据
│   │   ├── market-data.ts             # 数据获取（三级容灾）
│   │   ├── treemap.ts                # 二分平衡树图算法
│   │   ├── heatmap-color.ts           # 颜色映射
│   │   └── ...
│   ├── hooks/                        # 自定义 Hook
│   │   └── use-canvas-interaction.ts  # Canvas 交互封装
│   └── types/heatmap.ts              # 类型定义
└── ...
```

## 🔧 基础命令

```bash
pnpm dev         # 本地开发
pnpm build       # 生产构建
pnpm start       # 启动生产服务
pnpm lint        # ESLint 检查
pnpm typecheck   # TypeScript 类型检查
```

## 🌐 数据源架构

### 三层容灾机制

1. **主数据源**：东方财富 `push2.eastmoney.com`（多周期涨跌 + 成交额）
2. **降级源**：新浪财经 `hq.sinajs.cn`（当日涨跌）
3. **兜底**：内置 `stocks-fallback.json`（约 5400 只股票样本）

### 批量策略
- 东方财富：每批 300 只（19 批并发，5443 ÷ 300 ≈ 19）
- 新浪：每批 220 只（降级时使用）
- 超时：每批 5 秒快速降级
- 完整性校验：返回数量 < 基线 90% 时自动降级

## 📊 算法详解

### 二分平衡树图布局

输入股票列表后：
1. 按流通市值降序排列
2. 找累计值最接近 50% 的分割点
3. 沿长边方向按面积比例切割
4. 递归处理两半

### 颜色映射策略

- 涨跌区间限制在 ±10%
- 平盘（|涨跌幅| < 0.1%）显示为中性灰色
- RGB 插值计算颜色强度

### 双层 Canvas 渲染

- **底层**：色块 + 文字（仅当数据或视图变化时重绘）
- **上层**：hover 高亮描边（仅当选中股票变化时重绘）

## 🐛 已知问题与未来计划

- [ ] 支持更多行业分类体系
- [ ] 增加 K 线图嵌入 
- [ ] 优化移动端交互体验
- [ ] 添加国际化支持

## 🙏 致谢

### 原作者项目

- [wenyuanw/a-share-heatmap](https://github.com/wenyuanw/a-share-heatmap) 

### 参考产品

在设计交互和视觉效果时，参考了以下优秀的市场热力图产品：

- [Finviz Map](https://finviz.com/map) — 美股市场热力图的经典之作
- [TradingView Stock Heatmap](https://tw.tradingview.com/heatmap/stock)
- [52ETF 市场云图](https://52etf.site/) — 中文圈用心的 A 股站点

### 数据接口

- 东方财富网
- 新浪财经
- 同花顺

---

**股市有风险，投资需谨慎。**

本项目通过开源方式分享技术实现，并不提供任何投资建议。

## 📄 License

MIT
