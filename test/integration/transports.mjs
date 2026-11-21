import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const BIN_PATH = path.join(REPO_ROOT, "build/lib/bin/mcp-orcamento.js");
const CLI_PATH = path.join(REPO_ROOT, "build/lib/adapters/cli.js");

const EXPECTED_TOOLS = [
  "siconfi_entes",
  "siconfi_extrato_entregas",
  "siconfi_rreo",
  "siconfi_rgf",
  "siconfi_dca",
  "transferegov_emendas_especiais",
  "transferegov_fundo_a_fundo_ted",
  "tesouro_operacoes_credito_ckan",
];

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

async function waitForHealth(url, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        return await resp.json();
      }
    } catch {
      // retry until server listens
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function testStdioTransport() {
  const transportErrors = [];
  const stderrChunks = [];

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [BIN_PATH],
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      NODE_ENV: "test",
      TESOURO_ORDS_BASE_URL: "http://127.0.0.1:19991/ords/",
      TRANSFEREGOV_BASE_URL: "http://127.0.0.1:19992/",
      TESOURO_CKAN_BASE_URL: "http://127.0.0.1:19993/ckan/api/3/action/",
    },
    stderr: "pipe",
  });

  if (transport.stderr) {
    transport.stderr.on("data", (chunk) => {
      stderrChunks.push(chunk.toString("utf8"));
    });
  }
  transport.onerror = (err) => {
    transportErrors.push(err);
  };

  const client = new Client(
    { name: "transport-integration-stdio", version: "0.1.0" },
    { capabilities: {} }
  );

  await client.connect(transport);

  const toolsList = await client.listTools();
  assert.equal(toolsList.tools.length, 8);
  assert.deepEqual(
    toolsList.tools.map((t) => t.name),
    EXPECTED_TOOLS
  );

  const resourcesList = await client.listResources();
  assert.deepEqual(resourcesList.resources, []);

  await assert.rejects(
    client.readResource({ uri: "orcamento://nonexistent" }),
    /Unknown resource URI/
  );

  // 101 offline invalid siconfi_entes({}) calls -> all must return isError: true cleanly
  for (let i = 1; i <= 101; i++) {
    const callRes = await client.callTool({ name: "siconfi_entes", arguments: {} });
    assert.equal(callRes.isError, true, `Expected call #${i} to return isError=true`);
  }

  await client.close();
  await new Promise((r) => setTimeout(r, 150));

  assert.equal(transportErrors.length, 0, `Unexpected stdio transport errors: ${transportErrors}`);
  const stderrText = stderrChunks.join("");
  assert.ok(stderrText.includes("[metrics]"), `Expected [metrics] in stderr, got: ${stderrText}`);
  console.log("STDIO_TRANSPORT_OK (8 tools, 101 offline calls, [metrics] verified)");
}

async function testHttpAndSseTransport() {
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [CLI_PATH, "--http", "--port", String(port)], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      NODE_ENV: "test",
      MCP_HTTP_HOST: "127.0.0.1",
      TESOURO_ORDS_BASE_URL: "http://127.0.0.1:19991/ords/",
      TRANSFEREGOV_BASE_URL: "http://127.0.0.1:19992/",
      TESOURO_CKAN_BASE_URL: "http://127.0.0.1:19993/ckan/api/3/action/",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    const health = await waitForHealth(`${baseUrl}/health`);
    assert.equal(health.status, "healthy");
    assert.equal(health.service, "mcp-orcamento");
    assert.equal(health.tools, 8);

    // 1) Streamable HTTP (/mcp)
    const streamClient = new Client(
      { name: "transport-integration-streamable", version: "0.1.0" },
      { capabilities: {} }
    );
    const streamTransport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`));
    await streamClient.connect(streamTransport);
    const streamTools = await streamClient.listTools();
    assert.equal(streamTools.tools.length, 8);
    const streamResources = await streamClient.listResources();
    assert.deepEqual(streamResources.resources, []);
    await assert.rejects(
      streamClient.readResource({ uri: "orcamento://nonexistent" }),
      /Unknown resource URI/
    );
    const errCall = await streamClient.callTool({ name: "siconfi_entes", arguments: {} });
    assert.equal(errCall.isError, true);
    await streamClient.close();

    // 2) Legacy SSE (/sse + /messages)
    const sseClient = new Client(
      { name: "transport-integration-sse", version: "0.1.0" },
      { capabilities: {} }
    );
    const sseTransport = new SSEClientTransport(new URL(`${baseUrl}/sse`));
    await sseClient.connect(sseTransport);
    const sseTools = await sseClient.listTools();
    assert.equal(sseTools.tools.length, 8);
    await sseClient.close();

    console.log("HTTP_SSE_TRANSPORT_OK (StreamableHTTP /mcp + SSE /sse verified)");
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 2000);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}

await testStdioTransport();
await testHttpAndSseTransport();
