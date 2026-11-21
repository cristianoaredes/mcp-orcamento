/**
 * Generic REST adapter for POST /tools/{toolName} inside Cloudflare Worker.
 * Enforces tool allowlist, UTF-8 / JSON object parsing, and forwards to handleMCPRequest.
 * Zero `node:*` imports.
 */

import {
  getCorsHeaders,
  handleMCPRequest,
  readBoundedJsonBody,
} from "../adapters/cloudflare.js";
import { hasTool } from "../core/tools.js";
import { logger } from "../infrastructure/logger.js";
import {
  createRequestContext,
  REQUEST_ID_HEADER,
  type RequestContext,
} from "../infrastructure/tracing.js";
import type { MCPRequest } from "../types/index.js";
import type { WorkerEnv } from "./types.js";

export async function handleToolRestEndpoint(
  toolName: string,
  request: Request,
  env: WorkerEnv,
  requestContext?: RequestContext
): Promise<Response> {
  const reqCtx =
    requestContext ?? createRequestContext({ headers: request.headers, transport: "worker-rest" });
  const corsHeaders = getCorsHeaders(request, env);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    [REQUEST_ID_HEADER]: reqCtx.requestId,
    ...corsHeaders,
  };

  if (!hasTool(toolName)) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: `Unknown tool: ${toolName}`,
      }),
      { status: 404, headers }
    );
  }

  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Method not allowed; use POST",
      }),
      { status: 405, headers }
    );
  }

  let parsedArgs: Record<string, unknown>;
  try {
    const parsed = await readBoundedJsonBody(request);
    if (!parsed.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: parsed.error,
        }),
        { status: parsed.status, headers }
      );
    }

    if (typeof parsed.body !== "object" || parsed.body === null || Array.isArray(parsed.body)) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "REST tool body must be a JSON object",
        }),
        { status: 400, headers }
      );
    }
    parsedArgs = parsed.body as Record<string, unknown>;
  } catch (error) {
    logger.error("Failed reading REST tool body", {
      tool: toolName,
      requestId: reqCtx.requestId,
      error: error instanceof Error ? error.message : String(error),
    });
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Failed to read request body",
      }),
      { status: 400, headers }
    );
  }

  try {
    const mcpRequest: MCPRequest = {
      jsonrpc: "2.0",
      id: reqCtx.requestId,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: parsedArgs,
      },
    };

    const mcpResponse = await handleMCPRequest(mcpRequest, env, reqCtx);
    if (mcpResponse.error) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: mcpResponse.error.message,
          code: mcpResponse.error.code,
        }),
        { status: 500, headers }
      );
    }

    const resultPayload = mcpResponse.result as {
      isError?: boolean;
      content?: Array<{ type: string; text?: string }>;
    };
    const text = resultPayload?.content?.[0]?.text ?? "{}";
    const parsedOutput = JSON.parse(text) as { ok?: boolean; error?: string };

    if (resultPayload?.isError || parsedOutput?.ok === false) {
      const errorText = String(parsedOutput?.error ?? "");
      const status = errorText.toLowerCase().includes("validation error") ? 400 : 502;
      return new Response(text, { status, headers });
    }

    return new Response(text, { status: 200, headers });
  } catch (error) {
    logger.error("REST tool execution failed", {
      tool: toolName,
      requestId: reqCtx.requestId,
      error: error instanceof Error ? error.message : String(error),
    });
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Internal server error while executing tool",
      }),
      { status: 500, headers }
    );
  }
}
