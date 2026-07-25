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
    // CDN 缓存：8 秒新鲜 + 5 分钟 stale-while-revalidate
    // stale 窗口拉长到 300 秒：数据源临时挂了时 CDN 继续返回上次成功的实时数据
    // fallback 数据标记为 503，不会被 CDN 缓存，CDN 会继续返回上一次的 200 响应
    if (data.source === "fallback") {
      return NextResponse.json(data, {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      });
    }
    response.headers.set("Cache-Control", "public, s-maxage=8, stale-while-revalidate=300");
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
