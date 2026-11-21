import { afterEach, describe, expect, it, vi } from "vitest";
import { KVCache, MemoryCache, MIN_KV_EXPIRATION_TTL_SECONDS } from "../../lib/core/cache.js";
import { RateLimiter } from "../../lib/infrastructure/rate-limiter.js";

describe("Cache & Rate Limiter", () => {
  const caches: MemoryCache[] = [];
  const limiters: RateLimiter[] = [];

  afterEach(() => {
    while (caches.length > 0) {
      caches.pop()!.destroy();
    }
    while (limiters.length > 0) {
      limiters.pop()!.dispose();
    }
  });

  it("MemoryCache performs LRU eviction, TTL expiration, and manual cleanup", async () => {
    const cache = new MemoryCache(2, 30, 0);
    caches.push(cache);

    cache.set("k1", { v: 1 });
    cache.set("k2", { v: 2 });
    // Access k1 to promote it as most-recently-used so k2 gets evicted next
    expect(cache.get("k1")).toEqual({ v: 1 });

    cache.set("k3", { v: 3 });
    expect(cache.size()).toBe(2);
    expect(cache.get("k2")).toBeNull();
    expect(cache.get("k1")).toEqual({ v: 1 });
    expect(cache.get("k3")).toEqual({ v: 3 });

    await new Promise((r) => setTimeout(r, 40));
    expect(cache.get("k1")).toBeNull();
    expect(cache.cleanup()).toBeGreaterThanOrEqual(1);
    cache.clear();
    expect(cache.size()).toBe(0);
  });

  it("KVCache enforces minimum 60s expirationTtl and degrades gracefully on KV failures", async () => {
    const putMock = vi.fn().mockResolvedValue(undefined);
    const getMock = vi.fn().mockResolvedValue({ cached: true });

    const kv = new KVCache({ get: getMock, put: putMock }, 5_000);
    await kv.set("item:1", { hello: "world" });
    expect(putMock).toHaveBeenCalledWith("item:1", JSON.stringify({ hello: "world" }), {
      expirationTtl: MIN_KV_EXPIRATION_TTL_SECONDS,
    });
    expect(await kv.get("item:1")).toEqual({ cached: true });

    const failingKv = new KVCache(
      {
        get: vi.fn().mockRejectedValue(new Error("kv down")),
        put: vi.fn().mockRejectedValue(new Error("kv write fail")),
      },
      120_000
    );
    await expect(failingKv.get("x")).resolves.toBeNull();
    await expect(failingKv.set("x", 1)).resolves.toBeUndefined();
    await expect(failingKv.clear()).resolves.toBeUndefined();
  });

  it("RateLimiter enforces sliding window limits, maxBuckets eviction, cleanup, and reset", () => {
    const limiter = new RateLimiter({
      maxRequests: 2,
      windowMs: 1_000,
      cleanupIntervalMs: 0,
      maxBuckets: 2,
    });
    limiters.push(limiter);

    const t0 = 10_000;
    expect(limiter.isAllowed("ip-1", t0)).toBe(true);
    expect(limiter.isAllowed("ip-1", t0 + 10)).toBe(true);
    const denied = limiter.check("ip-1", t0 + 20);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBe(1);

    // Advances past sliding window
    expect(limiter.isAllowed("ip-1", t0 + 1_100)).toBe(true);

    // Max buckets = 2 evicts oldest key when a 3rd client arrives
    limiter.isAllowed("ip-2", t0 + 1_100);
    limiter.isAllowed("ip-3", t0 + 1_100);
    expect(limiter.size()).toBe(2);

    expect(limiter.cleanup(t0 + 5_000)).toBe(2);
    limiter.reset();
    expect(limiter.size()).toBe(0);
  });
});
