/**
 * 格式化工具函数集合
 *
 * 把数字格式化成用户看得懂的价格、涨跌幅、成交额等文字。
 */
import type { Locale } from "@/types/heatmap";

/** 把数值限制在 [min, max] 范围内 */
export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** 去掉数字末尾多余的零，比如 "1.20" → "1.2"，"3.00" → "3" */
export function trimTrailingZeros(text: string) {
  return text.replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}

/** 格式化价格：大于等于 100 的保留 1 位小数，否则保留 2 位 */
export function formatPrice(value: number) {
  return value.toFixed(value >= 100 ? 1 : 2);
}

/** 格式化涨跌幅：正数前面加 + 号，保留 2 位小数 */
export function formatChange(value: number) {
  if (value > 0) {
    return `+${value.toFixed(2)}%`;
  }
  return `${value.toFixed(2)}%`;
}

/** 紧凑版涨跌幅：绝对值 >= 10 保留 1 位小数，否则 2 位，去掉末尾零 */
export function formatCompactChange(value: number) {
  const absValue = Math.abs(value);
  const digits = absValue >= 10 ? 1 : 2;
  const text = trimTrailingZeros(value.toFixed(digits));
  return value > 0 ? `+${text}%` : `${text}%`;
}

/** 截断文字，超长加省略号 */
export function shortenText(text: string, maxLength: number) {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}…`;
}

/** 用千分位格式化数量 */
export function formatCount(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US").format(value);
}

/** 把成交额格式化成"万 / 亿 / 万亿"的中文表示或英文紧凑表示 */
export function formatTurnoverAmount(value: number, locale: Locale) {
  if (!Number.isFinite(value) || value <= 0) {
    return "--";
  }

  if (locale === "zh") {
    const withUnit = (divisor: number, unit: string) => {
      const scaled = value / divisor;
      const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
      return `${trimTrailingZeros(scaled.toFixed(digits))} ${unit}`;
    };

    // 万亿级别
    if (value >= 1_0000_0000_0000) {
      return withUnit(1_0000_0000_0000, "万亿");
    }
    // 亿级别
    if (value >= 1_0000_0000) {
      return withUnit(1_0000_0000, "亿");
    }
    // 万级别
    if (value >= 1_0000) {
      return withUnit(1_0000, "万");
    }

    return trimTrailingZeros(value.toFixed(0));
  }

  // 英文用紧凑表示法
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: value >= 1_000_000_000_000 ? 1 : 2,
  }).format(value);
}

/** 判断成交额变化趋势：放量 / 缩量 / 持平 */
export function getTurnoverTrend(delta: number) {
  if (delta > 0) {
    return "up" as const;
  }
  if (delta < 0) {
    return "down" as const;
  }
  return "flat" as const;
}
