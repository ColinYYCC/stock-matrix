#!/usr/bin/env python3
"""查询东方财富API获取中船特气的f100行业分类"""
import json
import urllib.request

# 中船特气 688146 (SH → secid=1.688146)
codes = [
    ("1.688146", "中船特气"),
    ("1.688268", "华特气体"),
    ("1.688106", "金宏气体"),
    ("1.688548", "广钢气体"),
    ("0.002549", "凯美特气"),
    ("0.002971", "和远气体"),
]

for secid, name in codes:
    url = f"https://push2delay.eastmoney.com/api/qt/stock/get?secid={secid}&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fields=f57,f58,f100"
    req = urllib.request.Request(url, headers={
        "Referer": "https://quote.eastmoney.com/",
        "User-Agent": "Mozilla/5.0 (compatible; StockMatrix/1.0)",
    })
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        data = json.loads(resp.read().decode("utf-8"))
        d = data.get("data", {})
        print(f"{name} ({secid}):")
        print(f"  代码: {d.get('f57', '?')}")
        print(f"  名称: {d.get('f58', '?')}")
        print(f"  f100行业: {d.get('f100', '?')}")
        print()
    except Exception as e:
        print(f"{name} ({secid}): 查询失败 - {e}")
        print()
