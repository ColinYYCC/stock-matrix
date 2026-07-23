"use client";

import { useEffect } from "react";

/**
 * 页面可见时定时轮询，页面不可见时自动暂停。
 *
 * @param task 每次要执行的任务函数
 * @param intervalMs 轮询间隔（毫秒）。可动态变化（如交易时段 8s、非交易时段 60s），
 *                   变化时自动重启定时器。
 * @param enabled 是否启用定时轮询（默认 true）。设为 false 时不启动定时器。
 *                注意：无论 enabled 是否为 true，用户切回页面时都会立即执行一次 task，
 *                确保返回页面时数据是最新的。
 */
export function usePollWhileVisible(
  task: () => void | Promise<void>,
  intervalMs: number,
  enabled: boolean = true,
) {
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    let cancelled = false;
    let timer: number | null = null;

    const run = () => {
      if (cancelled) return;
      Promise.resolve(task()).catch(() => {
        /* 错误由 task 自身处理 */
      });
    };

    const start = () => {
      if (timer !== null || !enabled) return;
      timer = window.setInterval(run, intervalMs);
    };

    const stop = () => {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    };

    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        // 用户切回页面：无论如何先刷新一次数据
        run();
        // 只有 enabled 时才启动定时轮询
        start();
      }
    };

    // 页面可见时：先刷新一次，再按需启动定时轮询
    if (!document.hidden) {
      run();
      start();
    }
    // 无论 enabled 是否为 true，都要监听 visibilitychange
    // 这样用户切回页面时总能刷新一次数据
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [task, intervalMs, enabled]);
}
