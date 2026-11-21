/**
 * OpenAPI 3.0 specification generator for the Cloudflare Worker REST & MCP endpoints.
 * Zero `node:*` imports.
 */

import { TOOL_NAMES } from "../core/tool-schemas.js";
import { SERVER } from "../shared/utils/constants.js";

export function buildOpenApiSpec(serverUrl: string = "https://mcp-orcamento.aredes.me") {
  return {
    openapi: "3.0.3",
    info: {
      title: "MCP Orçamento API",
      version: SERVER.VERSION,
      description:
        "API MCP e REST para consulta de dados orçamentários e fiscais públicos brasileiros (SICONFI, Transferegov e SADIPEM/CKAN do Tesouro Nacional).",
      license: {
        name: "AGPL-3.0-only",
      },
    },
    servers: [{ url: serverUrl }],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
        },
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
        },
      },
    },
    paths: {
      "/health": {
        get: {
          summary: "Health check and readiness telemetry",
          responses: {
            "200": {
              description: "Worker health payload",
            },
          },
        },
      },
      "/mcp": {
        post: {
          summary: "JSON-RPC 2.0 MCP endpoint",
          security: [{}, { BearerAuth: [] }, { ApiKeyAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object" },
              },
            },
          },
          responses: {
            "200": { description: "JSON-RPC response" },
            "400": { description: "Malformed JSON or JSON-RPC payload" },
            "401": { description: "Authentication required" },
            "429": { description: "Rate limit exceeded" },
          },
        },
      },
      "/sse": {
        get: {
          summary: "Open Server-Sent Events MCP stream",
          security: [{}, { BearerAuth: [] }, { ApiKeyAuth: [] }],
          responses: {
            "200": { description: "SSE stream" },
          },
        },
        post: {
          summary: "Deliver JSON-RPC message to SSE session",
          security: [{}, { BearerAuth: [] }, { ApiKeyAuth: [] }],
          responses: {
            "200": { description: "JSON-RPC response" },
          },
        },
      },
      "/tools/{toolName}": {
        post: {
          summary: "Execute a specific MCP Budget/Fiscal tool via REST JSON body",
          security: [{}, { BearerAuth: [] }, { ApiKeyAuth: [] }],
          parameters: [
            {
              name: "toolName",
              in: "path",
              required: true,
              schema: {
                type: "string",
                enum: [...TOOL_NAMES],
              },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object" },
              },
            },
          },
          responses: {
            "200": { description: "Tool execution result" },
            "400": { description: "Invalid JSON, encoding, or tool parameters" },
            "404": { description: "Unknown tool" },
            "429": { description: "Rate limit exceeded" },
            "500": { description: "Internal error" },
          },
        },
      },
    },
  };
}

export function handleOpenApiEndpoint(
  request: Request,
  extraHeaders: Record<string, string> = {}
): Response {
  const origin = new URL(request.url).origin;
  return new Response(JSON.stringify(buildOpenApiSpec(origin), null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}
