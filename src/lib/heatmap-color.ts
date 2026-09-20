/**
 * 涨跌幅 → RGB 颜色映射
 *
 * 把涨跌幅百分比映射成热力图色块的颜色。
 * 涨幅越大颜色越深（红或绿），平盘为灰色。
 */
import type { PriceColorMode } from "@/types/heatmap";
import { clamp } from "./format";

/**
 * 图例渐变的取色点：全部来自 getHeatColor，条上每个位置的颜色都与画布色块精确一致。
 * 两端 -10/+10 保证最深色可见；±4 以内加密取点，保证 0 处的平盘灰和 ±1% 的快速过渡被忠实呈现。
 */
export const colorLegendSteps = [-10, -4, -3, -2, -1, 0, 1, 2, 3, 4, 10] as const;

/** 图例上显示的刻度值：按真实比例落在条上（-8 → 10%，0 → 50%，+8 → 90%），手机窄条上不重叠 */
export const legendTicks = [-8, -4, 0, 4, 8] as const;

/**
 * 涨跌幅在图例条上的水平位置（0~100 百分比）。
 * 渐变取色点和刻度文字共用这一个定位公式，保证两者永远对齐。
 */
export function legendPosition(changePct: number): number {
  return ((clamp(changePct, -COLOR_LIMIT, COLOR_LIMIT) + COLOR_LIMIT) / (COLOR_LIMIT * 2)) * 100;
}

/** 平盘阈值：涨跌幅绝对值小于此值视为平盘（仅 0.00% 显示灰色） */
/** 颜色映射的平盘阈值：涨跌幅绝对值小于此值时显示灰色 */
const COLOR_FLAT_THRESHOLD = 0.001;

/** 颜色映射的最大涨跌幅限制：超过 10% 就是最深色 */
const COLOR_LIMIT = 10;

/** 平盘时的灰色（仅当 COLOR_FLAT_THRESHOLD > 0 时生效） */
const NEUTRAL_COLOR = "rgb(72, 79, 92)";

/**
 * 把涨跌幅百分比映射成 RGB 颜色字符串
 *
 * @param changePct 涨跌幅百分比（正数=涨，负数=跌，NaN=无数据）
 * @param colorMode 颜色模式：red-rise=红涨绿跌，green-rise=绿涨红跌
 */
export function getHeatColor(changePct: number, colorMode: PriceColorMode): string {
  // NaN 表示无数据，显示灰色
  if (Number.isNaN(changePct)) {
    return NEUTRAL_COLOR;
  }

  const amplitude = clamp(Math.abs(changePct) / COLOR_LIMIT, 0, 1);

  // 平盘用灰色
  if (Math.abs(changePct) < COLOR_FLAT_THRESHOLD) {
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
  // NaN 表示无数据，显示灰色
  if (Number.isNaN(changePct)) {
    return "rgb(51, 58, 70)";
  }

  const amplitude = clamp(Math.abs(changePct) / COLOR_LIMIT, 0, 1);

  if (Math.abs(changePct) < COLOR_FLAT_THRESHOLD) {
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
/**
 * 生成图例渐变的 CSS background 值。
 * 条上每个位置的颜色 = getHeatColor(对应涨跌幅)，与画布色块精确一致；
 * 定位与刻度共用 legendPosition，永远对齐。
 * 显式声明 in oklab 插值：锁定感知均匀过渡（现代浏览器默认已是 oklab，此处防旧环境回退 sRGB 直插发暗）。
 */
export function getLegendGradient(colorMode: PriceColorMode): string {
  return `linear-gradient(in oklab to right, ${colorLegendSteps
    .map((step) => `${getHeatColor(step, colorMode)} ${legendPosition(step).toFixed(2)}%`)
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
  // NaN 表示无数据，显示灰色
  if (Number.isNaN(changePct)) {
    return tone === "strong" ? "text-slate-600" : "text-muted-foreground";
  }

  if (Math.abs(changePct) < COLOR_FLAT_THRESHOLD) {
    return tone === "strong" ? "text-slate-600" : "text-muted-foreground";
  }

  const isRise = changePct > 0;
  const shouldUseRed = colorMode === "red-rise" ? isRise : !isRise;

  if (shouldUseRed) {
    if (tone === "soft") return "text-red-100";
    // text-red-700 在浅色列表背景上对比度 5.9:1（red-500 只有 3.4:1，不满足 WCAG AA）
    if (tone === "strong") return "text-red-700";
    return "text-red-400";
  }

  if (tone === "soft") return "text-emerald-100";
  if (tone === "strong") return "text-emerald-700";
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

/**
 * Inspector 面板头部背景色：跟随涨跌色模式动态变化
 * red-rise 模式用红色调头部，green-rise 模式用绿色调头部
 */
export function getInspectorHeaderColor(colorMode: PriceColorMode): string {
  return colorMode === "red-rise" ? "#7a2e35" : "#356e57";
}
