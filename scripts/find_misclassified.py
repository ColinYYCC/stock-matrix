#!/usr/bin/env python3
"""
全面审查：找出行业归属不准确的股票
类似三花智控的情况：主营业务已变更但行业归属未同步调整
"""
import json
from collections import defaultdict

stocks = json.load(open('src/lib/data/stocks-fallback.json', encoding='utf-8'))['stocks']
subs = json.load(open('src/lib/data/subboards.json', encoding='utf-8'))['subboards']

# 构建股票代码到信息的映射
stock_map = {s['code']: {**s, 'subBoardName': subs.get(s['code'], {}).get('subBoardName', '?')} for s in stocks}

issues = []

print("=" * 100)
print("【全面审查】找出行业归属不准确的股票")
print("=" * 100)

# 1. 检查家电零部件中可能属于汽车的股票（类似三花智控）
print("\n【1. 家电零部件中可能属于汽车的股票】")
print("-" * 100)
for code, info in stock_map.items():
    if info['subBoardName'] == '家电零部件':
        name = info['name']
        # 检查是否包含汽车相关关键词
        auto_keywords = ['汽车', '车用', '车载', '热管理', '压缩机', '空调', '新能源', '电动', '电池', '电机']
        if any(kw in name for kw in auto_keywords):
            issues.append({
                'code': code,
                'name': name,
                'current_board': info['boardName'],
                'current_sub': info['subBoardName'],
                'suggested_board': '汽车',
                'suggested_sub': '汽车零部件',
                'reason': '名称含汽车相关关键词，可能主营汽车业务'
            })
            print(f"{code} {name}: {info['boardName']}/{info['subBoardName']} → 建议: 汽车/汽车零部件")

# 2. 检查消费电子/计算机设备中实际是软件/服务的股票
print("\n【2. 硬件行业中实际是软件/服务的股票】")
print("-" * 100)
software_keywords = ['软件', '信息', '数据', '网络', '科技', '智能', '系统', '平台']
for code, info in stock_map.items():
    if info['boardName'] in ['消费电子', '计算机']:
        name = info['name']
        if any(kw in name for kw in software_keywords):
            # 检查是否真的是硬件公司（排除已经正确分类的）
            if not any(hw in name for hw in ['电子', '器件', '设备', '硬件', '制造', '材料']):
                issues.append({
                    'code': code,
                    'name': name,
                    'current_board': info['boardName'],
                    'current_sub': info['subBoardName'],
                    'suggested_board': 'AI与软件',
                    'suggested_sub': '软件开发',
                    'reason': '名称含软件关键词，可能主营软件业务'
                })
                print(f"{code} {name}: {info['boardName']}/{info['subBoardName']} → 建议: AI与软件/软件开发")

# 3. 检查化工材料中实际是电子/半导体的股票（新材料公司）
print("\n【3. 化工材料中可能是电子/半导体的股票】")
print("-" * 100)
for code, info in stock_map.items():
    if info['boardName'] == '化工材料':
        name = info['name']
        # 检查是否包含电子/半导体相关关键词
        elec_keywords = ['电子', '半导体', '芯片', '集成电路', '硅', '晶圆', '光刻', '封装']
        if any(kw in name for kw in elec_keywords):
            issues.append({
                'code': code,
                'name': name,
                'current_board': info['boardName'],
                'current_sub': info['subBoardName'],
                'suggested_board': '半导体',
                'suggested_sub': '半导体',
                'reason': '名称含电子/半导体关键词，可能主营半导体材料'
            })
            print(f"{code} {name}: {info['boardName']}/{info['subBoardName']} → 建议: 半导体/半导体")

# 4. 检查医药制药中实际是医疗服务的股票
print("\n【4. 医药制药中可能是医疗服务的股票】")
print("-" * 100)
for code, info in stock_map.items():
    if info['boardName'] == '医药制药':
        name = info['name']
        service_keywords = ['医院', '医疗', '诊所', '体检', '诊断', '检验', '医美', '美容']
        if any(kw in name for kw in service_keywords):
            issues.append({
                'code': code,
                'name': name,
                'current_board': info['boardName'],
                'current_sub': info['subBoardName'],
                'suggested_board': '医疗健康',
                'suggested_sub': '医疗服务',
                'reason': '名称含医疗服务关键词，可能主营医疗服务'
            })
            print(f"{code} {name}: {info['boardName']}/{info['subBoardName']} → 建议: 医疗健康/医疗服务")

# 5. 检查机械装备中实际是汽车的股票
print("\n【5. 机械装备中可能是汽车的股票】")
print("-" * 100)
for code, info in stock_map.items():
    if info['boardName'] == '机械装备':
        name = info['name']
        auto_keywords = ['汽车', '车身', '底盘', '变速箱', '发动机', '轮胎', '座椅', '车灯']
        if any(kw in name for kw in auto_keywords):
            issues.append({
                'code': code,
                'name': name,
                'current_board': info['boardName'],
                'current_sub': info['subBoardName'],
                'suggested_board': '汽车',
                'suggested_sub': '汽车零部件',
                'reason': '名称含汽车零部件关键词'
            })
            print(f"{code} {name}: {info['boardName']}/{info['subBoardName']} → 建议: 汽车/汽车零部件")

# 6. 检查消费零售中实际是食品饮料的股票
print("\n【6. 消费零售中可能是食品饮料的股票】")
print("-" * 100)
for code, info in stock_map.items():
    if info['boardName'] == '消费零售':
        name = info['name']
        food_keywords = ['食品', '饮料', '酒', '奶', '茶', '咖啡', '零食', '调味', '粮油']
        if any(kw in name for kw in food_keywords):
            issues.append({
                'code': code,
                'name': name,
                'current_board': info['boardName'],
                'current_sub': info['subBoardName'],
                'suggested_board': '食品饮料',
                'suggested_sub': '食品加工',
                'reason': '名称含食品饮料关键词'
            })
            print(f"{code} {name}: {info['boardName']}/{info['subBoardName']} → 建议: 食品饮料/食品加工")

# 7. 检查新能源中实际是电力公用的股票（发电公司）
print("\n【7. 新能源中可能是电力公用的股票】")
print("-" * 100)
for code, info in stock_map.items():
    if info['boardName'] == '新能源':
        name = info['name']
        power_keywords = ['电力', '发电', '供电', '电网', '能源', '水电', '火电', '风电', '光伏']
        # 如果是纯粹的发电公司而非设备制造商
        if any(kw in name for kw in power_keywords) and not any(kw in name for kw in ['设备', '制造', '材料', '组件']):
            issues.append({
                'code': code,
                'name': name,
                'current_board': info['boardName'],
                'current_sub': info['subBoardName'],
                'suggested_board': '电力公用',
                'suggested_sub': '电力',
                'reason': '可能是发电企业而非设备制造商'
            })
            print(f"{code} {name}: {info['boardName']}/{info['subBoardName']} → 建议: 电力公用/电力")

# 8. 检查资源周期中实际是化工材料的股票（新材料）
print("\n【8. 资源周期中可能是化工材料的股票】")
print("-" * 100)
for code, info in stock_map.items():
    if info['boardName'] == '资源周期':
        name = info['name']
        chem_keywords = ['化学', '化工', '材料', '纤维', '塑料', '橡胶', '涂料', '树脂']
        if any(kw in name for kw in chem_keywords):
            issues.append({
                'code': code,
                'name': name,
                'current_board': info['boardName'],
                'current_sub': info['subBoardName'],
                'suggested_board': '化工材料',
                'suggested_sub': '化学制品',
                'reason': '名称含化工材料关键词'
            })
            print(f"{code} {name}: {info['boardName']}/{info['subBoardName']} → 建议: 化工材料/化学制品")

# 汇总
print("\n" + "=" * 100)
print(f"【汇总】共发现 {len(issues)} 只可能存在归属问题的股票")
print("=" * 100)

# 按建议板块分组
from collections import Counter
suggested_boards = Counter([i['suggested_board'] for i in issues])
print("\n建议调整方向分布：")
for board, count in suggested_boards.most_common():
    print(f"  {board}: {count}只")
