/**
 * Shared MCP Protocol Server factory for stdio and HTTP/SSE transports.
 * Zero `node:*` imports. Kept concise (<= 180 lines).
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { logger } from "../infrastructure/logger.js";
import { RateLimiter } from "../infrastructure/rate-limiter.js";
import { createRequestContext } from "../infrastructure/tracing.js";
import { serializeBoundedToolOutput } from "../shared/agentic-guard.js";
import { API_URLS, SERVER } from "../shared/utils/constants.js";
import type { ApiConfig, Cache } from "../types/index.js";
import { MemoryCache } from "./cache.js";
import { executeTool, getMetrics, TOOL_DEFINITIONS } from "./tools.js";

export interface CreateMCPServerOptions {
  apiConfig?: ApiConfig;
  cache?: Cache;
  rateLimiter?: RateLimiter;
  rateLimitKey?: string;
  maxToolOutputChars?: number;
  maxRequestsPerMinute?: number;
  transportName?: string;
}

function defaultApiConfig(): ApiConfig {
  return {
    tesouroOrdsBaseUrl: API_URLS.DEFAULT_TESOURO_ORDS,
    transferegovBaseUrl: API_URLS.DEFAULT_TRANSFEREGOV,
    tesouroCkanBaseUrl: API_URLS.DEFAULT_TESOURO_CKAN,
  };
}

export function createMCPServer(options: CreateMCPServerOptions = {}): Server {
  const apiConfig = options.apiConfig ?? defaultApiConfig();
  const ownsCache = !options.cache;
  const cache: Cache = options.cache ?? new MemoryCache();
  const ownsRateLimiter = !options.rateLimiter;
  const rateLimiter =
    options.rateLimiter ??
    new RateLimiter({
      maxRequests: options.maxRequestsPerMinute ?? 100,
      windowMs: 60_000,
      cleanupIntervalMs: 60_000,
    });
  const sessionKey = options.rateLimitKey ?? "mcp-session";
  const transportName = options.transportName ?? "mcp";

  const server = new Server(
    {
      name: SERVER.NAME,
      version: SERVER.VERSION,
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  }));

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async () => {
    throw new McpError(ErrorCode.InvalidParams, "Unknown resource URI");
  });

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const toolName = request.params.name;
    const args = request.params.arguments ?? {};
    const reqCtx = createRequestContext({ transport: transportName });

    const rateDecision = rateLimiter.check(sessionKey);
    if (!rateDecision.allowed) {
      logger.warn("MCP session rate limit exceeded", {
        tool: toolName,
        requestId: reqCtx.requestId,
        retryAfterSeconds: rateDecision.retryAfterSeconds,
      });
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: serializeBoundedToolOutput(
              {
                ok: false,
                error: `Rate limit exceeded. Retry after ${rateDecision.retryAfterSeconds}s.`,
                retryAfterSeconds: rateDecision.retryAfterSeconds,
              },
              options.maxToolOutputChars
            ),
          },
        ],
      };
    }

    const result = await executeTool(toolName, args, {
      apiConfig,
      cache,
      requestId: reqCtx.requestId,
      requestContext: reqCtx,
      signal: extra?.signal,
    });

    return {
      isError: !result.ok,
      content: [
        {
          type: "text",
          text: serializeBoundedToolOutput(result, options.maxToolOutputChars),
        },
      ],
    };
  });

  server.onclose = () => {
    const snapshot = getMetrics();
    console.error("[metrics]", JSON.stringify(snapshot));
    if (ownsRateLimiter) {
      rateLimiter.destroy();
    }
    if (ownsCache && cache instanceof MemoryCache) {
      cache.destroy();
    }
  };

  return server;
}
