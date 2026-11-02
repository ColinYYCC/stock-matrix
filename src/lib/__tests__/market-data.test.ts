/**
 * market-data 收盘封存的集成回归测试
 *
 * 回放 2026-10-29 修复的完整生产场景：服务实例在集合竞价开始前（14:59）就有
 * 热缓存，收盘后（15:05）再来请求——旧代码会把竞价前的旧快照永久锁死，
 * 收盘价直到次日开盘都进不来。修复后：必须再回源一次拿到收盘价，之后才
 * 允许封存；跨日自动解锁。
 *
 * 走公共 API getTreemapData 验证（不测内部函数），mock 掉网络层与股票发现层，
 * 假时钟只伪造 Date（推进收盘时间线，不碰真实定时器）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 固定两只股票的小股票池：本测试只关心行情缓存的封存行为，不关心名单发现
vi.mock("@/lib/stock-discovery", () => {
  const stocks = [
    {
      code: "600519.SH", exchange: "SH", name: "贵州茅台", boardName: "食品饮料",
      subBoardName: "白酒", price: 1500, changePct: 1,
      totalMarketCap: 1_800_000_000_000, floatMarketCap: 1_600_000_000_000,
    },
    {
      code: "000001.SZ", exchange: "SZ", name: "平安银行", boardName: "金融",
      subBoardName: "银行", price: 11, changePct: -1,
      totalMarketCap: 200_000_000_000, floatMarketCap: 180_000_000_000,
    },
  ];
  return { discoverStocks: vi.fn().mockResolvedValue(stocks), baselineStocks: stocks };
});

import { getTreemapData } from "@/lib/market-data";
import type { TreemapResponse } from "@/types/heatmap";

/** 构造北京时间时刻（参数按北京时间理解，内部换算成 UTC 时间戳） */
function cstMoment(year: number, month: number, day: number, hour: number, minute = 0, second = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour - 8, minute, second));
}

// 时间线前提：2026-10-30 是周五，2026-10-31 是周六
const FRIDAY_BEFORE_CLOSE = cstMoment(2026, 10, 30, 14, 59, 0);
const FRIDAY_AFTER_CLOSE = cstMoment(2026, 10, 30, 15, 5, 0);
const FRIDAY_SEALED = cstMoment(2026, 10, 30, 15, 6, 0);
const SATURDAY_MORNING = cstMoment(2026, 10, 31, 10, 0, 0);

/** 东方财富指数行情（7 个市场全覆盖，满足 75% 完整性校验） */
function eastmoneyIndexPayload() {
  const rows = [
    ["399317", 0, "国证A指"], ["000001", 1, "上证指数"], ["399107", 0, "深证A指"],
    ["000300", 1, "沪深300"], ["000510", 1, "中证A500"], ["399006", 0, "创业板指"],
    ["000680", 1, "科创50"],
  ] as const;
  return {
    data: {
      diff: rows.map(([code, marketFlag, name]) => ({
        f2: 1000, f3: 0.5, f12: code, f13: marketFlag, f14: name, f18: 995,
        f124: Math.floor(FRIDAY_AFTER_CLOSE.getTime() / 1000),
      })),
    },
  };
}

/** 东方财富个股行情（f12+f13 → 600519.SH / 000001.SZ） */
function eastmoneyQuotePayload(changePct: number, timestamp: Date) {
  const f124 = Math.floor(timestamp.getTime() / 1000);
  return {
    data: {
      diff: [
        { f2: 1500, f3: changePct, f12: "600519", f13: 1, f14: "贵州茅台", f18: 1450, f124 },
        { f2: 11, f3: changePct, f12: "000001", f13: 0, f14: "平安银行", f18: 11.1, f124 },
      ],
    },
  };
}

function tenjqkaDistributionPayload() {
  return {
    status_code: 0,
    data: { last_update_time: "2026-10-30 15:04:30", up: 4681, flat: 72, down: 818 },
  };
}

function tenjqkaTurnoverPayload() {
  return {
    data: {
      charts: {
        header: [
          { key: "turnover", val: 1_570_704_300_000 },
          { key: "turnover_pre", val: 1_642_093_000_000 },
          { key: "turnover_change", val: -71_388_700_000 },
        ],
      },
    },
  };
}

/** 按 URL 路由到对应的上游 canned 响应；个股行情端点按调用序号换数据 */
function makeFetchRouter() {
  let quotesCallCount = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    let payload: unknown;
    if (url.includes("secids=1.600519")) {
      quotesCallCount += 1;
      // 第 1 次返回集合竞价前的价格；之后返回收盘价口径
      payload = quotesCallCount === 1
        ? eastmoneyQuotePayload(1.0, FRIDAY_BEFORE_CLOSE)
        : eastmoneyQuotePayload(3.38, FRIDAY_AFTER_CLOSE);
    } else if (url.includes("secids=0.399317")) {
      payload = eastmoneyIndexPayload();
    } else if (url.includes("up_down_distribution")) {
      payload = tenjqkaDistributionPayload();
    } else if (url.includes("turnover_minute")) {
      payload = tenjqkaTurnoverPayload();
    } else {
      throw new Error(`测试未预置的上游请求: ${url}`);
    }
    return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  return { fetchMock, getQuotesCallCount: () => quotesCallCount };
}

function findStockChangePct(data: TreemapResponse, code: string): number {
  for (const board of data.nodes) {
    const stock = board.children.find((item) => item.code === code);
    if (stock) return stock.changePct;
  }
  throw new Error(`未找到股票 ${code}`);
}

describe("收盘封存（getTreemapData 集成回归）", () => {
  beforeEach(() => {
    // 只伪造 Date：时间线可以跳到收盘后/跨日，真实定时器不受影响
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("热缓存停在竞价前：收盘后必须再回源拿收盘价，之后才封存，跨日解锁", async () => {
    const { fetchMock, getQuotesCallCount } = makeFetchRouter();
    vi.stubGlobal("fetch", fetchMock);

    // ① 周五 14:59（集合竞价开始前）首次加载：拿到竞价前的价格
    vi.setSystemTime(FRIDAY_BEFORE_CLOSE);
    let data = await getTreemapData("all", "day");
    expect(getQuotesCallCount()).toBe(1);
    expect(findStockChangePct(data, "600519.SH")).toBeCloseTo(1.0);

    // ② 周五 15:05（收盘后）：缓存来自 14:59，没过封存线——不许封存，
    //    必须再回源一次。旧代码在这里直接返回旧缓存并永久锁死（bug 现场）。
    vi.setSystemTime(FRIDAY_AFTER_CLOSE);
    data = await getTreemapData("all", "day");
    expect(getQuotesCallCount()).toBe(2);
    expect(findStockChangePct(data, "600519.SH")).toBeCloseTo(3.38);

    // ③ 周五 15:06：缓存已来自收盘之后（15:05 ≥ 封存线 15:01），封存、不再回源
    vi.setSystemTime(FRIDAY_SEALED);
    data = await getTreemapData("all", "day");
    expect(getQuotesCallCount()).toBe(2);
    expect(findStockChangePct(data, "600519.SH")).toBeCloseTo(3.38);

    // ④ 周六 10:00：跨日解锁清空缓存，恢复回源
    vi.setSystemTime(SATURDAY_MORNING);
    data = await getTreemapData("all", "day");
    expect(getQuotesCallCount()).toBe(3);
  });
});
