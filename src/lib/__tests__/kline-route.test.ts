import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET } from "@/app/api/chart/kline/route";

function makeRequest(code: string) {
  return new NextRequest(`http://localhost:3000/api/chart/kline?code=${code}`);
}

describe("GET /api/chart/kline", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("非法代码直接 400，不发起上游请求", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(makeRequest("abc123"));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("合法代码转发新浪图床并附缓存头", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("GIFBYTES", { status: 200, headers: { "Content-Type": "image/gif" } })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(makeRequest("sh688981"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/gif");
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=300");
    expect(await response.text()).toBe("GIFBYTES");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://image.sinajs.cn/newchart/daily/n/sh688981.gif",
      expect.objectContaining({ next: { revalidate: 60 } })
    );
  });

  it("上游失败时返回 502", async () => {
    // 压掉 502 分支的服务端 console.error，保持测试输出干净
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("boom", { status: 500 })));

    const response = await GET(makeRequest("sz000001"));

    expect(response.status).toBe(502);
  });
});
