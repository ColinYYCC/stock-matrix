# 股市矩阵（stock-matrix）

一个把整个 A 股市场浓缩成一张可交互市场云图的项目：色块大小代表流通市值权重，颜色深浅代表涨跌幅。支持 A 股全图、上证 A 股、深证 A 股、沪深 300、中证 A500、创业板、科创板共 7 个市场范围，以及当日、近 5 日、近 20 日、今年以来 4 个涨跌区间。

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
| 项目架构 | 单文件 4558 行 | 8 个组件 + 6 个 hooks，绘制与状态分离 |
| 算法解耦 | 树图布局混在组件内 | `treemap.ts` 独立模块，可单独测试 |
| 颜色处理 | 颜色计算混在组件内 | `heatmap-color.ts` 独立模块 |
| 渲染引擎 | Canvas 绘制在 useEffect 内 | `canvas-render.ts` 独立函数集合 |
| 类型定义 | 类型分散在各处 | `types/heatmap.ts` 集中定义，前后端共享 |
| 数据请求 | 180 只/批 × 31 批 | 300 只/批 × 19 批，效率提升约 39% |
| 超时保护 | 无超时控制 | 每批 5s 超时 + 完整性校验，快速降级 |
| 股票名单 | 静态名单 | 东方财富 clist 分页动态发现，新股自动进入 |
| 成分股准确性 | HS300/A500 用市值排序近似 | AKShare 真实成分股（300 / 500 只） |
| 数据更新 | JSON 静态提交 | GitHub Actions 每交易日 3 次自动抓取并推送 |
| Canvas 性能 | 单 Canvas 全量重绘 | 离屏底图缓存 + 变换复用，缩放平移不重画色块 |
| 编码兼容性 | `Buffer.from()` | `new TextDecoder('latin1')` 兼容 Edge Runtime |
| 交互封装 | 事件内联处理 | `use-canvas-interaction` hook 封装 |
| 外观可配置 | 单一配色 | 双皮肤 + 6 项外观开关，偏好存 localStorage |

## 🌟 功能特性

### 市场观察

- **7 个市场范围**：A 股全图、上证 A 股、深证 A 股、沪深 300、中证 A500、创业板、科创板，每项旁边实时显示该市场指数涨跌幅
- **4 个涨跌区间**：当日、近 5 日、近 20 日、今年以来
- **三级筛选**：一级板块下拉 → 二级子板块 chip → 涨跌幅（全部 / 上涨 / 下跌）
- **市场概览**：上涨 / 平盘 / 下跌家数、成交额、与昨日成交额的差值（放量 / 缩量 / 持平）
- **交易状态**：左上角显示「交易中 / 休市中」与数据的北京时间戳

### 交互体验

- **画布操作**：滚轮或双指捏合缩放（1x–3x）、放大后拖拽平移
- **悬浮详情**：桌面端显示分时图、日 K 线与同板块个股列表，`↑/↓` 或 `J/K` 滚动列表
- **双击**：股票跳转雪球详情页；板块 / 子板块标题快速筛选或清除筛选
- **截图分享**：把当前画布合成成 PNG 下载，文件名带市场与周期
- **全屏模式**：`Esc` 或右上角按钮退出
- **移动端**：左侧抽屉式菜单，点击色块从底部弹出详情（K 线 + 雪球跳转 + 同板块列表）
- **URL 同步**：市场、周期、板块、子板块、涨跌筛选写回地址栏，链接可分享可收藏

### 视觉与个性化

设置抽屉（外观 / 帮助 / 项目三个标签页）提供 6 项开关，全部记忆在浏览器本地：

| 设置项 | 选项 |
|------|------|
| 界面风格 | iOS 26 液态玻璃（默认） / 经典风格 |
| 显示模式 | 暗黑 / 明亮 |
| 涨跌颜色 | 红涨绿跌 / 绿涨红跌 |
| 无字色块 | 隐藏（默认） / 全部显示 |
| 色块文字大小 | 紧凑 / 标准 / 大字（默认） |
| 色块显示价格 | 显示价格 / 隐藏价格 |

两套皮肤共用同一套组件，样式差异集中收在 `src/components/skin.ts` 的 token 表里，Canvas 配色单独由 `heatmapCanvasThemes`（皮肤 × 显示模式）提供。

### 数据架构

- **三级容灾**：东方财富（主）→ 新浪财经（降级）→ 内置快照（兜底）
- **动态股票发现**：东方财富 clist 分页 + 多主机轮换，新股自动进入热力图
- **分层缓存**：CDN 交易中 8 秒 / 休市 60 秒，服务端模块缓存 2 秒，另有 5 分钟 stale-while-revalidate
- **收盘锁**：收盘且数据有效后锁定快照，跨日自动解锁

## 🛠️ 技术栈

- **框架**：Next.js 16（App Router）
- **语言**：TypeScript（strict）+ React 19
- **绘制**：Canvas 2D
- **样式**：Tailwind CSS v4
- **包管理**：npm
- **测试**：Vitest
- **部署**：Vercel Serverless
- **数据脚本**：Python 3.11 + AKShare 1.18.79（仅用于刷新内置数据，运行项目本身不需要）

## 📦 快速开始

```bash
# 克隆本仓库
git clone https://github.com/ColinYYCC/stock-matrix.git
cd stock-matrix

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000) 体验股市矩阵。项目不需要任何环境变量，也不需要配置密钥，克隆下来装完依赖即可跑。

## 🚀 一键部署

点击下方按钮可直接部署到 Vercel：

[![Deploy with Vercel](https://img.shields.io/badge/Deploy%20with-Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)](https://vercel.com/new/clone?repository-url=https://github.com/ColinYYCC/stock-matrix)

## 📁 项目结构

```
stock-matrix/
├── .github/workflows/
│   └── refresh-stocks.yml           # 每交易日自动刷新内置数据并推送
├── docs/adr/                        # 架构决策记录（双皮肤合并方案等）
├── scripts/
│   ├── fetch_stocks.py              # 全 A 股名单 + 申万行业 + 指数成分股
│   ├── gen_index_constituents.py     # 按流通市值生成成分股兜底
│   └── fetch_stocks_doc.md          # 脚本用法与行业分类说明
├── src/
│   ├── app/
│   │   ├── api/heatmap/treemap/     # 树图数据接口
│   │   ├── api/heatmap/overview/    # 7 个市场涨跌幅概览
│   │   ├── api/chart/kline/         # 日 K 线图代理
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── market-heatmap.tsx       # 主视图：状态、URL 同步、Canvas、全屏、截图
│   │   ├── sidebar.tsx              # 市场 / 板块 / 周期 / 概览
│   │   ├── settings-drawer.tsx      # 设置抽屉（外观 / 帮助 / 项目）
│   │   ├── inspector.tsx            # 桌面端悬浮详情
│   │   ├── mobile-stock-sheet.tsx   # 移动端底部详情
│   │   ├── color-legend.tsx         # 涨跌图例 + 操作提示 + 分享
│   │   ├── skin.ts                  # 双皮肤 className token 表
│   │   └── ui/button.tsx
│   ├── hooks/                       # 数据轮询、Canvas 交互、交易时段、移动端判定等
│   ├── lib/
│   │   ├── market-data.ts           # 服务端数据层（三级降级 + 缓存 + 收盘锁）
│   │   ├── stock-discovery.ts       # 动态股票发现与行业归类
│   │   ├── canvas-render.ts         # Canvas 绘制函数集合
│   │   ├── heatmap-layout.ts        # 板块 → 子板块 → 个股嵌套布局
│   │   ├── treemap.ts               # 二分平衡树图算法
│   │   ├── heatmap-color.ts         # 涨跌幅 → 颜色
│   │   ├── market-stats.ts          # 涨跌家数与加权统计
│   │   ├── trading-hours.ts         # 交易时段判定
│   │   ├── i18n.ts                  # 中文文案字典
│   │   ├── data/                    # 内置快照与行业 / 成分股 JSON
│   │   └── __tests__/               # Vitest 用例
│   └── types/heatmap.ts             # 前后端共享类型与常量
├── CONTEXT.md                       # 领域词汇表
└── PLAN.md                          # 设计与实现计划
```

## 🔧 基础命令

```bash
npm run dev         # 本地开发
npm run build       # 生产构建
npm run start       # 启动生产服务
npm run lint        # ESLint 检查
npm run typecheck   # TypeScript 类型检查
npm test            # 运行 Vitest 用例
npm run test:watch  # 监听模式跑测试
```

## 🔄 内置数据刷新（可选）

内置快照由 Python 脚本生成，仓库已配好 GitHub Actions：**每交易日北京时间 09:00（开盘前）、12:00（午休）、16:00（收盘后）自动抓取，校验通过后自动推送**，Vercel 随即重新部署。也可以在仓库的 Actions 页面手动触发。

想在本机手动刷新：

```bash
pip install -r requirements.txt
python scripts/fetch_stocks.py
```

脚本会覆盖 `src/lib/data/` 下的三个文件：

| 文件 | 内容 |
|------|------|
| `stocks-fallback.json` | 5579 只股票快照（代码、名称、市场、流通市值、价格、21 个一级板块） |
| `subboards.json` | 5597 条个股 → 二级行业映射 |
| `index-constituents.json` | 沪深 300 / 中证 A500 真实成分股 |

## 🌐 数据源架构

### 三层容灾机制

1. **主数据源**：东方财富 `push2.eastmoney.com`（多周期涨跌 + 成交额）
2. **降级源**：新浪财经 `hq.sinajs.cn`（当日涨跌）
3. **兜底**：内置 `stocks-fallback.json`（5579 只股票样本，界面提示「当前为样本快照」）

任一层返回数量低于基线的 90% 即判定不完整，直接降下一级。

### 补充数据源

- **同花顺**：全市场涨跌家数与成交额（仅在 A 股全图口径下采用官方数据）
- **东方财富 clist**：动态股票发现，自动补入新上市个股
- **新浪图床**：日 K 线图，经 `/api/chart/kline` 代理

### 批量与缓存策略

- 东方财富：每批 300 只；新浪：每批 220 只；每批 5 秒超时
- CDN 新鲜期：交易中 8 秒、休市 60 秒，另有 5 分钟 stale-while-revalidate
- 服务端模块缓存：2 秒（只为同一瞬间涌入的请求共用一次回源）
- 前端轮询：交易中 8 秒、休市 60 秒，页面切到后台时暂停

## 📡 API 接口

| 接口 | 说明 |
|------|------|
| `GET /api/heatmap/treemap` | 参数 `market`、`period`，返回板块 → 子板块 → 个股的嵌套数据与汇总统计 |
| `GET /api/heatmap/overview` | 参数 `period`，返回 7 个市场的指数涨跌幅与股票数 |
| `GET /api/chart/kline` | 参数 `code`（如 `sh600519`），代理新浪日 K 线图 |

## 📊 算法详解

### 二分平衡树图布局

1. 按流通市值降序排列
2. 找累计值最接近 50% 的分割点
3. 沿长边方向按面积比例切割
4. 递归处理两半

### 颜色映射策略

- 涨跌区间限制在 ±10%
- 平盘（|涨跌幅| < 0.1%）显示为中性灰色
- RGB 插值计算颜色强度

### 无字色块的剔除

放不下名字的色块会在布局阶段迭代剔除、把位置让给能显示名字的色块。只在显示层剔除，股票数据保留：拉大窗口或筛选板块后它们会重新出现。设置里可切换为「全部显示」。

### Canvas 渲染策略

- **离屏底图**：色块与文字画在一张离屏 canvas 上，只有数据、尺寸或外观设置变化时才重画
- **变换复用**：缩放、平移期间直接把离屏底图整体挪位缩放，不重画色块；停止操作 150ms 后再全量重画一次，恢复文字清晰
- **高亮叠加**：hover / 选中态只在底图上描边，不触发色块重绘

## 🧪 测试

```bash
npm test
```

Vitest 覆盖 `src/lib/__tests__/` 下 6 个文件，重点验证：股票发现的行业归类与解析、涨跌统计口径、嵌套布局与无字色块剔除、K 线代理的入参校验与错误码、两套皮肤 token 结构一致。其中 `classification-sync.test.ts` 会解析 Python 脚本源码，比对 TS 侧行业分类表是否同步。

## 🐛 已知问题与未来计划

- [x] 增加 K 线图嵌入（详情面板与移动端弹层已支持）
- [ ] 支持更多行业分类体系
- [ ] 添加国际化支持（当前仅中文，文案集中在 `src/lib/i18n.ts`）
- [ ] 补全服务端降级链与 API 路由的测试覆盖
- [ ] 优化移动端交互体验

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
