// @vitest-environment node

import { describe, expect, it } from "vitest";
import { resolveBackendProxyTarget, resolveViteDevPort } from "../vite.config.js";

describe("vite config", () => {
  it("derives the API proxy target from BACKEND_URL for custom demo ports", async () => {
    const previousBackendUrl = process.env.BACKEND_URL;
    const previousTarget = process.env.VITE_BACKEND_PROXY_TARGET;
    const previousDevPort = process.env.VITE_DEV_PORT;

    process.env.BACKEND_URL = "http://localhost:8877/api/health";
    process.env.VITE_DEV_PORT = "5177";
    delete process.env.VITE_BACKEND_PROXY_TARGET;

    try {
      expect(resolveViteDevPort()).toBe(5177);
      expect(resolveBackendProxyTarget()).toBe("http://localhost:8877");
    } finally {
      restoreEnv("BACKEND_URL", previousBackendUrl);
      restoreEnv("VITE_BACKEND_PROXY_TARGET", previousTarget);
      restoreEnv("VITE_DEV_PORT", previousDevPort);
    }
  });

  it("lets VITE_BACKEND_PROXY_TARGET override BACKEND_URL", async () => {
    const previousBackendUrl = process.env.BACKEND_URL;
    const previousTarget = process.env.VITE_BACKEND_PROXY_TARGET;

    process.env.BACKEND_URL = "http://localhost:8877/api/health";
    process.env.VITE_BACKEND_PROXY_TARGET = "http://localhost:9999";

    try {
      expect(resolveBackendProxyTarget()).toBe("http://localhost:9999");
    } finally {
      restoreEnv("BACKEND_URL", previousBackendUrl);
      restoreEnv("VITE_BACKEND_PROXY_TARGET", previousTarget);
    }
  });
});

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
