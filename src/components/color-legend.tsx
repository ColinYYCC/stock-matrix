"use client";

import { TrendingDown, TrendingUp, Info, Share2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCompactChange } from "@/lib/format";
import {
  getLegendGradient,
  getRiseTextClass,
  getFallTextClass,
  legendTicks,
} from "@/lib/heatmap-color";
import type { HeatmapMessages } from "@/lib/i18n";
import type { PriceColorMode } from "@/types/heatmap";

/** 底部涨跌图例 + 操作提示 + 截图分享按钮 */
export function ColorLegend({
  messages,
  priceColorMode,
  isLightMode,
  areaTipMessage,
  isMobile,
  sharePending,
  onOpenTips,
  onShare,
  githubUrl,
}: {
  messages: HeatmapMessages;
  priceColorMode: PriceColorMode;
  isLightMode: boolean;
  areaTipMessage: string;
  isMobile: boolean;
  sharePending: boolean;
  onOpenTips: () => void;
  onShare: () => void;
  githubUrl: string;
}) {
  const legendGradient = getLegendGradient(priceColorMode);
  const riseTextClass = getRiseTextClass(priceColorMode);
  const fallTextClass = getFallTextClass(priceColorMode);

  return (
    <div
      className={cn(
        "col-span-1 row-start-2 border-t border-border px-3 py-1.5 sm:px-4 md:col-start-2",
        isLightMode ? "bg-card/95" : "bg-[#151a21]"
      )}
    >
      <div className="flex items-center justify-between gap-2 sm:gap-3">
        {/* 左侧：操作提示 + GitHub 链接 */}
        <div className="flex min-w-0 items-center gap-2">
          <div className="group relative shrink-0">
            <button
              type="button"
              aria-label={messages.operationTipsTitle}
              onClick={onOpenTips}
              className={cn(
                "inline-flex size-7 items-center justify-center bg-transparent transition-colors hover:text-brand focus-visible:text-brand",
                isLightMode
                  ? "text-muted-foreground hover:bg-muted focus-visible:bg-muted"
                  : "text-slate-400 hover:bg-white/5 focus-visible:bg-white/5"
              )}
            >
              <Info className="size-3.5" />
            </button>
            <div
              className={cn(
                "pointer-events-none absolute bottom-full left-0 z-40 mb-2 w-64 border p-2 text-[11px] leading-5 opacity-0 shadow-[0_18px_48px_rgba(0,0,0,0.35)] backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
                isLightMode
                  ? "border-border bg-popover/96 text-popover-foreground"
                  : "border-slate-700/90 bg-[#0f1319]/96 text-slate-300"
              )}
            >
              <p>{areaTipMessage.replace(/^·\s*/, "")}</p>
              <p>{messages.tipColor.replace(/^·\s*/, "")}</p>
              <p>{(isMobile ? messages.tipTap : messages.tipDoubleClick).replace(/^·\s*/, "")}</p>
              <p>{(isMobile ? messages.tipPinch : messages.tipZoom).replace(/^·\s*/, "")}</p>
              <p>{messages.tipDrag.replace(/^·\s*/, "")}</p>
              <p>{messages.tipInspectorScroll.replace(/^·\s*/, "")}</p>
              <p>{messages.tipFullscreen.replace(/^·\s*/, "")}</p>
            </div>
          </div>

          <a
            href={githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={messages.githubProject}
            title={messages.githubProject}
            className={cn(
              "inline-flex size-7 shrink-0 items-center justify-center bg-transparent transition-colors hover:text-brand focus-visible:text-brand",
              isLightMode
                ? "text-muted-foreground hover:bg-muted focus-visible:bg-muted"
                : "text-slate-400 hover:bg-white/5 focus-visible:bg-white/5"
            )}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="size-3.5">
              <path d="M12 .5C5.65.5.5 5.66.5 12.03c0 5.1 3.3 9.43 7.87 10.95.58.1.79-.25.79-.56l-.02-2.16c-3.2.7-3.88-1.55-3.88-1.55-.52-1.34-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.03 1.78 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.3 1.19-3.1-.12-.3-.52-1.5.11-3.13 0 0 .97-.31 3.19 1.18a10.9 10.9 0 0 1 5.8 0c2.21-1.5 3.18-1.18 3.18-1.18.64 1.63.24 2.83.12 3.13.74.8 1.18 1.84 1.18 3.1 0 4.43-2.69 5.4-5.25 5.68.41.36.78 1.08.78 2.18l-.01 3.23c0 .31.2.67.8.55A11.54 11.54 0 0 0 23.5 12.03C23.5 5.66 18.35.5 12 .5Z" />
            </svg>
          </a>
        </div>

        {/* 右侧：图例渐变色条 + 分享按钮 */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex w-36 items-center gap-1.5 sm:w-52 md:w-56">
            <TrendingDown className={cn("size-3 shrink-0", fallTextClass)} aria-label={messages.legendFall} />
            <div className="relative flex-1">
              <div
                className="h-3.5 w-full rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
                style={{ background: legendGradient }}
              />
              <div
                className="pointer-events-none absolute inset-0 flex items-center justify-between px-1 text-[8px] font-semibold tabular-nums leading-none text-white md:text-[9px]"
                style={{ textShadow: "0 1px 2px rgba(0, 0, 0, 0.55)" }}
              >
                {legendTicks.map((tick) => (
                  <span key={tick}>{tick === 0 ? "0" : formatCompactChange(tick)}</span>
                ))}
              </div>
            </div>
            <TrendingUp className={cn("size-3 shrink-0", riseTextClass)} aria-label={messages.legendRise} />
          </div>

          <button
            type="button"
            onClick={onShare}
            disabled={sharePending}
            aria-label={sharePending ? messages.generatingShareImage : messages.shareToApps}
            title={messages.shareImage}
            className="inline-flex items-center gap-1 rounded-[14px] bg-brand px-1.5 py-1 text-[10px] font-semibold text-brand-foreground shadow-[0_2px_8px_color-mix(in_srgb,var(--brand)_38%,transparent)] transition-all hover:bg-brand/90 disabled:opacity-60 sm:px-2 sm:text-[11px]"
          >
            <Share2 className="size-3" />
            <span className="hidden sm:inline">
              {sharePending ? messages.generatingShareImage : messages.shareToApps}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
