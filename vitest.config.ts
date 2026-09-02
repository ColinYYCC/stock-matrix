import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    // 排除外置硬盘产生的 macOS AppleDouble 元数据文件（._* 前缀），它们不是源码
    exclude: ["**/node_modules/**", "**/._*"],
    environment: "node",
  },
});
