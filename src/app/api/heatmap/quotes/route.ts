import { NextRequest, NextResponse } from "next/server";

import { getQuoteData } from "@/lib/market-data";
import { isHeatmapPeriodKey, isMarketKey } from "@/types/heatmap";

/** 实时行情快照 API：GET /api/heatmap/quotes?market=all&period=day */
export async function GET(request: NextRequest) {
  const marketParam = request.nextUrl.searchParams.get("market") ?? "all";
  const periodParam = request.nextUrl.searchParams.get("period") ?? "day";

  if (!isMarketKey(marketParam)) {
    return NextResponse.json(
      { success: false, message: `Invalid market: ${marketParam}` },
      { status: 400 }
    );
  }

  if (!isHeatmapPeriodKey(periodParam)) {
    return NextResponse.json(
      { success: false, message: `Invalid period: ${periodParam}` },
      { status: 400 }
    );
  }

  try {
    const data = await getQuoteData(marketParam, periodParam);
    const response = NextResponse.json(data);
    response.headers.set("Cache-Control", "public, s-maxage=8, stale-while-revalidate=30");
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Failed to load quote data",
      },
      { status: 502 }
    );
  }
}
