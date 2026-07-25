#!/usr/bin/env python3
"""股市矩阵 — 股票数据抓取脚本

两步独立执行，互不影响：
  步骤 1（核心）：用东方财富 HTTP API 直接更新价格、涨跌幅、市值（不依赖 AKShare）
  步骤 2（辅助）：用 AKShare 更新行业分类和成分股（失败不影响步骤 1）

输出三个 JSON 文件：
- src/lib/data/stocks-fallback.json
- src/lib/data/subboards.json
- src/lib/data/index-constituents.json

使用方法：
  pip install -r requirements.txt
  python scripts/fetch_stocks.py
"""
import json
import os
import sys
import time
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.error import URLError

# 东方财富批量行情 API（和运行时 fetchEastmoneyQuotes 用的是同一个接口）
EASTMONEY_QUOTE_URL = "https://push2.eastmoney.com/api/qt/ulist.np/get"
EASTMONEY_FIELDS = "f2,f3,f6,f12,f13,f14,f18,f20,f21,f24,f25,f109,f110,f124,f127,f160"
EASTMONEY_UT = "bd1d9ddb04089700cf9c27f6f7426281"
EASTMONEY_BATCH_SIZE = 300
EASTMONEY_TIMEOUT = 10

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


# ============ 步骤 1：用东方财富 HTTP API 更新价格（不依赖 AKShare） ============

def load_existing_fallback():
    """读取现有的 stocks-fallback.json，拿到股票代码列表"""
    if not os.path.exists(FALLBACK_PATH):
        return None
    try:
        with open(FALLBACK_PATH, encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        log(f"  读取现有 fallback 文件失败: {e}")
        return None


def fetch_eastmoney_batch(secids):
    """从东方财富拉取一批股票行情（和运行时 fetchEastmoneyQuotes 完全一样的接口）"""
    params = "&".join([
        f"secids={','.join(secids)}",
        f"ut={EASTMONEY_UT}",
        "fltt=2",
        "invt=2",
        f"fields={EASTMONEY_FIELDS}",
    ])
    url = f"{EASTMONEY_QUOTE_URL}?{params}"
    req = Request(url, headers=EASTMONEY_HEADERS)
    resp = urlopen(req, timeout=EASTMONEY_TIMEOUT)
    if resp.status != 200:
        raise RuntimeError(f"东方财富返回 HTTP {resp.status}")
    return json.loads(resp.read().decode("utf-8"))


def parse_eastmoney_response(payload):
    """解析东方财富返回的 JSON，提取 price/changePct/marketCap"""
    quotes = {}
    diff = (payload.get("data") or {}).get("diff")
    if not isinstance(diff, list):
        return quotes

    for row in diff:
        code_raw = str(row.get("f12", "")).strip()
        if not code_raw:
            continue
        market_flag = row.get("f13")
        # f13=1 → SH, f13=0 → SZ, 其他按代码前缀判断
        try:
            mf = int(market_flag)
        except (TypeError, ValueError):
            mf = -1
        if mf == 1:
            exchange = "SH"
        elif mf == 0:
            exchange = "SZ"
        elif code_raw.startswith(("60", "68", "9")):
            exchange = "SH"
        elif code_raw.startswith(("00", "30", "20")):
            exchange = "SZ"
        else:
            exchange = "BJ"
        full_code = f"{code_raw}.{exchange}"

        price = row.get("f2")
        change_pct = row.get("f3")
        # f20=总市值, f21=流通市值，不互相 fallback
        total_cap = row.get("f20")
        float_cap = row.get("f21")

        quotes[full_code] = {
            "price": float(price) if price and price != "-" else 0,
            "changePct": float(change_pct) if change_pct and change_pct != "-" else 0,
            "totalMarketCap": float(total_cap) if total_cap and total_cap != "-" else 0,
            "floatMarketCap": float(float_cap) if float_cap and float_cap != "-" else 0,
            "name": str(row.get("f14", "")).strip(),
        }
    return quotes


def update_prices():
    """步骤 1：用东方财富 HTTP API 更新所有股票的价格、涨跌幅、市值"""
    log("=== 步骤 1：更新价格（东方财富 HTTP API，不依赖 AKShare）===")

    existing = load_existing_fallback()
    if not existing or not existing.get("stocks"):
        log("  没有现有 fallback 文件或股票列表为空，跳过价格更新")
        log("  （首次运行需要 AKShare 拉取股票列表，后续运行才用东方财富更新价格）")
        return None

    stocks = existing["stocks"]
    log(f"  从现有文件读取 {len(stocks)} 只股票代码")

    # 构建 secid 列表（格式：1.600519 或 0.000001）
    secid_to_code = {}
    for stock in stocks:
        code = stock["code"]
        symbol, exchange = code.split(".")
        secid = f"{'1' if exchange == 'SH' else '0'}.{symbol}"
        secid_to_code[secid] = code

    all_secids = list(secid_to_code.keys())

    # 分批请求
    batches = []
    for i in range(0, len(all_secids), EASTMONEY_BATCH_SIZE):
        batches.append(all_secids[i:i + EASTMONEY_BATCH_SIZE])

    log(f"  分 {len(batches)} 批请求东方财富（每批 {EASTMONEY_BATCH_SIZE} 只）...")

    all_quotes = {}
    failed_batches = 0

    for i, batch in enumerate(batches):
        try:
            payload = fetch_eastmoney_batch(batch)
            batch_quotes = parse_eastmoney_response(payload)
            all_quotes.update(batch_quotes)
            log(f"    批次 {i+1}/{len(batches)}: 获取 {len(batch_quotes)} 只")
        except Exception as e:
            log(f"    批次 {i+1}/{len(batches)} 失败: {e}")
            failed_batches += 1
            time.sleep(1)  # 失败后等 1 秒再试下一批

    if failed_batches > 0:
        log(f"  {failed_batches}/{len(batches)} 批失败")

    # 校验：获取到的股票数量必须达到 90%
    min_required = len(stocks) * 0.9
    if len(all_quotes) < min_required:
        log(f"  ❌ 校验失败：只获取到 {len(all_quotes)} 只（需要 >= {int(min_required)}）")
        log(f"  保留旧文件不覆盖")
        return None

    log(f"  ✅ 校验通过：获取到 {len(all_quotes)} 只股票")

    # 更新价格数据
    updated_count = 0
    for stock in stocks:
        quote = all_quotes.get(stock["code"])
        if not quote:
            continue
        # 校验单只股票数据合理性
        if quote["price"] <= 0:
            continue
        if abs(quote["changePct"]) > 20:
            continue  # 涨跌幅超过 20% 很可能是异常数据
        stock["price"] = quote["price"]
        stock["changePct"] = quote["changePct"]
        if quote["totalMarketCap"] > 0:
            stock["totalMarketCap"] = quote["totalMarketCap"]
        if quote["floatMarketCap"] > 0:
            stock["floatMarketCap"] = quote["floatMarketCap"]
        if quote["name"]:
            stock["name"] = quote["name"]
        updated_count += 1

    log(f"  更新了 {updated_count}/{len(stocks)} 只股票的价格")

    now_iso = datetime.now(timezone.utc).isoformat()
    fallback_data = {
        "updatedAt": now_iso,
        "stockCount": len(stocks),
        "boardCount": existing.get("boardCount", 0),
        "stocks": stocks,
    }

    # 写入文件
    with open(FALLBACK_PATH, "w", encoding="utf-8") as f:
        json.dump(fallback_data, f, ensure_ascii=False)
    log(f"  已写入 {FALLBACK_PATH}")

    return fallback_data


# ============ 步骤 2：用 AKShare 更新行业分类和成分股（失败不影响步骤 1） ============

def update_industry_and_constituents():
    """步骤 2：用 AKShare 更新行业分类和成分股"""
    log("\n=== 步骤 2：更新行业分类和成分股（AKShare，失败不影响步骤 1）===")

    try:
        import akshare as ak  # pyright: ignore[reportMissingImports]
    except ImportError:
        log("  AKShare 未安装，跳过行业分类和成分股更新")
        log("  价格已在步骤 1 更新完毕，行业分类保持旧值")
        return

    # 读取步骤 1 写入的文件（或现有文件）
    if not os.path.exists(FALLBACK_PATH):
        log("  stocks-fallback.json 不存在，跳过")
        return

    with open(FALLBACK_PATH, encoding="utf-8") as f:
        fallback_data = json.load(f)

    stocks = fallback_data["stocks"]
    now_iso = datetime.now(timezone.utc).isoformat()

    # --- 2a: 更新申万一级行业分类 ---
    sector_map = {}
    try:
        log("  正在拉取申万一级行业分类...")
        sw_first = ak.sw_index_first_info()
        for _, sector_row in sw_first.iterrows():
            sector_name = str(sector_row["行业名称"]).strip()
            sector_code = str(sector_row["行业代码"]).strip()
            try:
                members = ak.index_component_sw(symbol=f"sw801{sector_code[-3:]}")
                for _, member in members.iterrows():
                    stock_code = str(member["证券代码"]).zfill(6)
                    if stock_code.startswith(("60", "68", "9")):
                        exchange = "SH"
                    elif stock_code.startswith(("00", "30", "20")):
                        exchange = "SZ"
                    else:
                        exchange = "BJ"
                    full_code = f"{stock_code}.{exchange}"
                    sector_map[full_code] = {
                        "sectorName": sector_name,
                        "subBoardName": sector_name,
                    }
                time.sleep(0.5)
            except Exception as e:
                log(f"    跳过行业 {sector_name}: {e}")

        log(f"  申万一级行业分类完成，共覆盖 {len(sector_map)} 只股票")

        # 给每只股票打上一级行业标签
        for stock in stocks:
            mapped = sector_map.get(stock["code"])
            if mapped:
                stock["boardName"] = mapped["sectorName"]
            elif "boardName" not in stock:
                stock["boardName"] = "其他"

    except Exception as e:
        log(f"  申万一级行业分类拉取失败: {e}")
        log(f"  行业分类保持旧值")

    # --- 2b: 更新申万二级行业分类 ---
    sub_board_map = {}
    try:
        log("  正在拉取申万二级行业分类...")
        sw_first_map = {}
        sw_first = ak.sw_index_first_info()
        for _, row in sw_first.iterrows():
            code = str(row["行业代码"]).strip()
            sw_first_map[code] = {"sectorName": str(row["行业名称"]).strip()}

        sw_second = ak.sw_index_second_info()
        for _, second_row in sw_second.iterrows():
            second_name = str(second_row["行业名称"]).strip()
            second_code = str(second_row["行业代码"]).strip()
            try:
                members = ak.index_component_sw(symbol=second_code)
                for _, member in members.iterrows():
                    stock_code = str(member["证券代码"]).zfill(6)
                    if stock_code.startswith(("60", "68", "9")):
                        exchange = "SH"
                    elif stock_code.startswith(("00", "30", "20")):
                        exchange = "SZ"
                    else:
                        exchange = "BJ"
                    full_code = f"{stock_code}.{exchange}"
                    first_code = second_code[:4] + "1" + second_code[-3:]
                    first_info = sw_first_map.get(first_code, {})
                    sector_name = first_info.get("sectorName", second_name)
                    sub_board_map[full_code] = {
                        "sectorName": sector_name,
                        "subBoardName": second_name,
                    }
                time.sleep(0.3)
            except Exception as e:
                log(f"    跳过二级行业 {second_name}: {e}")

        log(f"  申万二级行业分类完成，共覆盖 {len(sub_board_map)} 只股票")

        # 用二级行业覆盖一级行业
        for stock in stocks:
            mapped = sub_board_map.get(stock["code"])
            if mapped:
                stock["boardName"] = mapped["sectorName"]

    except Exception as e:
        log(f"  申万二级行业分类拉取失败: {e}")
        # 用一级行业作为二级
        for code, info in sector_map.items():
            sub_board_map[code] = {
                "sectorName": info["sectorName"],
                "subBoardName": info["sectorName"],
            }

    # --- 2c: 输出 subboards.json ---
    subboards_data = {
        "updatedAt": now_iso,
        "count": len(sub_board_map),
        "subboards": sub_board_map,
    }
    with open(SUBBOARDS_PATH, "w", encoding="utf-8") as f:
        json.dump(subboards_data, f, ensure_ascii=False)
    log(f"  已写入 {SUBBOARDS_PATH}")

    # --- 2d: 更新 stocks-fallback.json 的行业标签 ---
    board_count = len(set(s.get("boardName", "其他") for s in stocks))
    fallback_data["boardCount"] = board_count
    with open(FALLBACK_PATH, "w", encoding="utf-8") as f:
        json.dump(fallback_data, f, ensure_ascii=False)
    log(f"  已更新 {FALLBACK_PATH} 的行业分类（{board_count} 个板块）")

    # --- 2e: 更新成分股 ---
    log("  正在拉取沪深 300 成分股...")
    hs300_codes = []
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


# ============ 首次运行：没有现有 fallback 文件时用 AKShare 拉股票列表 ============

def initial_fetch_with_akshare():
    """首次运行：没有 stocks-fallback.json 时用 AKShare 拉取股票列表"""
    log("=== 首次运行：用 AKShare 拉取股票列表 ===")

    try:
        import akshare as ak  # pyright: ignore[reportMissingImports]
    except ImportError:
        log("❌ AKShare 未安装，且没有现有 fallback 文件")
        log("   请先运行: pip install -r requirements.txt")
        sys.exit(1)

    log("  正在拉取全 A 股列表...")
    df = ak.stock_zh_a_spot_em()
    stocks = []
    for _, row in df.iterrows():
        code = str(row["代码"]).zfill(6)
        if code.startswith(("60", "68", "9", "11", "13")):
            exchange = "SH"
        elif code.startswith(("00", "30", "20", "12", "14", "15")):
            exchange = "SZ"
        else:
            exchange = "BJ"
        stocks.append({
            "code": f"{code}.{exchange}",
            "exchange": exchange,
            "name": str(row["名称"]).strip(),
            "price": float(row.get("最新价", 0) or 0),
            "changePct": float(row.get("涨跌幅", 0) or 0),
            "totalMarketCap": float(row.get("总市值", 0) or 0),
            "floatMarketCap": float(row.get("流通市值", 0) or 0),
            "boardName": "其他",  # 先占位，步骤 2 会更新
        })
    log(f"  共拉取 {len(stocks)} 只股票")

    # 直接用 AKShare 返回的价格写入，后续步骤 1 会用东方财富 API 更新
    now_iso = datetime.now(timezone.utc).isoformat()
    fallback_data = {
        "updatedAt": now_iso,
        "stockCount": len(stocks),
        "boardCount": 1,
        "stocks": stocks,
    }
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(FALLBACK_PATH, "w", encoding="utf-8") as f:
        json.dump(fallback_data, f, ensure_ascii=False)
    log(f"  已写入 {FALLBACK_PATH}")
    return fallback_data


# ============ 主入口 ============

def main():
    os.makedirs(DATA_DIR, exist_ok=True)

    # 如果没有现有 fallback 文件，先走首次初始化
    if not os.path.exists(FALLBACK_PATH):
        initial_fetch_with_akshare()

    # 步骤 1：用东方财富 HTTP API 更新价格（核心，不依赖 AKShare）
    result = update_prices()
    if result is None:
        log("\n⚠ 步骤 1 失败，价格未更新（保留旧文件）")
    else:
        log("\n✅ 步骤 1 完成：价格已更新")

    # 步骤 2：用 AKShare 更新行业分类和成分股（辅助，失败不影响步骤 1）
    try:
        update_industry_and_constituents()
        log("\n✅ 步骤 2 完成：行业分类和成分股已更新")
    except Exception as e:
        log(f"\n⚠ 步骤 2 失败: {e}")
        log("  价格已在步骤 1 更新，行业分类保持旧值")

    log("\n全部完成！")


if __name__ == "__main__":
    main()
