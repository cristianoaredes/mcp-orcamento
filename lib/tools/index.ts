/**
 * Tool registration entrypoint for all 8 Budget/Fiscal MCP tools.
 * Zero `node:*` imports.
 */

import { defaultToolRegistry, ToolRegistry } from "../core/registry.js";
import { registerSiconfiTools } from "./siconfi.js";
import { registerTesouroTools } from "./tesouro.js";
import { registerTransferegovTools } from "./transferegov.js";

export function registerAllTools(registry: ToolRegistry = defaultToolRegistry): ToolRegistry {
  registerSiconfiTools(registry);
  registerTransferegovTools(registry);
  registerTesouroTools(registry);
  return registry;
}

registerAllTools(defaultToolRegistry);

export { defaultToolRegistry, ToolRegistry } from "../core/registry.js";
export type {
  PublicToolDefinition,
  RegisteredTool,
  ToolExecutionContext,
} from "../core/registry.js";
