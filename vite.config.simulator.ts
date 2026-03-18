import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const OPENCODE_URL = process.env.OPENCODE_URL ?? "http://localhost:4096";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  root: "simulator",
  server: {
    port: 3000,
    // In dev mode, proxy /opencode/* to the real OpenCode server (avoids CORS)
    proxy:
      mode !== "test"
        ? {
            "/opencode": {
              target: OPENCODE_URL,
              rewrite: (path: string) => path.replace(/^\/opencode/, ""),
              changeOrigin: true,
            },
          }
        : undefined,
  },
}));
