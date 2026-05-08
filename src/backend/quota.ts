import type { ApiQuotaKey, ApiQuotaStatus } from "../core/types.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_API_LIMITS: Record<ApiQuotaKey, number> = {
  hot_list: 100,
  zhihu_search: 1000,
  global_search: 1000,
  ring_detail: 500,
  publish_pin: 100,
  comment_list: 1000,
  comment_create: 100,
  reaction: 1000,
};

type Counter = {
  used: number;
  resetAt: number;
};

export class ApiQuotaManager {
  private readonly counters = new Map<ApiQuotaKey, Counter>();

  constructor(private readonly limits: Record<ApiQuotaKey, number> = DEFAULT_API_LIMITS) {}

  consume(key: ApiQuotaKey): ApiQuotaStatus {
    const current = this.current(key);

    if (current.remaining <= 0) {
      throw new Error(`${key} 今日 API 配额已用尽，将使用缓存或 mock 兜底。`);
    }

    const counter = this.ensureCounter(key);
    counter.used += 1;
    return this.current(key);
  }

  current(key: ApiQuotaKey): ApiQuotaStatus {
    const counter = this.ensureCounter(key);
    const limit = this.limits[key];

    return {
      key,
      limit,
      used: counter.used,
      remaining: Math.max(0, limit - counter.used),
      resetAt: new Date(counter.resetAt).toISOString(),
    };
  }

  all(): ApiQuotaStatus[] {
    return (Object.keys(this.limits) as ApiQuotaKey[]).map((key) => this.current(key));
  }

  private ensureCounter(key: ApiQuotaKey): Counter {
    const existing = this.counters.get(key);

    if (existing && existing.resetAt > Date.now()) {
      return existing;
    }

    const next = {
      used: 0,
      resetAt: Date.now() + DAY_MS,
    };
    this.counters.set(key, next);
    return next;
  }
}
