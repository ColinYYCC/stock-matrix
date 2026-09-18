/**
 * 热力图布局：板块 →（子板块）→ 个股 的嵌套矩形计算
 *
 * 从 market-heatmap.tsx 的 layoutPositions useMemo 抽出成纯函数（可单测），
 * 组件只负责调用。"隐藏无字色块"（computeLayoutHidingUnreadable）也在这里：
 * 布局 → 剔除"放不下名字"的个股 → 重排，迭代到没有无字色块（设轮数上限容忍残量）。
 */
import { clamp } from "@/lib/format";
import { binaryTreemap } from "@/lib/treemap";
import { groupStocksBySubBoard, weightedAverageChange } from "@/lib/market-stats";
import { canShowAnyLabel } from "@/lib/canvas-render";
import type { BoardRect, HeatmapBoardNode, StockRect, SubBoardRect } from "@/types/heatmap";

/** 布局结果：三种矩形一次性算齐（与 drawHeatmap 的入参对应） */
export type HeatmapLayout = {
  stockRects: StockRect[];
  boardRects: BoardRect[];
  subBoardRects: SubBoardRect[];
};

/** 板块级加权涨跌幅：无有效数据（周/月/年视图部分板块无涨跌幅数据）时按 0% 显示 */
function boardWeightedChange(stocks: ReadonlyArray<{ value: number; changePct: number }>) {
  return weightedAverageChange(stocks) || 0;
}

/**
 * 按当前数据算一次嵌套布局。
 *
 * 面积权重 = sqrt(市值)：线性市值下大公司能顶小公司几百倍面积，小盘股挤到放不下名字；
 * 开根号把差距压到几十倍，大小排名不变（sqrt 不改变排序）。板块加权涨跌幅仍按原始
 * 市值加权（boardWeightedChange），服务端 value 保持市值口径不动，两套语义互不污染。
 */
export function computeHeatmapLayout(
  nodes: HeatmapBoardNode[],
  canvasWidth: number,
  canvasHeight: number,
  subBoardFilter: string | null
): HeatmapLayout {
  const boardRects: BoardRect[] = [];
  const subBoardRects: SubBoardRect[] = [];
  const stockRects: StockRect[] = [];

  const boardBoxes = binaryTreemap(
    nodes.map((board) => ({ item: board, value: Math.sqrt(board.value) })),
    0, 0, canvasWidth, canvasHeight, 6
  );

  // 板块标题栏涨跌幅直接用 API 快照值（服务端已按实时行情算好）
  for (const boardBox of boardBoxes) {
    const boardChangePct = boardWeightedChange(boardBox.item.children);
    const titleHeight = boardBox.width < 84 || boardBox.height < 54 ? 0 : clamp(Math.round(Math.min(Math.max(boardBox.height * 0.09, 14), 24)), 12, 24);
    const contentPadding = boardBox.width > 110 && boardBox.height > 90 ? 3 : 2;
    const contentX = boardBox.x + contentPadding;
    const contentY = boardBox.y + titleHeight + contentPadding;
    const contentWidth = Math.max(0, boardBox.width - contentPadding * 2);
    const contentHeight = Math.max(0, boardBox.height - titleHeight - contentPadding * 2);

    boardRects.push({
      name: boardBox.item.name, x: boardBox.x, y: boardBox.y, width: boardBox.width, height: boardBox.height,
      stockCount: boardBox.item.stockCount, titleHeight, changePct: boardChangePct,
    });

    if (contentWidth <= 2 || contentHeight <= 2) continue;

    const subBoards = groupStocksBySubBoard(boardBox.item.children);
    const shouldNestSubBoards = subBoards.length > 1 || subBoardFilter !== null;

    if (!shouldNestSubBoards) {
      const stockBoxes = binaryTreemap(
        boardBox.item.children.map((stock) => ({ item: stock, value: Math.sqrt(stock.value) })),
        contentX, contentY, contentWidth, contentHeight, 1.5
      );
      for (const stockBox of stockBoxes) {
        stockRects.push({
          code: stockBox.item.code, name: stockBox.item.name, boardName: boardBox.item.name,
          subBoardName: stockBox.item.subBoardName, value: stockBox.item.value,
          x: stockBox.x, y: stockBox.y, width: stockBox.width, height: stockBox.height,
          price: stockBox.item.price, changePct: stockBox.item.changePct,
        });
      }
      continue;
    }

    const subBoardBoxes = binaryTreemap(
      subBoards.map((subBoard) => ({ item: subBoard, value: Math.sqrt(subBoard.value) })),
      contentX, contentY, contentWidth, contentHeight,
      boardBox.width > 96 && boardBox.height > 72 ? 2 : 1
    );

    for (const subBoardBox of subBoardBoxes) {
      const subTitleHeight = subBoardBox.width < 52 || subBoardBox.height < 34 ? 0 : clamp(Math.round(Math.min(Math.max(subBoardBox.height * 0.11, 10), 18)), 9, 18);
      const subPadding = subBoardBox.width > 82 && subBoardBox.height > 56 ? 2 : 1;
      const subContentX = subBoardBox.x + subPadding;
      const subContentY = subBoardBox.y + subTitleHeight + subPadding;
      const subContentWidth = Math.max(0, subBoardBox.width - subPadding * 2);
      const subContentHeight = Math.max(0, subBoardBox.height - subTitleHeight - subPadding * 2);

      subBoardRects.push({
        name: subBoardBox.item.name, boardName: boardBox.item.name,
        x: subBoardBox.x, y: subBoardBox.y, width: subBoardBox.width, height: subBoardBox.height,
        stockCount: subBoardBox.item.stockCount, titleHeight: subTitleHeight, changePct: subBoardBox.item.changePct,
      });

      if (subContentWidth <= 2 || subContentHeight <= 2) continue;

      const stockBoxes = binaryTreemap(
        subBoardBox.item.children.map((stock) => ({ item: stock, value: Math.sqrt(stock.value) })),
        subContentX, subContentY, subContentWidth, subContentHeight,
        subBoardBox.width > 56 && subBoardBox.height > 38 ? 1 : 0.5
      );

      for (const stockBox of stockBoxes) {
        stockRects.push({
          code: stockBox.item.code, name: stockBox.item.name, boardName: boardBox.item.name,
          subBoardName: stockBox.item.subBoardName, value: stockBox.item.value,
          x: stockBox.x, y: stockBox.y, width: stockBox.width, height: stockBox.height,
          price: stockBox.item.price, changePct: stockBox.item.changePct,
        });
      }
    }
  }

  return { stockRects, boardRects, subBoardRects };
}

/** 删减迭代上限：实测 5-6 轮收敛；到顶仍剩的无字块（大屏约 0.3%）直接容忍 */
const MAX_HIDING_ROUNDS = 8;

/**
 * 迭代剔除"放不下名字"的个股：布局 → 找无字块 → 剔除 → 重排，直到没有无字色块。
 *
 * - 判定与画字共用 canShowAnyLabel（同一把尺子，缩放按 1 计——滚轮放大不召回）；
 * - 没画出来的个股（板块内容区太小被跳过）同样视为无字块剔除；
 * - 不修改传入的板块数据；被剔空的板块整体消失，面积按剩余市值重排。
 */
export function computeLayoutHidingUnreadable(
  nodes: HeatmapBoardNode[],
  canvasWidth: number,
  canvasHeight: number,
  subBoardFilter: string | null
): HeatmapLayout {
  let currentNodes = nodes;
  let layout = computeHeatmapLayout(currentNodes, canvasWidth, canvasHeight, subBoardFilter);
  for (let round = 0; round < MAX_HIDING_ROUNDS; round += 1) {
    const rectByCode = new Map(layout.stockRects.map((rect) => [rect.code, rect]));
    const doomedCodes = new Set<string>();
    for (const board of currentNodes) {
      for (const stock of board.children) {
        const rect = rectByCode.get(stock.code);
        if (!rect || !canShowAnyLabel(rect.width, rect.height, 1)) doomedCodes.add(stock.code);
      }
    }
    if (doomedCodes.size === 0) return layout;
    currentNodes = removeStocksByCode(currentNodes, doomedCodes);
    layout = computeHeatmapLayout(currentNodes, canvasWidth, canvasHeight, subBoardFilter);
  }
  return layout;
}

/** 从板块节点里剔除指定股票（不改入落数据；剔空的板块整体移除，市值随剩余股票重算） */
function removeStocksByCode(nodes: HeatmapBoardNode[], doomedCodes: ReadonlySet<string>): HeatmapBoardNode[] {
  const nextNodes: HeatmapBoardNode[] = [];
  for (const board of nodes) {
    const children = board.children.filter((stock) => !doomedCodes.has(stock.code));
    if (children.length === 0) continue;
    if (children.length === board.children.length) {
      nextNodes.push(board);
      continue;
    }
    nextNodes.push({
      ...board,
      children,
      stockCount: children.length,
      value: children.reduce((sum, stock) => sum + stock.value, 0),
    });
  }
  return nextNodes;
}
