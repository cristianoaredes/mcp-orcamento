/**
 * Runtime Zod schemas and Web-standard sanitization helpers for the 8 Budget/Fiscal tools.
 * Zero `node:*` imports for Cloudflare Workers parity.
 */

import { z } from "zod";
import { sanitizeUntrustedText } from "./agentic-guard.js";

const POSTGREST_OPERATOR_CHARS = /[,()*%\\]/g;

/**
 * Strip PostgREST filter operators/wildcards (`[,()*%\\]`) from user text
 * before constructing safe `ilike.*clean*` expressions.
 */
export function sanitizePostgrestFilterTerm(value: string): string {
  return value.replace(POSTGREST_OPERATOR_CHARS, " ").replace(/\s+/g, " ").trim();
}

/**
 * Normalize text to lowercase ASCII (NFD without diacritics) for accent-insensitive filtering.
 */
export function normalizeSearchText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Recursively sanitize untrusted external string fields.
 */
export function sanitizeExternalValue(value: unknown, maxChars: number = 2000): unknown {
  if (typeof value === "string") {
    return sanitizeUntrustedText(value, maxChars);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeExternalValue(item, maxChars));
  }
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = sanitizeExternalValue(entry, maxChars);
    }
    return out;
  }
  return value;
}

export const SICONFI_ESFERAS = ["U", "E", "M", "D"] as const;
export const SICONFI_RREO_TIPOS = ["RREO", "RREO Simplificado"] as const;
export const SICONFI_RGF_PERIODICIDADES = ["Q", "S"] as const;
export const SICONFI_RGF_PODERES = ["E", "L", "J", "M", "D"] as const;
export const SICONFI_RGF_TIPOS = ["RGF", "RGF Simplificado"] as const;

export const EMENDAS_ESPECIAIS_RECURSOS = [
  "plano_acao_especial",
  "executor_especial",
  "empenho_especial",
  "ordem_pagamento_ordem_bancaria_especial",
  "relatorio_gestao_novo_especial",
] as const;

export const FUNDO_A_FUNDO_TED_MODALIDADES = ["fundoafundo", "ted"] as const;
export const FUNDO_A_FUNDO_TED_RECURSOS = [
  "programa",
  "plano_acao",
  "empenho",
  "relatorio_gestao",
  "termo_execucao",
  "nota_credito",
] as const;

export const TESOURO_MODOS = ["operacoes_credito_pvl", "ckan_datasets"] as const;

export const SiconfiEntesSchema = z
  .object({
    cod_ibge: z
      .string()
      .trim()
      .regex(/^\d{1,7}$/, "cod_ibge must be 1 to 7 digits")
      .optional(),
    cnpj: z
      .string()
      .trim()
      .regex(/^\d{14}$/, "cnpj must be 14 digits")
      .optional(),
    uf: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/, "uf must be 2 letters")
      .transform((s) => s.toUpperCase())
      .optional(),
    nome: z.string().trim().min(2).max(120).optional(),
    esfera: z.enum(SICONFI_ESFERAS).optional(),
    capital_only: z.boolean().optional(),
    limit: z.number().int().min(1).max(50).optional().default(25),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      v.cod_ibge === undefined &&
      v.cnpj === undefined &&
      v.uf === undefined &&
      v.nome === undefined &&
      v.esfera === undefined &&
      v.capital_only !== true
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "Provide at least one filter: cod_ibge, cnpj, uf, nome, esfera, or capital_only: true",
      });
    }
  });

export const SiconfiExtratoEntregasSchema = z
  .object({
    id_ente: z.number().int().positive(),
    an_referencia: z.number().int().min(2015).max(2030),
    entregavel: z.string().trim().min(1).max(120).optional(),
    limit: z.number().int().min(1).max(100).optional().default(50),
  })
  .strict();

export const SiconfiRreoSchema = z
  .object({
    id_ente: z.number().int().positive(),
    an_exercicio: z.number().int().min(2015).max(2030),
    nr_periodo: z.number().int().min(1).max(6),
    co_tipo_demonstrativo: z.enum(SICONFI_RREO_TIPOS).optional().default("RREO"),
    no_anexo: z.string().trim().min(1).max(120).optional(),
    filtro_conta: z.string().trim().min(1).max(120).optional(),
    page: z.number().int().min(1).max(100).optional().default(1),
    limit: z.number().int().min(1).max(50).optional().default(30),
  })
  .strict();

export const SiconfiRgfSchema = z
  .object({
    id_ente: z.number().int().positive(),
    an_exercicio: z.number().int().min(2015).max(2030),
    in_periodicidade: z.enum(SICONFI_RGF_PERIODICIDADES).optional().default("Q"),
    nr_periodo: z.number().int().min(1).max(3),
    co_poder: z.enum(SICONFI_RGF_PODERES).optional().default("E"),
    co_tipo_demonstrativo: z.enum(SICONFI_RGF_TIPOS).optional().default("RGF"),
    no_anexo: z.string().trim().min(1).max(120).optional(),
    filtro_conta: z.string().trim().min(1).max(120).optional(),
    page: z.number().int().min(1).max(100).optional().default(1),
    limit: z.number().int().min(1).max(50).optional().default(30),
  })
  .strict();

export const SiconfiDcaSchema = z
  .object({
    id_ente: z.number().int().positive(),
    an_exercicio: z.number().int().min(2015).max(2030),
    no_anexo: z.string().trim().min(1).max(120).optional(),
    filtro_conta: z.string().trim().min(1).max(120).optional(),
    page: z.number().int().min(1).max(100).optional().default(1),
    limit: z.number().int().min(1).max(50).optional().default(30),
  })
  .strict();

export const TransferegovEmendasEspeciaisSchema = z
  .object({
    recurso: z.enum(EMENDAS_ESPECIAIS_RECURSOS).optional().default("plano_acao_especial"),
    id_plano_acao: z.number().int().positive().optional(),
    ano: z.number().int().min(2020).max(2030).optional(),
    uf: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/, "uf must be 2 letters")
      .transform((s) => s.toUpperCase())
      .optional(),
    cnpj_beneficiario: z
      .string()
      .trim()
      .transform((s) => s.replace(/\D/g, ""))
      .refine((s) => /^\d{14}$/.test(s), "cnpj_beneficiario must contain 14 digits")
      .optional(),
    nome_parlamentar: z.string().trim().min(2).max(120).optional(),
    numero_emenda: z
      .string()
      .trim()
      .regex(/^\d{8,16}$/, "numero_emenda must be 8 to 16 digits")
      .optional(),
    limit: z.number().int().min(1).max(50).optional().default(20),
    offset: z.number().int().min(0).max(5000).optional().default(0),
  })
  .strict();

export const TransferegovFundoFundoTedSchema = z
  .object({
    modalidade: z.enum(FUNDO_A_FUNDO_TED_MODALIDADES),
    recurso: z.enum(FUNDO_A_FUNDO_TED_RECURSOS).optional().default("plano_acao"),
    id_plano_acao: z.number().int().positive().optional(),
    id_programa: z.number().int().positive().optional(),
    uf: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/, "uf must be 2 letters")
      .transform((s) => s.toUpperCase())
      .optional(),
    cnpj_recebedor: z
      .string()
      .trim()
      .transform((s) => s.replace(/\D/g, ""))
      .refine((s) => /^\d{14}$/.test(s), "cnpj_recebedor must contain 14 digits")
      .optional(),
    sigla_unidade: z.string().trim().min(2).max(40).optional(),
    limit: z.number().int().min(1).max(50).optional().default(20),
    offset: z.number().int().min(0).max(5000).optional().default(0),
  })
  .strict()
  .superRefine((v, ctx) => {
    if ((v.recurso === "termo_execucao" || v.recurso === "nota_credito") && v.modalidade !== "ted") {
      ctx.addIssue({
        code: "custom",
        path: ["recurso"],
        message: `recurso '${v.recurso}' requires modalidade === 'ted'`,
      });
    }
    if ((v.recurso === "empenho" || v.recurso === "relatorio_gestao") && v.modalidade !== "fundoafundo") {
      ctx.addIssue({
        code: "custom",
        path: ["recurso"],
        message: `recurso '${v.recurso}' requires modalidade === 'fundoafundo'`,
      });
    }
  });

export const TesouroOperacoesCreditoCkanSchema = z
  .object({
    modo: z.enum(TESOURO_MODOS).optional().default("operacoes_credito_pvl"),
    uf: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/, "uf must be 2 letters")
      .transform((s) => s.toUpperCase())
      .optional(),
    cod_ibge: z
      .string()
      .trim()
      .regex(/^\d{7}$/, "cod_ibge must be 7 digits")
      .optional(),
    interessado: z.string().trim().min(2).max(120).optional(),
    status_filtro: z.string().trim().min(1).max(80).optional(),
    query: z.string().trim().min(2).max(120).optional(),
    limit: z.number().int().min(1).max(50).optional().default(20),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.modo === "operacoes_credito_pvl" && !v.uf) {
      ctx.addIssue({
        code: "custom",
        path: ["uf"],
        message: "2-letter uf is required when modo is 'operacoes_credito_pvl'",
      });
    }
  });

export type SiconfiEntesInput = z.input<typeof SiconfiEntesSchema>;
export type SiconfiEntesArgs = z.output<typeof SiconfiEntesSchema>;
export type SiconfiExtratoEntregasInput = z.input<typeof SiconfiExtratoEntregasSchema>;
export type SiconfiExtratoEntregasArgs = z.output<typeof SiconfiExtratoEntregasSchema>;
export type SiconfiRreoInput = z.input<typeof SiconfiRreoSchema>;
export type SiconfiRreoArgs = z.output<typeof SiconfiRreoSchema>;
export type SiconfiRgfInput = z.input<typeof SiconfiRgfSchema>;
export type SiconfiRgfArgs = z.output<typeof SiconfiRgfSchema>;
export type SiconfiDcaInput = z.input<typeof SiconfiDcaSchema>;
export type SiconfiDcaArgs = z.output<typeof SiconfiDcaSchema>;
export type TransferegovEmendasEspeciaisInput = z.input<typeof TransferegovEmendasEspeciaisSchema>;
export type TransferegovEmendasEspeciaisArgs = z.output<typeof TransferegovEmendasEspeciaisSchema>;
export type TransferegovFundoFundoTedInput = z.input<typeof TransferegovFundoFundoTedSchema>;
export type TransferegovFundoFundoTedArgs = z.output<typeof TransferegovFundoFundoTedSchema>;
export type TesouroOperacoesCreditoCkanInput = z.input<typeof TesouroOperacoesCreditoCkanSchema>;
export type TesouroOperacoesCreditoCkanArgs = z.output<typeof TesouroOperacoesCreditoCkanSchema>;
