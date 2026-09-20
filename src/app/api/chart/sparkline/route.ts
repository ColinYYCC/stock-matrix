import { NextRequest, NextResponse } from "next/server";

/**
 * 分时迷你图代理：GET /api/chart/sparkline?code=sh688981
 *
 * 为什么不直接让浏览器拉东方财富图床（2026-09-20 二轮诊断结论）：
 * 详情面板一次要挂上百张迷你图（列表每行一张 + 头部一张），直连时
 * HTTP/1.1 对同一域名只开 6 条连接，换子板块整批排队（实测一次扫动
 * 245 个请求、排队把单图拖到 829ms），且上游无任何缓存头、无法复用。
 * 走自家域名后：同域并发不受 6 连接限制；60 秒缓存让扫动回看秒出。
 */

// 白名单：只接受 sh|sz|bj + 6 位数字，杜绝把接口当成开放代理用（与 kline 路由同一规则）
const SPARKLINE_CODE_PATTERN = /^(sh|sz|bj)\d{6}$/;

const UPSTREAM_BASE = "https://webquotepic.eastmoney.com/GetPic.aspx";

/** 分时图每分钟一变，60 秒缓存足够新鲜；stale-while-revalidate 让过期后先回旧图再后台刷新 */
const CACHE_CONTROL = "public, max-age=60, s-maxage=60, stale-while-revalidate=300";

/** 东方财富市场编号：上海=1，深圳/北京=0（与 stock-image.ts 的注释口径一致） */
function eastmoneyMarketId(prefix: string) {
  return prefix === "sh" ? "1" : "0";
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code") ?? "";

  if (!SPARKLINE_CODE_PATTERN.test(code)) {
    return NextResponse.json(
      { success: false, message: `Invalid code: ${code}` },
      { status: 400 }
    );
  }

  const symbol = code.slice(2);
  const marketId = eastmoneyMarketId(code.slice(0, 2));

  try {
    const upstream = await fetch(
      `${UPSTREAM_BASE}?nid=${marketId}.${symbol}&imageType=RJY`,
      {
        cache: "no-store",
        // 上游挂掉时快速失败，不让访客干等
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!upstream.ok || !upstream.body) {
      console.error("[api/chart/sparkline] 上游返回异常:", upstream.status);
      return new NextResponse("Upstream error", { status: 502 });
    }

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") ?? "image/png",
        "Cache-Control": CACHE_CONTROL,
      },
    });
  } catch (error) {
    // 审计 S1：对外只回固定文案，详细错误只进服务端日志
    console.error("[api/chart/sparkline] 拉取失败:", error);
    return new NextResponse("Upstream error", { status: 502 });
  }
}
