"use client";

import { useEffect, useState } from "react";

import {
  allBoardsValue,
  allTrendsValue,
  isHeatmapPeriodKey,
  isMarketKey,
  risingOnlyValue,
  fallingOnlyValue,
  type HeatmapPeriodKey,
  type MarketKey,
} from "@/types/heatmap";

/**
 * URL 视图状态同步（P1-9：分享链接 / 刷新后保持视图）
 *
 * 从 market-heatmap.tsx 原样搬出（纯搬迁，逻辑未动）：
 * 视图状态（市场/周期/板块/子板块/涨跌筛选）进 URL；显示模式等设备偏好仍走 localStorage。
 *
 * - 挂载后先从 URL 恢复视图状态；非法值直接忽略（板块值由主组件的失效保护 effect 校验）
 * - 视图状态变化时写回 URL；默认值不写入，保持 URL 干净
 * - 返回 urlReady 门闩：恢复完成前调用方不该发数据请求（避免用默认参数白拉一两次）
 */
export function useUrlState(state: {
  market: MarketKey;
  period: HeatmapPeriodKey;
  boardFilter: string;
  subBoardFilter: string | null;
  trendFilter: string;
  setMarket: (market: MarketKey) => void;
  setPeriod: (period: HeatmapPeriodKey) => void;
  setBoardFilter: (value: string) => void;
  setSubBoardFilter: (value: string | null) => void;
  setTrendFilter: (value: string) => void;
}): boolean {
  const { market, period, boardFilter, subBoardFilter, trendFilter } = state;
  const { setMarket, setPeriod, setBoardFilter, setSubBoardFilter, setTrendFilter } = state;
  const [urlReady, setUrlReady] = useState(false);

  // 挂载后先从 URL 恢复视图状态；非法值直接忽略（板块值后续由失效保护 effect 校验）
  // 各 setter 均为主组件的 useState 派发器（引用稳定），effect 实际只在挂载时执行一次
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlMarket = params.get("market");
    const urlPeriod = params.get("period");
    const urlBoard = params.get("board");
    const urlSubBoard = params.get("subBoard");
    const urlTrend = params.get("trend");

    if (typeof urlMarket === "string" && isMarketKey(urlMarket)) setMarket(urlMarket);
    if (typeof urlPeriod === "string" && isHeatmapPeriodKey(urlPeriod)) setPeriod(urlPeriod);
    if (urlBoard) setBoardFilter(urlBoard);
    // 子板块筛选独立于板块筛选：主板（全部板块）下也能直接筛选子板块，
    // 因此 URL 可能只有 subBoard 没有 board
    if (urlSubBoard) setSubBoardFilter(urlSubBoard);
    if (urlTrend === risingOnlyValue || urlTrend === fallingOnlyValue) setTrendFilter(urlTrend);

    setUrlReady(true);
  }, [setMarket, setPeriod, setBoardFilter, setSubBoardFilter, setTrendFilter]);

  // 视图状态变化时写回 URL；默认值不写入，保持 URL 干净。
  // 用 replaceState：不产生历史记录、不触发 Next 导航。urlReady 门闩防止挂载时用
  // 还原前的默认值把 URL 里的参数清掉。
  useEffect(() => {
    if (!urlReady) return;
    const params = new URLSearchParams();
    if (market !== "all") params.set("market", market);
    if (period !== "day") params.set("period", period);
    if (boardFilter !== allBoardsValue) params.set("board", boardFilter);
    if (subBoardFilter) params.set("subBoard", subBoardFilter);
    if (trendFilter !== allTrendsValue) params.set("trend", trendFilter);
    const query = params.toString();
    window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
  }, [urlReady, market, period, boardFilter, subBoardFilter, trendFilter]);

  return urlReady;
}
