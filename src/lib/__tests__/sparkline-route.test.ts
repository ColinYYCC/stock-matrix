import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { GET } from "@/app/api/chart/sparkline/route";

function makeRequest(code: string) {
  return new NextRequest(`http://localhost:3000/api/chart/sparkline?code=${code}`);
}

describe("GET /api/chart/sparkline", () => {
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

  it("合法代码按沪/深市场编号转发东方财富并附缓存头", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("PNGBYTES", { status: 200, headers: { "Content-Type": "image/png" } })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(makeRequest("sh688981"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=60");
    expect(await response.text()).toBe("PNGBYTES");
    // 上海市场编号 = 1
    expect(fetchMock).toHaveBeenCalledWith(
      "https://webquotepic.eastmoney.com/GetPic.aspx?nid=1.688981&imageType=RJY",
      expect.objectContaining({ cache: "no-store" })
    );

    await GET(makeRequest("sz000001"));
    // 深圳市场编号 = 0
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://webquotepic.eastmoney.com/GetPic.aspx?nid=0.000001&imageType=RJY",
      expect.objectContaining({ cache: "no-store" })
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
