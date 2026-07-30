#!/usr/bin/env python3
"""全量检查所有股票的 f100（clist）与 subboards.json 的分类一致性。
由于已验证 f100 和 f127 100% 一致，这里只用 f100 做全量对比。
"""
import json
import os
import time
import urllib.request
from collections import defaultdict

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "src", "lib", "data")
SUBBOARDS_PATH = os.path.join(DATA_DIR, "subboards.json")
FALLBACK_PATH = os.path.join(DATA_DIR, "stocks-fallback.json")

with open(SUBBOARDS_PATH, encoding="utf-8") as f:
    sb_data = json.load(f)
with open(FALLBACK_PATH, encoding="utf-8") as f:
    fb_data = json.load(f)

subboards = sb_data["subboards"]
stocks = fb_data["stocks"]

HOST = "push2delay.eastmoney.com"
FS = "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048"
UT = "bd1d9ddb04089700cf9c27f6f7426281"
HEADERS = {
    "Referer": "https://quote.eastmoney.com/",
    "User-Agent": "Mozilla/5.0 (compatible; StockMatrix/1.0)",
}

# ============================================================
# 拉取全部 A 股的 f100 字段
# ============================================================
print("=" * 70)
print("拉取全部 A 股的 f100 字段（clist 接口）")
print("=" * 70)

f100_map = {}  # code -> f100
f100_names = {}  # code -> name
page = 1
total = None
while True:
    url = (
        f"https://{HOST}/api/qt/clist/get"
        f"?pn={page}&pz=100&po=1&np=1"
        f"&ut={UT}&fltt=2&invt=2&fid=f12"
        f"&fs={FS}&fields=f12,f13,f14,f100"
    )
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        payload = json.loads(resp.read().decode("utf-8"))
        if total is None:
            total = (payload.get("data") or {}).get("total", 0)
            print(f"  总数: {total}")
        diff = (payload.get("data") or {}).get("diff")
        if not isinstance(diff, list) or len(diff) == 0:
            break
        for row in diff:
            code_raw = str(row.get("f12", "")).strip()
            if not code_raw:
                continue
            mf = row.get("f13", -1)
            try:
                mf = int(mf)
            except Exception:
                mf = -1
            if mf == 1:
                ex = "SH"
            elif code_raw.startswith(("4", "8", "9")):
                ex = "BJ"
            else:
                ex = "SZ"
            full_code = f"{code_raw}.{ex}"
            f100_map[full_code] = str(row.get("f100", "")).strip()
            f100_names[full_code] = str(row.get("f14", "")).strip()
        if page % 10 == 0:
            print(f"  第 {page} 页 (累计 {len(f100_map)})")
        page += 1
        time.sleep(0.15)
    except Exception as e:
        print(f"  第 {page} 页失败: {e}")
        page += 1
        continue

print(f"\nclist f100 共获取: {len(f100_map)} 只")

# ============================================================
# 全量对比 f100 vs subboards.json
# ============================================================
print("\n" + "=" * 70)
print("全量对比 f100 vs subboards.json")
print("=" * 70)

def clean(s):
    """去掉 Ⅰ/Ⅱ/Ⅲ 后缀，用于比较"""
    return s.replace("\u2162", "").replace("\u2161", "").replace("\u2160", "").strip()

match = 0
mismatch = 0
no_f100 = 0
no_subboard = 0
mismatches = []

for code, f100 in f100_map.items():
    if code not in subboards:
        no_subboard += 1
        continue

    old_info = subboards[code]
    old_sub = old_info.get("subBoardName", "")
    old_sec = old_info.get("sectorName", "")

    if not f100 or f100 == "-":
        no_f100 += 1
        continue

    if clean(f100) == clean(old_sub):
        match += 1
    else:
        mismatch += 1
        name = f100_names.get(code, "?")
        # 也查一下 stocks-fallback.json 中的名字
        s = next((s for s in stocks if s["code"] == code), None)
        if s:
            name = s["name"]
        mismatches.append((code, name, f100, old_sec, old_sub))

total_compared = match + mismatch
print(f"\n  对比总数: {total_compared}")
print(f"  匹配: {match}")
print(f"  不匹配: {mismatch}")
print(f"  无 f100 数据: {no_f100}")
print(f"  无 subboards 记录: {no_subboard}")
if total_compared > 0:
    print(f"  不匹配率: {mismatch / total_compared * 100:.2f}%")

# ============================================================
# 分类不匹配的类型分析
# ============================================================
print("\n" + "=" * 70)
print("不匹配类型分析")
print("=" * 70)

# 1. f100 返回笼统名称（如"银行Ⅱ"），subboards 有细分
type_generic_f100 = []
# 2. f100 和 subboards 的二级行业名完全不同
type_different = []
# 3. f100 的一级行业可能也变了
type_sector_changed = []

# 构建二级行业→一级行业映射表（从 subboards 自身）
sub_to_sector_map = {}
for info in subboards.values():
    sn = info.get("subBoardName", "")
    sec = info.get("sectorName", "")
    if sn and sec:
        sub_to_sector_map[clean(sn)] = sec

for code, name, f100, old_sec, old_sub in mismatches:
    f100_clean = clean(f100)
    old_clean = clean(old_sub)

    # 判断 f100 是否是笼统名称（映射到的一级行业和旧的一级行业相同）
    f100_sector = sub_to_sector_map.get(f100_clean, "")

    if f100_sector and f100_sector == old_sec:
        # 一级行业相同，只是二级行业名不同
        # 可能是 f100 笼统（如"银行Ⅱ"），也可能是申万重新分类
        if f100_clean != old_clean:
            type_generic_f100.append((code, name, f100, old_sec, old_sub))
    elif f100_sector and f100_sector != old_sec:
        # 一级行业也变了
        type_sector_changed.append((code, name, f100, old_sec, old_sub, f100_sector))
    else:
        # f100 的新行业名在映射表中找不到（可能是申万新增的二级行业名）
        type_different.append((code, name, f100, old_sec, old_sub))

print(f"\n--- 类型 1: 二级行业名不同，但一级行业相同（{len(type_generic_f100)} 只）---")
print("  （可能是申万细分调整，或 f100 返回笼统名称）")
for code, name, f100, sec, sub in type_generic_f100[:30]:
    print(f"  {code} {name}: f100={f100} vs {sec}/{sub}")
if len(type_generic_f100) > 30:
    print(f"  ... 还有 {len(type_generic_f100) - 30} 只")

print(f"\n--- 类型 2: 一级行业也变了（{len(type_sector_changed)} 只）---")
print("  （严重错误：股票被分到了完全不同的板块）")
for code, name, f100, old_sec, old_sub, new_sec in type_sector_changed[:30]:
    print(f"  {code} {name}: f100={f100}")
    print(f"    旧: {old_sec}/{old_sub} → 新: {new_sec}/{f100}")
if len(type_sector_changed) > 30:
    print(f"  ... 还有 {len(type_sector_changed) - 30} 只")

print(f"\n--- 类型 3: f100 行业名在映射表中找不到（{len(type_different)} 只）---")
print("  （申万可能新增了二级行业名，或 f100 返回了新名称）")
for code, name, f100, sec, sub in type_different[:30]:
    print(f"  {code} {name}: f100={f100} vs {sec}/{sub}")
if len(type_different) > 30:
    print(f"  ... 还有 {len(type_different) - 30} 只")

# ============================================================
# 检查 f100 中出现但 subboards 映射表中没有的新行业名
# ============================================================
print("\n" + "=" * 70)
print("f100 中出现的新行业名（不在 subboards 映射表中）")
print("=" * 70)

all_f100_industries = set()
for f100 in f100_map.values():
    if f100 and f100 != "-":
        all_f100_industries.add(clean(f100))

known_industries = set(sub_to_sector_map.keys())
new_industries = all_f100_industries - known_industries

if new_industries:
    print(f"  共 {len(new_industries)} 个新行业名:")
    for ind in sorted(new_industries):
        count = sum(1 for f in f100_map.values() if clean(f) == ind)
        print(f"    {ind} ({count} 只股票)")
else:
    print("  无新行业名")

# ============================================================
# 输出完整不匹配列表到文件
# ============================================================
output_path = os.path.join(os.path.dirname(__file__), "classification_mismatches.json")
output = {
    "summary": {
        "total_compared": total_compared,
        "match": match,
        "mismatch": mismatch,
        "mismatch_rate": f"{mismatch / total_compared * 100:.2f}%" if total_compared > 0 else "N/A",
        "type1_same_sector": len(type_generic_f100),
        "type2_sector_changed": len(type_sector_changed),
        "type3_unknown_industry": len(type_different),
    },
    "type1_same_sector": [
        {"code": c, "name": n, "f100": f, "old_sector": s, "old_sub": su}
        for c, n, f, s, su in type_generic_f100
    ],
    "type2_sector_changed": [
        {"code": c, "name": n, "f100": f, "old_sector": os_, "old_sub": su, "new_sector": ns}
        for c, n, f, os_, su, ns in type_sector_changed
    ],
    "type3_unknown_industry": [
        {"code": c, "name": n, "f100": f, "old_sector": s, "old_sub": su}
        for c, n, f, s, su in type_different
    ],
    "new_industries": sorted(list(new_industries)),
}
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)
print(f"\n完整不匹配列表已写入: {output_path}")
