/**
 * skin.ts 的结构自检
 *
 * 皮肤表是两套样式差异的唯一来源，最怕的 bug 是"新增槽位只写了一列"，
 * 导致某个皮肤下取到 undefined 的 className。这里用递归收集 key 的方式
 * 保证 classic / ios26 两列结构完全一致、所有叶子值都是非空字符串。
 */
import { describe, expect, it } from "vitest";

import { skins } from "@/components/skin";

/** 递归收集对象的所有叶子路径（key1.key2…），用于比较两列皮肤的结构 */
function collectLeafPaths(value: unknown, prefix = ""): string[] {
  if (typeof value === "string") {
    return [prefix];
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      collectLeafPaths(child, prefix ? `${prefix}.${key}` : key)
    );
  }
  // token 表里只允许字符串和纯对象，出现其他类型说明写错了
  throw new Error(`skin token 出现非法类型: ${prefix} = ${String(value)}`);
}

/** 收集所有叶子字符串的值，用于校验非空 */
function collectLeafValues(value: unknown, prefix = ""): Array<{ path: string; value: string }> {
  if (typeof value === "string") {
    return [{ path: prefix, value }];
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      collectLeafValues(child, prefix ? `${prefix}.${key}` : key)
    );
  }
  throw new Error(`skin token 出现非法类型: ${prefix}`);
}

describe("skins", () => {
  it("classic 与 ios26 的槽位结构完全一致", () => {
    expect(collectLeafPaths(skins.classic).sort()).toEqual(collectLeafPaths(skins.ios26).sort());
  });

  it("所有 token 都是字符串（空字符串合法，如 ios26 的 Inactive 槽位表示无附加类）", () => {
    // collectLeafValues 内部已保证：遇到非字符串叶子会直接 throw，测试即失败
    expect(collectLeafValues(skins.classic).length).toBeGreaterThan(0);
    expect(collectLeafValues(skins.ios26).length).toBeGreaterThan(0);
  });
});
