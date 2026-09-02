/**
 * 分类词表对账测试（审计 Q4）
 *
 * INDUSTRY_TO_BOARD / STOCK_OVERRIDE / ROBOT_STOCKS 在
 * scripts/fetch_stocks.py（离线脚本）和 src/lib/stock-discovery.ts（运行时）
 * 各维护一份，靠注释"保持一致"约束——这是会漂移的定时炸弹。
 * 本测试解析 Python 源码里的字面量，与 TS 侧导出的词表逐项比对，
 * 任何一边单独修改都会在这里红。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  INDUSTRY_TO_BOARD,
  ROBOT_STOCKS,
  STOCK_OVERRIDE,
} from "@/lib/stock-discovery";

/** 项目根目录（vitest 以仓库根为 cwd 运行） */
const repoRoot = process.cwd();
const pySource = readFileSync(path.join(repoRoot, "scripts", "fetch_stocks.py"), "utf-8");

/** 截取 Python 源码中从 startMarker 开始到第一个顶格 `}` 结束的字典字面量 */
function pythonDictSection(startMarker: string): string {
  const start = pySource.indexOf(startMarker);
  expect(start, `Python 源码里找不到 ${startMarker}`).toBeGreaterThanOrEqual(0);
  const end = pySource.indexOf("\n}\n", start);
  expect(end, `Python 源码里找不到 ${startMarker} 的结束括号`).toBeGreaterThan(start);
  return pySource.slice(start, end);
}

/** 解析 Python 字典："key": "value" 或 "key": ("value", "原因") */
function parsePythonEntries(section: string, tupleValue: boolean): Map<string, string> {
  const pattern = tupleValue
    ? /"([^"]+)":\s*\("([^"]+)"/g
    : /"([^"]+)":\s*"([^"]+)"/g;
  return new Map([...section.matchAll(pattern)].map((match) => [match[1], match[2]]));
}

function expectSameEntries(
  label: string,
  python: Map<string, string>,
  typescript: Record<string, string>
) {
  const tsMap = new Map(Object.entries(typescript));
  const pyKeys = [...python.keys()].sort();
  const tsKeys = [...tsMap.keys()].sort();
  expect(tsKeys, `${label} 两侧键集合不一致`).toEqual(pyKeys);
  for (const [key, value] of python) {
    expect(tsMap.get(key), `${label}[${key}] 两侧值不一致`).toBe(value);
  }
}

describe("fetch_stocks.py 与 stock-discovery.ts 分类词表对账", () => {
  it("INDUSTRY_TO_BOARD 完全一致", () => {
    const python = parsePythonEntries(pythonDictSection("INDUSTRY_TO_BOARD = {"), false);
    expect(python.size).toBeGreaterThan(100);
    expectSameEntries("INDUSTRY_TO_BOARD", python, INDUSTRY_TO_BOARD);
  });

  it("STOCK_OVERRIDE 完全一致（Python 侧是 (板块, 原因) 元组，取第一个元素比对）", () => {
    const python = parsePythonEntries(pythonDictSection("STOCK_OVERRIDE = {"), true);
    expect(python.size).toBeGreaterThan(10);
    expectSameEntries("STOCK_OVERRIDE", python, STOCK_OVERRIDE);
  });

  it("ROBOT_STOCKS 完全一致", () => {
    const python = parsePythonEntries(pythonDictSection("ROBOT_STOCKS = {"), false);
    expect(python.size).toBeGreaterThan(10);
    expectSameEntries("ROBOT_STOCKS", python, ROBOT_STOCKS);
  });
});
