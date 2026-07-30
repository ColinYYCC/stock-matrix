#!/usr/bin/env python3
"""检查二级行业分类错误是否影响一级行业"""
import json
import os

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "src", "lib", "data")
SUBBOARDS_PATH = os.path.join(DATA_DIR, "subboards.json")

with open(SUBBOARDS_PATH, encoding="utf-8") as f:
    sb_data = json.load(f)

subboards = sb_data["subboards"]

# 问题股票
problem_stocks = [
    ("688755.SH", "汉邦科技", "专用设备"),
    ("300991.SZ", "创益通", "其他电子Ⅱ"),
    ("688103.SH", "国力电子", "其他电子Ⅱ"),
    ("002086.SZ", "东方海洋", "农产品加工"),
    ("688146.SH", "中船特气", "半导体"),
]

print("=" * 60)
print("二级行业分类错误对一级行业的影响")
print("=" * 60)

for code, name, f127_sub in problem_stocks:
    sb = subboards.get(code, {})
    old_sector = sb.get("sectorName", "?")
    old_sub = sb.get("subBoardName", "?")

    # 判断 f127 的二级行业应该属于哪个一级行业
    # 简单判断：如果旧的一级行业和新的二级行业都还是同一级
    print(f"\n{code} {name}:")
    print(f"  旧分类: {old_sector}/{old_sub}")
    print(f"  实际二级行业: {f127_sub}")

    # 判断影响
    if "电子" in f127_sub or "半导体" in f127_sub:
        likely_sector = "电子"
    elif "专用设备" in f127_sub:
        likely_sector = "机械设备"
    elif "农产品" in f127_sub:
        likely_sector = "农林牧渔"
    else:
        likely_sector = "未知"

    print(f"  推测一级行业: {likely_sector}")
    if old_sector == likely_sector:
        print(f"  ✅ 一级行业正确，二级行业需要更新")
    else:
        print(f"  ❌ 一级行业也错误！")