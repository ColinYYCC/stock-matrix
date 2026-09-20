import { NextRequest, NextResponse } from "next/server";

/**
 * 日线 K 线图代理：GET /api/chart/kline?code=sh688981
 *
 * 为什么不直接让浏览器拉新浪图床（2026-09-20 Windows 端诊断结论）：
 * 新浪图床对部分访客单张要 0.7~1.7 秒，且只允许缓存 60 秒；鼠标扫股时
 * 每换一只股票都现拉一张，等图期间详情面板 K 线区一片空白。
 * 走自家域名后：同域并发不受浏览器 6 连接排队限制；下面的缓存头让
 * 浏览器存 1 分钟、CDN 存 5 分钟，第二次看（任何访客）都是毫秒级。
 */

// 白名单：只接受 sh|sz|bj + 6 位数字，杜绝把接口当成开放代理用
const KLINE_CODE_PATTERN = /^(sh|sz|bj)\d{6}$/;

const UPSTREAM_BASE = "https://image.sinajs.cn/newchart/daily/n/";

/** 日线图一天才换一版；盘中当天那根蜡烛会动，CDN 缓存 5 分钟足够新鲜 */
const CACHE_CONTROL = "public, max-age=60, s-maxage=300, stale-while-revalidate=600";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code") ?? "";

  if (!KLINE_CODE_PATTERN.test(code)) {
    return NextResponse.json(
      { success: false, message: `Invalid code: ${code}` },
      { status: 400 }
    );
  }

  try {
    const upstream = await fetch(`${UPSTREAM_BASE}${code}.gif`, {
      cache: "no-store",
      // 上游挂掉时快速失败，不让访客干等
      signal: AbortSignal.timeout(8000),
    });

    if (!upstream.ok || !upstream.body) {
      console.error("[api/chart/kline] 上游返回异常:", upstream.status);
      return new NextResponse("Upstream error", { status: 502 });
    }

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") ?? "image/gif",
        "Cache-Control": CACHE_CONTROL,
      },
    });
  } catch (error) {
    // 审计 S1：对外只回固定文案，详细错误只进服务端日志
    console.error("[api/chart/kline] 拉取失败:", error);
    return new NextResponse("Upstream error", { status: 502 });
  }
}
