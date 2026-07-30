#!/usr/bin/env python3
"""验证更新后的分类结果"""
import json
from collections import Counter

with open("src/lib/data/subboards.json", encoding="utf-8") as f:
    sb = json.load(f)["subboards"]
with open("src/lib/data/stocks-fallback.json", encoding="utf-8") as f:
    fb = json.load(f)

stocks = {s["code"]: s for s in fb["stocks"]}
print(f"股票总数: {fb['stockCount']}")
print(f"板块数: {fb['boardCount']}")
print()

print("=== 关键股票验证 ===")
check_codes = [
    "688146.SH", "688268.SH", "688106.SH", "688548.SH",
    "688755.SH", "002086.SZ", "300991.SZ", "688103.SH",
    "600036.SH", "601398.SH",
]
for code in check_codes:
    s = stocks.get(code)
    info = sb.get(code, {})
    if s:
        print(f"  {code} {s['name']}:")
        print(f"    boardName: {s.get('boardName', '?')}")
        print(f"    sectorName: {info.get('sectorName', '?')}")
        print(f"    subBoardName: {info.get('subBoardName', '?')}")
        print()

print("=== 板块分布 ===")
c = Counter(s.get("boardName", "?") for s in stocks.values())
for name, cnt in c.most_common():
    print(f"  {name}: {cnt}")
