import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryCache } from "../../lib/core/cache.js";
import { executeTool, TOOL_DEFINITIONS } from "../../lib/core/tools.js";
import { TOOL_INPUT_SCHEMAS, TOOL_NAMES, TOOL_SCHEMAS } from "../../lib/core/tool-schemas.js";
import type { ApiConfig } from "../../lib/types/index.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

const TEST_API_CONFIG: ApiConfig = {
  tesouroOrdsBaseUrl: "https://apidatalake.tesouro.gov.br/ords/",
  transferegovBaseUrl: "https://api.transferegov.gestao.gov.br/",
  tesouroCkanBaseUrl: "https://www.tesourotransparente.gov.br/ckan/api/3/action/",
};

describe("Tool Validation & Allowlist Governance", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("exposes the exact 8 tools without any api_key schema fields", () => {
    const names = TOOL_DEFINITIONS.map((t) => t.name);
    expect(names).toEqual([
      "siconfi_entes",
      "siconfi_extrato_entregas",
      "siconfi_rreo",
      "siconfi_rgf",
      "siconfi_dca",
      "transferegov_emendas_especiais",
      "transferegov_fundo_a_fundo_ted",
      "tesouro_operacoes_credito_ckan",
    ]);
    expect(names).toEqual([...TOOL_NAMES]);

    for (const def of TOOL_DEFINITIONS) {
      const schemaStr = JSON.stringify(def.inputSchema).toLowerCase();
      expect(schemaStr).not.toContain("api_key");
      expect(schemaStr).not.toContain("apikey");

      const properties = (def.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
      const inputJsonProps = Object.keys(properties).sort();
      const exportedProps = Object.keys(
        (TOOL_INPUT_SCHEMAS[def.name as keyof typeof TOOL_INPUT_SCHEMAS] as {
          properties: Record<string, unknown>;
        }).properties
      ).sort();
      expect(inputJsonProps).toEqual(exportedProps);
      expect(TOOL_SCHEMAS[def.name as keyof typeof TOOL_SCHEMAS]).toBeDefined();
    }
  });

  it("rejects invalid arguments across all 8 tools before making any upstream fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const cache = new MemoryCache(32, 60_000, 0);

    const invalidCases: Array<[string, Record<string, unknown>]> = [
      ["siconfi_entes", {}],
      ["siconfi_entes", { uf: "SPP" }],
      ["siconfi_entes", { cnpj: "123", unexpected: true }],
      ["siconfi_extrato_entregas", { id_ente: -1, an_referencia: 2024 }],
      ["siconfi_rreo", { id_ente: 3550308, an_exercicio: 2024, nr_periodo: 7 }],
      ["siconfi_rgf", { id_ente: 3550308, an_exercicio: 2010, nr_periodo: 1 }],
      ["siconfi_dca", { id_ente: 3550308, an_exercicio: 2024, limit: 51 }],
      ["transferegov_emendas_especiais", { numero_emenda: "abc" }],
      ["transferegov_emendas_especiais", { nome_parlamentar: "*,()" }],
      ["transferegov_fundo_a_fundo_ted", { modalidade: "fundoafundo", recurso: "nota_credito" }],
      ["transferegov_fundo_a_fundo_ted", { modalidade: "ted", recurso: "empenho" }],
      ["transferegov_fundo_a_fundo_ted", { modalidade: "ted", sigla_unidade: "(*)" }],
      ["tesouro_operacoes_credito_ckan", { modo: "operacoes_credito_pvl" }],
      ["tesouro_operacoes_credito_ckan", { modo: "operacoes_credito_pvl", uf: "1A" }],
      ["unknown_tool", {}],
    ];

    for (const [toolName, args] of invalidCases) {
      const result = await executeTool(toolName, args, {
        apiConfig: TEST_API_CONFIG,
        cache,
      });
      expect(result.ok, `Expected ${toolName} with ${JSON.stringify(args)} to fail`).toBe(false);
      expect(result.error).toBeTruthy();
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("matches .archagents/_capabilities.json and mcp-tool-allowlist.json (SC-9)", () => {
    const caps = JSON.parse(
      readFileSync(path.join(REPO_ROOT, ".archagents/_capabilities.json"), "utf8")
    ) as { agentic: { mcp: boolean; tool_count: number } };
    expect(caps.agentic.mcp).toBe(true);
    expect(caps.agentic.tool_count).toBe(8);

    const allowlist = JSON.parse(
      readFileSync(path.join(REPO_ROOT, ".archagents/mcp-tool-allowlist.json"), "utf8")
    ) as {
      entries: Array<{
        id: string;
        name: string;
        risk_level: string;
        destructive: boolean;
        requires_approval: boolean;
        description: string;
        rationale: string;
        network_access: string;
        api_key_env: string | null;
      }>;
    };

    expect(allowlist.entries).toHaveLength(8);
    expect(allowlist.entries.map((e) => e.name)).toEqual([...TOOL_NAMES]);
    for (const entry of allowlist.entries) {
      expect(entry.id).toMatch(/^MCP-TOOL-\d+$/);
      expect(entry.destructive).toBe(false);
      expect(entry.requires_approval).toBe(false);
      expect(entry.network_access).toBe("allowlisted-https");
      expect(entry.api_key_env).toBeNull();
      expect(entry.description.trim().length).toBeGreaterThan(0);
      expect(entry.rationale.trim().length).toBeGreaterThan(0);
    }
  });

  it("tracks RED metrics, getToolNames, resetMetrics, and ToolRegistry operations cleanly", async () => {
    const { getMetrics, getToolNames, resetMetrics } = await import("../../lib/core/tools.js");
    const { ToolRegistry } = await import("../../lib/core/registry.js");
    const { z } = await import("zod");

    resetMetrics();
    expect(getToolNames()).toHaveLength(8);
    expect(getMetrics().requests).toBe(0);

    const cache = new MemoryCache(8, 60_000, 0);
    await executeTool("unknown_tool", {}, { apiConfig: TEST_API_CONFIG, cache });
    expect(getMetrics().errors).toBe(1);
    resetMetrics();
    expect(getMetrics().requests).toBe(0);

    const reg = new ToolRegistry();
    reg.register({
      name: "t1",
      description: "d",
      inputSchema: { type: "object" },
      schema: z.object({}).strict(),
      handler: async () => ({ ok: true, data: { x: 1 } }),
    });
    expect(reg.get("t1")?.name).toBe("t1");
    expect((await reg.execute("t1", {}, { apiConfig: TEST_API_CONFIG, cache })).ok).toBe(true);
    reg.clear();
    expect(reg.names()).toEqual([]);
  });
});
