#!/usr/bin/env python3
"""大规模对比东方财富 f127 字段与 subboards.json 的分类，估算错误率"""
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

# 随机抽样100只股票进行验证
import random
sample_stocks = random.sample(stocks, min(100, len(stocks)))

print("=" * 60)
print(f"抽样 {len(sample_stocks)} 只股票，对比 f127 与 subboards.json 的二级行业")
print("=" * 60)

matches = []
mismatches = []
errors = []

for s in sample_stocks:
    code = s["code"]
    name = s["name"]
    sub = subboards.get(code, {})
    expected_sub = sub.get("subBoardName", "")

    if not expected_sub:
        continue

    # 从代码解析 secid
    symbol, exchange = code.split(".")
    secid = f"{'1' if exchange == 'SH' else '0'}.{symbol}"

    # 查询 f127 字段（申万二级行业）
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

        # 去掉Ⅱ后缀进行比较
        f127_clean = f127.replace("Ⅱ", "").replace("Ⅰ", "").strip()
        expected_clean = expected_sub.replace("Ⅱ", "").replace("Ⅰ", "").strip()

        if f127_clean == expected_clean:
            matches.append((code, name, f127, expected_sub))
        elif f127 and f127 != "-":
            mismatches.append((code, name, f127, expected_sub))
            print(f"❌ {code} {name}: f127={f127}, subboards={expected_sub}")
        else:
            errors.append((code, name, "f127为空"))

        time.sleep(0.1)  # 避免请求过快
    except Exception as e:
        errors.append((code, name, str(e)))

print("\n" + "=" * 60)
print("统计结果")
print("=" * 60)
print(f"匹配: {len(matches)} 只")
print(f"不匹配: {len(mismatches)} 只")
print(f"查询失败: {len(errors)} 只")
print(f"错误率: {len(mismatches) / (len(mismatches) + len(matches)) * 100:.1f}%")

if mismatches:
    print("\n不匹配详情:")
    for code, name, f127, expected in mismatches:
        sb = subboards[code]
        sector = sb.get("sectorName", "?")
        print(f"  {code} {name}:")
        print(f"    东方财富 f127: {f127}")
        print(f"    subboards.json: {expected} ({sector})")