import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // 项目在外置卷上：Turbopack 默认开启的磁盘持久缓存会在这种文件系统上
    // 初始化数据库时直接崩掉（"Failed to open database"），导致 dev server
    // 刚 Ready 就退出。显式关掉，代价只是重启 dev 时重新编译，无缓存加速。
    turbopackFileSystemCacheForDev: false,
    // 同一问题的 build 分支（2026-09-09 备案预案）：OpenNext 内部执行
    // `next build` 时持久化缓存同样崩（"invalid digit found in string"）。
    // 关掉后构建稍慢但稳定，产物不受影响。
    turbopackFileSystemCacheForBuild: false,
  },
};

export default nextConfig;
