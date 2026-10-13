import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 本地开发：Vite dev server 把 /api 和 /s 反代到本地 backend。
// 在 docker compose 部署里 frontend 是构建产物，由 Drogon 直接 serve，不走这个 proxy。
//
// 没本地装 backend 的话，可以 SSH tunnel：
//   ssh -L 5494:localhost:5494 root@<server>
// 然后 npm run dev 即可。
const BACKEND_URL = process.env.CLOUDFILE_DEV_BACKEND ?? 'http://localhost:5494';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: BACKEND_URL, changeOrigin: true },
      '/s':   { target: BACKEND_URL, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
