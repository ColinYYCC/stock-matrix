"use client";

import { useEffect } from "react";

import { clamp } from "@/lib/format";
import {
  clampOffset,
  MIN_ZOOM,
  MAX_ZOOM,
  type PickFunctions,
  type TouchState,
} from "@/hooks/use-canvas-interaction";
import { allBoardsValue, type ViewState } from "@/types/heatmap";

/**
 * 触摸手势（从 market-heatmap.tsx 原样搬出，纯搬迁，逻辑未动）：
 * 单击选中个股/板块（320ms 延迟区分双击）、双击切换板块/子板块筛选、
 * 单指平移（放大后生效）、双指捏合缩放。
 * touchcancel：触摸被系统中断（如来电）时取消挂起的单击定时器，不触发任何 tap。
 */
export function useTouchGestures(params: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  canvasSize: { width: number; height: number };
  pickFunctions: PickFunctions;
  toWorldPoint: (screenX: number, screenY: number) => { x: number; y: number };
  touchStateRef: React.RefObject<TouchState>;
  toggleSubBoardFilter: (subName: string) => void;
  setView: React.Dispatch<React.SetStateAction<ViewState>>;
  setSelectedStockCode: (code: string | null) => void;
  setSelectedBoardName: (name: string | null) => void;
  setSelectedSubBoardName: (name: string | null) => void;
  setBoardFilter: React.Dispatch<React.SetStateAction<string>>;
}): void {
  const {
    canvasRef, canvasSize, pickFunctions, toWorldPoint, touchStateRef, toggleSubBoardFilter,
    setView, setSelectedStockCode, setSelectedBoardName, setSelectedSubBoardName, setBoardFilter,
  } = params;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function onTouchStart(event: TouchEvent) {
      const state = touchStateRef.current;
      if (event.touches.length === 2) {
        event.preventDefault();
        const bounds = canvas!.getBoundingClientRect();
        const center = { x: (event.touches[0].clientX + event.touches[1].clientX) / 2, y: (event.touches[0].clientY + event.touches[1].clientY) / 2 };
        const cursorX = center.x - bounds.left;
        const cursorY = center.y - bounds.top;
        const distance = Math.hypot(event.touches[0].clientX - event.touches[1].clientX, event.touches[0].clientY - event.touches[1].clientY) || 1;
        state.mode = "pinch";
        state.moved = true;
        state.startDistance = distance;
        state.pinchCenterX = cursorX;
        state.pinchCenterY = cursorY;
        setView((current) => {
          state.startScale = current.scale;
          state.startOffsetX = current.x;
          state.startOffsetY = current.y;
          state.pinchWorldX = (cursorX - current.x) / current.scale;
          state.pinchWorldY = (cursorY - current.y) / current.scale;
          return current;
        });
        return;
      }
      if (event.touches.length === 1) {
        const touch = event.touches[0];
        state.mode = "tap";
        state.moved = false;
        state.startTs = Date.now();
        state.startClientX = touch.clientX;
        state.startClientY = touch.clientY;
        state.lastClientX = touch.clientX;
        state.lastClientY = touch.clientY;
      }
    }

    function onTouchMove(event: TouchEvent) {
      const state = touchStateRef.current;
      if (event.touches.length >= 2 && state.mode === "pinch") {
        event.preventDefault();
        const currentDistance = Math.hypot(event.touches[0].clientX - event.touches[1].clientX, event.touches[0].clientY - event.touches[1].clientY);
        if (!currentDistance) return;
        const ratio = currentDistance / state.startDistance;
        const nextScale = clamp(state.startScale * ratio, MIN_ZOOM, MAX_ZOOM);
        const rawX = state.pinchCenterX - state.pinchWorldX * nextScale;
        const rawY = state.pinchCenterY - state.pinchWorldY * nextScale;
        setView(() => {
          const nextOffset = clampOffset(canvasSize.width, canvasSize.height, nextScale, rawX, rawY);
          return { scale: nextScale, x: nextOffset.x, y: nextOffset.y };
        });
        return;
      }
      if (event.touches.length === 1 && (state.mode === "tap" || state.mode === "pan")) {
        const touch = event.touches[0];
        const deltaFromStart = Math.hypot(touch.clientX - state.startClientX, touch.clientY - state.startClientY);
        if (state.mode === "tap" && deltaFromStart > 6) { state.mode = "pan"; state.moved = true; }
        if (state.mode !== "pan") return;
        event.preventDefault();
        const deltaX = touch.clientX - state.lastClientX;
        const deltaY = touch.clientY - state.lastClientY;
        state.lastClientX = touch.clientX;
        state.lastClientY = touch.clientY;
        setView((current) => {
          if (current.scale <= 1) return current;
          const nextOffset = clampOffset(canvasSize.width, canvasSize.height, current.scale, current.x + deltaX, current.y + deltaY);
          if (nextOffset.x === current.x && nextOffset.y === current.y) return current;
          return { ...current, x: nextOffset.x, y: nextOffset.y };
        });
      }
    }

    function performSingleTap(tapClientX: number, tapClientY: number) {
      const tapBounds = canvas!.getBoundingClientRect();
      const tapWorld = toWorldPoint(tapClientX - tapBounds.left, tapClientY - tapBounds.top);
      const stock = pickFunctions.pickStock(tapWorld.x, tapWorld.y);
      if (stock) {
        setSelectedStockCode(stock.code);
        setSelectedBoardName(stock.boardName);
        setSelectedSubBoardName(stock.subBoardName || null);
      } else {
        const subBoard = pickFunctions.pickSubBoard(tapWorld.x, tapWorld.y);
        if (subBoard) {
          setSelectedStockCode(null);
          setSelectedBoardName(subBoard.boardName);
          setSelectedSubBoardName(subBoard.name);
        } else {
          const board = pickFunctions.pickBoard(tapWorld.x, tapWorld.y);
          if (board) {
            setSelectedStockCode(null);
            setSelectedBoardName(board.name);
            setSelectedSubBoardName(null);
          }
        }
      }
    }

    function onTouchEnd(event: TouchEvent) {
      const state = touchStateRef.current;
      if (state.mode === "tap" && !state.moved && Date.now() - state.startTs < 350) {
        const now = Date.now();
        const sinceLastTap = now - state.lastTapTs;
        const tapDistance = Math.hypot(state.startClientX - state.lastTapX, state.startClientY - state.lastTapY);
        if (state.lastTapTs > 0 && sinceLastTap < 320 && tapDistance < 32) {
          // 双击 → 取消挂起的单击定时器，只执行切换板块筛选
          if (state.singleTapTimer !== null) {
            clearTimeout(state.singleTapTimer);
            state.singleTapTimer = null;
          }
          const bounds = canvas!.getBoundingClientRect();
          const world = toWorldPoint(state.startClientX - bounds.left, state.startClientY - bounds.top);
          const subBoardTitle = pickFunctions.pickSubBoardTitle(world.x, world.y);
          if (subBoardTitle) {
            toggleSubBoardFilter(subBoardTitle.name);
          } else {
            const boardTitle = pickFunctions.pickBoardTitle(world.x, world.y) ?? pickFunctions.pickBoard(world.x, world.y);
            if (boardTitle) {
              setBoardFilter((current) => current === boardTitle.name ? allBoardsValue : boardTitle.name);
            }
          }
          state.lastTapTs = 0;
          state.lastTapX = 0;
          state.lastTapY = 0;
          if (event.touches.length === 0) { state.mode = "idle"; state.moved = false; }
          return;
        }
        // 第一次 tap → 记录时间，延迟 320ms 执行选中
        // 如果在此期间来了第二次 tap（双击），定时器会被取消
        state.lastTapTs = now;
        state.lastTapX = state.startClientX;
        state.lastTapY = state.startClientY;
        // 保存当前 tap 的起始位置，避免被后续 touchStart 覆盖
        const tapStartClientX = state.startClientX;
        const tapStartClientY = state.startClientY;
        if (state.singleTapTimer !== null) {
          clearTimeout(state.singleTapTimer);
        }
        state.singleTapTimer = window.setTimeout(() => {
          state.singleTapTimer = null;
          performSingleTap(tapStartClientX, tapStartClientY);
        }, 320);
        if (event.touches.length === 0) { state.mode = "idle"; state.moved = false; }
        return;
      }
      if (event.touches.length === 0) { state.mode = "idle"; state.moved = false; return; }
      if (event.touches.length === 1 && state.mode === "pinch") {
        const touch = event.touches[0];
        state.mode = "pan";
        state.moved = true;
        state.startClientX = touch.clientX;
        state.startClientY = touch.clientY;
        state.lastClientX = touch.clientX;
        state.lastClientY = touch.clientY;
      }
    }

    // touchcancel：触摸被系统中断（如来电），不应触发任何 tap 操作
    function onTouchCancel() {
      const state = touchStateRef.current;
      if (state.singleTapTimer !== null) {
        clearTimeout(state.singleTapTimer);
        state.singleTapTimer = null;
      }
      state.mode = "idle";
      state.moved = false;
      state.lastTapTs = 0;
    }

    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: true });
    canvas.addEventListener("touchcancel", onTouchCancel, { passive: true });
    // 触摸状态对象挂载后不再更换（ref.current 始终是同一对象），捕获一份给清理函数，
    // 满足 react-hooks/exhaustive-deps 对 cleanup 读 ref 的静态检查
    const touchState = touchStateRef.current;
    return () => {
      // 组件卸载或依赖变化时，清理可能挂起的单击定时器
      if (touchState.singleTapTimer !== null) {
        clearTimeout(touchState.singleTapTimer);
        touchState.singleTapTimer = null;
      }
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [canvasRef, canvasSize.height, canvasSize.width, pickFunctions, toWorldPoint, toggleSubBoardFilter, touchStateRef, setView, setSelectedStockCode, setSelectedBoardName, setSelectedSubBoardName, setBoardFilter]);
}
