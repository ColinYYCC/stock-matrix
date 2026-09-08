import { NextRequest, NextResponse } from "next/server";

import { heatmapDataResponse } from "@/lib/heatmap-api";
import { getTreemapData } from "@/lib/market-data";
import { isHeatmapPeriodKey, isMarketKey } from "@/types/heatmap";

/** 热力图树图数据 API：GET /api/heatmap/treemap?market=all&period=day */
export async function GET(request: NextRequest) {
  // 从 URL 参数读取 market 和 period，有默认值
  const marketParam = request.nextUrl.searchParams.get("market") ?? "all";
  const periodParam = request.nextUrl.searchParams.get("period") ?? "day";

  // 校验 market 参数
  if (!isMarketKey(marketParam)) {
    return NextResponse.json(
      { success: false, message: `Invalid market: ${marketParam}` },
      { status: 400 }
    );
  }

  // 校验 period 参数
  if (!isHeatmapPeriodKey(periodParam)) {
    return NextResponse.json(
      { success: false, message: `Invalid period: ${periodParam}` },
      { status: 400 }
    );
  }

  try {
    const data = await getTreemapData(marketParam, periodParam);
    return heatmapDataResponse(data);
  } catch (error) {
    // 审计 S1：对外只回固定文案，详细错误只进服务端日志，避免泄露上游内部细节
    console.error("[api/heatmap/treemap] 数据加载失败:", error);
    return NextResponse.json(
      { success: false, message: "Failed to load treemap data" },
      { status: 502 }
    );
  }
}
