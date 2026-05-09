import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadLocalEnv } from "../src/backend/env.js";

const touchedKeys = ["DEEPSEEK_API_KEY", "DEEPSEEK_FLASH_MODEL", "EXISTING_ENV_VALUE"];

afterEach(() => {
  for (const key of touchedKeys) {
    delete process.env[key];
  }
});

describe("local env loader", () => {
  it("loads ignored local env files without overriding shell values", () => {
    const cwd = mkdtempSync(join(tmpdir(), "zhihu-env-"));
    process.env.EXISTING_ENV_VALUE = "from-shell";

    writeFileSync(
      join(cwd, ".env.local"),
      [
        "# local secrets",
        "DEEPSEEK_API_KEY=sk-local-test",
        "DEEPSEEK_FLASH_MODEL=\"deepseek-v4-flash\"",
        "EXISTING_ENV_VALUE=from-file",
      ].join("\n"),
    );

    try {
      const loaded = loadLocalEnv({ cwd });

      expect(loaded).toContain("DEEPSEEK_API_KEY");
      expect(loaded).toContain("DEEPSEEK_FLASH_MODEL");
      expect(process.env.DEEPSEEK_API_KEY).toBe("sk-local-test");
      expect(process.env.DEEPSEEK_FLASH_MODEL).toBe("deepseek-v4-flash");
      expect(process.env.EXISTING_ENV_VALUE).toBe("from-shell");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
