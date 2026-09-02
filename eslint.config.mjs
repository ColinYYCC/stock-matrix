import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@next/next/no-img-element": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // "**/._*"：排除外置硬盘产生的 macOS AppleDouble 元数据文件（不是源码）
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "**/._*"]),
]);

export default eslintConfig;
