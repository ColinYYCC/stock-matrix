#!/usr/bin/env python3
"""通过东方财富clist接口查询中船特气等股票的f100行业分类"""
import json
import urllib.request

# 使用clist接口查询特定股票（通过fs参数过滤）
# fs=b:MK0354 是科创板，但更准确的是用代码过滤
# 实际上clist接口可以用 fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048 查全部
# 但为了查特定股票，我们可以查全部然后过滤
# 这里我们用另一种方式：直接查个股的扩展信息

# 方法：用 clist 接口 + 代码过滤
# f12=代码, f14=名称, f100=行业
# 用 fs=b:MK0022+b:MK0023+b:MK0024... 太复杂
# 直接查个股详情页

stocks_to_check = [
    ("1.688146", "中船特气", "电子", "电子化学品"),
    ("1.688268", "华特气体", "电子", "电子化学品"),
    ("1.688106", "金宏气体", "电子", "电子化学品"),
    ("0.002549", "凯美特气", "基础化工", "化学制品"),
    ("0.300847", "中船汉光", "计算机", "计算机设备"),
    ("1.600072", "中船科技", "电力设备", "风电设备"),
]

# 用 stock/get 接口查更多字段
fields = "f57,f58,f100,f127,f128,f135,f136,f137,f138,f139,f140,f141,f142,f143,f144"

for secid, name, expected_sector, expected_sub in stocks_to_check:
    url = f"https://push2delay.eastmoney.com/api/qt/stock/get?secid={secid}&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fields={fields}"
    req = urllib.request.Request(url, headers={
        "Referer": "https://quote.eastmoney.com/",
        "User-Agent": "Mozilla/5.0 (compatible; StockMatrix/1.0)",
    })
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        data = json.loads(resp.read().decode("utf-8"))
        d = data.get("data", {})
        # 打印所有非空字段
        print(f"{name} ({secid}):")
        for k, v in sorted(d.items()):
            if v and v != "-" and v != 0:
                print(f"  {k}: {v}")
        print(f"  期望: {expected_sector}/{expected_sub}")
        print()
    except Exception as e:
        print(f"{name} ({secid}): 查询失败 - {e}")
        print()

# 再尝试用 clist 接口查特定股票
print("=" * 60)
print("用 clist 接口查询（f100字段）")
print("=" * 60)

# 查询全部A股，然后过滤我们关心的股票
target_codes = {"688146", "688268", "688106", "002549", "300847", "600072"}
url = (
    "https://push2delay.eastmoney.com/api/qt/clist/get"
    "?pn=1&pz=20&po=1&np=1"
    "&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=f12"
    "&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048"
    "&fields=f12,f14,f100"
)
# 这个接口每次返回100条，查特定股票不太方便
# 用另一种方式：fs=b:MK0022 (沪深A股) 然后用 code filter

# 实际上用 secid 查更准确
for secid, name, expected_sector, expected_sub in stocks_to_check:
    # 用 clist 接口的 stock/get 变体
    # 直接访问东方财富个股页面 API
    code = secid.split(".")[1]
    market = secid.split(".")[0]
    url2 = f"https://push2delay.eastmoney.com/api/qt/stock/get?secid={market}.{code}&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fields=f57,f58,f100,f107,f108,f111,f113"
    req2 = urllib.request.Request(url2, headers={
        "Referer": "https://quote.eastmoney.com/",
        "User-Agent": "Mozilla/5.0 (compatible; StockMatrix/1.0)",
    })
    try:
        resp2 = urllib.request.urlopen(req2, timeout=15)
        data2 = json.loads(resp2.read().decode("utf-8"))
        d2 = data2.get("data", {})
        print(f"\n{name} ({secid}):")
        for k, v in sorted(d2.items()):
            if v and v != "-" and v != 0:
                print(f"  {k}: {v}")
    except Exception as e:
        print(f"\n{name} ({secid}): 查询失败 - {e}")
