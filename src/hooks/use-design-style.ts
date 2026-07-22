"use client";

import { useEffect, useState } from "react";

/** 界面风格：ios26 = iOS 26 Liquid Glass 毛玻璃风格；classic = 原经典风格 */
export type DesignStyle = "ios26" | "classic";

/** localStorage 里存的 key 名 */
const storageKey = "stock-matrix-design-style";

/**
 * 管理界面风格偏好
 *
 * 默认用 ios26（iOS 26 Liquid Glass 毛玻璃风格）。
 * 用户可以在设置面板里切换回 classic（原经典风格）。
 * 偏好会存到 localStorage，下次打开网页自动恢复。
 */
export function useDesignStyle() {
  const [designStyle, setDesignStyle] = useState<DesignStyle>("ios26");
  const [ready, setReady] = useState(false);

  // 首次加载时从 localStorage 读取偏好
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === "ios26" || stored === "classic") {
        setDesignStyle(stored);
      }
    } catch {
      /* localStorage 不可用时用默认值 */
    } finally {
      setReady(true);
    }
  }, []);

  // 偏好变化时存到 localStorage，并在 <html> 上标记 data-design 属性
  // 这样 CSS 里的 [data-design="ios26"] 选择器才能生效
  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(storageKey, designStyle);
    } catch {
      /* 存储失败不影响使用 */
    }
    // 在 <html> 元素上设置 data-design 属性，让 CSS 知道当前用哪种风格
    document.documentElement.setAttribute("data-design", designStyle);
  }, [designStyle, ready]);

  return { designStyle, setDesignStyle, ready };
}
