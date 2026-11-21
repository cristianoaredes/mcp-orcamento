/**
 * Cache implementations for Node (in-memory LRU + TTL) and Cloudflare Workers (KV).
 * Zero `node:*` imports.
 */

import { CACHE } from "../shared/utils/constants.js";
import type { Cache, CacheEntry } from "../types/index.js";

export const MIN_KV_EXPIRATION_TTL_SECONDS = 60;

export interface KVNamespaceLike {
  get(key: string, type: "json"): Promise<unknown>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export class MemoryCache implements Cache {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly maxSize: number;
  private readonly ttlMs: number;
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor(
    maxSize: number = CACHE.DEFAULT_SIZE,
    ttlMs: number = CACHE.DEFAULT_TTL_MS,
    cleanupIntervalMs: number = CACHE.CLEANUP_INTERVAL_MS
  ) {
    this.maxSize = maxSize > 0 ? Math.floor(maxSize) : CACHE.DEFAULT_SIZE;
    this.ttlMs = ttlMs > 0 ? Math.floor(ttlMs) : CACHE.DEFAULT_TTL_MS;

    if (cleanupIntervalMs > 0 && typeof setInterval === "function") {
      this.cleanupTimer = setInterval(() => this.cleanup(), cleanupIntervalMs);
      (this.cleanupTimer as { unref?: () => void }).unref?.();
    }
  }

  get<T = unknown>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return null;
    }

    // Refresh insertion order for LRU eviction
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.data as T;
  }

  set<T = unknown>(key: string, data: T): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      data,
      expires: Date.now() + this.ttlMs,
    });
  }

  cleanup(now: number = Date.now()): number {
    let removed = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expires) {
        this.cache.delete(key);
        removed++;
      }
    }
    return removed;
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  destroy(): void {
    if (this.cleanupTimer !== undefined) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.cache.clear();
  }

  dispose(): void {
    this.destroy();
  }
}

export class KVCache implements Cache {
  private readonly ttlSeconds: number;

  constructor(
    private readonly kv: KVNamespaceLike,
    ttlMs: number = CACHE.DEFAULT_TTL_MS
  ) {
    const computed = Math.ceil((ttlMs > 0 ? ttlMs : CACHE.DEFAULT_TTL_MS) / 1000);
    this.ttlSeconds = Math.max(MIN_KV_EXPIRATION_TTL_SECONDS, computed);
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    try {
      const value = await this.kv.get(key, "json");
      return (value as T | null | undefined) ?? null;
    } catch {
      return null;
    }
  }

  async set<T = unknown>(key: string, data: T): Promise<void> {
    try {
      await this.kv.put(key, JSON.stringify(data), {
        expirationTtl: this.ttlSeconds,
      });
    } catch {
      // Transient KV write failure should not break tool execution
    }
  }

  async clear(): Promise<void> {
    // KV namespace clearing is intentionally unsupported in Workers runtime
  }
}
