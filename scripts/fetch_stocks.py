#!/usr/bin/env python3
"""股市矩阵 — 股票数据抓取脚本

两步独立执行，互不影响：
  步骤 1（核心）：用东方财富 clist 分页接口获取全 A 股列表（自动发现新股）+ 更新价格
           同时通过 f100 字段获取东方财富行业分类（申万二级行业），映射到申万一级行业
  步骤 2（辅助）：用 f100 数据更新 subboards.json，用 AKShare 更新成分股（失败不影响步骤 1）

输出三个 JSON 文件：
- src/lib/data/stocks-fallback.json
- src/lib/data/subboards.json
- src/lib/data/index-constituents.json

使用方法：
  pip install -r requirements.txt
  python scripts/fetch_stocks.py

设计参考：原作者 (wenyuanw/a-share-heatmap) 的 market-heatmap.ts 运行时代码，
使用 clist 分页接口 + 多主机轮换 + 并发请求来获取全 A 股列表。
行业分类改用东方财富 clist 接口的 f100 字段（申万二级行业），
通过现有 subboards.json 的二级→一级映射表转换，不再依赖 akshare 的申万接口。
"""
import json
import os
import sys
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.error import URLError

# ============ 东方财富 clist 接口配置 ============
# 多主机轮换：push2delay 主站延迟数据，不容易被限流
# 原作者注释："push2 主站常空响应，优先 push2delay"
EASTMONEY_CLIST_HOSTS = [
    "push2delay.eastmoney.com",
    "82.push2.eastmoney.com",
    "7.push2.eastmoney.com",
    "48.push2.eastmoney.com",
    "push2.eastmoney.com",
]
EASTMONEY_CLIST_PATH = "/api/qt/clist/get"
EASTMONEY_ASHARES_FS = "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048"
EASTMONEY_PAGE_SIZE = 100
EASTMONEY_CONCURRENCY = 4
EASTMONEY_MAX_ATTEMPTS = 4

# 请求字段（包含市值 f20/f21、行业分类 f100，用于 fallback JSON）
# f100 = 东方财富所属行业（申万二级行业，如"半导体""医疗器械"）
EASTMONEY_FIELDS = "f2,f3,f6,f12,f13,f14,f18,f20,f21,f24,f25,f100,f109,f110,f124"
EASTMONEY_UT = "bd1d9ddb04089700cf9c27f6f7426281"
EASTMONEY_TIMEOUT = 15
EASTMONEY_STOCK_GET_URL = "https://push2delay.eastmoney.com/api/qt/stock/get"

EASTMONEY_HEADERS = {
    "Referer": "https://quote.eastmoney.com/",
    "User-Agent": "Mozilla/5.0 (compatible; StockMatrix/1.0)",
    "Accept": "application/json, text/plain, */*",
}

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "src", "lib", "data")
FALLBACK_PATH = os.path.join(DATA_DIR, "stocks-fallback.json")
SUBBOARDS_PATH = os.path.join(DATA_DIR, "subboards.json")
CONSTITUENTS_PATH = os.path.join(DATA_DIR, "index-constituents.json")


def log(msg):
    print(msg, flush=True)


# ============ 步骤 1：用东方财富 clist 分页接口获取全 A 股列表 ============

def fetch_clist_page(page_num, max_retries=EASTMONEY_MAX_ATTEMPTS):
    """拉取 clist 接口的一页数据，带多主机轮换重试。
    
    模仿原作者 market-heatmap.ts 的 fetchEastmoneyClistPage 函数：
    - 每次重试换一个主机
    - 指数退避（120 * attempt² 毫秒）
    """
    last_error = None
    for attempt in range(1, max_retries + 1):
        host = EASTMONEY_CLIST_HOSTS[(attempt - 1) % len(EASTMONEY_CLIST_HOSTS)]
        url = (
            f"https://{host}{EASTMONEY_CLIST_PATH}"
            f"?pn={page_num}&pz={EASTMONEY_PAGE_SIZE}&po=1&np=1"
            f"&ut={EASTMONEY_UT}&fltt=2&invt=2&fid=f12"
            f"&fs={EASTMONEY_ASHARES_FS}&fields={EASTMONEY_FIELDS}"
        )
        try:
            req = Request(url, headers=EASTMONEY_HEADERS)
            resp = urlopen(req, timeout=EASTMONEY_TIMEOUT)
            if resp.status != 200:
                raise RuntimeError(f"HTTP {resp.status}")
            payload = json.loads(resp.read().decode("utf-8"))
            diff = (payload.get("data") or {}).get("diff")
            if not isinstance(diff, list):
                raise RuntimeError("payload invalid: no data.diff")
            return payload
        except Exception as e:
            last_error = e
            wait_ms = 120 * attempt * attempt
            if attempt < max_retries:
                log(f"  第 {page_num} 页第 {attempt}/{max_retries} 次失败 ({host}): {e}，{wait_ms}ms 后重试...")
                time.sleep(wait_ms / 1000.0)
    if last_error:
        raise last_error
    raise RuntimeError(f"clist page {page_num} failed after {max_retries} attempts")


def fetch_all_stocks_clist():
    """用 clist 分页接口获取全 A 股列表，4 并发。
    
    模仿原作者 market-heatmap.ts 的 fetchEastmoneyClistPages 函数：
    - 先拉第一页拿到 total
    - 计算总页数
    - 并发拉取剩余页（4 并发）
    - 允许 20% 的页失败
    """
    log("  正在拉取第一页以获取总数...")
    first_payload = fetch_clist_page(1)
    total = (first_payload.get("data") or {}).get("total", 0)
    if not total or total <= 0:
        raise RuntimeError(f"clist 返回的 total 无效: {total}")
    
    page_count = max(1, -(-total // EASTMONEY_PAGE_SIZE))  # 向上取整
    log(f"  总共 {total} 只股票，分 {page_count} 页（每页 {EASTMONEY_PAGE_SIZE} 只）")
    log(f"  并发拉取（{EASTMONEY_CONCURRENCY} 并发）...")
    
    all_payloads = [first_payload]
    
    if page_count > 1:
        page_numbers = list(range(2, page_count + 1))
        
        with ThreadPoolExecutor(max_workers=EASTMONEY_CONCURRENCY) as executor:
            future_to_page = {
                executor.submit(fetch_clist_page, page): page
                for page in page_numbers
            }
            for future in as_completed(future_to_page):
                page = future_to_page[future]
                try:
                    payload = future.result()
                    all_payloads.append(payload)
                    log(f"    第 {page}/{page_count} 页: ✅")
                except Exception as e:
                    log(f"    第 {page}/{page_count} 页: ❌ {e}")
    
    successful = len(all_payloads)
    log(f"  成功获取 {successful}/{page_count} 页")
    
    if successful == 0:
        raise RuntimeError("所有页都拉取失败")
    if successful < page_count * 0.8:
        raise RuntimeError(f"页数不完整: {successful}/{page_count}（需要 >= 80%）")
    
    return all_payloads


def _safe_float(val):
    """安全转换数值，无效值返回 0.0"""
    if val is None or val == "-" or val == "":
        return 0.0
    try:
        return float(val)
    except (TypeError, ValueError):
        return 0.0


def parse_clist_stocks(payloads):
    """解析 clist 返回的 JSON，提取股票列表"""
    stocks = []
    seen_codes = set()
    
    for payload in payloads:
        diff = (payload.get("data") or {}).get("diff")
        if not isinstance(diff, list):
            continue
        
        for row in diff:
            code_raw = str(row.get("f12", "")).strip()
            if not code_raw:
                continue
            
            market_flag = row.get("f13")
            try:
                mf = int(market_flag)
            except (TypeError, ValueError):
                mf = -1
            
            # 判断交易所：参考原作者 market-heatmap.ts 的 decodeEastmoneySymbol
            # f13=1 → SH；代码以 4/8/9 开头 → BJ（北交所）；其余 → SZ
            if mf == 1:
                exchange = "SH"
            elif code_raw.startswith(("4", "8", "9")):
                exchange = "BJ"
            else:
                exchange = "SZ"
            
            full_code = f"{code_raw}.{exchange}"
            if full_code in seen_codes:
                continue
            seen_codes.add(full_code)
            
            # 安全转换数值
            price = _safe_float(row.get("f2"))
            change_pct = _safe_float(row.get("f3"))
            total_cap = _safe_float(row.get("f20"))
            float_cap = _safe_float(row.get("f21"))
            name = str(row.get("f14", "")).strip()
            raw_industry = str(row.get("f100", "")).strip()
            
            # 跳过无效数据
            if price <= 0:
                continue
            
            stocks.append({
                "code": full_code,
                "exchange": exchange,
                "name": name,
                "price": price,
                "changePct": change_pct,
                "totalMarketCap": total_cap,
                "floatMarketCap": float_cap,
                "rawIndustry": raw_industry,  # f100：东方财富二级行业
            })
    
    return stocks


def load_subboards():
    """读取现有 subboards.json，返回 code → {sectorName, subBoardName} 映射"""
    if not os.path.exists(SUBBOARDS_PATH):
        return {}
    try:
        with open(SUBBOARDS_PATH, encoding="utf-8") as f:
            data = json.load(f)
        return data.get("subboards", {})
    except Exception:
        return {}


def build_sub_to_sector_mapping(subboard_map):
    """从 subboards.json 数据构建 二级行业名 → 一级行业名 的映射表。
    
    东方财富 f100 字段返回的是申万二级行业名（如"半导体"），
    但有时会带 "Ⅱ" 后缀（如"IT服务Ⅱ"），需要去掉后缀后才能匹配。
    
    返回两个 dict：
    - sub_to_sector: 二级行业名 → 一级行业名
    - sub_to_sector_no_suffix: 去掉Ⅱ后缀的二级行业名 → 一级行业名（备用查找）
    """
    sub_to_sector = {}
    for info in subboard_map.values():
        sub_name = info.get("subBoardName", "")
        sector_name = info.get("sectorName", "")
        if sub_name and sector_name:
            sub_to_sector[sub_name] = sector_name
    
    # 构建去Ⅱ后缀的备用映射
    sub_to_sector_no_suffix = {}
    for sub_name, sector_name in sub_to_sector.items():
        key = sub_name.replace("Ⅱ", "").replace("Ⅰ", "").strip()
        if key and key not in sub_to_sector_no_suffix:
            sub_to_sector_no_suffix[key] = sector_name
    
    return sub_to_sector, sub_to_sector_no_suffix


def lookup_sector(raw_industry, sub_to_sector, sub_to_sector_no_suffix):
    """根据 f100 二级行业名查找申万一级行业名。
    
    查找顺序：
    1. 直接匹配（如"半导体"→"电子"）
    2. 去掉Ⅱ后缀匹配（如"IT服务Ⅱ"→"IT服务"→"计算机"）
    3. 模糊匹配（原始名包含映射表中的某个key）
    4. 找不到返回 None
    """
    if not raw_industry or raw_industry == "-":
        return None
    
    # 1. 直接匹配
    sector = sub_to_sector.get(raw_industry)
    if sector:
        return sector
    
    # 2. 去Ⅱ后缀匹配
    key = raw_industry.replace("Ⅱ", "").replace("Ⅰ", "").strip()
    if key != raw_industry:
        sector = sub_to_sector.get(key) or sub_to_sector_no_suffix.get(key)
        if sector:
            return sector
    
    # 3. 模糊匹配：原始名包含映射表中的某个key（或反过来）
    for sub_name, sector_name in sub_to_sector.items():
        if raw_industry in sub_name or sub_name in raw_industry:
            return sector_name
    
    return None


def merge_with_existing(new_stocks, existing_data):
    """将新拉取的股票列表与现有数据合并，保留行业分类信息。
    
    优先级：existing stocks-fallback.json → subboards.json → f100字段映射 → "其他"
    """
    # 加载现有股票数据
    existing_map = {}
    if existing_data and existing_data.get("stocks"):
        existing_map = {s["code"]: s for s in existing_data["stocks"]}
    
    # 加载 subboards.json（行业分类映射）
    subboard_map = load_subboards()
    # 构建二级→一级行业映射表
    sub_to_sector, sub_to_sector_no_suffix = build_sub_to_sector_mapping(subboard_map)
    
    new_count = 0
    f100_assigned = 0
    
    for stock in new_stocks:
        old = existing_map.get(stock["code"])
        if old and old.get("boardName"):
            # 优先使用现有 stocks-fallback.json 中的行业分类
            stock["boardName"] = old["boardName"]
        elif stock["code"] in subboard_map:
            # 其次使用 subboards.json 中的行业分类
            stock["boardName"] = subboard_map[stock["code"]].get("sectorName", "其他")
        else:
            # 新股：尝试用 f100 字段映射行业
            raw_industry = stock.get("rawIndustry", "")
            sector = lookup_sector(raw_industry, sub_to_sector, sub_to_sector_no_suffix)
            if sector:
                stock["boardName"] = sector
                f100_assigned += 1
            else:
                stock["boardName"] = "其他"
            new_count += 1
            industry_info = f" 行业={sector or raw_industry or '未知'}"
            log(f"  🆕 发现新股: {stock['code']} {stock['name']} 价格={stock['price']}{industry_info}")
    
    if new_count > 0:
        other_count = new_count - f100_assigned
        log(f"  新股行业分类: {f100_assigned}/{new_count} 只通过 f100 字段成功映射，{other_count} 只标记为 '其他'")
    
    return new_stocks


def fetch_stock_detail(code):
    """用东方财富个股接口查询单只股票状态，返回 (name, price, is_suspended) 或 None（退市）"""
    symbol, exchange = code.split(".")
    secid = f"{'1' if exchange == 'SH' else '0'}.{symbol}"
    # 从 EASTMONEY_STOCK_GET_URL 提取 path，避免硬编码 host 字符串
    stock_get_path = "/" + EASTMONEY_STOCK_GET_URL.split("/", 3)[3]  # 去掉 https://host 部分
    query = (
        f"?secid={secid}"
        f"&ut={EASTMONEY_UT}&fltt=2&invt=2"
        f"&fields=f57,f58,f43,f152,f46"
    )
    for attempt in range(EASTMONEY_MAX_ATTEMPTS):
        host = EASTMONEY_CLIST_HOSTS[attempt % len(EASTMONEY_CLIST_HOSTS)]
        url_attempt = f"https://{host}{stock_get_path}{query}"
        try:
            req = Request(url_attempt, headers=EASTMONEY_HEADERS)
            resp = urlopen(req, timeout=EASTMONEY_TIMEOUT)
            data = json.loads(resp.read().decode("utf-8"))
            d = data.get("data") or {}
            name = str(d.get("f58", "")).strip()
            price = d.get("f43")
            status = d.get("f152", -1)
            if not name:
                return None  # API 返回空数据 → 退市
            # f152: 1=正常, 2=停牌, 0=退市
            if price == "-" or price is None:
                return (name, 0.0, True)
            return (name, float(price), status == 2)
        except Exception:
            if attempt < EASTMONEY_MAX_ATTEMPTS - 1:
                time.sleep(0.5 * (attempt + 1))
    return None


def check_suspended_stocks(new_codes, existing_data):
    """检查旧数据中「旧有新无」的股票是否只是停牌而非退市。
    
    东方财富 clist 接口不返回停牌股票，所以需要用个股接口逐一验证。
    如果个股接口能查到数据 → 停牌（保留）；查不到 → 退市（移除）。
    
    返回需要保留的停牌股票列表。
    """
    if not existing_data or not existing_data.get("stocks"):
        return []
    
    existing_map = {s["code"]: s for s in existing_data["stocks"]}
    missing_codes = [c for c in existing_map if c not in new_codes]
    
    if not missing_codes:
        return []
    
    log(f"  检查 {len(missing_codes)} 只旧有新无的股票（可能是停牌或退市）...")
    
    suspended = []
    delisted = []
    for code in missing_codes:
        old_info = existing_map[code]
        result = fetch_stock_detail(code)
        if result is None:
            delisted.append(code)
        else:
            name, price, is_suspended = result
            log(f"    🔄 停牌保留: {code} {name} (价格={price})")
            stock = {
                "code": code,
                "exchange": old_info.get("exchange", code.split(".")[1]),
                "name": name,
                "price": price,
                "changePct": 0.0,  # 停牌无涨跌幅
                "totalMarketCap": old_info.get("totalMarketCap", 0),
                "floatMarketCap": old_info.get("floatMarketCap", 0),
            }
            suspended.append(stock)
    
    if delisted:
        log(f"  🗑 确认退市 {len(delisted)} 只: {', '.join(delisted[:5])}{'...' if len(delisted) > 5 else ''}")
    if suspended:
        log(f"  🔄 停牌保留 {len(suspended)} 只")
    
    return suspended


def update_stock_list():
    """步骤 1：用 clist 分页接口获取全 A 股列表 + 更新价格"""
    log("=== 步骤 1：获取全 A 股列表 + 更新价格（clist 分页接口）===")
    
    # 读取现有数据（用于保留行业分类和检测停牌股票）
    existing = None
    if os.path.exists(FALLBACK_PATH):
        try:
            with open(FALLBACK_PATH, encoding="utf-8") as f:
                existing = json.load(f)
            log(f"  现有数据: {existing.get('stockCount', '?')} 只股票")
        except Exception as e:
            log(f"  读取现有文件失败: {e}")
    
    # 拉取全 A 股列表
    payloads = fetch_all_stocks_clist()
    new_stocks = parse_clist_stocks(payloads)
    log(f"  解析出 {len(new_stocks)} 只股票")
    
    if not new_stocks:
        log("  ❌ 没有获取到任何股票数据")
        return None
    
    new_codes = {s["code"] for s in new_stocks}
    
    # 检查停牌股票（旧有新无的，用个股接口验证）
    suspended_stocks = check_suspended_stocks(new_codes, existing)
    if suspended_stocks:
        new_stocks.extend(suspended_stocks)
        log(f"  加上停牌股票后共 {len(new_stocks)} 只")
    
    # 合并现有数据（保留行业分类）
    merged_stocks = merge_with_existing(new_stocks, existing)
    
    # 统计板块数
    board_count = len(set(s.get("boardName", "其他") for s in merged_stocks))
    
    now_iso = datetime.now(timezone.utc).isoformat()
    fallback_data = {
        "updatedAt": now_iso,
        "stockCount": len(merged_stocks),
        "boardCount": board_count,
        "stocks": merged_stocks,
    }
    
    # 写入文件
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(FALLBACK_PATH, "w", encoding="utf-8") as f:
        json.dump(fallback_data, f, ensure_ascii=False)
    log(f"  ✅ 已写入 {FALLBACK_PATH}（{len(merged_stocks)} 只股票，{board_count} 个板块）")
    
    return fallback_data


# ============ 步骤 2：用 f100 数据更新行业分类 + AKShare 更新成分股 ============

def update_industry_and_constituents():
    """步骤 2：用 f100 数据更新 subboards.json，用 AKShare 更新成分股。
    
    行业分类不再依赖 akshare 的申万接口（已失效），
    而是直接用步骤 1 中东方财富 clist 接口返回的 f100 字段（申万二级行业），
    通过现有 subboards.json 的二级→一级映射表转换为一级行业。
    """
    log("\n=== 步骤 2：更新行业分类（f100）和成分股（AKShare）===")

    # 读取步骤 1 写入的文件（包含 rawIndustry 字段）
    if not os.path.exists(FALLBACK_PATH):
        log("  stocks-fallback.json 不存在，跳过")
        return

    with open(FALLBACK_PATH, encoding="utf-8") as f:
        fallback_data = json.load(f)

    stocks = fallback_data["stocks"]
    now_iso = datetime.now(timezone.utc).isoformat()

    # --- 2a: 用 f100 数据更新 subboards.json ---
    log("  正在用 f100 字段更新行业分类...")
    
    # 加载现有 subboards.json
    existing_subboards = load_subboards()
    # 构建二级→一级行业映射表
    sub_to_sector, sub_to_sector_no_suffix = build_sub_to_sector_mapping(existing_subboards)
    
    # 用 f100 数据构建新的 subboard 映射
    new_subboard_map = {}
    f100_matched = 0
    f100_unmatched = 0
    unmatched_industries = set()
    
    for stock in stocks:
        code = stock["code"]
        raw_industry = stock.get("rawIndustry", "")
        
        # 如果现有 subboards.json 已有该股票的行业数据，保留
        if code in existing_subboards:
            new_subboard_map[code] = existing_subboards[code]
            continue
        
        # 新股票：用 f100 查找一级行业
        if raw_industry and raw_industry != "-":
            sector = lookup_sector(raw_industry, sub_to_sector, sub_to_sector_no_suffix)
            if sector:
                new_subboard_map[code] = {
                    "sectorName": sector,
                    "subBoardName": raw_industry.replace("Ⅱ", "").replace("Ⅰ", "").strip(),
                }
                f100_matched += 1
            else:
                f100_unmatched += 1
                unmatched_industries.add(raw_industry)
        else:
            f100_unmatched += 1
    
    log(f"  f100 行业分类: {f100_matched} 只匹配成功，{f100_unmatched} 只未匹配")
    if unmatched_industries:
        log(f"  未匹配的二级行业名: {', '.join(sorted(unmatched_industries)[:10])}{'...' if len(unmatched_industries) > 10 else ''}")
    
    # 合并：现有 subboards + 新增
    merged_subboards = {**existing_subboards, **new_subboard_map}
    new_count = len(merged_subboards) - len(existing_subboards)
    
    subboards_data = {
        "updatedAt": now_iso,
        "count": len(merged_subboards),
        "subboards": merged_subboards,
    }
    with open(SUBBOARDS_PATH, "w", encoding="utf-8") as f:
        json.dump(subboards_data, f, ensure_ascii=False)
    log(f"  已写入 {SUBBOARDS_PATH}（{len(merged_subboards)} 条，新增 {new_count} 条）")
    
    # --- 2b: 更新 stocks-fallback.json 的 boardName（用新的 subboards 数据）---
    for stock in stocks:
        mapped = merged_subboards.get(stock["code"])
        if mapped:
            stock["boardName"] = mapped["sectorName"]
        elif "boardName" not in stock:
            stock["boardName"] = "其他"
        # 清理 rawIndustry 字段（不写入 JSON）
        stock.pop("rawIndustry", None)
    
    board_count = len(set(s.get("boardName", "其他") for s in stocks))
    fallback_data["boardCount"] = board_count
    with open(FALLBACK_PATH, "w", encoding="utf-8") as f:
        json.dump(fallback_data, f, ensure_ascii=False)
    log(f"  已更新 {FALLBACK_PATH} 的行业分类（{board_count} 个板块）")
    
    # --- 2c: 更新成分股（AKShare）---
    try:
        import akshare as ak  # pyright: ignore[reportMissingImports]
    except ImportError:
        log("  AKShare 未安装，成分股用市值排序兜底")
        ak = None
    
    log("  正在拉取沪深 300 成分股...")
    hs300_codes = []
    if ak:
        try:
            hs300 = ak.index_stock_cons(symbol="000300")
            for _, row in hs300.iterrows():
                code = str(row["品种代码"]).zfill(6)
                if code.startswith(("60", "68", "9")):
                    exchange = "SH"
                else:
                    exchange = "SZ"
                hs300_codes.append(f"{code}.{exchange}")
            log(f"  沪深 300: {len(hs300_codes)} 只")
        except Exception as e:
            log(f"  沪深 300 拉取失败: {e}")
    
    log("  正在拉取中证 A500 成分股...")
    zza500_codes = []
    if ak:
        try:
            zza500 = ak.index_stock_cons(symbol="000510")
            for _, row in zza500.iterrows():
                code = str(row["品种代码"]).zfill(6)
                if code.startswith(("60", "68", "9")):
                    exchange = "SH"
                else:
                    exchange = "SZ"
                zza500_codes.append(f"{code}.{exchange}")
            log(f"  中证 A500: {len(zza500_codes)} 只")
        except Exception as e:
            log(f"  中证 A500 拉取失败: {e}")
    
    # 成分股拉取失败时用市值排序兜底
    if not hs300_codes:
        log("  沪深 300 拉取失败，用市值排序兜底")
        sorted_stocks = sorted(stocks, key=lambda s: s.get("floatMarketCap", 0), reverse=True)
        hs300_codes = [s["code"] for s in sorted_stocks[:300]]
    if not zza500_codes:
        log("  中证 A500 拉取失败，用市值排序兜底")
        sorted_stocks = sorted(stocks, key=lambda s: s.get("floatMarketCap", 0), reverse=True)
        zza500_codes = [s["code"] for s in sorted_stocks[:500]]
    
    constituents_data = {
        "updatedAt": now_iso,
        "hs300": hs300_codes,
        "zza500": zza500_codes,
    }
    with open(CONSTITUENTS_PATH, "w", encoding="utf-8") as f:
        json.dump(constituents_data, f, ensure_ascii=False)
    log(f"  已写入 {CONSTITUENTS_PATH}")


# ============ 主入口 ============

def main():
    os.makedirs(DATA_DIR, exist_ok=True)

    # 步骤 1：用 clist 分页接口获取全 A 股列表 + 更新价格（核心）
    result = update_stock_list()
    if result is None:
        log("\n⚠ 步骤 1 失败，保留旧文件")
        sys.exit(1)
    else:
        log("\n✅ 步骤 1 完成：股票列表和价格已更新")

    # 步骤 2：用 f100 数据更新行业分类 + AKShare 更新成分股（辅助，失败不影响步骤 1）
    try:
        update_industry_and_constituents()
        log("\n✅ 步骤 2 完成：行业分类和成分股已更新")
    except Exception as e:
        log(f"\n⚠ 步骤 2 失败: {e}")
        log("  价格已在步骤 1 更新，行业分类保持旧值")

    log("\n全部完成！")


if __name__ == "__main__":
    main()
