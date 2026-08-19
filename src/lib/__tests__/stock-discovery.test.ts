/**
 * stock-discovery 模块测试
 *
 * TDD: 先写测试，再实现
 *
 * 测试覆盖：
 * 1. classifyByIndustry — 申万二级行业 → 大板块映射
 * 2. parseClistStocks — 东方财富 clist 接口响应解析
 * 3. mergeDiscoveredWithBaseline — 动态发现的股票与静态基线合并
 * 4. discoverStocks — 完整流程（含缓存 + 兜底 + 总数预检）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// mock trading-hours，默认返回开市
vi.mock("@/lib/trading-hours", () => ({
  isTradingHours: vi.fn().mockReturnValue(true),
  CST_OFFSET_MS: 8 * 60 * 60 * 1000,
}));

import {
  classifyByIndustry,
  parseClistStocks,
  mergeDiscoveredWithBaseline,
  discoverStocks,
  __resetDiscoveryCacheForTest,
} from "@/lib/stock-discovery";
import type { StockSnapshot } from "@/lib/stock-discovery";
import { isTradingHours } from "@/lib/trading-hours";

// ============ 辅助函数 ============

function makeClistRow(opts: {
  code: string;
  name?: string;
  price?: number;
  changePct?: number;
  totalCap?: number;
  floatCap?: number;
  marketFlag?: number;
  industry?: string;
}) {
  return {
    f12: opts.code,
    f14: opts.name ?? "测试股票",
    f2: opts.price ?? 10.0,
    f3: opts.changePct ?? 1.5,
    f20: opts.totalCap ?? 1_000_000_000,
    f21: opts.floatCap ?? 800_000_000,
    f13: opts.marketFlag ?? 0,
    f100: opts.industry ?? "半导体",
  };
}

function makeClistPayload(rows: ReturnType<typeof makeClistRow>[], total?: number) {
  return {
    data: {
      total: total ?? rows.length,
      diff: rows,
    },
  };
}

function makeBaselineStock(opts: Partial<StockSnapshot> & { code: string }): StockSnapshot {
  return {
    code: opts.code,
    exchange: opts.exchange ?? "SH",
    name: opts.name ?? "基线股票",
    boardName: opts.boardName ?? "其他",
    subBoardName: opts.subBoardName ?? "其他",
    price: opts.price ?? 10.0,
    changePct: opts.changePct ?? 0,
    totalMarketCap: opts.totalMarketCap ?? 1_000_000_000,
    floatMarketCap: opts.floatMarketCap ?? 800_000_000,
  };
}

// ============ 1. classifyByIndustry ============

describe("classifyByIndustry", () => {
  it("已知行业 → 返回正确大板块", () => {
    expect(classifyByIndustry("半导体")).toBe("半导体");
    expect(classifyByIndustry("光伏设备")).toBe("新能源");
    expect(classifyByIndustry("国有大型银行")).toBe("金融");
    expect(classifyByIndustry("化学制药")).toBe("医药制药");
    expect(classifyByIndustry("白酒")).toBe("食品饮料");
    expect(classifyByIndustry("乘用车")).toBe("汽车");
    expect(classifyByIndustry("航空装备")).toBe("国防航天");
  });

  it("带 Ⅱ/Ⅰ 后缀 → 去除后缀后匹配", () => {
    expect(classifyByIndustry("半导体Ⅱ")).toBe("半导体");
    expect(classifyByIndustry("银行Ⅰ")).toBe("金融");
    expect(classifyByIndustry(" 白酒 ")).toBe("食品饮料");
  });

  it("未知行业 → null", () => {
    expect(classifyByIndustry("不存在的行业")).toBeNull();
    expect(classifyByIndustry("某新兴行业")).toBeNull();
  });

  it("空值或无效输入 → null", () => {
    expect(classifyByIndustry("")).toBeNull();
    expect(classifyByIndustry("-")).toBeNull();
    expect(classifyByIndustry("  ")).toBeNull();
  });
});

// ============ 2. parseClistStocks ============

describe("parseClistStocks", () => {
  it("正常 payload → 解析出股票列表", () => {
    const payload = makeClistPayload([
      makeClistRow({ code: "600519", name: "贵州茅台", price: 1800.0, industry: "白酒", marketFlag: 1 }),
      makeClistRow({ code: "000001", name: "平安银行", price: 12.5, industry: "股份制银行", marketFlag: 0 }),
    ]);

    const stocks = parseClistStocks(payload);
    expect(stocks).toHaveLength(2);

    expect(stocks[0].code).toBe("600519.SH");
    expect(stocks[0].name).toBe("贵州茅台");
    expect(stocks[0].price).toBe(1800.0);
    expect(stocks[0].boardName).toBe("食品饮料");
    expect(stocks[0].exchange).toBe("SH");

    expect(stocks[1].code).toBe("000001.SZ");
    expect(stocks[1].boardName).toBe("金融");
    expect(stocks[1].exchange).toBe("SZ");
  });

  it("北交所股票 → exchange 为 BJ", () => {
    const payload = makeClistPayload([
      makeClistRow({ code: "830799", name: "万达轴承", price: 5.0, industry: "通用设备" }),
      makeClistRow({ code: "920002", name: "万达轴承2", price: 5.0, industry: "通用设备" }),
    ]);

    const stocks = parseClistStocks(payload);
    expect(stocks).toHaveLength(2);
    expect(stocks[0].exchange).toBe("BJ");
    expect(stocks[1].exchange).toBe("BJ");
  });

  it("重复 code → 去重", () => {
    const payload = makeClistPayload([
      makeClistRow({ code: "600519", name: "贵州茅台", price: 1800.0, marketFlag: 1 }),
      makeClistRow({ code: "600519", name: "重复", price: 999.0, marketFlag: 1 }),
    ]);

    const stocks = parseClistStocks(payload);
    expect(stocks).toHaveLength(1);
    expect(stocks[0].name).toBe("贵州茅台");
  });

  it("price <= 0 的行 → 跳过", () => {
    const payload = makeClistPayload([
      makeClistRow({ code: "600519", name: "贵州茅台", price: 1800.0, marketFlag: 1 }),
      makeClistRow({ code: "000002", name: "零价股", price: 0 }),
      makeClistRow({ code: "000003", name: "负价股", price: -1 }),
    ]);

    const stocks = parseClistStocks(payload);
    expect(stocks).toHaveLength(1);
    expect(stocks[0].code).toBe("600519.SH");
  });

  it("空 code 的行 → 跳过", () => {
    const payload = makeClistPayload([
      makeClistRow({ code: "", name: "空代码" }),
      makeClistRow({ code: "600519", name: "贵州茅台", marketFlag: 1 }),
    ]);

    const stocks = parseClistStocks(payload);
    expect(stocks).toHaveLength(1);
  });

  it("无 diff 的 payload → 空数组", () => {
    expect(parseClistStocks({ data: {} })).toEqual([]);
    expect(parseClistStocks({ data: { diff: null } })).toEqual([]);
    expect(parseClistStocks({})).toEqual([]);
  });

  it("多页 payload → 全部解析", () => {
    const payloads = [
      makeClistPayload([makeClistRow({ code: "600519", name: "茅台", marketFlag: 1 })], 3),
      makeClistPayload([makeClistRow({ code: "000001", name: "平安" })]),
      makeClistPayload([makeClistRow({ code: "000002", name: "万科" })]),
    ];

    const stocks = parseClistStocks(payloads);
    expect(stocks).toHaveLength(3);
  });

  it("名称全角 A/B → 转半角", () => {
    const payload = makeClistPayload([
      makeClistRow({ code: "600519", name: "贵州茅\uFF21", marketFlag: 1 }),
    ]);
    const stocks = parseClistStocks(payload);
    expect(stocks[0].name).toBe("贵州茅A");
  });

  it("未匹配行业 → boardName 为 '其他'", () => {
    const payload = makeClistPayload([
      makeClistRow({ code: "600519", name: "茅台", industry: "某未知行业", marketFlag: 1 }),
    ]);
    const stocks = parseClistStocks(payload);
    expect(stocks[0].boardName).toBe("其他");
  });

  it("subBoardName 保留去除后缀的行业名", () => {
    const payload = makeClistPayload([
      makeClistRow({ code: "600519", name: "茅台", industry: "白酒Ⅱ", marketFlag: 1 }),
    ]);
    const stocks = parseClistStocks(payload);
    expect(stocks[0].subBoardName).toBe("白酒");
  });
});

// ============ 3. mergeDiscoveredWithBaseline ============

describe("mergeDiscoveredWithBaseline", () => {
  it("新股 → 添加到结果，使用动态分类", () => {
    const baseline: StockSnapshot[] = [
      makeBaselineStock({ code: "600519.SH", name: "贵州茅台", boardName: "食品饮料", subBoardName: "白酒" }),
    ];
    const discovered = [
      makeBaselineStock({ code: "600519.SH", name: "贵州茅台", boardName: "食品饮料" }),
      makeBaselineStock({ code: "999999.SH", name: "新股A", boardName: "半导体", subBoardName: "半导体" }),
    ];

    const merged = mergeDiscoveredWithBaseline(discovered, baseline);
    expect(merged).toHaveLength(2);

    const newStock = merged.find((s) => s.code === "999999.SH");
    expect(newStock).toBeDefined();
    expect(newStock!.boardName).toBe("半导体");
    expect(newStock!.subBoardName).toBe("半导体");
  });

  it("已有股票 → 保留基线 subBoardName，更新动态字段", () => {
    const baseline: StockSnapshot[] = [
      makeBaselineStock({
        code: "600519.SH", name: "贵州茅台", boardName: "食品饮料", subBoardName: "白酒", price: 1700.0,
      }),
    ];
    const discovered = [
      makeBaselineStock({
        code: "600519.SH", name: "贵州茅台", boardName: "食品饮料", subBoardName: "其他", price: 1800.0,
      }),
    ];

    const merged = mergeDiscoveredWithBaseline(discovered, baseline);
    expect(merged).toHaveLength(1);
    expect(merged[0].price).toBe(1800.0);
    expect(merged[0].subBoardName).toBe("白酒");
  });

  it("基线中有但动态未返回 → 保留（可能停牌）", () => {
    const baseline: StockSnapshot[] = [
      makeBaselineStock({ code: "600519.SH", name: "贵州茅台" }),
      makeBaselineStock({ code: "000001.SZ", name: "平安银行" }),
    ];
    const discovered = [
      makeBaselineStock({ code: "600519.SH", name: "贵州茅台" }),
    ];

    const merged = mergeDiscoveredWithBaseline(discovered, baseline);
    expect(merged).toHaveLength(2);
    expect(merged.find((s) => s.code === "000001.SZ")).toBeDefined();
  });

  it("STOCK_OVERRIDE → 覆盖行业分类", () => {
    // 002050.SZ 在 STOCK_OVERRIDE 中 → 汽车
    const discovered = [
      makeBaselineStock({
        code: "002050.SZ", name: "三花智控", boardName: "消费零售", subBoardName: "家电零部件",
      }),
    ];

    const merged = mergeDiscoveredWithBaseline(discovered, []);
    expect(merged[0].boardName).toBe("汽车");
  });

  it("空基线 → 所有动态股票直接使用", () => {
    const discovered = [
      makeBaselineStock({ code: "600519.SH", name: "茅台", boardName: "食品饮料" }),
      makeBaselineStock({ code: "000001.SZ", name: "平安", boardName: "金融" }),
    ];

    const merged = mergeDiscoveredWithBaseline(discovered, []);
    expect(merged).toHaveLength(2);
  });

  it("空动态列表 → 返回基线", () => {
    const baseline: StockSnapshot[] = [
      makeBaselineStock({ code: "600519.SH", name: "茅台" }),
    ];

    const merged = mergeDiscoveredWithBaseline([], baseline);
    expect(merged).toHaveLength(1);
  });
});

// ============ 4. discoverStocks ============

describe("discoverStocks", () => {
  beforeEach(() => {
    __resetDiscoveryCacheForTest();
    vi.restoreAllMocks();
    // 默认 mock 为开市时段（15 分钟 TTL）
    vi.mocked(isTradingHours).mockReturnValue(true);
  });

  afterEach(() => {
    __resetDiscoveryCacheForTest();
    vi.restoreAllMocks();
  });

  it("成功拉取 → 返回动态发现的股票列表（含新股）", async () => {
    const mockPayload = makeClistPayload([
      makeClistRow({ code: "600519", name: "贵州茅台", price: 1800.0, industry: "白酒", marketFlag: 1 }),
      makeClistRow({ code: "999999", name: "全新股", price: 50.0, industry: "半导体", marketFlag: 1 }),
    ]);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockPayload,
    }));

    const result = await discoverStocks();
    expect(result.length).toBeGreaterThan(0);
    const newStock = result.find((s) => s.code === "999999.SH");
    expect(newStock).toBeDefined();
    expect(newStock!.name).toBe("全新股");
  });

  it("fetch 失败 → 回退到静态基线（不抛异常）", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    const result = await discoverStocks();
    expect(result.length).toBeGreaterThan(0);
  });

  it("fetch 返回非 200 → 回退到静态基线", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    }));

    const result = await discoverStocks();
    expect(result.length).toBeGreaterThan(0);
  });

  it("缓存生效 → 第二次调用不重新 fetch", async () => {
    const mockPayload = makeClistPayload([
      makeClistRow({ code: "600519", name: "贵州茅台", price: 1800.0, industry: "白酒", marketFlag: 1 }),
    ]);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockPayload,
    });
    vi.stubGlobal("fetch", fetchMock);

    await discoverStocks();
    const firstCallCount = fetchMock.mock.calls.length;

    await discoverStocks();
    expect(fetchMock.mock.calls.length).toBe(firstCallCount);
  });

  it("总数预检：total 没变 → 跳过全量拉取，只发 1 个请求", async () => {
    // 使用小 total（1 页），避免分页拉取
    const mockPayload = makeClistPayload(
      [makeClistRow({ code: "600519", name: "贵州茅台", price: 1800.0, marketFlag: 1 })],
      1,
    );

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockPayload,
    });
    vi.stubGlobal("fetch", fetchMock);

    // 第一次调用：全量拉取（单页场景，1 次请求）
    await discoverStocks();
    const firstCallCount = fetchMock.mock.calls.length;
    expect(firstCallCount).toBe(1);

    // 用 vi.spyOn(Date) 让缓存过期
    const realNow = Date.now;
    let fakeTime = realNow();
    vi.spyOn(Date, "now").mockImplementation(() => {
      return fakeTime;
    });
    // 快进 16 分钟（超过 15 分钟 TTL）
    fakeTime = realNow() + 16 * 60 * 1000;

    // 第二次调用：total 没变，应该只发 1 个请求（预检第一页）
    await discoverStocks();
    const secondCallCount = fetchMock.mock.calls.length;
    expect(secondCallCount).toBe(firstCallCount + 1);

    Date.now = realNow;
  });

  it("总数预检：total 变了 → 触发全量拉取", async () => {
    let currentTotal = 1;
    const fetchMock = vi.fn().mockImplementation(async () => ({
      ok: true,
      json: async () => makeClistPayload(
        [makeClistRow({ code: "600519", name: "贵州茅台", price: 1800.0, marketFlag: 1 })],
        currentTotal,
      ),
    }));
    vi.stubGlobal("fetch", fetchMock);

    // 第一次调用
    await discoverStocks();
    const firstCallCount = fetchMock.mock.calls.length;

    // 用 vi.spyOn(Date) 让缓存过期
    const realNow = Date.now;
    let fakeTime = realNow();
    vi.spyOn(Date, "now").mockImplementation(() => {
      return fakeTime;
    });
    // 快进 16 分钟
    fakeTime = realNow() + 16 * 60 * 1000;

    // total 增加（模拟新股上市）
    currentTotal = 2;

    // 第二次调用：total 变了，应该重新拉取
    await discoverStocks();
    const secondCallCount = fetchMock.mock.calls.length;
    expect(secondCallCount).toBeGreaterThan(firstCallCount);

    Date.now = realNow;
  });
});
