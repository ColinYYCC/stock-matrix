#!/usr/bin/env python3
"""从 stocks-fallback.json 按流通市值排序提取 HS300/A500 成分股列表。

这个脚本不依赖任何第三方库，只是从已有的快照数据中提取。
更完整版本（用 AKShare 拉取真实成分股）见 fetch_stocks.py。
"""
import json
import os

def main():
    base_dir = os.path.join(os.path.dirname(__file__), "..", "src", "lib", "data")
    fallback_path = os.path.join(base_dir, "stocks-fallback.json")
    output_path = os.path.join(base_dir, "index-constituents.json")

    with open(fallback_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    stocks = data["stocks"]
    # 按流通市值降序排列
    sorted_stocks = sorted(stocks, key=lambda s: s.get("floatMarketCap", 0), reverse=True)

    hs300_codes = [s["code"] for s in sorted_stocks[:300]]
    zza500_codes = [s["code"] for s in sorted_stocks[:500]]

    result = {
        "updatedAt": data.get("updatedAt", ""),
        "hs300": hs300_codes,
        "zza500": zza500_codes,
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)

    print(f"HS300: {len(hs300_codes)} stocks, A500: {len(zza500_codes)} stocks")

if __name__ == "__main__":
    main()
