/**
 * Cloudflare Worker SSE transport handler with optional KV session persistence.
 * Zero `node:*` imports.
 */

import {
  getCorsHeaders,
  handleMCPRequest,
  readBoundedJsonBody,
} from "../adapters/cloudflare.js";
import {
  createRequestContext,
  generateRequestId,
  REQUEST_ID_HEADER,
  type RequestContext,
} from "../infrastructure/tracing.js";
import { SERVER } from "../shared/utils/constants.js";
import type { MCPRequest } from "../types/index.js";
import type { SSESessionRecord, WorkerEnv } from "./types.js";

const SSE_SESSION_TTL_SECONDS = 300;
const FALLBACK_SESSIONS = new Map<string, SSESessionRecord>();

export async function createSSESession(
  env: WorkerEnv,
  sessionId: string = generateRequestId()
): Promise<SSESessionRecord> {
  const now = Date.now();
  const record: SSESessionRecord = {
    sessionId,
    createdAt: now,
    lastActivityAt: now,
  };

  const kv = env.MCP_KV ?? env.MCP_CACHE;
  if (kv) {
    try {
      await kv.put(`sse:session:${sessionId}`, JSON.stringify(record), {
        expirationTtl: SSE_SESSION_TTL_SECONDS,
      });
      return record;
    } catch {
      // Fallback to in-memory map on KV failure
    }
  }

  FALLBACK_SESSIONS.set(sessionId, record);
  return record;
}

export async function getSSESession(
  sessionId: string,
  env: WorkerEnv
): Promise<SSESessionRecord | null> {
  const kv = env.MCP_KV ?? env.MCP_CACHE;
  if (kv) {
    try {
      const value = await kv.get(`sse:session:${sessionId}`, "json");
      if (value && typeof value === "object") {
        return value as SSESessionRecord;
      }
    } catch {
      // Fallback
    }
  }
  return FALLBACK_SESSIONS.get(sessionId) ?? null;
}

export function resetSSESessions(): void {
  FALLBACK_SESSIONS.clear();
}

export async function handleSSEEndpoint(
  request: Request,
  env: WorkerEnv,
  requestContext?: RequestContext
): Promise<Response> {
  const reqCtx =
    requestContext ?? createRequestContext({ headers: request.headers, transport: "worker-sse" });
  const corsHeaders = getCorsHeaders(request, env);
  const url = new URL(request.url);

  if (request.method === "GET") {
    const session = await createSSESession(env);
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const endpointEvent = `event: endpoint\ndata: /sse?sessionId=${session.sessionId}\n\n`;
        const connectedEvent = `event: connected\ndata: ${JSON.stringify({
          server: SERVER.NAME,
          version: SERVER.VERSION,
          sessionId: session.sessionId,
        })}\n\n`;

        controller.enqueue(encoder.encode(endpointEvent));
        controller.enqueue(encoder.encode(connectedEvent));
        controller.close();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        [REQUEST_ID_HEADER]: reqCtx.requestId,
        ...corsHeaders,
      },
    });
  }

  if (request.method === "POST") {
    const sessionId = url.searchParams.get("sessionId");
    if (sessionId) {
      const existing = await getSSESession(sessionId, env);
      if (existing) {
        existing.lastActivityAt = Date.now();
        const kv = env.MCP_KV ?? env.MCP_CACHE;
        if (kv) {
          try {
            await kv.put(`sse:session:${sessionId}`, JSON.stringify(existing), {
              expirationTtl: SSE_SESSION_TTL_SECONDS,
            });
          } catch {
            // Non-fatal
          }
        }
      }
    }

    const parsed = await readBoundedJsonBody(request);
    if (!parsed.ok) {
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: { code: parsed.code, message: parsed.error },
        }),
        {
          status: parsed.status,
          headers: {
            "Content-Type": "application/json",
            [REQUEST_ID_HEADER]: reqCtx.requestId,
            ...corsHeaders,
          },
        }
      );
    }

    const rpcResponse = await handleMCPRequest(parsed.body as MCPRequest, env, reqCtx);
    return new Response(JSON.stringify(rpcResponse), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        [REQUEST_ID_HEADER]: reqCtx.requestId,
        ...corsHeaders,
      },
    });
  }

  return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
    status: 405,
    headers: {
      "Content-Type": "application/json",
      [REQUEST_ID_HEADER]: reqCtx.requestId,
      ...corsHeaders,
    },
  });
}
