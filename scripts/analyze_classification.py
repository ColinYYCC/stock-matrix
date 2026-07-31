#!/usr/bin/env python3
"""分析当前行业分类分布，并计算重新分组后的预估数据"""
import json
from collections import Counter

DATA_DIR = "src/lib/data"

with open(f"{DATA_DIR}/subboards.json", encoding="utf-8") as f:
    sub_data = json.load(f)
with open(f"{DATA_DIR}/stocks-fallback.json", encoding="utf-8") as f:
    stock_data = json.load(f)

subs = sub_data["subboards"]
stocks = stock_data["stocks"]

# 构建股票 -> (sectorName, subBoardName, floatMarketCap) 映射
stock_info = {}
for s in stocks:
    code = s["code"]
    sub_info = subs.get(code, {})
    stock_info[code] = {
        "sector": sub_info.get("sectorName", s.get("boardName", "其他")),
        "sub": sub_info.get("subBoardName", s.get("boardName", "其他")),
        "cap": s.get("floatMarketCap", 0),
    }

# 统计每个二级行业的股票数和市值
sub_stats = Counter()
sub_cap = Counter()
for code, info in stock_info.items():
    sub_stats[info["sub"]] += 1
    sub_cap[info["sub"]] += info["cap"]

# 定义新的大板块映射
new_mapping = {
    "半导体": ["半导体", "电子化学品"],
    "消费电子": ["消费电子", "光学光电子", "元件", "其他电子"],
    "新能源": ["电池", "光伏设备", "风电设备"],
    "电力电网": ["电网设备", "其他电源设备", "电机", "电力", "燃气"],
    "软件互联网": ["软件开发", "IT服务", "互联网电商", "计算机设备"],
    "通信": ["通信设备", "通信服务"],
    "医药制造": ["化学制药", "中药", "生物制品", "医药商业"],
    "医疗健康": ["医疗器械", "医疗服务", "医疗美容"],
    "化工": ["化学制品", "化学原料", "农化制品", "化学纤维", "塑料", "橡胶", "非金属材料"],
    "机械设备": ["通用设备", "专用设备", "自动化设备", "工程机械", "轨交设备"],
    "汽车": ["乘用车", "商用车", "摩托车及其他", "汽车服务", "汽车零部件"],
    "国防军工": ["航空装备", "军工电子", "航天装备", "地面兵装", "航海装备"],
    "金融": ["国有大型银行", "股份制银行", "城商行", "农商行", "证券", "保险", "多元金融"],
    "食品饮料": ["白酒", "休闲食品", "调味发酵品", "非白酒", "食品加工", "饮料乳品"],
    "家电轻工": ["白色家电", "黑色家电", "小家电", "厨卫电器", "家电零部件", "照明设备", "其他家电", "家居用品", "包装印刷", "文娱用品", "造纸"],
    "消费服务": ["一般零售", "专业连锁", "贸易", "旅游零售", "服装家纺", "纺织制造", "饰品", "化妆品", "个护用品", "专业服务", "教育", "体育", "旅游及景区", "酒店餐饮"],
    "资源材料": ["工业金属", "小金属", "能源金属", "贵金属", "金属新材料", "焦炭", "煤炭开采", "油气开采", "油服工程", "炼化及贸易", "冶钢原料", "普钢", "特钢"],
    "基建地产": ["房地产开发", "房地产服务", "房屋建设", "装修装饰", "基础建设", "专业工程", "工程咨询服务", "水泥", "玻璃玻纤", "装修建材"],
    "传媒": ["游戏", "影视院线", "广告营销", "数字媒体", "出版", "电视广播"],
    "农林牧渔": ["养殖业", "种植业", "林业", "渔业", "饲料", "农产品加工", "农业综合", "动物保健"],
    "交运物流": ["物流", "航运港口", "航空机场", "铁路公路"],
    "环保": ["环境治理", "环保设备"],
    "综合": ["综合"],
}

# 计算每个新板块的股票数和市值
print("=== 新大板块分布 ===")
total_stocks = 0
total_cap = 0
unmatched_subs = set(sub_stats.keys())
for board, sub_list in new_mapping.items():
    count = sum(sub_stats.get(s, 0) for s in sub_list)
    cap = sum(sub_cap.get(s, 0) for s in sub_list)
    total_stocks += count
    total_cap += cap
    for s in sub_list:
        unmatched_subs.discard(s)
    sub_str = "、".join(sub_list)
    print(f"{board:8s}: {count:4d} 只  {cap/1e8:10.1f} 亿  ({sub_str})")

print(f"\n总计: {total_stocks} 只, {total_cap/1e8:.1f} 亿")
print(f"数据中实际股票数: {len(stocks)}")
if unmatched_subs:
    print(f"未匹配的二级行业: {unmatched_subs}")
    for s in unmatched_subs:
        print(f"  {s}: {sub_stats.get(s, 0)} 只, {sub_cap.get(s, 0)/1e8:.1f} 亿")
