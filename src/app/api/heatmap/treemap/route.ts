import { NextRequest, NextResponse } from "next/server";

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
    const response = NextResponse.json(data);
    // CDN 缓存是主力：8 秒缓存 + 30 秒过期后台刷新
    response.headers.set("Cache-Control", "public, s-maxage=8, stale-while-revalidate=30");
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Failed to load treemap data",
      },
      { status: 502 }
    );
  }
}
