/**
 * Tool Registry with strict Zod schema enforcement before handler execution.
 * Zero `node:*` imports.
 */

import type { z } from "zod";
import type { RequestContext } from "../infrastructure/tracing.js";
import type { ApiConfig, Cache, LookupResult } from "../types/index.js";

export interface ToolExecutionContext {
  apiConfig: ApiConfig;
  cache: Cache;
  requestId?: string;
  requestContext?: RequestContext;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export interface RegisteredTool<TArgs = unknown> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  schema: z.ZodType<TArgs>;
  handler: (args: TArgs, context: ToolExecutionContext) => Promise<LookupResult>;
}

export interface PublicToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool<unknown>>();

  register<TArgs>(tool: RegisteredTool<TArgs>): void {
    this.tools.set(tool.name, tool as RegisteredTool<unknown>);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  get(name: string): RegisteredTool<unknown> | undefined {
    return this.tools.get(name);
  }

  list(): PublicToolDefinition[] {
    return Array.from(this.tools.values()).map(({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    }));
  }

  names(): string[] {
    return Array.from(this.tools.keys());
  }

  async execute(
    name: string,
    rawArgs: unknown,
    context: ToolExecutionContext
  ): Promise<LookupResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        ok: false,
        error: `Unknown tool: ${name}`,
      };
    }

    const inputObject =
      rawArgs === undefined || rawArgs === null ? {} : rawArgs;
    const parsed = tool.schema.safeParse(inputObject);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((issue) => {
          const loc = issue.path.length > 0 ? issue.path.join(".") : "input";
          return `${loc}: ${issue.message}`;
        })
        .join("; ");
      return {
        ok: false,
        error: `Validation error for tool '${name}': ${issues}`,
      };
    }

    return tool.handler(parsed.data, context);
  }

  clear(): void {
    this.tools.clear();
  }
}

export const defaultToolRegistry = new ToolRegistry();
