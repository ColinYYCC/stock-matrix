#!/usr/bin/env python3
"""分析当前板块分布，用于审查分类合理性"""
import json
from collections import defaultdict

stocks = json.load(open('src/lib/data/stocks-fallback.json', encoding='utf-8'))['stocks']
subs = json.load(open('src/lib/data/subboards.json', encoding='utf-8'))['subboards']

board_data = defaultdict(lambda: {'stocks': [], 'subboards': set()})
for s in stocks:
    bn = s.get('boardName', '其他')
    board_data[bn]['stocks'].append(s)
    code = s['code']
    if code in subs:
        board_data[bn]['subboards'].add(subs[code].get('subBoardName', '?'))

print('=' * 80)
print('当前大板块分布（按股票数排序）')
print('=' * 80)
for board_name in sorted(board_data.keys(), key=lambda x: -len(board_data[x]['stocks'])):
    data = board_data[board_name]
    count = len(data['stocks'])
    cap = sum(s.get('floatMarketCap', 0) for s in data['stocks']) / 1e8
    sub_list = sorted(data['subboards'])
    print(f'\n【{board_name}】{count}只 / {cap:.0f}亿')
    print(f'  子板块({len(sub_list)}个): {", ".join(sub_list[:15])}')
    if len(sub_list) > 15:
        print(f'           {", ".join(sub_list[15:])}')
