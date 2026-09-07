import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(dir, "src"),
    },
  },
  server: {
    // 开发时数据来自 CLI 的本地查看服务:`pnpm dev:cli ui`
    proxy: {
      "/api": "http://127.0.0.1:4321",
    },
  },
});
