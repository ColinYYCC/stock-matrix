#!/usr/bin/env python3
"""深入检查分类逻辑中的潜在问题"""
import json
import os

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "src", "lib", "data")
SUBBOARDS_PATH = os.path.join(DATA_DIR, "subboards.json")
FALLBACK_PATH = os.path.join(DATA_DIR, "stocks-fallback.json")

with open(SUBBOARDS_PATH, encoding="utf-8") as f:
    sb_data = json.load(f)

with open(FALLBACK_PATH, encoding="utf-8") as f:
    fb_data = json.load(f)

subboards = sb_data["subboards"]
stocks = fb_data["stocks"]

# === 1. 构建二级→一级映射表，检查模糊匹配可能导致的错误 ===
sub_to_sector = {}
for info in subboards.values():
    sub_name = info.get("subBoardName", "")
    sector_name = info.get("sectorName", "")
    if sub_name and sector_name:
        sub_to_sector[sub_name] = sector_name

print("=" * 60)
print("=== 1. 模糊匹配可能导致的错误 ===")
print("=" * 60)

# 模拟 lookup_sector 的 step 3 模糊匹配
# 检查是否有 二级行业名A 包含 二级行业名B，但它们映射到不同的一级行业
sub_names = list(sub_to_sector.keys())
fuzzy_conflicts = []
for i, name_a in enumerate(sub_names):
    for name_b in sub_names:
        if name_a != name_b and name_a in name_b:
            sector_a = sub_to_sector[name_a]
            sector_b = sub_to_sector[name_b]
            if sector_a != sector_b:
                fuzzy_conflicts.append((name_a, sector_a, name_b, sector_b))

if fuzzy_conflicts:
    print(f"  发现 {len(fuzzy_conflicts)} 个潜在模糊匹配冲突:")
    for name_a, sec_a, name_b, sec_b in fuzzy_conflicts:
        print(f"    「{name_a}」({sec_a}) 是 「{name_b}」({sec_b}) 的子串")
        print(f"    → 如果东方财富返回 '{name_b}'，模糊匹配可能错误映射到 {sec_a}")
else:
    print("  无模糊匹配冲突")

# === 2. 检查中船特气的 f100 行业分类 ===
print("\n" + "=" * 60)
print("=== 2. 一些知名公司的分类检查 ===")
print("=" * 60)

# 检查一些可能有疑问的公司
check_names = [
    "中船特气", "中船防务", "中国船舶", "中国重工",
    "万华化学", "中航沈飞", "航发动力",
    "宁德时代", "比亚迪", "隆基绿能",
    "贵州茅台", "五粮液",
    "中信证券", "招商银行",
    "中国石油", "中国石化",
]

for name in check_names:
    s = next((s for s in stocks if s["name"] == name), None)
    if s:
        code = s["code"]
        sb = subboards.get(code, {})
        print(f"  {code} {name}:")
        print(f"    一级行业: {sb.get('sectorName', '?')}, 二级行业: {sb.get('subBoardName', '?')}")
    else:
        print(f"  {name}: 未找到")

# === 3. 检查一些特定行业中可能有疑问的股票 ===
print("\n" + "=" * 60)
print("=== 3. 电子化学品 二级行业下的所有股票 ===")
print("=" * 60)
electronic_chemicals = [(code, info) for code, info in subboards.items() if info.get("subBoardName") == "电子化学品"]
for code, info in electronic_chemicals:
    s = next((s for s in stocks if s["code"] == code), None)
    name = s["name"] if s else "?"
    print(f"  {code} {name}: {info.get('sectorName', '?')}/{info.get('subBoardName', '?')}")

# === 4. 检查名称中带"气"的股票的分类 ===
print("\n" + "=" * 60)
print("=== 4. 名称中带'气'的股票的分类 ===")
print("=" * 60)
gas_stocks = [s for s in stocks if "气" in s["name"]]
for s in gas_stocks:
    code = s["code"]
    sb = subboards.get(code, {})
    print(f"  {code} {s['name']}: {sb.get('sectorName', '?')}/{sb.get('subBoardName', '?')}")

# === 5. 检查名称中带"船"的股票的分类 ===
print("\n" + "=" * 60)
print("=== 5. 名称中带'船'的股票的分类 ===")
print("=" * 60)
ship_stocks = [s for s in stocks if "船" in s["name"]]
for s in ship_stocks:
    code = s["code"]
    sb = subboards.get(code, {})
    print(f"  {code} {s['name']}: {sb.get('sectorName', '?')}/{sb.get('subBoardName', '?')}")
