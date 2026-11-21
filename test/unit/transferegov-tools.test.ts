import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryCache } from "../../lib/core/cache.js";
import { resetCircuitBreakers } from "../../lib/core/http-client.js";
import { executeTool } from "../../lib/core/tools.js";
import { HOMONYM_HUMAN_REVIEW_NOTICE } from "../../lib/shared/compliance-notices.js";
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

describe("Transferegov Tools", () => {
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

  it("strips PostgREST operator characters and includes LGPD notice on emendas especiais", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockJsonResponse([
        {
          id_plano_acao: 101,
          ano_plano_acao: 2024,
          uf_beneficiario_plano_acao: "MG",
          nome_parlamentar_emenda_plano_acao: "SILVA",
        },
      ])
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await executeTool(
      "transferegov_emendas_especiais",
      {
        recurso: "plano_acao_especial",
        ano: 2024,
        uf: "mg",
        cnpj_beneficiario: "18.715.838/0001-67",
        nome_parlamentar: "Silva,(or=1)*%",
        numero_emenda: "202412340001",
      },
      { apiConfig: API_CONFIG, cache }
    );

    expect(res.ok).toBe(true);
    const calledUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(calledUrl.pathname).toBe("/transferenciasespeciais/plano_acao_especial");
    expect(calledUrl.searchParams.get("nome_parlamentar_emenda_plano_acao")).toBe("ilike.*Silva or=1*");
    expect(calledUrl.searchParams.get("cnpj_beneficiario_plano_acao")).toBe("eq.18715838000167");
    expect(calledUrl.searchParams.get("uf_beneficiario_plano_acao")).toBe("eq.MG");

    const data = res.data as { lgpd_notice?: string; api_scope_note?: string };
    expect(data.lgpd_notice).toBe(HOMONYM_HUMAN_REVIEW_NOTICE);
    expect(data.api_scope_note).toContain("/maisbrasil");
  });

  it("supports all 5 emendas especiais resources and rejects unsupported resource filters cleanly", async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      mockJsonResponse([{ id_op_ob: 999, valor_pagamento: 50000 }])
    );
    vi.stubGlobal("fetch", fetchMock);

    // Reject id_plano_acao on ordem_pagamento_ordem_bancaria_especial without calling fetch
    const badOpOb = await executeTool(
      "transferegov_emendas_especiais",
      { recurso: "ordem_pagamento_ordem_bancaria_especial", id_plano_acao: 10 },
      { apiConfig: API_CONFIG, cache }
    );
    expect(badOpOb.ok).toBe(false);
    expect(badOpOb.error).toContain("not supported");
    expect(fetchMock).not.toHaveBeenCalled();

    // Valid query without unsupported params succeeds and omits lgpd_notice when no personal/parlamentar name fields exist
    const validOpOb = await executeTool(
      "transferegov_emendas_especiais",
      { recurso: "ordem_pagamento_ordem_bancaria_especial", limit: 5, offset: 10 },
      { apiConfig: API_CONFIG, cache }
    );
    expect(validOpOb.ok).toBe(true);
    expect((validOpOb.data as { lgpd_notice?: string }).lgpd_notice).toBeUndefined();

    const execRes = await executeTool(
      "transferegov_emendas_especiais",
      { recurso: "executor_especial", id_plano_acao: 12, cnpj_beneficiario: "12345678000199" },
      { apiConfig: API_CONFIG, cache }
    );
    expect(execRes.ok).toBe(true);
    expect(String(fetchMock.mock.calls[1][0])).toContain("cnpj_executor=eq.12345678000199");

    const empRes = await executeTool(
      "transferegov_emendas_especiais",
      { recurso: "empenho_especial", id_plano_acao: 12, uf: "BA" },
      { apiConfig: API_CONFIG, cache }
    );
    expect(empRes.ok).toBe(true);
    expect(String(fetchMock.mock.calls[2][0])).toContain("uf_beneficiario_empenho=eq.BA");

    const rgRes = await executeTool(
      "transferegov_emendas_especiais",
      { recurso: "relatorio_gestao_novo_especial", id_plano_acao: 12 },
      { apiConfig: API_CONFIG, cache }
    );
    expect(rgRes.ok).toBe(true);
    expect(String(fetchMock.mock.calls[3][0])).toContain("relatorio_gestao_novo_especial?id_plano_acao=eq.12");
  });

  it("maps fundoafundo and ted endpoints accurately, caches non-empty arrays, and guards malformed responses", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("fundoafundo/programa")) {
        return mockJsonResponse([{ id_programa: 77, sigla_orgao_superior_programa: "MEC" }]);
      }
      if (url.includes("ted/nota_credito")) {
        return mockJsonResponse({ not_an_array: true });
      }
      if (url.includes("ted/plano_acao")) {
        return mockJsonResponse([{ id_plano_acao: 55, sigla_unidade_descentralizada: "UFMG" }]);
      }
      return mockJsonResponse([]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const ffProg = await executeTool(
      "transferegov_fundo_a_fundo_ted",
      { modalidade: "fundoafundo", recurso: "programa", uf: "sp", sigla_unidade: "MEC%()" },
      { apiConfig: API_CONFIG, cache }
    );
    expect(ffProg.ok).toBe(true);
    expect(String(fetchMock.mock.calls[0][0])).toContain("sigla_orgao_superior_programa=ilike.*MEC*");

    // Second identical query hits cache
    const ffProgCached = await executeTool(
      "transferegov_fundo_a_fundo_ted",
      { modalidade: "fundoafundo", recurso: "programa", uf: "SP", sigla_unidade: "MEC%()" },
      { apiConfig: API_CONFIG, cache }
    );
    expect(ffProgCached.ok).toBe(true);
    expect((ffProgCached.data as { cached: boolean }).cached).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const tedPlano = await executeTool(
      "transferegov_fundo_a_fundo_ted",
      { modalidade: "ted", recurso: "plano_acao", id_programa: 10, sigla_unidade: "UFMG" },
      { apiConfig: API_CONFIG, cache }
    );
    expect(tedPlano.ok).toBe(true);
    expect(String(fetchMock.mock.calls[1][0])).toContain("sigla_unidade_descentralizada=ilike.*UFMG*");

    const malformedTed = await executeTool(
      "transferegov_fundo_a_fundo_ted",
      { modalidade: "ted", recurso: "nota_credito", id_plano_acao: 55 },
      { apiConfig: API_CONFIG, cache }
    );
    expect(malformedTed.ok).toBe(false);
    expect(malformedTed.error).toContain("expected JSON array");

    const rejectedFilter = await executeTool(
      "transferegov_fundo_a_fundo_ted",
      { modalidade: "ted", recurso: "plano_acao", uf: "RJ" },
      { apiConfig: API_CONFIG, cache }
    );
    expect(rejectedFilter.ok).toBe(false);
    expect(rejectedFilter.error).toContain("not supported");

    // Exercise fundoafundo/empenho, fundoafundo/relatorio_gestao, ted/programa, ted/termo_execucao & HTTP 500
    const ffEmpenho = await executeTool(
      "transferegov_fundo_a_fundo_ted",
      { modalidade: "fundoafundo", recurso: "empenho", id_plano_acao: 1, cnpj_recebedor: "12345678000199" },
      { apiConfig: API_CONFIG, cache }
    );
    expect(ffEmpenho.ok).toBe(true);
    expect(String(fetchMock.mock.calls[3][0])).toContain("cnpj_favorecido_empenho=eq.12345678000199");

    const ffRg = await executeTool(
      "transferegov_fundo_a_fundo_ted",
      { modalidade: "fundoafundo", recurso: "relatorio_gestao", id_plano_acao: 2 },
      { apiConfig: API_CONFIG, cache }
    );
    expect(ffRg.ok).toBe(true);

    const tedProg = await executeTool(
      "transferegov_fundo_a_fundo_ted",
      { modalidade: "ted", recurso: "programa", id_programa: 9, sigla_unidade: "MEC" },
      { apiConfig: API_CONFIG, cache }
    );
    expect(tedProg.ok).toBe(true);

    const tedTermo = await executeTool(
      "transferegov_fundo_a_fundo_ted",
      { modalidade: "ted", recurso: "termo_execucao", id_plano_acao: 10 },
      { apiConfig: API_CONFIG, cache }
    );
    expect(tedTermo.ok).toBe(true);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockJsonResponse({ err: "down" }, 404)));
    const errResp = await executeTool(
      "transferegov_fundo_a_fundo_ted",
      { modalidade: "ted", recurso: "termo_execucao", id_plano_acao: 99 },
      { apiConfig: API_CONFIG, cache }
    );
    expect(errResp.ok).toBe(false);
  });
});
