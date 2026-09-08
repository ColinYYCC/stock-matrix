"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { usePollWhileVisible } from "@/hooks/use-poll-while-visible";
import {
  type HeatmapPeriodKey,
  type MarketKey,
  type MarketOverviewResponse,
  type MarketSummary,
  type TreemapResponse,
} from "@/types/heatmap";

/** 交易时段轮询间隔：8 秒 */
export const tradingRefreshIntervalMs = 8000;
/** 非交易时段轮询间隔：60 秒（行情不会变化，低频刷新即可，主要避免 fallback 数据长期停留） */
export const idleRefreshIntervalMs = 60_000;

/** 热力图数据收发钩子返回的数据与状态 */
type HeatmapData = {
  treemapData: TreemapResponse | null;
  marketSummaries: Partial<Record<MarketKey, MarketSummary>>;
  loading: boolean;
  error: string | null;
  updatedAt: string;
};

/**
 * 热力图数据收发钩子：把「怎么拉、失败重试几次、新旧数据谁说了算」的规矩
 * 集中在一处（此前散在组件四个地方），组件只消费数据本身。
 *
 * 规矩清单：
 * - 首次加载 / 切换市场或周期：重试 2 次（指数退避），仍失败才报错
 * - 交易时段 8 秒 / 非交易时段 60 秒轮询（页面不可见时暂停，切回先刷一次）
 * - 新旧仲裁：旧 updatedAt 不覆盖新数据（防止 CDN 返回的 fallback 覆盖实时数据）
 * - URL 门闩：urlReady 之前不发任何请求（避免分享链接冷启动用默认参数白拉）
 * - 503 = fallback 数据，可接受；502+ 才算失败
 */
export function useHeatmapData(options: {
  market: MarketKey;
  period: HeatmapPeriodKey;
  /** URL 视图状态恢复完成前不发任何请求 */
  urlReady: boolean;
  /** 轮询间隔（毫秒），由调用方按交易时段算好传入 */
  pollIntervalMs: number;
  /** 拉取失败的报错文案 */
  loadErrorMessage: string;
  /** 首次加载开始时回调（切换市场/周期后组件用来清空 hover/选中状态） */
  onReloadStart?: () => void;
}): HeatmapData {
  const { market, period, urlReady, pollIntervalMs, loadErrorMessage, onReloadStart } = options;

  const [treemapData, setTreemapData] = useState<TreemapResponse | null>(null);
  const [marketSummaries, setMarketSummaries] = useState<Partial<Record<MarketKey, MarketSummary>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState("");
  /** 当前数据的 updatedAt（用 ref 在轮询回调中比较新旧） */
  const updatedAtRef = useRef("");
  useEffect(() => { updatedAtRef.current = updatedAt; }, [updatedAt]);
  /** treemapData 的 ref，轮询回调中判断是否有数据，避免在无数据时清除 error */
  const treemapDataRef = useRef<TreemapResponse | null>(null);
  useEffect(() => { treemapDataRef.current = treemapData; }, [treemapData]);

  // 回调存 ref：首次加载 effect 不依赖它，调用方不必用 useCallback 包裹也不会导致重跑
  const onReloadStartRef = useRef(onReloadStart);
  useEffect(() => { onReloadStartRef.current = onReloadStart; });

  /** 比较新旧 updatedAt，旧数据不覆盖新数据（防止 CDN fallback 覆盖实时数据） */
  function isDataNewer(newUpdatedAt: string): boolean {
    const current = updatedAtRef.current;
    if (!current) return true; // 首次加载，接受任何数据
    if (!newUpdatedAt) return false; // 新数据没有时间戳，不信任
    // 用 Date.getTime() 比较，避免不同时区格式（Z vs +08:00）的字符串比较错误
    const newTime = new Date(newUpdatedAt).getTime();
    const currentTime = new Date(current).getTime();
    if (!Number.isFinite(newTime)) return false;
    if (!Number.isFinite(currentTime)) return true;
    return newTime >= currentTime;
  }

  const fetchTreemap = useCallback(
    async (nextMarket: MarketKey, nextPeriod: HeatmapPeriodKey) => {
      const response = await fetch(`/api/heatmap/treemap?market=${nextMarket}&period=${nextPeriod}`);
      // 503 = fallback 数据，首次加载可以接受，但如果是 502+ 则报错
      if (!response.ok && response.status !== 503) throw new Error(loadErrorMessage);
      const payload = (await response.json()) as TreemapResponse;
      setTreemapData(payload);
      setUpdatedAt(payload.updatedAt);
      updatedAtRef.current = payload.updatedAt;
    },
    [loadErrorMessage]
  );

  const fetchMarketSummaries = useCallback(
    async (nextPeriod: HeatmapPeriodKey) => {
      const response = await fetch(`/api/heatmap/overview?period=${nextPeriod}`);
      if (!response.ok && response.status !== 503) throw new Error(loadErrorMessage);
      const payload = (await response.json()) as MarketOverviewResponse;
      const next: Partial<Record<MarketKey, MarketSummary>> = {};
      for (const item of payload.markets) {
        next[item.market] = { changePct: item.changePct, stockCount: item.stockCount, updatedAt: item.updatedAt };
      }
      setMarketSummaries(next);
    },
    [loadErrorMessage]
  );

  // ============ 首次加载 treemap 数据 ============
  // 以 urlReady 为门闩，等 URL 状态恢复完成后再发首次请求，
  // 避免带参分享链接冷启动时先用默认 all/day 白拉一至两次
  useEffect(() => {
    if (!urlReady) return;
    let cancelled = false;
    async function loadTreemap() {
      onReloadStartRef.current?.();
      setLoading(true);
      setError(null);
      const maxRetries = 2;
      const baseDelay = 800;
      let lastError = false;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (cancelled) break;
        try {
          await fetchTreemap(market, period);
          lastError = false;
          break;
        } catch (error) {
          // 明报失败原因，不静默吞掉
          console.warn("treemap 加载失败:", error);
          lastError = true;
          if (attempt < maxRetries && !cancelled) {
            await new Promise((resolve) => setTimeout(resolve, baseDelay * Math.pow(2, attempt)));
          }
        }
      }
      if (!cancelled) {
        if (lastError) setError(loadErrorMessage);
        setLoading(false);
      }
    }
    loadTreemap();
    return () => { cancelled = true; };
  }, [fetchTreemap, market, loadErrorMessage, period, urlReady]);

  // ============ 轮询 treemap 和概览 ============
  // 价格/涨跌幅的唯一来源是 treemap 接口（节点自带服务端实时值），
  // 原 quotes 通道已删除，从根上消除"两个数据源不一致导致价格跳变"的问题。
  usePollWhileVisible(
    useCallback(async () => {
      // URL 恢复完成前不发起轮询，避免用默认参数发请求
      if (!urlReady) return;
      try {
        // 静默刷新 treemapData，不触发 loading 状态和重置选中状态
        const response = await fetch(`/api/heatmap/treemap?market=${market}&period=${period}`);
        if (!response.ok && response.status !== 503) return;
        const payload = (await response.json()) as TreemapResponse;
        // 旧数据不覆盖新数据（防止 CDN 返回的 fallback 覆盖实时数据）
        if (!isDataNewer(payload.updatedAt)) return;
        setTreemapData(payload);
        setUpdatedAt(payload.updatedAt);
        updatedAtRef.current = payload.updatedAt;
        setError(null);
      } catch (error) {
        console.warn("treemap 轮询失败，保留现有数据:", error);
      }
    }, [market, period, urlReady]),
    pollIntervalMs,
  );

  usePollWhileVisible(
    useCallback(async () => {
      // URL 恢复完成前不发起轮询
      if (!urlReady) return;
      try {
        await fetchMarketSummaries(period);
        if (treemapDataRef.current) setError(null);
      } catch (error) {
        console.warn("概览轮询失败，保留现有数据:", error);
      }
    }, [fetchMarketSummaries, period, urlReady]),
    pollIntervalMs,
  );

  return { treemapData, marketSummaries, loading, error, updatedAt };
}
