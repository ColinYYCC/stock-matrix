#!/usr/bin/env python3
"""
精准审查：找出明显业务错配的股票（类似三花智控模式）
核心逻辑：主营业务与行业分类严重不符
"""
import json

stocks = json.load(open('src/lib/data/stocks-fallback.json', encoding='utf-8'))['stocks']
subs = json.load(open('src/lib/data/subboards.json', encoding='utf-8'))['subboards']

stock_map = {s['code']: {**s, 'subBoardName': subs.get(s['code'], {}).get('subBoardName', '?')} for s in stocks}

high_confidence_issues = []
medium_confidence_issues = []

print("=" * 100)
print("【精准审查】找出明显业务错配的股票")
print("=" * 100)

# 1. 高置信度：家电零部件 → 汽车（类似三花智控的明确案例）
print("\n【高置信度】家电零部件 → 汽车（明确汽车零部件业务）")
print("-" * 100)
auto_parts_keywords = ['汽车', '车用', '车载', '新能源', '电动', '压缩机', '热管理', '空调', '电池', '电机']
for code, info in stock_map.items():
    if info['subBoardName'] == '家电零部件':
        name = info['name']
        # 必须包含明确的汽车关键词
        if any(kw in name for kw in auto_parts_keywords):
            high_confidence_issues.append({
                'code': code,
                'name': name,
                'current': f"{info['boardName']}/{info['subBoardName']}",
                'suggested': '汽车/汽车零部件',
                'confidence': '高',
                'reason': '家电零部件公司，名称明确含汽车业务关键词'
            })
            print(f"{code} {name}")

# 2. 高置信度：发电/能源企业错配在新能源设备板块
print("\n【高置信度】新能源设备 → 电力公用（发电企业）")
print("-" * 100)
for code, info in stock_map.items():
    if info['boardName'] == '新能源':
        name = info['name']
        # 纯发电企业（不含设备、制造、材料）
        if any(kw in name for kw in ['电力', '发电', '能源']) and not any(kw in name for kw in ['设备', '制造', '材料', '组件', '科技']):
            high_confidence_issues.append({
                'code': code,
                'name': name,
                'current': f"{info['boardName']}/{info['subBoardName']}",
                'suggested': '电力公用/电力',
                'confidence': '高',
                'reason': '发电企业，非设备制造商'
            })
            print(f"{code} {name}")

# 3. 高置信度：医药商业/制药 → 医疗服务（医院、诊所类）
print("\n【高置信度】医药制药 → 医疗健康（医疗服务机构）")
print("-" * 100)
for code, info in stock_map.items():
    if info['boardName'] == '医药制药':
        name = info['name']
        # 明确的医疗服务机构
        if any(kw in name for kw in ['医院', '医疗', '诊所', '体检', '医美']):
            high_confidence_issues.append({
                'code': code,
                'name': name,
                'current': f"{info['boardName']}/{info['subBoardName']}",
                'suggested': '医疗健康/医疗服务',
                'confidence': '高',
                'reason': '医疗服务机构，非制药企业'
            })
            print(f"{code} {name}")

# 4. 中置信度：消费电子中的纯软件公司（需要进一步核实）
print("\n【中置信度】消费电子 → AI与软件（可能是纯软件公司）")
print("-" * 100)
for code, info in stock_map.items():
    if info['boardName'] == '消费电子':
        name = info['name']
        # 纯软件/信息类，不含电子、器件、材料等硬件词
        if any(kw in name for kw in ['软件', '信息', '数据', '网络']) and not any(kw in name for kw in ['电子', '器件', '材料', '硬件', '制造', '光电', '元件']):
            medium_confidence_issues.append({
                'code': code,
                'name': name,
                'current': f"{info['boardName']}/{info['subBoardName']}",
                'suggested': 'AI与软件/软件开发',
                'confidence': '中',
                'reason': '名称含软件关键词，需核实实际业务'
            })

# 打印中置信度列表（只显示前20）
for issue in medium_confidence_issues[:20]:
    print(f"{issue['code']} {issue['name']}")
if len(medium_confidence_issues) > 20:
    print(f"... 等共{len(medium_confidence_issues)}只")

# 5. 中置信度：化工材料中的半导体材料公司
print("\n【中置信度】化工材料 → 半导体（半导体材料公司）")
print("-" * 100)
for code, info in stock_map.items():
    if info['boardName'] == '化工材料':
        name = info['name']
        # 半导体相关材料
        if any(kw in name for kw in ['半导体', '芯片', '硅', '晶圆']) and any(kw in name for kw in ['材料', '化学']):
            medium_confidence_issues.append({
                'code': code,
                'name': name,
                'current': f"{info['boardName']}/{info['subBoardName']}",
                'suggested': '半导体/半导体',
                'confidence': '中',
                'reason': '半导体材料公司，需核实产品应用'
            })
            print(f"{code} {name}")

# 汇总
print("\n" + "=" * 100)
print(f"【汇总】高置信度: {len(high_confidence_issues)}只, 中置信度: {len(medium_confidence_issues)}只")
print("=" * 100)

# 输出详细列表到文件
with open('/Volumes/SSSTC CL6/stock/stock-matrix/scripts/misclassified_report.txt', 'w', encoding='utf-8') as f:
    f.write("=" * 100 + "\n")
    f.write("【高置信度 - 建议优先处理】\n")
    f.write("=" * 100 + "\n\n")
    for issue in high_confidence_issues:
        f.write(f"{issue['code']} {issue['name']}\n")
        f.write(f"  当前: {issue['current']}\n")
        f.write(f"  建议: {issue['suggested']}\n")
        f.write(f"  原因: {issue['reason']}\n\n")
    
    f.write("\n" + "=" * 100 + "\n")
    f.write("【中置信度 - 需要人工核实】\n")
    f.write("=" * 100 + "\n\n")
    for issue in medium_confidence_issues:
        f.write(f"{issue['code']} {issue['name']}\n")
        f.write(f"  当前: {issue['current']}\n")
        f.write(f"  建议: {issue['suggested']}\n")
        f.write(f"  原因: {issue['reason']}\n\n")

print("\n详细报告已保存到: scripts/misclassified_report.txt")
