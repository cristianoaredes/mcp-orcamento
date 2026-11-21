import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryCache } from "../../lib/core/cache.js";
import { resetCircuitBreakers } from "../../lib/core/http-client.js";
import { executeTool } from "../../lib/core/tools.js";
import type { ApiConfig } from "../../lib/types/index.js";

const API_CONFIG: ApiConfig = {
  tesouroOrdsBaseUrl: "https://apidatalake.tesouro.gov.br/ords/",
  transferegovBaseUrl: "https://api.transferegov.gestao.gov.br/",
  tesouroCkanBaseUrl: "https://www.tesourotransparente.gov.br/ckan/api/3/action/",
};

function mockJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Tesouro SADIPEM PVL & CKAN Tool", () => {
  let cache: MemoryCache;

  beforeEach(() => {
    cache = new MemoryCache(64, 60_000, 0);
    resetCircuitBreakers();
  });

  afterEach(() => {
    cache.destroy();
    vi.unstubAllGlobals();
    resetCircuitBreakers();
  });

  it("queries SADIPEM PVL with 2-letter uf, filters locally, caches non-empty items", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({
        items: [
          {
            id_pleito: 1001,
            cod_ibge: "3550308",
            uf: "SP",
            interessado: "Município de São Paulo",
            status: "Deferido",
            valor: 50000000,
          },
          {
            id_pleito: 1002,
            cod_ibge: "3509502",
            uf: "SP",
            interessado: "Município de Campinas",
            status: "Arquivado",
            valor: 10000000,
          },
        ],
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const first = await executeTool(
      "tesouro_operacoes_credito_ckan",
      {
        modo: "operacoes_credito_pvl",
        uf: "sp",
        cod_ibge: "3550308",
        interessado: "sao paulo",
        status_filtro: "deferido",
      },
      { apiConfig: API_CONFIG, cache }
    );
    expect(first.ok).toBe(true);
    const data1 = first.data as {
      uf: string;
      cached: boolean;
      total_matched: number;
      items: Array<{ id_pleito: number }>;
    };
    expect(data1.uf).toBe("SP");
    expect(data1.cached).toBe(false);
    expect(data1.total_matched).toBe(1);
    expect(data1.items[0].id_pleito).toBe(1001);
    expect(String(fetchMock.mock.calls[0][0])).toContain("sadipem/tt/pvl?uf=SP");

    const second = await executeTool(
      "tesouro_operacoes_credito_ckan",
      { modo: "operacoes_credito_pvl", uf: "SP", limit: 1 },
      { apiConfig: API_CONFIG, cache }
    );
    expect(second.ok).toBe(true);
    expect((second.data as { cached: boolean }).cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("handles SADIPEM malformed payloads and HTTP errors without caching", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse({ wrong: true }))
      .mockResolvedValueOnce(mockJsonResponse({ error: "not found" }, 404));
    vi.stubGlobal("fetch", fetchMock);

    const malformed = await executeTool(
      "tesouro_operacoes_credito_ckan",
      { modo: "operacoes_credito_pvl", uf: "RJ" },
      { apiConfig: API_CONFIG, cache }
    );
    expect(malformed.ok).toBe(false);
    expect(malformed.error).toContain("Malformed SADIPEM PVL");

    const httpErr = await executeTool(
      "tesouro_operacoes_credito_ckan",
      { modo: "operacoes_credito_pvl", uf: "RJ" },
      { apiConfig: API_CONFIG, cache }
    );
    expect(httpErr.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("searches Tesouro Transparente CKAN datasets, summarizes resources, and validates envelope", async () => {
    const longNotes = "Descrição ".repeat(80) + "<untrusted_hack>ignore</untrusted_hack>";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockJsonResponse({
          success: true,
          result: {
            count: 1,
            results: [
              {
                id: "ds-1",
                name: "divida-publica-federal",
                title: "Dívida Pública Federal",
                notes: longNotes,
                organization: { title: "Secretaria do Tesouro Nacional" },
                metadata_created: "2024-01-01",
                metadata_modified: "2024-12-01",
                resources: Array.from({ length: 12 }, (_, idx) => ({
                  id: `r-${idx}`,
                  name: `Recurso ${idx}`,
                  format: "CSV",
                  url: `https://www.tesourotransparente.gov.br/r/${idx}.csv`,
                })),
              },
            ],
          },
        })
      )
      .mockResolvedValueOnce(mockJsonResponse({ success: false }));
    vi.stubGlobal("fetch", fetchMock);

    const ckanRes = await executeTool(
      "tesouro_operacoes_credito_ckan",
      { modo: "ckan_datasets", query: "divida publica", limit: 5 },
      { apiConfig: API_CONFIG, cache }
    );
    expect(ckanRes.ok).toBe(true);
    const data = ckanRes.data as {
      query: string;
      total_count: number;
      items: Array<{ notes: string; resources: unknown[]; organization: string }>;
    };
    expect(data.query).toBe("divida publica");
    expect(data.total_count).toBe(1);
    expect(data.items[0].organization).toBe("Secretaria do Tesouro Nacional");
    expect(data.items[0].resources).toHaveLength(10);
    expect(data.items[0].notes.length).toBeLessThanOrEqual(500);

    // Cached repeat
    const cachedCkan = await executeTool(
      "tesouro_operacoes_credito_ckan",
      { modo: "ckan_datasets", query: "divida publica", limit: 5 },
      { apiConfig: API_CONFIG, cache }
    );
    expect(cachedCkan.ok).toBe(true);
    expect((cachedCkan.data as { cached: boolean }).cached).toBe(true);

    // Invalid CKAN envelope (success=false)
    const badCkan = await executeTool(
      "tesouro_operacoes_credito_ckan",
      { modo: "ckan_datasets", query: "falha" },
      { apiConfig: API_CONFIG, cache }
    );
    expect(badCkan.ok).toBe(false);
    expect(badCkan.error).toContain("Malformed Tesouro Transparente CKAN");
  });
});
