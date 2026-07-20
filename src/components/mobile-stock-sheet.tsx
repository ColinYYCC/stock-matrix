"use client";

import { ExternalLink, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatPrice, formatChange } from "@/lib/format";
import { getChangeTextClass } from "@/lib/heatmap-color";
import { getSparklineUrl, getDailyKlineUrl } from "@/lib/stock-image";
import type { HeatmapMessages } from "@/lib/i18n";
import type { PriceColorMode } from "@/types/heatmap";

/** 移动端个股详情面板中单只股票的信息 */
type MobileStockSheetStock = {
  code: string;
  name: string;
  subBoardName: string;
  price: number;
  changePct: number;
  active?: boolean;
};

/** 移动端个股详情面板属性 */
type MobileStockSheetProps = {
  title: string | null;
  stock: MobileStockSheetStock | null;
  stocks: MobileStockSheetStock[];
  messages: HeatmapMessages;
  priceColorMode: PriceColorMode;
  onClose: () => void;
  onSelectStock: (code: string) => void;
  onOpenXueqiu: (code: string) => void;
};

/**
 * 移动端个股详情面板
 *
 * 手机上点击股票色块后，从屏幕底部弹出，包含：
 * - 当前个股：名称、价格、涨跌幅
 * - 新浪日线 K 线图
 * - 雪球跳转按钮
 * - 同板块个股列表（可点击切换查看）
 */
export function MobileStockSheet({
  title,
  stock,
  stocks,
  messages,
  priceColorMode,
  onClose,
  onSelectStock,
  onOpenXueqiu,
}: MobileStockSheetProps) {
  return (
    <div className="fixed inset-0 z-[9998] flex flex-col justify-end" role="dialog" aria-modal="true">
      {/* 点击遮罩层关闭面板 */}
      <button
        type="button"
        aria-label={messages.closeSheet}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="relative flex max-h-[82vh] w-full flex-col rounded-t-2xl border-t border-slate-700/80 bg-[#0f1319] text-slate-100 shadow-[0_-20px_60px_rgba(0,0,0,0.5)]">
        {/* 顶部拖拽指示条 */}
        <div className="flex items-center justify-center pt-2">
          <span className="h-1 w-10 rounded-full bg-slate-600/80" aria-hidden />
        </div>

        {/* 个股信息头部 */}
        <div className="flex items-start justify-between gap-3 px-4 pt-2 pb-3">
          <div className="min-w-0">
            <p className="text-[12px] font-medium tracking-[0.04em] text-slate-400">{title ?? ""}</p>
            {stock ? (
              <>
                <p className="mt-1 text-[18px] font-semibold leading-tight text-white [word-break:keep-all]">
                  {stock.name}
                </p>
                <div className="mt-1 flex items-baseline gap-3 tabular-nums">
                  <span className="text-[20px] font-semibold text-white">{formatPrice(stock.price)}</span>
                  <span
                    className={cn(
                      "text-[15px] font-semibold",
                      getChangeTextClass(stock.changePct, priceColorMode)
                    )}
                  >
                    {formatChange(stock.changePct)}
                  </span>
                </div>
              </>
            ) : (
              <p className="mt-1 text-[13px] text-slate-400">{messages.mobileTapHint}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={messages.closeSheet}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-slate-700/80 bg-slate-800/60 text-slate-200 transition-colors hover:bg-slate-700/80"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* 日线 K 线图 + 雪球跳转按钮 */}
        {stock && (
          <>
            <div className="mx-4 mb-3 overflow-hidden rounded-md border border-slate-700/80 bg-white">
              <img
                src={getDailyKlineUrl(stock.code)}
                alt={`${stock.name} K-line`}
                className="h-auto w-full object-contain"
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onError={(event) => { event.currentTarget.style.visibility = "hidden"; }}
              />
            </div>

            <div className="flex items-center justify-between gap-2 px-4 pb-3">
              <button
                type="button"
                onClick={() => onOpenXueqiu(stock.code)}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-[13px] font-medium text-slate-100 transition-colors hover:bg-slate-700/80"
              >
                <ExternalLink className="size-3.5" />
                {messages.mobileOpenInXueqiu}
              </button>
            </div>
          </>
        )}

        {/* 同板块个股列表，点击可切换查看 */}
        {stocks.length > 0 && (
          <div className="flex min-h-0 flex-1 flex-col border-t border-slate-700/80 bg-[#0b0e13]">
            <div className="flex items-center justify-between px-4 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400">
              <span>{title ?? ""}</span>
              <span className="tabular-nums">{stocks.length}</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
              {stocks.map((item) => {
                const isActive = stock?.code === item.code;
                return (
                  <button
                    type="button"
                    key={item.code}
                    onClick={() => onSelectStock(item.code)}
                    className={cn(
                      "flex w-full items-center gap-3 border-b border-slate-800/80 px-4 py-2.5 text-left text-[13px] transition-colors",
                      isActive ? "bg-slate-800/70" : "hover:bg-slate-800/40"
                    )}
                  >
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate font-medium",
                        isActive ? "text-white" : "text-slate-200"
                      )}
                    >
                      {item.name}
                    </span>
                    <img
                      src={getSparklineUrl(item.code)}
                      alt=""
                      className="h-5 w-[72px] shrink-0 object-contain opacity-90"
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      onError={(event) => { event.currentTarget.style.visibility = "hidden"; }}
                    />
                    <span className="w-14 shrink-0 text-right text-[12px] tabular-nums text-slate-300">
                      {formatPrice(item.price)}
                    </span>
                    <span
                      className={cn(
                        "w-16 shrink-0 text-right text-[12px] font-semibold tabular-nums",
                        getChangeTextClass(item.changePct, priceColorMode)
                      )}
                    >
                      {formatChange(item.changePct)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
