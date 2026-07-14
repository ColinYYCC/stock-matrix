"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  Loader2,
  Moon,
  Palette,
  Settings2,
  Sun,
  TrendingDown,
  TrendingUp,
  X,
  ExternalLink,
  Info,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Sidebar } from "@/components/sidebar";
import { Inspector, type InspectorStyle } from "@/components/inspector";
import { ColorLegend } from "@/components/color-legend";
import { cn } from "@/lib/utils";
import { clamp, formatCompactChange } from "@/lib/format";
import { getLegendGradient } from "@/lib/heatmap-color";
import { drawHeatmap, heatmapCanvasThemes } from "@/lib/canvas-render";
import { binaryTreemap } from "@/lib/treemap";
import { getMessages, type HeatmapMessages } from "@/lib/i18n";
import { usePollWhileVisible } from "@/hooks/use-poll-while-visible";
import { useIsMobile } from "@/hooks/use-is-mobile";
import {
  clampOffset,
  useCanvasInteraction,
  MIN_ZOOM,
  MAX_ZOOM,
} from "@/hooks/use-canvas-interaction";
import {
  heatmapPeriodKeys,
  type BoardRect,
  type DisplayMode,
  type HeatmapPeriodKey,
  type HeatmapSizeMode,
  type Locale,
  type MarketKey,
  type PriceColorMode,
  type QuoteMap,
  type StockRect,
  type SubBoardRect,
  type ThemeColorKey,
  type TreemapResponse,
  type MarketOverviewResponse,
  type ViewState,
} from "@/types/heatmap";

// ============ 常量 ============

/** 数据轮询间隔：8 秒 */
const refreshIntervalMs = 8000;
/** 平盘阈值 */
const flatThreshold = 0.1;
/** 全部板块 / 全部趋势的筛选值 */
const allBoardsValue = "__all__";
const allTrendsValue = "__all__";
const risingOnlyValue = "__rising__";
const fallingOnlyValue = "__falling__";

/** 主题颜色配置 */
const themeColors: Record<ThemeColorKey, { swatch: string; foreground: string }> = {
  green: { swatch: "#22c55e", foreground: "#041108" },
  red: { swatch: "#ef4444", foreground: "#ffffff" },
  blue: { swatch: "#38bdf8", foreground: "#031018" },
  violet: { swatch: "#a78bfa", foreground: "#13091f" },
};

/** 设置面板的标签页类型 */
type SettingsTab = "appearance" | "help" | "project";

/** 市场摘要信息 */
type MarketSummary = {
  changePct: number;
  stockCount: number;
  updatedAt: string;
};

/** 市场概览信息 */
type MarketOverview = {
  advanceCount: number;
  flatCount: number;
  declineCount: number;
  turnoverAmount: number;
  turnoverPreviousAmount: number;
  turnoverDelta: number;
};

// ============ 工具函数 ============

/** 把股票代码 "600519.SH" 转成雪球格式 "SH600519" */
function toXueqiuSymbol(code: string) {
  const [symbol, market] = code.split(".");
  return `${market}${symbol}`;
}

/** 获取东方财富分时图 URL */
function getSparklineUrl(code: string) {
  const [symbol = "", market = "SH"] = code.split(".");
  const marketId = market === "SH" ? "1" : "0";
  return `https://webquotepic.eastmoney.com/GetPic.aspx?nid=${marketId}.${symbol}&imageType=RJY`;
}

/** 获取新浪日线 K 线图 URL */
function getDailyKlineUrl(code: string) {
  const [symbol = "", market = "SH"] = code.split(".");
  const prefix = market === "SH" ? "sh" : market === "SZ" ? "sz" : "bj";
  return `https://image.sinajs.cn/newchart/daily/n/${prefix}${symbol}.gif`;
}

/** 获取实盘成交额（quotes 里有就用实盘，否则用 fallback） */
function getLiveTurnoverAmount(code: string, fallback: number, quotes: QuoteMap) {
  if (code in quotes) {
    const live = quotes[code].turnoverAmount;
    return Number.isFinite(live) && live >= 0 ? live : fallback;
  }
  return fallback;
}

/** 确保面积值是正数 */
function normalizeSizeValue(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/** 根据面积模式获取个股的面积权重值 */
function getStockSizeValue(
  stock: { code: string; value: number; turnoverAmount: number },
  quotes: QuoteMap,
  sizeMode: HeatmapSizeMode
) {
  if (sizeMode === "turnover") {
    return normalizeSizeValue(getLiveTurnoverAmount(stock.code, stock.turnoverAmount, quotes));
  }
  return stock.value;
}

/** 把面积模式应用到 treemap 数据上 */
function applySizeModeToTreemapData(
  data: TreemapResponse,
  quotes: QuoteMap,
  sizeMode: HeatmapSizeMode
): TreemapResponse {
  if (sizeMode === "marketCap") return data;

  const nodes = data.nodes
    .map((board) => {
      const children = board.children
        .map((stock) => ({ ...stock, value: getStockSizeValue(stock, quotes, sizeMode) }))
        .sort((left, right) => right.value - left.value);
      const total = children.reduce((sum, stock) => sum + stock.value, 0);
      return { ...board, children, value: total, stockCount: children.length };
    })
    .sort((left, right) => right.value - left.value);

  return { ...data, nodes };
}

/** 加权平均涨跌幅 */
function weightedAverageChange(
  stocks: Array<{ code: string; value: number; changePct: number }>,
  quotes: QuoteMap
) {
  let weightedSum = 0;
  let totalValue = 0;
  for (const stock of stocks) {
    const changePct = quotes[stock.code]?.changePct ?? stock.changePct;
    weightedSum += changePct * stock.value;
    totalValue += stock.value;
  }
  return totalValue <= 0 ? 0 : weightedSum / totalValue;
}

/** 按二级行业分组 */
function groupStocksBySubBoard<
  T extends { code: string; boardName: string; subBoardName: string; value: number; changePct: number },
>(stocks: T[], quotes: QuoteMap) {
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
      changePct: weightedAverageChange(children, quotes),
      children: [...children].sort((left, right) => right.value - left.value),
    }))
    .sort((left, right) => right.value - left.value);
}

// ============ 加载状态遮罩 ============

/** 加载中的骨架屏 */
function HeatmapLoadingOverlay({ displayMode }: { displayMode: DisplayMode }) {
  const isLightMode = displayMode === "light";
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
        <span className="text-[15px] font-semibold tracking-tight sm:text-base">热力图加载中...</span>
      </div>
    </div>
  );
}

// ============ 设置面板 ============

/** 设置面板组件 */
function SettingsDrawer({
  open,
  tab,
  messages,
  displayMode,
  priceColorMode,
  onClose,
  onTabChange,
  onDisplayModeChange,
  onPriceColorModeChange,
  areaTipMessage,
}: {
  open: boolean;
  tab: SettingsTab;
  messages: HeatmapMessages;
  displayMode: DisplayMode;
  priceColorMode: PriceColorMode;
  areaTipMessage: string;
  onClose: () => void;
  onTabChange: (tab: SettingsTab) => void;
  onDisplayModeChange: (mode: DisplayMode) => void;
  onPriceColorModeChange: (mode: PriceColorMode) => void;
}) {
  if (!open) return null;

  const tabs: Array<{ key: SettingsTab; label: string; icon: typeof Palette }> = [
    { key: "appearance", label: messages.settingsAppearance, icon: Palette },
    { key: "help", label: messages.settingsHelp, icon: Info },
    { key: "project", label: messages.settingsProject, icon: ExternalLink },
  ];
  const helpItems = [
    areaTipMessage,
    messages.tipColor,
    messages.tipDoubleClick,
    messages.tipZoom,
    messages.tipDrag,
    messages.tipInspectorScroll,
    messages.tipFullscreen,
  ];

  return (
    <div className="absolute inset-0 z-[10010] flex items-end justify-center bg-black/62 backdrop-blur-sm" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0" aria-label={messages.closeSheet} onClick={onClose} />
      <section className="relative flex h-[82dvh] w-full flex-col overflow-hidden rounded-t-lg border border-b-0 border-border bg-card text-card-foreground shadow-[0_-24px_100px_rgba(0,0,0,0.48)]">
        <div className="flex items-center justify-center pt-2">
          <span className="h-1 w-10 rounded-full bg-muted-foreground/40" aria-hidden />
        </div>
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-tight">{messages.settingsTitle}</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{messages.settingsDescription}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={messages.closeSheet}
            className="inline-flex size-9 shrink-0 items-center justify-center border border-border bg-background/70 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-rows-[48px_minmax(0,1fr)] md:grid-cols-[168px_minmax(0,1fr)] md:grid-rows-1">
          <nav className="flex h-12 min-h-12 gap-1 overflow-x-auto overflow-y-hidden border-b border-border bg-muted/20 px-2 py-1.5 md:h-auto md:min-h-0 md:flex-col md:overflow-x-visible md:border-b-0 md:border-r md:p-2">
            {tabs.map((item) => {
              const Icon = item.icon;
              const active = tab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onTabChange(item.key)}
                  className={cn(
                    "inline-flex h-9 shrink-0 items-center gap-2 border px-3 text-left text-sm font-medium leading-none transition-colors md:w-full",
                    active
                      ? "border-brand/60 bg-brand/15 text-foreground"
                      : "border-transparent text-muted-foreground hover:border-border hover:bg-background/70 hover:text-foreground"
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="whitespace-nowrap">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="min-h-0 overflow-y-auto p-4">
            {tab === "appearance" && (
              <div className="space-y-6">
                <section>
                  <h3 className="text-sm font-semibold">{messages.displayMode}</h3>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => onDisplayModeChange("light")}
                      aria-pressed={displayMode === "light"}
                      className={cn(
                        "flex items-center gap-2 border px-3 py-3 text-left text-sm font-semibold transition-colors",
                        displayMode === "light"
                          ? "border-brand/70 bg-brand/15 text-foreground"
                          : "border-border bg-background/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <Sun className="size-4 shrink-0" />
                      {messages.lightMode}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDisplayModeChange("dark")}
                      aria-pressed={displayMode === "dark"}
                      className={cn(
                        "flex items-center gap-2 border px-3 py-3 text-left text-sm font-semibold transition-colors",
                        displayMode === "dark"
                          ? "border-brand/70 bg-brand/15 text-foreground"
                          : "border-border bg-background/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <Moon className="size-4 shrink-0" />
                      {messages.darkMode}
                    </button>
                  </div>
                </section>

                <section>
                  <h3 className="text-sm font-semibold">{messages.priceColor}</h3>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => onPriceColorModeChange("red-rise")}
                      aria-pressed={priceColorMode === "red-rise"}
                      className={cn(
                        "border px-3 py-3 text-left text-sm transition-colors",
                        priceColorMode === "red-rise"
                          ? "border-brand/70 bg-brand/15"
                          : "border-border bg-background/70 hover:bg-muted"
                      )}
                    >
                      <span className="font-semibold text-red-400">{messages.redRiseGreenFall}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onPriceColorModeChange("green-rise")}
                      aria-pressed={priceColorMode === "green-rise"}
                      className={cn(
                        "border px-3 py-3 text-left text-sm transition-colors",
                        priceColorMode === "green-rise"
                          ? "border-brand/70 bg-brand/15"
                          : "border-border bg-background/70 hover:bg-muted"
                      )}
                    >
                      <span className="font-semibold text-emerald-400">{messages.greenRiseRedFall}</span>
                    </button>
                  </div>
                </section>
              </div>
            )}

            {tab === "help" && (
              <section>
                <h3 className="text-sm font-semibold">{messages.helpTitle}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{messages.helpIntro}</p>
                <div className="mt-4 space-y-2">
                  {helpItems.map((item) => (
                    <div key={item} className="border border-border bg-background/70 px-3 py-2 text-sm text-muted-foreground">
                      {item.replace(/^·\s*/, "")}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {tab === "project" && (
              <section>
                <h3 className="text-sm font-semibold">{messages.githubProject}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{messages.githubProjectDescription}</p>
                <a
                  href="https://github.com/ColinYYCC/stock-matrix"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-2 border border-border bg-background/80 px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
                >
                  <ExternalLink className="size-4" />
                  github.com/ColinYYCC/stock-matrix
                </a>
              </section>
            )}
          </div>
        </div>
      </section>
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
export function MarketHeatmap({ locale: initialLocale }: { locale: Locale; messages?: HeatmapMessages }) {
  // ============ Refs ============
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inspectorListRef = useRef<HTMLDivElement | null>(null);

  // ============ 基础状态 ============
  const [locale] = useState<Locale>(initialLocale);
  const messages = useMemo(() => getMessages(locale).heatmap, [locale]);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("dark");
  const [themeColor, setThemeColor] = useState<ThemeColorKey>("red");
  const [priceColorMode, setPriceColorMode] = useState<PriceColorMode>("red-rise");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("appearance");

  // ============ 数据状态 ============
  const [market, setMarket] = useState<MarketKey>("all");
  const [period, setPeriod] = useState<HeatmapPeriodKey>("day");
  const [boardFilter, setBoardFilter] = useState(allBoardsValue);
  const [trendFilter, setTrendFilter] = useState(allTrendsValue);
  const [sizeMode, setSizeMode] = useState<HeatmapSizeMode>("marketCap");
  const [marketSummaries, setMarketSummaries] = useState<Partial<Record<MarketKey, MarketSummary>>>({});
  const [treemapData, setTreemapData] = useState<TreemapResponse | null>(null);
  const [quotes, setQuotes] = useState<QuoteMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState("");

  // ============ 交互状态 ============
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 760 });
  const [view, setView] = useState<ViewState>({ scale: 1, x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
  const isMobile = useIsMobile();
  const heatmapCanvasTheme = heatmapCanvasThemes[displayMode];
  const brandStyle = useMemo(
    () =>
      ({
        "--brand": themeColors[themeColor].swatch,
        "--brand-foreground": themeColors[themeColor].foreground,
      }) as CSSProperties,
    [themeColor]
  );

  const activeStockCode = isMobile ? selectedStockCode : hoveredStockCode;
  const activeBoardName = isMobile ? selectedBoardName : hoveredBoardName;
  const activeSubBoardName = isMobile ? selectedSubBoardName : hoveredSubBoardName;

  // ============ Refs for layout ============
  const lastStockRectsRef = useRef<StockRect[]>([]);
  const lastBoardRectsRef = useRef<BoardRect[]>([]);
  const lastSubBoardRectsRef = useRef<SubBoardRect[]>([]);

  // ============ 交互 Hook ============
  const { toWorldPoint, pickFunctions, dragStateRef, touchStateRef } = useCanvasInteraction({
    canvasSize,
    view,
    setView,
    stockRectsRef: lastStockRectsRef,
    boardRectsRef: lastBoardRectsRef,
    subBoardRectsRef: lastSubBoardRectsRef,
    isMobile,
  });

  // ============ 加载用户偏好设置 ============
  useEffect(() => {
    try {
      const storedDisplayMode = window.localStorage.getItem("heatmap-display-mode");
      const storedTheme = window.localStorage.getItem("heatmap-theme-color");
      const storedPriceColor = window.localStorage.getItem("heatmap-price-color");
      const storedSizeMode = window.localStorage.getItem("heatmap-size-mode");
      if (storedDisplayMode === "dark" || storedDisplayMode === "light") setDisplayMode(storedDisplayMode);
      if (storedTheme === "green" || storedTheme === "red" || storedTheme === "blue" || storedTheme === "violet") setThemeColor(storedTheme);
      if (storedPriceColor === "red-rise" || storedPriceColor === "green-rise") setPriceColorMode(storedPriceColor);
      if (storedSizeMode === "marketCap" || storedSizeMode === "turnover") setSizeMode(storedSizeMode);
    } catch { /* 偏好设置是可选的 */ } finally {
      setPreferencesReady(true);
    }
  }, []);

  useEffect(() => {
    if (!preferencesReady) return;
    const isDark = displayMode === "dark";
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.style.colorScheme = isDark ? "dark" : "light";
    try { window.localStorage.setItem("heatmap-display-mode", displayMode); } catch { /* 可选 */ }
  }, [displayMode, preferencesReady]);

  useEffect(() => {
    if (!preferencesReady) return;
    try { window.localStorage.setItem("heatmap-price-color", priceColorMode); } catch { /* 可选 */ }
  }, [preferencesReady, priceColorMode]);

  useEffect(() => {
    if (!preferencesReady) return;
    try { window.localStorage.setItem("heatmap-size-mode", sizeMode); } catch { /* 可选 */ }
  }, [preferencesReady, sizeMode]);

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
    document.documentElement.classList.add("heatmap-page-active");
    document.body.classList.add("heatmap-page-active");
    return () => {
      document.documentElement.classList.remove("heatmap-page-active");
      document.body.classList.remove("heatmap-page-active");
    };
  }, []);

  // ============ 数据拉取 ============
  const fetchTreemap = useCallback(
    async (nextMarket: MarketKey, nextPeriod: HeatmapPeriodKey) => {
      const response = await fetch(`/api/heatmap/treemap?market=${nextMarket}&period=${nextPeriod}`);
      if (!response.ok) throw new Error(messages.errorLoad);
      const payload = (await response.json()) as TreemapResponse;
      setTreemapData(payload);
      setUpdatedAt(payload.updatedAt);
    },
    [messages.errorLoad]
  );

  const fetchQuotes = useCallback(
    async (nextMarket: MarketKey, nextPeriod: HeatmapPeriodKey) => {
      const response = await fetch(`/api/heatmap/quotes?market=${nextMarket}&period=${nextPeriod}`);
      if (!response.ok) throw new Error(messages.errorLoad);
      const payload = (await response.json()) as { updatedAt: string; quotes: QuoteMap };
      setQuotes(payload.quotes);
      setUpdatedAt(payload.updatedAt);
    },
    [messages.errorLoad]
  );

  const fetchMarketSummaries = useCallback(async (nextPeriod: HeatmapPeriodKey) => {
    const response = await fetch(`/api/heatmap/overview?period=${nextPeriod}`);
    if (!response.ok) throw new Error(messages.errorLoad);
    const payload = (await response.json()) as MarketOverviewResponse;
    const next: Partial<Record<MarketKey, MarketSummary>> = {};
    for (const item of payload.markets) {
      next[item.market] = { changePct: item.changePct, stockCount: item.stockCount, updatedAt: item.updatedAt };
    }
    setMarketSummaries(next);
  }, [messages.errorLoad]);

  // ============ 加载 treemap 数据 ============
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
      try {
        await fetchTreemap(market, period);
      } catch {
        if (!cancelled) setError(messages.errorLoad);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadTreemap();
    return () => { cancelled = true; };
  }, [fetchTreemap, market, messages.errorLoad, period]);

  // ============ 轮询行情和概览 ============
  usePollWhileVisible(
    useCallback(async () => {
      try { await fetchQuotes(market, period); } catch { setError(messages.errorLoad); }
    }, [fetchQuotes, market, messages.errorLoad, period]),
    refreshIntervalMs
  );

  usePollWhileVisible(
    useCallback(async () => {
      try { await fetchMarketSummaries(period); } catch { /* 保持现有数据 */ }
    }, [fetchMarketSummaries, period]),
    refreshIntervalMs
  );

  // ============ 筛选 ============
  useEffect(() => {
    if (!treemapData || boardFilter === allBoardsValue) return;
    if (!treemapData.nodes.some((node) => node.name === boardFilter)) setBoardFilter(allBoardsValue);
  }, [boardFilter, treemapData]);

  useEffect(() => {
    setHoveredStockCode(null);
    setHoveredBoardName(null);
    setHoveredBoardTitleName(null);
    setHoveredSubBoardName(null);
    setSelectedStockCode(null);
    setSelectedBoardName(null);
    setSelectedSubBoardName(null);
    setView({ scale: 1, x: 0, y: 0 });
  }, [boardFilter, trendFilter]);

  useEffect(() => { setView({ scale: 1, x: 0, y: 0 }); }, [sizeMode]);

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
        let advanceCount = 0, flatCount = 0, declineCount = 0, turnoverAmount = 0;
        for (const stock of selectedBoard.children) {
          const changePct = stock.changePct;
          if (changePct > flatThreshold) advanceCount += 1;
          else if (changePct < -flatThreshold) declineCount += 1;
          else flatCount += 1;
          turnoverAmount += stock.turnoverAmount;
        }
        result = {
          ...result,
          stockCount: selectedBoard.stockCount,
          boardCount: 1,
          summary: { ...result.summary, advanceCount, flatCount, declineCount, turnoverAmount, turnoverPreviousAmount: 0, turnoverDelta: 0, indexChangePct: weightedAverageChange(selectedBoard.children, {} as QuoteMap) },
          nodes: [selectedBoard],
        };
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

      let advanceCount = 0, flatCount = 0, declineCount = 0, turnoverAmount = 0, totalStockCount = 0;
      for (const node of filteredNodes) {
        for (const stock of node.children) {
          const changePct = stock.changePct;
          if (changePct > flatThreshold) advanceCount += 1;
          else if (changePct < -flatThreshold) declineCount += 1;
          else flatCount += 1;
          turnoverAmount += stock.turnoverAmount;
          totalStockCount += 1;
        }
      }
      result = { ...result, stockCount: totalStockCount, boardCount: filteredNodes.length, summary: { ...result.summary, advanceCount, flatCount, declineCount, turnoverAmount, turnoverPreviousAmount: 0, turnoverDelta: 0 }, nodes: filteredNodes };
    }

    return result;
  }, [boardFilter, trendFilter, treemapData]);

  // 侧边栏概览：用实时行情计算涨跌家数和成交额（轻量计算，不影响布局性能）
  const marketOverview = useMemo<MarketOverview | null>(() => {
    if (!visibleTreemapData) return null;
    let advanceCount = 0, flatCount = 0, declineCount = 0, turnoverAmount = 0;
    for (const board of visibleTreemapData.nodes) {
      for (const stock of board.children) {
        const changePct = quotes[stock.code]?.changePct ?? stock.changePct;
        if (changePct > flatThreshold) advanceCount += 1;
        else if (changePct < -flatThreshold) declineCount += 1;
        else flatCount += 1;
        turnoverAmount += getLiveTurnoverAmount(stock.code, stock.turnoverAmount, quotes);
      }
    }
    return {
      advanceCount, flatCount, declineCount, turnoverAmount,
      turnoverPreviousAmount: visibleTreemapData.summary.turnoverPreviousAmount,
      turnoverDelta: visibleTreemapData.summary.turnoverDelta,
    };
  }, [visibleTreemapData, quotes]);

  // 当 sizeMode 为 marketCap 时不需要 quotes（直接用原数据），只有 turnover 模式才需要
  const sizedTreemapData = useMemo(
    () => (visibleTreemapData ? applySizeModeToTreemapData(visibleTreemapData, quotes, sizeMode) : null),
    [sizeMode, visibleTreemapData, sizeMode === "turnover" ? quotes : null]
  );

  // ============ 树图布局：位置计算（不依赖行情，只依赖数据结构和画布尺寸） ============
  // 性能优化：把昂贵的 binaryTreemap 计算和行情数据分离
  // 位置只由市值权重决定，行情刷新时不重算位置
  const layoutPositions = useMemo(() => {
    if (!sizedTreemapData) {
      return { stockRects: [] as StockRect[], boardRects: [] as BoardRect[], subBoardRects: [] as SubBoardRect[] };
    }

    const boardRects: BoardRect[] = [];
    const subBoardRects: SubBoardRect[] = [];
    const stockRects: StockRect[] = [];

    const boardBoxes = binaryTreemap(
      sizedTreemapData.nodes.map((board) => ({ item: board, value: board.value })),
      0, 0, canvasSize.width, canvasSize.height, 6
    );

    // 用空对象作为 quotes 参数，这样 weightedAverageChange 和 groupStocksBySubBoard
    // 会退回到 stock.changePct（API 返回的快照值），不影响位置计算
    const fallbackQuotes = {} as QuoteMap;

    for (const boardBox of boardBoxes) {
      const boardChangePct = weightedAverageChange(boardBox.item.children, fallbackQuotes);
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

      const subBoards = groupStocksBySubBoard(boardBox.item.children, fallbackQuotes);
      const shouldNestSubBoards = subBoards.length > 1;

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
    // 注意：不依赖 quotes，只有数据结构或画布尺寸变化时才重算
  }, [canvasSize.height, canvasSize.width, sizedTreemapData]);

  // ============ 树图布局：行情合并（轻量操作，只更新价格和涨跌幅） ============
  const layout = useMemo(() => {
    if (layoutPositions.stockRects.length === 0) return layoutPositions;

    // 把实时行情合并到已有的位置矩形上（只改 price 和 changePct，不动位置）
    const stockRects = layoutPositions.stockRects.map((rect) => {
      const quote = quotes[rect.code];
      if (!quote) return rect;
      return { ...rect, price: quote.price, changePct: quote.changePct };
    });

    // 按板块重新计算加权涨跌幅（用于标题栏颜色）
    const boardChangeMap = new Map<string, number>();
    for (const rect of stockRects) {
      const current = boardChangeMap.get(rect.boardName);
      if (current === undefined) {
        boardChangeMap.set(rect.boardName, rect.changePct * rect.value);
      } else {
        boardChangeMap.set(rect.boardName, current + rect.changePct * rect.value);
      }
    }
    const boardValueMap = new Map<string, number>();
    for (const rect of stockRects) {
      const current = boardValueMap.get(rect.boardName);
      boardValueMap.set(rect.boardName, (current ?? 0) + rect.value);
    }
    const boardRects = layoutPositions.boardRects.map((rect) => {
      const totalValue = boardValueMap.get(rect.name) ?? 0;
      const weightedSum = boardChangeMap.get(rect.name) ?? 0;
      return { ...rect, changePct: totalValue > 0 ? weightedSum / totalValue : 0 };
    });

    return { stockRects, boardRects, subBoardRects: layoutPositions.subBoardRects };
  }, [layoutPositions, quotes]);

  useEffect(() => {
    lastStockRectsRef.current = layout.stockRects;
    lastBoardRectsRef.current = layout.boardRects;
    lastSubBoardRectsRef.current = layout.subBoardRects;
  }, [layout.boardRects, layout.stockRects, layout.subBoardRects]);

  // ============ 悬浮命中 ============
  const activeStock = useMemo(() => {
    if (!activeStockCode) return null;
    return layout.stockRects.find((stock) => stock.code === activeStockCode) ?? null;
  }, [activeStockCode, layout.stockRects]);

  const highlightedStock = useMemo(() => {
    if (activeStock) return activeStock;
    if (!activeBoardName) return null;
    return layout.stockRects.find((stock) => stock.boardName === activeBoardName) ?? null;
  }, [activeBoardName, activeStock, layout.stockRects]);

  const activeBoardRect = useMemo(() => {
    if (!activeBoardName) return null;
    return layout.boardRects.find((board) => board.name === activeBoardName) ?? null;
  }, [activeBoardName, layout.boardRects]);

  const activeSubBoardRect = useMemo(() => {
    if (!activeBoardName || !activeSubBoardName) return null;
    return layout.subBoardRects.find((sub) => sub.name === activeSubBoardName && sub.boardName === activeBoardName) ?? null;
  }, [activeBoardName, activeSubBoardName, layout.subBoardRects]);

  const activeBoardStocks = useMemo(() => {
    if (!activeBoardName || !visibleTreemapData) return [];
    const board = visibleTreemapData.nodes.find((node) => node.name === activeBoardName);
    if (!board) return [];
    return board.children
      .map((stock) => {
        const quote = quotes[stock.code];
        return { code: stock.code, name: stock.name, subBoardName: stock.subBoardName, price: quote?.price ?? stock.price, changePct: quote?.changePct ?? stock.changePct };
      })
      .sort((left, right) => Math.abs(right.changePct) - Math.abs(left.changePct));
  }, [activeBoardName, quotes, visibleTreemapData]);

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
    const subBoardName = highlightedStock?.subBoardName || activeSubBoardName;
    if (subBoardName && subBoardName !== activeBoardName) return `${activeBoardName} - ${subBoardName}`;
    return activeBoardName;
  }, [activeBoardName, highlightedStock, activeSubBoardName]);

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

  // ============ Canvas 绘制（用 requestAnimationFrame 推迟，不卡住主线程） ============
  // 性能优化：把 Canvas 绘制放到下一帧执行，让浏览器先把 UI 变化（如加载遮罩）画出来
  // 这样切换市场/板块时不会"冻住"，用户能立即看到响应
  const drawFrameRef = useRef<number | null>(null);
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
      canvas.width = Math.floor(canvasSize.width * pixelRatio);
      canvas.height = Math.floor(canvasSize.height * pixelRatio);
      canvas.style.width = `${canvasSize.width}px`;
      canvas.style.height = `${canvasSize.height}px`;
      drawHeatmap({
        context, canvasWidth: canvasSize.width, canvasHeight: canvasSize.height, pixelRatio, view,
        theme: heatmapCanvasTheme, priceColorMode,
        stockRects: layout.stockRects, boardRects: layout.boardRects, subBoardRects: layout.subBoardRects,
        highlightedStock, activeBoardName, activeSubBoardName,
      });
    });
    return () => {
      if (drawFrameRef.current !== null) {
        cancelAnimationFrame(drawFrameRef.current);
        drawFrameRef.current = null;
      }
    };
  }, [
    canvasSize.height, canvasSize.width, activeBoardName, activeSubBoardName, highlightedStock,
    heatmapCanvasTheme, layout.boardRects, layout.subBoardRects, layout.stockRects, priceColorMode,
    view.scale, view.x, view.y,
  ]);

  // ============ 鼠标事件 ============
  // 节流：用 requestAnimationFrame 合并鼠标移动事件，避免每秒 60+ 次命中检测
  const hoverFrameRef = useRef<number | null>(null);
  const lastPointerRef = useRef({ x: 0, y: 0 });

  const onMouseMove = useCallback((event: ReactMouseEvent<HTMLCanvasElement>) => {
    if (isMobile) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const pointerX = event.clientX - bounds.left;
    const pointerY = event.clientY - bounds.top;

    // 拖拽平移不走节流，需要即时响应
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

    // 记录鼠标位置，用 rAF 合并到一帧只做一次命中检测
    lastPointerRef.current = { x: pointerX, y: pointerY };
    if (hoverFrameRef.current === null) {
      hoverFrameRef.current = requestAnimationFrame(() => {
        hoverFrameRef.current = null;
        const px = lastPointerRef.current.x;
        const py = lastPointerRef.current.y;
        const world = toWorldPoint(px, py);
        const stock = pickFunctions.pickStock(world.x, world.y);
        const boardTitle = stock ? null : pickFunctions.pickBoardTitle(world.x, world.y);
        const subBoard = stock ? { name: stock.subBoardName, boardName: stock.boardName } : pickFunctions.pickSubBoard(world.x, world.y);
        const board = stock ? { name: stock.boardName } : subBoard ? { name: subBoard.boardName } : pickFunctions.pickBoard(world.x, world.y);

        setHoveredStockCode(stock?.code ?? null);
        setHoveredBoardName(board?.name ?? null);
        setHoveredBoardTitleName(boardTitle?.name ?? null);
        setHoveredSubBoardName(subBoard?.name || null);
      });
    }
  }, [canvasSize.height, canvasSize.width, isMobile, pickFunctions, toWorldPoint, dragStateRef]);

  // 清理节流帧
  useEffect(() => {
    return () => {
      if (hoverFrameRef.current !== null) {
        cancelAnimationFrame(hoverFrameRef.current);
        hoverFrameRef.current = null;
      }
    };
  }, []);

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

  const onWheel = useCallback((event: ReactWheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
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
      setBoardFilter((current) => current === subBoardTitle.boardName ? allBoardsValue : subBoardTitle.boardName);
      return;
    }
    const stock = pickFunctions.pickStock(world.x, world.y);
    if (!stock) return;
    window.open(`https://xueqiu.com/S/${toXueqiuSymbol(stock.code)}`, "_blank", "noopener,noreferrer");
  }, [isMobile, pickFunctions, toWorldPoint]);

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

    function onTouchEnd(event: TouchEvent) {
      const state = touchStateRef.current;
      if (state.mode === "tap" && !state.moved && Date.now() - state.startTs < 350) {
        const now = Date.now();
        const sinceLastTap = now - state.lastTapTs;
        const tapDistance = Math.hypot(state.startClientX - state.lastTapX, state.startClientY - state.lastTapY);
        if (state.lastTapTs > 0 && sinceLastTap < 320 && tapDistance < 32) {
          // 双击 → 切换板块筛选
          const bounds = canvas!.getBoundingClientRect();
          const world = toWorldPoint(state.startClientX - bounds.left, state.startClientY - bounds.top);
          const boardTitle = pickFunctions.pickBoardTitle(world.x, world.y) ?? pickFunctions.pickBoard(world.x, world.y);
          if (boardTitle) {
            setBoardFilter((current) => current === boardTitle.name ? allBoardsValue : boardTitle.name);
          }
          state.lastTapTs = 0;
          state.lastTapX = 0;
          state.lastTapY = 0;
          if (event.touches.length === 0) { state.mode = "idle"; state.moved = false; }
          return;
        } else {
          state.lastTapTs = now;
          state.lastTapX = state.startClientX;
          state.lastTapY = state.startClientY;
        }
        // 单击 → 选中股票
        const bounds = canvas!.getBoundingClientRect();
        const world = toWorldPoint(state.startClientX - bounds.left, state.startClientY - bounds.top);
        const stock = pickFunctions.pickStock(world.x, world.y);
        if (stock) {
          setSelectedStockCode(stock.code);
          setSelectedBoardName(stock.boardName);
          setSelectedSubBoardName(stock.subBoardName || null);
        } else {
          const subBoard = pickFunctions.pickSubBoard(world.x, world.y);
          if (subBoard) {
            setSelectedStockCode(null);
            setSelectedBoardName(subBoard.boardName);
            setSelectedSubBoardName(subBoard.name);
          } else {
            const board = pickFunctions.pickBoard(world.x, world.y);
            if (board) {
              setSelectedStockCode(null);
              setSelectedBoardName(board.name);
              setSelectedSubBoardName(null);
            }
          }
        }
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

    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: true });
    canvas.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
      canvas.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [canvasSize.height, canvasSize.width, pickFunctions, toWorldPoint, touchStateRef]);

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
    toast(isMobile ? messages.fullscreenToastMobile : messages.fullscreenToast, { id: "heatmap-fullscreen-hint", duration: 3200 });
  }, [isFullscreen, isMobile, messages.fullscreenToast, messages.fullscreenToastMobile]);

  // ============ 截图分享 ============
  const createSharePreview = useCallback(async () => {
    const sourceCanvas = canvasRef.current;
    if (!sourceCanvas) return;
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
      const filename = `ashare-heatmap-${market}-${period}-${stamp}.png`;
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(messages.shareFailed, { id: "heatmap-share-generate", duration: 3200 });
    }
  }, [canvasSize.width, isLightMode, market, messages, period, updatedAt]);

  // ============ 渲染 ============
  const areaTipMessage = sizeMode === "turnover" ? messages.tipAreaTurnover : messages.tipAreaMarketCap;
  const inspectorListMaxHeight = inspectorStyle ? Math.max(170, inspectorStyle.maxHeight - 292) : 170;

  return (
    <div
      className={cn(
        "relative min-h-0 bg-background",
        isFullscreen ? "fixed inset-0 z-[9999]" : "flex min-h-0 flex-1 flex-col"
      )}
      style={brandStyle}
    >
      <div
        className={cn(
          "grid min-h-0",
          isFullscreen ? "h-full" : "min-h-0 flex-1",
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
          boardFilter={boardFilter}
          trendFilter={trendFilter}
          sizeMode={sizeMode}
          priceColorMode={priceColorMode}
          marketSummaries={marketSummaries}
          treemapData={treemapData}
          marketOverview={marketOverview}
          updatedAt={updatedAt}
          sidebarOpen={sidebarOpen}
          isFullscreen={isFullscreen}
          onMarketChange={(m) => { setMarket(m); if (isMobile) setSidebarOpen(false); }}
          onPeriodChange={setPeriod}
          onBoardFilterChange={(v) => { setBoardFilter(v); if (isMobile) setSidebarOpen(false); }}
          onTrendFilterChange={setTrendFilter}
          onSizeModeChange={setSizeMode}
          onResetView={() => setView({ scale: 1, x: 0, y: 0 })}
          onToggleFullscreen={() => setIsFullscreen((c) => !c)}
          onOpenSettings={() => setSettingsOpen(true)}
          onCloseSidebar={() => setSidebarOpen(false)}
        />

        {/* Canvas 区域 */}
        <div
          className={cn(
            "relative min-h-0 overflow-hidden",
            isLightMode ? "bg-[#e9eef5]" : "bg-[#10141b]",
            isFullscreen ? "col-start-1 h-full" : "col-start-1 row-start-1 md:col-start-2"
          )}
        >
          <div
            ref={viewportRef}
            className={cn("relative h-full min-h-0 overflow-hidden", isLightMode ? "bg-[#e9eef5]" : "bg-[#10141b]")}
          >
            {isFullscreen && isMobile && (
              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                className="absolute right-3 top-3 z-50 inline-flex size-10 items-center justify-center rounded-full border border-slate-500/70 bg-black/50 text-white shadow-[0_10px_24px_rgba(0,0,0,0.28)] backdrop-blur-sm transition-colors hover:bg-black/70"
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
                className="absolute bottom-3 left-3 z-30 inline-flex size-11 items-center justify-center rounded-full border border-slate-500/70 bg-black/50 text-white shadow-[0_10px_24px_rgba(0,0,0,0.35)] backdrop-blur-sm transition-colors hover:bg-black/70 md:hidden"
              >
                <span className="text-lg">☰</span>
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
              onWheel={onWheel}
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
              listMaxHeight={inspectorListMaxHeight}
            />

            {loading && <HeatmapLoadingOverlay displayMode={displayMode} />}

            {error && !loading && (
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
            isLightMode={isLightMode}
            areaTipMessage={areaTipMessage}
            isMobile={isMobile}
            sharePending={false}
            onOpenTips={() => { setSettingsTab("help"); setSettingsOpen(true); }}
            onShare={createSharePreview}
            githubUrl="https://github.com/ColinYYCC/stock-matrix"
          />
        )}
      </div>

      {/* 设置面板 */}
      <SettingsDrawer
        open={settingsOpen}
        tab={settingsTab}
        messages={messages}
        displayMode={displayMode}
        priceColorMode={priceColorMode}
        areaTipMessage={areaTipMessage}
        onClose={() => setSettingsOpen(false)}
        onTabChange={setSettingsTab}
        onDisplayModeChange={setDisplayMode}
        onPriceColorModeChange={setPriceColorMode}
      />
    </div>
  );
}
