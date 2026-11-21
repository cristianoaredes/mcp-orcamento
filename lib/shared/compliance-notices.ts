/**
 * LGPD compliance notices for sensitive public-record lookups.
 * Web-standard (zero Node-only imports) for Cloudflare Workers compatibility.
 */

export const HOMONYM_HUMAN_REVIEW_NOTICE =
  "LGPD Art. 20 Notice (Revisão Humana Obrigatória): Name-based and partial-text lookups carry risk of homonyms (homônimos), stale records, or incomplete upstream responses. Do not use this result for automated decisions without prior human review, full document verification (CPF/CNPJ/emenda), and direct confirmation against the official source.";

export function attachLgpdNotice(payload: unknown): unknown {
  if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
    return {
      ...(payload as Record<string, unknown>),
      lgpd_notice: HOMONYM_HUMAN_REVIEW_NOTICE,
    };
  }
  return payload;
}
