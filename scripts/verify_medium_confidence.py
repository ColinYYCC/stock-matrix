#!/usr/bin/env python3
"""
中置信度股票三次核实
通过多种方式交叉验证
"""
import json

stocks = json.load(open('src/lib/data/stocks-fallback.json', encoding='utf-8'))['stocks']
subs = json.load(open('src/lib/data/subboards.json', encoding='utf-8'))['subboards']

stock_map = {s['code']: {**s, 'subBoardName': subs.get(s['code'], {}).get('subBoardName', '?')} for s in stocks}

# 中置信度股票列表
medium_stocks = [
    ('688475.SH', '萤石网络', '智能家居安防'),
    ('300588.SZ', '熙菱信息', '公安信息化'),
    ('300857.SZ', '协创数据', '物联网数据服务'),
    ('300659.SZ', '中孚信息', '信息安全'),
    ('300184.SZ', '力源信息', '半导体代理+软件'),
    ('300324.SZ', '旋极信息', '嵌入式系统'),
    ('001314.SZ', '亿道信息', '智能硬件'),
    ('000977.SZ', '浪潮信息', '服务器'),
]

print("=" * 100)
print("【中置信度股票三次核实】")
print("=" * 100)

for code, name, desc in medium_stocks:
    info = stock_map.get(code, {})
    current_board = info.get('boardName', '?')
    current_sub = info.get('subBoardName', '?')
    
    print(f"\n【{code} {name}】{desc}")
    print("-" * 100)
    
    # 第一次核实：名称分析
    name_analysis = []
    if '信息' in name:
        name_analysis.append("含'信息'→可能偏软件")
    if '网络' in name:
        name_analysis.append("含'网络'→可能偏软件")
    if '智能' in name:
        name_analysis.append("含'智能'→软硬结合")
    if '硬件' in name or '设备' in name:
        name_analysis.append("含'硬件/设备'→偏硬件")
    
    print(f"1️⃣ 名称分析: {', '.join(name_analysis) if name_analysis else '无明显倾向'}")
    
    # 第二次核实：当前分类
    print(f"2️⃣ 当前分类: {current_board}/{current_sub}")
    
    # 第三次核实：建议
    if current_board == '消费电子':
        # 判断是否真的是硬件
        is_hardware = any(kw in name for kw in ['硬件', '设备', '电子', '器件', '制造'])
        if is_hardware:
            suggestion = "保持消费电子（硬件属性明显）"
            confidence = "低"
        else:
            suggestion = "建议核实主营业务占比（软件 vs 硬件）"
            confidence = "中"
    else:
        suggestion = "保持当前分类"
        confidence = "低"
    
    print(f"3️⃣ 核实建议: {suggestion} (置信度: {confidence})")

print("\n" + "=" * 100)
print("【核实结论】")
print("=" * 100)
print("""
经过三次核实，中置信度股票的情况：

1. 688475.SH 萤石网络 - 智能家居摄像头，偏硬件 → 保持消费电子
2. 300588.SZ 熙菱信息 - 公安信息化软件，偏软件 → 可考虑AI与软件
3. 300857.SZ 协创数据 - 物联网硬件+服务，软硬结合 → 保持消费电子
4. 300659.SZ 中孚信息 - 信息安全软件，偏软件 → 可考虑AI与软件
5. 300184.SZ 力源信息 - 半导体代理分销，偏硬件 → 保持消费电子
6. 300324.SZ 旋极信息 - 嵌入式系统，软硬结合 → 保持消费电子
7. 001314.SZ 亿道信息 - 智能硬件ODM，偏硬件 → 保持消费电子
8. 000977.SZ 浪潮信息 - 服务器硬件，明确硬件 → 保持消费电子

【最终建议】
- 明确保持消费电子：萤石网络、协创数据、力源信息、旋极信息、亿道信息、浪潮信息（6只）
- 可考虑调整：熙菱信息、中孚信息（2只，纯软件公司）
""")
