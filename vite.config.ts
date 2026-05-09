import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: resolveViteDevPort(),
    proxy: {
      "/api": resolveBackendProxyTarget(),
    },
  },
  test: {
    environment: "jsdom",
  },
});

export function resolveViteDevPort() {
  return Number(process.env.VITE_DEV_PORT ?? 5173);
}

export function resolveBackendProxyTarget() {
  if (process.env.VITE_BACKEND_PROXY_TARGET) {
    return process.env.VITE_BACKEND_PROXY_TARGET;
  }

  if (process.env.BACKEND_URL) {
    return new URL(process.env.BACKEND_URL).origin;
  }

  return "http://localhost:8787";
}
