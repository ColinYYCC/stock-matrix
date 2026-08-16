#!/usr/bin/env python3
"""股市矩阵 — 股票数据抓取脚本

两步独立执行，互不影响：
  步骤 1（核心）：用东方财富 clist 分页接口获取全 A 股列表（自动发现新股）+ 更新价格
           同时通过 f100（申万二级行业）做纯行业分类，映射到大板块
  步骤 2（辅助）：用分类结果更新 subboards.json，用 AKShare 更新成分股（失败不影响步骤 1）

纯行业分类逻辑：
  申万二级行业(f100) → INDUSTRY_TO_BOARD 映射表 → 大板块
  未匹配 → 沿用旧分类 → "其他"

输出三个 JSON 文件：
- src/lib/data/stocks-fallback.json  （股票列表 + 价格 + 大板块）
- src/lib/data/subboards.json     （每只股票的 大板块 + 子板块/二级行业）
- src/lib/data/index-constituents.json （沪深300/A500 成分股）

使用方法：
  pip install -r requirements.txt
  python scripts/fetch_stocks.py

设计参考：原作者 (wenyuanw/a-share-heatmap) 的 market-heatmap.ts 运行时代码，
使用 clist 分页接口 + 多主机轮换 + 并发请求来获取全 A 股列表。
"""
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from urllib.request import Request, urlopen

# ============ 东方财富 clist 接口配置 ============
# 多主机轮换：push2delay 主站延迟数据，不容易被限流
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

# 请求字段：f100=申万二级行业（用于纯行业分类）
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


# ============ 纯行业分类映射表 ============
# 申万二级行业(f100) → 大板块(boardName)
# 覆盖全部 130+ 个申万二级行业，简单、稳定、可维护
INDUSTRY_TO_BOARD = {
    # ===== 金融 (8) =====
    "国有大型银行": "金融", "股份制银行": "金融", "城商行": "金融",
    "农商行": "金融", "证券": "金融", "保险": "金融", "多元金融": "金融",
    "银行": "金融",

    # ===== 半导体 (1) =====
    "半导体": "半导体",

    # ===== 新能源 (5) =====
    "光伏设备": "新能源", "电池": "新能源", "风电设备": "新能源",
    "其他电源设备": "新能源", "电机": "新能源",

    # ===== AI与软件 (3) =====
    "IT服务": "AI与软件", "软件开发": "AI与软件", "互联网电商": "AI与软件",
    # 注意：计算机设备是硬件，归入消费电子

    # ===== 消费电子 (5) =====
    "消费电子": "消费电子", "光学光电子": "消费电子", "元件": "消费电子",
    "其他电子": "消费电子", "计算机设备": "消费电子",  # 计算机设备是硬件，归入消费电子

    # ===== 通信 (2) =====
    "通信设备": "通信", "通信服务": "通信",

    # ===== 汽车 (5) =====
    "汽车零部件": "汽车", "乘用车": "汽车", "商用车": "汽车",
    "摩托车及其他": "汽车", "汽车服务": "汽车",

    # ===== 国防航天 (5) =====
    "航空装备": "国防航天", "军工电子": "国防航天", "航天装备": "国防航天",
    "地面兵装": "国防航天", "航海装备": "国防航天",

    # ===== 医药制药 (5) =====
    "化学制药": "医药制药", "中药": "医药制药", "生物制品": "医药制药",
    "医药商业": "医药制药", "医疗服务": "医药制药",
    # 注意：动物保健应归入农林牧渔

    # ===== 医疗健康 (3) =====
    "医疗器械": "医疗健康", "医疗美容": "医疗健康", "化妆品": "医疗健康",

    # ===== 化工材料 (10) =====
    "化学制品": "化工材料", "化学原料": "化工材料", "农化制品": "化工材料",
    "化学纤维": "化工材料", "塑料": "化工材料", "橡胶": "化工材料",
    "非金属材料": "化工材料", "电子化学品": "化工材料", "玻璃玻纤": "化工材料",
    "炼化及贸易": "化工材料",

    # ===== 机械装备 (6) =====
    "通用设备": "机械装备", "专用设备": "机械装备", "工程机械": "机械装备",
    "轨交设备": "机械装备", "自动化设备": "机械装备", "油服工程": "机械装备",

    # ===== 食品饮料 (6) =====
    "白酒": "食品饮料", "调味发酵品": "食品饮料", "食品加工": "食品饮料",
    "饮料乳品": "食品饮料", "休闲食品": "食品饮料", "非白酒": "食品饮料",

    # ===== 消费零售 (17) =====
    "一般零售": "消费零售", "专业连锁": "消费零售", "贸易": "消费零售",
    "家居用品": "消费零售", "服装家纺": "消费零售", "纺织制造": "消费零售",
    "饰品": "消费零售", "珠宝首饰": "消费零售", "钟表": "消费零售",
    "包装印刷": "消费零售", "文娱用品": "消费零售", "造纸": "消费零售",
    "旅游及景区": "消费零售", "酒店餐饮": "消费零售", "小家电": "消费零售",
    "厨卫电器": "消费零售", "家电零部件": "消费零售",

    # ===== 资源周期 (13) =====
    "工业金属": "资源周期", "小金属": "资源周期", "能源金属": "资源周期",
    "贵金属": "资源周期", "煤炭开采": "资源周期", "焦炭": "资源周期",
    "油气开采": "资源周期", "普钢": "资源周期", "特钢": "资源周期",
    "冶钢原料": "资源周期", "燃气": "资源周期", "水泥": "资源周期",
    # 注意：油服工程是服务，归入机械装备

    # ===== 地产基建 (8) =====
    "房地产开发": "地产基建", "房地产服务": "地产基建", "房屋建设": "地产基建",
    "装修装饰": "地产基建", "基础建设": "地产基建", "专业工程": "地产基建",
    "工程咨询服务": "地产基建", "装修建材": "地产基建",

    # ===== 电力公用 (3) =====
    "电力": "电力公用", "电网设备": "电力公用", "环保设备": "电力公用",

    # ===== 传媒 (4) =====
    "游戏": "传媒", "影视院线": "传媒", "出版": "传媒", "电视广播": "传媒",

    # ===== 农林牧渔 (10) =====
    "养殖业": "农林牧渔", "种植业": "农林牧渔", "林业": "农林牧渔",
    "渔业": "农林牧渔", "饲料": "农林牧渔", "农业综合": "农林牧渔",
    "农产品加工": "农林牧渔", "农药兽药": "农林牧渔", "动物疫苗": "农林牧渔",
    "动物保健": "农林牧渔",  # 动物保健应归入农林牧渔

    # ===== 交运物流 (4) =====
    "航运港口": "交运物流", "航空机场": "交运物流", "铁路公路": "交运物流",
    "物流": "交运物流",

    # ===== 其他兜底 =====
    "照明设备": "消费电子",
    "广告营销": "传媒",
    "数字媒体": "传媒",
    "环境治理": "电力公用",
    "水处理": "电力公用",
    "专业服务": "消费零售",
    "综合": "综合",

    # ===== 补充缺失的子行业映射 =====
    "金属新材料": "化工材料",      # 新材料属于化工材料大类
    "教育": "传媒",               # 教育服务归入传媒
    "个护用品": "消费零售",        # 个人护理用品属于消费零售
    "白色家电": "消费零售",        # 空调、冰箱、洗衣机等大家电
    "黑色家电": "消费零售",        # 电视、音响等影音家电
    "体育": "消费零售",           # 体育用品属于消费零售
    "其他家电": "消费零售",        # 其他小家电归入消费零售
    "旅游零售": "消费零售",        # 免税店等旅游零售
}


def classify_by_industry(raw_industry):
    """根据申万二级行业名返回大板块名，未匹配返回 None"""
    if not raw_industry or raw_industry == "-":
        return None
    clean = raw_industry.replace("Ⅱ", "").replace("Ⅰ", "").strip()
    return INDUSTRY_TO_BOARD.get(clean)


# ============ 个别公司特殊处理白名单 ============
# 某些公司虽然属于某个申万二级行业，但实际业务重心在另一个板块
# 格式: { 股票代码: (目标大板块, 原因) }
STOCK_OVERRIDE = {
    # === 家电零部件 → 汽车（主营汽车热管理/汽车零部件）===
    "002050.SZ": ("汽车", "三花智控：新能源汽车热管理+制冷阀件"),
    "000404.SZ": ("消费零售", "长虹华意：冰箱压缩机，纯家电"),
    "600619.SH": ("汽车", "海立股份：汽车空调压缩机+新能源汽车零部件"),
    "002011.SZ": ("汽车", "盾安环境：新能源汽车热管理+制冷阀件"),

    # === 停牌股修正（无rawIndustry，需要强制覆盖）===
    "600439.SH": ("消费零售", "瑞贝卡：发制品，归入消费零售"),
    "920305.BJ": ("AI与软件", "云创退：IT服务，归入AI与软件"),
    "300333.SZ": ("消费电子", "兆日科技：计算机设备硬件，归入消费电子"),

    # === 高置信度修正：发电企业错配在新能源设备 ===
    "920239.BJ": ("电力公用", "长虹能源：发电企业，非设备制造商"),
    "688717.SH": ("电力公用", "艾罗能源：发电企业，非设备制造商"),
    "688429.SH": ("电力公用", "时创能源：发电企业，非设备制造商"),
    "688223.SH": ("电力公用", "晶科能源：发电企业，非设备制造商"),
    "688303.SH": ("电力公用", "大全能源：发电企业，非设备制造商"),
    "300438.SZ": ("电力公用", "鹏辉能源：发电企业，非设备制造商"),
    "000809.SZ": ("电力公用", "和展能源：发电企业，非设备制造商"),
    "000695.SZ": ("电力公用", "滨海能源：发电企业，非设备制造商"),

    # === 高置信度修正：医疗服务机构错配在医药制药 ===
    "603716.SH": ("医疗健康", "塞力医疗：医疗服务机构"),
    "603108.SH": ("医疗健康", "润达医疗：医疗服务机构"),
    "600763.SH": ("医疗健康", "通策医疗：口腔医疗服务"),
    "002622.SZ": ("医疗健康", "皓宸医疗：医疗服务机构"),
    "002173.SZ": ("医疗健康", "创新医疗：医疗服务机构"),

    # === 三次核实后修正：纯软件公司错配在消费电子 ===
    "300588.SZ": ("AI与软件", "熙菱信息：公安信息化软件，纯软件"),
    "300659.SZ": ("AI与软件", "中孚信息：信息安全软件，纯软件"),

    # === 其他需要特殊处理的公司 ===
    # （按需添加）
}


# ============ 步骤 1：东方财富 clist 分页接口 ============

def fetch_clist_page(page_num, max_retries=EASTMONEY_MAX_ATTEMPTS):
    """拉取 clist 接口的一页数据，带多主机轮换重试"""
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
    """用 clist 分页接口获取全 A 股列表，4 并发"""
    log("  正在拉取第一页以获取总数...")
    first_payload = fetch_clist_page(1)
    total = (first_payload.get("data") or {}).get("total", 0)
    if not total or total <= 0:
        raise RuntimeError(f"clist 返回的 total 无效: {total}")

    page_count = max(1, -(-total // EASTMONEY_PAGE_SIZE))
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
    """解析 clist 返回的 JSON，提取股票列表（含纯行业分类）"""
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

            price = _safe_float(row.get("f2"))
            change_pct = _safe_float(row.get("f3"))
            total_cap = _safe_float(row.get("f20"))
            float_cap = _safe_float(row.get("f21"))
            name = str(row.get("f14", "")).strip()
            name = name.replace("\uFF21", "A").replace("\uFF22", "B").replace("\u3000", " ")
            while "  " in name:
                name = name.replace("  ", " ")
            name = name.strip()
            raw_industry = str(row.get("f100", "")).strip()

            if price <= 0:
                continue

            # 纯行业分类
            board_name = classify_by_industry(raw_industry)

            # 个别公司特殊处理（白名单覆盖行业分类）
            if full_code in STOCK_OVERRIDE:
                override_board, _ = STOCK_OVERRIDE[full_code]
                board_name = override_board

            stocks.append({
                "code": full_code,
                "exchange": exchange,
                "name": name,
                "price": price,
                "changePct": change_pct,
                "totalMarketCap": total_cap,
                "floatMarketCap": float_cap,
                "rawIndustry": raw_industry,       # 申万二级行业（原始值，步骤2用）
                "boardName": board_name or "其他",   # 大板块（纯行业分类）
            })

    return stocks


def load_subboards():
    """读取现有 subboards.json"""
    if not os.path.exists(SUBBOARDS_PATH):
        return {}
    try:
        with open(SUBBOARDS_PATH, encoding="utf-8") as f:
            data = json.load(f)
        return data.get("subboards", {})
    except Exception:
        return {}


def merge_with_existing(new_stocks, existing_data):
    """将新拉取的股票列表与现有数据合并。

    分类优先级：
      1. 纯行业分类（INDUSTRY_TO_BOARD 匹配成功）
      2. 沿用旧分类（existing stocks-fallback.json 的 boardName）
      3. subboards.json 兜底
      4. "其他"
    """
    existing_map = {}
    if existing_data and existing_data.get("stocks"):
        existing_map = {s["code"]: s for s in existing_data["stocks"]}

    subboard_map = load_subboards()

    new_count = 0
    industry_assigned = 0
    fallback_assigned = 0

    for stock in new_stocks:
        old = existing_map.get(stock["code"])
        raw_industry = stock.get("rawIndustry", "")

        # 已在 parse_clist_stocks 中做了纯行业分类
        board_name = stock.get("boardName", "")

        if board_name and board_name != "其他":
            industry_assigned += 1
        elif old and old.get("boardName"):
            # 行业未匹配到具体大板块，沿用旧分类
            stock["boardName"] = old["boardName"]
            fallback_assigned += 1
        elif stock["code"] in subboard_map:
            stock["boardName"] = subboard_map[stock["code"]].get("sectorName", "其他")
            fallback_assigned += 1
        else:
            fallback_assigned += 1

        # 记录新股
        if not old:
            new_count += 1
            info = f" 行业={raw_industry or '未知'}→{stock['boardName']}"
            log(f"  🆕 发现新股: {stock['code']} {stock['name']} 价格={stock['price']}{info}")

    total = len(new_stocks)
    log(f"  纯行业分类: {industry_assigned}/{total} 只 ({industry_assigned/total*100:.1f}%)")
    if new_count > 0:
        log(f"    其中新股: {new_count} 只")

    return new_stocks


def fetch_stock_detail(code):
    """用东方财富个股接口查询单只股票状态，返回 (name, price, is_suspended) 或 None（退市）"""
    symbol, exchange = code.split(".")
    secid = f"{'1' if exchange == 'SH' else '0'}.{symbol}"
    stock_get_path = "/" + EASTMONEY_STOCK_GET_URL.split("/", 3)[3]
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
            name = name.replace("\uFF21", "A").replace("\uFF22", "B").replace("\u3000", " ")
            while "  " in name:
                name = name.replace("  ", " ")
            name = name.strip()
            price = d.get("f43")
            status = d.get("f152", -1)
            if not name:
                return None
            if price == "-" or price is None:
                return (name, 0.0, True)
            return (name, float(price), status == 2)
        except Exception:
            if attempt < EASTMONEY_MAX_ATTEMPTS - 1:
                time.sleep(0.5 * (attempt + 1))
    return None


def check_suspended_stocks(new_codes, existing_data):
    """检查旧数据中「旧有新无」的股票是否只是停牌而非退市"""
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
            # 停牌股票应用白名单覆盖
            board_name = old_info.get("boardName", "其他")
            if code in STOCK_OVERRIDE:
                board_name = STOCK_OVERRIDE[code][0]

            stock = {
                "code": code,
                "exchange": old_info.get("exchange", code.split(".")[1]),
                "name": name,
                "price": price,
                "changePct": 0.0,
                "totalMarketCap": old_info.get("totalMarketCap", 0),
                "floatMarketCap": old_info.get("floatMarketCap", 0),
                "rawIndustry": "",
                "boardName": board_name,
            }
            suspended.append(stock)

    if delisted:
        log(f"  🗑 确认退市 {len(delisted)} 只: {', '.join(delisted[:5])}{'...' if len(delisted) > 5 else ''}")
    if suspended:
        log(f"  🔄 停牌保留 {len(suspended)} 只")

    return suspended


def update_stock_list():
    """步骤 1：用 clist 分页接口获取全 A 股列表 + 更新价格 + 纯行业分类"""
    log("=== 步骤 1：获取全 A 股列表 + 更新价格 + 纯行业分类 ===")

    existing = None
    if os.path.exists(FALLBACK_PATH):
        try:
            with open(FALLBACK_PATH, encoding="utf-8") as f:
                existing = json.load(f)
            log(f"  现有数据: {existing.get('stockCount', '?')} 只股票")
        except Exception as e:
            log(f"  读取现有文件失败: {e}")

    payloads = fetch_all_stocks_clist()
    new_stocks = parse_clist_stocks(payloads)
    log(f"  解析出 {len(new_stocks)} 只股票")

    if not new_stocks:
        log("  ❌ 没有获取到任何股票数据")
        return None

    new_codes = {s["code"] for s in new_stocks}

    suspended_stocks = check_suspended_stocks(new_codes, existing)
    if suspended_stocks:
        new_stocks.extend(suspended_stocks)
        log(f"  加上停牌股票后共 {len(new_stocks)} 只")

    merged_stocks = merge_with_existing(new_stocks, existing)

    board_count = len(set(s.get("boardName", "其他") for s in merged_stocks))

    now_iso = datetime.now(timezone.utc).isoformat()
    fallback_data = {
        "updatedAt": now_iso,
        "stockCount": len(merged_stocks),
        "boardCount": board_count,
        "stocks": merged_stocks,
    }

    os.makedirs(DATA_DIR, exist_ok=True)
    with open(FALLBACK_PATH, "w", encoding="utf-8") as f:
        json.dump(fallback_data, f, ensure_ascii=False)
    log(f"  ✅ 已写入 {FALLBACK_PATH}（{len(merged_stocks)} 只股票，{board_count} 个板块）")

    return fallback_data


# ============ 步骤 2：更新 subboards.json + AKShare 成分股 ============

def update_industry_and_constituents():
    """步骤 2：用纯行业分类结果更新 subboards.json，用 AKShare 更新成分股。

    subboards.json 结构：
      { [股票代码]: { sectorName: "大板块名", subBoardName: "申万二级行业名" } }

    前端使用：
      - sectorName → 大板块分组（热力图顶层矩形）
      - subBoardName → 子板块/二级行业（热力图内层矩形）
    """
    log("\n=== 步骤 2：更新 subboards.json + 成分股（AKShare）===")

    if not os.path.exists(FALLBACK_PATH):
        log("  stocks-fallback.json 不存在，跳过")
        return

    with open(FALLBACK_PATH, encoding="utf-8") as f:
        fallback_data = json.load(f)

    stocks = fallback_data["stocks"]
    now_iso = datetime.now(timezone.utc).isoformat()

    # --- 2a: 用纯行业分类结果构建 subboards ---
    log("  正在构建 subboards.json（大板块 + 子板块/二级行业）...")

    existing_subboards = load_subboards()
    new_subboard_map = {}
    changed_count = 0

    for stock in stocks:
        code = stock["code"]
        board_name = stock.get("boardName", "其他")
        raw_industry = stock.get("rawIndustry", "")
        old_info = existing_subboards.get(code, {})
        old_sec = old_info.get("sectorName", "")
        old_sub = old_info.get("subBoardName", "")

        # subBoardName = 申万二级行业名（去 Ⅱ 后缀）
        sub_name = raw_industry.replace("Ⅱ", "").replace("Ⅰ", "").strip() if raw_industry and raw_industry != "-" else ""

        # 银行类特殊处理：保留旧的细分二级行业名
        if sub_name == "银行" and old_sub and old_sub != "银行":
            sub_name = old_sub

        # 白名单股票特殊处理：根据目标板块调整子板块名
        if code in STOCK_OVERRIDE:
            target_board, reason = STOCK_OVERRIDE[code]
            # 如果目标板块是汽车，且原行业是家电零部件，改为汽车零部件
            if target_board == "汽车" and sub_name == "家电零部件":
                sub_name = "汽车零部件"

        if not sub_name:
            sub_name = old_sub or board_name

        new_subboard_map[code] = {
            "sectorName": board_name,
            "subBoardName": sub_name,
        }

        if old_sec and (board_name != old_sec or sub_name != old_sub):
            changed_count += 1
            if changed_count <= 20:
                log(f"  🔄 {code} {stock['name']}: {old_sec}/{old_sub} → {board_name}/{sub_name}")

    log(f"  subboards: {len(new_subboard_map)} 条" + (f"，{changed_count} 条变更" if changed_count else ""))
    if changed_count > 20:
        log(f"  （仅显示前 20 条变更，其余 {changed_count - 20} 条已静默更新）")

    # 合并：保留已退市股票的旧条目
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

    # --- 2b: 清理临时字段 ---
    for stock in stocks:
        mapped = merged_subboards.get(stock["code"])
        if mapped:
            stock["boardName"] = mapped["sectorName"]
        elif "boardName" not in stock:
            stock["boardName"] = "其他"
        stock.pop("rawIndustry", None)

    board_count = len(set(s.get("boardName", "其他") for s in stocks))
    fallback_data["boardCount"] = board_count
    with open(FALLBACK_PATH, "w", encoding="utf-8") as f:
        json.dump(fallback_data, f, ensure_ascii=False)
    log(f"  已更新 {FALLBACK_PATH}（{board_count} 个板块）")

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

    result = update_stock_list()
    if result is None:
        log("\n⚠ 步骤 1 失败，保留旧文件")
        sys.exit(1)
    else:
        log("\n✅ 步骤 1 完成：股票列表、价格和行业分类已更新")

    try:
        update_industry_and_constituents()
        log("\n✅ 步骤 2 完成：subboards 和成分股已更新")
    except Exception as e:
        log(f"\n⚠ 步骤 2 失败: {e}")
        log("  价格已在步骤 1 更新，行业分类保持旧值")

    log("\n全部完成！")


if __name__ == "__main__":
    main()
