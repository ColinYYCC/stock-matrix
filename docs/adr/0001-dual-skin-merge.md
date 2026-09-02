# 双皮肤合并为单一组件 + skin token 映射

背景：classic 与 ios26 两套组件约 1000 行重复，JSX 结构 100% 同构、差异全部落在 className，每处样式修改都要双份同步（2026-09 可访问性修复中每项都改了两遍，已实证）。决定：按皮肤逐对合并为**单一组件**，className 差异收敛到一张类型安全的映射表（skin token，`src/components/skin.ts`），组件按 `designStyle` 取表；纯色值继续走现有 `--ios26-*` CSS 变量。classic 皮肤**长期维护**（非过渡品）。验收标准为与合并前**像素级一致**，不趁机调整视觉。

## Considered Options

- **CSS `data-design` 后代选择器驱动**（差异全下沉到 globals.css）：拒绝——差异散落 30-40 条 CSS 规则、需要管理选择器特异性，皮肤长相无法在一个文件里通览。
- **仅提取共享逻辑、保留两套 JSX**：拒绝——className 级的双改负担依然存在。
- **维持现状**：拒绝——双改成本随每次样式修改持续累积。

## Consequences

- `src/components/ios26/` 目录在合并完成后删除（iOS 26 皮肤样式活在 token 表里，不再有独立组件文件）。
- classic 版 SettingsDrawer 从 `market-heatmap.tsx` 内联实现抽出，`market-heatmap.tsx` 相应瘦身。
- 新增皮肤 = 在 token 表加一列，而不是复制全套组件。

## 例外：Canvas 画布配色不进 skin token 表

画布（`src/lib/canvas-render.ts` 的 `heatmapCanvasThemes`）的暗色背景配色**刻意不收敛进 `skin.ts`**，维持独立维护：

- 画布是命令式 RGB 绘制（渐变 + 半透明色块），与组件 DOM 的 className 皮肤本质不同，强行映射成 className token 不自然。
- 画布在离屏缓存 / SSR 环境绘制，不便读取 `globals.css` 的 CSS 变量，硬编码 sRGB 字符串是务实选择。
- 因此 `heatmapCanvasThemes` 是 skin token 表的有意例外，按 `皮肤 × 显示模式` 组织在 `canvas-render.ts` 内（相关决策见 P1-12：两套画布暗色各自对齐对应皮肤的页面背景，classic 去紫、ios26 对齐 `--ios26-bg-start/end`）。
