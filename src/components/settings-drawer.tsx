"use client";

import {
  Moon,
  Palette,
  Sun,
  X,
  ExternalLink,
  Info,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { HeatmapMessages } from "@/lib/i18n";
import type { DisplayMode, PriceColorMode } from "@/types/heatmap";
import type { DesignStyle } from "@/hooks/use-design-style";
import { skins } from "@/components/skin";

/** 设置面板的标签页类型 */
export type SettingsTab = "appearance" | "help" | "project";

/** 设置面板属性（classic / ios26 双皮肤共用，样式差异全部来自 skin.ts） */
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

/** 设置面板：外观（界面风格/显示模式/涨跌颜色）、帮助、项目三个标签页 */
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

  const skin = skins[designStyle].settingsDrawer;

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
    <div className={skin.overlay} role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0" aria-label={messages.closeSheet} onClick={onClose} />
      <section className={skin.panel}>
        <div className="flex items-center justify-center pt-2">
          <span className="h-1 w-10 rounded-full bg-muted-foreground/40" aria-hidden />
        </div>
        <header className={skin.header}>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold leading-tight">{messages.settingsTitle}</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{messages.settingsDescription}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={messages.closeSheet} className={skin.closeButton}>
            <X className="size-4" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-rows-[48px_minmax(0,1fr)] md:grid-cols-[168px_minmax(0,1fr)] md:grid-rows-1">
          <nav className={skin.nav}>
            {tabs.map((item) => {
              const Icon = item.icon;
              const active = tab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onTabChange(item.key)}
                  className={cn(skin.tabButtonBase, active ? skin.tabButtonActive : skin.tabButtonInactive)}
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
                {/* 界面风格切换：iOS 26 液态玻璃 / 经典 */}
                <section>
                  <h3 className="text-sm font-semibold">{messages.designStyleLabel}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {messages.designStyleDescription}
                  </p>
                  <div className={skin.optionGroup}>
                    <button
                      type="button"
                      onClick={() => onDesignStyleChange("ios26")}
                      aria-pressed={designStyle === "ios26"}
                      className={cn(
                        skin.optionButtonBase,
                        designStyle === "ios26" ? skin.optionButtonActive : skin.optionButtonInactive
                      )}
                    >
                      <span className="size-2.5 rounded-full bg-gradient-to-br from-cyan-400 to-purple-500" />
                      {messages.designStyleIOS26}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDesignStyleChange("classic")}
                      aria-pressed={designStyle === "classic"}
                      className={cn(
                        skin.optionButtonBase,
                        designStyle === "classic" ? skin.optionButtonActive : skin.optionButtonInactive
                      )}
                    >
                      <span className="size-2.5 rounded-full bg-slate-500" />
                      {messages.designStyleClassic}
                    </button>
                  </div>
                </section>

                <section>
                  <h3 className="text-sm font-semibold">{messages.displayMode}</h3>
                  <div className={skin.optionGroup}>
                    <button
                      type="button"
                      onClick={() => onDisplayModeChange("light")}
                      aria-pressed={displayMode === "light"}
                      className={cn(
                        skin.optionButtonBase,
                        displayMode === "light" ? skin.optionButtonActive : skin.optionButtonInactive
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
                        skin.optionButtonBase,
                        displayMode === "dark" ? skin.optionButtonActive : skin.optionButtonInactive
                      )}
                    >
                      <Moon className="size-4 shrink-0" />
                      {messages.darkMode}
                    </button>
                  </div>
                </section>

                <section>
                  <h3 className="text-sm font-semibold">{messages.priceColor}</h3>
                  <div className={skin.optionGroup}>
                    <button
                      type="button"
                      onClick={() => onPriceColorModeChange("red-rise")}
                      aria-pressed={priceColorMode === "red-rise"}
                      className={cn(
                        skin.colorOptionButtonBase,
                        priceColorMode === "red-rise"
                          ? skin.colorOptionButtonActive
                          : skin.colorOptionButtonInactive
                      )}
                    >
                      <span className="font-semibold text-red-400">{messages.redRiseGreenFall}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onPriceColorModeChange("green-rise")}
                      aria-pressed={priceColorMode === "green-rise"}
                      className={cn(
                        skin.colorOptionButtonBase,
                        priceColorMode === "green-rise"
                          ? skin.colorOptionButtonActive
                          : skin.colorOptionButtonInactive
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
                    <div key={item} className={skin.helpItem}>
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
                  className={skin.githubLink}
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
