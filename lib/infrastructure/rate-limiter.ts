/**
 * Sliding-window in-memory rate limiter safe for Node CLI/HTTP and Cloudflare Workers.
 */

import { TIMEOUTS } from "../config/timeouts.js";

export interface RateLimiterOptions {
  maxRequests?: number;
  windowMs?: number;
  cleanupIntervalMs?: number;
  maxBuckets?: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: number;
  retryAfterSeconds: number;
}

export class RateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly maxBuckets: number;
  private readonly buckets = new Map<string, number[]>();
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(options: RateLimiterOptions = {}) {
    this.maxRequests =
      typeof options.maxRequests === "number" && options.maxRequests > 0
        ? Math.floor(options.maxRequests)
        : 100;
    this.windowMs =
      typeof options.windowMs === "number" && options.windowMs > 0
        ? Math.floor(options.windowMs)
        : TIMEOUTS.RATE_LIMIT_WINDOW_MS;
    this.maxBuckets =
      typeof options.maxBuckets === "number" && options.maxBuckets > 0
        ? Math.floor(options.maxBuckets)
        : 10_000;

    const cleanupIntervalMs =
      typeof options.cleanupIntervalMs === "number"
        ? options.cleanupIntervalMs
        : TIMEOUTS.RATE_LIMIT_CLEANUP_MS;

    if (cleanupIntervalMs > 0 && typeof setInterval === "function") {
      this.cleanupTimer = setInterval(() => this.cleanup(), cleanupIntervalMs);
      (this.cleanupTimer as { unref?: () => void }).unref?.();
    }
  }

  check(key: string, now: number = Date.now()): RateLimitDecision {
    const normalizedKey = key || "anonymous";
    const cutoff = now - this.windowMs;
    const existing = this.buckets.get(normalizedKey) ?? [];
    const active = existing.filter((ts) => ts > cutoff);

    if (active.length >= this.maxRequests) {
      this.buckets.set(normalizedKey, active);
      const oldest = active[0] ?? now;
      const resetAt = oldest + this.windowMs;
      const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));
      return {
        allowed: false,
        remaining: 0,
        limit: this.maxRequests,
        resetAt,
        retryAfterSeconds,
      };
    }

    if (!this.buckets.has(normalizedKey) && this.buckets.size >= this.maxBuckets) {
      const oldestKey = this.buckets.keys().next().value;
      if (oldestKey !== undefined) {
        this.buckets.delete(oldestKey);
      }
    }

    active.push(now);
    this.buckets.set(normalizedKey, active);

    const oldest = active[0] ?? now;
    return {
      allowed: true,
      remaining: Math.max(0, this.maxRequests - active.length),
      limit: this.maxRequests,
      resetAt: oldest + this.windowMs,
      retryAfterSeconds: 0,
    };
  }

  /**
   * Convenience boolean alias matching sliding-window rate limiter callers.
   */
  isAllowed(key: string, now: number = Date.now()): boolean {
    return this.check(key, now).allowed;
  }

  cleanup(now: number = Date.now()): number {
    const cutoff = now - this.windowMs;
    let removed = 0;
    for (const [key, timestamps] of this.buckets.entries()) {
      const active = timestamps.filter((ts) => ts > cutoff);
      if (active.length === 0) {
        this.buckets.delete(key);
        removed++;
      } else if (active.length !== timestamps.length) {
        this.buckets.set(key, active);
      }
    }
    return removed;
  }

  reset(key?: string): void {
    if (key !== undefined) {
      this.buckets.delete(key);
    } else {
      this.buckets.clear();
    }
  }

  size(): number {
    return this.buckets.size;
  }

  destroy(): void {
    if (this.cleanupTimer !== undefined) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.buckets.clear();
  }

  dispose(): void {
    this.destroy();
  }
}
