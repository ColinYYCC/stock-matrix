"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  Loader2,
  X,
  PanelLeftOpen,
} from "lucide-react";
import { toast } from "sonner";

import { Sidebar } from "@/components/sidebar";
import { Inspector, type InspectorStyle } from "@/components/inspector";
import { MobileStockSheet } from "@/components/mobile-stock-sheet";
import { ColorLegend } from "@/components/color-legend";
import { cn } from "@/lib/utils";
import { clamp } from "@/lib/format";
import { drawHeatmap, drawHeatmapHighlight, heatmapCanvasThemes } from "@/lib/canvas-render";
import { binaryTreemap } from "@/lib/treemap";
import { getMessages } from "@/lib/i18n";
import { usePollWhileVisible } from "@/hooks/use-poll-while-visible";
import { useTradingHours } from "@/hooks/use-trading-hours";
import { useIsMobile } from "@/hooks/use-is-mobile";
import {
  clampOffset,
  useCanvasInteraction,
  MIN_ZOOM,
  MAX_ZOOM,
} from "@/hooks/use-canvas-interaction";
import {
  isHeatmapPeriodKey,
  isMarketKey,
  allBoardsValue,
  allTrendsValue,
  fallingOnlyValue,
  risingOnlyValue,
  type BoardRect,
  type DisplayMode,
  type HeatmapPeriodKey,
  type Locale,
  type MarketKey,
  type MarketSummary,
  type PriceColorMode,
  type StockRect,
  type SubBoardRect,
  type TreemapResponse,
  type MarketOverviewResponse,
  type ViewState,
} from "@/types/heatmap";
import { SettingsDrawer, type SettingsTab } from "@/components/settings-drawer";
import { useDesignStyle } from "@/hooks/use-design-style";

// ============ 常量 ============

/** 交易时段轮询间隔：8 秒 */
const refreshIntervalMs = 8000;
/** 非交易时段轮询间隔：60 秒（行情不会变化，低频刷新即可，主要避免 fallback 数据长期停留） */
const idleRefreshIntervalMs = 60_000;
/** 平盘阈值 */
const flatThreshold = 0.1;
// ============ 工具函数 ============

/** 把股票代码 "600519.SH" 转成雪球格式 "SH600519" */
function toXueqiuSymbol(code: string) {
  const [symbol, market] = code.split(".");
  return `${market}${symbol}`;
}

/** 加权平均涨跌幅（用 API 快照值计算，跳过无数据的股票） */
function weightedAverageChange(
  stocks: ReadonlyArray<{ value: number; changePct: number }>
) {
  let weightedSum = 0;
  let totalValue = 0;
  for (const stock of stocks) {
    const changePct = stock.changePct;
    if (Number.isNaN(changePct)) continue; // 跳过无数据的股票
    weightedSum += changePct * stock.value;
    totalValue += stock.value;
  }
  return totalValue <= 0 ? 0 : weightedSum / totalValue;
}

/** 遍历股票列表，累计涨/平/跌家数与成交额（阈值 flatThreshold；无数据 NaN 落入平盘分支） */
function summarizeStocks(stocks: ReadonlyArray<{ changePct: number; turnoverAmount: number }>) {
  let advanceCount = 0;
  let flatCount = 0;
  let declineCount = 0;
  let turnoverAmount = 0;
  for (const stock of stocks) {
    const changePct = stock.changePct;
    if (changePct > flatThreshold) advanceCount += 1;
    else if (changePct < -flatThreshold) declineCount += 1;
    else flatCount += 1;
    turnoverAmount += stock.turnoverAmount;
  }
  return { advanceCount, flatCount, declineCount, turnoverAmount };
}

/** 按二级行业分组 */
function groupStocksBySubBoard<
  T extends { code: string; boardName: string; subBoardName: string; value: number; changePct: number },
>(stocks: T[]) {
  const subBoardMap = new Map<string, T[]>();
  for (const stock of stocks) {
    const key = stock.subBoardName || stock.boardName;
    const current = subBoardMap.get(key) ?? [];
    current.push(stock);
    subBoardMap.set(key, current);
  }
  return Array.from(subBoardMap.entries())
    .map(([name, children]) => ({
      name,
      boardName: children[0]?.boardName ?? "",
      stockCount: children.length,
      value: children.reduce((sum, child) => sum + child.value, 0),
      changePct: weightedAverageChange(children),
      children: [...children].sort((left, right) => right.value - left.value),
    }))
    .sort((left, right) => right.value - left.value);
}

// ============ 加载状态遮罩 ============

/** 加载中的骨架屏 */
function HeatmapLoadingOverlay({ displayMode, locale }: { displayMode: DisplayMode; locale: Locale }) {
  const isLightMode = displayMode === "light";
  const messages = getMessages(locale).heatmap;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 backdrop-blur-[10px]",
        isLightMode ? "bg-slate-50/92" : "bg-[#0a0d12]/92"
      )}
    >
      <div className="flex items-center gap-3">
        <Loader2 className="size-5 shrink-0 animate-spin text-brand" aria-hidden />
        <span className="text-[14px] font-semibold tracking-tight sm:text-base">{messages.loading}</span>
      </div>
    </div>
  );
}

// ============ 主组件 ============

/**
 * 股市矩阵主组件
 *
 * 负责状态管理、数据拉取、Canvas 绘制、交互事件处理。
 * 使用拆分后的子组件（Sidebar、Inspector、ColorLegend）来渲染 UI。
 */
export function MarketHeatmap({ locale }: { locale: Locale }) {
  // ============ Refs ============
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inspectorListRef = useRef<HTMLDivElement | null>(null);

  // ============ 基础状态 ============
  // 语言由服务端固定传入（当前仅中文），getMessages 返回同一对象引用，可安全作为依赖
  const messages = getMessages(locale).heatmap;
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("dark");
  const [priceColorMode, setPriceColorMode] = useState<PriceColorMode>("red-rise");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("appearance");
  const { designStyle, setDesignStyle } = useDesignStyle();

  // ============ 数据状态 ============
  const [market, setMarket] = useState<MarketKey>("all");
  const [period, setPeriod] = useState<HeatmapPeriodKey>("day");
  const [boardFilter, setBoardFilter] = useState(allBoardsValue);
  const [subBoardFilter, setSubBoardFilter] = useState<string | null>(null);
  const [trendFilter, setTrendFilter] = useState(allTrendsValue);
  const [marketSummaries, setMarketSummaries] = useState<Partial<Record<MarketKey, MarketSummary>>>({});
  const [treemapData, setTreemapData] = useState<TreemapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState("");
  /** 当前数据的 updatedAt（用 ref 在轮询回调中比较新旧） */
  const updatedAtRef = useRef("");
  useEffect(() => { updatedAtRef.current = updatedAt; }, [updatedAt]);
  /** treemapData 的 ref，轮询回调中判断是否有数据，避免在无数据时清除 error */
  const treemapDataRef = useRef<TreemapResponse | null>(null);
  useEffect(() => { treemapDataRef.current = treemapData; }, [treemapData]);

  // ============ 交互状态 ============
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 760 });
  const [view, setView] = useState<ViewState>({ scale: 1, x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sharePending, setSharePending] = useState(false);

  const [hoveredStockCode, setHoveredStockCode] = useState<string | null>(null);
  const [hoveredBoardName, setHoveredBoardName] = useState<string | null>(null);
  const [hoveredBoardTitleName, setHoveredBoardTitleName] = useState<string | null>(null);
  const [hoveredSubBoardName, setHoveredSubBoardName] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedStockCode, setSelectedStockCode] = useState<string | null>(null);
  const [selectedBoardName, setSelectedBoardName] = useState<string | null>(null);
  const [selectedSubBoardName, setSelectedSubBoardName] = useState<string | null>(null);

  // ============ 派生值 ============
  const isLightMode = displayMode === "light";
  const isIOS26 = designStyle === "ios26";
  const isMobile = useIsMobile();
  // Canvas 配色跟皮肤走：ios26 暗色与页面背景同色温（P1-12），classic 保持原紫色底
  const heatmapCanvasTheme = heatmapCanvasThemes[designStyle][displayMode];

  const activeStockCode = isMobile ? selectedStockCode : hoveredStockCode;
  const activeBoardName = isMobile ? selectedBoardName : hoveredBoardName;
  const activeSubBoardName = isMobile ? selectedSubBoardName : hoveredSubBoardName;

  // ============ Refs for layout ============
  const lastStockRectsRef = useRef<StockRect[]>([]);
  const lastBoardRectsRef = useRef<BoardRect[]>([]);
  const lastSubBoardRectsRef = useRef<SubBoardRect[]>([]);

  // ============ 交互 Hook ============
  const { toWorldPoint, pickFunctions, dragStateRef, touchStateRef } = useCanvasInteraction({
    view,
    stockRectsRef: lastStockRectsRef,
    boardRectsRef: lastBoardRectsRef,
    subBoardRectsRef: lastSubBoardRectsRef,
  });

  // ============ 加载用户偏好设置 ============
  useEffect(() => {
    try {
      const storedDisplayMode = window.localStorage.getItem("stock-matrix-display-mode");
      const storedPriceColor = window.localStorage.getItem("stock-matrix-price-color");
      if (storedDisplayMode === "dark" || storedDisplayMode === "light") setDisplayMode(storedDisplayMode);
      if (storedPriceColor === "red-rise" || storedPriceColor === "green-rise") setPriceColorMode(storedPriceColor);
    } catch { /* 偏好设置是可选的 */ } finally {
      setPreferencesReady(true);
    }
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;
    const isDark = displayMode === "dark";
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.style.colorScheme = isDark ? "dark" : "light";
    try { window.localStorage.setItem("stock-matrix-display-mode", displayMode); } catch { /* 可选 */ }
  }, [displayMode, preferencesReady]);

  useEffect(() => {
    if (!preferencesReady) return;
    try { window.localStorage.setItem("stock-matrix-price-color", priceColorMode); } catch { /* 可选 */ }
  }, [preferencesReady, priceColorMode]);

  // ============ URL 状态同步（P1-9：分享链接 / 刷新后保持视图） ============
  // 视图状态（市场/周期/板块/子板块/涨跌筛选）进 URL；显示模式等设备偏好仍走 localStorage。
  const [urlReady, setUrlReady] = useState(false);

  // 挂载后先从 URL 恢复视图状态；非法值直接忽略（板块值后续由失效保护 effect 校验）
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
    // 子板块只在指定了板块时才有意义，避免出现挂在"全部板块"下的无效筛选
    if (urlBoard && urlSubBoard) setSubBoardFilter(urlSubBoard);
    if (urlTrend === risingOnlyValue || urlTrend === fallingOnlyValue) setTrendFilter(urlTrend);

    setUrlReady(true);
  }, []);

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

  // ============ 尺寸监听 ============
  const refreshSize = useCallback(() => {
    const target = viewportRef.current;
    if (!target) return;
    const nextWidth = Math.max(1, Math.floor(target.clientWidth));
    const nextHeight = Math.max(1, Math.floor(target.clientHeight));
    setCanvasSize((current) => {
      if (current.width === nextWidth && current.height === nextHeight) return current;
      return { width: nextWidth, height: nextHeight };
    });
  }, []);

  useEffect(() => {
    refreshSize();
    const target = viewportRef.current;
    const resizeObserver = target && typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => refreshSize()) : null;
    if (resizeObserver && target) resizeObserver.observe(target);
    window.addEventListener("resize", refreshSize, { passive: true });
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", refreshSize);
    };
  }, [refreshSize]);

  useEffect(() => { refreshSize(); }, [isFullscreen, refreshSize]);

  useEffect(() => {
    document.documentElement.classList.add("matrix-page-active");
    document.body.classList.add("matrix-page-active");
    return () => {
      document.documentElement.classList.remove("matrix-page-active");
      document.body.classList.remove("matrix-page-active");
    };
  }, []);

  // ============ 数据拉取 ============
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
      if (!response.ok && response.status !== 503) throw new Error(messages.errorLoad);
      const payload = (await response.json()) as TreemapResponse;
      setTreemapData(payload);
      setUpdatedAt(payload.updatedAt);
      updatedAtRef.current = payload.updatedAt;
    },
    [messages.errorLoad]
  );

  const fetchMarketSummaries = useCallback(async (nextPeriod: HeatmapPeriodKey) => {
    const response = await fetch(`/api/heatmap/overview?period=${nextPeriod}`);
    if (!response.ok && response.status !== 503) throw new Error(messages.errorLoad);
    const payload = (await response.json()) as MarketOverviewResponse;
    const next: Partial<Record<MarketKey, MarketSummary>> = {};
    for (const item of payload.markets) {
      next[item.market] = { changePct: item.changePct, stockCount: item.stockCount, updatedAt: item.updatedAt };
    }
    setMarketSummaries(next);
  }, [messages.errorLoad]);

  // ============ 加载 treemap 数据 ============
  // 首次加载带重试：Serverless 冷启动时第一次请求可能失败，重试 2 次后仍失败才报错
  useEffect(() => {
    let cancelled = false;
    async function loadTreemap() {
      setLoading(true);
      setError(null);
      setHoveredStockCode(null);
      setHoveredBoardName(null);
      setHoveredBoardTitleName(null);
      setHoveredSubBoardName(null);
      setSelectedStockCode(null);
      setSelectedBoardName(null);
      setSelectedSubBoardName(null);
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
          // 审计 Q1：明报失败原因，不再静默吞掉
          console.warn("treemap 加载失败:", error);
          lastError = true;
          if (attempt < maxRetries && !cancelled) {
            await new Promise((r) => setTimeout(r, baseDelay * Math.pow(2, attempt)));
          }
        }
      }
      if (!cancelled) {
        if (lastError) setError(messages.errorLoad);
        setLoading(false);
      }
    }
    loadTreemap();
    return () => { cancelled = true; };
  }, [fetchTreemap, market, messages.errorLoad, period]);

  // ============ 交易时段判断 ============
  const isTrading = useTradingHours();
  // 交易时段 8 秒刷新，非交易时段 60 秒低频刷新
  // 非交易时段仍保持轮询，确保 fallback 数据被及时替换为实时数据
  const pollInterval = isTrading ? refreshIntervalMs : idleRefreshIntervalMs;

  // ============ 轮询 treemap 和概览 ============
  // 审计 A1：价格/涨跌幅的唯一来源是 treemap 接口（节点自带服务端实时值），
  // 原 quotes 通道已删除，从根上消除"两个数据源不一致导致价格跳变"的问题。
  usePollWhileVisible(
    useCallback(async () => {
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
    }, [market, period]),
    pollInterval,
  );

  usePollWhileVisible(
    useCallback(async () => {
      try { await fetchMarketSummaries(period); if (treemapDataRef.current) setError(null); } catch (error) { console.warn("概览轮询失败，保留现有数据:", error); }
    }, [fetchMarketSummaries, period]),
    pollInterval,
  );

  // ============ 筛选 ============
  useEffect(() => {
    if (!treemapData || boardFilter === allBoardsValue) return;
    if (!treemapData.nodes.some((node) => node.name === boardFilter)) setBoardFilter(allBoardsValue);
  }, [boardFilter, treemapData]);

  // 子板块筛选失效保护：板块切换后，如果当前子板块不存在于新板块中，则重置
  useEffect(() => {
    if (!subBoardFilter || !treemapData || boardFilter === allBoardsValue) return;
    const board = treemapData.nodes.find((node) => node.name === boardFilter);
    if (!board) { setSubBoardFilter(null); return; }
    if (!board.children.some((stock) => (stock.subBoardName || stock.boardName) === subBoardFilter)) {
      setSubBoardFilter(null);
    }
  }, [boardFilter, subBoardFilter, treemapData]);

  useEffect(() => {
    setHoveredStockCode(null);
    setHoveredBoardName(null);
    setHoveredBoardTitleName(null);
    setHoveredSubBoardName(null);
    setSelectedStockCode(null);
    setSelectedBoardName(null);
    setSelectedSubBoardName(null);
    setSubBoardFilter(null);
    setView({ scale: 1, x: 0, y: 0 });
  }, [boardFilter, trendFilter]);

  // ============ 视图偏移修正 ============
  useEffect(() => {
    setView((current) => {
      if (current.scale <= 1) return current.x === 0 && current.y === 0 ? current : { scale: 1, x: 0, y: 0 };
      const nextOffset = clampOffset(canvasSize.width, canvasSize.height, current.scale, current.x, current.y);
      if (nextOffset.x === current.x && nextOffset.y === current.y) return current;
      return { ...current, x: nextOffset.x, y: nextOffset.y };
    });
  }, [canvasSize.height, canvasSize.width]);

  // ============ 筛选后的 treemap 数据（不依赖实时行情，用 API 快照值做筛选） ============
  // 性能优化：筛选逻辑只用 stock.changePct（API 快照），不用实时 quotes
  // 这样行情刷新不会触发筛选重算，进而不会触发位置重算
  const visibleTreemapData = useMemo<TreemapResponse | null>(() => {
    if (!treemapData) return treemapData;

    let result = treemapData;

    // 板块筛选
    if (boardFilter !== allBoardsValue) {
      const selectedBoard = result.nodes.find((node) => node.name === boardFilter);
      if (selectedBoard) {
        result = {
          ...result,
          stockCount: selectedBoard.stockCount,
          boardCount: 1,
          // 注意：turnoverPreviousAmount 和 turnoverDelta 保留原始值，
          // 非全市场范围下为 NaN，前端会显示"无对比"而非误显示"持平"
          summary: { ...result.summary, ...summarizeStocks(selectedBoard.children), indexChangePct: weightedAverageChange(selectedBoard.children) },
          nodes: [selectedBoard],
        };
      }
    }

    // 子板块筛选：在大板块筛选基础上，进一步只保留该子板块下的股票
    if (boardFilter !== allBoardsValue && subBoardFilter) {
      const board = result.nodes.find((node) => node.name === boardFilter);
      if (board) {
        const subChildren = board.children.filter((stock) => (stock.subBoardName || stock.boardName) === subBoardFilter);
        if (subChildren.length > 0) {
          const subBoardNode = {
            ...board,
            children: subChildren,
            stockCount: subChildren.length,
            value: subChildren.reduce((sum, stock) => sum + stock.value, 0),
          };
          result = {
            ...result,
            stockCount: subChildren.length,
            boardCount: 1,
            summary: { ...result.summary, ...summarizeStocks(subChildren), indexChangePct: weightedAverageChange(subChildren) },
            nodes: [subBoardNode],
          };
        }
      }
    }

    // 涨跌筛选
    if (trendFilter !== allTrendsValue) {
      const filteredNodes = result.nodes.map((node) => {
        const filteredChildren = node.children.filter((stock) => {
          const changePct = stock.changePct;
          if (trendFilter === risingOnlyValue) return changePct > flatThreshold;
          if (trendFilter === fallingOnlyValue) return changePct < -flatThreshold;
          return true;
        });
        return { ...node, children: filteredChildren, stockCount: filteredChildren.length, value: filteredChildren.reduce((sum, stock) => sum + stock.value, 0) };
      }).filter((node) => node.children.length > 0);

      const filteredStocks = filteredNodes.flatMap((node) => node.children);
      result = { ...result, stockCount: filteredStocks.length, boardCount: filteredNodes.length, summary: { ...result.summary, ...summarizeStocks(filteredStocks) }, nodes: filteredNodes };
    }

    return result;
  }, [boardFilter, subBoardFilter, trendFilter, treemapData]);

  // 侧边栏概览直接用 treemap 接口返回的 summary（审计 A1：数据同源，无需前端重算）

  // ============ 树图布局：位置计算（依赖 treemap 数据和画布尺寸） ============
  // treemapData 每 8s 轮询刷新，服务端会用实时价格重算流通市值（value），
  // 所以行情刷新时色块大小会跟着变化。binaryTreemap 只在 visibleTreemapData
  // 或画布尺寸变化时重算，不依赖前端 quotes。
  const layoutPositions = useMemo(() => {
    if (!visibleTreemapData) {
      return { stockRects: [] as StockRect[], boardRects: [] as BoardRect[], subBoardRects: [] as SubBoardRect[] };
    }

    const boardRects: BoardRect[] = [];
    const subBoardRects: SubBoardRect[] = [];
    const stockRects: StockRect[] = [];

    const boardBoxes = binaryTreemap(
      visibleTreemapData.nodes.map((board) => ({ item: board, value: board.value })),
      0, 0, canvasSize.width, canvasSize.height, 6
    );

    // 板块标题栏涨跌幅直接用 API 快照值（服务端已按实时行情算好）
    for (const boardBox of boardBoxes) {
      const boardChangePct = weightedAverageChange(boardBox.item.children);
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
          boardBox.item.children.map((stock) => ({ item: stock, value: stock.value })),
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
        subBoards.map((subBoard) => ({ item: subBoard, value: subBoard.value })),
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
          subBoardBox.item.children.map((stock) => ({ item: stock, value: stock.value })),
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
    // 只依赖 treemap API 返回的数据（含服务端算好的实时市值和涨跌幅）
  }, [canvasSize.height, canvasSize.width, subBoardFilter, visibleTreemapData]);

  useEffect(() => {
    lastStockRectsRef.current = layoutPositions.stockRects;
    lastBoardRectsRef.current = layoutPositions.boardRects;
    lastSubBoardRectsRef.current = layoutPositions.subBoardRects;
  }, [layoutPositions.boardRects, layoutPositions.stockRects, layoutPositions.subBoardRects]);

  // ============ 悬浮命中 ============
  const activeStock = useMemo(() => {
    if (!activeStockCode) return null;
    return layoutPositions.stockRects.find((stock) => stock.code === activeStockCode) ?? null;
  }, [activeStockCode, layoutPositions.stockRects]);

  const highlightedStock = useMemo(() => {
    if (activeStock) return activeStock;
    if (!activeBoardName) return null;
    return layoutPositions.stockRects.find((stock) => stock.boardName === activeBoardName) ?? null;
  }, [activeBoardName, activeStock, layoutPositions.stockRects]);

  const activeBoardRect = useMemo(() => {
    if (!activeBoardName) return null;
    return layoutPositions.boardRects.find((board) => board.name === activeBoardName) ?? null;
  }, [activeBoardName, layoutPositions.boardRects]);

  const activeSubBoardRect = useMemo(() => {
    if (!activeBoardName || !activeSubBoardName) return null;
    return layoutPositions.subBoardRects.find((sub) => sub.name === activeSubBoardName && sub.boardName === activeBoardName) ?? null;
  }, [activeBoardName, activeSubBoardName, layoutPositions.subBoardRects]);

  const activeBoardStocks = useMemo(() => {
    if (!activeBoardName || !visibleTreemapData) return [];
    const board = visibleTreemapData.nodes.find((node) => node.name === activeBoardName);
    if (!board) return [];
    // treemap 节点自带服务端实时价格/涨跌幅，无需再合并 quotes
    return board.children
      .map((stock) => {
        return { code: stock.code, name: stock.name, subBoardName: stock.subBoardName, price: stock.price, changePct: stock.changePct };
      })
      .sort((left, right) => Math.abs(right.changePct) - Math.abs(left.changePct));
  }, [activeBoardName, visibleTreemapData]);

  const inspectorStocks = useMemo(() => {
    if (activeBoardStocks.length === 0) return [];
    if (!highlightedStock) return activeBoardStocks.map((stock) => ({ ...stock, active: false }));
    const current = activeBoardStocks.find((stock) => stock.code === highlightedStock.code) ?? {
      code: highlightedStock.code, name: highlightedStock.name, subBoardName: highlightedStock.subBoardName, price: highlightedStock.price, changePct: highlightedStock.changePct,
    };
    const rest = activeBoardStocks.filter((stock) => stock.code !== highlightedStock.code);
    return [{ ...current, active: true }, ...rest.map((stock) => ({ ...stock, active: false }))];
  }, [activeBoardStocks, highlightedStock]);

  const activeInspectorStock = inspectorStocks[0] ?? null;
  const activeInspectorTitle = useMemo(() => {
    if (!activeBoardName) return activeBoardName;
    const subBoardName = highlightedStock?.subBoardName || activeSubBoardName || subBoardFilter;
    if (subBoardName && subBoardName !== activeBoardName) return `${activeBoardName} - ${subBoardName}`;
    return activeBoardName;
  }, [activeBoardName, highlightedStock, activeSubBoardName, subBoardFilter]);

  // ============ 移动端个股详情面板的回调 ============
  // 打开雪球页面查看更多详情
  const openXueqiuForStock = useCallback((code: string) => {
    window.open(`https://xueqiu.com/S/${toXueqiuSymbol(code)}`, "_blank", "noopener,noreferrer");
  }, []);

  // 关闭移动端详情面板时清空选中状态
  const closeMobileSheet = useCallback(() => {
    setSelectedStockCode(null);
    setSelectedBoardName(null);
    setSelectedSubBoardName(null);
  }, []);

  // 切换子板块筛选（双击子板块标题栏时调用）
  const toggleSubBoardFilter = useCallback((subName: string) => {
    setSubBoardFilter((current) => current === subName ? null : subName);
  }, []);

  // ============ 悬浮面板定位 ============
  const inspectorStyle = useMemo<InspectorStyle>(() => {
    if (isMobile) return null;
    if (!activeBoardRect || inspectorStocks.length === 0) return null;

    const gutter = 12;
    const maxPopupWidth = Math.max(320, canvasSize.width - gutter * 2);
    const preferredWidth = canvasSize.width >= 1360 ? 452 : canvasSize.width >= 1100 ? 432 : 408;
    const popupWidth = Math.min(maxPopupWidth, preferredWidth);
    const popupHeightEstimate = Math.min(620, Math.max(350, Math.floor(canvasSize.height * 0.7)));

    const toScreenRect = (rect: { x: number; y: number; width: number; height: number }) => {
      const screenLeft = rect.x * view.scale + view.x;
      const screenTop = rect.y * view.scale + view.y;
      const screenRight = (rect.x + rect.width) * view.scale + view.x;
      return { left: screenLeft, top: screenTop, right: screenRight };
    };

    const boardScreen = toScreenRect(activeBoardRect);
    const boardFitsRight = boardScreen.right + gutter + popupWidth <= canvasSize.width - gutter;
    const boardFitsLeft = boardScreen.left - gutter - popupWidth >= gutter;

    const anchorRect = !boardFitsRight && !boardFitsLeft ? activeStock ?? activeSubBoardRect ?? activeBoardRect : activeBoardRect;
    const anchorScreen = toScreenRect(anchorRect);

    const fitsRight = anchorScreen.right + gutter + popupWidth <= canvasSize.width - gutter;
    const fitsLeft = anchorScreen.left - gutter - popupWidth >= gutter;

    let desiredLeft: number;
    if (fitsRight) desiredLeft = anchorScreen.right + gutter;
    else if (fitsLeft) desiredLeft = anchorScreen.left - popupWidth - gutter;
    else {
      const spaceLeft = anchorScreen.left;
      const spaceRight = canvasSize.width - anchorScreen.right;
      desiredLeft = spaceRight >= spaceLeft ? canvasSize.width - popupWidth - gutter : gutter;
    }

    const left = clamp(desiredLeft, gutter, Math.max(gutter, canvasSize.width - popupWidth - gutter));
    const top = clamp(anchorScreen.top, gutter, Math.max(gutter, canvasSize.height - popupHeightEstimate - gutter));
    const maxHeight = Math.max(220, canvasSize.height - top - gutter);

    return { left, top, width: popupWidth, maxHeight };
  }, [canvasSize.height, canvasSize.width, activeBoardRect, activeStock, activeSubBoardRect, inspectorStocks.length, isMobile, view.scale, view.x, view.y]);

  // ============ 悬浮面板键盘滚动 ============
  // 悬浮面板设了 pointer-events-none（让鼠标穿透到下面的画布），所以鼠标滚轮滚不动列表。
  // 这里监听键盘 ↑/↓ 或 J/K 来滚动列表，和 i18n 提示文案「↑/↓ 或 J/K 可滚动详情列表」对应。
  useEffect(() => {
    if (!inspectorStyle || inspectorStocks.length === 0) return;

    function onKeyDown(event: KeyboardEvent) {
      // 按住 Alt/Ctrl/Meta 时不拦截，让浏览器快捷键正常工作
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      // 如果焦点在输入框、文本域等可编辑元素上，不拦截键盘事件
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      if (target?.isContentEditable || tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") return;

      const list = inspectorListRef.current;
      if (!list) return;

      const pageStep = Math.max(120, list.clientHeight * 0.82);
      let handled = true;
      let top = list.scrollTop;

      switch (event.key) {
        case "ArrowDown":
        case "j":
        case "J":
          top += 56;
          break;
        case "ArrowUp":
        case "k":
        case "K":
          top -= 56;
          break;
        case "PageDown":
          top += pageStep;
          break;
        case "PageUp":
          top -= pageStep;
          break;
        case "Home":
          top = 0;
          break;
        case "End":
          top = list.scrollHeight;
          break;
        default:
          handled = false;
      }

      if (!handled) return;

      event.preventDefault();
      list.scrollTo({
        top: clamp(top, 0, Math.max(0, list.scrollHeight - list.clientHeight)),
        behavior: "smooth",
      });
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [inspectorStocks.length, inspectorStyle]);

  // ============ Canvas 绘制（离屏缓存 + requestAnimationFrame） ============
  // 性能优化：
  // 1. 把完整热力图（不含高亮）画到离屏 canvas，只在数据/布局/视图变化时重绘
  // 2. 鼠标悬停只改变高亮时，直接从离屏复制 + 画高亮，不重画 5443 个色块
  const drawFrameRef = useRef<number | null>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const baseDirtyRef = useRef(true);

  // 非高亮依赖变化时，标记离屏底图需要重绘
  useEffect(() => {
    baseDirtyRef.current = true;
  }, [canvasSize.height, canvasSize.width, heatmapCanvasTheme, layoutPositions.boardRects, layoutPositions.stockRects, layoutPositions.subBoardRects, priceColorMode, view.scale, view.x, view.y]);

  useEffect(() => {
    // 取消上一帧还没执行的绘制（多次状态变化合并成一次绘制）
    if (drawFrameRef.current !== null) {
      cancelAnimationFrame(drawFrameRef.current);
    }
    drawFrameRef.current = requestAnimationFrame(() => {
      drawFrameRef.current = null;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext("2d");
      if (!context) return;

      const pixelRatio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
      const targetWidth = Math.floor(canvasSize.width * pixelRatio);
      const targetHeight = Math.floor(canvasSize.height * pixelRatio);

      // 离屏 canvas：只在底图脏时重绘（不含高亮）
      const offscreen = offscreenRef.current ?? (offscreenRef.current = document.createElement("canvas"));
      if (baseDirtyRef.current) {
        baseDirtyRef.current = false;
        offscreen.width = targetWidth;
        offscreen.height = targetHeight;
        const offCtx = offscreen.getContext("2d");
        if (!offCtx) return;
        drawHeatmap({
          context: offCtx, canvasWidth: canvasSize.width, canvasHeight: canvasSize.height, pixelRatio, view,
          theme: heatmapCanvasTheme, priceColorMode,
          stockRects: layoutPositions.stockRects, boardRects: layoutPositions.boardRects, subBoardRects: layoutPositions.subBoardRects,
        });
      }

      // 把离屏底图复制到可见 canvas
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        canvas.style.width = `${canvasSize.width}px`;
        canvas.style.height = `${canvasSize.height}px`;
      }
      context.drawImage(offscreen, 0, 0);

      // 在底图上画高亮（只画描边，不重画色块）
      if (highlightedStock || activeBoardRect || activeSubBoardRect) {
        drawHeatmapHighlight({
          context, pixelRatio, view, theme: heatmapCanvasTheme,
          highlightedStock, activeBoardRect, activeSubBoardRect,
        });
      }
    });
    return () => {
      if (drawFrameRef.current !== null) {
        cancelAnimationFrame(drawFrameRef.current);
        drawFrameRef.current = null;
      }
    };
  }, [
    canvasSize.height, canvasSize.width, heatmapCanvasTheme, layoutPositions.boardRects, layoutPositions.stockRects, layoutPositions.subBoardRects, priceColorMode, view.scale, view.x, view.y,
    highlightedStock, activeBoardRect, activeSubBoardRect,
  ]);

  // ============ 鼠标事件 ============
  const onMouseMove = useCallback((event: ReactMouseEvent<HTMLCanvasElement>) => {
    if (isMobile) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const pointerX = event.clientX - bounds.left;
    const pointerY = event.clientY - bounds.top;

    // 拖拽平移
    if (dragStateRef.current.active) {
      const deltaX = event.clientX - dragStateRef.current.pointerX;
      const deltaY = event.clientY - dragStateRef.current.pointerY;
      dragStateRef.current.pointerX = event.clientX;
      dragStateRef.current.pointerY = event.clientY;
      setView((current) => {
        const nextOffset = clampOffset(canvasSize.width, canvasSize.height, current.scale, current.x + deltaX, current.y + deltaY);
        if (nextOffset.x === current.x && nextOffset.y === current.y) return current;
        return { ...current, x: nextOffset.x, y: nextOffset.y };
      });
      return;
    }

    // 命中检测：同步执行，省掉一帧 rAF 延迟，让悬停更跟手
    // React 18 会自动批量事件处理器内的 setState，4 次 setState 只触发一次重渲染
    const world = toWorldPoint(pointerX, pointerY);
    const stock = pickFunctions.pickStock(world.x, world.y);
    const boardTitle = stock ? null : pickFunctions.pickBoardTitle(world.x, world.y);
    const subBoard = stock ? { name: stock.subBoardName, boardName: stock.boardName } : pickFunctions.pickSubBoard(world.x, world.y);
    const board = stock ? { name: stock.boardName } : subBoard ? { name: subBoard.boardName } : pickFunctions.pickBoard(world.x, world.y);

    setHoveredStockCode(stock?.code ?? null);
    setHoveredBoardName(board?.name ?? null);
    setHoveredBoardTitleName(boardTitle?.name ?? null);
    setHoveredSubBoardName(subBoard?.name || null);
  }, [canvasSize.height, canvasSize.width, isMobile, pickFunctions, toWorldPoint, dragStateRef]);

  const onMouseDown = useCallback((event: ReactMouseEvent<HTMLCanvasElement>) => {
    if (isMobile || view.scale <= 1) return;
    event.preventDefault();
    dragStateRef.current.active = true;
    dragStateRef.current.pointerX = event.clientX;
    dragStateRef.current.pointerY = event.clientY;
    setIsPanning(true);
  }, [isMobile, view.scale, dragStateRef]);

  const onMouseUp = useCallback(() => {
    dragStateRef.current.active = false;
    setIsPanning(false);
  }, [dragStateRef]);

  const onMouseLeave = useCallback(() => {
    dragStateRef.current.active = false;
    setIsPanning(false);
    if (!isMobile) {
      setHoveredStockCode(null);
      setHoveredBoardName(null);
      setHoveredBoardTitleName(null);
      setHoveredSubBoardName(null);
    }
  }, [isMobile, dragStateRef]);

  // ============ 滚轮缩放 ============
  // React 19 对 wheel 事件使用被动监听（passive listener），合成事件里 preventDefault 无效
  // 改用原生事件监听器，设置 passive: false 确保 preventDefault 生效
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function handleWheel(event: WheelEvent) {
      event.preventDefault();
      const bounds = canvas!.getBoundingClientRect();
      const cursorX = event.clientX - bounds.left;
      const cursorY = event.clientY - bounds.top;
      setView((current) => {
        const step = event.deltaY < 0 ? 0.16 : -0.16;
        const nextScale = clamp(current.scale + step, MIN_ZOOM, MAX_ZOOM);
        if (nextScale === current.scale) return current;
        const worldX = (cursorX - current.x) / current.scale;
        const worldY = (cursorY - current.y) / current.scale;
        const rawX = cursorX - worldX * nextScale;
        const rawY = cursorY - worldY * nextScale;
        const nextOffset = clampOffset(canvasSize.width, canvasSize.height, nextScale, rawX, rawY);
        return { scale: nextScale, x: nextOffset.x, y: nextOffset.y };
      });
    }

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [canvasSize.height, canvasSize.width]);

  const onDoubleClick = useCallback((event: ReactMouseEvent<HTMLCanvasElement>) => {
    if (isMobile) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const world = toWorldPoint(event.clientX - bounds.left, event.clientY - bounds.top);

    const boardTitle = pickFunctions.pickBoardTitle(world.x, world.y);
    if (boardTitle) {
      setBoardFilter((current) => current === boardTitle.name ? allBoardsValue : boardTitle.name);
      return;
    }
    const subBoardTitle = pickFunctions.pickSubBoardTitle(world.x, world.y);
    if (subBoardTitle) {
      toggleSubBoardFilter(subBoardTitle.name);
      return;
    }
    const stock = pickFunctions.pickStock(world.x, world.y);
    if (!stock) return;
    window.open(`https://xueqiu.com/S/${toXueqiuSymbol(stock.code)}`, "_blank", "noopener,noreferrer");
  }, [isMobile, pickFunctions, toWorldPoint, toggleSubBoardFilter]);

  // ============ 触摸事件 ============
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
    return () => {
      // 组件卸载或依赖变化时，清理可能挂起的单击定时器
      if (touchStateRef.current.singleTapTimer !== null) {
        clearTimeout(touchStateRef.current.singleTapTimer);
        touchStateRef.current.singleTapTimer = null;
      }
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [canvasSize.height, canvasSize.width, pickFunctions, toWorldPoint, toggleSubBoardFilter, touchStateRef]);

  // ============ 全屏 ============
  useEffect(() => {
    if (!isFullscreen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsFullscreen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFullscreen]);

  useEffect(() => {
    if (!isFullscreen) return;
    toast(isMobile ? messages.fullscreenToastMobile : messages.fullscreenToast, { id: "matrix-fullscreen-hint", duration: 3200 });
  }, [isFullscreen, isMobile, messages.fullscreenToast, messages.fullscreenToastMobile]);

  // ============ 截图分享 ============
  const createSharePreview = useCallback(async () => {
    const sourceCanvas = canvasRef.current;
    if (!sourceCanvas) return;
    setSharePending(true);
    try {
      const pixelRatio = sourceCanvas.width / Math.max(1, canvasSize.width);
      const cssHorizontalPadding = clamp(canvasSize.width * 0.015, 12, 22);
      const cssTopPadding = 30;
      const cssBottomPadding = 18;
      const horizontalPadding = cssHorizontalPadding * pixelRatio;
      const topPadding = cssTopPadding * pixelRatio;
      const bottomPadding = cssBottomPadding * pixelRatio;
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = Math.round(sourceCanvas.width + horizontalPadding * 2);
      exportCanvas.height = Math.round(sourceCanvas.height + topPadding + bottomPadding);
      const context = exportCanvas.getContext("2d");
      if (!context) throw new Error("Preview context unavailable");
      const background = context.createLinearGradient(0, 0, exportCanvas.width, exportCanvas.height);
      background.addColorStop(0, isLightMode ? "#f8fafc" : "#151922");
      background.addColorStop(1, isLightMode ? "#e9eef5" : "#0f1319");
      context.fillStyle = background;
      context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
      context.drawImage(sourceCanvas, horizontalPadding, topPadding);

      const blob = await new Promise<Blob>((resolve, reject) => {
        exportCanvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Failed to export canvas"));
        }, "image/png");
      });
      const url = URL.createObjectURL(blob);
      const stamp = updatedAt ? updatedAt.replace(/[:T]/g, "-").slice(0, 19) : Date.now().toString();
      const filename = `stock-matrix-${market}-${period}-${stamp}.png`;
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      // 审计 Q2：慢设备上 1s 就 revoke 可能导致下载尚未开始就被撤销，放宽到 10s
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      toast.error(messages.shareFailed, { id: "matrix-share-generate", duration: 3200 });
    } finally {
      setSharePending(false);
    }
  }, [canvasSize.width, isLightMode, market, messages, period, updatedAt]);

  // ============ 渲染 ============
  const areaTipMessage = messages.tipAreaMarketCap;
  const inspectorListMaxHeight = inspectorStyle ? Math.max(170, inspectorStyle.maxHeight - 292) : 170;

  return (
    <div
      className={cn(
        "relative min-h-0",
        isIOS26 ? "" : "bg-background",
        isFullscreen ? "fixed inset-0 z-[9999]" : "flex min-h-0 flex-1 flex-col"
      )}
    >
      <div
        className={cn(
          "grid min-h-0",
          isFullscreen ? "h-full" : "min-h-0 flex-1",
          isIOS26 && !isFullscreen ? "gap-2 p-2" : "",
          isFullscreen
            ? "grid-cols-[1fr]"
            : "grid-cols-[1fr] grid-rows-[minmax(0,1fr)_auto] md:grid-cols-[148px_minmax(0,1fr)] lg:grid-cols-[162px_minmax(0,1fr)]"
        )}
      >
        <Sidebar
          messages={messages}
          locale={locale}
          market={market}
          period={period}
          designStyle={designStyle}
          boardFilter={boardFilter}
          trendFilter={trendFilter}
          priceColorMode={priceColorMode}
          marketSummaries={marketSummaries}
          treemapData={treemapData}
          marketOverview={visibleTreemapData?.summary ?? null}
          updatedAt={updatedAt}
          isTrading={isTrading}
          sidebarOpen={sidebarOpen}
          isFullscreen={isFullscreen}
          onMarketChange={(m) => { setMarket(m); if (isMobile) setSidebarOpen(false); }}
          onPeriodChange={setPeriod}
          onBoardFilterChange={(v) => { setBoardFilter(v); setSubBoardFilter(null); if (isMobile) setSidebarOpen(false); }}
          subBoardFilter={subBoardFilter}
          onSubBoardFilterChange={setSubBoardFilter}
          onTrendFilterChange={setTrendFilter}
          onResetView={() => setView({ scale: 1, x: 0, y: 0 })}
          onToggleFullscreen={() => setIsFullscreen((c) => !c)}
          onOpenSettings={() => setSettingsOpen(true)}
          onCloseSidebar={() => setSidebarOpen(false)}
        />

        {/* Canvas 区域 */}
        <div
          className={cn(
            "relative min-h-0 overflow-hidden",
            // 圆角与画布内板块的圆角（10px）一致：贴边板块的角才不会被容器的大弧咬掉
            isIOS26 && !isFullscreen ? "rounded-[10px] border border-[var(--ios26-glass-border)]" : "",
            isIOS26 ? "" : isLightMode ? "bg-gradient-to-br from-slate-100 to-slate-200" : "bg-gradient-to-br from-[#1a1722] to-[#0f0d16]",
            isFullscreen ? "col-start-1 h-full" : "col-start-1 row-start-1 md:col-start-2"
          )}
          style={isIOS26 ? { background: "linear-gradient(135deg, var(--ios26-bg-start), var(--ios26-bg-end)), var(--ios26-blobs)" } : undefined}
        >
          <div
            ref={viewportRef}
            className={cn("relative h-full min-h-0 overflow-hidden", isIOS26 ? "" : isLightMode ? "bg-gradient-to-br from-slate-100 to-slate-200" : "bg-gradient-to-br from-[#1a1722] to-[#0f0d16]")}
          >
            {isFullscreen && isMobile && (
              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                className={cn(
                  "absolute right-3 top-3 z-50 inline-flex size-11 items-center justify-center rounded-full transition-colors",
                  isIOS26 ? "ios26-glass-float text-white" : "border border-slate-500/70 bg-black/50 text-white shadow-[0_10px_24px_rgba(0,0,0,0.28)] backdrop-blur-sm hover:bg-black/70"
                )}
                aria-label={messages.exitFullscreen}
              >
                <X className="size-4" />
              </button>
            )}

            {!isFullscreen && !sidebarOpen && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                aria-label={messages.expandSidebar}
                className={cn(
                  "absolute bottom-3 left-3 z-30 inline-flex size-11 items-center justify-center rounded-full transition-colors md:hidden",
                  isIOS26 ? "ios26-glass-float text-white" : "border border-slate-500/70 bg-black/50 text-white shadow-[0_10px_24px_rgba(0,0,0,0.35)] backdrop-blur-sm hover:bg-black/70"
                )}
              >
                <PanelLeftOpen className="size-5" />
              </button>
            )}

            <canvas
              ref={canvasRef}
              role="img"
              aria-label={messages.canvasLabel}
              className="h-full w-full touch-none"
              style={{
                cursor: isPanning ? "grabbing" : view.scale > 1 ? "grab" : (activeStock || hoveredBoardTitleName) && !isMobile ? "pointer" : "default",
              }}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseLeave}
              onDoubleClick={onDoubleClick}
            />

            {/* 悬浮详情面板 */}
            <Inspector
              ref={inspectorListRef}
              style={inspectorStyle}
              title={activeInspectorTitle}
              stock={activeInspectorStock}
              stocks={inspectorStocks}
              messages={messages}
              priceColorMode={priceColorMode}
              designStyle={designStyle}
              listMaxHeight={inspectorListMaxHeight}
            />

            {loading && <HeatmapLoadingOverlay displayMode={displayMode} locale={locale} />}

            {error && !loading && !treemapData && (
              <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/80 text-sm text-destructive backdrop-blur-sm">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* 底部图例 */}
        {!isFullscreen && (
          <ColorLegend
            messages={messages}
            priceColorMode={priceColorMode}
            designStyle={designStyle}
            isLightMode={isLightMode}
            areaTipMessage={areaTipMessage}
            isMobile={isMobile}
            sharePending={sharePending}
            onOpenTips={() => { setSettingsTab("help"); setSettingsOpen(true); }}
            onShare={createSharePreview}
            githubUrl="https://github.com/ColinYYCC/stock-matrix"
          />
        )}
      </div>

      {/* 移动端个股详情面板：点击色块后从底部弹出 */}
      {isMobile && selectedBoardName && (
        <MobileStockSheet
          title={activeInspectorTitle ?? selectedBoardName}
          stock={activeInspectorStock}
          stocks={inspectorStocks}
          messages={messages}
          priceColorMode={priceColorMode}
          designStyle={designStyle}
          onClose={closeMobileSheet}
          onSelectStock={setSelectedStockCode}
          onOpenXueqiu={openXueqiuForStock}
        />
      )}

      {/* 设置面板 */}
      <SettingsDrawer
        open={settingsOpen}
        tab={settingsTab}
        messages={messages}
        displayMode={displayMode}
        priceColorMode={priceColorMode}
        designStyle={designStyle}
        areaTipMessage={areaTipMessage}
        onClose={() => setSettingsOpen(false)}
        onTabChange={setSettingsTab}
        onDisplayModeChange={setDisplayMode}
        onPriceColorModeChange={setPriceColorMode}
        onDesignStyleChange={setDesignStyle}
      />
    </div>
  );
}
