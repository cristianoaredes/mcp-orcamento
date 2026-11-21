import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildWorkerCache,
  handleMCPRequest,
  resetWorkerMemoryCache,
  resolveWorkerApiConfig,
} from "../../lib/adapters/cloudflare.js";
import { resetCircuitBreakers } from "../../lib/core/http-client.js";
import { resetWorkerMemoryRateLimiter } from "../../lib/workers/rate-limit.js";
import { handleWorkerFetch } from "../../lib/workers/worker.js";
import type { WorkerEnv } from "../../lib/workers/types.js";

describe("Worker REST, MCP Endpoint & Cloudflare Adapter", () => {
  beforeEach(() => {
    resetWorkerMemoryCache();
    resetWorkerMemoryRateLimiter();
    resetCircuitBreakers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetWorkerMemoryCache();
    resetWorkerMemoryRateLimiter();
    resetCircuitBreakers();
  });

  it("serves /, /health, and /openapi.json with exact 8-tool parity", async () => {
    const rootResp = await handleWorkerFetch(new Request("https://worker.test/"), {});
    expect(rootResp.status).toBe(200);
    expect(rootResp.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(rootResp.headers.get("X-Frame-Options")).toBe("DENY");
    const rootBody = (await rootResp.json()) as { tool_count: number; tools: string[] };
    expect(rootBody.tool_count).toBe(8);

    const healthResp = await handleWorkerFetch(new Request("https://worker.test/health"), {
      MCP_DPO_CONTACT: "dpo@aredes.me",
    });
    expect(healthResp.status).toBe(200);
    const healthBody = (await healthResp.json()) as {
      status: string;
      service: string;
      privacy: { dpo_contact: string };
    };
    expect(healthBody.status).toBe("healthy");
    expect(healthBody.service).toBe("mcp-orcamento");
    expect(healthBody.privacy.dpo_contact).toBe("dpo@aredes.me");

    const openApiResp = await handleWorkerFetch(
      new Request("https://worker.test/openapi.json"),
      {}
    );
    expect(openApiResp.status).toBe(200);
    const openApiBody = (await openApiResp.json()) as {
      paths: { "/tools/{toolName}": { post: { parameters: Array<{ schema: { enum: string[] } }> } } };
    };
    expect(openApiBody.paths["/tools/{toolName}"].post.parameters[0].schema.enum).toHaveLength(8);
  });

  it("handles POST /mcp JSON-RPC initialize, ping, tools/list, resources, and tools/call", async () => {
    const initResp = await handleWorkerFetch(
      new Request("https://worker.test/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: "2025-03-26" },
        }),
      }),
      {}
    );
    expect(initResp.status).toBe(200);
    const initJson = (await initResp.json()) as {
      result: { protocolVersion: string; serverInfo: { name: string; version: string } };
    };
    expect(initJson.result.protocolVersion).toBe("2025-03-26");
    expect(initJson.result.serverInfo).toEqual({ name: "mcp-orcamento", version: "0.1.0" });

    const listResp = await handleWorkerFetch(
      new Request("https://worker.test/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
      }),
      {}
    );
    const listJson = (await listResp.json()) as { result: { tools: unknown[] } };
    expect(listJson.result.tools).toHaveLength(8);

    const notifResp = await handleWorkerFetch(
      new Request("https://worker.test/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      }),
      {}
    );
    expect(notifResp.status).toBe(202);

    const resList = await handleMCPRequest({ jsonrpc: "2.0", id: 3, method: "resources/list" }, {});
    expect(resList.result).toEqual({ resources: [] });

    const resRead = await handleMCPRequest(
      { jsonrpc: "2.0", id: 4, method: "resources/read", params: { uri: "file:///etc/passwd" } },
      {}
    );
    expect(resRead.error?.message).toContain("Unknown resource URI");
  });

  it("handles POST /tools/{toolName} valid, 404 unknown, 400 bad JSON / invalid UTF-8 / non-object, and 500 error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [{ cod_ibge: 1, ente: "União", capital: "0 ", uf: "", esfera: "U", cnpj: "00394460000141" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    // Valid REST call -> 200
    const okResp = await handleWorkerFetch(
      new Request("https://worker.test/tools/siconfi_entes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ esfera: "U" }),
      }),
      {}
    );
    expect(okResp.status).toBe(200);
    const okData = (await okResp.json()) as { ok: boolean; data: { items: Array<{ ente: string }> } };
    expect(okData.ok).toBe(true);
    expect(okData.data.items[0].ente).toBe("União");

    // Validation error -> 400
    const invalidParams = await handleWorkerFetch(
      new Request("https://worker.test/tools/siconfi_entes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
      {}
    );
    expect(invalidParams.status).toBe(400);

    // Unknown tool -> 404
    const unknownResp = await handleWorkerFetch(
      new Request("https://worker.test/tools/nonexistent_tool", {
        method: "POST",
        body: "{}",
      }),
      {}
    );
    expect(unknownResp.status).toBe(404);

    // Malformed JSON -> 400
    const badJsonResp = await handleWorkerFetch(
      new Request("https://worker.test/tools/siconfi_entes", {
        method: "POST",
        body: "{bad",
      }),
      {}
    );
    expect(badJsonResp.status).toBe(400);

    // Non-object JSON array -> 400
    const arrayJsonResp = await handleWorkerFetch(
      new Request("https://worker.test/tools/siconfi_entes", {
        method: "POST",
        body: "[1, 2, 3]",
      }),
      {}
    );
    expect(arrayJsonResp.status).toBe(400);

    // Invalid UTF-8 byte sequence -> 400
    const invalidUtf8Resp = await handleWorkerFetch(
      new Request("https://worker.test/tools/siconfi_entes", {
        method: "POST",
        body: new Uint8Array([0xff, 0xfe, 0xfd]),
      }),
      {}
    );
    expect(invalidUtf8Resp.status).toBe(400);

    // Invalid Worker API override inside env causes internal configuration error -> 500
    const error500Resp = await handleWorkerFetch(
      new Request("https://worker.test/tools/siconfi_entes", {
        method: "POST",
        body: JSON.stringify({ esfera: "U" }),
      }),
      { TESOURO_ORDS_BASE_URL: "https://disallowed-ssrf.example.com/ords/" }
    );
    expect(error500Resp.status).toBe(500);
  });

  it("syncs Worker env overrides and selects KV vs MemoryCache cleanly", () => {
    const resolved = resolveWorkerApiConfig({
      TESOURO_ORDS_BASE_URL: "http://127.0.0.1:8100/ords/",
      MCP_ALLOW_LOCALHOST_APIS: "true",
    });
    expect(resolved.tesouroOrdsBaseUrl).toBe("http://127.0.0.1:8100/ords/");

    const kvMock = {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
    };
    const kvCache = buildWorkerCache({ MCP_CACHE: kvMock } as WorkerEnv);
    expect(kvCache.constructor.name).toBe("KVCache");

    const memCache = buildWorkerCache({});
    expect(memCache.constructor.name).toBe("MemoryCache");
  });

  it("handles Worker routing edge cases (405, 404 routes, 502 upstream REST failures)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("bad", { status: 404, statusText: "Not Found" }))
    );

    const restUpstreamErr = await handleWorkerFetch(
      new Request("https://worker.test/tools/siconfi_entes", {
        method: "POST",
        body: JSON.stringify({ esfera: "U" }),
      }),
      {}
    );
    expect(restUpstreamErr.status).toBe(502);

    const restGet = await handleWorkerFetch(
      new Request("https://worker.test/tools/siconfi_entes", { method: "GET" }),
      {}
    );
    expect(restGet.status).toBe(405);

    const nestedTool = await handleWorkerFetch(
      new Request("https://worker.test/tools/a/b", { method: "POST" }),
      {}
    );
    expect(nestedTool.status).toBe(404);

    const unknownRoute = await handleWorkerFetch(
      new Request("https://worker.test/nonexistent", { method: "GET" }),
      {}
    );
    expect(unknownRoute.status).toBe(404);

    const mcpGet = await handleWorkerFetch(
      new Request("https://worker.test/mcp", { method: "GET" }),
      {}
    );
    expect(mcpGet.status).toBe(405);
  });
});
