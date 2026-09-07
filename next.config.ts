import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // 项目在外置卷上：Turbopack 默认开启的磁盘持久缓存会在这种文件系统上
    // 初始化数据库时直接崩掉（"Failed to open database"），导致 dev server
    // 刚 Ready 就退出。显式关掉，代价只是重启 dev 时重新编译，无缓存加速。
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
