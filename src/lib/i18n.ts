/**
 * 中文文案字典
 *
 * 审计 A3：界面当前仅中文，英文分支已删除（运行时从未渲染过）。
 * 将来要多语言时：先在 types/heatmap.ts 放宽 Locale，再在这里加回语言分支。
 */
import type { Locale } from "@/types/heatmap";

export const messages = {
  zh: {
    heatmap: {
      title: "股市矩阵",
      boardFilterLabel: "一级板块",
      allBoards: "全部板块",
      trendFilterLabel: "涨跌筛选",
      allTrends: "全部",
      risingOnly: "上涨",
      fallingOnly: "下跌",
      metricLabel: "涨跌区间",
      resetView: "重置视图",
      enterFullscreen: "全屏",
      exitFullscreen: "退出全屏",
      marketOpen: "交易中",
      marketClosed: "休市中",
      legendRise: "上涨",
      legendFlat: "平盘",
      legendFall: "下跌",
      loading: "热力图加载中…",
      errorLoad: "当前无法加载热力图数据，请稍后重试。",
      canvasLabel: "股市矩阵画布",
      turnoverLabel: "成交额",
      comparedToYesterdayLabel: "比昨日",
      turnoverIncreaseLabel: "放量",
      turnoverDecreaseLabel: "缩量",
      turnoverFlatLabel: "持平",
      turnoverNoComparisonLabel: "无对比",
      fallbackDataLabel: "当前为样本快照",
      operationTipsTitle: "操作提示",
      tipAreaMarketCap: "· 色块大小反映流通市值",
      tipColor: "· 颜色深浅反映涨跌幅度",
      tipDoubleClick: "· 双击股票可跳转雪球查看详情；双击板块标题可筛选或清除筛选",
      tipTap: "· 点击色块查看股票信息",
      tipZoom: "· 滚轮放大查看细节",
      tipPinch: "· 双指捏合放大查看细节",
      tipDrag: "· 放大后按住鼠标拖动可平移画面",
      tipInspectorScroll: "· 悬停时按 ↑/↓ 或 J/K 可滚动详情列表",
      tipFullscreen: "· 全屏模式查看效果更佳",
      inspectorScrollHint: "↑/↓ 或 J/K 可滚动详情列表",
      shareImage: "截图分享",
      generatingShareImage: "生成中…",
      shareToApps: "分享",
      shareFailed: "当前无法生成截图，请稍后重试",
      fullscreenToast: "按 Esc 退出全屏",
      fullscreenToastMobile: "点击右上角按钮退出全屏",
      expandSidebar: "展开菜单",
      collapseSidebar: "收起菜单",
      settingsTitle: "设置",
      settingsDescription: "自定义显示效果、语言和交互方式。",
      settingsAppearance: "外观",
      settingsHelp: "帮助",
      settingsProject: "项目",
      displayMode: "显示模式",
      lightMode: "明亮模式",
      darkMode: "暗黑模式",
      priceColor: "涨跌颜色",
      redRiseGreenFall: "红涨绿跌",
      greenRiseRedFall: "绿涨红跌",
      helpTitle: "使用帮助",
      helpIntro: "从色块大小、颜色深浅和行业布局三个维度把握市场。",
      githubProject: "GitHub 项目",
      githubProjectDescription: "浏览源代码、提交反馈或收藏项目。",
      mobileTapHint: "点击任意色块查看股票信息",
      mobileOpenInXueqiu: "雪球查看",
      closeSheet: "关闭",
      designStyleLabel: "界面风格",
      designStyleDescription: "切换 iOS 26 液态玻璃风格和经典风格",
      designStyleIOS26: "iOS 26 液态玻璃",
      designStyleClassic: "经典风格",
      metrics: {
        day: "当日涨跌",
        week: "近 5 日涨跌",
        month: "近 20 日涨跌",
        year: "今年以来",
      },
    },
  },
} as const;

export function getMessages(locale: Locale) {
  return messages[locale];
}

export type Messages = (typeof messages)[Locale];
export type HeatmapMessages = Messages["heatmap"];
