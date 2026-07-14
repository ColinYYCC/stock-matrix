"use client";

import { useEffect, useState } from "react";

/**
 * 页面可见时定时轮询，页面不可见时自动暂停
 *
 * @param task 每次要执行的任务函数
 * @param intervalMs 轮询间隔（毫秒）
 */
export function usePollWhileVisible(task: () => void | Promise<void>, intervalMs: number) {
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
      if (timer !== null) return;
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
        run();
        start();
      }
    };

    if (!document.hidden) {
      run();
      start();
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [task, intervalMs]);
}
