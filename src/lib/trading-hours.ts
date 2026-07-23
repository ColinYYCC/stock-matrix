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
const CST_OFFSET_MS = 8 * 60 * 60 * 1000;

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
 * 时区转换：把 UTC 毫秒加 8 小时偏移，再用 getUTC* 读取，
 * 这样无论用户本地时区如何，结果都以北京时间为准。
 *
 * @param now 当前时间，默认 new Date()
 * @returns true = 交易中，false = 非交易时段
 */
export function isTradingHours(now: Date = new Date()): boolean {
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
