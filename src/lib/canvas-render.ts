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
import { clamp } from "./format";
import { getBoardHeaderColor, getHeatColor } from "./heatmap-color";

/** Canvas 主题配色表 */
export const heatmapCanvasThemes: Record<
  DisplayMode,
  {
    backgroundStart: string;
    backgroundEnd: string;
    boardFill: string;
    subBoardFill: string;
    subBoardBorder: string;
    activeSubBoardInner: string;
    boardBorder: string;
    highlightOuter: string;
    highlightInner: string;
  }
> = {
  dark: {
    backgroundStart: "#171b22",
    backgroundEnd: "#10141b",
    boardFill: "#20252d",
    subBoardFill: "rgba(18, 23, 31, 0.62)",
    subBoardBorder: "rgba(148, 163, 184, 0.3)",
    activeSubBoardInner: "rgba(8, 47, 73, 0.92)",
    boardBorder: "rgba(148, 163, 184, 0.48)",
    highlightOuter: "rgba(2, 6, 23, 0.92)",
    highlightInner: "#f8fafc",
  },
  light: {
    backgroundStart: "#f8fafc",
    backgroundEnd: "#e9eef5",
    boardFill: "#eef2f7",
    subBoardFill: "rgba(255, 255, 255, 0.72)",
    subBoardBorder: "rgba(100, 116, 139, 0.32)",
    activeSubBoardInner: "rgba(14, 116, 144, 0.42)",
    boardBorder: "rgba(100, 116, 139, 0.42)",
    highlightOuter: "rgba(15, 23, 42, 0.82)",
    highlightInner: "#ffffff",
  },
};

/** 热力图字体栈 */
const heatmapFontStack = `"Avenir Next Condensed", "DIN Condensed", "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;

/** 生成 Canvas 字体声明 */
function heatmapFont(weight: number, size: number) {
  return `${weight} ${size}px ${heatmapFontStack}`;
}

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
  context.rect(clipX, clipY, clipWidth, clipHeight);
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

/** 截断文字，超长加省略号 */
function shortenText(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}

/** 格式化价格 */
function formatPrice(value: number) {
  return value.toFixed(value >= 100 ? 1 : 2);
}

/** 格式化涨跌幅 */
function formatChange(value: number) {
  if (value > 0) return `+${value.toFixed(2)}%`;
  return `${value.toFixed(2)}%`;
}

/** 紧凑版涨跌幅 */
function formatCompactChange(value: number) {
  const absValue = Math.abs(value);
  const digits = absValue >= 10 ? 1 : 2;
  const text = value.toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
  return value > 0 ? `+${text}%` : `${text}%`;
}

/**
 * 绘制单只股票的文字标签
 *
 * 根据色块大小分 4 级显示：
 * - Large: 宽>=108 高>=58 → 股票名 + 涨跌幅 + 价格
 * - Stacked: 宽>=28 高>=20 → 股票名(上) + 涨跌幅(下)
 * - Inline: 宽>=24 高>=10 → 股票名 + 涨跌幅(单行)
 * - 更小 → 不绘制文字
 */
export function drawStockLabel(context: CanvasRenderingContext2D, stock: StockRect, zoomScale = 1) {
  const displayWidth = stock.width * zoomScale;
  const displayHeight = stock.height * zoomScale;
  const screenUnit = 1 / zoomScale;
  const clipPaddingPx = displayWidth > 110 ? 5 : displayWidth > 54 ? 3 : 2;
  const textInsetXPx = displayWidth > 110 ? 6 : displayWidth > 54 ? 4 : 3;
  const textInsetYPx = displayHeight > 56 ? 4.5 : displayHeight > 26 ? 3 : 2;
  const clipPadding = clipPaddingPx * screenUnit;
  const textInsetX = textInsetXPx * screenUnit;
  const textInsetY = textInsetYPx * screenUnit;
  const clipWidth = Math.max(0, stock.width - clipPadding * 2);
  const clipHeight = Math.max(0, stock.height - clipPadding * 2);

  if (displayWidth < 16 || displayHeight < 8 || clipWidth <= 2 || clipHeight <= 2) return;

  const hasLargeLabel = displayWidth >= 108 && displayHeight >= 58;
  const hasStackedLabel = displayWidth >= 28 && displayHeight >= 20;
  const hasInlineLabel = displayWidth >= 24 && displayHeight >= 10;

  context.save();
  try {
    context.fillStyle = "rgba(247, 250, 252, 0.96)";
    context.shadowColor = "rgba(0, 0, 0, 0.42)";
    context.shadowBlur = (displayHeight < 14 ? 0.45 : 1.2) * screenUnit;
    context.shadowOffsetY = 0.6 * screenUnit;

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
      const centerX = stock.x + stock.width / 2;
      const centerY = stock.y + stock.height / 2;

      context.textAlign = "center";
      context.textBaseline = "middle";
      context.font = heatmapFont(700, titleSize);
      drawClippedText(context, fitTextToWidth(context, stock.name, clipWidth), centerX, centerY - titleSize * 0.62, stock.x + clipPadding, stock.y + clipPadding, clipWidth, clipHeight);

      context.font = heatmapFont(650, detailSize);
      drawClippedText(context, formatChange(stock.changePct), centerX, centerY + detailSize * 0.3, stock.x + clipPadding, stock.y + clipPadding, clipWidth, clipHeight);

      if (displayWidth > 180 && displayHeight > 100) {
        context.font = heatmapFont(550, Math.max(11 * screenUnit, detailSize - 1 * screenUnit));
        drawClippedText(context, formatPrice(stock.price), centerX, centerY + detailSize * 1.35, stock.x + clipPadding, stock.y + clipPadding, clipWidth, clipHeight);
      }
      return;
    }

    if (hasStackedLabel) {
      const preferredTitleSize = clamp(Math.floor(Math.min(displayWidth * 0.19, displayHeight * 0.43)), 7.5, 16) * screenUnit;
      const titleSize = fitFontSizeToWidth(context, stock.name, 700, preferredTitleSize, Math.max(6.5 * screenUnit, preferredTitleSize * 0.72), clipWidth - (textInsetX - clipPadding));
      const detailSize = Math.min(clamp(Math.floor(displayHeight * 0.33), 7, 13) * screenUnit, titleSize * 1.08);

      context.textAlign = "left";
      context.textBaseline = "alphabetic";
      context.font = heatmapFont(700, titleSize);
      drawClippedText(context, fitTextToWidth(context, stock.name, clipWidth - (textInsetX - clipPadding)), stock.x + textInsetX, stock.y + textInsetY + titleSize, stock.x + clipPadding, stock.y + clipPadding, clipWidth, clipHeight);

      if (displayHeight >= 20) {
        context.font = heatmapFont(650, detailSize);
        drawClippedText(context, displayWidth >= 58 ? formatChange(stock.changePct) : formatCompactChange(stock.changePct), stock.x + textInsetX, stock.y + textInsetY + titleSize + detailSize + 1.5 * screenUnit, stock.x + clipPadding, stock.y + clipPadding, clipWidth, clipHeight);
      }
      return;
    }

    if (hasInlineLabel) {
      const fontSize = clamp(Math.floor(Math.min(displayWidth * 0.18, displayHeight * 0.68)), 6.5, 11) * screenUnit;
      const changeText = formatCompactChange(stock.changePct);
      const gap = 3 * screenUnit;

      context.textAlign = "left";
      context.textBaseline = "middle";
      context.font = heatmapFont(650, fontSize);

      const changeWidth = context.measureText(changeText).width;
      const canShowChange = displayWidth >= 32 && changeWidth + gap < clipWidth * 0.72;
      const nameMaxWidth = canShowChange ? Math.max(0, clipWidth - changeWidth - gap) : clipWidth;
      const fittedName = fitTextToWidth(context, stock.name, nameMaxWidth);
      const labelY = stock.y + stock.height / 2 + fontSize * 0.06;

      if (fittedName) {
        drawClippedText(context, fittedName, stock.x + textInsetX, labelY, stock.x + clipPadding, stock.y + clipPadding, clipWidth, clipHeight);
      }

      if (canShowChange) {
        context.textAlign = "right";
        drawClippedText(context, changeText, stock.x + stock.width - textInsetX, labelY, stock.x + clipPadding, stock.y + clipPadding, clipWidth, clipHeight);
      }
      return;
    }

    if (displayWidth >= 18 && displayHeight >= 8) {
      const fontSize = clamp(Math.floor(displayHeight * 0.72), 6, 9) * screenUnit;
      context.textAlign = "left";
      context.textBaseline = "middle";
      context.font = heatmapFont(650, fontSize);
      const fittedName = fitTextToWidth(context, stock.name, clipWidth);
      if (fittedName) {
        drawClippedText(context, fittedName, stock.x + textInsetX, stock.y + stock.height / 2 + fontSize * 0.06, stock.x + clipPadding, stock.y + clipPadding, clipWidth, clipHeight);
      }
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
  theme: (typeof heatmapCanvasThemes)[DisplayMode];
  priceColorMode: PriceColorMode;
  stockRects: StockRect[];
  boardRects: BoardRect[];
  subBoardRects: SubBoardRect[];
  highlightedStock: StockRect | null;
  activeBoardName: string | null;
  activeSubBoardName: string | null;
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
 * 9. 绘制高亮选中色块(双层描边)
 */
export function drawHeatmap(params: DrawHeatmapParams) {
  const { context, canvasWidth, canvasHeight, pixelRatio, view, theme, priceColorMode, stockRects, boardRects, subBoardRects, highlightedStock, activeBoardName, activeSubBoardName } = params;

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

  // 4. 遍历一级板块 → 填充板块底色
  for (const board of boardRects) {
    context.fillStyle = theme.boardFill;
    context.fillRect(board.x, board.y, board.width, board.height);
  }

  // 5. 遍历二级板块 → 填充子板块底色
  for (const subBoard of subBoardRects) {
    context.fillStyle = theme.subBoardFill;
    context.fillRect(subBoard.x, subBoard.y, subBoard.width, subBoard.height);
  }

  // 6. 遍历个股 → 填充涨跌色块 + 绘制文字标签
  for (const stock of stockRects) {
    context.fillStyle = getHeatColor(stock.changePct, priceColorMode);
    context.fillRect(stock.x, stock.y, stock.width, stock.height);
    drawStockLabel(context, stock, view.scale);
  }

  // 7. 遍历二级板块 → 绘制标题栏 + 边框
  for (const subBoard of subBoardRects) {
    const isActiveSubBoard = activeSubBoardName === subBoard.name && activeBoardName === subBoard.boardName;

    if (subBoard.titleHeight > 0) {
      context.fillStyle = getBoardHeaderColor(subBoard.changePct, priceColorMode);
      context.fillRect(subBoard.x, subBoard.y, subBoard.width, subBoard.titleHeight);
    }

    context.strokeStyle = isActiveSubBoard ? "#5eead4" : theme.subBoardBorder;
    context.lineWidth = isActiveSubBoard ? 2 : 0.9;
    context.strokeRect(subBoard.x + 0.5, subBoard.y + 0.5, Math.max(0, subBoard.width - 1), Math.max(0, subBoard.height - 1));

    if (isActiveSubBoard) {
      context.strokeStyle = theme.activeSubBoardInner;
      context.lineWidth = 0.8;
      context.strokeRect(subBoard.x + 2.2, subBoard.y + 2.2, Math.max(0, subBoard.width - 4.4), Math.max(0, subBoard.height - 4.4));
    }

    if (subBoard.width > 44 && subBoard.titleHeight > 8) {
      const fontSize = clamp(Math.floor(subBoard.titleHeight * 0.56), 9, 12);
      context.fillStyle = "rgba(247, 250, 252, 0.92)";
      context.textAlign = "left";
      context.textBaseline = "middle";
      context.font = `700 ${fontSize}px Arial, sans-serif`;
      drawClippedText(context, shortenText(subBoard.name, subBoard.width > 108 ? 8 : 5), subBoard.x + 5, subBoard.y + subBoard.titleHeight / 2 + fontSize * 0.06, subBoard.x + 3, subBoard.y + 1, Math.max(0, subBoard.width - 6), Math.max(0, subBoard.titleHeight - 2));
    }
  }

  // 8. 遍历一级板块 → 绘制标题栏 + 边框
  for (const board of boardRects) {
    const isActiveBoard = activeBoardName === board.name;
    if (board.titleHeight > 0) {
      context.fillStyle = getBoardHeaderColor(board.changePct, priceColorMode);
      context.fillRect(board.x, board.y, board.width, board.titleHeight);
    }

    context.strokeStyle = isActiveBoard ? "#f6d36d" : theme.boardBorder;
    context.lineWidth = isActiveBoard ? 1.8 : 1;
    context.strokeRect(board.x + 0.5, board.y + 0.5, Math.max(0, board.width - 1), Math.max(0, board.height - 1));

    if (board.width > 56 && board.titleHeight > 10) {
      const fontSize = clamp(Math.floor(board.titleHeight * 0.52), 10, 15);
      context.fillStyle = "rgba(247, 250, 252, 0.96)";
      context.textAlign = "left";
      context.textBaseline = "middle";
      context.font = `700 ${fontSize}px Arial, sans-serif`;
      drawClippedText(context, shortenText(board.name, board.width > 180 ? 12 : 8), board.x + 8, board.y + board.titleHeight / 2 + fontSize * 0.08, board.x + 4, board.y + 2, Math.max(0, board.width - 8), Math.max(0, board.titleHeight - 4));
    }
  }

  // 9. 绘制高亮选中色块（双层描边）
  if (highlightedStock) {
    context.strokeStyle = theme.highlightOuter;
    context.lineWidth = 4;
    context.strokeRect(highlightedStock.x + 1, highlightedStock.y + 1, Math.max(0, highlightedStock.width - 2), Math.max(0, highlightedStock.height - 2));

    context.strokeStyle = theme.highlightInner;
    context.lineWidth = 2;
    context.strokeRect(highlightedStock.x + 1, highlightedStock.y + 1, Math.max(0, highlightedStock.width - 2), Math.max(0, highlightedStock.height - 2));
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
  theme: (typeof heatmapCanvasThemes)[DisplayMode];
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

  // 活跃二级行业边框（teal + 内框）
  if (activeSubBoardRect) {
    context.strokeStyle = "#5eead4";
    context.lineWidth = 2;
    context.strokeRect(
      activeSubBoardRect.x + 0.5, activeSubBoardRect.y + 0.5,
      Math.max(0, activeSubBoardRect.width - 1), Math.max(0, activeSubBoardRect.height - 1),
    );

    context.strokeStyle = theme.activeSubBoardInner;
    context.lineWidth = 0.8;
    context.strokeRect(
      activeSubBoardRect.x + 2.2, activeSubBoardRect.y + 2.2,
      Math.max(0, activeSubBoardRect.width - 4.4), Math.max(0, activeSubBoardRect.height - 4.4),
    );
  }

  // 活跃板块边框（金色）
  if (activeBoardRect) {
    context.strokeStyle = "#f6d36d";
    context.lineWidth = 1.8;
    context.strokeRect(
      activeBoardRect.x + 0.5, activeBoardRect.y + 0.5,
      Math.max(0, activeBoardRect.width - 1), Math.max(0, activeBoardRect.height - 1),
    );
  }

  // 高亮个股（双层描边）
  if (highlightedStock) {
    context.strokeStyle = theme.highlightOuter;
    context.lineWidth = 4;
    context.strokeRect(
      highlightedStock.x + 1, highlightedStock.y + 1,
      Math.max(0, highlightedStock.width - 2), Math.max(0, highlightedStock.height - 2),
    );

    context.strokeStyle = theme.highlightInner;
    context.lineWidth = 2;
    context.strokeRect(
      highlightedStock.x + 1, highlightedStock.y + 1,
      Math.max(0, highlightedStock.width - 2), Math.max(0, highlightedStock.height - 2),
    );
  }

  context.restore();
}
