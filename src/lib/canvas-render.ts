/**
 * Canvas 绘制函数集合
 *
 * 把热力图数据绘制到 Canvas 画布上。
 * 包含：高清渲染、背景渐变、板块底色、个股色块、文字标签、板块标题栏、高亮描边。
 *
 * 改进点（相比原项目）：
 * - 独立模块，可单测
 * - 绘制函数参数化，不依赖 React 生命周期
 */
import type { BoardRect, DisplayMode, PriceColorMode, StockRect, SubBoardRect } from "@/types/heatmap";
import type { DesignStyle } from "@/hooks/use-design-style";
import { clamp, formatCompactChange, formatPrice } from "./format";
import { getBoardHeaderColor, getHeatColor } from "./heatmap-color";

/**
 * 根据色块背景亮度自动选择文字颜色（#5+#8）
 *
 * 涨跌幅接近 0 时背景色浅（灰/淡红/淡绿），用深色文字更易读；
 * 涨跌幅大时背景色深，用浅色文字 + 深色阴影更易读。
 */
function getStockLabelColors(changePct: number, colorMode: PriceColorMode) {
  const color = getHeatColor(changePct, colorMode);
  const m = color.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  if (!m) {
    return { fill: "rgba(248, 250, 252, 0.94)", shadow: "rgba(0, 0, 0, 0.28)" };
  }

  const r = parseInt(m[1]);
  const g = parseInt(m[2]);
  const b = parseInt(m[3]);
  // ITU-R BT.601 相对亮度
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  if (luminance > 0.62) {
    // 浅色背景 → 深色文字 + 浅色阴影
    return { fill: "rgba(15, 23, 42, 0.88)", shadow: "rgba(255, 255, 255, 0.35)" };
  }
  // 深色背景 → 浅色文字 + 深色阴影
  return { fill: "rgba(248, 250, 252, 0.94)", shadow: "rgba(0, 0, 0, 0.28)" };
}

/** Canvas 主题配色：单套配色 = 背景 + 板块底色 + 高亮描边 */
export type HeatmapCanvasTheme = {
  backgroundStart: string;
  backgroundEnd: string;
  boardFill: string;
  subBoardFill: string;
  subBoardBorder: string;
  activeSubBoardInner: string;
  boardBorder: string;
  highlightOuter: string;
  highlightInner: string;
};

/** 亮色配色两套皮肤共用：与 ios26 亮色页面背景（#eef1f6 系）同色温 */
const lightCanvasTheme: HeatmapCanvasTheme = {
  backgroundStart: "#f5f7fa",
  backgroundEnd: "#eef1f6",
  boardFill: "rgba(245, 248, 252, 0.78)",
  subBoardFill: "rgba(255, 255, 255, 0.58)",
  subBoardBorder: "rgba(140, 155, 180, 0.20)",
  activeSubBoardInner: "rgba(14, 116, 144, 0.32)",
  boardBorder: "rgba(140, 155, 180, 0.26)",
  highlightOuter: "rgba(15, 23, 42, 0.70)",
  highlightInner: "rgba(255, 255, 255, 0.95)",
};

/**
 * Canvas 主题配色表，按 皮肤 × 显示模式 取值（设计审查 P1-12）。
 * ios26 暗色背景用 #0a0e1a → #131826，与 globals.css 的 --ios26-bg-start/end
 * 完全一致，修复"canvas 与页面背景色温不一致"；classic 保持原紫色底不变。
 */
export const heatmapCanvasThemes: Record<DesignStyle, Record<DisplayMode, HeatmapCanvasTheme>> = {
  classic: {
    dark: {
      backgroundStart: "#1d1a27",
      backgroundEnd: "#13101c",
      boardFill: "rgba(30, 35, 46, 0.75)",
      subBoardFill: "rgba(22, 27, 38, 0.45)",
      subBoardBorder: "rgba(180, 190, 210, 0.18)",
      activeSubBoardInner: "rgba(8, 47, 73, 0.72)",
      boardBorder: "rgba(180, 190, 210, 0.22)",
      highlightOuter: "rgba(2, 6, 23, 0.85)",
      highlightInner: "rgba(248, 250, 252, 0.95)",
    },
    light: lightCanvasTheme,
  },
  ios26: {
    dark: {
      backgroundStart: "#0a0e1a",
      backgroundEnd: "#131826",
      boardFill: "rgba(30, 35, 46, 0.75)",
      subBoardFill: "rgba(22, 27, 38, 0.45)",
      subBoardBorder: "rgba(180, 190, 210, 0.18)",
      activeSubBoardInner: "rgba(8, 47, 73, 0.72)",
      boardBorder: "rgba(180, 190, 210, 0.22)",
      highlightOuter: "rgba(2, 6, 23, 0.85)",
      highlightInner: "rgba(248, 250, 252, 0.95)",
    },
    light: lightCanvasTheme,
  },
};

/** iOS 26 Liquid Glass 圆角半径配置 */
const LIQUID_GLASS_RADIUS = {
  /** 板块圆角 */
  board: 10,
  /** 子板块圆角 */
  subBoard: 7,
  /** 个股色块圆角 */
  stock: 3,
  /** 最小尺寸下不画圆角 */
  minSizeForRadius: 4,
} as const;

/**
 * 绘制圆角矩形路径（iOS 26 Liquid Glass 核心：所有矩形都带圆角）
 * 当宽或高太小时自动降级为直角，避免圆角交叉变形
 *
 * topOnly = true 时只圆上面两个角、下面两个角保持直角——
 * 用于板块标题栏：它叠在色块上方，底边要和下方内容严丝合缝，
 * 四角全圆会在底边两角漏出月牙形缝隙
 */
function roundRectPath(
  context: CanvasRenderingContext2D,
  x: number, y: number, width: number, height: number, radius: number,
  topOnly = false
) {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  if (w < LIQUID_GLASS_RADIUS.minSizeForRadius || h < LIQUID_GLASS_RADIUS.minSizeForRadius || radius <= 0) {
    context.rect(x, y, w, h);
    return;
  }
  const r = Math.min(radius, w / 2, h / 2);
  if (topOnly) {
    // 上圆下直：左上、右上用弧，右边、底边、左边都是直线
    context.moveTo(x, y + r);
    context.arcTo(x, y, x + w, y, r);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.lineTo(x + w, y + h);
    context.lineTo(x, y + h);
    context.closePath();
    return;
  }
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

/**
 * 填充圆角矩形（iOS 26 风格的填充操作）
 */
function fillRoundRect(
  context: CanvasRenderingContext2D,
  x: number, y: number, width: number, height: number, radius: number
) {
  context.beginPath();
  roundRectPath(context, x, y, width, height, radius);
  context.fill();
}

/**
 * 描边圆角矩形（iOS 26 风格的毛玻璃边框）
 */
function strokeRoundRect(
  context: CanvasRenderingContext2D,
  x: number, y: number, width: number, height: number, radius: number
) {
  context.beginPath();
  roundRectPath(context, x, y, width, height, radius);
  context.stroke();
}

/** 热力图字体栈（#7: 跨平台覆盖 macOS / Windows / Linux / Android） */
const heatmapFontStack = `"Avenir Next Condensed", "DIN Condensed", "Helvetica Neue Condensed", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", "Source Han Sans SC", Arial, sans-serif`;

/** 生成 Canvas 字体声明 */
function heatmapFont(weight: number, size: number) {
  return `${weight} ${size}px ${heatmapFontStack}`;
}

/** 阴影扩散预留量（Canvas shadow 不受 clip() 约束） */
const SHADOW_PADDING = 1.8;

/** 在裁剪区域内绘制文字 */
function drawClippedText(
  context: CanvasRenderingContext2D,
  text: string,
  textX: number,
  textY: number,
  clipX: number,
  clipY: number,
  clipWidth: number,
  clipHeight: number
) {
  context.save();
  context.beginPath();
  // 扩展裁剪区域以包含阴影，防止视觉溢出
  context.rect(
    clipX - SHADOW_PADDING,
    clipY - SHADOW_PADDING,
    clipWidth + SHADOW_PADDING * 2,
    clipHeight + SHADOW_PADDING * 2
  );
  context.clip();
  context.fillText(text, textX, textY);
  context.restore();
}

/** 二分查找：截断文字使其不超过 maxWidth */
export function fitTextToWidth(context: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (maxWidth <= 0 || text.length === 0) return "";

  if (context.measureText(text).width <= maxWidth) return text;

  let low = 1;
  let high = text.length;
  let best = "";

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const candidate = text.slice(0, mid);

    if (context.measureText(candidate).width <= maxWidth) {
      best = candidate;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (best) return best;

  const firstCharacter = text.slice(0, 1);
  return context.measureText(firstCharacter).width <= maxWidth ? firstCharacter : "";
}

/** 把 rgb(r, g, b) 转成 rgba(r, g, b, alpha)，非 rgb 格式原样返回 */
function withAlpha(color: string, alpha: number): string {
  const m = color.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  return m ? `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${alpha})` : color;
}

/** 按比例缩放字号使其不超过 maxWidth */
export function fitFontSizeToWidth(
  context: CanvasRenderingContext2D,
  text: string,
  weight: number,
  preferredSize: number,
  minSize: number,
  maxWidth: number
): number {
  if (maxWidth <= 0 || text.length === 0) return preferredSize;

  context.font = heatmapFont(weight, preferredSize);
  const preferredWidth = context.measureText(text).width;

  if (preferredWidth <= maxWidth) return preferredSize;

  return clamp((preferredSize * maxWidth) / preferredWidth, minSize, preferredSize);
}


/**
 * 检查多行内容总高度是否在可用垂直空间内
 *
 * @param lineHeights 每行文字的字号高度数组
 * @param lineGap 行间距（世界坐标单位）
 * @param availableHeight 可用垂直空间（世界坐标单位）
 * @returns 是否放得下
 */
function fitsVertically(lineHeights: number[], lineGap: number, availableHeight: number): boolean {
  if (lineHeights.length === 0) return true;
  const total = lineHeights.reduce((sum, h) => sum + h, 0) + lineGap * (lineHeights.length - 1);
  return total <= availableHeight + 0.5; // 0.5px 容差
}

/**
 * 绘制单只股票的文字标签
 *
 * 参考原作者 wenyuanw/a-share-heatmap 的简洁设计，分 4 级显示：
 * - Large: 宽>=108 高>=58 → 居中显示 股票名 + 涨跌幅 + 价格（三行，空间不够时两行）
 * - Medium: 宽>=50 高>=28 → 居中显示 股票名 + 涨跌幅（+ 价格，宽>=58 高>=42时）
 * - Compact: 宽>=38 高>=22 → 仅显示股票名（字号适中，保证可读性）
 * - Small: 宽>=28 高>=16 → 仅显示股票名（字号较小但清晰）
 * - Micro: 宽>=14 高>=8 → 仅显示股票名（截断到 1-2 字），居中
 * - 更小 → 不绘制文字
 *
 * 排版规则：
 * - 所有色块文字全部上下左右居中（textAlign=center, textBaseline=middle）
 * - 字重仅使用 700/600/400（标准 CSS 字重）
 * - 涨跌幅统一使用 formatCompactChange（紧凑格式）
 * - 行垂直对称居中（基于实际字号动态计算）
 * - 文字颜色根据色块背景亮度自动选择深色或浅色
 * - 板块标题按像素宽度截断（fitTextToWidth）
 *
 * 防溢出策略（核心修复）：
 * - 每个多行模式先计算实际总高度，与 clipHeight 比较
 * - 超出时自动降级行数：三行→两行→单行
 * - 阴影预留 SHADOW_PADDING 防止视觉溢出
 */
export function drawStockLabel(context: CanvasRenderingContext2D, stock: StockRect, priceColorMode: PriceColorMode, zoomScale = 1) {
  const displayWidth = stock.width * zoomScale;
  const displayHeight = stock.height * zoomScale;
  const screenUnit = 1 / zoomScale;
  // 增加 clipPadding 以容纳阴影扩散（核心修复：防止视觉溢出）
  const clipPaddingPx = displayWidth > 110 ? 6 : displayWidth > 54 ? 4 : 3;
  const clipPadding = clipPaddingPx * screenUnit;
  // 可用高度额外扣除阴影预留，确保垂直方向不溢出
  const clipWidth = Math.max(0, stock.width - clipPadding * 2);
  const clipHeight = Math.max(0, stock.height - clipPadding * 2 - SHADOW_PADDING * 2 * screenUnit);

  if (displayWidth < 16 || displayHeight < 8 || clipWidth <= 2 || clipHeight <= 2) return;

  const hasLargeLabel = displayWidth >= 108 && displayHeight >= 58;
  const hasMediumLabel = displayWidth >= 50 && displayHeight >= 28;
  const hasCompactLabel = displayWidth >= 38 && displayHeight >= 22;
  const hasSmallLabel = displayWidth >= 28 && displayHeight >= 16;
  const hasMicroLabel = displayWidth >= 14 && displayHeight >= 8;

  context.save();
  try {
    // #5+#8: 根据色块背景亮度自动选择深/浅文字颜色和阴影
    const labelColors = getStockLabelColors(stock.changePct, priceColorMode);
    context.fillStyle = labelColors.fill;
    context.shadowColor = labelColors.shadow;
    context.shadowBlur = (displayHeight < 14 ? 0.8 : 1.6) * screenUnit;
    context.shadowOffsetY = 0.5 * screenUnit;

    if (hasLargeLabel) {
      const preferredTitleSize =
        clamp(Math.floor(Math.min(displayWidth, displayHeight) * 0.26), 15, 30) * screenUnit;
      const titleSize = fitFontSizeToWidth(
        context, stock.name, 700,
        preferredTitleSize,
        Math.max(12 * screenUnit, preferredTitleSize * 0.66),
        clipWidth
      );
      const detailSize = Math.min(
        clamp(Math.floor(Math.min(displayWidth, displayHeight) * 0.19), 11, 23) * screenUnit,
        titleSize * 1.08
      );
      const priceSize = Math.min(detailSize * 0.88, 14 * screenUnit);
      const centerX = stock.x + stock.width / 2;
      const centerY = stock.y + stock.height / 2;
      const lineGap = 2 * screenUnit;

      context.textAlign = "center";
      context.textBaseline = "middle";

      // 核心修复：先计算实际内容高度，再决定显示几行
      const threeLineHeights = [titleSize, detailSize, priceSize];
      const twoLineHeights = [titleSize, detailSize];
      const canFitThreeLines = fitsVertically(threeLineHeights, lineGap, clipHeight);
      const canFitTwoLines = fitsVertically(twoLineHeights, lineGap, clipHeight);

      if (canFitThreeLines) {
        // 三行对称居中：名称 + 涨跌幅 + 价格
        const totalHeight = titleSize + lineGap + detailSize + lineGap + priceSize;
        const titleY = centerY - totalHeight / 2 + titleSize / 2;
        const detailY = titleY + titleSize / 2 + lineGap + detailSize / 2;
        const priceY = detailY + detailSize / 2 + lineGap + priceSize / 2;

        context.font = heatmapFont(700, titleSize);
        drawClippedText(context, fitTextToWidth(context, stock.name, clipWidth), centerX, titleY, stock.x + clipPadding, stock.y + clipPadding, clipWidth, clipHeight);

        context.font = heatmapFont(600, detailSize);
        drawClippedText(context, formatCompactChange(stock.changePct), centerX, detailY, stock.x + clipPadding, stock.y + clipPadding, clipWidth, clipHeight);

        context.font = heatmapFont(600, priceSize);
        drawClippedText(context, formatPrice(stock.price), centerX, priceY, stock.x + clipPadding, stock.y + clipPadding, clipWidth, clipHeight);
      } else if (canFitTwoLines) {
        // 两行对称居中：名称 + 涨跌幅（空间不够三行时降级）
        const totalHeight = titleSize + lineGap + detailSize;
        const titleY = centerY - totalHeight / 2 + titleSize / 2;
        const detailY = titleY + titleSize / 2 + lineGap + detailSize / 2;

        context.font = heatmapFont(700, titleSize);
        drawClippedText(context, fitTextToWidth(context, stock.name, clipWidth), centerX, titleY, stock.x + clipPadding, stock.y + clipPadding, clipWidth, clipHeight);

        context.font = heatmapFont(600, detailSize);
        drawClippedText(context, formatCompactChange(stock.changePct), centerX, detailY, stock.x + clipPadding, stock.y + clipPadding, clipWidth, clipHeight);
      } else {
        // 只有一行名称（空间极致压缩时）
        context.font = heatmapFont(700, titleSize);
        const fittedName = fitTextToWidth(context, stock.name, clipWidth);
        if (fittedName) {
          drawClippedText(context, fittedName, centerX, centerY, stock.x + clipPadding, stock.y + clipPadding, clipWidth, clipHeight);
        }
      }
      return;
    }

    if (hasMediumLabel) {
      // Medium: 全部上下左右居中
      const preferredTitleSize = clamp(Math.floor(Math.min(displayWidth * 0.18, displayHeight * 0.40)), 8, 15) * screenUnit;
      const titleSize = fitFontSizeToWidth(context, stock.name, 700, preferredTitleSize, Math.max(7 * screenUnit, preferredTitleSize * 0.70), clipWidth);
      const detailSize = Math.min(clamp(Math.floor(displayHeight * 0.30), 7, 12) * screenUnit, titleSize * 1.05);
      const centerX = stock.x + stock.width / 2;
      const centerY = stock.y + stock.height / 2;
      const mediumLineGap = 2 * screenUnit;

      context.textAlign = "center";
      context.textBaseline = "middle";

      // 核心修复：用实际内容高度决定显示几行，而非固定阈值
      const priceSize = Math.min(detailSize * 0.88, 12 * screenUnit);
      const threeLineHeights = [titleSize, detailSize, priceSize];
      const twoLineHeights = [titleSize, detailSize];
      const canFitThreeLines = fitsVertically(threeLineHeights, mediumLineGap, clipHeight);
      const canFitTwoLines = fitsVertically(twoLineHeights, mediumLineGap, clipHeight);

      if (canFitThreeLines) {
        // 三行：名称 + 涨跌幅 + 价格
        const totalHeight = titleSize + mediumLineGap + detailSize + mediumLineGap + priceSize;
        const titleY = centerY - totalHeight / 2 + titleSize / 2;
        const detailY = titleY + titleSize / 2 + mediumLineGap + detailSize / 2;
        const priceY = detailY + detailSize / 2 + mediumLineGap + priceSize / 2;

        context.font = heatmapFont(700, titleSize);
        drawClippedText(context, fitTextToWidth(context, stock.name, clipWidth), centerX, titleY, stock.x + clipPadding, stock.y + clipPadding, clipWidth, clipHeight);

        context.font = heatmapFont(600, detailSize);
        drawClippedText(context, formatCompactChange(stock.changePct), centerX, detailY, stock.x + clipPadding, stock.y + clipPadding, clipWidth, clipHeight);

        context.font = heatmapFont(600, priceSize);
        drawClippedText(context, formatPrice(stock.price), centerX, priceY, stock.x + clipPadding, stock.y + clipPadding, clipWidth, clipHeight);
      } else if (canFitTwoLines) {
        // 两行：名称 + 涨跌幅
        const totalHeight = titleSize + mediumLineGap + detailSize;
        const titleY = centerY - totalHeight / 2 + titleSize / 2;
        const detailY = titleY + titleSize / 2 + mediumLineGap + detailSize / 2;

        context.font = heatmapFont(700, titleSize);
        drawClippedText(context, fitTextToWidth(context, stock.name, clipWidth), centerX, titleY, stock.x + clipPadding, stock.y + clipPadding, clipWidth, clipHeight);

        context.font = heatmapFont(600, detailSize);
        drawClippedText(context, formatCompactChange(stock.changePct), centerX, detailY, stock.x + clipPadding, stock.y + clipPadding, clipWidth, clipHeight);
      } else {
        // 只有一行名称，居中
        context.font = heatmapFont(700, titleSize);
        const fittedName = fitTextToWidth(context, stock.name, clipWidth);
        if (fittedName) {
          drawClippedText(context, fittedName, centerX, centerY, stock.x + clipPadding, stock.y + clipPadding, clipWidth, clipHeight);
        }
      }
      return;
    }

    if (hasCompactLabel) {
      // Compact: 只显示名称（字号适中，保证可读性，不显示涨跌率避免拥挤）
      const fontSize = clamp(Math.floor(Math.min(displayHeight * 0.50, displayWidth * 0.17, 12)), 9, 12) * screenUnit;
      const centerX = stock.x + stock.width / 2;
      const centerY = stock.y + stock.height / 2;

      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = heatmapFont(600, fontSize);
      const fittedName = fitTextToWidth(context, stock.name, clipWidth);
      if (fittedName) {
        drawClippedText(context, fittedName, centerX, centerY, stock.x + clipPadding, stock.y + clipPadding, clipWidth, clipHeight);
      }
      return;
    }

    if (hasSmallLabel) {
      // Small: 只显示名称（字号较小但清晰，不显示涨跌率）
      const fontSize = clamp(Math.floor(Math.min(displayHeight * 0.55, displayWidth * 0.14, 9.5)), 7, 9.5) * screenUnit;
      const centerX = stock.x + stock.width / 2;
      const centerY = stock.y + stock.height / 2;

      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = heatmapFont(600, fontSize);
      const fittedName = fitTextToWidth(context, stock.name, clipWidth);
      if (fittedName) {
        drawClippedText(context, fittedName, centerX, centerY, stock.x + clipPadding, stock.y + clipPadding, clipWidth, clipHeight);
      }
      return;
    }

    if (hasMicroLabel) {
      // Micro: 仅名称首字，居中，字号 5-7px（尽可能让更多色块有名字）
      const fontSize = clamp(Math.floor(Math.min(displayHeight * 0.6, displayWidth * 0.16, 7)), 5, 7) * screenUnit;
      const centerX = stock.x + stock.width / 2;
      const centerY = stock.y + stock.height / 2;

      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = heatmapFont(600, fontSize);
      const fittedName = fitTextToWidth(context, stock.name, clipWidth);
      if (fittedName) {
        drawClippedText(context, fittedName, centerX, centerY, stock.x + clipPadding, stock.y + clipPadding, clipWidth, clipHeight);
      }
      return;
    }
  } finally {
    context.restore();
  }
}

/** Canvas 绘制所需的参数 */
export type DrawHeatmapParams = {
  context: CanvasRenderingContext2D;
  canvasWidth: number;
  canvasHeight: number;
  pixelRatio: number;
  view: { scale: number; x: number; y: number };
  theme: HeatmapCanvasTheme;
  priceColorMode: PriceColorMode;
  stockRects: StockRect[];
  boardRects: BoardRect[];
  subBoardRects: SubBoardRect[];
};

/**
 * 主绘制函数：把整个热力图画到 Canvas 上
 *
 * 绘制流程：
 * 1. 高清渲染设置 (devicePixelRatio)
 * 2. 绘制背景渐变
 * 3. context.scale(pixelRatio).translate(view.x, view.y).scale(view.scale)
 * 4. 遍历一级板块 → 填充板块底色
 * 5. 遍历二级板块 → 填充子板块底色
 * 6. 遍历个股 → 填充涨跌色块 + 绘制文字标签
 * 7. 遍历二级板块 → 绘制标题栏 + 边框
 * 8. 遍历一级板块 → 绘制标题栏 + 边框
 *
 * 高亮（悬停个股/活跃板块描边）由 drawHeatmapHighlight 单独负责：
 * 本函数画的是不含高亮的底图（离屏缓存方案）。
 */
export function drawHeatmap(params: DrawHeatmapParams) {
  const { context, canvasWidth, canvasHeight, pixelRatio, view, theme, priceColorMode, stockRects, boardRects, subBoardRects } = params;

  // 1. 设置 Canvas 尺寸（高清渲染）
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvasWidth * pixelRatio, canvasHeight * pixelRatio);

  // 2. 绘制背景渐变
  const background = context.createLinearGradient(0, 0, canvasWidth * pixelRatio, canvasHeight * pixelRatio);
  background.addColorStop(0, theme.backgroundStart);
  background.addColorStop(1, theme.backgroundEnd);
  context.fillStyle = background;
  context.fillRect(0, 0, canvasWidth * pixelRatio, canvasHeight * pixelRatio);

  // 3. 应用视图变换
  context.save();
  context.scale(pixelRatio, pixelRatio);
  context.translate(view.x, view.y);
  context.scale(view.scale, view.scale);

  // 4. 遍历一级板块 → 填充底色（圆角）
  for (const board of boardRects) {
    context.fillStyle = theme.boardFill;
    fillRoundRect(context, board.x, board.y, board.width, board.height, LIQUID_GLASS_RADIUS.board);
  }

  // 5. 遍历二级板块 → 填充底色（圆角）
  for (const subBoard of subBoardRects) {
    context.fillStyle = theme.subBoardFill;
    fillRoundRect(context, subBoard.x, subBoard.y, subBoard.width, subBoard.height, LIQUID_GLASS_RADIUS.subBoard);
  }

  // 6. 遍历个股 → 填充涨跌色块 + 绘制文字标签（圆角）
  for (const stock of stockRects) {
    context.fillStyle = getHeatColor(stock.changePct, priceColorMode);
    fillRoundRect(context, stock.x, stock.y, stock.width, stock.height, LIQUID_GLASS_RADIUS.stock);
    drawStockLabel(context, stock, priceColorMode, view.scale);
  }

  // 7. 遍历二级板块 → 绘制标题栏 + 边框
  for (const subBoard of subBoardRects) {
    if (subBoard.titleHeight > 0) {
      // A2: iOS 26 毛玻璃标题栏 —— 半透明底色 + 涨跌色叠加
      const headerColor = getBoardHeaderColor(subBoard.changePct, priceColorMode);
      // 先画半透明玻璃底（上圆下直：底边与下方色块衔接，不能漏缝）
      context.fillStyle = "rgba(20, 24, 35, 0.55)";
      context.beginPath();
      roundRectPath(context, subBoard.x, subBoard.y, subBoard.width, subBoard.titleHeight, LIQUID_GLASS_RADIUS.subBoard, true);
      context.fill();
      // 再叠一层半透明涨跌色（模拟毛玻璃透出底层颜色的效果）
      context.fillStyle = withAlpha(headerColor, 0.45);
      context.fill();
    }

    // iOS 26 毛玻璃边框（圆角描边）
    context.strokeStyle = theme.subBoardBorder;
    context.lineWidth = 0.7;
    strokeRoundRect(context, subBoard.x + 0.5, subBoard.y + 0.5, Math.max(0, subBoard.width - 1), Math.max(0, subBoard.height - 1), LIQUID_GLASS_RADIUS.subBoard);

    if (subBoard.width > 44 && subBoard.titleHeight > 8) {
      const fontSize = clamp(Math.floor(subBoard.titleHeight * 0.56), 9, 12);
      context.fillStyle = "rgba(247, 250, 252, 0.92)";
      context.textAlign = "left";
      context.textBaseline = "middle";
      context.font = heatmapFont(700, fontSize);
      // #6: 按像素截断替代按字数截断，避免窄标题被多余省略号、宽标题被提前截断
      drawClippedText(context, fitTextToWidth(context, subBoard.name, Math.max(0, subBoard.width - 10)), subBoard.x + 5, subBoard.y + subBoard.titleHeight / 2 + fontSize * 0.06, subBoard.x + 3, subBoard.y + 1, Math.max(0, subBoard.width - 6), Math.max(0, subBoard.titleHeight - 2));
    }
  }

  // 8. 遍历一级板块 → 绘制标题栏 + 边框
  for (const board of boardRects) {
    if (board.titleHeight > 0) {
      // A2: iOS 26 毛玻璃标题栏 —— 一级板块同上（上圆下直）
      const headerColor = getBoardHeaderColor(board.changePct, priceColorMode);
      context.fillStyle = "rgba(20, 24, 35, 0.60)";
      context.beginPath();
      roundRectPath(context, board.x, board.y, board.width, board.titleHeight, LIQUID_GLASS_RADIUS.board, true);
      context.fill();
      context.fillStyle = withAlpha(headerColor, 0.42);
      context.fill();
    }

    // iOS 26 毛玻璃边框（圆角描边）
    context.strokeStyle = theme.boardBorder;
    context.lineWidth = 0.85;
    strokeRoundRect(context, board.x + 0.5, board.y + 0.5, Math.max(0, board.width - 1), Math.max(0, board.height - 1), LIQUID_GLASS_RADIUS.board);

    if (board.width > 56 && board.titleHeight > 10) {
      const fontSize = clamp(Math.floor(board.titleHeight * 0.52), 10, 15);
      context.fillStyle = "rgba(247, 250, 252, 0.96)";
      context.textAlign = "left";
      context.textBaseline = "middle";
      context.font = heatmapFont(700, fontSize);
      // #6: 按像素截断替代按字数截断
      drawClippedText(context, fitTextToWidth(context, board.name, Math.max(0, board.width - 16)), board.x + 8, board.y + board.titleHeight / 2 + fontSize * 0.08, board.x + 4, board.y + 2, Math.max(0, board.width - 8), Math.max(0, board.titleHeight - 4));
    }
  }

  context.restore();
}

// ============ 高亮叠加绘制 ============

/**
 * 只画高亮描边（活跃板块边框 + 活跃二级行业边框 + 高亮个股双层描边）
 *
 * 用于离屏缓存方案：完整热力图（不含高亮）先画到离屏 canvas，
 * 鼠标悬停变化时直接把离屏内容复制到可见 canvas，再调用本函数画高亮。
 * 这样鼠标移动时不需要重画 5443 个色块，只画几个描边即可。
 *
 * 调用前可见 canvas 上应该已经有完整的热力图底图。
 */
export type DrawHeatmapHighlightParams = {
  context: CanvasRenderingContext2D;
  pixelRatio: number;
  view: { scale: number; x: number; y: number };
  theme: HeatmapCanvasTheme;
  highlightedStock: StockRect | null;
  activeBoardRect: BoardRect | null;
  activeSubBoardRect: SubBoardRect | null;
};

export function drawHeatmapHighlight(params: DrawHeatmapHighlightParams) {
  const { context, pixelRatio, view, theme, highlightedStock, activeBoardRect, activeSubBoardRect } = params;

  context.save();
  context.scale(pixelRatio, pixelRatio);
  context.translate(view.x, view.y);
  context.scale(view.scale, view.scale);

  // 活跃二级行业边框（iOS 26 圆角）
  if (activeSubBoardRect) {
    context.strokeStyle = "#5eead4";
    context.lineWidth = 1.8;
    strokeRoundRect(context,
      activeSubBoardRect.x + 0.5, activeSubBoardRect.y + 0.5,
      Math.max(0, activeSubBoardRect.width - 1), Math.max(0, activeSubBoardRect.height - 1), LIQUID_GLASS_RADIUS.subBoard
    );

    context.strokeStyle = theme.activeSubBoardInner;
    context.lineWidth = 0.7;
    strokeRoundRect(context,
      activeSubBoardRect.x + 2.2, activeSubBoardRect.y + 2.2,
      Math.max(0, activeSubBoardRect.width - 4.4), Math.max(0, activeSubBoardRect.height - 4.4), LIQUID_GLASS_RADIUS.subBoard - 1
    );
  }

  // 活跃板块边框（iOS 26 圆角）
  if (activeBoardRect) {
    context.strokeStyle = "#f6d36d";
    context.lineWidth = 1.6;
    strokeRoundRect(context,
      activeBoardRect.x + 0.5, activeBoardRect.y + 0.5,
      Math.max(0, activeBoardRect.width - 1), Math.max(0, activeBoardRect.height - 1), LIQUID_GLASS_RADIUS.board
    );
  }

  // 高亮个股（iOS 26 发光光晕效果）
  if (highlightedStock) {
    const hr = LIQUID_GLASS_RADIUS.stock + 1;
    const hx = highlightedStock.x + 1;
    const hy = highlightedStock.y + 1;
    const hw = Math.max(0, highlightedStock.width - 2);
    const hh = Math.max(0, highlightedStock.height - 2);

    // A3: 发光光晕
    context.save();
    context.strokeStyle = theme.highlightInner;
    context.lineWidth = 1.6;
    context.shadowColor = "rgba(120, 200, 255, 0.55)";
    context.shadowBlur = 8;
    strokeRoundRect(context, hx, hy, hw, hh, hr);
    context.restore();

    context.strokeStyle = theme.highlightInner;
    context.lineWidth = 1.8;
    strokeRoundRect(context, hx, hy, hw, hh, hr);

    context.strokeStyle = theme.highlightOuter;
    context.lineWidth = 3;
    strokeRoundRect(context, hx, hy, hw, hh, hr);
  }

  context.restore();
}
