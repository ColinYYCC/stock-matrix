#!/usr/bin/env python3
"""对比东方财富 f100（clist 接口）和 f127（stock/get 接口）字段是否一致。

f100：clist 批量接口返回的行业字段，fetch_stocks.py 实际使用
f127：stock/get 个股接口返回的行业字段

目的：确认两者是否返回相同的行业分类数据。
"""
import json
import os
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

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
# 第一步：用 clist 接口拉取 f100（拉全部页）
# ============================================================
print("=" * 70)
print("第 1 步：用 clist 接口拉取全部 A 股的 f100 字段")
print("=" * 70)

f100_map = {}  # code -> f100
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
        print(f"  第 {page} 页: {len(diff)} 条 (累计 {len(f100_map)})")
        page += 1
        time.sleep(0.2)
    except Exception as e:
        print(f"  第 {page} 页失败: {e}")
        break

print(f"\nclist f100 共获取: {len(f100_map)} 只")

# ============================================================
# 第二步：用 stock/get 接口拉取 f127（抽样 200 只）
# ============================================================
print("\n" + "=" * 70)
print("第 2 步：用 stock/get 接口拉取 f127（抽样 200 只）")
print("=" * 70)

import random
sample_codes = random.sample(list(f100_map.keys()), min(200, len(f100_map)))

def fetch_f127(code):
    """查询单只股票的 f127 字段"""
    symbol, exchange = code.split(".")
    secid = f"{'1' if exchange == 'SH' else '0'}.{symbol}"
    url = (
        f"https://{HOST}/api/qt/stock/get"
        f"?secid={secid}&ut={UT}&fltt=2&invt=2"
        f"&fields=f57,f58,f127"
    )
    req = urllib.request.Request(url, headers=HEADERS)
    for attempt in range(3):
        try:
            resp = urllib.request.urlopen(req, timeout=10)
            data = json.loads(resp.read().decode("utf-8"))
            d = data.get("data", {})
            f127 = str(d.get("f127", "")).strip()
            name = str(d.get("f58", "")).strip()
            return (code, name, f127)
        except Exception:
            time.sleep(0.3 * (attempt + 1))
    return (code, "?", "ERROR")

f127_map = {}  # code -> f127
f127_names = {}  # code -> name
done = 0
with ThreadPoolExecutor(max_workers=8) as executor:
    futures = {executor.submit(fetch_f127, code): code for code in sample_codes}
    for future in as_completed(futures):
        code, name, f127 = future.result()
        f127_map[code] = f127
        f127_names[code] = name
        done += 1
        if done % 50 == 0:
            print(f"  已查询 {done}/{len(sample_codes)}")

print(f"  f127 共获取: {len(f127_map)} 只")

# ============================================================
# 第三步：对比 f100 vs f127
# ============================================================
print("\n" + "=" * 70)
print("第 3 步：对比 f100 vs f127")
print("=" * 70)

def clean(s):
    """去掉 Ⅰ/Ⅱ/Ⅲ 后缀，用于比较"""
    return s.replace("\u2162", "").replace("\u2161", "").replace("\u2160", "").strip()

f100_f127_match = 0
f100_f127_mismatch = 0
f100_f127_errors = 0
mismatches_list = []

for code in sample_codes:
    f100 = f100_map.get(code, "")
    f127 = f127_map.get(code, "")
    name = f127_names.get(code, "?")

    if f127 == "ERROR" or not f127:
        f100_f127_errors += 1
        continue

    if clean(f100) == clean(f127):
        f100_f127_match += 1
    else:
        f100_f127_mismatch += 1
        mismatches_list.append((code, name, f100, f127))

total_compared = f100_f127_match + f100_f127_mismatch
print(f"\n  f100 vs f127 对比结果（{total_compared} 只）:")
print(f"    一致: {f100_f127_match}")
print(f"    不一致: {f100_f127_mismatch}")
print(f"    查询失败: {f100_f127_errors}")
if total_compared > 0:
    print(f"    一致率: {f100_f127_match / total_compared * 100:.1f}%")

if mismatches_list:
    print(f"\n  f100 vs f127 不一致详情:")
    for code, name, f100, f127 in mismatches_list[:20]:
        print(f"    {code} {name}: f100={f100} | f127={f127}")

# ============================================================
# 第四步：对比 f100/f127 vs subboards.json
# ============================================================
print("\n" + "=" * 70)
print("第 4 步：对比 f100/f127 vs subboards.json")
print("=" * 70)

f100_vs_sb_match = 0
f100_vs_sb_mismatch = 0
f127_vs_sb_match = 0
f127_vs_sb_mismatch = 0
sb_mismatches_f100 = []
sb_mismatches_f127 = []

for code in sample_codes:
    f100 = f100_map.get(code, "")
    f127 = f127_map.get(code, "")
    sb = subboards.get(code, {})
    old_sub = sb.get("subBoardName", "")

    if old_sub:
        if clean(f100) == clean(old_sub):
            f100_vs_sb_match += 1
        else:
            f100_vs_sb_mismatch += 1
            name = f127_names.get(code, "?")
            sb_mismatches_f100.append((code, name, f100, sb.get("sectorName", "?"), old_sub))

        if f127 and f127 != "ERROR":
            if clean(f127) == clean(old_sub):
                f127_vs_sb_match += 1
            else:
                f127_vs_sb_mismatch += 1
                name = f127_names.get(code, "?")
                sb_mismatches_f127.append((code, name, f127, sb.get("sectorName", "?"), old_sub))

print(f"\n  f100 vs subboards.json（{f100_vs_sb_match + f100_vs_sb_mismatch} 只）:")
print(f"    一致: {f100_vs_sb_match}")
print(f"    不一致: {f100_vs_sb_mismatch}")
if (f100_vs_sb_match + f100_vs_sb_mismatch) > 0:
    print(f"    不一致率: {f100_vs_sb_mismatch / (f100_vs_sb_match + f100_vs_sb_mismatch) * 100:.1f}%")

print(f"\n  f127 vs subboards.json（{f127_vs_sb_match + f127_vs_sb_mismatch} 只）:")
print(f"    一致: {f127_vs_sb_match}")
print(f"    不一致: {f127_vs_sb_mismatch}")
if (f127_vs_sb_match + f127_vs_sb_mismatch) > 0:
    print(f"    不一致率: {f127_vs_sb_mismatch / (f127_vs_sb_match + f127_vs_sb_mismatch) * 100:.1f}%")

if sb_mismatches_f100:
    print(f"\n  f100 vs subboards 不一致详情（前 20）:")
    for code, name, f100, sec, sub in sb_mismatches_f100[:20]:
        print(f"    {code} {name}: f100={f100} vs subboards={sec}/{sub}")

# ============================================================
# 第五步：检查中船特气等关键股票
# ============================================================
print("\n" + "=" * 70)
print("第 5 步：关键股票的 f100 / f127 / subboards 三方对比")
print("=" * 70)

key_codes = ["688146.SH", "688268.SH", "688106.SH", "688548.SH",
             "002549.SZ", "688755.SH", "300991.SZ", "688103.SH", "002086.SZ"]

for code in key_codes:
    f100 = f100_map.get(code, "未找到")
    sb = subboards.get(code, {})
    old_sub = sb.get("subBoardName", "?")
    old_sec = sb.get("sectorName", "?")

    # f127 需要单独查
    symbol, exchange = code.split(".")
    secid = f"{'1' if exchange == 'SH' else '0'}.{symbol}"
    url = (
        f"https://{HOST}/api/qt/stock/get"
        f"?secid={secid}&ut={UT}&fltt=2&invt=2"
        f"&fields=f57,f58,f127"
    )
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        resp = urllib.request.urlopen(req, timeout=10)
        data = json.loads(resp.read().decode("utf-8"))
        d = data.get("data", {})
        f127 = str(d.get("f127", "")).strip()
        name = str(d.get("f58", "")).strip()
    except Exception:
        f127 = "查询失败"
        name = "?"

    print(f"\n  {code} {name}:")
    print(f"    f100 (clist):   {f100}")
    print(f"    f127 (stock/get): {f127}")
    print(f"    subboards.json:   {old_sec}/{old_sub}")
    f100_f127_same = "✅" if clean(f100) == clean(f127) else "❌"
    f100_sb_same = "✅" if clean(f100) == clean(old_sub) else "❌"
    print(f"    f100==f127: {f100_f127_same}  f100==subboards: {f100_sb_same}")
    time.sleep(0.2)

print("\n" + "=" * 70)
print("对比完成")
print("=" * 70)
