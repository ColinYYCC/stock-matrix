/**
 * heatmap-layout 单测：
 * 1. 无字判定（canShowAnyLabel）与 drawStockLabel 的画字门槛同一把尺子；
 * 2. 迭代删减收敛：删完后画布上不存在放不下名字的色块；
 * 3. 剔除集 ⊆ 直接布局画出的集合（有名字的块不会被误删）；
 * 4. 删减不修改传入的板块数据；
 * 5. 整个板块都放不下名字时板块整体消失。
 */
import { describe, expect, it } from "vitest";
import { canShowAnyLabel } from "@/lib/canvas-render";
import { computeHeatmapLayout, computeLayoutHidingUnreadable } from "@/lib/heatmap-layout";
import type { HeatmapBoardNode, HeatmapStockNode } from "@/types/heatmap";

function makeStock(code: string, value: number): HeatmapStockNode {
  return {
    code,
    name: `股票${code}`,
    boardName: "测试板块",
    subBoardName: "测试子板块",
    value,
    exchange: "SH",
    price: 10,
    changePct: 1.2,
    turnoverAmount: 1_000_000,
  };
}

function makeBoard(name: string, codes: Array<[string, number]>): HeatmapBoardNode {
  const children = codes.map(([code, value]) => makeStock(code, value));
  return {
    code: `board-${name}`,
    name,
    value: children.reduce((sum, stock) => sum + stock.value, 0),
    stockCount: children.length,
    children,
  };
}

describe("canShowAnyLabel（与画字规则同一把尺子）", () => {
  it("恰好过线的最小块能显示文字", () => {
    expect(canShowAnyLabel(16, 12, 1)).toBe(true);
  });

  it("宽度不足、高度被阴影预留吃掉、面积太小时都不显示文字", () => {
    expect(canShowAnyLabel(15, 12, 1)).toBe(false);
    expect(canShowAnyLabel(16, 11, 1)).toBe(false);
    expect(canShowAnyLabel(20, 10, 1)).toBe(false);
    expect(canShowAnyLabel(16, 8, 1)).toBe(false);
  });

  it("大块能显示文字，放大后小块也能显示", () => {
    expect(canShowAnyLabel(108, 58, 1)).toBe(true);
    expect(canShowAnyLabel(10, 7, 2)).toBe(true);
  });
});

describe("computeLayoutHidingUnreadable", () => {
  const canvas = { width: 320, height: 240 };

  /** 1 只大盘股 + 40 只小块股：小块能画出来（非子像素）但放不下名字。
   *  sqrt 布局压缩了大小悬殊度，小块市值按 sqrt 后的比例重新标定（原线性标定的
   *  800 万在 sqrt 下每块约 48×48px 反而放得下名字，失去造"无字块"的作用）。 */
  function fixtureNodes(): HeatmapBoardNode[] {
    const codes: Array<[string, number]> = [["A", 9_000_000_000]];
    for (let index = 0; index < 40; index += 1) {
      codes.push([`tiny-${index}`, 50_000]);
    }
    return [makeBoard("测试板块", codes)];
  }

  it("删完后画布上没有放不下名字的色块，大块存活、无字小块被剔除", () => {
    const nodes = fixtureNodes();
    const layout = computeLayoutHidingUnreadable(nodes, canvas.width, canvas.height, null);

    expect(layout.stockRects.length).toBeGreaterThan(0);
    for (const rect of layout.stockRects) {
      expect(canShowAnyLabel(rect.width, rect.height, 1)).toBe(true);
    }
    const codes = new Set(layout.stockRects.map((rect) => rect.code));
    expect(codes.has("A")).toBe(true);
    expect([...codes].some((code) => code.startsWith("tiny-"))).toBe(false);
  });

  it("删减比直接布局画得更少，且不会误删有名字的块", () => {
    const nodes = fixtureNodes();
    const plain = computeHeatmapLayout(nodes, canvas.width, canvas.height, null);
    const hidden = computeLayoutHidingUnreadable(nodes, canvas.width, canvas.height, null);

    expect(hidden.stockRects.length).toBeLessThan(plain.stockRects.length);
    const plainCodes = new Set(plain.stockRects.map((rect) => rect.code));
    for (const rect of hidden.stockRects) {
      expect(plainCodes.has(rect.code)).toBe(true);
    }
  });

  it("不修改传入的板块数据", () => {
    const nodes = fixtureNodes();
    const snapshot = JSON.stringify(nodes);
    computeHeatmapLayout(nodes, canvas.width, canvas.height, null);
    computeLayoutHidingUnreadable(nodes, canvas.width, canvas.height, null);
    expect(JSON.stringify(nodes)).toBe(snapshot);
  });

  it("整个板块都放不下名字时板块整体消失", () => {
    // 小板块总市值只占画布万分之几，整个板块被挤成几个像素，里面所有股票都画不出来
    const tinyCodes: Array<[string, number]> = [];
    for (let index = 0; index < 40; index += 1) {
      tinyCodes.push([`tiny-${index}`, 200_000]);
    }
    const nodes = [
      makeBoard("大板块", [["A", 9_000_000_000]]),
      makeBoard("小板块", tinyCodes),
    ];
    const layout = computeLayoutHidingUnreadable(nodes, canvas.width, canvas.height, null);
    expect(layout.stockRects.map((rect) => rect.code)).toEqual(["A"]);
    expect(layout.boardRects.map((rect) => rect.name)).toEqual(["大板块"]);
  });
});
