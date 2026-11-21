/**
 * Hardened Node Express 5 HTTP/SSE & Streamable HTTP MCP transport adapter.
 * Features loopback default binding, DNS rebinding Host validation, strict CORS,
 * timing-safe API key auth, security headers, 100KB body limit, and sliding-window rate limiting.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { handleMCPRequest } from "./cloudflare.js";
import { MemoryCache } from "../core/cache.js";
import { createMCPServer } from "../core/mcp-server.js";
import { getMetrics, TOOL_DEFINITIONS } from "../core/tools.js";
import { logger } from "../infrastructure/logger.js";
import { RateLimiter } from "../infrastructure/rate-limiter.js";
import {
  createRequestContext,
  generateRequestId,
  REQUEST_ID_HEADER,
} from "../infrastructure/tracing.js";
import { SERVER } from "../shared/utils/constants.js";
import type { ApiConfig, Cache, MCPRequest, ServerConfig } from "../types/index.js";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function isLoopbackHost(host: string): boolean {
  if (typeof host !== "string") return false;
  return LOOPBACK_HOSTS.has(host.trim().toLowerCase());
}

export function isValidApiKey(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const providedDigest = createHash("sha256").update(provided, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

export interface HttpServerOptions {
  apiConfig: ApiConfig;
  serverConfig: ServerConfig;
  cache?: Cache;
  apiKey?: string;
  allowedOrigins?: string[];
  allowedHosts?: string[];
  rateLimitMax?: number;
}

export interface RunningHttpServer {
  app: Express;
  server: http.Server;
  port: number;
  host: string;
  close: () => Promise<void>;
}

function normalizeHostHeader(rawHost: string): string | null {
  const trimmed = rawHost.trim().toLowerCase();
  if (!trimmed || /[\s/@\\?#]/.test(trimmed)) {
    return null;
  }
  if (trimmed.startsWith("[")) {
    const match = /^\[([a-f0-9:.]+)\](?::(\d{1,5}))?$/.exec(trimmed);
    if (!match) return null;
    if (match[2] !== undefined) {
      const port = Number(match[2]);
      if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
    }
    return `[${match[1]}]`;
  }
  const firstColon = trimmed.indexOf(":");
  if (firstColon === -1) return trimmed;
  if (firstColon !== trimmed.lastIndexOf(":")) return null;
  const hostname = trimmed.slice(0, firstColon);
  const portStr = trimmed.slice(firstColon + 1);
  if (!hostname || !/^\d{1,5}$/.test(portStr)) return null;
  const port = Number(portStr);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return hostname;
}

function isOriginAllowed(origin: string, explicitAllowlist?: string[]): boolean {
  if (explicitAllowlist && explicitAllowlist.length > 0) {
    return explicitAllowlist.includes(origin);
  }
  try {
    const parsed = new URL(origin);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search !== "" ||
      parsed.hash !== "" ||
      origin.endsWith("/")
    ) {
      return false;
    }
    return LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function parseListEnv(key: string): string[] | undefined {
  const raw = process.env[key];
  if (!raw || raw.trim().length === 0) return undefined;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function extractBearerOrApiKey(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string") {
    const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
    if (match && match[1].trim().length > 0) {
      return match[1].trim();
    }
  }
  const apiKey = req.headers["x-api-key"];
  if (typeof apiKey === "string" && apiKey.trim().length > 0) {
    return apiKey.trim();
  }
  return undefined;
}

export function createHttpApp(options: HttpServerOptions): {
  app: Express;
  cleanup: () => Promise<void>;
} {
  const app = express();
  app.disable("x-powered-by");

  const cache =
    options.cache ??
    new MemoryCache(options.serverConfig.cacheSize, options.serverConfig.cacheTTL);
  const ownsCache = !options.cache;

  const rateLimiter = new RateLimiter({
    maxRequests:
      options.rateLimitMax ??
      (process.env.MCP_RATE_LIMIT ? Number(process.env.MCP_RATE_LIMIT) || 100 : 100),
    windowMs: 60_000,
    cleanupIntervalMs: 60_000,
  });

  const configuredApiKey =
    options.apiKey ?? process.env.MCP_API_KEY ?? process.env.API_KEY;
  const bindHost = (options.serverConfig.httpHost || "127.0.0.1").trim();
  if (!isLoopbackHost(bindHost) && (!configuredApiKey || configuredApiKey.trim().length === 0)) {
    throw new Error(
      `Refusing to bind HTTP MCP server to non-loopback host "${bindHost}" without MCP_API_KEY`
    );
  }
  const explicitAllowedHosts = options.allowedHosts ?? parseListEnv("MCP_ALLOWED_HOSTS");
  const explicitAllowedOrigins =
    options.allowedOrigins ??
    parseListEnv("MCP_CORS_ALLOWED_ORIGINS") ??
    parseListEnv("CORS_ALLOWED_ORIGINS");

  const sseTransports = new Map<
    string,
    { transport: SSEServerTransport; server: ReturnType<typeof createMCPServer> }
  >();
  const streamableTransports = new Map<
    string,
    { transport: StreamableHTTPServerTransport; server: ReturnType<typeof createMCPServer> }
  >();

  // Request tracing & baseline security headers
  app.use((req: Request, res: Response, next: NextFunction) => {
    const reqCtx = createRequestContext({
      headers: req.headers as Record<string, string | string[] | undefined>,
      transport: "node-http",
      clientIp: req.ip,
    });
    res.locals.requestContext = reqCtx;
    res.setHeader(REQUEST_ID_HEADER, reqCtx.requestId);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Content-Security-Policy", "default-src 'none'");
    next();
  });

  // DNS rebinding Host validation
  app.use((req: Request, res: Response, next: NextFunction) => {
    const rawHost = req.headers.host;
    if (typeof rawHost !== "string" || rawHost.trim().length === 0) {
      res.status(400).json({ error: "Missing Host header" });
      return;
    }

    const hostname = normalizeHostHeader(rawHost);
    if (!hostname) {
      res.status(400).json({ error: "Invalid Host header" });
      return;
    }
    if (explicitAllowedHosts && explicitAllowedHosts.length > 0) {
      const allowedNormalized = explicitAllowedHosts
        .map((h) => normalizeHostHeader(h))
        .filter((h): h is string => h !== null);
      if (!allowedNormalized.includes(hostname)) {
        res.status(403).json({ error: "Forbidden Host header" });
        return;
      }
      next();
      return;
    }

    if (LOOPBACK_HOSTS.has(bindHost.toLowerCase()) && !LOOPBACK_HOSTS.has(hostname)) {
      res.status(403).json({ error: "Forbidden Host header (DNS rebinding protection)" });
      return;
    }

    next();
  });

  // Strict CORS validation
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (typeof origin === "string" && origin.trim().length > 0) {
      if (!isOriginAllowed(origin.trim(), explicitAllowedOrigins)) {
        res.status(403).json({ error: "CORS origin not allowed" });
        return;
      }
      res.setHeader("Access-Control-Allow-Origin", origin.trim());
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-API-Key, X-Request-Id, Mcp-Session-Id"
      );
      res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id, X-Request-Id");
    }

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
  });

  app.use(express.json({ limit: "100kb" }));

  // Malformed JSON / oversized payload error handler
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const typedErr = err as { type?: string; status?: number };
    if (typedErr?.type === "entity.too.large" || typedErr?.status === 413) {
      res.status(413).json({ error: "Request body too large (max 100KB)" });
      return;
    }
    if (typedErr?.type === "entity.parse.failed" || typedErr instanceof SyntaxError) {
      res.status(400).json({ error: "Malformed JSON request body" });
      return;
    }
    next(err);
  });

  // Public health endpoint
  app.get("/health", (_req: Request, res: Response) => {
    const metrics = getMetrics();
    res.json({
      status: "healthy",
      service: SERVER.NAME,
      version: SERVER.VERSION,
      transport: "http",
      tools: TOOL_DEFINITIONS.length,
      timestamp: new Date().toISOString(),
      metrics: {
        requests: metrics.requests,
        cacheHits: metrics.cacheHits,
        errors: metrics.errors,
        uptimeMs: metrics.uptimeMs,
      },
    });
  });

  // Optional API Key auth middleware for MCP/SSE endpoints
  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    if (!configuredApiKey) {
      next();
      return;
    }
    const token = extractBearerOrApiKey(req);
    if (!token) {
      res.setHeader("WWW-Authenticate", 'Bearer realm="mcp-orcamento"');
      res.status(401).json({ error: "Unauthorized: missing API key" });
      return;
    }
    if (!configuredApiKey || !isValidApiKey(token, configuredApiKey)) {
      res.status(403).json({ error: "Forbidden: invalid API key" });
      return;
    }
    next();
  };

  // Per-IP sliding-window rate limiter
  const enforceRateLimit = (req: Request, res: Response, next: NextFunction) => {
    const clientKey = req.ip || req.socket.remoteAddress || "local";
    const decision = rateLimiter.check(clientKey);
    res.setHeader("X-RateLimit-Limit", String(decision.limit));
    res.setHeader("X-RateLimit-Remaining", String(decision.remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(decision.resetAt / 1000)));

    if (!decision.allowed) {
      res.setHeader("Retry-After", String(decision.retryAfterSeconds));
      res.status(429).json({
        error: "Too Many Requests",
        retryAfterSeconds: decision.retryAfterSeconds,
      });
      return;
    }
    next();
  };

  // Streamable HTTP + stateless JSON-RPC fallback on /mcp
  app.all("/mcp", requireAuth, enforceRateLimit, async (req: Request, res: Response) => {
    try {
      const sessionHeader = req.headers["mcp-session-id"];
      const sessionId = typeof sessionHeader === "string" ? sessionHeader : undefined;

      if (sessionId) {
        const entry = streamableTransports.get(sessionId);
        if (!entry) {
          res.status(404).json({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32001, message: "Unknown or expired MCP session" },
          });
          return;
        }
        await entry.transport.handleRequest(req, res, req.body);
        return;
      }

      const accept = String(req.headers.accept ?? "").toLowerCase();
      const bodyObj =
        typeof req.body === "object" && req.body !== null
          ? (req.body as { method?: unknown })
          : undefined;
      const isInitialize = bodyObj?.method === "initialize";

      if (req.method === "POST" && (accept.includes("text/event-stream") || isInitialize)) {
        const mcpServer = createMCPServer({
          apiConfig: options.apiConfig,
          cache,
          rateLimiter,
          rateLimitKey: req.ip || "http-session",
          transportName: "http-streamable",
        });

        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => generateRequestId(),
          enableJsonResponse: true,
          onsessioninitialized: (sid) => {
            streamableTransports.set(sid, { transport, server: mcpServer });
          },
          onsessionclosed: async (sid) => {
            streamableTransports.delete(sid);
            await mcpServer.close().catch(() => {});
          },
        });

        transport.onclose = () => {
          if (transport.sessionId) {
            streamableTransports.delete(transport.sessionId);
          }
        };

        await mcpServer.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      }

      // Stateless JSON-RPC fallback for lightweight HTTP POST /mcp clients
      if (req.method === "POST") {
        const reqCtx = res.locals.requestContext;
        const rpcResp = await handleMCPRequest(
          req.body as MCPRequest,
          {
            TESOURO_ORDS_BASE_URL: options.apiConfig.tesouroOrdsBaseUrl,
            TRANSFEREGOV_BASE_URL: options.apiConfig.transferegovBaseUrl,
            TESOURO_CKAN_BASE_URL: options.apiConfig.tesouroCkanBaseUrl,
            MCP_ALLOW_LOCALHOST_APIS: "true",
          },
          reqCtx
        );
        res.status(200).json(rpcResp);
        return;
      }

      res.status(400).json({ error: "Mcp-Session-Id header is required for GET/DELETE /mcp" });
    } catch (error) {
      logger.error("Error handling /mcp request", {
        error: error instanceof Error ? error.message : String(error),
      });
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  });

  // Legacy HTTP+SSE transport (/sse + /messages)
  app.get("/sse", requireAuth, enforceRateLimit, async (req: Request, res: Response) => {
    const mcpServer = createMCPServer({
      apiConfig: options.apiConfig,
      cache,
      rateLimiter,
      rateLimitKey: req.ip || "sse-session",
      transportName: "http-sse",
    });

    const transport = new SSEServerTransport("/messages", res);
    sseTransports.set(transport.sessionId, { transport, server: mcpServer });

    req.on("close", () => {
      sseTransports.delete(transport.sessionId);
      mcpServer.close().catch(() => {});
    });

    await mcpServer.connect(transport);
  });

  app.post("/messages", requireAuth, enforceRateLimit, async (req: Request, res: Response) => {
    const sessionId =
      typeof req.query.sessionId === "string" ? req.query.sessionId : undefined;
    if (!sessionId) {
      res.status(400).json({ error: "Missing sessionId query parameter" });
      return;
    }

    const entry = sseTransports.get(sessionId);
    if (!entry) {
      res.status(404).json({ error: "Unknown SSE sessionId" });
      return;
    }

    await entry.transport.handlePostMessage(req, res, req.body);
  });

  const cleanup = async () => {
    for (const { transport, server } of sseTransports.values()) {
      await transport.close().catch(() => {});
      await server.close().catch(() => {});
    }
    sseTransports.clear();

    for (const { transport, server } of streamableTransports.values()) {
      await transport.close().catch(() => {});
      await server.close().catch(() => {});
    }
    streamableTransports.clear();

    rateLimiter.destroy();
    if (ownsCache && cache instanceof MemoryCache) {
      cache.destroy();
    }
  };

  return { app, cleanup };
}

export async function startHttpServer(
  options: HttpServerOptions
): Promise<RunningHttpServer> {
  const { app, cleanup } = createHttpApp(options);
  const host = (options.serverConfig.httpHost || "127.0.0.1").trim();
  const port = options.serverConfig.httpPort;

  const server = http.createServer(app);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });

  const addr = server.address() as AddressInfo | null;
  const boundPort = addr?.port ?? port;

  logger.info("HTTP MCP server listening", {
    service: SERVER.NAME,
    version: SERVER.VERSION,
    host,
    port: boundPort,
    tesouroOrdsBaseUrl: options.apiConfig.tesouroOrdsBaseUrl,
    transferegovBaseUrl: options.apiConfig.transferegovBaseUrl,
    tesouroCkanBaseUrl: options.apiConfig.tesouroCkanBaseUrl,
  });

  const close = async () => {
    await cleanup();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  };

  return { app, server, port: boundPort, host, close };
}
