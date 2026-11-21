/**
 * SICONFI tools (Tesouro Nacional ORDS API):
 * - siconfi_entes
 * - siconfi_extrato_entregas
 * - siconfi_rreo
 * - siconfi_rgf
 * - siconfi_dca
 *
 * Zero `node:*` imports for Cloudflare Workers compatibility.
 */

import { TIMEOUTS } from "../config/timeouts.js";
import { httpJson } from "../core/http-client.js";
import type { ToolExecutionContext, ToolRegistry } from "../core/registry.js";
import {
  SiconfiDcaSchema,
  SiconfiEntesSchema,
  SiconfiExtratoEntregasSchema,
  SiconfiRgfSchema,
  SiconfiRreoSchema,
  TOOL_INPUT_SCHEMAS,
} from "../core/tool-schemas.js";
import { UNTRUSTED_EXTERNAL_DATA_NOTICE } from "../shared/agentic-guard.js";
import {
  normalizeSearchText,
  sanitizeExternalValue,
  type SiconfiDcaArgs,
  type SiconfiEntesArgs,
  type SiconfiExtratoEntregasArgs,
  type SiconfiRgfArgs,
  type SiconfiRreoArgs,
} from "../shared/orcamento-schemas.js";
import type { LookupResult } from "../types/index.js";

type OrdsRecord = Record<string, unknown>;

interface OrdsFetchResult {
  ok: boolean;
  items?: OrdsRecord[];
  cached?: boolean;
  error?: string;
  url: string;
}

function buildOrdsUrl(
  baseUrl: string,
  relativePath: string,
  params?: Record<string, string | number | undefined>
): string {
  const url = new URL(relativePath, baseUrl);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && String(value).length > 0) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

async function fetchOrdsItemsWithCache(
  url: string,
  cacheKey: string,
  context: ToolExecutionContext
): Promise<OrdsFetchResult> {
  const cachedItems = await Promise.resolve(context.cache.get<OrdsRecord[]>(cacheKey));
  if (Array.isArray(cachedItems) && cachedItems.length > 0) {
    return { ok: true, items: cachedItems, cached: true, url };
  }

  const response = await httpJson(url, {
    timeout: TIMEOUTS.ORDS_REQUEST_MS,
    headers: context.apiConfig.authHeaders,
    signal: context.signal,
    requestId: context.requestId,
  });

  if (!response.ok) {
    return {
      ok: false,
      error: response.error ?? "Failed to query SICONFI ORDS API",
      url,
    };
  }

  const payload = response.data;
  if (
    typeof payload !== "object" ||
    payload === null ||
    !Array.isArray((payload as { items?: unknown }).items)
  ) {
    return {
      ok: false,
      error: "Malformed SICONFI ORDS response: expected object with items array",
      url,
    };
  }

  const items = (payload as { items: unknown[] }).items.filter(
    (entry): entry is OrdsRecord => typeof entry === "object" && entry !== null
  );

  // Never cache empty or failed responses
  if (items.length > 0) {
    await Promise.resolve(context.cache.set(cacheKey, items));
  }

  return { ok: true, items, cached: false, url };
}

function collectAvailableAnnexes(items: OrdsRecord[]): string[] {
  const seen = new Set<string>();
  for (const item of items) {
    const raw = item.anexo;
    if (typeof raw === "string" && raw.trim().length > 0) {
      seen.add(raw.trim());
    }
  }
  return Array.from(seen).sort();
}

function filterAndPaginateReport(
  items: OrdsRecord[],
  options: {
    noAnexo?: string;
    filtroConta?: string;
    page: number;
    limit: number;
  }
) {
  const anexosDisponiveis = collectAvailableAnnexes(items);
  const normalizedAnexo = options.noAnexo ? normalizeSearchText(options.noAnexo) : undefined;
  const normalizedConta = options.filtroConta
    ? normalizeSearchText(options.filtroConta)
    : undefined;

  const filtered = items.filter((item) => {
    if (normalizedAnexo) {
      const anexoText = normalizeSearchText(String(item.anexo ?? ""));
      if (!anexoText.includes(normalizedAnexo)) {
        return false;
      }
    }
    if (normalizedConta) {
      const contaText = normalizeSearchText(String(item.conta ?? ""));
      const codContaText = normalizeSearchText(String(item.cod_conta ?? ""));
      if (!contaText.includes(normalizedConta) && !codContaText.includes(normalizedConta)) {
        return false;
      }
    }
    return true;
  });

  const offset = (options.page - 1) * options.limit;
  const paginated = filtered.slice(offset, offset + options.limit);
  const sanitizedItems = paginated.map((item) => sanitizeExternalValue(item));

  return {
    anexos_disponiveis: anexosDisponiveis,
    total_matched: filtered.length,
    page: options.page,
    limit: options.limit,
    total_pages: Math.max(1, Math.ceil(filtered.length / options.limit)),
    has_more: offset + paginated.length < filtered.length,
    returned: sanitizedItems.length,
    items: sanitizedItems,
  };
}

export async function handleSiconfiEntes(
  args: SiconfiEntesArgs,
  context: ToolExecutionContext
): Promise<LookupResult> {
  const url = buildOrdsUrl(context.apiConfig.tesouroOrdsBaseUrl, "siconfi/tt/entes");
  const cacheKey = `siconfi:entes:v1:${context.apiConfig.tesouroOrdsBaseUrl}`;
  const fetched = await fetchOrdsItemsWithCache(url, cacheKey, context);

  if (!fetched.ok || !fetched.items) {
    return {
      ok: false,
      error: fetched.error ?? "Failed to query SICONFI entes",
      source: { url: fetched.url, fetchedAt: new Date().toISOString() },
    };
  }

  const normalizedNome = args.nome ? normalizeSearchText(args.nome) : undefined;

  const matched = fetched.items.filter((item) => {
    if (args.cod_ibge !== undefined) {
      if (String(item.cod_ibge ?? "").trim() !== args.cod_ibge) {
        return false;
      }
    }
    if (args.cnpj !== undefined) {
      const itemCnpj = String(item.cnpj ?? "").replace(/\D/g, "");
      if (itemCnpj !== args.cnpj) {
        return false;
      }
    }
    if (args.uf !== undefined) {
      if (String(item.uf ?? "").trim().toUpperCase() !== args.uf) {
        return false;
      }
    }
    if (args.esfera !== undefined) {
      if (String(item.esfera ?? "").trim().toUpperCase() !== args.esfera) {
        return false;
      }
    }
    if (args.capital_only === true) {
      if (String(item.capital ?? "").trim() !== "1") {
        return false;
      }
    }
    if (normalizedNome !== undefined) {
      const enteText = normalizeSearchText(String(item.ente ?? ""));
      if (!enteText.includes(normalizedNome)) {
        return false;
      }
    }
    return true;
  });

  const sliced = matched.slice(0, args.limit).map((item) => {
    const clean = sanitizeExternalValue(item) as OrdsRecord;
    if (typeof clean.capital === "string") {
      clean.capital = clean.capital.trim();
    }
    return clean;
  });

  return {
    ok: true,
    data: {
      total_matched: matched.length,
      returned: sliced.length,
      cached: Boolean(fetched.cached),
      items: sliced,
      untrusted_data_notice: UNTRUSTED_EXTERNAL_DATA_NOTICE,
    },
    source: {
      url: fetched.url,
      fetchedAt: new Date().toISOString(),
    },
  };
}

export async function handleSiconfiExtratoEntregas(
  args: SiconfiExtratoEntregasArgs,
  context: ToolExecutionContext
): Promise<LookupResult> {
  const url = buildOrdsUrl(context.apiConfig.tesouroOrdsBaseUrl, "siconfi/tt/extrato_entregas", {
    id_ente: args.id_ente,
    an_referencia: args.an_referencia,
  });
  const cacheKey = `siconfi:extrato:v1:${args.id_ente}:${args.an_referencia}:${context.apiConfig.tesouroOrdsBaseUrl}`;
  const fetched = await fetchOrdsItemsWithCache(url, cacheKey, context);

  if (!fetched.ok || !fetched.items) {
    return {
      ok: false,
      error: fetched.error ?? "Failed to query SICONFI extrato de entregas",
      source: { url: fetched.url, fetchedAt: new Date().toISOString() },
    };
  }

  const normalizedFilter = args.entregavel
    ? normalizeSearchText(args.entregavel)
    : undefined;

  const filtered = normalizedFilter
    ? fetched.items.filter((item) =>
        normalizeSearchText(String(item.entregavel ?? "")).includes(normalizedFilter)
      )
    : fetched.items;

  const sliced = filtered.slice(0, args.limit).map((item) => sanitizeExternalValue(item));

  return {
    ok: true,
    data: {
      id_ente: args.id_ente,
      an_referencia: args.an_referencia,
      total_matched: filtered.length,
      returned: sliced.length,
      cached: Boolean(fetched.cached),
      items: sliced,
      untrusted_data_notice: UNTRUSTED_EXTERNAL_DATA_NOTICE,
    },
    source: {
      url: fetched.url,
      fetchedAt: new Date().toISOString(),
    },
  };
}

function isExactOrdsAnexoPrefix(noAnexo: string | undefined, prefix: string): boolean {
  return typeof noAnexo === "string" && noAnexo.toUpperCase().startsWith(prefix);
}

export async function handleSiconfiRreo(
  args: SiconfiRreoArgs,
  context: ToolExecutionContext
): Promise<LookupResult> {
  const upstreamAnexo = isExactOrdsAnexoPrefix(args.no_anexo, "RREO-")
    ? args.no_anexo
    : undefined;
  const url = buildOrdsUrl(context.apiConfig.tesouroOrdsBaseUrl, "siconfi/tt/rreo", {
    an_exercicio: args.an_exercicio,
    nr_periodo: args.nr_periodo,
    co_tipo_demonstrativo: args.co_tipo_demonstrativo,
    id_ente: args.id_ente,
    no_anexo: upstreamAnexo,
  });
  const cacheKey = `siconfi:rreo:v1:${args.id_ente}:${args.an_exercicio}:${args.nr_periodo}:${args.co_tipo_demonstrativo}:${upstreamAnexo ?? "*"}:${context.apiConfig.tesouroOrdsBaseUrl}`;
  const fetched = await fetchOrdsItemsWithCache(url, cacheKey, context);

  if (!fetched.ok || !fetched.items) {
    return {
      ok: false,
      error: fetched.error ?? "Failed to query SICONFI RREO",
      source: { url: fetched.url, fetchedAt: new Date().toISOString() },
    };
  }

  const paged = filterAndPaginateReport(fetched.items, {
    noAnexo: args.no_anexo,
    filtroConta: args.filtro_conta,
    page: args.page,
    limit: args.limit,
  });

  return {
    ok: true,
    data: {
      demonstrativo: args.co_tipo_demonstrativo,
      id_ente: args.id_ente,
      an_exercicio: args.an_exercicio,
      nr_periodo: args.nr_periodo,
      cached: Boolean(fetched.cached),
      ...paged,
      untrusted_data_notice: UNTRUSTED_EXTERNAL_DATA_NOTICE,
    },
    source: {
      url: fetched.url,
      fetchedAt: new Date().toISOString(),
    },
  };
}

export async function handleSiconfiRgf(
  args: SiconfiRgfArgs,
  context: ToolExecutionContext
): Promise<LookupResult> {
  const upstreamAnexo = isExactOrdsAnexoPrefix(args.no_anexo, "RGF-")
    ? args.no_anexo
    : undefined;
  const url = buildOrdsUrl(context.apiConfig.tesouroOrdsBaseUrl, "siconfi/tt/rgf", {
    an_exercicio: args.an_exercicio,
    in_periodicidade: args.in_periodicidade,
    nr_periodo: args.nr_periodo,
    co_poder: args.co_poder,
    co_tipo_demonstrativo: args.co_tipo_demonstrativo,
    id_ente: args.id_ente,
    no_anexo: upstreamAnexo,
  });
  const cacheKey = `siconfi:rgf:v1:${args.id_ente}:${args.an_exercicio}:${args.in_periodicidade}:${args.nr_periodo}:${args.co_poder}:${args.co_tipo_demonstrativo}:${upstreamAnexo ?? "*"}:${context.apiConfig.tesouroOrdsBaseUrl}`;
  const fetched = await fetchOrdsItemsWithCache(url, cacheKey, context);

  if (!fetched.ok || !fetched.items) {
    return {
      ok: false,
      error: fetched.error ?? "Failed to query SICONFI RGF",
      source: { url: fetched.url, fetchedAt: new Date().toISOString() },
    };
  }

  const paged = filterAndPaginateReport(fetched.items, {
    noAnexo: args.no_anexo,
    filtroConta: args.filtro_conta,
    page: args.page,
    limit: args.limit,
  });

  return {
    ok: true,
    data: {
      demonstrativo: args.co_tipo_demonstrativo,
      id_ente: args.id_ente,
      an_exercicio: args.an_exercicio,
      in_periodicidade: args.in_periodicidade,
      nr_periodo: args.nr_periodo,
      co_poder: args.co_poder,
      cached: Boolean(fetched.cached),
      ...paged,
      untrusted_data_notice: UNTRUSTED_EXTERNAL_DATA_NOTICE,
    },
    source: {
      url: fetched.url,
      fetchedAt: new Date().toISOString(),
    },
  };
}

export async function handleSiconfiDca(
  args: SiconfiDcaArgs,
  context: ToolExecutionContext
): Promise<LookupResult> {
  const upstreamAnexo = isExactOrdsAnexoPrefix(args.no_anexo, "DCA-")
    ? args.no_anexo
    : undefined;
  const url = buildOrdsUrl(context.apiConfig.tesouroOrdsBaseUrl, "siconfi/tt/dca", {
    an_exercicio: args.an_exercicio,
    id_ente: args.id_ente,
    no_anexo: upstreamAnexo,
  });
  const cacheKey = `siconfi:dca:v1:${args.id_ente}:${args.an_exercicio}:${upstreamAnexo ?? "*"}:${context.apiConfig.tesouroOrdsBaseUrl}`;
  const fetched = await fetchOrdsItemsWithCache(url, cacheKey, context);

  if (!fetched.ok || !fetched.items) {
    return {
      ok: false,
      error: fetched.error ?? "Failed to query SICONFI DCA",
      source: { url: fetched.url, fetchedAt: new Date().toISOString() },
    };
  }

  const paged = filterAndPaginateReport(fetched.items, {
    noAnexo: args.no_anexo,
    filtroConta: args.filtro_conta,
    page: args.page,
    limit: args.limit,
  });

  return {
    ok: true,
    data: {
      demonstrativo: "DCA",
      id_ente: args.id_ente,
      an_exercicio: args.an_exercicio,
      cached: Boolean(fetched.cached),
      ...paged,
      untrusted_data_notice: UNTRUSTED_EXTERNAL_DATA_NOTICE,
    },
    source: {
      url: fetched.url,
      fetchedAt: new Date().toISOString(),
    },
  };
}

export function registerSiconfiTools(registry: ToolRegistry): void {
  registry.register({
    name: "siconfi_entes",
    description:
      "Lista e filtra entes federativos brasileiros no SICONFI (códigos IBGE, CNPJ, UF, esfera U/E/M/D, capitais e população) para descoberta do id_ente antes de consultar demonstrativos fiscais.",
    inputSchema: TOOL_INPUT_SCHEMAS.siconfi_entes,
    schema: SiconfiEntesSchema,
    handler: handleSiconfiEntes,
  });

  registry.register({
    name: "siconfi_extrato_entregas",
    description:
      "Consulta o extrato de entregas de demonstrativos fiscais (RREO, RGF, DCA, MSC) enviadas por um ente federativo ao SICONFI em um exercício de referência.",
    inputSchema: TOOL_INPUT_SCHEMAS.siconfi_extrato_entregas,
    schema: SiconfiExtratoEntregasSchema,
    handler: handleSiconfiExtratoEntregas,
  });

  registry.register({
    name: "siconfi_rreo",
    description:
      "Consulta os dados do Relatório Resumido da Execução Orçamentária (RREO / RREO Simplificado) de um ente federativo por exercício, bimestre (1 a 6), anexo e filtro local por conta, com paginação limitada.",
    inputSchema: TOOL_INPUT_SCHEMAS.siconfi_rreo,
    schema: SiconfiRreoSchema,
    handler: handleSiconfiRreo,
  });

  registry.register({
    name: "siconfi_rgf",
    description:
      "Consulta o Relatório de Gestão Fiscal (RGF / RGF Simplificado) de um ente federativo por exercício, periodicidade (Q/S), período, poder (E/L/J/M/D), anexo e filtro local por conta.",
    inputSchema: TOOL_INPUT_SCHEMAS.siconfi_rgf,
    schema: SiconfiRgfSchema,
    handler: handleSiconfiRgf,
  });

  registry.register({
    name: "siconfi_dca",
    description:
      "Consulta a Declaração de Contas Anuais (DCA — balanço patrimonial, variações patrimoniais e execução orçamentária anual) de um ente federativo por exercício, anexo e filtro local por conta.",
    inputSchema: TOOL_INPUT_SCHEMAS.siconfi_dca,
    schema: SiconfiDcaSchema,
    handler: handleSiconfiDca,
  });
}
