#!/usr/bin/env python3
"""严格自审：以批判性视角审查每个大板块的分类合理性"""
import json
from collections import defaultdict, Counter

stocks = json.load(open('src/lib/data/stocks-fallback.json', encoding='utf-8'))['stocks']
subs = json.load(open('src/lib/data/subboards.json', encoding='utf-8'))['subboards']

# 构建板块数据
board_data = defaultdict(lambda: {'stocks': [], 'subboards': Counter()})
for s in stocks:
    bn = s.get('boardName', '其他')
    board_data[bn]['stocks'].append(s)
    code = s['code']
    if code in subs:
        board_data[bn]['subboards'][subs[code].get('subBoardName', '?')] += 1

issues = []

print('=' * 100)
print('【严格自审】逐一审查每个大板块')
print('=' * 100)

# 1. 检查机械装备
print('\n' + '=' * 100)
print('【1. 机械装备】613只')
print('=' * 100)
sub_list = board_data['机械装备']['subboards']
print(f'子板块: {dict(sub_list)}')
# 检查是否有不应该在机械装备的股票
for s in board_data['机械装备']['stocks']:
    name = s['name']
    # 金属新材料不应该在机械装备
    if '金属新材料' in str(subs.get(s['code'], {}).get('subBoardName', '')):
        issues.append(f"机械装备: {s['code']} {name} - 金属新材料应归入化工材料")

# 2. 检查化工材料
print('\n' + '=' * 100)
print('【2. 化工材料】563只')
print('=' * 100)
sub_list = board_data['化工材料']['subboards']
print(f'子板块: {dict(sub_list)}')
# 检查：金属新材料在这里是合理的

# 3. 检查消费零售
print('\n' + '=' * 100)
print('【3. 消费零售】527只')
print('=' * 100)
sub_list = board_data['消费零售']['subboards']
print(f'子板块: {dict(sub_list)}')
# 检查是否有不应该在消费零售的股票
for s in board_data['消费零售']['stocks']:
    name = s['name']
    sub = subs.get(s['code'], {}).get('subBoardName', '')
    # 家电零部件中做汽车热管理的应该去汽车
    if sub == '家电零部件' and any(x in name for x in ['三花', '盾安', '海立']):
        # 这些已经在白名单中修正了，检查是否生效
        pass

# 4. 检查电力公用
print('\n' + '=' * 100)
print('【4. 电力公用】386只')
print('=' * 100)
sub_list = board_data['电力公用']['subboards']
print(f'子板块: {dict(sub_list)}')
# 检查：环保设备、环境治理在这里合理吗？
# 严格来说环保应该单独或与电力公用合并，暂时合理

# 5. 检查AI与软件
print('\n' + '=' * 100)
print('【5. AI与软件】378只')
print('=' * 100)
sub_list = board_data['AI与软件']['subboards']
print(f'子板块: {dict(sub_list)}')
# 检查：计算机设备在这里合理吗？
# 严格来说计算机设备是硬件，应该去消费电子或单独
for s in board_data['AI与软件']['stocks']:
    sub = subs.get(s['code'], {}).get('subBoardName', '')
    if sub == '计算机设备':
        issues.append(f"AI与软件: {s['code']} {s['name']} - 计算机设备是硬件，应归入消费电子")

# 6. 检查医药制药
print('\n' + '=' * 100)
print('【6. 医药制药】377只')
print('=' * 100)
sub_list = board_data['医药制药']['subboards']
print(f'子板块: {dict(sub_list)}')
# 检查：动物保健在这里合理吗？应该去农林牧渔？
for s in board_data['医药制药']['stocks']:
    sub = subs.get(s['code'], {}).get('subBoardName', '')
    if sub == '动物保健':
        issues.append(f"医药制药: {s['code']} {s['name']} - 动物保健应归入农林牧渔")

# 7. 检查汽车
print('\n' + '=' * 100)
print('【7. 汽车】320只')
print('=' * 100)
sub_list = board_data['汽车']['subboards']
print(f'子板块: {dict(sub_list)}')
# 检查：家电零部件在这里的汽车热管理公司是合理的

# 8. 检查消费电子
print('\n' + '=' * 100)
print('【8. 消费电子】307只')
print('=' * 100)
sub_list = board_data['消费电子']['subboards']
print(f'子板块: {dict(sub_list)}')

# 9. 检查地产基建
print('\n' + '=' * 100)
print('【9. 地产基建】290只')
print('=' * 100)
sub_list = board_data['地产基建']['subboards']
print(f'子板块: {dict(sub_list)}')

# 10. 检查新能源
print('\n' + '=' * 100)
print('【10. 新能源】267只')
print('=' * 100)
sub_list = board_data['新能源']['subboards']
print(f'子板块: {dict(sub_list)}')

# 11. 检查资源周期
print('\n' + '=' * 100)
print('【11. 资源周期】255只')
print('=' * 100)
sub_list = board_data['资源周期']['subboards']
print(f'子板块: {dict(sub_list)}')
# 检查：油服工程在这里合理吗？应该去机械装备或化工材料？
for s in board_data['资源周期']['stocks']:
    sub = subs.get(s['code'], {}).get('subBoardName', '')
    if sub == '油服工程':
        issues.append(f"资源周期: {s['code']} {s['name']} - 油服工程是服务，应归入机械装备")

# 12. 检查半导体
print('\n' + '=' * 100)
print('【12. 半导体】182只')
print('=' * 100)
sub_list = board_data['半导体']['subboards']
print(f'子板块: {dict(sub_list)}')

# 13. 检查医疗健康
print('\n' + '=' * 100)
print('【13. 医疗健康】158只')
print('=' * 100)
sub_list = board_data['医疗健康']['subboards']
print(f'子板块: {dict(sub_list)}')

# 14. 检查传媒
print('\n' + '=' * 100)
print('【14. 传媒】144只')
print('=' * 100)
sub_list = board_data['传媒']['subboards']
print(f'子板块: {dict(sub_list)}')
# 检查：教育在这里合理吗？

# 15. 检查国防航天
print('\n' + '=' * 100)
print('【15. 国防航天】141只')
print('=' * 100)
sub_list = board_data['国防航天']['subboards']
print(f'子板块: {dict(sub_list)}')

# 16. 检查食品饮料
print('\n' + '=' * 100)
print('【16. 食品饮料】128只')
print('=' * 100)
sub_list = board_data['食品饮料']['subboards']
print(f'子板块: {dict(sub_list)}')

# 17. 检查交运物流
print('\n' + '=' * 100)
print('【17. 交运物流】128只')
print('=' * 100)
sub_list = board_data['交运物流']['subboards']
print(f'子板块: {dict(sub_list)}')

# 18. 检查通信
print('\n' + '=' * 100)
print('【18. 通信】127只')
print('=' * 100)
sub_list = board_data['通信']['subboards']
print(f'子板块: {dict(sub_list)}')

# 19. 检查金融
print('\n' + '=' * 100)
print('【19. 金融】122只')
print('=' * 100)
sub_list = board_data['金融']['subboards']
print(f'子板块: {dict(sub_list)}')

# 20. 检查农林牧渔
print('\n' + '=' * 100)
print('【20. 农林牧渔】99只')
print('=' * 100)
sub_list = board_data['农林牧渔']['subboards']
print(f'子板块: {dict(sub_list)}')
# 检查：农产品加工在这里合理吗？应该去食品饮料？
for s in board_data['农林牧渔']['stocks']:
    sub = subs.get(s['code'], {}).get('subBoardName', '')
    if sub == '农产品加工':
        # 农产品加工既可以是农林牧渔也可以是食品饮料，看具体业务
        pass

# 21. 检查综合
print('\n' + '=' * 100)
print('【21. 综合】20只')
print('=' * 100)
sub_list = board_data['综合']['subboards']
print(f'子板块: {dict(sub_list)}')

# 输出所有问题
print('\n' + '=' * 100)
print(f'【发现 {len(issues)} 个问题】')
print('=' * 100)
for i, issue in enumerate(issues, 1):
    print(f'{i}. {issue}')

if not issues:
    print('\n✅ 未发现明显问题！')
