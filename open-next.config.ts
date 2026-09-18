// Cloudflare 部署适配配置（@opennextjs/cloudflare 官方最小配置）
// 说明：本项目 API 路由自带响应缓存头，无需额外的缓存适配器
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig();
