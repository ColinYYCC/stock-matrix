import { describe, expect, it } from "vitest";

import { shouldSealSnapshot } from "@/lib/trading-hours";

/**
 * 构造一个北京时间时刻：参数按北京时间理解，内部减 8 小时得到 UTC 时间戳。
 * 固定使用 2026-10-29（周四）/ 10-30（周五）/ 10-31（周六）/ 11-01（周日），结果可复现。
 */
function cstMoment(year: number, month: number, day: number, hour: number, minute = 0, second = 0): Date {
  return new Date(Date.UTC(year, month - 1, day, hour - 8, minute, second));
}

/**
 * 收盘封存判定（问题 1 的回归测试）：
 * A 股 14:57-15:00 为收盘集合竞价，收盘价 15:00 才撮合。
 * 封存必须保证锁住的是"已含收盘价"的快照，否则收盘后到次日开盘前
 * 整张热力图都停在竞价前的旧数据上（封存线 = 收盘后 1 分钟，给上游推送留余量）。
 */
describe("shouldSealSnapshot 收盘封存判定", () => {
  it("交易时段永不封存，刷新通道必须敞开", () => {
    const trading = cstMoment(2026, 10, 29, 10, 0).getTime();
    expect(shouldSealSnapshot(trading, cstMoment(2026, 10, 29, 10, 0))).toBe(false);
  });

  it("核心回归：15:05 时缓存还停在集合竞价前（14:59:58），不许封存", () => {
    const beforeAuction = cstMoment(2026, 10, 29, 14, 59, 58).getTime();
    expect(shouldSealSnapshot(beforeAuction, cstMoment(2026, 10, 29, 15, 5))).toBe(false);
  });

  it("缓存来自 15:00:30（收盘撮合后、封存线前），仍要再刷一次", () => {
    const justAfterClose = cstMoment(2026, 10, 29, 15, 0, 30).getTime();
    expect(shouldSealSnapshot(justAfterClose, cstMoment(2026, 10, 29, 15, 5))).toBe(false);
  });

  it("缓存来自 15:01:30（封存线之后），15:05 可以封存", () => {
    const sealable = cstMoment(2026, 10, 29, 15, 1, 30).getTime();
    expect(shouldSealSnapshot(sealable, cstMoment(2026, 10, 29, 15, 5))).toBe(true);
  });

  it("周六早上：上周五收盘后的缓存（15:30）可直接封存", () => {
    const fridayAfterClose = cstMoment(2026, 10, 30, 15, 30).getTime();
    expect(shouldSealSnapshot(fridayAfterClose, cstMoment(2026, 10, 31, 10, 0))).toBe(true);
  });

  it("周六早上：还停在周五集合竞价前的缓存（14:59）必须刷新一次", () => {
    const fridayBeforeClose = cstMoment(2026, 10, 30, 14, 59).getTime();
    expect(shouldSealSnapshot(fridayBeforeClose, cstMoment(2026, 10, 31, 10, 0))).toBe(false);
  });

  it("周日晚上：封存线回退到上周五，周五收盘后的缓存可封存", () => {
    const fridayAfterClose = cstMoment(2026, 10, 30, 15, 30).getTime();
    expect(shouldSealSnapshot(fridayAfterClose, cstMoment(2026, 11, 1, 20, 0))).toBe(true);
  });
});
