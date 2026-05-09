import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type LoadLocalEnvOptions = {
  cwd?: string;
  files?: string[];
  override?: boolean;
};

export function loadLocalEnv(options: LoadLocalEnvOptions = {}): string[] {
  const cwd = options.cwd ?? process.cwd();
  const files = options.files ?? [".env.local", ".env"];
  const loaded: string[] = [];

  for (const file of files) {
    const path = resolve(cwd, file);
    if (!existsSync(path)) {
      continue;
    }

    const lines = readFileSync(path, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const parsed = parseEnvLine(line);
      if (!parsed) {
        continue;
      }
      if (!options.override && process.env[parsed.key] !== undefined) {
        continue;
      }
      process.env[parsed.key] = parsed.value;
      loaded.push(parsed.key);
    }
  }

  return loaded;
}

function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const withoutExport = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trim() : trimmed;
  const separator = withoutExport.indexOf("=");
  if (separator <= 0) {
    return null;
  }

  const key = withoutExport.slice(0, separator).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return null;
  }

  const rawValue = withoutExport.slice(separator + 1).trim();
  return { key, value: stripQuotes(rawValue) };
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
