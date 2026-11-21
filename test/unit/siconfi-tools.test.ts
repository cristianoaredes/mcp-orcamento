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

describe("SICONFI Tools (5 ORDS tools)", () => {
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

  it("siconfi_entes trims capital, applies accent-insensitive and field filters, and caches non-empty list", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({
        items: [
          {
            cod_ibge: 3550308,
            ente: "São Paulo",
            capital: "1  ",
            uf: "SP",
            esfera: "M",
            cnpj: "46.395.000/0001-39",
          },
          {
            cod_ibge: 3509502,
            ente: "Campinas",
            capital: "0  ",
            uf: "SP",
            esfera: "M",
            cnpj: "51885242000140",
          },
          {
            cod_ibge: 1,
            ente: "União",
            capital: "0  ",
            uf: null,
            esfera: "U",
            cnpj: "00394460000141",
          },
        ],
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const first = await executeTool(
      "siconfi_entes",
      { uf: "sp", nome: "sao paulo", capital_only: true },
      { apiConfig: API_CONFIG, cache }
    );
    expect(first.ok).toBe(true);
    const data1 = first.data as {
      total_matched: number;
      cached: boolean;
      items: Array<{ capital: string; ente: string }>;
    };
    expect(data1.cached).toBe(false);
    expect(data1.total_matched).toBe(1);
    expect(data1.items[0].ente).toBe("São Paulo");
    expect(data1.items[0].capital).toBe("1");

    // Second call with different filter hits cache with zero extra fetch
    const second = await executeTool(
      "siconfi_entes",
      { cnpj: "51885242000140", cod_ibge: "3509502", esfera: "M" },
      { apiConfig: API_CONFIG, cache }
    );
    expect(second.ok).toBe(true);
    const data2 = second.data as { cached: boolean; items: Array<{ ente: string; capital: string }> };
    expect(data2.cached).toBe(true);
    expect(data2.items[0].ente).toBe("Campinas");
    expect(data2.items[0].capital).toBe("0");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never caches empty responses, malformed payloads, or HTTP errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockJsonResponse({ items: [] }))
      .mockResolvedValueOnce(mockJsonResponse({ unexpected: true }))
      .mockResolvedValueOnce(mockJsonResponse({ error: "bad" }, 404))
      .mockResolvedValueOnce(
        mockJsonResponse({
          items: [{ cod_ibge: 1, ente: "União", capital: "0 ", uf: "", esfera: "U", cnpj: "00394460000141" }],
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const emptyRes = await executeTool("siconfi_entes", { esfera: "U" }, { apiConfig: API_CONFIG, cache });
    expect(emptyRes.ok).toBe(true);
    expect((emptyRes.data as { total_matched: number }).total_matched).toBe(0);

    const malformedRes = await executeTool("siconfi_entes", { esfera: "U" }, { apiConfig: API_CONFIG, cache });
    expect(malformedRes.ok).toBe(false);

    const httpErrRes = await executeTool("siconfi_entes", { esfera: "U" }, { apiConfig: API_CONFIG, cache });
    expect(httpErrRes.ok).toBe(false);

    const recoveredRes = await executeTool("siconfi_entes", { esfera: "U" }, { apiConfig: API_CONFIG, cache });
    expect(recoveredRes.ok).toBe(true);
    expect((recoveredRes.data as { items: unknown[] }).items).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("siconfi_extrato_entregas filters by entregavel and caches", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse({
        items: [
          { exercicio: 2024, entregavel: "RREO", status_relatorio: "HO" },
          { exercicio: 2024, entregavel: "Declaração de Contas Anuais (DCA)", status_relatorio: "HO" },
        ],
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await executeTool(
      "siconfi_extrato_entregas",
      { id_ente: 3550308, an_referencia: 2024, entregavel: "dca", limit: 10 },
      { apiConfig: API_CONFIG, cache }
    );
    expect(res.ok).toBe(true);
    const data = res.data as { total_matched: number; items: Array<{ entregavel: string }> };
    expect(data.total_matched).toBe(1);
    expect(data.items[0].entregavel).toContain("DCA");
    expect(fetchMock.mock.calls[0][0]).toContain("siconfi/tt/extrato_entregas?id_ente=3550308&an_referencia=2024");
  });

  it("siconfi_rreo, siconfi_rgf, and siconfi_dca compute anexos_disponiveis, filter local accounts, and paginate", async () => {
    const rreoItems = [
      { anexo: "RREO-Anexo 01", cod_conta: "ReceitasCorrentes", conta: "Receitas Correntes", valor: 100 },
      { anexo: "RREO-Anexo 01", cod_conta: "Despesas", conta: "Despesas Correntes", valor: 90 },
      { anexo: "RREO-Anexo 02", cod_conta: "Educacao", conta: "Manutenção do Ensino", valor: 50 },
    ];
    const rgfItems = [
      { anexo: "RGF-Anexo 01", cod_conta: "DespesaPessoal", conta: "Despesa Total com Pessoal", valor: 42 },
    ];
    const dcaItems = [
      { anexo: "DCA-Anexo I-AB", cod_conta: "Ativo", conta: "Ativo Circulante", valor: 300 },
      { anexo: "DCA-Anexo I-C", cod_conta: "Receita", conta: "Receita Orçamentária", valor: 200 },
    ];

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("siconfi/tt/rreo")) return mockJsonResponse({ items: rreoItems });
      if (url.includes("siconfi/tt/rgf")) return mockJsonResponse({ items: rgfItems });
      if (url.includes("siconfi/tt/dca")) return mockJsonResponse({ items: dcaItems });
      return mockJsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    // Partial no_anexo ("Anexo 01") does not pass non-prefix no_anexo upstream, returning full anexos_disponiveis
    const rreo = await executeTool(
      "siconfi_rreo",
      {
        id_ente: 3550308,
        an_exercicio: 2024,
        nr_periodo: 6,
        no_anexo: "Anexo 01",
        filtro_conta: "correntes",
        page: 2,
        limit: 1,
      },
      { apiConfig: API_CONFIG, cache }
    );
    expect(rreo.ok).toBe(true);
    const rreoData = rreo.data as {
      anexos_disponiveis: string[];
      total_matched: number;
      total_pages: number;
      returned: number;
      items: Array<{ cod_conta: string }>;
    };
    expect(rreoData.anexos_disponiveis).toEqual(["RREO-Anexo 01", "RREO-Anexo 02"]);
    expect(rreoData.total_matched).toBe(2);
    expect(rreoData.total_pages).toBe(2);
    expect(rreoData.returned).toBe(1);
    expect(rreoData.items[0].cod_conta).toBe("Despesas");

    // Exact prefix passes upstream no_anexo
    const rgf = await executeTool(
      "siconfi_rgf",
      {
        id_ente: 3550308,
        an_exercicio: 2024,
        nr_periodo: 3,
        no_anexo: "RGF-Anexo 01",
      },
      { apiConfig: API_CONFIG, cache }
    );
    expect(rgf.ok).toBe(true);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("no_anexo=RGF-Anexo"))).toBe(true);

    const dca = await executeTool(
      "siconfi_dca",
      { id_ente: 3550308, an_exercicio: 2024, no_anexo: "DCA-Anexo I-AB", filtro_conta: "Ativo" },
      { apiConfig: API_CONFIG, cache }
    );
    expect(dca.ok).toBe(true);
    const dcaData = dca.data as { anexos_disponiveis: string[]; items: Array<{ cod_conta: string }> };
    expect(dcaData.anexos_disponiveis).toEqual(["DCA-Anexo I-AB", "DCA-Anexo I-C"]);
    expect(dcaData.items[0].cod_conta).toBe("Ativo");

    // Cache hit for exact RREO prefix and error handling for RREO/RGF/DCA/extrato
    await executeTool(
      "siconfi_rreo",
      { id_ente: 3550308, an_exercicio: 2024, nr_periodo: 6, no_anexo: "RREO-Anexo 01" },
      { apiConfig: API_CONFIG, cache }
    );
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => mockJsonResponse({ err: 1 }, 404)));
    expect(
      (await executeTool("siconfi_extrato_entregas", { id_ente: 1, an_referencia: 2023 }, { apiConfig: API_CONFIG, cache })).ok
    ).toBe(false);
    expect(
      (await executeTool("siconfi_rreo", { id_ente: 1, an_exercicio: 2023, nr_periodo: 1 }, { apiConfig: API_CONFIG, cache })).ok
    ).toBe(false);
    expect(
      (await executeTool("siconfi_rgf", { id_ente: 1, an_exercicio: 2023, nr_periodo: 1 }, { apiConfig: API_CONFIG, cache })).ok
    ).toBe(false);
    expect(
      (await executeTool("siconfi_dca", { id_ente: 1, an_exercicio: 2023 }, { apiConfig: API_CONFIG, cache })).ok
    ).toBe(false);

    // Semestral RGF rejects period 3 before hitting fetch, and lowercase no_anexo normalizes prefix
    const invalidSem = await executeTool(
      "siconfi_rgf",
      { id_ente: 3550308, an_exercicio: 2024, in_periodicidade: "S", nr_periodo: 3 },
      { apiConfig: API_CONFIG, cache }
    );
    expect(invalidSem.ok).toBe(false);
    expect(invalidSem.error).toContain("nr_periodo");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockJsonResponse({ items: [{ anexo: "RREO-Anexo 01", cod_conta: "Rec", valor: 10 }] }))
    );
    const lowerAnexo = await executeTool(
      "siconfi_rreo",
      { id_ente: 3550308, an_exercicio: 2024, nr_periodo: 1, no_anexo: "rreo-anexo 01" },
      { apiConfig: API_CONFIG, cache }
    );
    expect(lowerAnexo.ok).toBe(true);
    expect(lowerAnexo.source?.url).toContain("no_anexo=RREO-Anexo+01");
  });
});
