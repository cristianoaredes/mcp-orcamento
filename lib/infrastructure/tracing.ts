/**
 * Request tracing helpers using Web Crypto API (compatible with Node 22+ and Cloudflare Workers).
 */

export const REQUEST_ID_HEADER = "x-request-id";
const SAFE_REQUEST_ID_REGEX = /^[A-Za-z0-9._-]{1,128}$/;

export interface RequestContext {
  requestId: string;
  startTime: number;
  transport?: string;
  clientIp?: string;
  elapsedMs(): number;
  toLogMeta(extra?: Record<string, unknown>): Record<string, unknown>;
}

export function generateRequestId(): string {
  const webCrypto = globalThis.crypto;
  if (webCrypto && typeof webCrypto.randomUUID === "function") {
    return webCrypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (webCrypto && typeof webCrypto.getRandomValues === "function") {
    webCrypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export type HeaderSource =
  | Headers
  | Record<string, string | string[] | undefined>
  | undefined;

export function extractRequestId(headers?: HeaderSource): string | undefined {
  if (!headers) return undefined;

  let raw: string | undefined;
  if (typeof (headers as Headers).get === "function") {
    raw = (headers as Headers).get(REQUEST_ID_HEADER) ?? undefined;
  } else {
    const record = headers as Record<string, string | string[] | undefined>;
    for (const [k, v] of Object.entries(record)) {
      if (k.toLowerCase() === REQUEST_ID_HEADER) {
        raw = Array.isArray(v) ? v[0] : v;
        break;
      }
    }
  }

  if (!raw) return undefined;
  const trimmed = raw.trim();
  return SAFE_REQUEST_ID_REGEX.test(trimmed) ? trimmed : undefined;
}

export interface CreateRequestContextOptions {
  requestId?: string;
  headers?: HeaderSource;
  transport?: string;
  clientIp?: string;
  startTime?: number;
}

export function createRequestContext(options: CreateRequestContextOptions = {}): RequestContext {
  const requestId =
    (options.requestId && SAFE_REQUEST_ID_REGEX.test(options.requestId.trim())
      ? options.requestId.trim()
      : undefined) ??
    extractRequestId(options.headers) ??
    generateRequestId();

  const startTime = options.startTime ?? Date.now();

  return {
    requestId,
    startTime,
    ...(options.transport ? { transport: options.transport } : {}),
    ...(options.clientIp ? { clientIp: options.clientIp } : {}),
    elapsedMs: () => Math.max(0, Date.now() - startTime),
    toLogMeta: (extra = {}) => ({
      requestId,
      elapsedMs: Math.max(0, Date.now() - startTime),
      ...(options.transport ? { transport: options.transport } : {}),
      ...extra,
    }),
  };
}
