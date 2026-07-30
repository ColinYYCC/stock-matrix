#!/usr/bin/env python3
"""检查 subboards.json 中的行业分类问题"""
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

# === 1. 检查同一个二级行业名映射到不同一级行业的矛盾 ===
sub_to_sectors = {}
sub_to_codes = {}
for code, info in subboards.items():
    sb = info.get("subBoardName", "")
    sn = info.get("sectorName", "")
    if sb not in sub_to_sectors:
        sub_to_sectors[sb] = set()
        sub_to_codes[sb] = []
    sub_to_sectors[sb].add(sn)
    sub_to_codes[sb].append(code)

conflicts = {sb: sectors for sb, sectors in sub_to_sectors.items() if len(sectors) > 1}
print("=" * 60)
print("=== 1. 同一个二级行业映射到不同一级行业的矛盾 ===")
print("=" * 60)
if conflicts:
    for sb, sectors in sorted(conflicts.items()):
        codes = sub_to_codes[sb]
        print(f"\n  二级行业「{sb}」映射到: {sectors}")
        print(f"  涉及 {len(codes)} 只股票，前5只:")
        for c in codes[:5]:
            s = next((s for s in stocks if s["code"] == c), None)
            name = s["name"] if s else "?"
            sn = subboards[c].get("sectorName", "?")
            print(f"    {c} {name} -> {sn}")
else:
    print("  无矛盾")

# === 2. 检查 stocks-fallback.json 的 boardName 和 subboards.json 的 sectorName 不一致 ===
print("\n" + "=" * 60)
print("=== 2. stocks-fallback.json 的 boardName 与 subboards.json 的 sectorName 不一致 ===")
print("=" * 60)
mismatches = []
for s in stocks:
    code = s["code"]
    fb_board = s.get("boardName", "")
    if code in subboards:
        sb_sector = subboards[code].get("sectorName", "")
        if fb_board != sb_sector:
            mismatches.append((code, s["name"], fb_board, sb_sector, subboards[code].get("subBoardName", "")))

print(f"  共 {len(mismatches)} 处不一致")
for code, name, fb, sb, sub in mismatches[:20]:
    print(f"    {code} {name}: fallback={fb}, subboards={sb} (二级={sub})")

# === 3. 统计各一级行业的股票数 ===
sector_counts = {}
for code, info in subboards.items():
    sn = info.get("sectorName", "未知")
    sector_counts[sn] = sector_counts.get(sn, 0) + 1

print("\n" + "=" * 60)
print("=== 3. 一级行业分布 ===")
print("=" * 60)
for sn, cnt in sorted(sector_counts.items(), key=lambda x: -x[1]):
    print(f"  {sn}: {cnt} 只")

# === 4. 检查 "其他" 分类的股票 ===
others = [(code, info) for code, info in subboards.items() if info.get("sectorName") == "其他"]
print("\n" + "=" * 60)
print(f"=== 4. '其他' 分类的股票: {len(others)} 只 ===")
print("=" * 60)
for code, info in others[:30]:
    s = next((s for s in stocks if s["code"] == code), None)
    name = s["name"] if s else "?"
    print(f"  {code} {name}: subBoardName={info.get('subBoardName', '?')}")

# === 5. 检查 stocks-fallback.json 中有但 subboards.json 中没有的股票 ===
fb_codes = {s["code"] for s in stocks}
sb_codes = set(subboards.keys())
missing_in_sb = fb_codes - sb_codes
print("\n" + "=" * 60)
print(f"=== 5. stocks-fallback.json 中有但 subboards.json 中没有: {len(missing_in_sb)} 只 ===")
print("=" * 60)
for code in list(missing_in_sb)[:20]:
    s = next((s for s in stocks if s["code"] == code), None)
    if s:
        print(f"  {code} {s['name']}: boardName={s.get('boardName', '?')}")

# === 6. 统计二级行业数量 ===
print(f"\n=== 二级行业总数: {len(sub_to_sectors)} ===")
print(f"=== 股票总数: fallback={len(stocks)}, subboards={len(subboards)} ===")

# === 7. 检查一些可能有疑问的分类 ===
# 中船特气: 电子特种气体，分类为 电子/电子化学品
print("\n" + "=" * 60)
print("=== 7. 中船特气的分类详情 ===")
print("=" * 60)
code = "688146.SH"
if code in subboards:
    info = subboards[code]
    s = next((s for s in stocks if s["code"] == code), None)
    print(f"  代码: {code}")
    print(f"  名称: {s['name'] if s else '?'}")
    print(f"  一级行业(sectorName): {info.get('sectorName', '?')}")
    print(f"  二级行业(subBoardName): {info.get('subBoardName', '?')}")
    print(f"  fallback boardName: {s.get('boardName', '?') if s else '?'}")
