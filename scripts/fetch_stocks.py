#!/usr/bin/env python3
"""股市矩阵 — 股票数据抓取脚本

用 AKShare 拉取以下数据：
1. 全 A 股列表（代码 / 名称 / 交易所）
2. 申万一级行业分类（31 个行业）
3. 申万二级行业分类
4. 沪深 300 真实成分股列表
5. 中证 A500 真实成分股列表
6. 从东方财富拉取总市值 / 流通市值

输出三个 JSON 文件：
- src/lib/data/stocks-fallback.json
- src/lib/data/subboards.json
- src/lib/data/index-constituents.json

使用方法：
  pip install akshare
  python scripts/fetch_stocks.py

注意：运行时不会影响网站运行，只是一个离线数据更新工具。
"""
import json
import os
import time
from datetime import datetime, timezone

import akshare as ak


def fetch_all_stocks():
    """拉取全 A 股列表，包括代码、名称、交易所"""
    print("正在拉取全 A 股列表...")
    df = ak.stock_zh_a_spot_em()
    stocks = []
    for _, row in df.iterrows():
        code = str(row["代码"]).zfill(6)
        # 根据代码前缀判断交易所
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
        })
    print(f"共拉取 {len(stocks)} 只股票")
    return stocks


def fetch_sw_sector_mapping(stocks):
    """用申万行业分类给每只股票打上行业标签"""
    print("正在拉取申万一级行业分类...")
    # 拉取申万一级行业分类
    sw_first = ak.sw_index_first_info()
    sector_stocks_map = {}

    for _, sector_row in sw_first.iterrows():
        sector_name = str(sector_row["行业名称"]).strip()
        sector_code = str(sector_row["行业代码"]).strip()
        try:
            # 拉取该行业下的所有股票
            members = ak.index_component_sw(symbol=f"sw801{sector_code[-3:]}")
            for _, member in members.iterrows():
                stock_code = str(member["证券代码"]).zfill(6)
                # 判断交易所
                if stock_code.startswith(("60", "68", "9")):
                    exchange = "SH"
                elif stock_code.startswith(("00", "30", "20")):
                    exchange = "SZ"
                else:
                    exchange = "BJ"
                full_code = f"{stock_code}.{exchange}"
                sector_stocks_map[full_code] = {
                    "sectorName": sector_name,
                    "subBoardName": sector_name,  # 先占位，后面二级行业会覆盖
                }
            time.sleep(0.5)  # 避免请求太快被限制
        except Exception as e:
            print(f"  跳过行业 {sector_name}: {e}")

    print(f"申万一级行业分类完成，共覆盖 {len(sector_stocks_map)} 只股票")
    return sector_stocks_map


def fetch_sw_second_sector_mapping():
    """拉取申万二级行业分类"""
    print("正在拉取申万二级行业分类...")
    sw_second = ak.sw_index_second_info()
    sub_board_map = {}

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
                # 找对应的一级行业名
                first_code = second_code[:4] + "1" + second_code[-3:]
                first_info = sw_first_map.get(first_code, {})
                sector_name = first_info.get("sectorName", second_name)
                sub_board_map[full_code] = {
                    "sectorName": sector_name,
                    "subBoardName": second_name,
                }
            time.sleep(0.3)
        except Exception as e:
            print(f"  跳过二级行业 {second_name}: {e}")

    print(f"申万二级行业分类完成，共覆盖 {len(sub_board_map)} 只股票")
    return sub_board_map


def fetch_index_constituents():
    """拉取沪深 300 和中证 A500 真实成分股"""
    print("正在拉取沪深 300 成分股...")
    try:
        hs300 = ak.index_stock_cons(symbol="000300")
        hs300_codes = []
        for _, row in hs300.iterrows():
            code = str(row["品种代码"]).zfill(6)
            if code.startswith(("60", "68", "9")):
                exchange = "SH"
            else:
                exchange = "SZ"
            hs300_codes.append(f"{code}.{exchange}")
        print(f"沪深 300: {len(hs300_codes)} 只")
    except Exception as e:
        print(f"沪深 300 拉取失败: {e}")
        hs300_codes = []

    print("正在拉取中证 A500 成分股...")
    try:
        zza500 = ak.index_stock_cons(symbol="000510")
        zza500_codes = []
        for _, row in zza500.iterrows():
            code = str(row["品种代码"]).zfill(6)
            if code.startswith(("60", "68", "9")):
                exchange = "SH"
            else:
                exchange = "SZ"
            zza500_codes.append(f"{code}.{exchange}")
        print(f"中证 A500: {len(zza500_codes)} 只")
    except Exception as e:
        print(f"中证 A500 拉取失败: {e}")
        zza500_codes = []

    return hs300_codes, zza500_codes


def main():
    base_dir = os.path.join(os.path.dirname(__file__), "..", "src", "lib", "data")
    os.makedirs(base_dir, exist_ok=True)

    now_iso = datetime.now(timezone.utc).isoformat()

    # 1. 拉取全 A 股列表
    stocks = fetch_all_stocks()

    # 2. 拉取申万一级行业分类
    sector_map = fetch_sw_sector_mapping(stocks)

    # 3. 给每只股票打上一级行业标签
    for stock in stocks:
        mapped = sector_map.get(stock["code"])
        if mapped:
            stock["boardName"] = mapped["sectorName"]
        else:
            # 没找到行业分类的，用"其他"兜底
            stock["boardName"] = "其他"

    # 4. 拉取二级行业分类（如果可用）
    try:
        global sw_first_map
        sw_first = ak.sw_index_first_info()
        sw_first_map = {}
        for _, row in sw_first.iterrows():
            code = str(row["行业代码"]).strip()
            sw_first_map[code] = {"sectorName": str(row["行业名称"]).strip()}

        sub_board_map = fetch_sw_second_sector_mapping()
        # 用二级行业覆盖一级行业
        for stock in stocks:
            mapped = sub_board_map.get(stock["code"])
            if mapped:
                sector_name = mapped["sectorName"]
                sub_name = mapped["subBoardName"]
                stock["boardName"] = sector_name
                # subBoardName 不放在 stocks 里，放在 subboards.json
    except Exception as e:
        print(f"二级行业分类拉取失败，使用一级行业作为二级: {e}")
        sub_board_map = {}
        for code, info in sector_map.items():
            sub_board_map[code] = {
                "sectorName": info["sectorName"],
                "subBoardName": info["sectorName"],
            }

    # 5. 输出 stocks-fallback.json
    board_count = len(set(s["boardName"] for s in stocks))
    fallback_data = {
        "updatedAt": now_iso,
        "stockCount": len(stocks),
        "boardCount": board_count,
        "stocks": [
            {
                "code": s["code"],
                "exchange": s["exchange"],
                "name": s["name"],
                "boardName": s["boardName"],
                "price": s["price"],
                "changePct": s["changePct"],
                "totalMarketCap": s["totalMarketCap"],
                "floatMarketCap": s["floatMarketCap"],
            }
            for s in stocks
        ],
    }
    fallback_path = os.path.join(base_dir, "stocks-fallback.json")
    with open(fallback_path, "w", encoding="utf-8") as f:
        json.dump(fallback_data, f, ensure_ascii=False)
    print(f"已输出 {fallback_path}")

    # 6. 输出 subboards.json
    subboards_data = {
        "updatedAt": now_iso,
        "count": len(sub_board_map),
        "subboards": sub_board_map,
    }
    subboards_path = os.path.join(base_dir, "subboards.json")
    with open(subboards_path, "w", encoding="utf-8") as f:
        json.dump(subboards_data, f, ensure_ascii=False)
    print(f"已输出 {subboards_path}")

    # 7. 拉取并输出 index-constituents.json
    hs300_codes, zza500_codes = fetch_index_constituents()

    # 如果拉取失败，用市值排序兜底
    if not hs300_codes:
        print("沪深 300 拉取失败，用市值排序兜底")
        sorted_stocks = sorted(stocks, key=lambda s: s["floatMarketCap"], reverse=True)
        hs300_codes = [s["code"] for s in sorted_stocks[:300]]
    if not zza500_codes:
        print("中证 A500 拉取失败，用市值排序兜底")
        sorted_stocks = sorted(stocks, key=lambda s: s["floatMarketCap"], reverse=True)
        zza500_codes = [s["code"] for s in sorted_stocks[:500]]

    constituents_data = {
        "updatedAt": now_iso,
        "hs300": hs300_codes,
        "zza500": zza500_codes,
    }
    constituents_path = os.path.join(base_dir, "index-constituents.json")
    with open(constituents_path, "w", encoding="utf-8") as f:
        json.dump(constituents_data, f, ensure_ascii=False)
    print(f"已输出 {constituents_path}")

    print("\n全部完成！")


if __name__ == "__main__":
    main()
