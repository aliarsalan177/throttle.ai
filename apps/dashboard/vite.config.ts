import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Local-only dashboard. In dev, proxy the TRE management API so the browser
// talks same-origin (no CORS dance) and the proxy stays on 127.0.0.1.
const TRE_PROXY = process.env.TRE_PROXY_URL ?? "http://127.0.0.1:8787";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/v1": { target: TRE_PROXY, changeOrigin: true },
      "/health": { target: TRE_PROXY, changeOrigin: true },
    },
  },
});
