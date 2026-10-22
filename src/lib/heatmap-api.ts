import { NextResponse } from "next/server";

import { isTradingHours } from "@/lib/trading-hours";
import { type MarketDataSource } from "@/types/heatmap";

/** 交易时段的 CDN 新鲜期：8 秒，跟前端 8 秒轮询节奏对齐 */
const tradingMaxAgeSeconds = 8;
/**
 * 非交易时段的 CDN 新鲜期：60 秒。
 * 刻意不取更长：开盘（9:30 / 13:00）那一刻若 CDN 上还留着盘前/午休的缓存，
 * 用户会看到旧数据，60 秒把这个窗口压在 1 分钟内；收盘后到次日开盘前的数据
 * 本来就不再变化，1 分钟足够把绝大多数打开请求挡在回源之外。
 */
const idleMaxAgeSeconds = 60;

/**
 * 行情数据接口共用的响应策略（此前在 treemap / overview 两个路由各抄一份）：
 * - fallback 数据 → 503 且不缓存，CDN 会继续返回上一次的 200 实时数据
 * - 成功 → 200，新鲜期按交易时段区分：交易中 8 秒、其余时间 60 秒
 *   （交易中保持原节奏不动；非交易时段服务端已锁定行情快照，放长缓存只是
 *    挡掉回源——实测回源约 1.5s、命中约 0.14s，不改变数据新鲜度）
 * - 过期后仍有 5 分钟 stale-while-revalidate：先回旧数据、后台再校验，
 *   数据源临时挂了时 CDN 继续返回上次成功的实时数据
 */
export function heatmapDataResponse(data: { source: MarketDataSource }): NextResponse {
  if (data.source === "fallback") {
    return NextResponse.json(data, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
  const maxAge = isTradingHours() ? tradingMaxAgeSeconds : idleMaxAgeSeconds;
  const response = NextResponse.json(data);
  response.headers.set("Cache-Control", `public, s-maxage=${maxAge}, stale-while-revalidate=300`);
  return response;
}
