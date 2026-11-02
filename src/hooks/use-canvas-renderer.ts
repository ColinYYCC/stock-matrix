"use client";

import { useCallback, useEffect, useRef } from "react";

import { drawHeatmap, drawHeatmapHighlight, type HeatmapCanvasTheme } from "@/lib/canvas-render";
import type { HeatmapLayout } from "@/lib/heatmap-layout";
import type {
  BoardRect,
  LabelSizeMode,
  PriceColorMode,
  StockRect,
  SubBoardRect,
  ViewState,
} from "@/types/heatmap";

/**
 * Canvas 绘制管线（从 market-heatmap.tsx 原样搬出，纯搬迁，逻辑未动）
 *
 * 性能优化：
 * 1. 完整热力图（不含高亮）画到离屏 canvas，只在数据/布局/配色/字号/画布尺寸变化时全量重画
 * 2. 鼠标悬停只变化高亮时：逐像素复制离屏底图 + 画描边，不重画数百个色块
 * 3. 滚轮缩放/拖拽平移期间：底图按新旧 view 的比例与偏移整体变换绘制（挪图不重画），
 *    操作停止 150ms 后再全量重画一次，消除连续缩放期间的插值模糊
 */
export function useCanvasRenderer(params: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  canvasSize: { width: number; height: number };
  view: ViewState;
  heatmapCanvasTheme: HeatmapCanvasTheme;
  priceColorMode: PriceColorMode;
  labelSizeMode: LabelSizeMode;
  showPrice: boolean;
  layoutPositions: HeatmapLayout;
  highlightedStock: StockRect | null;
  activeBoardRect: BoardRect | null;
  activeSubBoardRect: SubBoardRect | null;
}): void {
  const {
    canvasRef, canvasSize, view, heatmapCanvasTheme, priceColorMode, labelSizeMode, showPrice,
    layoutPositions, highlightedStock, activeBoardRect, activeSubBoardRect,
  } = params;

  const drawFrameRef = useRef<number | null>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  /** 离屏底图的依赖快照：任一引用变化才全量重画底图（view 变化单独走变换复用路径） */
  const baseDepsRef = useRef<readonly unknown[]>([]);
  /** 离屏底图绘制时使用的 view：变换绘制时用它推算底图该挪到哪里 */
  const baseViewRef = useRef<ViewState>({ scale: 1, x: 0, y: 0 });
  /** 缩放/平移停止后的"清晰重画"定时器 */
  const sharpenTimerRef = useRef<number | null>(null);
  /** renderCanvas 的最新引用：防抖回调经它调到最新闭包，避免回调与绘制的依赖循环 */
  const renderCanvasRef = useRef<() => void>(() => {});

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const pixelRatio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    const targetWidth = Math.floor(canvasSize.width * pixelRatio);
    const targetHeight = Math.floor(canvasSize.height * pixelRatio);

    // 底图依赖快照：布局数组/主题对象都是稳定引用（useMemo/常量表），浅比较即可判定
    const baseDeps = [
      canvasSize.width, canvasSize.height, heatmapCanvasTheme, priceColorMode, labelSizeMode, showPrice,
      layoutPositions.stockRects, layoutPositions.boardRects, layoutPositions.subBoardRects,
    ] as const;
    const needFullRedraw =
      baseDeps.length !== baseDepsRef.current.length ||
      baseDeps.some((dependency, index) => dependency !== baseDepsRef.current[index]);

    // 离屏 canvas：底图依赖变化时按当前 view 全量重绘（不含高亮）
    const offscreen = offscreenRef.current ?? (offscreenRef.current = document.createElement("canvas"));
    if (needFullRedraw) {
      baseDepsRef.current = baseDeps;
      baseViewRef.current = view;
      offscreen.width = targetWidth;
      offscreen.height = targetHeight;
      const offContext = offscreen.getContext("2d");
      if (!offContext) return;
      drawHeatmap({
        context: offContext, canvasWidth: canvasSize.width, canvasHeight: canvasSize.height, pixelRatio, view,
        theme: heatmapCanvasTheme, priceColorMode,
        labelOptions: { sizeMode: labelSizeMode, showPrice },
        stockRects: layoutPositions.stockRects, boardRects: layoutPositions.boardRects, subBoardRects: layoutPositions.subBoardRects,
      });
    }

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      canvas.style.width = `${canvasSize.width}px`;
      canvas.style.height = `${canvasSize.height}px`;
    }

    // 底图按 baseView 画的；世界坐标点的新屏幕位置 = 底图位置 × (新 scale/旧 scale) + 偏移修正
    const baseView = baseViewRef.current;
    const viewRatio = view.scale / baseView.scale;
    const viewOffsetX = view.x - baseView.x * viewRatio;
    const viewOffsetY = view.y - baseView.y * viewRatio;
    if (needFullRedraw || (viewRatio === 1 && viewOffsetX === 0 && viewOffsetY === 0)) {
      // view 未偏离底图：逐像素复制，无损
      context.drawImage(offscreen, 0, 0);
    } else {
      // view 已变化：先铺背景渐变防露边，再把底图整体挪位/缩放画上去（不重画色块）
      const background = context.createLinearGradient(0, 0, canvas.width, canvas.height);
      background.addColorStop(0, heatmapCanvasTheme.backgroundStart);
      background.addColorStop(1, heatmapCanvasTheme.backgroundEnd);
      context.fillStyle = background;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      context.translate(viewOffsetX, viewOffsetY);
      context.scale(viewRatio, viewRatio);
      context.drawImage(offscreen, 0, 0, canvasSize.width, canvasSize.height);
      context.setTransform(1, 0, 0, 1, 0, 0); // 复位：下方高亮绘制自管变换

      // 连续缩放/平移停止 150ms 后全量重画一次，恢复文字清晰
      if (sharpenTimerRef.current !== null) clearTimeout(sharpenTimerRef.current);
      sharpenTimerRef.current = window.setTimeout(() => {
        sharpenTimerRef.current = null;
        baseDepsRef.current = []; // 置空快照，强制下一帧全量重画底图
        drawFrameRef.current = requestAnimationFrame(() => {
          drawFrameRef.current = null;
          renderCanvasRef.current();
        });
      }, 150);
    }

    // 在底图上画高亮（只画描边，不重画色块）
    if (highlightedStock || activeBoardRect || activeSubBoardRect) {
      drawHeatmapHighlight({
        context, pixelRatio, view, theme: heatmapCanvasTheme,
        highlightedStock, activeBoardRect, activeSubBoardRect,
      });
    }
  }, [
    activeBoardRect, activeSubBoardRect, canvasRef, canvasSize.height, canvasSize.width, heatmapCanvasTheme,
    highlightedStock, labelSizeMode, layoutPositions.boardRects, layoutPositions.stockRects,
    layoutPositions.subBoardRects, priceColorMode, showPrice, view,
  ]);

  useEffect(() => {
    renderCanvasRef.current = renderCanvas;
  }, [renderCanvas]);

  useEffect(() => {
    // 取消上一帧还没执行的绘制（多次状态变化合并成一次绘制）
    if (drawFrameRef.current !== null) {
      cancelAnimationFrame(drawFrameRef.current);
    }
    drawFrameRef.current = requestAnimationFrame(() => {
      drawFrameRef.current = null;
      renderCanvas();
    });
    return () => {
      if (drawFrameRef.current !== null) {
        cancelAnimationFrame(drawFrameRef.current);
        drawFrameRef.current = null;
      }
    };
  }, [renderCanvas]);

  // 组件卸载时清理"清晰重画"定时器
  useEffect(() => () => {
    if (sharpenTimerRef.current !== null) {
      clearTimeout(sharpenTimerRef.current);
      sharpenTimerRef.current = null;
    }
  }, []);
}
