#!/usr/bin/env python3
"""深入分析分类不匹配的情况"""
import json
import urllib.request
import os
import time

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "src", "lib", "data")
SUBBOARDS_PATH = os.path.join(DATA_DIR, "subboards.json")
FALLBACK_PATH = os.path.join(DATA_DIR, "stocks-fallback.json")

with open(SUBBOARDS_PATH, encoding="utf-8") as f:
    sb_data = json.load(f)

with open(FALLBACK_PATH, encoding="utf-8") as f:
    fb_data = json.load(f)

subboards = sb_data["subboards"]
stocks = fb_data["stocks"]

print("=" * 60)
print("检查所有电子化学品分类的股票，看是否被申万更新为半导体")
print("=" * 60)

electronic_chemicals_codes = [
    code for code, info in subboards.items()
    if info.get("subBoardName") == "电子化学品"
]

print(f"电子化学品分类的股票: {len(electronic_chemicals_codes)} 只")
print(f"检查中...\n")

changed = []
for code in electronic_chemicals_codes[:50]:  # 检查前50只
    s = next((s for s in stocks if s["code"] == code), None)
    if not s:
        continue

    symbol, exchange = code.split(".")
    secid = f"{'1' if exchange == 'SH' else '0'}.{symbol}"

    url = f"https://push2delay.eastmoney.com/api/qt/stock/get?secid={secid}&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fields=f57,f58,f127"
    req = urllib.request.Request(url, headers={
        "Referer": "https://quote.eastmoney.com/",
        "User-Agent": "Mozilla/5.0 (compatible; StockMatrix/1.0)",
    })

    try:
        resp = urllib.request.urlopen(req, timeout=10)
        data = json.loads(resp.read().decode("utf-8"))
        d = data.get("data", {})
        f127 = str(d.get("f127", "")).strip()

        if f127 and f127 not in ["电子化学品", "电子化学品Ⅱ", "-"]:
            changed.append((code, s["name"], f127))
            print(f"❌ {code} {s['name']}: 期望=电子化学品, 实际={f127}")

        time.sleep(0.1)
    except Exception:
        pass

print(f"\n发现 {len(changed)} 只股票的行业分类已变更")

# === 检查其他已发现的问题股票 ===
print("\n" + "=" * 60)
print("检查之前发现的不匹配股票的详细信息")
print("=" * 60)

problem_stocks = [
    ("688755.SH", "汉邦科技"),
    ("300991.SZ", "创益通"),
    ("688103.SH", "国力电子"),
    ("002086.SZ", "东方海洋"),
]

for code, name in problem_stocks:
    s = next((s for s in stocks if s["code"] == code), None)
    if not s:
        continue

    symbol, exchange = code.split(".")
    secid = f"{'1' if exchange == 'SH' else '0'}.{symbol}"

    url = f"https://push2delay.eastmoney.com/api/qt/stock/get?secid={secid}&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fields=f57,f58,f127,f128"
    req = urllib.request.Request(url, headers={
        "Referer": "https://quote.eastmoney.com/",
        "User-Agent": "Mozilla/5.0 (compatible; StockMatrix/1.0)",
    })

    try:
        resp = urllib.request.urlopen(req, timeout=10)
        data = json.loads(resp.read().decode("utf-8"))
        d = data.get("data", {})
        f127 = str(d.get("f127", "")).strip()
        f128 = str(d.get("f128", "")).strip()

        sb = subboards.get(code, {})
        expected_sub = sb.get("subBoardName", "")
        expected_sector = sb.get("sectorName", "")

        print(f"\n{code} {name}:")
        print(f"  subboards.json: {expected_sector}/{expected_sub}")
        print(f"  东方财富 f127: {f127}")
        print(f"  东方财富 f128: {f128}")

    except Exception as e:
        print(f"\n{code} {name}: 查询失败 - {e}")