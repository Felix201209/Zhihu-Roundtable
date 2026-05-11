import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export class MemoryCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();

  constructor(private readonly defaultTtlMs = 60_000) {}

  get<T>(key: string): T | undefined {
    const entry = this.entries.get(key);

    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }

    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs = this.defaultTtlMs): T {
    this.entries.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });

    return value;
  }

  async getOrSet<T>(key: string, loader: () => Promise<T>, ttlMs = this.defaultTtlMs): Promise<T> {
    const cached = this.get<T>(key);

    if (cached !== undefined) {
      return cached;
    }

    return this.set(key, await loader(), ttlMs);
  }

  clear(): void {
    this.entries.clear();
  }
}

type FileCacheShape = Record<string, CacheEntry<unknown>>;

export class JsonFileCache {
  constructor(private readonly filePath: string) {}

  get<T>(key: string): T | undefined {
    const entries = this.read();
    const entry = entries[key];

    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt <= Date.now()) {
      delete entries[key];
      this.write(entries);
      return undefined;
    }

    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): T {
    const entries = this.read();
    entries[key] = {
      value,
      expiresAt: Date.now() + ttlMs,
    };
    this.write(entries);
    return value;
  }

  clear(): void {
    this.write({});
  }

  private read(): FileCacheShape {
    const path = resolve(this.filePath);
    if (!existsSync(path)) {
      return {};
    }

    try {
      return JSON.parse(readFileSync(path, "utf8")) as FileCacheShape;
    } catch {
      return {};
    }
  }

  private write(entries: FileCacheShape): void {
    const path = resolve(this.filePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(entries, null, 2));
  }
}
