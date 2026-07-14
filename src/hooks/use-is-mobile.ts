"use client";

import { useEffect, useState } from "react";

/**
 * 检测当前是否移动设备（屏幕宽度 <= 767px）
 *
 * 用 matchMedia 监听屏幕变化，支持动态响应。
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(query.matches);

    update();

    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", update);
      return () => query.removeEventListener("change", update);
    }

    query.addListener(update);
    return () => query.removeListener(update);
  }, []);

  return isMobile;
}
