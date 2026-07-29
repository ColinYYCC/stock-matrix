# 股票数据更新文档

> 本文档记录 `scripts/fetch_stocks.py` 的股票列表更新方式和行业分类方案。
> 最后更新：2026-07-28

---

## 一、背景

项目需要一个全 A 股的股票列表（含代码、名称、价格、市值、行业分类），作为前端热力图的 fallback 数据。原作者 `wenyuanw/a-share-heatmap` 的方案是**静态 JSON 文件**，不存在定期更新的 Python 脚本。本项目新增了 `scripts/fetch_stocks.py` 来实现自动更新。

早期版本使用 `akshare` 库获取申万行业分类，但 `akshare` 的 `sw_index_first_info()` / `index_component_sw()` 接口已失效（申万指数数据源变更，返回的 DataFrame 缺少 `证券代码`、`证券名称` 等列，导致 `KeyError`）。因此改为直接使用东方财富 clist 接口的 `f100` 字段获取行业分类，不再依赖 akshare 的申万接口。

---

## 二、整体架构

脚本分两步执行，互不影响：

```
┌─────────────────────────────────────────────────────────┐
│  步骤 1（核心）：东方财富 clist 分页接口                  │
│  ├── 获取全 A 股列表（自动发现新股）                      │
│  ├── 更新价格、市值                                      │
│  ├── 通过 f100 字段获取二级行业名                        │
│  ├── 检查停牌股票（旧有新无 → 个股接口验证）              │
│  └── 输出 stocks-fallback.json                           │
├─────────────────────────────────────────────────────────┤
│  步骤 2（辅助）：行业分类 + 成分股                        │
│  ├── 用 f100 数据 + 现有 subboards.json 映射表           │
│  │   → 更新 subboards.json                               │
│  ├── 更新 stocks-fallback.json 的 boardName 字段          │
│  └── 用 akshare 获取 HS300 / A500 成分股                 │
│      → 输出 index-constituents.json                       │
└─────────────────────────────────────────────────────────┘
```

### 输出文件

| 文件 | 路径 | 说明 |
|------|------|------|
| `stocks-fallback.json` | `src/lib/data/` | 股票列表（代码、名称、价格、市值、行业） |
| `subboards.json` | `src/lib/data/` | 行业分类映射（股票代码 → 一级行业 + 二级行业） |
| `index-constituents.json` | `src/lib/data/` | 指数成分股（HS300、A500） |

---

## 三、步骤 1：获取全 A 股列表

### 3.1 数据源

**东方财富 clist 分页接口**，参考原作者 `market-heatmap.ts` 的运行时代码。

```
GET https://push2delay.eastmoney.com/api/qt/clist/get
    ?pn={页码}&pz=100&po=1&np=1
    &ut=bd1d9ddb04089700cf9c27f6f7426281
    &fltt=2&invt=2&fid=f12
    &fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048
    &fields=f2,f3,f6,f12,f13,f14,f18,f20,f21,f24,f25,f100,f109,f110,f124
```

### 3.2 请求参数说明

| 参数 | 值 | 说明 |
|------|------|------|
| `pn` | 1, 2, 3... | 页码 |
| `pz` | 100 | 每页数量 |
| `fs` | `m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048` | 全 A 股筛选条件（沪深主板 + 创业板 + 科创板 + 北交所） |
| `fields` | `f2,f3,f6,...` | 请求的字段列表 |

### 3.3 字段说明

| 字段 | 含义 | 用途 |
|------|------|------|
| `f2` | 最新价 | `price` |
| `f3` | 涨跌幅 (%) | `changePct` |
| `f12` | 股票代码 | `code` |
| `f13` | 市场标志 (1=沪, 0=深) | 判断交易所 |
| `f14` | 股票名称 | `name` |
| `f20` | 总市值 | `totalMarketCap` |
| `f21` | 流通市值 | `floatMarketCap` |
| `f100` | 所属行业（申万二级） | 行业分类 |
| `f109`/`f110` | 其他标志 | 预留 |

### 3.4 多主机轮换 + 重试

参考原作者策略，避免被限流：

```python
EASTMONEY_CLIST_HOSTS = [
    "push2delay.eastmoney.com",   # 延迟数据，不易被限流
    "82.push2.eastmoney.com",     # 备用主机
    "7.push2.eastmoney.com",
    "48.push2.eastmoney.com",
    "push2.eastmoney.com",        # 主站（常空响应）
]
```

- 每次重试换一个主机
- 指数退避：`wait = 120 * attempt²` 毫秒
- 最多重试 4 次

### 3.5 并发拉取

- 先拉第一页获取 `total`（总股票数）
- 计算总页数：`ceil(total / 100)`
- 用 `ThreadPoolExecutor` 4 并发拉取剩余页
- 允许 20% 的页失败（≥80% 成功即继续）

### 3.6 交易所判断

```python
if f13 == 1:          # 沪市
    exchange = "SH"
elif code.startswith(("4", "8", "9")):  # 北交所
    exchange = "BJ"
else:                  # 深市
    exchange = "SZ"
```

> 注意：北交所股票代码以 4/8/9 开头（如 920xxx、830xxx、430xxx），不能仅靠 `f13` 判断。

---

## 四、停牌股票处理

### 4.1 问题

东方财富 clist 接口**不返回停牌股票**。如果仅用 clist 结果，停牌股票会被误判为退市而删除。

### 4.2 解决方案

在步骤 1 拉取完新列表后，检查旧数据中「旧有新无」的股票：

```
旧数据中的股票 - clist 结果 = 旧有新无的股票
```

对这些股票逐一调用**东方财富个股接口**验证状态：

```
GET https://push2delay.eastmoney.com/api/qt/stock/get
    ?secid={1或0}.{代码}
    &ut=bd1d9ddb04089700cf9c27f6f7426281
    &fltt=2&invt=2
    &fields=f57,f58,f43,f152,f46
```

| 字段 | 含义 |
|------|------|
| `f58` | 股票名称（空 = 退市） |
| `f43` | 最新价（`-` 或 `None` = 停牌） |
| `f152` | 状态码（1=正常, 2=停牌, 0=退市） |

判断逻辑：
- API 返回空数据（`f58` 为空）→ **退市**，从列表中移除
- API 返回数据但价格为空 → **停牌**，保留在列表中（价格设为 0，涨跌幅设为 0）
- API 返回正常数据 → 保留

---

## 五、行业分类方案

### 5.1 为什么不用 akshare

`akshare` 的申万行业分类接口已失效：

| akshare 函数 | 问题 |
|-------------|------|
| `sw_index_first_info()` | 返回空 DataFrame 或报错 |
| `sw_index_second_info()` | 同上 |
| `index_component_sw(symbol)` | 返回的 DataFrame 缺少 `证券代码` 列，`KeyError` |

### 5.2 方案：用 f100 字段 + 映射表

东方财富 clist 接口的 `f100` 字段返回的是**申万二级行业名**（如"半导体"、"医疗器械"、"光伏设备"）。

前端热力图需要的是**申万一级行业**（31 个，如"电子"、"医药生物"、"电力设备"）。

方案流程：

```
f100 (二级)          subboards.json 映射表         boardName (一级)
"半导体"        ──→   半导体 → 电子           ──→   "电子"
"IT服务Ⅱ"      ──→   去Ⅱ → IT服务 → 计算机   ──→   "计算机"
"医疗器械"      ──→   医疗器械 → 医药生物     ──→   "医药生物"
```

### 5.3 映射表构建

从现有 `subboards.json` 构建 **二级→一级行业** 映射表：

```python
# subboards.json 结构
{
  "subboards": {
    "688041.SH": {"sectorName": "电子", "subBoardName": "半导体"},
    "002371.SZ": {"sectorName": "电子", "subBoardName": "半导体"},
    ...
  }
}

# 构建的映射表
半导体 → 电子
医疗器械 → 医药生物
光伏设备 → 电力设备
IT服务 → 计算机
...（共 131 个二级行业）
```

### 5.4 三级查找策略

申万分类会定期更新，部分行业名加了"Ⅱ"后缀（如"IT服务Ⅱ"、"中药Ⅱ"）。查找策略：

| 优先级 | 策略 | 示例 |
|--------|------|------|
| 1 | 直接匹配 | "半导体" → "电子" |
| 2 | 去Ⅱ后缀匹配 | "IT服务Ⅱ" → "IT服务" → "计算机" |
| 3 | 模糊匹配 | "军工电子Ⅱ" 包含 "军工电子" → "国防军工" |
| 4 | 未匹配 | 标记为"其他" |

### 5.5 行业分类优先级

对每只股票分配一级行业时的优先级：

```
1. stocks-fallback.json 中已有 boardName  → 直接沿用
2. subboards.json 中有该股票             → 用 sectorName
3. f100 字段映射                         → lookup_sector()
4. 以上都找不到                           → "其他"
```

### 5.6 申万一级行业列表（31 个）

```
交通运输  传媒        公用事业    农林牧渔    医药生物
商贸零售  国防军工    基础化工    家用电器    建筑材料
建筑装饰  房地产      有色金属    机械设备    汽车
煤炭      环保        电力设备    电子        石油石化
社会服务  纺织服饰    综合        美容护理    计算机
轻工制造  通信        钢铁        银行        非银金融
食品饮料
```

---

## 六、步骤 2：更新 subboards.json 和成分股

### 6.1 更新 subboards.json

1. 加载现有 `subboards.json`（已有 5443 条行业映射）
2. 构建二级→一级映射表
3. 遍历 `stocks-fallback.json` 中的每只股票：
   - 已在 `subboards.json` 中 → 保留
   - 不在其中但有 `f100` → 用映射表查找一级行业，新增到 `subboards.json`
4. 合并写入 `subboards.json`

### 6.2 更新 stocks-fallback.json 的 boardName

用更新后的 `subboards.json` 给每只股票打上行业标签，清理 `rawIndustry` 临时字段。

### 6.3 更新成分股

用 `akshare` 的 `index_stock_cons()` 获取指数成分股：

| 指数 | akshare 参数 | 预期数量 |
|------|-------------|---------|
| 沪深 300 | `symbol="000300"` | 300 只 |
| 中证 A500 | `symbol="000510"` | 500 只 |

如果 akshare 不可用或拉取失败，用**市值排序兜底**（取前 300 / 前 500 只）。

---

## 七、使用方法

### 7.1 环境准备

```bash
# Python 依赖
pip install -r requirements.txt

# requirements.txt 内容：
# akshare>=1.12.0
# requests>=2.28.0
```

### 7.2 运行

```bash
python scripts/fetch_stocks.py
```

### 7.3 预期输出

```
=== 步骤 1：获取全 A 股列表 + 更新价格（clist 分页接口）===
  现有数据: 5525 只股票
  正在拉取第一页以获取总数...
  总共 5884 只股票，分 59 页（每页 100 只）
  并发拉取（4 并发）...
    第 2/59 页: ✅
    ...
  成功获取 59/59 页
  解析出 5525 只股票
  ✅ 已写入 stocks-fallback.json（5525 只股票，31 个板块）

✅ 步骤 1 完成：股票列表和价格已更新

=== 步骤 2：更新行业分类（f100）和成分股（AKShare）===
  正在用 f100 字段更新行业分类...
  f100 行业分类: 108 只匹配成功，0 只未匹配
  已写入 subboards.json（5551 条，新增 108 条）
  已更新 stocks-fallback.json 的行业分类（31 个板块）
  正在拉取沪深 300 成分股...
  沪深 300: 300 只
  正在拉取中证 A500 成分股...
  中证 A500: 500 只
  已写入 index-constituents.json

✅ 步骤 2 完成：行业分类和成分股已更新

全部完成！
```

---

## 八、数据文件结构

### 8.1 stocks-fallback.json

```json
{
  "updatedAt": "2026-07-28T...",
  "stockCount": 5525,
  "boardCount": 31,
  "stocks": [
    {
      "code": "688041.SH",
      "exchange": "SH",
      "name": "海光信息",
      "boardName": "电子",
      "price": 258.0,
      "changePct": 1.98,
      "totalMarketCap": 538828000000,
      "floatMarketCap": 538828000000
    }
  ]
}
```

### 8.2 subboards.json

```json
{
  "updatedAt": "2026-07-28T...",
  "count": 5551,
  "subboards": {
    "688041.SH": {
      "sectorName": "电子",
      "subBoardName": "半导体"
    }
  }
}
```

### 8.3 index-constituents.json

```json
{
  "updatedAt": "2026-07-28T...",
  "hs300": ["600519.SH", "000858.SZ", ...],
  "zza500": ["600519.SH", "000858.SZ", ...]
}
```

---

## 九、前端如何使用

前端 `src/lib/market-data.ts` 中的 `baselineStocks` 会合并三个 JSON 文件：

```typescript
const baselineStocks = fallbackSnapshotSeed.stocks.map((stock) => {
  const mapped = subboardSeed.subboards[stock.code];
  return {
    ...stock,
    boardName: mapped?.sectorName ?? stock.boardName,       // 一级行业
    subBoardName: mapped?.subBoardName ?? stock.boardName,   // 二级行业
  };
});
```

- `stocks-fallback.json`：提供股票列表 + 价格 + 一级行业（`boardName`）
- `subboards.json`：提供更精确的行业分类（覆盖 `boardName`，并添加 `subBoardName`）
- `index-constituents.json`：标识 HS300 / A500 成分股

---

## 十、设计决策记录

| 决策 | 原因 |
|------|------|
| 用 clist 接口而非 akshare 获取股票列表 | akshare 的 `stock_zh_a_spot_em()` 底层也调用东方财富，但封装层有 bug 且无法控制重试策略 |
| 用 f100 字段而非 akshare 获取行业分类 | akshare 的 `sw_index_first_info()` / `index_component_sw()` 已失效 |
| 用现有 subboards.json 构建映射表 | 避免重新拉取完整的申万行业分类体系（已失效），利用已有的 5443 条准确数据 |
| 保留 akshare 获取成分股 | `index_stock_cons()` 接口仍然可用，且能获取准确的 HS300/A500 成分股列表 |
| 停牌股票用个股接口验证 | clist 接口不返回停牌股票，但个股接口可以查到停牌状态 |
| 北交所代码以 4/8/9 开头判断 | `f13` 字段只区分沪(1)/深(0)，北交所股票 `f13=0` 容易被误判为深市 |
| 允许 20% 的页失败 | 避免因个别页失败导致整个脚本中止，80% 已足够覆盖绝大多数股票 |
