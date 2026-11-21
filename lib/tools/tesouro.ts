/**
 * Tesouro Nacional SADIPEM (PVL) & Tesouro Transparente CKAN tool:
 * - tesouro_operacoes_credito_ckan
 *
 * Zero `node:*` imports for Cloudflare Workers compatibility.
 */

import { TIMEOUTS } from "../config/timeouts.js";
import { httpJson } from "../core/http-client.js";
import type { ToolExecutionContext, ToolRegistry } from "../core/registry.js";
import {
  TesouroOperacoesCreditoCkanSchema,
  TOOL_INPUT_SCHEMAS,
} from "../core/tool-schemas.js";
import {
  sanitizeUntrustedText,
  UNTRUSTED_EXTERNAL_DATA_NOTICE,
} from "../shared/agentic-guard.js";
import {
  normalizeSearchText,
  sanitizeExternalValue,
  type TesouroOperacoesCreditoCkanArgs,
} from "../shared/orcamento-schemas.js";
import type { LookupResult } from "../types/index.js";

type AnyRecord = Record<string, unknown>;

async function queryOperacoesCreditoPvl(
  args: TesouroOperacoesCreditoCkanArgs,
  context: ToolExecutionContext
): Promise<LookupResult> {
  const uf = args.uf!;
  const urlObj = new URL("sadipem/tt/pvl", context.apiConfig.tesouroOrdsBaseUrl);
  urlObj.searchParams.set("uf", uf);
  const url = urlObj.toString();

  const cacheKey = `sadipem:pvl:v1:${uf}:${context.apiConfig.tesouroOrdsBaseUrl}`;
  let items = await Promise.resolve(context.cache.get<AnyRecord[]>(cacheKey));
  let cached = false;

  if (Array.isArray(items) && items.length > 0) {
    cached = true;
  } else {
    const response = await httpJson(url, {
      timeout: TIMEOUTS.ORDS_REQUEST_MS,
      headers: context.apiConfig.authHeaders,
      signal: context.signal,
      requestId: context.requestId,
    });

    if (!response.ok) {
      return {
        ok: false,
        error: response.error ?? "Failed to query SADIPEM PVL API",
        source: { url, fetchedAt: new Date().toISOString() },
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
        error: "Malformed SADIPEM PVL response: expected object with items array",
        source: { url, fetchedAt: new Date().toISOString() },
      };
    }

    items = (payload as { items: unknown[] }).items.filter(
      (entry): entry is AnyRecord => typeof entry === "object" && entry !== null
    );

    if (items.length > 0) {
      await Promise.resolve(context.cache.set(cacheKey, items));
    }
  }

  const normalizedInteressado = args.interessado
    ? normalizeSearchText(args.interessado)
    : undefined;
  const normalizedStatus = args.status_filtro
    ? normalizeSearchText(args.status_filtro)
    : undefined;

  const filtered = items.filter((item) => {
    if (args.cod_ibge !== undefined) {
      if (String(item.cod_ibge ?? "").trim() !== args.cod_ibge) {
        return false;
      }
    }
    if (normalizedInteressado !== undefined) {
      if (!normalizeSearchText(String(item.interessado ?? "")).includes(normalizedInteressado)) {
        return false;
      }
    }
    if (normalizedStatus !== undefined) {
      if (!normalizeSearchText(String(item.status ?? "")).includes(normalizedStatus)) {
        return false;
      }
    }
    return true;
  });

  const sliced = filtered.slice(0, args.limit).map((item) => sanitizeExternalValue(item));

  return {
    ok: true,
    data: {
      modo: args.modo,
      uf,
      total_matched: filtered.length,
      returned: sliced.length,
      cached,
      items: sliced,
      untrusted_data_notice: UNTRUSTED_EXTERNAL_DATA_NOTICE,
    },
    source: {
      url,
      fetchedAt: new Date().toISOString(),
    },
  };
}

interface CkanPackageSummary {
  id: unknown;
  name: unknown;
  title: unknown;
  notes?: string;
  organization?: unknown;
  metadata_created?: unknown;
  metadata_modified?: unknown;
  resources: unknown[];
}

function summarizeCkanDataset(pkg: AnyRecord): CkanPackageSummary {
  const org =
    typeof pkg.organization === "object" && pkg.organization !== null
      ? (pkg.organization as AnyRecord).title ?? (pkg.organization as AnyRecord).name
      : undefined;

  const rawResources = Array.isArray(pkg.resources) ? pkg.resources : [];
  const resources = rawResources.slice(0, 10).map((res) => {
    const r = (typeof res === "object" && res !== null ? res : {}) as AnyRecord;
    return sanitizeExternalValue({
      id: r.id,
      name: r.name ?? r.description,
      format: r.format,
      url: r.url,
    });
  });

  const notes =
    typeof pkg.notes === "string" && pkg.notes.trim().length > 0
      ? sanitizeUntrustedText(pkg.notes, 500)
      : undefined;

  return {
    id: sanitizeExternalValue(pkg.id),
    name: sanitizeExternalValue(pkg.name),
    title: sanitizeExternalValue(pkg.title),
    ...(notes ? { notes } : {}),
    ...(org !== undefined ? { organization: sanitizeExternalValue(org) } : {}),
    ...(pkg.metadata_created !== undefined
      ? { metadata_created: sanitizeExternalValue(pkg.metadata_created) }
      : {}),
    ...(pkg.metadata_modified !== undefined
      ? { metadata_modified: sanitizeExternalValue(pkg.metadata_modified) }
      : {}),
    resources,
  };
}

async function queryCkanDatasets(
  args: TesouroOperacoesCreditoCkanArgs,
  context: ToolExecutionContext
): Promise<LookupResult> {
  const searchQuery = args.query ?? "*:*";
  const urlObj = new URL("package_search", context.apiConfig.tesouroCkanBaseUrl);
  urlObj.searchParams.set("q", searchQuery);
  urlObj.searchParams.set("rows", String(args.limit));
  const url = urlObj.toString();

  const cacheKey = `ckan:search:v1:${searchQuery}:${args.limit}:${context.apiConfig.tesouroCkanBaseUrl}`;
  const cachedPayload = await Promise.resolve(
    context.cache.get<{ total_count: number; items: CkanPackageSummary[] }>(cacheKey)
  );

  if (cachedPayload && Array.isArray(cachedPayload.items) && cachedPayload.items.length > 0) {
    return {
      ok: true,
      data: {
        modo: args.modo,
        query: searchQuery,
        total_count: cachedPayload.total_count,
        returned: cachedPayload.items.length,
        cached: true,
        items: cachedPayload.items,
        untrusted_data_notice: UNTRUSTED_EXTERNAL_DATA_NOTICE,
      },
      source: {
        url,
        fetchedAt: new Date().toISOString(),
      },
    };
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
      error: response.error ?? "Failed to query Tesouro Transparente CKAN API",
      source: { url, fetchedAt: new Date().toISOString() },
    };
  }

  const body = response.data as {
    success?: unknown;
    result?: { count?: unknown; results?: unknown };
  } | null;

  if (
    typeof body !== "object" ||
    body === null ||
    body.success !== true ||
    typeof body.result !== "object" ||
    body.result === null ||
    !Array.isArray(body.result.results)
  ) {
    return {
      ok: false,
      error: "Malformed Tesouro Transparente CKAN response: expected success=true and result.results array",
      source: { url, fetchedAt: new Date().toISOString() },
    };
  }

  const summaries = body.result.results
    .filter((entry): entry is AnyRecord => typeof entry === "object" && entry !== null)
    .slice(0, args.limit)
    .map(summarizeCkanDataset);

  const totalCount =
    typeof body.result.count === "number" ? body.result.count : summaries.length;

  if (summaries.length > 0) {
    await Promise.resolve(
      context.cache.set(cacheKey, { total_count: totalCount, items: summaries })
    );
  }

  return {
    ok: true,
    data: {
      modo: args.modo,
      query: searchQuery,
      total_count: totalCount,
      returned: summaries.length,
      cached: false,
      items: summaries,
      untrusted_data_notice: UNTRUSTED_EXTERNAL_DATA_NOTICE,
    },
    source: {
      url,
      fetchedAt: new Date().toISOString(),
    },
  };
}

export async function handleTesouroOperacoesCreditoCkan(
  args: TesouroOperacoesCreditoCkanArgs,
  context: ToolExecutionContext
): Promise<LookupResult> {
  if (args.modo === "ckan_datasets") {
    return queryCkanDatasets(args, context);
  }
  return queryOperacoesCreditoPvl(args, context);
}

export function registerTesouroTools(registry: ToolRegistry): void {
  registry.register({
    name: "tesouro_operacoes_credito_ckan",
    description:
      "Consulta Pedidos de Verificação de Limites e Condições (PVL — operações de crédito de estados e municípios no SADIPEM) ou pesquisa datasets e URLs de recursos no portal Tesouro Transparente (CKAN).",
    inputSchema: TOOL_INPUT_SCHEMAS.tesouro_operacoes_credito_ckan,
    schema: TesouroOperacoesCreditoCkanSchema,
    handler: handleTesouroOperacoesCreditoCkan,
  });
}
