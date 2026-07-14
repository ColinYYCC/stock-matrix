"use client";

import { useCallback, useRef } from "react";
import type { BoardRect, StockRect, SubBoardRect, ViewState } from "@/types/heatmap";
import { clamp } from "@/lib/format";

/** 缩放范围：1x ~ 3x */
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;

/** 把视图偏移限制在画布范围内（缩放后才生效，1x 时不允许偏移） */
export function clampOffset(width: number, height: number, scale: number, x: number, y: number) {
  if (scale <= 1) {
    return { x: 0, y: 0 };
  }
  const minX = width - width * scale;
  const minY = height - height * scale;
  return {
    x: clamp(x, minX, 0),
    y: clamp(y, minY, 0),
  };
}

/** 命中检测函数集合 */
export type PickFunctions = {
  pickStock: (worldX: number, worldY: number) => StockRect | null;
  pickBoard: (worldX: number, worldY: number) => BoardRect | null;
  pickBoardTitle: (worldX: number, worldY: number) => BoardRect | null;
  pickSubBoard: (worldX: number, worldY: number) => SubBoardRect | null;
  pickSubBoardTitle: (worldX: number, worldY: number) => SubBoardRect | null;
};

/**
 * Canvas 交互 Hook
 *
 * 封装鼠标事件、滚轮缩放、拖拽平移、触摸手势。
 * 改进点：把原项目内联在组件里的事件处理逻辑提取成独立 hook。
 */
export function useCanvasInteraction(params: {
  canvasSize: { width: number; height: number };
  view: ViewState;
  setView: React.Dispatch<React.SetStateAction<ViewState>>;
  stockRectsRef: React.RefObject<StockRect[]>;
  boardRectsRef: React.RefObject<BoardRect[]>;
  subBoardRectsRef: React.RefObject<SubBoardRect[]>;
  isMobile: boolean;
}) {
  const { canvasSize, view, setView, stockRectsRef, boardRectsRef, subBoardRectsRef, isMobile } = params;

  const dragStateRef = useRef({
    active: false,
    pointerX: 0,
    pointerY: 0,
  });

  const touchStateRef = useRef({
    mode: "idle" as "idle" | "pan" | "pinch" | "tap",
    startClientX: 0,
    startClientY: 0,
    lastClientX: 0,
    lastClientY: 0,
    startTs: 0,
    moved: false,
    startDistance: 0,
    startScale: 1,
    startOffsetX: 0,
    startOffsetY: 0,
    pinchCenterX: 0,
    pinchCenterY: 0,
    pinchWorldX: 0,
    pinchWorldY: 0,
    lastTapTs: 0,
    lastTapX: 0,
    lastTapY: 0,
  });

  /** 屏幕坐标 → 世界坐标（考虑缩放和偏移） */
  const toWorldPoint = useCallback(
    (screenX: number, screenY: number) => ({
      x: (screenX - view.x) / view.scale,
      y: (screenY - view.y) / view.scale,
    }),
    [view.scale, view.x, view.y]
  );

  /** 命中检测：从后往前遍历，返回第一个命中的个股 */
  const pickStock = useCallback((worldX: number, worldY: number): StockRect | null => {
    for (let index = stockRectsRef.current.length - 1; index >= 0; index -= 1) {
      const stock = stockRectsRef.current[index];
      if (worldX >= stock.x && worldX <= stock.x + stock.width && worldY >= stock.y && worldY <= stock.y + stock.height) {
        return stock;
      }
    }
    return null;
  }, [stockRectsRef]);

  /** 命中检测：一级行业板块 */
  const pickBoard = useCallback((worldX: number, worldY: number): BoardRect | null => {
    for (let index = boardRectsRef.current.length - 1; index >= 0; index -= 1) {
      const board = boardRectsRef.current[index];
      if (worldX >= board.x && worldX <= board.x + board.width && worldY >= board.y && worldY <= board.y + board.height) {
        return board;
      }
    }
    return null;
  }, [boardRectsRef]);

  /** 命中检测：一级行业板块标题栏 */
  const pickBoardTitle = useCallback((worldX: number, worldY: number): BoardRect | null => {
    for (let index = boardRectsRef.current.length - 1; index >= 0; index -= 1) {
      const board = boardRectsRef.current[index];
      if (board.titleHeight > 0 && worldX >= board.x && worldX <= board.x + board.width && worldY >= board.y && worldY <= board.y + board.titleHeight) {
        return board;
      }
    }
    return null;
  }, [boardRectsRef]);

  /** 命中检测：二级行业板块 */
  const pickSubBoard = useCallback((worldX: number, worldY: number): SubBoardRect | null => {
    for (let index = subBoardRectsRef.current.length - 1; index >= 0; index -= 1) {
      const subBoard = subBoardRectsRef.current[index];
      if (worldX >= subBoard.x && worldX <= subBoard.x + subBoard.width && worldY >= subBoard.y && worldY <= subBoard.y + subBoard.height) {
        return subBoard;
      }
    }
    return null;
  }, [subBoardRectsRef]);

  /** 命中检测：二级行业板块标题栏 */
  const pickSubBoardTitle = useCallback((worldX: number, worldY: number): SubBoardRect | null => {
    for (let index = subBoardRectsRef.current.length - 1; index >= 0; index -= 1) {
      const subBoard = subBoardRectsRef.current[index];
      if (subBoard.titleHeight > 0 && worldX >= subBoard.x && worldX <= subBoard.x + subBoard.width && worldY >= subBoard.y && worldY <= subBoard.y + subBoard.titleHeight) {
        return subBoard;
      }
    }
    return null;
  }, [subBoardRectsRef]);

  const pickFunctions: PickFunctions = {
    pickStock,
    pickBoard,
    pickBoardTitle,
    pickSubBoard,
    pickSubBoardTitle,
  };

  return {
    toWorldPoint,
    pickFunctions,
    dragStateRef,
    touchStateRef,
  };
}
