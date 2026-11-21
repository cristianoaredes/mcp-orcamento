/**
 * Transferegov PostgREST tools:
 * - transferegov_emendas_especiais (/transferenciasespeciais/*)
 * - transferegov_fundo_a_fundo_ted (/fundoafundo/* e /ted/*)
 *
 * Enforces PostgREST operator stripping, Swagger-verified column mapping,
 * LGPD Art. 20 homonym notice on parliamentary names, and scope notice for legacy APIs.
 * Zero `node:*` imports.
 */

import { TIMEOUTS } from "../config/timeouts.js";
import { httpJson } from "../core/http-client.js";
import type { ToolExecutionContext, ToolRegistry } from "../core/registry.js";
import {
  TOOL_INPUT_SCHEMAS,
  TransferegovEmendasEspeciaisSchema,
  TransferegovFundoFundoTedSchema,
} from "../core/tool-schemas.js";
import { UNTRUSTED_EXTERNAL_DATA_NOTICE } from "../shared/agentic-guard.js";
import { attachLgpdNotice } from "../shared/compliance-notices.js";
import {
  sanitizeExternalValue,
  sanitizePostgrestFilterTerm,
  type TransferegovEmendasEspeciaisArgs,
  type TransferegovFundoFundoTedArgs,
} from "../shared/orcamento-schemas.js";
import type { LookupResult } from "../types/index.js";

type PostgrestRow = Record<string, unknown>;

const TRANSFEREGOV_SCOPE_NOTE =
  "Escopo v0.1.0: cobre /transferenciasespeciais/*, /fundoafundo/* e /ted/*. Módulos /maisbrasil, /siconv e /obrasgov operam em APIs distintas fora deste catálogo inicial.";

function buildPostgrestUrl(
  baseUrl: string,
  relativePath: string,
  filters: Record<string, string>,
  limit: number,
  offset: number
): string {
  const url = new URL(relativePath, baseUrl);
  for (const [col, expr] of Object.entries(filters)) {
    url.searchParams.set(col, expr);
  }
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  return url.toString();
}

async function fetchPostgrestRows(
  url: string,
  cacheKey: string,
  context: ToolExecutionContext
): Promise<{
  ok: boolean;
  rows?: PostgrestRow[];
  cached?: boolean;
  error?: string;
  url: string;
}> {
  const cached = await Promise.resolve(context.cache.get<PostgrestRow[]>(cacheKey));
  if (Array.isArray(cached) && cached.length > 0) {
    return { ok: true, rows: cached, cached: true, url };
  }

  const response = await httpJson(url, {
    timeout: TIMEOUTS.HTTP_REQUEST_MS,
    headers: context.apiConfig.authHeaders,
    signal: context.signal,
    requestId: context.requestId,
  });

  if (!response.ok) {
    return {
      ok: false,
      error: response.error ?? "Failed to query Transferegov API",
      url,
    };
  }

  if (!Array.isArray(response.data)) {
    return {
      ok: false,
      error: "Malformed Transferegov PostgREST response: expected JSON array",
      url,
    };
  }

  const rows = response.data.filter(
    (item): item is PostgrestRow => typeof item === "object" && item !== null
  );

  if (rows.length > 0) {
    await Promise.resolve(context.cache.set(cacheKey, rows));
  }

  return { ok: true, rows, cached: false, url };
}

function rowContainsPersonalOrParlamentarName(row: PostgrestRow): boolean {
  return (
    "nome_parlamentar_emenda_plano_acao" in row ||
    "nome_beneficiario_plano_acao" in row ||
    "nome_beneficiario_empenho" in row ||
    "nome_executor" in row
  );
}

function validateUnsupportedParam(
  paramName: string,
  value: unknown,
  recursoLabel: string
): string | undefined {
  if (value !== undefined) {
    return `Parameter '${paramName}' is not supported by upstream Transferegov schema for '${recursoLabel}'`;
  }
  return undefined;
}

export async function handleTransferegovEmendasEspeciais(
  args: TransferegovEmendasEspeciaisArgs,
  context: ToolExecutionContext
): Promise<LookupResult> {
  let cleanParlamentar: string | undefined;
  if (args.nome_parlamentar !== undefined) {
    cleanParlamentar = sanitizePostgrestFilterTerm(args.nome_parlamentar);
    if (cleanParlamentar.length < 2) {
      return {
        ok: false,
        error:
          "Validation error: nome_parlamentar must contain at least 2 valid search characters after stripping PostgREST operators",
      };
    }
  }

  const filters: Record<string, string> = {};
  const recurso = args.recurso;
  let unsupportedError: string | undefined;

  if (recurso === "plano_acao_especial") {
    if (args.id_plano_acao !== undefined) filters.id_plano_acao = `eq.${args.id_plano_acao}`;
    if (args.ano !== undefined) filters.ano_plano_acao = `eq.${args.ano}`;
    if (args.uf !== undefined) filters.uf_beneficiario_plano_acao = `eq.${args.uf}`;
    if (args.cnpj_beneficiario !== undefined) {
      filters.cnpj_beneficiario_plano_acao = `eq.${args.cnpj_beneficiario}`;
    }
    if (cleanParlamentar !== undefined) {
      filters.nome_parlamentar_emenda_plano_acao = `ilike.*${cleanParlamentar}*`;
    }
    if (args.numero_emenda !== undefined) {
      filters.numero_emenda_parlamentar_plano_acao = `eq.${args.numero_emenda}`;
    }
  } else if (recurso === "executor_especial") {
    unsupportedError =
      validateUnsupportedParam("ano", args.ano, recurso) ??
      validateUnsupportedParam("uf", args.uf, recurso) ??
      validateUnsupportedParam("nome_parlamentar", args.nome_parlamentar, recurso) ??
      validateUnsupportedParam("numero_emenda", args.numero_emenda, recurso);
    if (args.id_plano_acao !== undefined) filters.id_plano_acao = `eq.${args.id_plano_acao}`;
    if (args.cnpj_beneficiario !== undefined) filters.cnpj_executor = `eq.${args.cnpj_beneficiario}`;
  } else if (recurso === "empenho_especial") {
    unsupportedError =
      validateUnsupportedParam("ano", args.ano, recurso) ??
      validateUnsupportedParam("nome_parlamentar", args.nome_parlamentar, recurso) ??
      validateUnsupportedParam("numero_emenda", args.numero_emenda, recurso);
    if (args.id_plano_acao !== undefined) filters.id_plano_acao = `eq.${args.id_plano_acao}`;
    if (args.uf !== undefined) filters.uf_beneficiario_empenho = `eq.${args.uf}`;
    if (args.cnpj_beneficiario !== undefined) {
      filters.cnpj_beneficiario_empenho = `eq.${args.cnpj_beneficiario}`;
    }
  } else if (recurso === "ordem_pagamento_ordem_bancaria_especial") {
    unsupportedError =
      validateUnsupportedParam("id_plano_acao", args.id_plano_acao, recurso) ??
      validateUnsupportedParam("ano", args.ano, recurso) ??
      validateUnsupportedParam("uf", args.uf, recurso) ??
      validateUnsupportedParam("cnpj_beneficiario", args.cnpj_beneficiario, recurso) ??
      validateUnsupportedParam("nome_parlamentar", args.nome_parlamentar, recurso) ??
      validateUnsupportedParam("numero_emenda", args.numero_emenda, recurso);
  } else if (recurso === "relatorio_gestao_novo_especial") {
    unsupportedError =
      validateUnsupportedParam("ano", args.ano, recurso) ??
      validateUnsupportedParam("uf", args.uf, recurso) ??
      validateUnsupportedParam("cnpj_beneficiario", args.cnpj_beneficiario, recurso) ??
      validateUnsupportedParam("nome_parlamentar", args.nome_parlamentar, recurso) ??
      validateUnsupportedParam("numero_emenda", args.numero_emenda, recurso);
    if (args.id_plano_acao !== undefined) filters.id_plano_acao = `eq.${args.id_plano_acao}`;
  }

  if (unsupportedError) {
    return {
      ok: false,
      error: `Validation error: ${unsupportedError}`,
    };
  }

  const url = buildPostgrestUrl(
    context.apiConfig.transferegovBaseUrl,
    `transferenciasespeciais/${recurso}`,
    filters,
    args.limit,
    args.offset
  );
  const cacheKey = `transferegov:especiais:v1:${url}`;
  const fetched = await fetchPostgrestRows(url, cacheKey, context);

  if (!fetched.ok || !fetched.rows) {
    return {
      ok: false,
      error: fetched.error ?? "Failed to query Transferegov Emendas Especiais",
      source: { url: fetched.url, fetchedAt: new Date().toISOString() },
    };
  }

  const sanitizedRows = fetched.rows.map((row) => sanitizeExternalValue(row) as PostgrestRow);
  const includesPersonalOrParlamentarData =
    recurso === "plano_acao_especial" ||
    cleanParlamentar !== undefined ||
    sanitizedRows.some(rowContainsPersonalOrParlamentarName);

  const basePayload = {
    recurso,
    returned: sanitizedRows.length,
    limit: args.limit,
    offset: args.offset,
    has_more: sanitizedRows.length === args.limit,
    cached: Boolean(fetched.cached),
    items: sanitizedRows,
    api_scope_note: TRANSFEREGOV_SCOPE_NOTE,
    untrusted_data_notice: UNTRUSTED_EXTERNAL_DATA_NOTICE,
  };

  const finalPayload = includesPersonalOrParlamentarData
    ? attachLgpdNotice(basePayload)
    : basePayload;

  return {
    ok: true,
    data: finalPayload,
    source: {
      url: fetched.url,
      fetchedAt: new Date().toISOString(),
    },
  };
}

export async function handleTransferegovFundoFundoTed(
  args: TransferegovFundoFundoTedArgs,
  context: ToolExecutionContext
): Promise<LookupResult> {
  let cleanSigla: string | undefined;
  if (args.sigla_unidade !== undefined) {
    cleanSigla = sanitizePostgrestFilterTerm(args.sigla_unidade);
    if (cleanSigla.length < 2) {
      return {
        ok: false,
        error:
          "Validation error: sigla_unidade must contain at least 2 valid characters after stripping PostgREST operators",
      };
    }
  }

  const filters: Record<string, string> = {};
  const key = `${args.modalidade}/${args.recurso}`;
  let unsupportedError: string | undefined;

  if (key === "fundoafundo/programa") {
    unsupportedError =
      validateUnsupportedParam("id_plano_acao", args.id_plano_acao, key) ??
      validateUnsupportedParam("cnpj_recebedor", args.cnpj_recebedor, key);
    if (args.id_programa !== undefined) filters.id_programa = `eq.${args.id_programa}`;
    if (args.uf !== undefined) filters.uf_fundo_programa = `eq.${args.uf}`;
    if (cleanSigla !== undefined) {
      filters.sigla_orgao_superior_programa = `ilike.*${cleanSigla}*`;
    }
  } else if (key === "fundoafundo/plano_acao") {
    if (args.id_plano_acao !== undefined) filters.id_plano_acao = `eq.${args.id_plano_acao}`;
    if (args.id_programa !== undefined) filters.id_programa = `eq.${args.id_programa}`;
    if (args.uf !== undefined) filters.uf_ente_recebedor_plano_acao = `eq.${args.uf}`;
    if (args.cnpj_recebedor !== undefined) {
      filters.cnpj_ente_recebedor_plano_acao = `eq.${args.cnpj_recebedor}`;
    }
    if (cleanSigla !== undefined) {
      filters.sigla_orgao_repassador_plano_acao = `ilike.*${cleanSigla}*`;
    }
  } else if (key === "fundoafundo/empenho") {
    unsupportedError =
      validateUnsupportedParam("id_programa", args.id_programa, key) ??
      validateUnsupportedParam("uf", args.uf, key) ??
      validateUnsupportedParam("sigla_unidade", args.sigla_unidade, key);
    if (args.id_plano_acao !== undefined) filters.id_plano_acao = `eq.${args.id_plano_acao}`;
    if (args.cnpj_recebedor !== undefined) {
      filters.cnpj_favorecido_empenho = `eq.${args.cnpj_recebedor}`;
    }
  } else if (key === "fundoafundo/relatorio_gestao") {
    unsupportedError =
      validateUnsupportedParam("id_programa", args.id_programa, key) ??
      validateUnsupportedParam("uf", args.uf, key) ??
      validateUnsupportedParam("cnpj_recebedor", args.cnpj_recebedor, key) ??
      validateUnsupportedParam("sigla_unidade", args.sigla_unidade, key);
    if (args.id_plano_acao !== undefined) filters.id_plano_acao = `eq.${args.id_plano_acao}`;
  } else if (key === "ted/programa") {
    unsupportedError =
      validateUnsupportedParam("id_plano_acao", args.id_plano_acao, key) ??
      validateUnsupportedParam("uf", args.uf, key) ??
      validateUnsupportedParam("cnpj_recebedor", args.cnpj_recebedor, key);
    if (args.id_programa !== undefined) filters.id_programa = `eq.${args.id_programa}`;
    if (cleanSigla !== undefined) {
      filters.sigla_unidade_descentralizadora = `ilike.*${cleanSigla}*`;
    }
  } else if (key === "ted/plano_acao") {
    unsupportedError =
      validateUnsupportedParam("uf", args.uf, key) ??
      validateUnsupportedParam("cnpj_recebedor", args.cnpj_recebedor, key);
    if (args.id_plano_acao !== undefined) filters.id_plano_acao = `eq.${args.id_plano_acao}`;
    if (args.id_programa !== undefined) filters.id_programa = `eq.${args.id_programa}`;
    if (cleanSigla !== undefined) {
      filters.sigla_unidade_descentralizada = `ilike.*${cleanSigla}*`;
    }
  } else if (key === "ted/termo_execucao" || key === "ted/nota_credito") {
    unsupportedError =
      validateUnsupportedParam("id_programa", args.id_programa, key) ??
      validateUnsupportedParam("uf", args.uf, key) ??
      validateUnsupportedParam("cnpj_recebedor", args.cnpj_recebedor, key) ??
      validateUnsupportedParam("sigla_unidade", args.sigla_unidade, key);
    if (args.id_plano_acao !== undefined) filters.id_plano_acao = `eq.${args.id_plano_acao}`;
  }

  if (unsupportedError) {
    return {
      ok: false,
      error: `Validation error: ${unsupportedError}`,
    };
  }

  const url = buildPostgrestUrl(
    context.apiConfig.transferegovBaseUrl,
    key,
    filters,
    args.limit,
    args.offset
  );
  const cacheKey = `transferegov:ff_ted:v1:${url}`;
  const fetched = await fetchPostgrestRows(url, cacheKey, context);

  if (!fetched.ok || !fetched.rows) {
    return {
      ok: false,
      error: fetched.error ?? "Failed to query Transferegov Fundo a Fundo / TED",
      source: { url: fetched.url, fetchedAt: new Date().toISOString() },
    };
  }

  const sanitizedRows = fetched.rows.map((row) => sanitizeExternalValue(row));

  return {
    ok: true,
    data: {
      modalidade: args.modalidade,
      recurso: args.recurso,
      returned: sanitizedRows.length,
      limit: args.limit,
      offset: args.offset,
      has_more: sanitizedRows.length === args.limit,
      cached: Boolean(fetched.cached),
      items: sanitizedRows,
      api_scope_note: TRANSFEREGOV_SCOPE_NOTE,
      untrusted_data_notice: UNTRUSTED_EXTERNAL_DATA_NOTICE,
    },
    source: {
      url: fetched.url,
      fetchedAt: new Date().toISOString(),
    },
  };
}

export function registerTransferegovTools(registry: ToolRegistry): void {
  registry.register({
    name: "transferegov_emendas_especiais",
    description:
      "Consulta Transferências Especiais (Emendas Pix / RP9-RP6) no Transferegov (/transferenciasespeciais/*): planos de ação, executores, empenhos, ordens de pagamento/bancárias e relatórios de gestão.",
    inputSchema: TOOL_INPUT_SCHEMAS.transferegov_emendas_especiais,
    schema: TransferegovEmendasEspeciaisSchema,
    handler: handleTransferegovEmendasEspeciais,
  });

  registry.register({
    name: "transferegov_fundo_a_fundo_ted",
    description:
      "Consulta transferências Fundo a Fundo (/fundoafundo/*) e Termos de Execução Descentralizada (/ted/*) no Transferegov: programas, planos de ação, empenhos, relatórios de gestão, termos e notas de crédito.",
    inputSchema: TOOL_INPUT_SCHEMAS.transferegov_fundo_a_fundo_ted,
    schema: TransferegovFundoFundoTedSchema,
    handler: handleTransferegovFundoFundoTed,
  });
}
