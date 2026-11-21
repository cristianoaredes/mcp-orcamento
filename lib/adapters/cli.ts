/**
 * Node CLI entrypoint supporting stdio (default) and HTTP/SSE transports.
 */

import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadServerConfiguration } from "../config/index.js";
import { MemoryCache } from "../core/cache.js";
import { createMCPServer } from "../core/mcp-server.js";
import { TOOL_DEFINITIONS } from "../core/tools.js";
import { logger } from "../infrastructure/logger.js";
import { SERVER } from "../shared/utils/constants.js";
import { startHttpServer } from "./cli-http.js";

export interface CliParsedArgs {
  help: boolean;
  version: boolean;
  transport?: "stdio" | "http";
  port?: number;
  host?: string;
}

export function parseCliArgs(argv: string[]): CliParsedArgs {
  const parsed: CliParsedArgs = { help: false, version: false };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--version" || arg === "-v") {
      parsed.version = true;
    } else if (arg === "--http") {
      parsed.transport = "http";
    } else if (arg === "--stdio") {
      parsed.transport = "stdio";
    } else if (arg === "--port" && i + 1 < argv.length) {
      const p = Number(argv[++i]);
      if (Number.isInteger(p) && p >= 0 && p <= 65535) {
        parsed.port = p;
      }
    } else if (arg.startsWith("--port=")) {
      const p = Number(arg.slice("--port=".length));
      if (Number.isInteger(p) && p >= 0 && p <= 65535) {
        parsed.port = p;
      }
    } else if (arg === "--host" && i + 1 < argv.length) {
      parsed.host = argv[++i];
    } else if (arg.startsWith("--host=")) {
      parsed.host = arg.slice("--host=".length);
    }
  }

  return parsed;
}

export function printHelp(): void {
  const helpText = `${SERVER.NAME} v${SERVER.VERSION}
MCP Server for Brazilian Public Budget & Fiscal Data (SICONFI, Transferegov, SADIPEM/CKAN)

Usage:
  mcp-orcamento [options]

Options:
  --stdio             Start over stdio transport (default)
  --http              Start over hardened Express HTTP/SSE transport
  --port <port>       HTTP listen port (default: ${SERVER.DEFAULT_HTTP_PORT})
  --host <host>       HTTP bind host (default: 127.0.0.1)
  -v, --version       Print version and exit
  -h, --help          Show this help message

Environment:
  MCP_TRANSPORT              stdio | http
  MCP_HTTP_PORT              HTTP server port
  MCP_HTTP_HOST              HTTP bind host (default 127.0.0.1)
  MCP_API_KEY                Optional API key for HTTP transport
  TESOURO_ORDS_BASE_URL      Tesouro ORDS override
  TRANSFEREGOV_BASE_URL      Transferegov API override
  TESOURO_CKAN_BASE_URL      Tesouro Transparente CKAN override
`;
  console.error(helpText);
}

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const cliArgs = parseCliArgs(argv);

  if (cliArgs.help) {
    printHelp();
    return;
  }

  if (cliArgs.version) {
    console.log(`${SERVER.NAME} ${SERVER.VERSION}`);
    return;
  }

  const { apiConfig, serverConfig } = loadServerConfiguration();
  const effectiveTransport = cliArgs.transport ?? serverConfig.transport;
  if (cliArgs.port !== undefined) {
    serverConfig.httpPort = cliArgs.port;
  }
  if (cliArgs.host !== undefined) {
    serverConfig.httpHost = cliArgs.host;
  }

  const cache = new MemoryCache(serverConfig.cacheSize, serverConfig.cacheTTL);

  logger.info("Starting MCP Orçamento server", {
    service: SERVER.NAME,
    version: SERVER.VERSION,
    transport: effectiveTransport,
    tools: TOOL_DEFINITIONS.length,
    tesouroOrdsBaseUrl: apiConfig.tesouroOrdsBaseUrl,
    transferegovBaseUrl: apiConfig.transferegovBaseUrl,
    tesouroCkanBaseUrl: apiConfig.tesouroCkanBaseUrl,
  });

  if (effectiveTransport === "http") {
    const running = await startHttpServer({ apiConfig, serverConfig, cache });
    const shutdown = async (signal: string) => {
      logger.info("Shutting down HTTP MCP server", { signal });
      await running.close();
      process.exit(0);
    };
    process.once("SIGINT", () => void shutdown("SIGINT"));
    process.once("SIGTERM", () => void shutdown("SIGTERM"));
    return;
  }

  const mcpServer = createMCPServer({
    apiConfig,
    cache,
    transportName: "stdio",
  });
  const transport = new StdioServerTransport();

  let closing = false;
  const shutdownStdio = async (reason: string) => {
    if (closing) return;
    closing = true;
    logger.debug("Closing stdio MCP server", { reason });
    await mcpServer.close().catch(() => {});
    cache.destroy();
  };

  process.once("SIGINT", () => {
    void shutdownStdio("SIGINT").finally(() => process.exit(0));
  });
  process.once("SIGTERM", () => {
    void shutdownStdio("SIGTERM").finally(() => process.exit(0));
  });
  process.stdin.once("end", () => {
    void shutdownStdio("stdin-end");
  });

  await mcpServer.connect(transport);
}

function isExecutedDirectly(): boolean {
  if (typeof process === "undefined" || !process.argv?.[1]) {
    return false;
  }
  try {
    const invoked = realpathSync(path.resolve(process.argv[1]));
    const current = realpathSync(fileURLToPath(import.meta.url));
    return invoked === current || invoked.endsWith("mcp-orcamento.js");
  } catch {
    return false;
  }
}

if (isExecutedDirectly()) {
  runCli().catch((error) => {
    logger.error("Fatal CLI error", {
      error: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  });
}
