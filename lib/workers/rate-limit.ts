/**
 * Cloudflare Worker rate limiting (KV-backed fixed-window with in-memory fallback).
 * Avoids global-scope setInterval for Workers runtime compatibility.
 */

import { RateLimiter } from "../infrastructure/rate-limiter.js";
import type { WorkerEnv, WorkerRateLimitResult } from "./types.js";

const DEFAULT_WORKER_RATE_LIMIT = 100;
const WINDOW_SECONDS = 60;
const MIN_KV_TTL_SECONDS = 60;

// cleanupIntervalMs=0 prevents forbidden global timers inside Cloudflare Workers
let memoryLimiter = new RateLimiter({
  maxRequests: DEFAULT_WORKER_RATE_LIMIT,
  windowMs: WINDOW_SECONDS * 1000,
  cleanupIntervalMs: 0,
});
let configuredLimit = DEFAULT_WORKER_RATE_LIMIT;

export function parseWorkerRateLimit(env: WorkerEnv): number {
  const raw = env.MCP_RATE_LIMIT;
  if (typeof raw !== "string" || !/^\d+$/.test(raw.trim())) {
    return DEFAULT_WORKER_RATE_LIMIT;
  }
  const parsed = Number(raw.trim());
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : DEFAULT_WORKER_RATE_LIMIT;
}

export function getClientIdentifier(request: Request): string {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp && cfIp.trim().length > 0) {
    return cfIp.trim();
  }
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor && forwardedFor.trim().length > 0) {
    return forwardedFor.split(",")[0].trim() || "anonymous";
  }
  return "anonymous";
}

export async function checkWorkerRateLimit(
  request: Request,
  env: WorkerEnv
): Promise<WorkerRateLimitResult> {
  const limit = parseWorkerRateLimit(env);
  const clientId = getClientIdentifier(request);
  const now = Date.now();
  const windowBucket = Math.floor(now / (WINDOW_SECONDS * 1000));
  const resetAt = (windowBucket + 1) * WINDOW_SECONDS * 1000;
  const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));

  const kv = env.MCP_KV ?? env.MCP_CACHE;
  if (kv) {
    const key = `rl:${clientId}:${windowBucket}`;
    try {
      const existing = await kv.get(key, "json");
      const currentCount =
        typeof existing === "object" &&
        existing !== null &&
        typeof (existing as { count?: unknown }).count === "number"
          ? ((existing as { count: number }).count as number)
          : 0;

      if (currentCount >= limit) {
        return {
          allowed: false,
          limit,
          remaining: 0,
          resetAt,
          retryAfterSeconds,
          backend: "kv",
        };
      }

      const nextCount = currentCount + 1;
      await kv.put(key, JSON.stringify({ count: nextCount }), {
        expirationTtl: MIN_KV_TTL_SECONDS,
      });

      return {
        allowed: true,
        limit,
        remaining: Math.max(0, limit - nextCount),
        resetAt,
        retryAfterSeconds: 0,
        backend: "kv",
      };
    } catch {
      // Fall back to in-memory limiter if KV experiences a transient error
    }
  }

  if (limit !== configuredLimit) {
    configuredLimit = limit;
    memoryLimiter = new RateLimiter({
      maxRequests: limit,
      windowMs: WINDOW_SECONDS * 1000,
      cleanupIntervalMs: 0,
    });
  }

  memoryLimiter.cleanup(now);
  const decision = memoryLimiter.check(clientId, now);
  return {
    allowed: decision.allowed,
    limit: decision.limit,
    remaining: decision.remaining,
    resetAt: decision.resetAt,
    retryAfterSeconds: decision.retryAfterSeconds,
    backend: "memory",
  };
}

export function rateLimitHeaders(result: WorkerRateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
  };

  if (!result.allowed) {
    headers["Retry-After"] = String(result.retryAfterSeconds);
  }

  return headers;
}

export function resetWorkerMemoryRateLimiter(): void {
  memoryLimiter.reset();
}
