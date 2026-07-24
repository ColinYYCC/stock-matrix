/**
 * A 股交易时间判断
 *
 * 交易时段（北京时间 CST = UTC+8）：
 *   上午 09:30 - 11:30
 *   下午 13:00 - 15:00
 *   周一至周五
 *
 * 注意：法定节假日未在此处理（需维护日历表）。
 * 节假日期间轮询仍会运行，但行情数据不会变化，影响可忽略。
 */

/** 北京时间相对 UTC 的偏移量（毫秒） */
export const CST_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 上午开盘 09:30 → 570 分钟 */
const MORNING_START = 9 * 60 + 30;
/** 上午收盘 11:30 → 690 分钟 */
const MORNING_END = 11 * 60 + 30;
/** 下午开盘 13:00 → 780 分钟 */
const AFTERNOON_START = 13 * 60;
/** 下午收盘 15:00 → 900 分钟 */
const AFTERNOON_END = 15 * 60;

/**
 * 判断给定时间是否处于 A 股交易时段。
 *
 * 时区转换原理：
 * - Date 对象内部存储的是 UTC 时间戳（自 1970-01-01 00:00:00 UTC 以来的毫秒数）
 * - getUTCHours() / getUTCMinutes() 直接读取这个内部 UTC 时间的小时和分钟
 * - 北京时间 = UTC + 8 小时
 * - 所以把内部时间戳加 8 小时后用 getUTC* 读取，就等于直接读出北京时间
 * - 这种方法不受客户端/服务端本地时区设置的影响，结果始终以北京时间为准
 *
 * @param now 当前时间，默认 new Date()
 * @returns true = 交易中，false = 非交易时段
 */
export function isTradingHours(now: Date = new Date()): boolean {
  // now.getTime() 返回的是 UTC 时间戳（绝对时间，不含时区）
  // 加上 8 小时偏移后，用 getUTC* 方法读取就是北京时间
  const cst = new Date(now.getTime() + CST_OFFSET_MS);

  const dayOfWeek = cst.getUTCDay();
  // 周六=6, 周日=0
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;

  const timeMinutes = cst.getUTCHours() * 60 + cst.getUTCMinutes();

  // 上午 09:30 - 11:30
  if (timeMinutes >= MORNING_START && timeMinutes < MORNING_END) return true;
  // 下午 13:00 - 15:00
  if (timeMinutes >= AFTERNOON_START && timeMinutes < AFTERNOON_END) return true;

  return false;
}
