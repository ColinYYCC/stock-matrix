"use client";

import { useEffect, useState } from "react";

import { isTradingHours } from "@/lib/trading-hours";

/**
 * 返回当前是否处于 A 股交易时段。
 *
 * 每 30 秒重新检查一次，确保：
 * - 开盘时（09:30）自动开始轮询
 * - 收盘时（15:00）自动停止轮询
 * - 跨日时正确更新星期几判断
 *
 * 页面不可见时检查暂停（由浏览器 setTimeout 节流，无额外优化必要）。
 *
 * @returns true = 交易中，false = 非交易时段
 */
export function useTradingHours(): boolean {
  const [isTrading, setIsTrading] = useState(false);

  useEffect(() => {
    const check = () => setIsTrading(isTradingHours());
    check();
    const timer = window.setInterval(check, 30_000);
    return () => window.clearInterval(timer);
  }, []);

  return isTrading;
}
