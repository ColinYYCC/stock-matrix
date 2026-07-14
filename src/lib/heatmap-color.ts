/**
 * 涨跌幅 → RGB 颜色映射
 *
 * 把涨跌幅百分比映射成热力图色块的颜色。
 * 涨幅越大颜色越深（红或绿），平盘为灰色。
 */
import type { PriceColorMode } from "@/types/heatmap";
import { clamp } from "./format";

/** 涨跌幅的颜色刻度（用于图例渐变） */
export const colorLegendSteps = [-4, -3, -2, -1, 0, 1, 2, 3, 4] as const;

/** 图例上显示的刻度值 */
export const legendTicks = [-4, -2, 0, 2, 4] as const;

/** 平盘阈值：涨跌幅绝对值小于 0.1% 视为平盘 */
const FLAT_THRESHOLD = 0.1;

/** 颜色映射的最大涨跌幅限制：超过 10% 就是最深色 */
const COLOR_LIMIT = 10;

/** 平盘时的灰色 */
const NEUTRAL_COLOR = "rgb(72, 79, 92)";

/**
 * 把涨跌幅百分比映射成 RGB 颜色字符串
 *
 * @param changePct 涨跌幅百分比（正数=涨，负数=跌）
 * @param colorMode 颜色模式：red-rise=红涨绿跌，green-rise=绿涨红跌
 */
export function getHeatColor(changePct: number, colorMode: PriceColorMode): string {
  const amplitude = clamp(Math.abs(changePct) / COLOR_LIMIT, 0, 1);

  // 平盘用灰色
  if (Math.abs(changePct) < FLAT_THRESHOLD) {
    return NEUTRAL_COLOR;
  }

  const isRise = changePct > 0;
  // red-rise 模式下涨用红色，green-rise 模式下涨用绿色
  const shouldUseRed = colorMode === "red-rise" ? isRise : !isRise;

  if (shouldUseRed) {
    // 红色：从浅红 (140,72,76) 渐变到深红 (255,30,38)
    const red = Math.round(140 + amplitude * 115);
    const green = Math.round(72 - amplitude * 42);
    const blue = Math.round(76 - amplitude * 38);
    return `rgb(${red}, ${green}, ${blue})`;
  }

  // 绿色：从浅绿 (40,126,76) 渐变到深绿 (26,214,66)
  const red = Math.round(40 - amplitude * 14);
  const green = Math.round(126 + amplitude * 88);
  const blue = Math.round(76 - amplitude * 10);
  return `rgb(${red}, ${green}, ${blue})`;
}

/**
 * 板块标题栏的颜色（比个股色块略深一点）
 */
export function getBoardHeaderColor(changePct: number, colorMode: PriceColorMode): string {
  const amplitude = clamp(Math.abs(changePct) / COLOR_LIMIT, 0, 1);

  if (Math.abs(changePct) < FLAT_THRESHOLD) {
    return "rgb(51, 58, 70)";
  }

  const isRise = changePct > 0;
  const shouldUseRed = colorMode === "red-rise" ? isRise : !isRise;

  if (shouldUseRed) {
    return `rgb(${Math.round(120 + amplitude * 60)}, ${Math.round(58 - amplitude * 12)}, ${Math.round(
      66 - amplitude * 10
    )})`;
  }

  return `rgb(${Math.round(46 - amplitude * 10)}, ${Math.round(102 + amplitude * 36)}, ${Math.round(
    70 - amplitude * 6
  )})`;
}

/**
 * 生成图例渐变的 CSS background 值
 */
export function getLegendGradient(colorMode: PriceColorMode): string {
  return `linear-gradient(to right, ${colorLegendSteps
    .map((step, index) => {
      const position = (index / (colorLegendSteps.length - 1)) * 100;
      return `${getHeatColor(step, colorMode)} ${position.toFixed(2)}%`;
    })
    .join(", ")})`;
}

/**
 * 返回涨跌幅对应的 Tailwind 文字颜色类名
 *
 * @param tone normal=普通色，soft=浅色背景上的字，strong=深色背景上的字
 */
export function getChangeTextClass(
  changePct: number,
  colorMode: PriceColorMode,
  tone: "normal" | "soft" | "strong" = "normal"
): string {
  if (Math.abs(changePct) < FLAT_THRESHOLD) {
    return tone === "strong" ? "text-slate-500" : "text-muted-foreground";
  }

  const isRise = changePct > 0;
  const shouldUseRed = colorMode === "red-rise" ? isRise : !isRise;

  if (shouldUseRed) {
    if (tone === "soft") return "text-red-100";
    if (tone === "strong") return "text-red-500";
    return "text-red-400";
  }

  if (tone === "soft") return "text-emerald-100";
  if (tone === "strong") return "text-emerald-600";
  return "text-emerald-400";
}

/** "上涨"对应的文字颜色类名 */
export function getRiseTextClass(colorMode: PriceColorMode): string {
  return colorMode === "red-rise" ? "text-red-400" : "text-emerald-400";
}

/** "下跌"对应的文字颜色类名 */
export function getFallTextClass(colorMode: PriceColorMode): string {
  return colorMode === "red-rise" ? "text-emerald-400" : "text-red-400";
}
