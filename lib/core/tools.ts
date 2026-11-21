/**
 * Core tool catalog wrapper and RED + cache-hit metrics collector.
 * Zero `node:*` imports for Cloudflare Workers parity.
 */

import { logger } from "../infrastructure/logger.js";
import {
  defaultToolRegistry,
  type PublicToolDefinition,
  type ToolExecutionContext,
} from "../tools/index.js";
import type { LookupResult, Metrics, ToolMetrics } from "../types/index.js";

export type { PublicToolDefinition, ToolExecutionContext };

export const TOOL_DEFINITIONS: PublicToolDefinition[] = defaultToolRegistry.list();

const globalMetrics: Metrics = {
  requests: 0,
  cacheHits: 0,
  errors: 0,
  totalTime: 0,
  startTime: Date.now(),
};

const perToolMetrics = new Map<string, ToolMetrics>();

function nowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function recordToolMetrics(
  toolName: string,
  durationMs: number,
  ok: boolean,
  cached: boolean
): void {
  globalMetrics.requests++;
  globalMetrics.totalTime += durationMs;
  if (!ok) {
    globalMetrics.errors++;
  }
  if (cached) {
    globalMetrics.cacheHits++;
  }

  let entry = perToolMetrics.get(toolName);
  if (!entry) {
    entry = {
      requests: 0,
      errors: 0,
      cacheHits: 0,
      totalTimeMs: 0,
      avgTimeMs: 0,
      maxTimeMs: 0,
    };
    perToolMetrics.set(toolName, entry);
  }

  entry.requests++;
  if (!ok) {
    entry.errors++;
  }
  if (cached) {
    entry.cacheHits++;
  }
  entry.totalTimeMs += durationMs;
  entry.avgTimeMs = entry.totalTimeMs / entry.requests;
  if (durationMs > entry.maxTimeMs) {
    entry.maxTimeMs = durationMs;
  }
}

export function hasTool(name: string): boolean {
  return defaultToolRegistry.has(name);
}

export function getToolNames(): string[] {
  return defaultToolRegistry.names();
}

export async function executeTool(
  name: string,
  args: unknown,
  context: ToolExecutionContext
): Promise<LookupResult> {
  const startedAt = nowMs();

  try {
    const result = await defaultToolRegistry.execute(name, args, context);
    const durationMs = Math.max(0, nowMs() - startedAt);
    const isCached =
      result.ok &&
      typeof result.data === "object" &&
      result.data !== null &&
      (result.data as { cached?: unknown }).cached === true;

    recordToolMetrics(name, durationMs, result.ok, isCached);

    logger.debug("Executed MCP tool", {
      tool: name,
      ok: result.ok,
      cached: isCached,
      durationMs: Math.round(durationMs * 100) / 100,
      requestId: context.requestId,
    });

    return result;
  } catch (error) {
    const durationMs = Math.max(0, nowMs() - startedAt);
    recordToolMetrics(name, durationMs, false, false);
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Unhandled tool execution error", {
      tool: name,
      error: message,
      requestId: context.requestId,
    });
    return {
      ok: false,
      error: message,
    };
  }
}

export function getMetrics(): Metrics & {
  uptimeMs: number;
  tools: Record<string, ToolMetrics>;
} {
  const tools: Record<string, ToolMetrics> = {};
  for (const [name, m] of perToolMetrics.entries()) {
    tools[name] = { ...m };
  }
  return {
    ...globalMetrics,
    uptimeMs: Math.max(0, Date.now() - globalMetrics.startTime),
    tools,
  };
}

export function resetMetrics(): void {
  globalMetrics.requests = 0;
  globalMetrics.cacheHits = 0;
  globalMetrics.errors = 0;
  globalMetrics.totalTime = 0;
  globalMetrics.startTime = Date.now();
  perToolMetrics.clear();
}
