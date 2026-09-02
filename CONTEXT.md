# Stock Matrix

A 股热力图应用的领域词汇表。单一上下文。

## Language

### 界面外观

**Skin（皮肤）**:
用户可选的两套界面视觉皮肤：`classic`（不透明卡片+边框）与 `ios26`（Liquid Glass 毛玻璃）。设置面板中显示为"界面风格"。皮肤只改变样式，不改变结构与行为。
_Avoid_: 主题、design style（代码标识符 `designStyle` 除外）

**Display mode（显示模式）**:
亮色 / 暗色配色模式。与皮肤（Skin）正交：任意皮肤 × 任意显示模式都有效。
_Avoid_: 主题（易与皮肤混淆）

**Heatmap（热力图）**:
按流通市值分配面积、按涨跌幅着色的 Canvas 画布，是应用的主体视图。
