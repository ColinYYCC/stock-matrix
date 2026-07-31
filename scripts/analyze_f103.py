#!/usr/bin/env python3
"""拉取全量 A 股的 f103（概念板块标签）数据并做统计分析"""
import json
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.request import Request, urlopen

EASTMONEY_CLIST_HOST = "push2delay.eastmoney.com"
EASTMONEY_CLIST_PATH = "/api/qt/clist/get"
EASTMONEY_ASHARES_FS = "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048"
EASTMONEY_PAGE_SIZE = 100
EASTMONEY_UT = "bd1d9ddb04089700cf9c27f6f7426281"
EASTMONEY_HEADERS = {
    "Referer": "https://quote.eastmoney.com/",
    "User-Agent": "Mozilla/5.0 (compatible; StockMatrix/1.0)",
    "Accept": "application/json, text/plain, */*",
}

def fetch_page(page_num):
    url = (
        f"https://{EASTMONEY_CLIST_HOST}{EASTMONEY_CLIST_PATH}"
        f"?pn={page_num}&pz={EASTMONEY_PAGE_SIZE}&po=1&np=1"
        f"&ut={EASTMONEY_UT}&fltt=2&invt=2&fid=f12"
        f"&fs={EASTMONEY_ASHARES_FS}&fields=f12,f14,f100,f102,f103"
    )
    req = Request(url, headers=EASTMONEY_HEADERS)
    resp = urlopen(req, timeout=15)
    payload = json.loads(resp.read().decode("utf-8"))
    diff = (payload.get("data") or {}).get("diff")
    if not isinstance(diff, list):
        raise RuntimeError("no data.diff")
    return payload

# 拉取全量
print("正在拉取全量 f103 数据...")
first = fetch_page(1)
total = (first.get("data") or {}).get("total", 0)
page_count = max(1, -(-total // EASTMONEY_PAGE_SIZE))
print(f"  总共 {total} 只股票，分 {page_count} 页")

all_payloads = [first]
if page_count > 1:
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(fetch_page, p): p for p in range(2, page_count + 1)}
        for future in as_completed(futures):
            page = futures[future]
            try:
                all_payloads.append(future.result())
            except Exception as e:
                print(f"  第 {page} 页失败: {e}")

print(f"  成功获取 {len(all_payloads)}/{page_count} 页")

# 解析
stocks = []
for payload in all_payloads:
    diff = (payload.get("data") or {}).get("diff", [])
    for row in diff:
        code = str(row.get("f12", "")).strip()
        name = str(row.get("f14", "")).strip()
        industry = str(row.get("f100", "")).strip()
        region = str(row.get("f102", "")).strip()
        concepts_raw = str(row.get("f103", "")).strip()
        if not code:
            continue
        concepts = []
        if concepts_raw and concepts_raw != "-":
            concepts = [c.strip() for c in concepts_raw.split(",") if c.strip()]
        stocks.append({
            "code": code,
            "name": name,
            "industry": industry,
            "region": region,
            "concepts": concepts,
        })

print(f"\n解析出 {len(stocks)} 只股票")

# 统计
has_concepts = sum(1 for s in stocks if s["concepts"])
no_concepts = len(stocks) - has_concepts
concept_counter = Counter()
concept_count_per_stock = Counter()
for s in stocks:
    if s["concepts"]:
        concept_count_per_stock[len(s["concepts"])] += 1
        for c in s["concepts"]:
            concept_counter[c] += 1

print(f"\n=== 覆盖率 ===")
print(f"  有概念标签: {has_concepts} 只 ({has_concepts/len(stocks)*100:.1f}%)")
print(f"  无概念标签: {no_concepts} 只 ({no_concepts/len(stocks)*100:.1f}%)")
print(f"  概念标签种类: {len(concept_counter)} 种")

print(f"\n=== 每只股票的概念标签数分布 ===")
for n in sorted(concept_count_per_stock.keys()):
    count = concept_count_per_stock[n]
    print(f"  {n:2d} 个标签: {count:4d} 只 ({count/has_concepts*100:.1f}%)")

print(f"\n=== 出现频率最高的80个概念标签 ===")
for tag, count in concept_counter.most_common(80):
    print(f"  {tag:14s}: {count:4d} 只")

print(f"\n=== 出现频率最低的30个概念标签 ===")
for tag, count in concept_counter.most_common()[-30:]:
    print(f"  {tag:14s}: {count:4d} 只")

# 无概念标签的股票
no_concept_stocks = [s for s in stocks if not s["concepts"]]
if no_concept_stocks:
    print(f"\n=== 无概念标签的股票（共 {len(no_concept_stocks)} 只，前30只）===")
    for s in no_concept_stocks[:30]:
        print(f"  {s['code']:8s} {s['name']:8s} 行业={s['industry']}")

# 分析 f100 行业和概念标签的交叉
print(f"\n=== '通用设备'行业下的概念标签分布（前20）===")
gy_concepts = Counter()
for s in stocks:
    if s["industry"] == "通用设备":
        for c in s["concepts"]:
            gy_concepts[c] += 1
for tag, count in gy_concepts.most_common(20):
    print(f"  {tag:14s}: {count:4d} 只")

print(f"\n=== '专用设备'行业下的概念标签分布（前20）===")
zy_concepts = Counter()
for s in stocks:
    if s["industry"] == "专用设备":
        for c in s["concepts"]:
            zy_concepts[c] += 1
for tag, count in zy_concepts.most_common(20):
    print(f"  {tag:14s}: {count:4d} 只")

# 保存原始数据供后续分析
output = {
    "total": len(stocks),
    "conceptTypes": len(concept_counter),
    "hasConcepts": has_concepts,
    "noConcepts": no_concepts,
    "stocks": [{"code": s["code"], "name": s["name"], "industry": s["industry"], "concepts": s["concepts"]} for s in stocks],
}
with open("scripts/f103_analysis.json", "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False)
print(f"\n原始数据已保存到 scripts/f103_analysis.json")
