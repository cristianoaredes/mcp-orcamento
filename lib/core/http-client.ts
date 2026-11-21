/**
 * Resilient Web-standard HTTP JSON client with per-origin Circuit Breaker,
 * equal-jitter retries, and strict AbortSignal timeout cleanup.
 * Zero `node:*` imports for Cloudflare Workers parity.
 */

import { TIMEOUTS } from "../config/timeouts.js";
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
} from "../infrastructure/http/circuit-breaker.js";
import { logger } from "../infrastructure/logger.js";
import { REQUEST_ID_HEADER } from "../infrastructure/tracing.js";
import {
  createTimeoutController,
  isAbortOrTimeoutError,
} from "../shared/utils/timeout.js";
import type { HttpResponse } from "../types/index.js";

const originBreakers = new Map<string, CircuitBreaker>();

function getOriginKey(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "unknown";
  }
}

export function getCircuitBreakerForOrigin(origin: string): CircuitBreaker {
  let breaker = originBreakers.get(origin);
  if (!breaker) {
    breaker = new CircuitBreaker({ service: origin });
    originBreakers.set(origin, breaker);
  }
  return breaker;
}

export function resetCircuitBreakers(): void {
  for (const breaker of originBreakers.values()) {
    breaker.reset();
  }
  originBreakers.clear();
}

export function getCircuitBreakerMetrics() {
  return Array.from(originBreakers.values()).map((b) => b.getMetrics());
}

export interface HttpClientOptions {
  timeout?: number;
  retries?: number;
  baseDelayMs?: number;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  requestId?: string;
  circuitBreaker?: CircuitBreaker;
}

class RetryableHttpError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number
  ) {
    super(message);
    this.name = "RetryableHttpError";
  }
}

function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Request aborted"));
      return;
    }

    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("Request aborted"));
    };

    const timer = setTimeout(() => {
      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }
      resolve();
    }, ms);

    if (signal) {
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

function equalJitterDelayMs(baseDelayMs: number, attempt: number): number {
  const cap = baseDelayMs * Math.pow(2, attempt);
  const half = cap / 2;
  return Math.floor(half + Math.random() * half);
}

/**
 * Fetch JSON with per-origin circuit breaking, bounded timeouts, and retry backoff.
 * Non-retryable 4xx responses return { ok: false } without tripping the circuit breaker.
 */
export async function httpJson(
  url: string,
  options: HttpClientOptions = {}
): Promise<HttpResponse> {
  const timeoutMs =
    typeof options.timeout === "number" && options.timeout > 0
      ? options.timeout
      : TIMEOUTS.HTTP_REQUEST_MS;
  const maxRetries =
    typeof options.retries === "number" && options.retries >= 0
      ? Math.floor(options.retries)
      : 2;
  const baseDelayMs =
    typeof options.baseDelayMs === "number" && options.baseDelayMs >= 0
      ? options.baseDelayMs
      : 250;

  if (options.signal?.aborted) {
    return { ok: false, error: "Request aborted by caller", source: url };
  }

  const origin = getOriginKey(url);
  const breaker = options.circuitBreaker ?? getCircuitBreakerForOrigin(origin);

  let nonRetryableResponse: HttpResponse | undefined;

  try {
    return await breaker.execute(async () => {
      let lastError: unknown;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const ctrl = createTimeoutController(timeoutMs, options.signal);

        try {
          const headers: Record<string, string> = {
            Accept: "application/json",
            "User-Agent": "mcp-orcamento/0.1.0",
            ...(options.headers ?? {}),
          };

          if (options.requestId) {
            headers[REQUEST_ID_HEADER] = options.requestId;
          }

          const response = await fetch(url, {
            method: "GET",
            headers,
            signal: ctrl.signal,
            redirect: "error",
          });

          if (!response.ok) {
            const status = response.status;
            const statusText = response.statusText || "HTTP Error";

            // Retry transient 429 & 5xx responses
            if (status === 429 || status >= 500) {
              throw new RetryableHttpError(`HTTP ${status} ${statusText}`, status);
            }

            // 4xx (except 429) should not trip upstream availability circuit breaker
            nonRetryableResponse = {
              ok: false,
              error: `HTTP ${status} ${statusText}`,
              source: url,
            };
            return nonRetryableResponse;
          }

          const rawText = await response.text();
          let parsed: unknown;
          try {
            parsed = rawText.length > 0 ? JSON.parse(rawText) : null;
          } catch {
            nonRetryableResponse = {
              ok: false,
              error: "Invalid JSON response from upstream API",
              source: url,
            };
            return nonRetryableResponse;
          }

          return {
            ok: true,
            data: parsed,
            source: url,
          };
        } catch (error) {
          if (ctrl.wasAbortedByParent() || options.signal?.aborted) {
            nonRetryableResponse = {
              ok: false,
              error: "Request aborted by caller",
              source: url,
            };
            return nonRetryableResponse;
          }

          if (ctrl.didTimeout() || isAbortOrTimeoutError(error)) {
            lastError = new RetryableHttpError(`Request timed out after ${timeoutMs}ms`);
          } else {
            lastError = error;
          }

          if (attempt < maxRetries) {
            const delayMs = equalJitterDelayMs(baseDelayMs, attempt);
            logger.debug("Retrying upstream HTTP request", {
              origin,
              attempt: attempt + 1,
              delayMs,
              requestId: options.requestId,
            });
            try {
              await sleepWithSignal(delayMs, options.signal);
            } catch {
              nonRetryableResponse = {
                ok: false,
                error: "Request aborted by caller",
                source: url,
              };
              return nonRetryableResponse;
            }
          }
        } finally {
          ctrl.cleanup();
        }
      }

      throw lastError instanceof Error
        ? lastError
        : new Error(String(lastError ?? "Upstream HTTP request failed"));
    });
  } catch (error) {
    if (nonRetryableResponse) {
      return nonRetryableResponse;
    }

    if (error instanceof CircuitBreakerOpenError) {
      return {
        ok: false,
        error: error.message,
        source: url,
      };
    }

    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: message,
      source: url,
    };
  }
}
