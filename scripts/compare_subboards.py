#!/usr/bin/env python3
"""比较当前工作区和 HEAD 版本的 subboards.json 分类差异"""
import json, subprocess

# 当前版本
with open('src/lib/data/subboards.json') as f:
    curr = json.load(f)['subboards']

# HEAD 版本
head_raw = subprocess.check_output(['git', 'show', 'HEAD:src/lib/data/subboards.json'], text=True)
head_data = json.loads(head_raw)['subboards']

# 比较分类变化
changed = 0
curr_only = 0
head_only = 0
sector_changes = {}  # 记录一级行业变化

for code in set(list(curr.keys()) + list(head_data.keys())):
    c = curr.get(code, {})
    h = head_data.get(code, {})
    
    c_sec = c.get('sectorName', '')
    h_sec = h.get('sectorName', '')
    c_sub = c.get('subBoardName', '')
    h_sub = h.get('subBoardName', '')
    
    if c_sec != h_sec or c_sub != h_sub:
        changed += 1
        if changed <= 20:
            print(f"  {code}: {h_sec}/{h_sub} -> {c_sec}/{c_sub}")
        if c_sec != h_sec:
            key = f"{h_sec} -> {c_sec}"
            sector_changes[key] = sector_changes.get(key, 0) + 1
    
    if code in curr and code not in head_data:
        curr_only += 1
    if code not in curr and code in head_data:
        head_only += 1

print(f"\nTotal changed: {changed}")
print(f"New in current: {curr_only}, Removed: {head_only}")
print(f"Current total: {len(curr)}, HEAD total: {len(head_data)}")

if sector_changes:
    print("\nSector name changes:")
for k, v in sorted(sector_changes.items(), key=lambda x: -x[1]):
    print(f"  {k}: {v} stocks")

# 比较板块数量
curr_sectors = set(v.get('sectorName', '') for v in curr.values())
head_sectors = set(v.get('sectorName', '') for v in head_data.values())
print(f"\nCurrent sectors: {len(curr_sectors)}")
print(f"HEAD sectors: {len(head_sectors)}")
if curr_sectors != head_sectors:
    print(f"  Only in current: {curr_sectors - head_sectors}")
    print(f"  Only in HEAD: {head_sectors - curr_sectors}")
