/**
 * Cloudflare Worker HTTP fetch entrypoint routing /, /health, /mcp, /sse, /openapi.json,
 * OAuth metadata/endpoints, and /tools/{toolName}.
 * Zero `node:*` imports.
 */

import {
  getCorsHeaders,
  handleHealthCheck,
  handleMCPEndpoint,
  handleOptions,
} from "../adapters/cloudflare.js";
import { TOOL_DEFINITIONS } from "../core/tools.js";
import { logger } from "../infrastructure/logger.js";
import {
  createRequestContext,
  REQUEST_ID_HEADER,
} from "../infrastructure/tracing.js";
import { SERVER } from "../shared/utils/constants.js";
import {
  authenticateWorkerRequest,
  createUnauthorizedResponse,
} from "./auth.js";
import { handleOpenApiEndpoint } from "./openapi.js";
import {
  handleOAuthAuthorize,
  handleOAuthMetadata,
  handleOAuthToken,
} from "./oauth.js";
import {
  checkWorkerRateLimit,
  rateLimitHeaders,
} from "./rate-limit.js";
import { handleToolRestEndpoint } from "./rest.js";
import { handleSSEEndpoint } from "./sse.js";
import type { WorkerEnv } from "./types.js";

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "no-store",
};

function attachResponseHeaders(
  response: Response,
  headersToAdd: Record<string, string>
): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(headersToAdd)) {
    if (!headers.has(k)) {
      headers.set(k, v);
    }
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function handleWorkerFetch(
  request: Request,
  env: WorkerEnv
): Promise<Response> {
  const reqCtx = createRequestContext({
    headers: request.headers,
    transport: "cloudflare-worker",
  });
  const corsHeaders = getCorsHeaders(request, env);
  const commonHeaders: Record<string, string> = {
    [REQUEST_ID_HEADER]: reqCtx.requestId,
    ...SECURITY_HEADERS,
    ...corsHeaders,
  };

  try {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (request.method === "OPTIONS") {
      return attachResponseHeaders(handleOptions(request, env), {
        [REQUEST_ID_HEADER]: reqCtx.requestId,
        ...SECURITY_HEADERS,
      });
    }

    if (pathname === "/" && request.method === "GET") {
      return new Response(
        JSON.stringify({
          service: SERVER.NAME,
          version: SERVER.VERSION,
          status: "ok",
          runtime: "cloudflare-workers",
          tool_count: TOOL_DEFINITIONS.length,
          tools: TOOL_DEFINITIONS.map((t) => t.name),
          endpoints: {
            health: "/health",
            mcp: "/mcp",
            sse: "/sse",
            openapi: "/openapi.json",
            rest_tools: "/tools/{toolName}",
          },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...commonHeaders },
        }
      );
    }

    if (pathname === "/health" && request.method === "GET") {
      const resp = await handleHealthCheck(env, request, reqCtx);
      return attachResponseHeaders(resp, SECURITY_HEADERS);
    }

    if (pathname === "/openapi.json" && request.method === "GET") {
      return handleOpenApiEndpoint(request, commonHeaders);
    }

    if (
      (pathname === "/.well-known/oauth-authorization-server" ||
        pathname === "/.well-known/oauth-protected-resource") &&
      request.method === "GET"
    ) {
      return handleOAuthMetadata(request, env, commonHeaders);
    }

    if (pathname === "/oauth/authorize" && request.method === "GET") {
      return handleOAuthAuthorize(request, env, commonHeaders);
    }

    if (pathname === "/oauth/token") {
      return await handleOAuthToken(request, env, commonHeaders);
    }

    // Protected API endpoints: /mcp, /sse, /tools/:toolName
    const authResult = authenticateWorkerRequest(request, env);
    if (!authResult.authenticated) {
      return createUnauthorizedResponse(authResult, commonHeaders);
    }

    const rateDecision = await checkWorkerRateLimit(request, env);
    const rlHeaders = rateLimitHeaders(rateDecision);
    if (!rateDecision.allowed) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Rate limit exceeded",
          retryAfterSeconds: rateDecision.retryAfterSeconds,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            ...commonHeaders,
            ...rlHeaders,
          },
        }
      );
    }

    const protectedHeaders = {
      ...SECURITY_HEADERS,
      ...rlHeaders,
      [REQUEST_ID_HEADER]: reqCtx.requestId,
    };

    if (pathname === "/mcp") {
      const resp = await handleMCPEndpoint(request, env, reqCtx);
      return attachResponseHeaders(resp, protectedHeaders);
    }

    if (pathname === "/sse") {
      const resp = await handleSSEEndpoint(request, env, reqCtx);
      return attachResponseHeaders(resp, protectedHeaders);
    }

    if (pathname.startsWith("/tools/")) {
      const toolName = decodeURIComponent(pathname.slice("/tools/".length));
      if (!toolName || toolName.includes("/")) {
        return new Response(JSON.stringify({ ok: false, error: "Invalid tool route" }), {
          status: 404,
          headers: { "Content-Type": "application/json", ...commonHeaders, ...rlHeaders },
        });
      }
      const resp = await handleToolRestEndpoint(toolName, request, env, reqCtx);
      return attachResponseHeaders(resp, protectedHeaders);
    }

    return new Response(
      JSON.stringify({ error: "Not Found", path: pathname }),
      {
        status: 404,
        headers: { "Content-Type": "application/json", ...commonHeaders },
      }
    );
  } catch (error) {
    logger.error("Unhandled Worker fetch error", {
      requestId: reqCtx.requestId,
      error: error instanceof Error ? error.message : String(error),
    });
    return new Response(
      JSON.stringify({ error: "Internal Server Error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...commonHeaders },
      }
    );
  }
}

export default {
  fetch: handleWorkerFetch,
};
