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
