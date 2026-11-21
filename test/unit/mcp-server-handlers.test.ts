import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryCache } from "../../lib/core/cache.js";
import { createMCPServer } from "../../lib/core/mcp-server.js";

describe("MCP Server Handlers (Stdio / Protocol Layer)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("handles listTools (8), empty listResources, readResource rejection, 101-call rate limiting, and bounded output", async () => {
    const cache = new MemoryCache(32, 60_000, 0);
    const server = createMCPServer({
      cache,
      maxToolOutputChars: 1500,
    });
    const client = new Client(
      { name: "vitest-mcp-client", version: "1.0.0" },
      { capabilities: {} }
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const toolsRes = await client.listTools();
    expect(toolsRes.tools).toHaveLength(8);

    const resourcesRes = await client.listResources();
    expect(resourcesRes.resources).toEqual([]);

    await expect(client.readResource({ uri: "orcamento://invalid" })).rejects.toThrow(
      /Unknown resource URI/
    );

    // 100 invalid offline calls hit Zod validation without fetch; 101st hits session rate limit
    for (let i = 1; i <= 101; i++) {
      const res = await client.callTool({ name: "siconfi_entes", arguments: {} });
      expect(res.isError, `Call ${i} should set isError: true`).toBe(true);
      const firstText = (res.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
      if (i === 101) {
        expect(firstText).toContain("Rate limit exceeded");
      }
    }

    await client.close();
    await server.close();
    expect(stderrSpy.mock.calls.some((args) => String(args[0]).includes("[metrics]"))).toBe(true);
    cache.destroy();
  });

  it("bounds oversized tool JSON payloads cleanly using serializeBoundedToolOutput", async () => {
    const hugeItems = Array.from({ length: 40 }, (_, i) => ({
      cod_ibge: String(1000000 + i),
      ente: `Município Teste Longo ${i} `.repeat(6),
      capital: "0 ",
      uf: "SP",
      esfera: "M",
      cnpj: "00000000000100",
    }));

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ items: hugeItems }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
    );

    const cache = new MemoryCache(16, 60_000, 0);
    const server = createMCPServer({
      cache,
      maxToolOutputChars: 1200,
    });
    const client = new Client({ name: "bounded-client", version: "1.0.0" }, { capabilities: {} });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    vi.spyOn(console, "error").mockImplementation(() => {});

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const callRes = await client.callTool({
      name: "siconfi_entes",
      arguments: { uf: "SP", limit: 40 },
    });
    expect(callRes.isError).toBe(false);
    const text = (callRes.content as Array<{ text: string }>)[0].text;
    expect(text.length).toBeLessThanOrEqual(1200);
    const parsed = JSON.parse(text) as { truncated?: boolean };
    expect(parsed.truncated).toBe(true);

    await client.close();
    await server.close();
    cache.destroy();
  });
});
