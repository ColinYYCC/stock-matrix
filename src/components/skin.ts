/**
 * 皮肤样式映射表（决策记录见 docs/adr/0001-dual-skin-merge.md）
 *
 * classic 与 ios26 两套皮肤的组件结构完全相同，差异只有 className。
 * 本表是唯一的样式差异来源：每个槽位 = 某个 UI 部位的完整 className。
 * 规则：
 * - 只有两套皮肤"不一样"的部分才进表；共同样式直接写在组件 JSX 里。
 * - 新增槽位时 classic / ios26 两列都必须写（skin.test.ts 会校验结构一致）。
 * - 纯色值优先引用 globals.css 的 --ios26-* CSS 变量，不在表里造第二份颜色。
 */
import type { DesignStyle } from "@/hooks/use-design-style";

export type Skin = {
  colorLegend: {
    /** 底部图例条容器（classic 的暗色底是独立色，故区分亮暗两个槽位） */
    containerLight: string;
    containerDark: string;
    /** 操作提示按钮（info 图标） */
    infoButtonLight: string;
    infoButtonDark: string;
    /** GitHub 链接按钮 */
    githubLinkLight: string;
    githubLinkDark: string;
    /** 悬浮提示气泡 */
    tooltipLight: string;
    tooltipDark: string;
    /** 截图分享按钮 */
    shareButton: string;
  };
  mobileStockSheet: {
    overlay: string;
    panel: string;
    closeButton: string;
    klineFrame: string;
    xueqiuButton: string;
    listSection: string;
    listRowBase: string;
    listRowActive: string;
    listRowInactive: string;
  };
  settingsDrawer: {
    overlay: string;
    panel: string;
    header: string;
    closeButton: string;
    nav: string;
    tabButtonBase: string;
    tabButtonActive: string;
    tabButtonInactive: string;
    /** 风格/显示模式选项的外层分组容器 */
    optionGroup: string;
    optionButtonBase: string;
    optionButtonActive: string;
    optionButtonInactive: string;
    /** 涨跌颜色选项（classic 版按钮样式与上面两组不同，单独成槽位） */
    colorOptionButtonBase: string;
    colorOptionButtonActive: string;
    colorOptionButtonInactive: string;
    helpItem: string;
    githubLink: string;
  };
  inspector: {
    panel: string;
    /** 个股信息头部（classic 有下边框，ios26 靠色块分节） */
    header: string;
    klineFrame: string;
  };
  sidebar: {
    overlay: string;
    /** 侧边栏本体在桌面网格中的外观部分（ios26 = 玻璃 + 圆角） */
    asideSurface: string;
    /** 侧边栏桌面端额外差异（classic 去阴影 / ios26 圆角） */
    asideDesktopExtra: string;
    header: string;
    closeButton: string;
    /** 交易状态 + 时间戳胶囊 */
    statusPill: string;
    /** 市场切换列表容器 */
    marketList: string;
    marketButtonBase: string;
    marketButtonActive: string;
    marketButtonInactive: string;
    /** 分组卡片（板块筛选/涨跌筛选/周期切换的外层） */
    groupCard: string;
    boardSelect: string;
    subBoardChip: string;
    trendSegment: string;
    trendButtonBase: string;
    trendButtonActive: string;
    trendButtonInactive: string;
    periodSegment: string;
    periodButtonBase: string;
    periodButtonActive: string;
    periodButtonInactive: string;
    /** 市场概览统计卡 */
    statsCard: string;
    turnoverDivider: string;
    /** 底部操作按钮区容器 */
    actionArea: string;
    /** 底部操作按钮（复用 ui/button，两套皮肤 variant 不同） */
    actionButton: { variant: "outline" | "ghost"; className: string };
  };
};

export const skins: Record<DesignStyle, Skin> = {
  classic: {
    colorLegend: {
      containerLight:
        "col-span-1 row-start-2 border-t border-border bg-card/95 px-3 py-1.5 sm:px-4 md:col-start-2",
      containerDark:
        "col-span-1 row-start-2 border-t border-border bg-[#151a21] px-3 py-1.5 sm:px-4 md:col-start-2",
      infoButtonLight:
        "inline-flex size-11 items-center justify-center bg-transparent transition-colors hover:text-brand focus-visible:text-brand md:size-7 text-muted-foreground hover:bg-muted focus-visible:bg-muted",
      infoButtonDark:
        "inline-flex size-11 items-center justify-center bg-transparent transition-colors hover:text-brand focus-visible:text-brand md:size-7 text-slate-400 hover:bg-white/5 focus-visible:bg-white/5",
      githubLinkLight:
        "inline-flex size-11 shrink-0 items-center justify-center bg-transparent transition-colors hover:text-brand focus-visible:text-brand md:size-7 text-muted-foreground hover:bg-muted focus-visible:bg-muted",
      githubLinkDark:
        "inline-flex size-11 shrink-0 items-center justify-center bg-transparent transition-colors hover:text-brand focus-visible:text-brand md:size-7 text-slate-400 hover:bg-white/5 focus-visible:bg-white/5",
      tooltipLight:
        "pointer-events-none absolute bottom-full left-0 z-40 mb-2 w-64 border border-border bg-popover/96 p-2 text-[11px] leading-5 text-popover-foreground opacity-0 shadow-[0_18px_48px_rgba(0,0,0,0.35)] backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
      tooltipDark:
        "pointer-events-none absolute bottom-full left-0 z-40 mb-2 w-64 border border-slate-700/90 bg-[#0f1319]/96 p-2 text-[11px] leading-5 text-slate-300 opacity-0 shadow-[0_18px_48px_rgba(0,0,0,0.35)] backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
      shareButton:
        "inline-flex min-h-11 items-center gap-1 rounded-lg bg-brand px-2 py-1 text-[10px] font-semibold text-brand-foreground shadow-[0_2px_8px_color-mix(in_srgb,var(--brand)_38%,transparent)] transition-colors hover:bg-brand/90 disabled:opacity-60 sm:min-h-0 sm:px-2.5 sm:text-[11px]",
    },
    mobileStockSheet: {
      overlay: "absolute inset-0 bg-black/60 backdrop-blur-sm",
      panel:
        "relative flex max-h-[82vh] w-full flex-col rounded-t-2xl border-t border-slate-700/80 bg-[#0f1319] pb-[env(safe-area-inset-bottom)] text-slate-100 shadow-[0_-20px_60px_rgba(0,0,0,0.5)]",
      closeButton:
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-slate-700/80 bg-slate-800/60 text-slate-200 transition-colors hover:bg-slate-700/80",
      klineFrame: "mx-4 mb-3 overflow-hidden rounded-md border border-slate-700/80 bg-white",
      xueqiuButton:
        "inline-flex flex-1 items-center justify-center gap-2 rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-[13px] font-medium text-slate-100 transition-colors hover:bg-slate-700/80",
      listSection: "flex min-h-0 flex-1 flex-col border-t border-slate-700/80 bg-[#0b0e13]",
      listRowBase:
        "flex w-full items-center gap-3 border-b border-slate-800/80 px-4 py-2.5 text-left text-[13px] transition-colors",
      listRowActive: "bg-slate-800/70",
      listRowInactive: "hover:bg-slate-800/40",
    },
    settingsDrawer: {
      overlay: "absolute inset-0 z-[10010] flex items-end justify-center bg-black/62 backdrop-blur-sm",
      panel:
        "relative flex h-[82dvh] w-full flex-col overflow-hidden rounded-t-lg border border-b-0 border-border bg-card pb-[env(safe-area-inset-bottom)] text-card-foreground shadow-[0_-24px_100px_rgba(0,0,0,0.48)]",
      header: "flex items-start justify-between gap-3 border-b border-border px-4 py-3",
      closeButton:
        "inline-flex size-9 shrink-0 items-center justify-center border border-border bg-background/70 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
      nav: "flex h-12 min-h-12 gap-1 overflow-x-auto overflow-y-hidden border-b border-border bg-muted/20 px-2 py-1.5 md:h-auto md:min-h-0 md:flex-col md:overflow-x-visible md:border-b-0 md:border-r md:p-2",
      tabButtonBase:
        "inline-flex h-9 shrink-0 items-center gap-2 border px-3 text-left text-sm font-medium leading-none transition-colors md:w-full",
      tabButtonActive: "border-brand/60 bg-brand/15 text-foreground",
      tabButtonInactive:
        "border-transparent text-muted-foreground hover:border-border hover:bg-background/70 hover:text-foreground",
      optionGroup: "mt-3 grid gap-2 sm:grid-cols-2",
      optionButtonBase:
        "flex items-center gap-2 border px-3 py-3 text-left text-sm font-semibold transition-colors",
      optionButtonActive: "border-brand/70 bg-brand/15 text-foreground",
      optionButtonInactive:
        "border-border bg-background/70 text-muted-foreground hover:bg-muted hover:text-foreground",
      colorOptionButtonBase: "border px-3 py-3 text-left text-sm transition-colors",
      colorOptionButtonActive: "border-brand/70 bg-brand/15",
      colorOptionButtonInactive: "border-border bg-background/70 hover:bg-muted",
      helpItem: "border border-border bg-background/70 px-3 py-2 text-sm text-muted-foreground",
      githubLink:
        "mt-4 inline-flex items-center gap-2 border border-border bg-background/80 px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted",
    },
    inspector: {
      panel:
        "pointer-events-none absolute z-30 overflow-hidden rounded-lg border border-slate-700/80 bg-[#0f1319] text-slate-100 shadow-[0_22px_72px_rgba(0,0,0,0.36)]",
      header: "border-b border-slate-700/80 px-3 py-2.5",
      klineFrame: "border-b border-slate-700/80 bg-white p-1.5",
    },
    sidebar: {
      overlay: "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden",
      asideSurface: "border-r border-border bg-card/95",
      asideDesktopExtra: "md:shadow-none",
      header: "flex items-center justify-between gap-2 border-b border-border px-2 py-1.5 sm:px-2.5",
      closeButton:
        "inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-background/70 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:size-8 md:hidden",
      statusPill: "mb-1.5 flex items-center justify-between border border-border bg-muted/18 px-1.5 py-1",
      marketList: "space-y-1",
      marketButtonBase:
        "flex w-full min-w-0 items-center justify-between border px-1.5 py-3 text-left transition-colors md:py-1.5",
      marketButtonActive: "border-brand/55 bg-brand/12 text-foreground",
      marketButtonInactive: "border-border bg-background hover:bg-muted",
      groupCard: "mt-1.5 border border-border bg-muted/18 p-1.5",
      boardSelect:
        "mt-1 h-8 w-full min-w-0 border border-border bg-background/85 px-2 font-semibold text-foreground text-[12px] outline-none transition-colors hover:bg-muted focus:border-brand/70",
      subBoardChip: "mt-1 flex items-center justify-between border border-brand/40 bg-brand/10 px-1.5 py-1",
      trendSegment: "mt-1 grid grid-cols-3 gap-1",
      trendButtonBase:
        "h-11 md:h-7 border px-1 text-center font-semibold leading-tight transition-colors text-[11px]",
      trendButtonActive: "border-brand/70 bg-brand/18 text-foreground",
      trendButtonInactive: "border-border bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground",
      periodSegment: "mt-1 grid grid-cols-4 gap-1",
      periodButtonBase:
        "h-11 md:h-7 border text-center font-semibold tabular-nums transition-colors text-[12px]",
      periodButtonActive:
        "border-brand/70 bg-brand/18 text-foreground shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--brand)_22%,transparent)]",
      periodButtonInactive: "border-border bg-background/80 text-muted-foreground hover:bg-muted hover:text-foreground",
      statsCard: "mt-1.5 border border-border bg-muted/28 p-1.5",
      turnoverDivider: "mt-2 grid grid-cols-2 items-stretch gap-1.5 border-t border-border/70 pt-2",
      actionArea: "grid grid-cols-1 gap-1.5 border-t border-border p-1.5",
      actionButton: {
        variant: "outline",
        className: "justify-start rounded-lg border-border bg-background/80 text-foreground hover:bg-muted",
      },
    },
  },
  ios26: {
    colorLegend: {
      containerLight:
        "ios26-glass col-span-1 row-start-2 rounded-[20px] px-3 py-1.5 text-card-foreground sm:px-4 md:col-start-2",
      containerDark:
        "ios26-glass col-span-1 row-start-2 rounded-[20px] px-3 py-1.5 text-card-foreground sm:px-4 md:col-start-2",
      infoButtonLight:
        "ios26-glass-hover inline-flex size-11 items-center justify-center rounded-full bg-transparent transition-colors hover:text-brand focus-visible:text-brand md:size-7 text-muted-foreground",
      infoButtonDark:
        "ios26-glass-hover inline-flex size-11 items-center justify-center rounded-full bg-transparent transition-colors hover:text-brand focus-visible:text-brand md:size-7 text-muted-foreground",
      githubLinkLight:
        "ios26-glass-hover inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-transparent transition-colors hover:text-brand focus-visible:text-brand md:size-7 text-muted-foreground",
      githubLinkDark:
        "ios26-glass-hover inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-transparent transition-colors hover:text-brand focus-visible:text-brand md:size-7 text-muted-foreground",
      tooltipLight:
        "ios26-glass pointer-events-none absolute bottom-full left-0 z-40 mb-2 w-64 rounded-2xl p-2 text-[11px] leading-5 text-card-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
      tooltipDark:
        "ios26-glass pointer-events-none absolute bottom-full left-0 z-40 mb-2 w-64 rounded-2xl p-2 text-[11px] leading-5 text-card-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
      shareButton:
        "inline-flex min-h-11 items-center gap-1 rounded-[14px] bg-brand px-1.5 py-1 text-[10px] font-semibold text-brand-foreground shadow-[0_2px_8px_color-mix(in_srgb,var(--brand)_38%,transparent)] transition-colors hover:bg-brand/90 disabled:opacity-60 sm:min-h-0 sm:px-2 sm:text-[11px]",
    },
    mobileStockSheet: {
      overlay: "absolute inset-0 bg-black/40 backdrop-blur-sm",
      panel:
        "ios26-glass relative flex max-h-[82vh] w-full flex-col rounded-t-3xl pb-[env(safe-area-inset-bottom)] text-slate-100",
      closeButton:
        "ios26-glass-hover inline-flex size-9 shrink-0 items-center justify-center rounded-full text-slate-200 transition-colors",
      klineFrame: "mx-4 mb-3 overflow-hidden rounded-xl border border-[var(--ios26-glass-border)] bg-white",
      xueqiuButton:
        "ios26-glass-hover inline-flex flex-1 items-center justify-center gap-2 rounded-[10px] border-none px-3 py-2 text-[13px] font-medium text-slate-100 transition-colors",
      listSection: "flex min-h-0 flex-1 flex-col border-t border-[var(--ios26-glass-border)]",
      listRowBase:
        "ios26-glass-hover flex w-full items-center gap-3 border-b border-[var(--ios26-glass-border)] px-4 py-2.5 text-left text-[13px] transition-colors",
      listRowActive: "ios26-glass-active",
      listRowInactive: "",
    },
    settingsDrawer: {
      overlay: "absolute inset-0 z-[10010] flex items-end justify-center bg-black/40 backdrop-blur-sm",
      panel:
        "ios26-glass relative flex h-[82dvh] w-full flex-col overflow-hidden rounded-t-3xl pb-[env(safe-area-inset-bottom)] text-card-foreground",
      header: "flex items-start justify-between gap-3 border-b border-[var(--ios26-glass-border)] px-4 py-3",
      closeButton:
        "ios26-glass-hover inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground",
      nav: "ios26-glass-segmented flex h-12 min-h-12 gap-1 overflow-x-auto overflow-y-hidden px-2 py-1.5 md:h-auto md:min-h-0 md:flex-col md:overflow-x-visible md:p-2",
      tabButtonBase:
        "ios26-glass-hover inline-flex h-9 shrink-0 items-center gap-2 rounded-[7px] border-none px-3 text-left text-sm font-medium leading-none md:w-full",
      tabButtonActive: "ios26-glass-active text-foreground",
      tabButtonInactive: "text-muted-foreground hover:text-foreground",
      optionGroup: "ios26-glass-segmented mt-3 grid gap-2 rounded-[9px] p-1 sm:grid-cols-2",
      optionButtonBase:
        "ios26-glass-hover flex items-center gap-2 rounded-[7px] border-none px-3 py-3 text-left text-sm font-semibold",
      optionButtonActive: "ios26-glass-active text-foreground",
      optionButtonInactive: "text-muted-foreground hover:text-foreground",
      colorOptionButtonBase: "ios26-glass-hover rounded-[7px] border-none px-3 py-3 text-left text-sm",
      colorOptionButtonActive: "ios26-glass-active",
      colorOptionButtonInactive: "text-muted-foreground hover:text-foreground",
      helpItem: "ios26-glass-card rounded-xl px-3 py-2 text-sm text-muted-foreground",
      githubLink:
        "ios26-glass-hover mt-4 inline-flex items-center gap-2 rounded-[10px] border-none px-3 py-2 text-sm font-semibold text-foreground transition-colors",
    },
    inspector: {
      panel:
        "pointer-events-none absolute z-30 overflow-hidden rounded-3xl border border-[var(--ios26-glass-border)] bg-[#0f1319] text-slate-100 shadow-[0_22px_72px_rgba(0,0,0,0.36)]",
      header: "px-3 py-2.5",
      klineFrame: "border-b border-[var(--ios26-glass-border)] bg-white p-1.5",
    },
    sidebar: {
      overlay: "fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden",
      asideSurface: "ios26-glass",
      asideDesktopExtra: "md:rounded-3xl",
      header: "flex items-center justify-between gap-2 px-2 py-2 sm:px-2.5",
      closeButton:
        "ios26-glass-hover inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground md:size-8 md:hidden",
      statusPill: "ios26-glass-card mb-1.5 flex items-center justify-between rounded-full px-2.5 py-1",
      marketList: "flex flex-col gap-0.5",
      marketButtonBase:
        "ios26-glass-hover flex w-full min-w-0 items-center justify-between rounded-[10px] border-none px-2.5 py-3 text-left md:py-1.5",
      marketButtonActive: "ios26-glass-active",
      marketButtonInactive: "",
      groupCard: "ios26-glass-card mt-1.5 p-1.5",
      boardSelect:
        "ios26-glass-segmented mt-1 h-8 w-full min-w-0 rounded-[9px] border-none px-2 font-semibold text-foreground text-[12px] outline-none transition-colors focus:bg-[var(--ios26-glass-bg-active)]",
      subBoardChip: "ios26-glass-hover mt-1 flex items-center justify-between rounded-[9px] border-none px-2 py-1",
      trendSegment: "ios26-glass-segmented mt-1 grid grid-cols-3 gap-0.5 rounded-[9px] p-0.5",
      trendButtonBase:
        "ios26-glass-hover h-11 rounded-[7px] border-none px-1 text-center font-semibold leading-tight text-[11px] md:h-7",
      trendButtonActive: "ios26-glass-active text-foreground",
      trendButtonInactive: "text-muted-foreground hover:text-foreground",
      periodSegment: "ios26-glass-segmented mt-1 grid grid-cols-4 gap-0.5 rounded-[9px] p-0.5",
      periodButtonBase:
        "ios26-glass-hover h-11 rounded-[7px] border-none text-center font-semibold tabular-nums text-[12px] md:h-7",
      periodButtonActive: "ios26-glass-active text-foreground",
      periodButtonInactive: "text-muted-foreground hover:text-foreground",
      statsCard: "ios26-glass-card mt-1.5 p-1.5",
      turnoverDivider: "mt-2 grid grid-cols-2 items-stretch gap-1.5 border-t border-[var(--ios26-glass-border)] pt-2",
      actionArea: "grid grid-cols-1 gap-1.5 p-1.5",
      actionButton: {
        variant: "ghost",
        className:
          "ios26-glass-hover justify-start rounded-[10px] border-none bg-[var(--ios26-glass-bg)] text-foreground hover:bg-[var(--ios26-glass-bg-hover)]",
      },
    },
  },
};
