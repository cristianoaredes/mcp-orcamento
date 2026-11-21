import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCorsHeaders } from "../../lib/adapters/cloudflare.js";
import { authenticateWorkerRequest, constantTimeEqual } from "../../lib/workers/auth.js";
import { checkWorkerRateLimit, resetWorkerMemoryRateLimiter } from "../../lib/workers/rate-limit.js";
import { handleWorkerFetch } from "../../lib/workers/worker.js";
import type { WorkerEnv } from "../../lib/workers/types.js";

describe("Worker Auth, OAuth, CORS & Rate Limiting", () => {
  beforeEach(() => {
    resetWorkerMemoryRateLimiter();
  });

  afterEach(() => {
    resetWorkerMemoryRateLimiter();
  });

  it("verifies constantTimeEqual and Worker Bearer / X-API-Key authentication", async () => {
    expect(constantTimeEqual("abc-123", "abc-123")).toBe(true);
    expect(constantTimeEqual("abc-123", "abc-124")).toBe(false);
    expect(constantTimeEqual("short", "longer-token")).toBe(false);

    const env: WorkerEnv = { MCP_API_KEY: "test-worker-key" };

    // Missing auth -> 401 with WWW-Authenticate
    const unauth = await handleWorkerFetch(
      new Request("https://worker.test/mcp", {
        method: "POST",
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
      }),
      env
    );
    expect(unauth.status).toBe(401);
    expect(unauth.headers.get("WWW-Authenticate")).toContain("Bearer");

    // Wrong key -> 403
    const forbidden = await handleWorkerFetch(
      new Request("https://worker.test/mcp", {
        method: "POST",
        headers: { Authorization: "Bearer wrong-key" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
      }),
      env
    );
    expect(forbidden.status).toBe(403);

    // Valid Bearer -> 200
    const bearerOk = await handleWorkerFetch(
      new Request("https://worker.test/mcp", {
        method: "POST",
        headers: { Authorization: "Bearer test-worker-key" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
      }),
      env
    );
    expect(bearerOk.status).toBe(200);

    // Valid X-API-Key -> 200
    const headerOk = authenticateWorkerRequest(
      new Request("https://worker.test/mcp", {
        headers: { "X-API-Key": "test-worker-key" },
      }),
      env
    );
    expect(headerOk.authenticated).toBe(true);
    expect(headerOk.method).toBe("api-key");

    // Fail closed when MCP_REQUIRE_AUTH=true and no key provisioned
    const failClosed = authenticateWorkerRequest(
      new Request("https://worker.test/mcp"),
      { MCP_REQUIRE_AUTH: "true" }
    );
    expect(failClosed.authenticated).toBe(false);
    expect(failClosed.statusCode).toBe(401);
  });

  it("enforces strict CORS_ALLOWED_ORIGINS without wildcard fallback", async () => {
    const env: WorkerEnv = {
      CORS_ALLOWED_ORIGINS: "https://app.example.com,https://admin.example.com",
    };

    const allowedHeaders = getCorsHeaders(
      new Request("https://worker.test/health", {
        headers: { Origin: "https://app.example.com" },
      }),
      env
    );
    expect(allowedHeaders["Access-Control-Allow-Origin"]).toBe("https://app.example.com");

    const disallowedHeaders = getCorsHeaders(
      new Request("https://worker.test/health", {
        headers: { Origin: "https://evil.example.net" },
      }),
      env
    );
    expect(disallowedHeaders["Access-Control-Allow-Origin"]).toBeUndefined();

    const preflight = await handleWorkerFetch(
      new Request("https://worker.test/mcp", {
        method: "OPTIONS",
        headers: { Origin: "https://admin.example.com" },
      }),
      env
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe("https://admin.example.com");
  });

  it("serves OAuth discovery metadata and validates OAuth authorize/token endpoints", async () => {
    const authServer = await handleWorkerFetch(
      new Request("https://worker.test/.well-known/oauth-authorization-server"),
      {}
    );
    expect(authServer.status).toBe(200);
    const meta = (await authServer.json()) as {
      issuer: string;
      code_challenge_methods_supported: string[];
    };
    expect(meta.issuer).toBe("https://worker.test");
    expect(meta.code_challenge_methods_supported).toEqual(["S256"]);

    const protectedRes = await handleWorkerFetch(
      new Request("https://worker.test/.well-known/oauth-protected-resource"),
      { OAUTH_ISSUER: "https://auth.aredes.me/" }
    );
    expect(protectedRes.status).toBe(200);
    expect(((await protectedRes.json()) as { resource: string }).resource).toBe(
      "https://auth.aredes.me/mcp"
    );

    // Unconfigured OAuth -> 501
    const unconfAuth = await handleWorkerFetch(
      new Request("https://worker.test/oauth/authorize"),
      {}
    );
    expect(unconfAuth.status).toBe(501);

    const oauthEnv: WorkerEnv = {
      OAUTH_CLIENT_ID: "cli-id",
      OAUTH_CLIENT_SECRET: "cli-secret",
      OAUTH_REDIRECT_URIS: "https://client.test/cb",
    };

    const badRedirect = await handleWorkerFetch(
      new Request(
        "https://worker.test/oauth/authorize?client_id=cli-id&redirect_uri=https://evil.test/cb&response_type=code&code_challenge=abc&code_challenge_method=S256"
      ),
      oauthEnv
    );
    expect(badRedirect.status).toBe(400);

    const badSecret = await handleWorkerFetch(
      new Request("https://worker.test/oauth/token", {
        method: "POST",
        body: "grant_type=client_credentials&client_id=cli-id&client_secret=wrong",
      }),
      oauthEnv
    );
    expect(badSecret.status).toBe(401);

    const unsupportedGrant = await handleWorkerFetch(
      new Request("https://worker.test/oauth/token", {
        method: "POST",
        body: "grant_type=password&client_id=cli-id&client_secret=cli-secret",
      }),
      oauthEnv
    );
    expect(unsupportedGrant.status).toBe(400);

    const validAuthorize = await handleWorkerFetch(
      new Request(
        "https://worker.test/oauth/authorize?client_id=cli-id&redirect_uri=https://client.test/cb&response_type=code&code_challenge=xyz&code_challenge_method=S256"
      ),
      oauthEnv
    );
    expect(validAuthorize.status).toBe(501);

    const validToken = await handleWorkerFetch(
      new Request("https://worker.test/oauth/token", {
        method: "POST",
        body: "grant_type=client_credentials&client_id=cli-id&client_secret=cli-secret",
      }),
      oauthEnv
    );
    expect(validToken.status).toBe(501);

    const getToken = await handleWorkerFetch(
      new Request("https://worker.test/oauth/token", { method: "GET" }),
      oauthEnv
    );
    expect(getToken.status).toBe(405);
  });

  it("rate limits per client via KV and memory fallback", async () => {
    const store = new Map<string, string>();
    const kvEnv: WorkerEnv = {
      MCP_RATE_LIMIT: "2",
      MCP_KV: {
        get: vi.fn(async (k: string) => {
          const raw = store.get(k);
          return raw ? JSON.parse(raw) : null;
        }),
        put: vi.fn(async (k: string, v: string) => {
          store.set(k, v);
        }),
      },
    };

    const req = () =>
      new Request("https://worker.test/mcp", {
        method: "POST",
        headers: { "cf-connecting-ip": "198.51.100.42" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
      });

    expect((await checkWorkerRateLimit(req(), kvEnv)).allowed).toBe(true);
    expect((await checkWorkerRateLimit(req(), kvEnv)).allowed).toBe(true);
    const blocked = await handleWorkerFetch(req(), kvEnv);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBeTruthy();

    // Memory fallback when no KV bound
    const memEnv: WorkerEnv = { MCP_RATE_LIMIT: "1" };
    const m1 = await checkWorkerRateLimit(req(), memEnv);
    const m2 = await checkWorkerRateLimit(req(), memEnv);
    expect(m1.backend).toBe("memory");
    expect(m1.allowed).toBe(true);
    expect(m2.allowed).toBe(false);
  });
});
