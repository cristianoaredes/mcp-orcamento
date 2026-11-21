/**
 * Worker authentication helpers using constant-time string comparison.
 * Zero `node:*` imports.
 */

import type { AuthResult, WorkerEnv } from "./types.js";

/**
 * Constant-time string comparison to avoid timing side-channels on API keys/secrets.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < maxLen; i++) {
    const codeA = i < a.length ? a.charCodeAt(i) : 0;
    const codeB = i < b.length ? b.charCodeAt(i) : 0;
    diff |= codeA ^ codeB;
  }
  return diff === 0;
}

export function extractAuthToken(request: Request): {
  token?: string;
  method?: "bearer" | "api-key";
} {
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
    if (match && match[1].trim().length > 0) {
      return { token: match[1].trim(), method: "bearer" };
    }
  }

  const apiKeyHeader = request.headers.get("x-api-key");
  if (apiKeyHeader && apiKeyHeader.trim().length > 0) {
    return { token: apiKeyHeader.trim(), method: "api-key" };
  }

  return {};
}

export function isAuthRequired(env: WorkerEnv): boolean {
  return Boolean(
    (typeof env.MCP_API_KEY === "string" && env.MCP_API_KEY.length > 0) ||
      (typeof env.API_KEY === "string" && env.API_KEY.length > 0) ||
      env.MCP_REQUIRE_AUTH === "true"
  );
}

export function authenticateWorkerRequest(request: Request, env: WorkerEnv): AuthResult {
  if (!isAuthRequired(env)) {
    return { authenticated: true, method: "none" };
  }

  const expectedKey = env.MCP_API_KEY || env.API_KEY;
  if (!expectedKey) {
    return {
      authenticated: false,
      statusCode: 401,
      error: "Authentication is required but no API key is configured",
    };
  }

  const extracted = extractAuthToken(request);
  if (!extracted.token) {
    return {
      authenticated: false,
      statusCode: 401,
      error: "Authentication required. Provide Authorization: Bearer <token> or X-API-Key header.",
    };
  }

  if (!constantTimeEqual(extracted.token, expectedKey)) {
    return {
      authenticated: false,
      statusCode: 403,
      error: "Invalid authentication credentials",
    };
  }

  return {
    authenticated: true,
    method: extracted.method,
    subject: "api-client",
  };
}

export function createUnauthorizedResponse(
  result: AuthResult,
  extraHeaders: Record<string, string> = {}
): Response {
  const status = result.statusCode ?? 401;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };

  if (status === 401) {
    headers["WWW-Authenticate"] = 'Bearer realm="mcp-orcamento"';
  }

  return new Response(
    JSON.stringify({
      error: status === 403 ? "Forbidden" : "Unauthorized",
      message: result.error ?? "Authentication failed",
    }),
    { status, headers }
  );
}
