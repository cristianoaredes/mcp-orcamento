/**
 * Cloudflare Worker adapter bridging Web Requests / JSON-RPC to the shared 8-tool registry.
 * Zero `node:*` imports.
 */

import { KVCache, MemoryCache } from "../core/cache.js";
import { executeTool, getMetrics, hasTool, TOOL_DEFINITIONS } from "../core/tools.js";
import { logger } from "../infrastructure/logger.js";
import {
  createRequestContext,
  REQUEST_ID_HEADER,
  type RequestContext,
} from "../infrastructure/tracing.js";
import {
  resolveMaxToolOutputChars,
  serializeBoundedToolOutput,
} from "../shared/agentic-guard.js";
import { ErrorCode, formatErrorResponse } from "../shared/errors.js";
import {
  ALLOWED_TESOURO_CKAN_HOSTS,
  ALLOWED_TESOURO_ORDS_HOSTS,
  ALLOWED_TRANSFEREGOV_HOSTS,
  API_URLS,
  CACHE,
  SERVER,
  validateUrl,
} from "../shared/utils/constants.js";
import type { ApiConfig, Cache, MCPRequest, MCPResponse } from "../types/index.js";
import type { WorkerEnv } from "../workers/types.js";

const MAX_JSON_BODY_BYTES = 100_000;
const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-03-26", "2024-11-05"] as const;

let workerMemoryCache: MemoryCache | undefined;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (typeof raw !== "string" || !/^\d+$/.test(raw.trim())) {
    return fallback;
  }
  const n = Number(raw.trim());
  return Number.isSafeInteger(n) && n > 0 ? n : fallback;
}

export function resolveWorkerApiConfig(env: WorkerEnv): ApiConfig {
  const allowLoopback = env.MCP_ALLOW_LOCALHOST_APIS === "true";

  const tesouroOrdsBaseUrl = validateUrl(
    env.TESOURO_ORDS_BASE_URL || API_URLS.DEFAULT_TESOURO_ORDS,
    { allowedHosts: ALLOWED_TESOURO_ORDS_HOSTS, allowLoopback, env: allowLoopback ? "test" : "production" }
  );
  const transferegovBaseUrl = validateUrl(
    env.TRANSFEREGOV_BASE_URL || API_URLS.DEFAULT_TRANSFEREGOV,
    { allowedHosts: ALLOWED_TRANSFEREGOV_HOSTS, allowLoopback, env: allowLoopback ? "test" : "production" }
  );
  const tesouroCkanBaseUrl = validateUrl(
    env.TESOURO_CKAN_BASE_URL || API_URLS.DEFAULT_TESOURO_CKAN,
    { allowedHosts: ALLOWED_TESOURO_CKAN_HOSTS, allowLoopback, env: allowLoopback ? "test" : "production" }
  );

  return {
    tesouroOrdsBaseUrl,
    transferegovBaseUrl,
    tesouroCkanBaseUrl,
  };
}

export function buildWorkerCache(env: WorkerEnv): Cache {
  const ttlMs = parsePositiveInt(env.MCP_CACHE_TTL, CACHE.DEFAULT_TTL_MS);
  const maxSize = parsePositiveInt(env.MCP_CACHE_SIZE, CACHE.DEFAULT_SIZE);

  const kv = env.MCP_CACHE ?? env.MCP_KV;
  if (kv) {
    return new KVCache(kv, ttlMs);
  }

  if (!workerMemoryCache) {
    // cleanupIntervalMs=0 avoids forbidden global setInterval in Workers
    workerMemoryCache = new MemoryCache(maxSize, ttlMs, 0);
  }
  return workerMemoryCache;
}

export function resetWorkerMemoryCache(): void {
  workerMemoryCache?.clear();
  workerMemoryCache = undefined;
}

export function getCorsHeaders(
  request: Request | undefined,
  env: WorkerEnv
): Record<string, string> {
  const baseHeaders: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-API-Key, X-Request-Id, Mcp-Session-Id",
    "Access-Control-Max-Age": "86400",
  };

  const allowedRaw = env.CORS_ALLOWED_ORIGINS?.trim();
  if (!allowedRaw) {
    return {
      ...baseHeaders,
      "Access-Control-Allow-Origin": "*",
    };
  }

  const allowedOrigins = allowedRaw
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
  const requestOrigin = request?.headers.get("origin")?.trim();

  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    return {
      ...baseHeaders,
      "Access-Control-Allow-Origin": requestOrigin,
      Vary: "Origin",
    };
  }

  return {
    ...baseHeaders,
    Vary: "Origin",
  };
}

export function handleOptions(request: Request, env: WorkerEnv): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(request, env),
  });
}

function negotiateProtocolVersion(requested?: unknown): string {
  if (
    typeof requested === "string" &&
    (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
  ) {
    return requested;
  }
  return SUPPORTED_PROTOCOL_VERSIONS[0];
}

export async function handleMCPRequest(
  rpcRequest: MCPRequest,
  env: WorkerEnv,
  requestContext?: RequestContext
): Promise<MCPResponse> {
  const id = rpcRequest?.id ?? null;

  if (!rpcRequest || rpcRequest.jsonrpc !== "2.0" || typeof rpcRequest.method !== "string") {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: ErrorCode.INVALID_REQUEST,
        message: "Invalid JSON-RPC 2.0 request",
      },
    };
  }

  const reqCtx = requestContext ?? createRequestContext({ transport: "cloudflare-worker" });

  try {
    switch (rpcRequest.method) {
      case "initialize": {
        const params =
          typeof rpcRequest.params === "object" && rpcRequest.params !== null
            ? (rpcRequest.params as { protocolVersion?: unknown })
            : {};
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: negotiateProtocolVersion(params.protocolVersion),
            capabilities: {
              tools: {},
              resources: {},
            },
            serverInfo: {
              name: SERVER.NAME,
              version: SERVER.VERSION,
            },
          },
        };
      }

      case "notifications/initialized":
      case "ping": {
        return {
          jsonrpc: "2.0",
          id,
          result: {},
        };
      }

      case "tools/list": {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            tools: TOOL_DEFINITIONS,
          },
        };
      }

      case "resources/list": {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            resources: [],
          },
        };
      }

      case "resources/read": {
        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: ErrorCode.INVALID_PARAMS,
            message: "Unknown resource URI",
          },
        };
      }

      case "tools/call": {
        const params =
          typeof rpcRequest.params === "object" && rpcRequest.params !== null
            ? (rpcRequest.params as { name?: unknown; arguments?: unknown })
            : {};

        if (typeof params.name !== "string" || params.name.trim().length === 0) {
          return {
            jsonrpc: "2.0",
            id,
            error: {
              code: ErrorCode.INVALID_PARAMS,
              message: "tools/call requires a non-empty string 'name' parameter",
            },
          };
        }

        const apiConfig = resolveWorkerApiConfig(env);
        const cache = buildWorkerCache(env);
        const maxChars = resolveMaxToolOutputChars(env.MCP_MAX_TOOL_OUTPUT_CHARS);

        const result = await executeTool(params.name, params.arguments ?? {}, {
          apiConfig,
          cache,
          requestId: reqCtx.requestId,
          requestContext: reqCtx,
        });

        return {
          jsonrpc: "2.0",
          id,
          result: {
            isError: !result.ok,
            content: [
              {
                type: "text",
                text: serializeBoundedToolOutput(result, maxChars),
              },
            ],
          },
        };
      }

      default: {
        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: ErrorCode.METHOD_NOT_FOUND,
            message: `Method not found: ${rpcRequest.method}`,
          },
        };
      }
    }
  } catch (error) {
    logger.error("Worker MCP request execution failed", {
      method: rpcRequest.method,
      requestId: reqCtx.requestId,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      jsonrpc: "2.0",
      id,
      error: formatErrorResponse(error),
    };
  }
}

export async function readBoundedJsonBody(request: Request): Promise<
  | { ok: true; body: unknown; rawText: string }
  | { ok: false; status: number; error: string; code: number }
> {
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > MAX_JSON_BODY_BYTES) {
    return {
      ok: false,
      status: 413,
      code: ErrorCode.INVALID_REQUEST,
      error: `Request body exceeds ${MAX_JSON_BODY_BYTES} bytes limit`,
    };
  }

  let rawText: string;
  try {
    rawText = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return {
      ok: false,
      status: 400,
      code: ErrorCode.PARSE_ERROR,
      error: "Invalid UTF-8 request body encoding",
    };
  }

  try {
    const body: unknown = JSON.parse(rawText);
    return { ok: true, body, rawText };
  } catch {
    return {
      ok: false,
      status: 400,
      code: ErrorCode.PARSE_ERROR,
      error: "Malformed JSON request body",
    };
  }
}

export async function handleMCPEndpoint(
  request: Request,
  env: WorkerEnv,
  requestContext?: RequestContext
): Promise<Response> {
  const reqCtx =
    requestContext ?? createRequestContext({ headers: request.headers, transport: "worker-http" });
  const corsHeaders = getCorsHeaders(request, env);
  const baseHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    [REQUEST_ID_HEADER]: reqCtx.requestId,
    ...corsHeaders,
  };

  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: ErrorCode.INVALID_REQUEST, message: "Method not allowed; use POST" },
      }),
      { status: 405, headers: baseHeaders }
    );
  }

  const parsed = await readBoundedJsonBody(request);
  if (!parsed.ok) {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: parsed.code, message: parsed.error },
      }),
      { status: parsed.status, headers: baseHeaders }
    );
  }

  if (typeof parsed.body !== "object" || parsed.body === null || Array.isArray(parsed.body)) {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: ErrorCode.INVALID_REQUEST, message: "Expected JSON-RPC object payload" },
      }),
      { status: 400, headers: baseHeaders }
    );
  }

  const rpcRequest = parsed.body as MCPRequest;
  const response = await handleMCPRequest(rpcRequest, env, reqCtx);

  const isNotification =
    rpcRequest.id === undefined &&
    typeof rpcRequest.method === "string" &&
    rpcRequest.method.startsWith("notifications/");

  if (isNotification) {
    return new Response(null, { status: 202, headers: baseHeaders });
  }

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: baseHeaders,
  });
}

export async function handleHealthCheck(
  env: WorkerEnv,
  request?: Request,
  requestContext?: RequestContext
): Promise<Response> {
  const reqCtx =
    requestContext ?? createRequestContext({ headers: request?.headers, transport: "worker-health" });
  const metrics = getMetrics();
  const corsHeaders = getCorsHeaders(request, env);

  return new Response(
    JSON.stringify({
      status: "healthy",
      service: SERVER.NAME,
      version: SERVER.VERSION,
      runtime: "cloudflare-workers",
      tools: TOOL_DEFINITIONS.length,
      timestamp: new Date().toISOString(),
      kv_bound: Boolean(env.MCP_CACHE || env.MCP_KV),
      privacy: {
        dpo_contact: env.MCP_DPO_CONTACT ?? null,
        lgpd_notice: true,
      },
      metrics: {
        requests: metrics.requests,
        cacheHits: metrics.cacheHits,
        errors: metrics.errors,
        uptimeMs: metrics.uptimeMs,
      },
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        [REQUEST_ID_HEADER]: reqCtx.requestId,
        ...corsHeaders,
      },
    }
  );
}

export { hasTool };
