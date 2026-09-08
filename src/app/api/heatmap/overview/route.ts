import { NextRequest, NextResponse } from "next/server";

import { heatmapDataResponse } from "@/lib/heatmap-api";
import { getOverviewData } from "@/lib/market-data";
import { isHeatmapPeriodKey } from "@/types/heatmap";

/** 市场概览 API：GET /api/heatmap/overview?period=day */
export async function GET(request: NextRequest) {
  const periodParam = request.nextUrl.searchParams.get("period") ?? "day";

  if (!isHeatmapPeriodKey(periodParam)) {
    return NextResponse.json(
      { success: false, message: `Invalid period: ${periodParam}` },
      { status: 400 }
    );
  }

  try {
    const data = await getOverviewData(periodParam);
    return heatmapDataResponse(data);
  } catch (error) {
    // 审计 S1：对外只回固定文案，详细错误只进服务端日志，避免泄露上游内部细节
    console.error("[api/heatmap/overview] 数据加载失败:", error);
    return NextResponse.json(
      { success: false, message: "Failed to load overview data" },
      { status: 502 }
    );
  }
}
