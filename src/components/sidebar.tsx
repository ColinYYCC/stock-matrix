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
} from "@/types/heatmap";
import type { TreemapResponse } from "@/types/heatmap";
import type { DesignStyle } from "@/hooks/use-design-style";
import { skins } from "@/components/skin";

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

/** 根据成交额趋势返回标签文字 */
function getTrendLabel(trend: ReturnType<typeof getTurnoverTrend>, messages: HeatmapMessages): string {
  if (trend === "up") return messages.turnoverIncreaseLabel;
  if (trend === "down") return messages.turnoverDecreaseLabel;
  if (trend === "unknown") return messages.turnoverNoComparisonLabel;
  return messages.turnoverFlatLabel;
}

/** 根据成交额趋势返回颜色类名 */
function getTrendColor(trend: ReturnType<typeof getTurnoverTrend>, riseTextClass: string, fallTextClass: string): string {
  if (trend === "up") return riseTextClass;
  if (trend === "down") return fallTextClass;
  return "text-muted-foreground";
}

/** 侧边栏属性（classic / ios26 双皮肤共用，样式差异全部来自 skin.ts） */
type SidebarProps = {
  messages: HeatmapMessages;
  locale: "zh" | "en";
  market: MarketKey;
  period: HeatmapPeriodKey;
  boardFilter: string;
  subBoardFilter: string | null;
  trendFilter: string;
  priceColorMode: PriceColorMode;
  designStyle: DesignStyle;
  marketSummaries: Partial<Record<MarketKey, MarketSummary>>;
  treemapData: TreemapResponse | null;
  marketOverview: MarketOverview | null;
  updatedAt: string;
  isTrading: boolean;
  sidebarOpen: boolean;
  isFullscreen: boolean;
  onMarketChange: (market: MarketKey) => void;
  onPeriodChange: (period: HeatmapPeriodKey) => void;
  onBoardFilterChange: (value: string) => void;
  onSubBoardFilterChange: (value: string | null) => void;
  onTrendFilterChange: (value: string) => void;
  onResetView: () => void;
  onToggleFullscreen: () => void;
  onOpenSettings: () => void;
  onCloseSidebar: () => void;
};

/** 侧边栏组件：市场切换、周期切换、筛选器、市场概览 */
export function Sidebar({
  messages,
  locale,
  market,
  period,
  boardFilter,
  subBoardFilter,
  trendFilter,
  priceColorMode,
  designStyle,
  marketSummaries,
  treemapData,
  marketOverview,
  updatedAt,
  isTrading,
  sidebarOpen,
  isFullscreen,
  onMarketChange,
  onPeriodChange,
  onBoardFilterChange,
  onSubBoardFilterChange,
  onTrendFilterChange,
  onResetView,
  onToggleFullscreen,
  onOpenSettings,
  onCloseSidebar,
}: SidebarProps) {
  if (isFullscreen) return null;

  const skin = skins[designStyle].sidebar;

  // 显示数据的真实时间戳（北京时间），而非客户端当前时间
  // 超过 24 小时时显示日期+时间，否则只显示时间
  const displayTimeText = (() => {
    if (!updatedAt) return "--:--:--";
    const dataTime = new Date(updatedAt);
    if (isNaN(dataTime.getTime())) return "--:--:--";
    const now = new Date();
    const isSameDay = dataTime.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' }) === now.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });
    if (isSameDay) {
      return dataTime.toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    return dataTime.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  })();
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
          className={skin.overlay}
        />
      )}

      <aside
        className={cn(
          "row-start-1 flex min-h-0 min-w-0 flex-col text-card-foreground",
          skin.asideSurface,
          // 移动端：从左边滑入的抽屉
          "fixed inset-y-0 left-0 z-50 w-[280px] transform transition-transform duration-300 motion-reduce:transition-none",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
          // 桌面端：固定在网格里
          "md:static md:z-auto md:row-span-2 md:w-auto md:translate-x-0 md:transition-none",
          skin.asideDesktopExtra
        )}
      >
        {/* 标题栏 */}
        <div className={skin.header}>
          <div className="flex min-w-0 items-center gap-2">
            <img src="/icon.svg" alt="" className="size-7 shrink-0" decoding="async" />
            <h2 className="min-w-0 truncate whitespace-nowrap font-semibold leading-tight text-[13px] sm:text-sm">
              {messages.title}
            </h2>
          </div>
          <button type="button" onClick={onCloseSidebar} aria-label={messages.collapseSidebar} className={skin.closeButton}>
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden px-1.5 py-1.5 sm:px-2">
          {/* 最近刷新时间 + 交易状态 */}
          <div className={skin.statusPill}>
            <div className="flex items-center gap-1.5">
              {/* 交易状态点 */}
              <div
                className={cn(
                  "size-1.5 rounded-full",
                  isTrading ? "motion-safe:animate-pulse" : ""
                )}
                style={{
                  backgroundColor: isTrading
                    ? "var(--brand)"
                    : "var(--muted-foreground)",
                }}
              />
              <span className={cn(
                "font-semibold text-[9px]",
                isTrading ? "text-foreground" : "text-muted-foreground"
              )}>
                {isTrading ? messages.marketOpen : messages.marketClosed}
              </span>
            </div>
            <span className={cn(
              "font-semibold tabular-nums text-[10px]",
              !isTrading && "text-muted-foreground"
            )}>
              {displayTimeText}
            </span>
          </div>

          {/* 市场范围切换 */}
          <div className={skin.marketList}>
            {marketOptions.map((option) => {
              const summary = marketSummaries[option];
              const isActive = market === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => onMarketChange(option)}
                  className={cn(
                    skin.marketButtonBase,
                    isActive ? skin.marketButtonActive : skin.marketButtonInactive
                  )}
                >
                  <span className="min-w-0 pr-2 leading-tight text-[12px]">
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

          {/* 一级板块筛选 */}
          <div className={skin.groupCard}>
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
              className={skin.boardSelect}
            >
              <option value={allBoardsValue}>{messages.allBoards}</option>
              {boardFilterOptions.map((board) => (
                <option key={board.code} value={board.name}>
                  {board.name} ({board.stockCount})
                </option>
              ))}
            </select>
            {subBoardFilter && (
              <div className={skin.subBoardChip}>
                <span className="min-w-0 truncate font-semibold text-[11px] text-foreground">{subBoardFilter}</span>
                <button
                  type="button"
                  onClick={() => onSubBoardFilterChange(null)}
                  className="ml-1 shrink-0 p-2 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="清除子板块筛选"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* 涨跌筛选 */}
          <div className={skin.groupCard}>
            <label
              htmlFor="trend-filter"
              className="block font-semibold uppercase tracking-[0.12em] text-muted-foreground text-[10px]"
            >
              {messages.trendFilterLabel}
            </label>
            <div className={skin.trendSegment}>
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
                    skin.trendButtonBase,
                    trendFilter === option.value ? skin.trendButtonActive : skin.trendButtonInactive
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* 涨跌周期切换 */}
          <div className={skin.groupCard}>
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold uppercase tracking-[0.12em] text-muted-foreground text-[10px]">
                {messages.metricLabel}
              </p>
              <span className="shrink-0 text-right font-semibold tabular-nums text-foreground text-[10.5px]">
                {getPeriodLabel(period, messages)}
              </span>
            </div>
            <div className={skin.periodSegment}>
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
                      skin.periodButtonBase,
                      isActive ? skin.periodButtonActive : skin.periodButtonInactive
                    )}
                  >
                    {getCompactPeriodLabel(option)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 市场概览统计 */}
          {marketOverview && (
            <div className={skin.statsCard}>
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
              <div className={skin.turnoverDivider}>
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
                    const trendLabel = getTrendLabel(turnoverTrend, messages);
                    const trendColor = getTrendColor(turnoverTrend, riseTextClass, fallTextClass);
                    return (
                      <>
                        <p className="text-[10px] leading-tight tracking-[0.04em] text-muted-foreground">
                          {messages.comparedToYesterdayLabel}
                          <span className={cn("ml-1 font-semibold", trendColor)}>
                            {trendLabel}
                          </span>
                        </p>
                        <p
                          className={cn(
                            "mt-auto whitespace-nowrap pt-1 font-semibold tracking-[-0.01em] text-[13px] sm:text-[14px]",
                            trendColor
                          )}
                        >
                          {turnoverTrend === "unknown"
                            ? messages.turnoverNoComparisonLabel
                            : formatTurnoverAmount(Math.abs(marketOverview.turnoverDelta), locale)}
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

        {/* 底部操作按钮 */}
        <div className={skin.actionArea}>
          <Button
            variant={skin.actionButton.variant}
            size="sm"
            className={skin.actionButton.className}
            onClick={onResetView}
          >
            <RotateCcw className="mr-2 size-4" />
            {messages.resetView}
          </Button>
          <Button
            variant={skin.actionButton.variant}
            size="sm"
            className={skin.actionButton.className}
            onClick={onToggleFullscreen}
          >
            <Maximize2 className="mr-2 size-4" />
            {messages.enterFullscreen}
          </Button>
          <Button
            variant={skin.actionButton.variant}
            size="sm"
            className={skin.actionButton.className}
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
