/**
 * Centralized timeout configuration for HTTP, ORDS, SSE, circuit breaker, and rate limiting.
 * Zero Node-only imports so Cloudflare Workers and Node CLI share identical defaults.
 */

function readEnvString(key: string): string | undefined {
  if (typeof process === "undefined" || !process?.env) {
    return undefined;
  }
  return process.env[key];
}

export function parsePositiveTimeoutMs(raw: string | undefined, fallbackMs: number): number {
  if (typeof raw !== "string") {
    return fallbackMs;
  }
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return fallbackMs;
  }
  const parsed = Number(trimmed);
  if (Number.isSafeInteger(parsed) && parsed > 0) {
    return parsed;
  }
  return fallbackMs;
}

export function getOrdsRequestTimeoutMs(override?: string): number {
  const raw = override !== undefined ? override : readEnvString("MCP_ORDS_TIMEOUT");
  return parsePositiveTimeoutMs(raw, 15_000);
}

export const TIMEOUTS = {
  /** Standard HTTP timeout for fast APIs (CKAN, Transferegov PostgREST) */
  HTTP_REQUEST_MS: parsePositiveTimeoutMs(readEnvString("MCP_HTTP_TIMEOUT"), 8_000),

  /** Extended HTTP timeout for Tesouro Nacional ORDS endpoints (SICONFI / SADIPEM) */
  ORDS_REQUEST_MS: getOrdsRequestTimeoutMs(),

  /** Cooldown before transitioning an open circuit breaker to HALF_OPEN */
  CIRCUIT_BREAKER_RESET_MS: 30_000,

  /** Maximum lifetime for an SSE HTTP connection */
  SSE_CONNECTION_MS: 50_000,

  /** Heartbeat ping interval for active SSE connections */
  PING_INTERVAL_MS: 30_000,

  /** Interval between expired sliding-window rate-limiter bucket cleanups */
  RATE_LIMIT_CLEANUP_MS: 60_000,

  /** Sliding window duration for rate limiting */
  RATE_LIMIT_WINDOW_MS: 60_000,
} as const;
