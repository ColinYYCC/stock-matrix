import { NextResponse } from "next/server";

import { type MarketDataSource } from "@/types/heatmap";

/**
 * 行情数据接口共用的响应策略（此前在 treemap / overview 两个路由各抄一份）：
 * - fallback 数据 → 503 且不缓存，CDN 会继续返回上一次的 200 实时数据
 * - 成功 → 200，CDN 缓存 8 秒新鲜 + 5 分钟 stale-while-revalidate
 *   （数据源临时挂了时，CDN 在 stale 窗口内继续返回上次成功的实时数据）
 */
export function heatmapDataResponse(data: { source: MarketDataSource }): NextResponse {
  if (data.source === "fallback") {
    return NextResponse.json(data, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const response = NextResponse.json(data);
  response.headers.set("Cache-Control", "public, s-maxage=8, stale-while-revalidate=300");
  return response;
}
