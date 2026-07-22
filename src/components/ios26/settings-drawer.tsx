"use client";

import {
  Moon,
  Palette,
  Settings2,
  Sun,
  X,
  ExternalLink,
  Info,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { HeatmapMessages } from "@/lib/i18n";
import type { DisplayMode, PriceColorMode } from "@/types/heatmap";
import type { DesignStyle } from "@/hooks/use-design-style";

/** 设置面板的标签页类型 */
type SettingsTab = "appearance" | "help" | "project";

/** 设置面板属性 */
type SettingsDrawerProps = {
  open: boolean;
  tab: SettingsTab;
  messages: HeatmapMessages;
  displayMode: DisplayMode;
  priceColorMode: PriceColorMode;
  designStyle: DesignStyle;
  areaTipMessage: string;
  onClose: () => void;
  onTabChange: (tab: SettingsTab) => void;
  onDisplayModeChange: (mode: DisplayMode) => void;
  onPriceColorModeChange: (mode: PriceColorMode) => void;
  onDesignStyleChange: (style: DesignStyle) => void;
};

/**
 * iOS 26 Liquid Glass 风格设置面板
 *
 * 和原版 SettingsDrawer 的逻辑基本一样，只是：
 * 1. 外观换成毛玻璃风格
 * 2. 外观标签页里多了一个「界面风格」切换（iOS 26 / 经典）
 */
export function SettingsDrawer({
  open,
  tab,
  messages,
  displayMode,
  priceColorMode,
  designStyle,
  areaTipMessage,
  onClose,
  onTabChange,
  onDisplayModeChange,
  onPriceColorModeChange,
  onDesignStyleChange,
}: SettingsDrawerProps) {
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
    <div className="absolute inset-0 z-[10010] flex items-end justify-center bg-black/40 backdrop-blur-sm" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0" aria-label={messages.closeSheet} onClick={onClose} />
      {/* 底部弹出面板：毛玻璃风格 */}
      <section className="ios26-glass relative flex h-[82dvh] w-full flex-col overflow-hidden rounded-t-3xl text-card-foreground">
        <div className="flex items-center justify-center pt-2">
          <span className="h-1 w-10 rounded-full bg-muted-foreground/40" aria-hidden />
        </div>
        <header className="flex items-start justify-between gap-3 border-b border-[var(--ios26-glass-border)] px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-tight">{messages.settingsTitle}</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{messages.settingsDescription}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={messages.closeSheet}
            className="ios26-glass-hover inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-rows-[48px_minmax(0,1fr)] md:grid-cols-[168px_minmax(0,1fr)] md:grid-rows-1">
          {/* 标签页导航 */}
          <nav className="ios26-glass-segmented flex h-12 min-h-12 gap-1 overflow-x-auto overflow-y-hidden px-2 py-1.5 md:h-auto md:min-h-0 md:flex-col md:overflow-x-visible md:p-2">
            {tabs.map((item) => {
              const Icon = item.icon;
              const active = tab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onTabChange(item.key)}
                  className={cn(
                    "ios26-glass-hover inline-flex h-9 shrink-0 items-center gap-2 rounded-[7px] border-none px-3 text-left text-sm font-medium leading-none transition-all md:w-full",
                    active
                      ? "ios26-glass-active text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="whitespace-nowrap">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* 标签页内容 */}
          <div className="min-h-0 overflow-y-auto p-4">
            {tab === "appearance" && (
              <div className="space-y-6">
                {/* 界面风格切换：iOS 26 / 经典 */}
                <section>
                  <h3 className="text-sm font-semibold">界面风格</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    切换 iOS 26 液态玻璃风格和经典风格
                  </p>
                  <div className="ios26-glass-segmented mt-3 grid gap-2 rounded-[9px] p-1 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => onDesignStyleChange("ios26")}
                      aria-pressed={designStyle === "ios26"}
                      className={cn(
                        "ios26-glass-hover flex items-center gap-2 rounded-[7px] border-none px-3 py-3 text-left text-sm font-semibold transition-all",
                        designStyle === "ios26"
                          ? "ios26-glass-active text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <span className="size-2.5 rounded-full bg-gradient-to-br from-cyan-400 to-purple-500" />
                      iOS 26 液态玻璃
                    </button>
                    <button
                      type="button"
                      onClick={() => onDesignStyleChange("classic")}
                      aria-pressed={designStyle === "classic"}
                      className={cn(
                        "ios26-glass-hover flex items-center gap-2 rounded-[7px] border-none px-3 py-3 text-left text-sm font-semibold transition-all",
                        designStyle === "classic"
                          ? "ios26-glass-active text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <span className="size-2.5 rounded-full bg-slate-500" />
                      经典风格
                    </button>
                  </div>
                </section>

                {/* 显示模式：亮色 / 暗色 */}
                <section>
                  <h3 className="text-sm font-semibold">{messages.displayMode}</h3>
                  <div className="ios26-glass-segmented mt-3 grid gap-2 rounded-[9px] p-1 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => onDisplayModeChange("light")}
                      aria-pressed={displayMode === "light"}
                      className={cn(
                        "ios26-glass-hover flex items-center gap-2 rounded-[7px] border-none px-3 py-3 text-left text-sm font-semibold transition-all",
                        displayMode === "light"
                          ? "ios26-glass-active text-foreground"
                          : "text-muted-foreground hover:text-foreground"
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
                        "ios26-glass-hover flex items-center gap-2 rounded-[7px] border-none px-3 py-3 text-left text-sm font-semibold transition-all",
                        displayMode === "dark"
                          ? "ios26-glass-active text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Moon className="size-4 shrink-0" />
                      {messages.darkMode}
                    </button>
                  </div>
                </section>

                {/* 涨跌颜色 */}
                <section>
                  <h3 className="text-sm font-semibold">{messages.priceColor}</h3>
                  <div className="ios26-glass-segmented mt-3 grid gap-2 rounded-[9px] p-1 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => onPriceColorModeChange("red-rise")}
                      aria-pressed={priceColorMode === "red-rise"}
                      className={cn(
                        "ios26-glass-hover rounded-[7px] border-none px-3 py-3 text-left text-sm transition-all",
                        priceColorMode === "red-rise"
                          ? "ios26-glass-active"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <span className="font-semibold text-red-400">{messages.redRiseGreenFall}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onPriceColorModeChange("green-rise")}
                      aria-pressed={priceColorMode === "green-rise"}
                      className={cn(
                        "ios26-glass-hover rounded-[7px] border-none px-3 py-3 text-left text-sm transition-all",
                        priceColorMode === "green-rise"
                          ? "ios26-glass-active"
                          : "text-muted-foreground hover:text-foreground"
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
                    <div key={item} className="ios26-glass-card rounded-xl px-3 py-2 text-sm text-muted-foreground">
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
                  className="ios26-glass-hover mt-4 inline-flex items-center gap-2 rounded-[10px] border-none px-3 py-2 text-sm font-semibold text-foreground transition-colors"
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
