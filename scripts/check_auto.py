#!/usr/bin/env python3
"""检查汽车板块中的三花、海立、盾安"""
import json

stocks = json.load(open('src/lib/data/stocks-fallback.json', encoding='utf-8'))['stocks']
subs = json.load(open('src/lib/data/subboards.json', encoding='utf-8'))['subboards']

print("=" * 60)
print("检查三花、海立、盾安的分类")
print("=" * 60)

for s in stocks:
    name = s['name']
    if any(x in name for x in ['三花', '海立', '盾安']):
        code = s['code']
        board = s['boardName']
        sub = subs.get(code, {}).get('subBoardName', '?')
        print(f'{code} {name}: {board} / {sub}')

print("\n" + "=" * 60)
print("汽车板块子板块分布")
print("=" * 60)

from collections import Counter
auto_subs = Counter()
for s in stocks:
    if s['boardName'] == '汽车':
        code = s['code']
        sub = subs.get(code, {}).get('subBoardName', '?')
        auto_subs[sub] += 1

for sub, count in sorted(auto_subs.items(), key=lambda x: -x[1]):
    print(f'  {sub}: {count}只')
