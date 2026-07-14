import { MarketHeatmap } from "@/components/market-heatmap";
import { getMessages } from "@/lib/i18n";

export default function HomePage() {
  const messages = getMessages("zh");

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <h1 className="sr-only">股市矩阵</h1>
      <p className="sr-only">
        股市矩阵按行业与市值权重展示沪深两市个股，用颜色呈现涨跌幅，支持缩放、拖拽、全屏与截图分享。
      </p>
      <MarketHeatmap locale="zh" messages={messages.heatmap} />
    </main>
  );
}
