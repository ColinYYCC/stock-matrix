"use client";

import { Maximize2, RotateCcw, Settings2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatCompactChange,
  formatCount,
  formatTurnoverAmount,
  getTurnoverTrend,
} from "@/lib/format";
import { getChangeTextClass, getRiseTextClass, getFallTextClass } from "@/lib/heatmap-color";
import type { HeatmapMessages } from "@/lib/i18n";
import type {
  HeatmapPeriodKey,
  MarketKey,
  PriceColorMode,
  HeatmapSizeMode,
} from "@/types/heatmap";
import type { TreemapResponse } from "@/types/heatmap";

/** 侧边栏可用的市场选项 */
const marketOptions: MarketKey[] = ["all", "sse", "szse", "hs300", "zza500", "cyb", "kcb"];
/** 侧边栏可用的周期选项 */
const periodOptions: HeatmapPeriodKey[] = ["day", "week", "month", "year"];
/** 全部板块的筛选值 */
const allBoardsValue = "__all__";
/** 全部趋势的筛选值 */
const allTrendsValue = "__all__";
/** 仅上涨的筛选值 */
const risingOnlyValue = "__rising__";
/** 仅下跌的筛选值 */
const fallingOnlyValue = "__falling__";

/** 市场范围的紧凑标签 */
function getCompactMarketLabel(market: MarketKey): string {
  const labels: Record<MarketKey, string> = {
    all: "A 股全图",
    sse: "上证 A 股",
    szse: "深证 A 股",
    hs300: "沪深 300",
    zza500: "中证 A500",
    cyb: "创业板",
    kcb: "科创板",
  };
  return labels[market];
}

/** 周期的紧凑标签 */
function getCompactPeriodLabel(period: HeatmapPeriodKey): string {
  const labels: Record<HeatmapPeriodKey, string> = {
    day: "日",
    week: "周",
    month: "月",
    year: "年",
  };
  return labels[period];
}

/** 周期的完整标签 */
function getPeriodLabel(period: HeatmapPeriodKey, messages: HeatmapMessages): string {
  const labels: Record<HeatmapPeriodKey, string> = {
    day: messages.metrics.day,
    week: messages.metrics.week,
    month: messages.metrics.month,
    year: messages.metrics.year,
  };
  return labels[period];
}

/** 市场概览数据 */
type MarketOverview = {
  advanceCount: number;
  flatCount: number;
  declineCount: number;
  turnoverAmount: number;
  turnoverPreviousAmount: number;
  turnoverDelta: number;
};

/** 单个市场的摘要信息 */
type MarketSummary = {
  changePct: number;
  stockCount: number;
  updatedAt: string;
};

/** 侧边栏属性（和原版完全一样，只是换了皮肤） */
type SidebarProps = {
  messages: HeatmapMessages;
  locale: "zh" | "en";
  market: MarketKey;
  period: HeatmapPeriodKey;
  boardFilter: string;
  trendFilter: string;
  sizeMode: HeatmapSizeMode;
  priceColorMode: PriceColorMode;
  marketSummaries: Partial<Record<MarketKey, MarketSummary>>;
  treemapData: TreemapResponse | null;
  marketOverview: MarketOverview | null;
  updatedAt: string;
  sidebarOpen: boolean;
  isFullscreen: boolean;
  onMarketChange: (market: MarketKey) => void;
  onPeriodChange: (period: HeatmapPeriodKey) => void;
  onBoardFilterChange: (value: string) => void;
  onTrendFilterChange: (value: string) => void;
  onSizeModeChange: (mode: HeatmapSizeMode) => void;
  onResetView: () => void;
  onToggleFullscreen: () => void;
  onOpenSettings: () => void;
  onCloseSidebar: () => void;
};

/**
 * iOS 26 Liquid Glass 风格侧边栏
 *
 * 和原版 Sidebar 的逻辑、属性完全一样，只是把外观换成毛玻璃风格：
 * 半透明背景 + 模糊 + 圆角 + 玻璃边框。
 */
export function Sidebar({
  messages,
  locale,
  market,
  period,
  boardFilter,
  trendFilter,
  sizeMode,
  priceColorMode,
  marketSummaries,
  treemapData,
  marketOverview,
  updatedAt,
  sidebarOpen,
  isFullscreen,
  onMarketChange,
  onPeriodChange,
  onBoardFilterChange,
  onTrendFilterChange,
  onSizeModeChange,
  onResetView,
  onToggleFullscreen,
  onOpenSettings,
  onCloseSidebar,
}: SidebarProps) {
  if (isFullscreen) return null;

  const isEnglish = locale === "en";
  const lastUpdatedText = updatedAt ? new Date(updatedAt).toLocaleTimeString() : "--:--:--";
  const riseTextClass = getRiseTextClass(priceColorMode);
  const fallTextClass = getFallTextClass(priceColorMode);
  const boardFilterOptions = treemapData?.nodes ?? [];

  return (
    <>
      {/* 移动端遮罩层 */}
      {sidebarOpen && (
        <button
          type="button"
          onClick={onCloseSidebar}
          aria-label={messages.collapseSidebar}
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
        />
      )}

      <aside
        className={cn(
          "ios26-glass row-start-1 flex min-h-0 min-w-0 flex-col text-card-foreground",
          // 移动端：从左边滑入的抽屉
          "fixed inset-y-0 left-0 z-50 w-[280px] transform transition-transform duration-300",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
          // 桌面端：固定在网格里，毛玻璃面板浮在背景上
          "md:static md:z-auto md:row-span-2 md:w-auto md:translate-x-0 md:transition-none md:rounded-3xl"
        )}
      >
        {/* 标题栏：logo + 标题 */}
        <div className="flex items-center justify-between gap-2 px-2 py-2 sm:px-2.5">
          <div className="flex min-w-0 items-center gap-2">
            <img src="/icon.svg" alt="" className="size-7 shrink-0" decoding="async" />
            <h2 className="min-w-0 truncate whitespace-nowrap font-semibold leading-tight text-[13px] sm:text-sm">
              {messages.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onCloseSidebar}
            aria-label={messages.collapseSidebar}
            className="ios26-glass-hover inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground md:hidden"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden px-1.5 py-1.5 sm:px-2">
          {/* 最近刷新时间（胶囊形） */}
          <div className="ios26-glass-card mb-1.5 flex items-center justify-between rounded-full px-2.5 py-1">
            <span className="font-semibold uppercase tracking-[0.12em] text-[9px] text-muted-foreground">
              {messages.lastUpdated}
            </span>
            <span className="font-semibold tabular-nums text-foreground text-[10px]">
              {lastUpdatedText}
            </span>
          </div>

          {/* 市场范围切换 */}
          <div className="flex flex-col gap-0.5">
            {marketOptions.map((option) => {
              const summary = marketSummaries[option];
              const isActive = market === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => onMarketChange(option)}
                  className={cn(
                    "ios26-glass-hover flex w-full min-w-0 items-center justify-between rounded-[10px] border-none px-2.5 py-1.5 text-left transition-all",
                    isActive && "ios26-glass-active"
                  )}
                >
                  <span className="min-w-0 pr-2 leading-tight text-[12px] text-card-foreground">
                    {getCompactMarketLabel(option)}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 font-semibold tabular-nums text-[12px]",
                      getChangeTextClass(summary?.changePct ?? 0, priceColorMode)
                    )}
                  >
                    {summary ? formatCompactChange(summary.changePct) : "--"}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 一级板块筛选（玻璃卡片） */}
          <div className="ios26-glass-card mt-1.5 p-1.5">
            <label
              htmlFor="board-filter"
              className="block font-semibold uppercase tracking-[0.12em] text-muted-foreground text-[10px]"
            >
              {messages.boardFilterLabel}
            </label>
            <select
              id="board-filter"
              value={boardFilter}
              onChange={(e) => onBoardFilterChange(e.target.value)}
              className="ios26-glass-segmented mt-1 h-8 w-full min-w-0 rounded-[9px] border-none px-2 font-semibold text-foreground text-[12px] outline-none transition-colors focus:bg-[var(--ios26-glass-bg-active)]"
            >
              <option value={allBoardsValue}>{messages.allBoards}</option>
              {boardFilterOptions.map((board) => (
                <option key={board.code} value={board.name}>
                  {board.name} ({board.stockCount})
                </option>
              ))}
            </select>
          </div>

          {/* 涨跌筛选（玻璃卡片 + 分段控件） */}
          <div className="ios26-glass-card mt-1.5 p-1.5">
            <label
              htmlFor="trend-filter"
              className="block font-semibold uppercase tracking-[0.12em] text-muted-foreground text-[10px]"
            >
              {messages.trendFilterLabel}
            </label>
            <div className="ios26-glass-segmented mt-1 grid grid-cols-3 gap-0.5 rounded-[9px] p-0.5">
              {[
                { value: allTrendsValue, label: messages.allTrends },
                { value: risingOnlyValue, label: messages.risingOnly },
                { value: fallingOnlyValue, label: messages.fallingOnly },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onTrendFilterChange(option.value)}
                  aria-pressed={trendFilter === option.value}
                  className={cn(
                    "ios26-glass-hover h-7 rounded-[7px] border-none px-1 text-center font-semibold leading-tight transition-all text-[10.5px]",
                    trendFilter === option.value
                      ? "ios26-glass-active text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* 面积指标切换（玻璃卡片 + 分段控件） */}
          <div className="ios26-glass-card mt-1.5 p-1.5">
            <p className="font-semibold uppercase tracking-[0.12em] text-muted-foreground text-[10px]">
              {messages.sizeModeLabel}
            </p>
            <div className="ios26-glass-segmented mt-1 grid grid-cols-2 gap-0.5 rounded-[9px] p-0.5">
              {[
                { value: "marketCap" as const, label: messages.sizeModeMarketCap },
                { value: "turnover" as const, label: messages.sizeModeTurnover },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onSizeModeChange(option.value)}
                  aria-pressed={sizeMode === option.value}
                  className={cn(
                    "ios26-glass-hover h-7 rounded-[7px] border-none px-1 text-center font-semibold leading-tight transition-all text-[10.5px]",
                    sizeMode === option.value
                      ? "ios26-glass-active text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* 涨跌周期切换（玻璃卡片 + 分段控件） */}
          <div className="ios26-glass-card mt-1.5 p-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold uppercase tracking-[0.12em] text-muted-foreground text-[10px]">
                {messages.metricLabel}
              </p>
              <span className="shrink-0 text-right font-semibold tabular-nums text-foreground text-[10.5px]">
                {getPeriodLabel(period, messages)}
              </span>
            </div>
            <div className="ios26-glass-segmented mt-1 grid grid-cols-4 gap-0.5 rounded-[9px] p-0.5">
              {periodOptions.map((option) => {
                const isActive = period === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onPeriodChange(option)}
                    title={getPeriodLabel(option, messages)}
                    aria-pressed={isActive}
                    className={cn(
                      "ios26-glass-hover h-7 rounded-[7px] border-none text-center font-semibold tabular-nums transition-all text-[12px]",
                      isActive
                        ? "ios26-glass-active text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {getCompactPeriodLabel(option)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 市场概览统计（玻璃卡片） */}
          {marketOverview && (
            <div className="ios26-glass-card mt-1.5 p-1.5">
              <div className="grid grid-cols-3 gap-2">
                <div className="flex min-w-0 flex-col items-center text-center">
                  <p className={cn("tracking-[0.06em]", riseTextClass, "text-[11px]")}>
                    {messages.legendRise}
                  </p>
                  <p className={cn("mt-1 font-semibold tabular-nums", riseTextClass, "text-base")}>
                    {formatCount(marketOverview.advanceCount, locale)}
                  </p>
                </div>
                <div className="flex min-w-0 flex-col items-center text-center">
                  <p className="tracking-[0.06em] text-muted-foreground text-[11px]">
                    {messages.legendFlat}
                  </p>
                  <p className="mt-1 font-semibold tabular-nums text-foreground text-base">
                    {formatCount(marketOverview.flatCount, locale)}
                  </p>
                </div>
                <div className="flex min-w-0 flex-col items-center text-center">
                  <p className={cn("tracking-[0.06em]", fallTextClass, "text-[11px]")}>
                    {messages.legendFall}
                  </p>
                  <p className={cn("mt-1 font-semibold tabular-nums", fallTextClass, "text-base")}>
                    {formatCount(marketOverview.declineCount, locale)}
                  </p>
                </div>
              </div>

              {/* 成交额统计 */}
              <div className="mt-2 grid grid-cols-2 items-stretch gap-1.5 border-t border-[var(--ios26-glass-border)] pt-2">
                <div className="flex min-w-0 flex-col">
                  <p className="leading-tight tracking-[0.04em] text-muted-foreground text-[10px]">
                    {messages.turnoverLabel}
                  </p>
                  <p className="mt-auto whitespace-nowrap pt-1 font-semibold tracking-[-0.01em] text-foreground text-[13px] sm:text-[14px]">
                    {formatTurnoverAmount(marketOverview.turnoverAmount, locale)}
                  </p>
                </div>
                <div className="flex min-w-0 flex-col">
                  {(() => {
                    const turnoverTrend = getTurnoverTrend(marketOverview.turnoverDelta);
                    const turnoverTrendLabel =
                      turnoverTrend === "up"
                        ? messages.turnoverIncreaseLabel
                        : turnoverTrend === "down"
                          ? messages.turnoverDecreaseLabel
                          : messages.turnoverFlatLabel;
                    const turnoverTrendColor =
                      turnoverTrend === "up"
                        ? riseTextClass
                        : turnoverTrend === "down"
                          ? fallTextClass
                          : "text-muted-foreground";
                    return (
                      <>
                        <p className="text-[10px] leading-tight tracking-[0.04em] text-muted-foreground">
                          {messages.comparedToYesterdayLabel}
                          <span className={cn("ml-1 font-semibold", turnoverTrendColor)}>
                            {turnoverTrendLabel}
                          </span>
                        </p>
                        <p
                          className={cn(
                            "mt-auto whitespace-nowrap pt-1 font-semibold tracking-[-0.01em] text-[13px] sm:text-[14px]",
                            turnoverTrendColor
                          )}
                        >
                          {formatTurnoverAmount(Math.abs(marketOverview.turnoverDelta), locale)}
                        </p>
                      </>
                    );
                  })()}
                </div>
              </div>

              {treemapData?.source === "fallback" && (
                <p className="mt-2.5 text-muted-foreground text-[11px] leading-5">
                  {messages.fallbackDataLabel}
                </p>
              )}
            </div>
          )}
        </div>

        {/* 底部操作按钮（玻璃风格） */}
        <div className="grid grid-cols-1 gap-1.5 p-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="ios26-glass-hover justify-start rounded-[10px] border-none bg-[var(--ios26-glass-bg)] text-foreground hover:bg-[var(--ios26-glass-bg-hover)]"
            onClick={onResetView}
          >
            <RotateCcw className="mr-2 size-4" />
            {messages.resetView}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="ios26-glass-hover justify-start rounded-[10px] border-none bg-[var(--ios26-glass-bg)] text-foreground hover:bg-[var(--ios26-glass-bg-hover)]"
            onClick={onToggleFullscreen}
          >
            <Maximize2 className="mr-2 size-4" />
            {messages.enterFullscreen}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="ios26-glass-hover justify-start rounded-[10px] border-none bg-[var(--ios26-glass-bg)] text-foreground hover:bg-[var(--ios26-glass-bg-hover)]"
            onClick={onOpenSettings}
          >
            <Settings2 className="mr-2 size-4" />
            {messages.settingsTitle}
          </Button>
        </div>
      </aside>
    </>
  );
}
