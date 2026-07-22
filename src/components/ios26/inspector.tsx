"use client";

import { forwardRef } from "react";

import { cn } from "@/lib/utils";
import { formatPrice, formatChange } from "@/lib/format";
import { getChangeTextClass } from "@/lib/heatmap-color";
import { getSparklineUrl, getDailyKlineUrl } from "@/lib/stock-image";
import type { HeatmapMessages } from "@/lib/i18n";
import type { PriceColorMode } from "@/types/heatmap";

/** 悬浮面板中单只股票的信息 */
type InspectorStock = {
  code: string;
  name: string;
  subBoardName: string;
  price: number;
  changePct: number;
  active: boolean;
};

/** 悬浮详情面板的样式定位信息 */
export type InspectorStyle = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
} | null;

/** 悬浮详情面板属性 */
type InspectorProps = {
  style: InspectorStyle;
  title: string | null;
  stock: InspectorStock | null;
  stocks: InspectorStock[];
  messages: HeatmapMessages;
  priceColorMode: PriceColorMode;
  listMaxHeight: number;
};

/**
 * iOS 26 Liquid Glass 风格悬浮详情面板
 *
 * 和原版 Inspector 的逻辑、属性完全一样，只是把外观换成毛玻璃风格。
 * 鼠标悬浮在个股色块上时显示，包含个股信息、分时图、K 线图、同板块个股列表。
 */
export const Inspector = forwardRef<HTMLDivElement, InspectorProps>(function Inspector(
  { style, title, stock, stocks, messages, priceColorMode, listMaxHeight },
  listRef
) {
  if (!style) return null;

  return (
    <aside
      className="ios26-glass pointer-events-none absolute z-30 overflow-hidden rounded-3xl text-slate-100"
      style={{
        left: style.left,
        top: style.top,
        width: style.width,
        minWidth: style.width,
        maxHeight: style.maxHeight,
      }}
    >
      {stock && (
        <>
          {/* 个股信息头部：用品牌色作底，和原版一致 */}
          <div className="bg-[#356e57] px-3 py-2.5">
            <p className="text-[13px] font-semibold tracking-[0.02em] text-slate-100">
              {title ?? ""}
            </p>
            <div className="mt-2.5 grid grid-cols-[minmax(0,1fr)_94px] items-end gap-3">
              <div className="min-w-0">
                <p className="text-[18px] font-semibold leading-[1.08] text-white [word-break:keep-all]">
                  {stock.name}
                </p>
                <img
                  src={getSparklineUrl(stock.code)}
                  alt=""
                  className="mt-1.5 h-7 w-[86px] object-contain opacity-90"
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  onError={(event) => { event.currentTarget.style.visibility = "hidden"; }}
                />
              </div>
              <div className="text-right">
                <p className="text-[17px] font-semibold tabular-nums text-white">
                  {formatPrice(stock.price)}
                </p>
                <p
                  className={cn(
                    "mt-0.5 text-[16px] font-semibold tabular-nums",
                    getChangeTextClass(stock.changePct, priceColorMode, "soft")
                  )}
                >
                  {formatChange(stock.changePct)}
                </p>
              </div>
            </div>
          </div>

          {/* 日线 K 线图 */}
          <div className="border-b border-[var(--ios26-glass-border)] bg-white p-1.5">
            <img
              src={getDailyKlineUrl(stock.code)}
              alt={`${stock.name} K-line`}
              className="h-auto w-full bg-white object-contain"
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={(event) => { event.currentTarget.style.visibility = "hidden"; }}
            />
          </div>

          {/* 同板块个股列表 */}
          <div className="bg-[#f4f6f7] text-slate-900">
            <div className="flex items-center justify-between border-b border-slate-300/70 px-3 py-1.5 text-[11px] font-medium tracking-[0.08em] text-slate-500">
              <span>{title ?? ""}</span>
              <div className="flex items-center gap-2 text-right">
                <span className="text-[10px] font-medium tracking-[0.03em] text-slate-400">
                  {messages.inspectorScrollHint}
                </span>
                <span>{stocks.length}</span>
              </div>
            </div>
            <div
              ref={listRef}
              className="overflow-y-auto"
              style={{ maxHeight: listMaxHeight }}
            >
              {stocks.map((item) => {
                const isActive = item.active;
                return (
                  <div
                    key={item.code}
                    className={cn(
                      "grid grid-cols-[minmax(0,1fr)_56px_64px_80px] items-center gap-2 border-b border-slate-300/70 px-3 py-1.5 text-[12.5px]",
                      isActive && "bg-slate-100"
                    )}
                  >
                    <span
                      className={cn(
                        "min-w-0 pr-1 font-medium leading-[1.2] [word-break:keep-all]",
                        isActive && "font-semibold"
                      )}
                    >
                      {item.name}
                    </span>
                    <img
                      src={getSparklineUrl(item.code)}
                      alt=""
                      className="h-5 w-full object-contain"
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      onError={(event) => { event.currentTarget.style.visibility = "hidden"; }}
                    />
                    <span className="text-right text-[11.5px] font-medium tabular-nums text-slate-700">
                      {formatPrice(item.price)}
                    </span>
                    <span
                      className={cn(
                        "text-right text-[11.5px] font-medium tabular-nums",
                        getChangeTextClass(item.changePct, priceColorMode, "strong")
                      )}
                    >
                      {formatChange(item.changePct)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </aside>
  );
});
