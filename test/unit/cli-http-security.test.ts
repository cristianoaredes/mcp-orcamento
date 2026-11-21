import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { parseCliArgs } from "../../lib/adapters/cli.js";
import { createHttpApp, startHttpServer, type RunningHttpServer } from "../../lib/adapters/cli-http.js";
import { MemoryCache } from "../../lib/core/cache.js";
import type { ApiConfig, ServerConfig } from "../../lib/types/index.js";

const API_CONFIG: ApiConfig = {
  tesouroOrdsBaseUrl: "https://apidatalake.tesouro.gov.br/ords/",
  transferegovBaseUrl: "https://api.transferegov.gestao.gov.br/",
  tesouroCkanBaseUrl: "https://www.tesourotransparente.gov.br/ckan/api/3/action/",
};

const BASE_SERVER_CONFIG: ServerConfig = {
  transport: "http",
  httpPort: 0,
  httpHost: "127.0.0.1",
  cacheSize: 32,
  cacheTTL: 60_000,
  apiTimeout: 5_000,
};

function rawHttpRequest(options: {
  port: number;
  path: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: options.port,
        path: options.path,
        method: options.method ?? "GET",
        headers: options.headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.from(c)));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );
    req.on("error", reject);
    if (options.body !== undefined) {
      req.write(options.body);
    }
    req.end();
  });
}

describe("CLI HTTP Server Security & Transports", () => {
  const servers: RunningHttpServer[] = [];
  const caches: MemoryCache[] = [];

  afterEach(async () => {
    while (servers.length > 0) {
      await servers.pop()!.close();
    }
    while (caches.length > 0) {
      caches.pop()!.destroy();
    }
  });

  it("parses CLI flags safely", () => {
    expect(parseCliArgs(["--http", "--port", "4000", "--host=127.0.0.1"])).toEqual({
      help: false,
      version: false,
      transport: "http",
      port: 4000,
      host: "127.0.0.1",
    });
    expect(parseCliArgs(["--help", "--version", "--port=8080", "--host", "::1"])).toEqual({
      help: true,
      version: true,
      port: 8080,
      host: "::1",
    });
  });

  it("enforces Host DNS rebinding protection, CORS allowlist, Auth, security headers, and rate limits", async () => {
    const cache = new MemoryCache(32, 60_000, 0);
    caches.push(cache);

    const running = await startHttpServer({
      apiConfig: API_CONFIG,
      serverConfig: BASE_SERVER_CONFIG,
      cache,
      apiKey: "cli-sec-key",
      rateLimitMax: 4,
    });
    servers.push(running);

    // Public /health with security headers
    const health = await rawHttpRequest({ port: running.port, path: "/health" });
    expect(health.status).toBe(200);
    expect(health.headers["x-content-type-options"]).toBe("nosniff");
    expect(health.headers["x-frame-options"]).toBe("DENY");
    expect(health.headers["content-security-policy"]).toBe("default-src 'none'");
    expect(JSON.parse(health.body).service).toBe("mcp-orcamento");

    // DNS rebinding Host rejection -> 403
    const rebind = await rawHttpRequest({
      port: running.port,
      path: "/health",
      headers: { Host: "evil.attacker.com:3000" },
    });
    expect(rebind.status).toBe(403);

    // Disallowed CORS origin -> 403
    const badCors = await rawHttpRequest({
      port: running.port,
      path: "/health",
      headers: { Origin: "https://evil.example.net" },
    });
    expect(badCors.status).toBe(403);

    // Allowed localhost CORS preflight -> 204
    const okPreflight = await rawHttpRequest({
      port: running.port,
      path: "/mcp",
      method: "OPTIONS",
      headers: { Origin: "http://localhost:5173" },
    });
    expect(okPreflight.status).toBe(204);
    expect(okPreflight.headers["access-control-allow-origin"]).toBe("http://localhost:5173");

    // Auth enforcement on /mcp: 401 missing, 403 wrong, 200 valid
    const unauth = await rawHttpRequest({
      port: running.port,
      path: "/mcp",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(unauth.status).toBe(401);

    const wrongAuth = await rawHttpRequest({
      port: running.port,
      path: "/mcp",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer wrong",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(wrongAuth.status).toBe(403);

    const validMcp = await rawHttpRequest({
      port: running.port,
      path: "/mcp",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "cli-sec-key",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(validMcp.status).toBe(200);
    expect(JSON.parse(validMcp.body).result.tools).toHaveLength(8);

    // Malformed JSON -> 400
    const badJson = await rawHttpRequest({
      port: running.port,
      path: "/mcp",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer cli-sec-key",
      },
      body: "{bad-json",
    });
    expect(badJson.status).toBe(400);

    // Oversized body (> 100kb) -> 413
    const hugeBody = await rawHttpRequest({
      port: running.port,
      path: "/mcp",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer cli-sec-key",
      },
      body: JSON.stringify({ data: "x".repeat(110_000) }),
    });
    expect(hugeBody.status).toBe(413);

    // Rate limit exhaustion (4 max requests -> 5th returns 429)
    for (let i = 0; i < 4; i++) {
      await rawHttpRequest({
        port: running.port,
        path: "/mcp",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer cli-sec-key",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: i + 10, method: "ping" }),
      });
    }
    const limited = await rawHttpRequest({
      port: running.port,
      path: "/mcp",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer cli-sec-key",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 99, method: "ping" }),
    });
    expect(limited.status).toBe(429);
  });

  it("handles Streamable HTTP initialization, SSE /messages validation, and explicit Host/Origin rules", async () => {
    const cache = new MemoryCache(16, 60_000, 0);
    caches.push(cache);

    const running = await startHttpServer({
      apiConfig: API_CONFIG,
      serverConfig: BASE_SERVER_CONFIG,
      cache,
      allowedHosts: ["127.0.0.1"],
      allowedOrigins: ["http://127.0.0.1:5173"],
      rateLimitMax: 20,
    });
    servers.push(running);

    // Streamable HTTP initialize session -> returns Mcp-Session-Id
    const initResp = await rawHttpRequest({
      port: running.port,
      path: "/mcp",
      method: "POST",
      headers: {
        Host: `127.0.0.1:${running.port}`,
        Origin: "http://127.0.0.1:5173",
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "test", version: "1.0" },
        },
      }),
    });
    expect(initResp.status).toBe(200);
    const sid = String(initResp.headers["mcp-session-id"] ?? "");
    expect(sid.length).toBeGreaterThan(5);

    // Follow-up on active session + unknown session 404 + GET /mcp without session 400
    const sessionCall = await rawHttpRequest({
      port: running.port,
      path: "/mcp",
      method: "POST",
      headers: {
        Host: `127.0.0.1:${running.port}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "Mcp-Session-Id": sid,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
    });
    expect(sessionCall.status).toBe(200);

    const missingSession = await rawHttpRequest({
      port: running.port,
      path: "/mcp",
      method: "POST",
      headers: {
        Host: `127.0.0.1:${running.port}`,
        "Content-Type": "application/json",
        "Mcp-Session-Id": "nonexistent-session",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "ping" }),
    });
    expect(missingSession.status).toBe(404);

    const getNoSession = await rawHttpRequest({
      port: running.port,
      path: "/mcp",
      method: "GET",
      headers: { Host: `127.0.0.1:${running.port}` },
    });
    expect(getNoSession.status).toBe(400);

    const badHost = await rawHttpRequest({
      port: running.port,
      path: "/health",
      headers: { Host: "localhost:3000" },
    });
    expect(badHost.status).toBe(403);

    const missingSid = await rawHttpRequest({
      port: running.port,
      path: "/messages",
      method: "POST",
      headers: { Host: `127.0.0.1:${running.port}`, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(missingSid.status).toBe(400);

    const unknownSid = await rawHttpRequest({
      port: running.port,
      path: "/messages?sessionId=unknown",
      method: "POST",
      headers: { Host: `127.0.0.1:${running.port}`, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(unknownSid.status).toBe(404);

    // Connect over SSE endpoint and verify session endpoint event is received
    const sseEndpoint = await new Promise<string>((resolve, reject) => {
      const req = http.get(
        {
          host: "127.0.0.1",
          port: running.port,
          path: "/sse",
          headers: { Host: `127.0.0.1:${running.port}` },
        },
        (res) => {
          let buf = "";
          res.on("data", (chunk) => {
            buf += Buffer.from(chunk).toString("utf8");
            const match = /data:\s*(\/messages\?sessionId=[^\r\n]+)/.exec(buf);
            if (match) {
              req.destroy();
              resolve(match[1].trim());
            }
          });
        }
      );
      req.on("error", reject);
    });
    expect(sseEndpoint).toContain("/messages?sessionId=");
  });

  it("enforces fail-closed MCP_API_KEY outside loopback and strict Host/Origin syntax", async () => {
    const cache = new MemoryCache(16, 60_000, 0);
    caches.push(cache);

    expect(() =>
      createHttpApp({
        apiConfig: API_CONFIG,
        serverConfig: { ...BASE_SERVER_CONFIG, httpHost: "0.0.0.0" },
        cache,
      })
    ).toThrow(/non-loopback host/);

    const created = createHttpApp({
      apiConfig: API_CONFIG,
      serverConfig: { ...BASE_SERVER_CONFIG, httpHost: "0.0.0.0" },
      cache,
      apiKey: "non-loopback-secret",
    });
    await created.cleanup();

    const running = await startHttpServer({
      apiConfig: API_CONFIG,
      serverConfig: BASE_SERVER_CONFIG,
      cache,
      apiKey: "sec-key-2",
    });
    servers.push(running);

    const badHostSyntax = await rawHttpRequest({
      port: running.port,
      path: "/health",
      headers: { Host: "localhost:notaport" },
    });
    expect(badHostSyntax.status).toBe(400);

    const credOrigin = `${"http://"}demo-user${":"}demo-token@localhost:5173`;
    const badCredOrigin = await rawHttpRequest({
      port: running.port,
      path: "/health",
      headers: {
        Host: `127.0.0.1:${running.port}`,
        Origin: credOrigin,
      },
    });
    expect(badCredOrigin.status).toBe(403);

    const badPathOrigin = await rawHttpRequest({
      port: running.port,
      path: "/health",
      headers: {
        Host: `127.0.0.1:${running.port}`,
        Origin: "http://localhost:5173/evil",
      },
    });
    expect(badPathOrigin.status).toBe(403);
  });
});
