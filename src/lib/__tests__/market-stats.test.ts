import { describe, expect, it } from "vitest";

import {
  flatThreshold,
  groupStocksBySubBoard,
  summarizeStocks,
  weightedAverageChange,
} from "@/lib/market-stats";

describe("flatThreshold", () => {
  it("平盘阈值为 0.1（服务端与客户端共用同一个值）", () => {
    expect(flatThreshold).toBe(0.1);
  });
});

describe("weightedAverageChange", () => {
  it("按 value 加权平均涨跌幅", () => {
    const result = weightedAverageChange([
      { value: 300, changePct: 10 }, // 权重 3/4
      { value: 100, changePct: -6 }, // 权重 1/4
    ]);
    // (10*300 + -6*100) / 400 = 2400/400 = 6
    expect(result).toBeCloseTo(6);
  });

  it("跳过无数据（NaN）的股票", () => {
    const result = weightedAverageChange([
      { value: 100, changePct: 2 },
      { value: 999, changePct: Number.NaN },
    ]);
    expect(result).toBeCloseTo(2);
  });

  it("没有任何有效数据时返回 NaN，不冒充 0", () => {
    expect(weightedAverageChange([])).toBeNaN();
    expect(weightedAverageChange([{ value: 100, changePct: Number.NaN }])).toBeNaN();
  });
});

describe("summarizeStocks", () => {
  it("按阈值分类涨/平/跌并累计成交额", () => {
    const result = summarizeStocks([
      { changePct: 0.11, turnoverAmount: 10 }, // > 0.1 → 涨
      { changePct: -0.11, turnoverAmount: 20 }, // < -0.1 → 跌
      { changePct: 0.1, turnoverAmount: 30 }, // 阈值边界 → 平
      { changePct: -0.1, turnoverAmount: 40 }, // 阈值边界 → 平
      { changePct: Number.NaN, turnoverAmount: 50 }, // 无数据 → 平
    ]);
    expect(result).toEqual({ advanceCount: 1, flatCount: 3, declineCount: 1, turnoverAmount: 150 });
  });

  it("空列表全为 0", () => {
    expect(summarizeStocks([])).toEqual({
      advanceCount: 0,
      flatCount: 0,
      declineCount: 0,
      turnoverAmount: 0,
    });
  });
});

describe("groupStocksBySubBoard", () => {
  const base = {
    code: "600519.SH",
    boardName: "白酒",
    subBoardName: "高端白酒",
    value: 100,
    changePct: 1,
  };

  it("按子板块分组，组内与组间都按市值降序", () => {
    const groups = groupStocksBySubBoard([
      { ...base, code: "a", subBoardName: "高端", value: 10 },
      { ...base, code: "b", subBoardName: "低端", value: 30 },
      { ...base, code: "c", subBoardName: "高端", value: 20 },
    ]);
    expect(groups.map((group) => [group.name, group.value])).toEqual([
      ["高端", 30],
      ["低端", 30],
    ]);
    expect(groups[0].children.map((stock) => stock.code)).toEqual(["c", "a"]);
  });

  it("没有子板块的股票回退挂在一级行业名下", () => {
    const groups = groupStocksBySubBoard([
      { ...base, subBoardName: "" },
      { ...base, code: "b", subBoardName: "高端" },
    ]);
    expect(groups.map((group) => group.name)).toEqual(["白酒", "高端"]);
    expect(groups[0].boardName).toBe("白酒");
  });

  it("板块涨跌幅取组内加权平均，全无数据时按 0 显示", () => {
    const groups = groupStocksBySubBoard([
      { ...base, value: 100, changePct: 4 },
      { ...base, code: "b", value: 100, changePct: -2 },
    ]);
    expect(groups[0].changePct).toBeCloseTo(1); // (4-2)/2

    const empty = groupStocksBySubBoard([{ ...base, changePct: Number.NaN }]);
    expect(empty[0].changePct).toBe(0);
  });
});
