/**
 * Cloudflare Worker environment and HTTP/SSE contract types.
 * Zero `node:*` imports.
 */

export interface MCPKVNamespace {
  get(key: string, type?: "text" | "json"): Promise<unknown>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number; metadata?: unknown }
  ): Promise<void>;
  delete?(key: string): Promise<void>;
}

export interface WorkerEnv {
  MCP_TRANSPORT?: string;
  MCP_HTTP_PORT?: string;
  MCP_CACHE_SIZE?: string;
  MCP_CACHE_TTL?: string;
  MCP_API_KEY?: string;
  API_KEY?: string;
  MCP_REQUIRE_AUTH?: string;
  MCP_RATE_LIMIT?: string;
  MCP_MAX_TOOL_OUTPUT_CHARS?: string;
  MCP_ALLOW_LOCALHOST_APIS?: string;
  TESOURO_ORDS_BASE_URL?: string;
  TRANSFEREGOV_BASE_URL?: string;
  TESOURO_CKAN_BASE_URL?: string;
  MCP_DPO_CONTACT?: string;
  CORS_ALLOWED_ORIGINS?: string;
  OAUTH_CLIENT_ID?: string;
  OAUTH_CLIENT_SECRET?: string;
  OAUTH_ISSUER?: string;
  OAUTH_REDIRECT_URIS?: string;
  MCP_CACHE?: MCPKVNamespace;
  MCP_KV?: MCPKVNamespace;
}

export interface AuthResult {
  authenticated: boolean;
  method?: "bearer" | "api-key" | "oauth" | "none";
  subject?: string;
  error?: string;
  statusCode?: number;
}

export interface WorkerRateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
  backend: "kv" | "memory";
}

export interface SSESessionRecord {
  sessionId: string;
  createdAt: number;
  lastActivityAt: number;
}
