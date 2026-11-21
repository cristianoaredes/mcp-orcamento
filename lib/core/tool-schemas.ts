/**
 * Canonical Zod schemas and JSON Input Schemas for the 8 Budget/Fiscal MCP tools.
 * Zero `node:*` imports and zero dependency on `lib/tools/*`.
 */

import type { z } from "zod";
import {
  EMENDAS_ESPECIAIS_RECURSOS,
  FUNDO_A_FUNDO_TED_MODALIDADES,
  FUNDO_A_FUNDO_TED_RECURSOS,
  SICONFI_ESFERAS,
  SICONFI_RGF_PERIODICIDADES,
  SICONFI_RGF_PODERES,
  SICONFI_RGF_TIPOS,
  SICONFI_RREO_TIPOS,
  SiconfiDcaSchema,
  SiconfiEntesSchema,
  SiconfiExtratoEntregasSchema,
  SiconfiRgfSchema,
  SiconfiRreoSchema,
  TESOURO_MODOS,
  TesouroOperacoesCreditoCkanSchema,
  TransferegovEmendasEspeciaisSchema,
  TransferegovFundoFundoTedSchema,
} from "../shared/orcamento-schemas.js";

export {
  SiconfiEntesSchema,
  SiconfiExtratoEntregasSchema,
  SiconfiRreoSchema,
  SiconfiRgfSchema,
  SiconfiDcaSchema,
  TransferegovEmendasEspeciaisSchema,
  TransferegovFundoFundoTedSchema,
  TesouroOperacoesCreditoCkanSchema,
};

export const TOOL_NAMES = [
  "siconfi_entes",
  "siconfi_extrato_entregas",
  "siconfi_rreo",
  "siconfi_rgf",
  "siconfi_dca",
  "transferegov_emendas_especiais",
  "transferegov_fundo_a_fundo_ted",
  "tesouro_operacoes_credito_ckan",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export const TOOL_SCHEMAS: Record<ToolName, z.ZodTypeAny> = {
  siconfi_entes: SiconfiEntesSchema,
  siconfi_extrato_entregas: SiconfiExtratoEntregasSchema,
  siconfi_rreo: SiconfiRreoSchema,
  siconfi_rgf: SiconfiRgfSchema,
  siconfi_dca: SiconfiDcaSchema,
  transferegov_emendas_especiais: TransferegovEmendasEspeciaisSchema,
  transferegov_fundo_a_fundo_ted: TransferegovFundoFundoTedSchema,
  tesouro_operacoes_credito_ckan: TesouroOperacoesCreditoCkanSchema,
};

export const TOOL_INPUT_SCHEMAS: Record<ToolName, Record<string, unknown>> = {
  siconfi_entes: {
    type: "object",
    additionalProperties: false,
    properties: {
      cod_ibge: {
        type: "string",
        pattern: "^\\d{1,7}$",
        description: "Código IBGE do ente federativo (1 a 7 dígitos; ex.: '3550308' para São Paulo, '1' para União).",
      },
      cnpj: {
        type: "string",
        pattern: "^\\d{14}$",
        description: "CNPJ principal do ente federativo (14 dígitos numéricos).",
      },
      uf: {
        type: "string",
        pattern: "^[A-Za-z]{2}$",
        description: "Sigla da UF com 2 letras (ex.: 'SP', 'MG').",
      },
      nome: {
        type: "string",
        minLength: 2,
        maxLength: 120,
        description: "Busca textual parcial (case/acento-insensível) no nome do ente.",
      },
      esfera: {
        type: "string",
        enum: [...SICONFI_ESFERAS],
        description: "Esfera federativa: U (União), E (Estado), M (Município), D (Distrito Federal).",
      },
      capital_only: {
        type: "boolean",
        description: "Quando true, retorna apenas capitais.",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 50,
        default: 25,
        description: "Número máximo de entes retornados (1 a 50, padrão 25).",
      },
    },
    description:
      "Requer pelo menos um filtro entre cod_ibge, cnpj, uf, nome, esfera ou capital_only: true.",
  },
  siconfi_extrato_entregas: {
    type: "object",
    additionalProperties: false,
    required: ["id_ente", "an_referencia"],
    properties: {
      id_ente: {
        type: "integer",
        minimum: 1,
        description: "Código IBGE numérico do ente federativo (ex.: 3550308).",
      },
      an_referencia: {
        type: "integer",
        minimum: 2015,
        maximum: 2030,
        description: "Ano de referência das entregas no SICONFI (2015 a 2030).",
      },
      entregavel: {
        type: "string",
        minLength: 1,
        maxLength: 120,
        description: "Filtro textual opcional pelo nome do demonstrativo entregue (ex.: 'RREO', 'DCA').",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 100,
        default: 50,
        description: "Máximo de registros retornados (1 a 100, padrão 50).",
      },
    },
  },
  siconfi_rreo: {
    type: "object",
    additionalProperties: false,
    required: ["id_ente", "an_exercicio", "nr_periodo"],
    properties: {
      id_ente: {
        type: "integer",
        minimum: 1,
        description: "Código IBGE numérico do ente federativo.",
      },
      an_exercicio: {
        type: "integer",
        minimum: 2015,
        maximum: 2030,
        description: "Ano do exercício fiscal (2015 a 2030).",
      },
      nr_periodo: {
        type: "integer",
        minimum: 1,
        maximum: 6,
        description: "Bimestre de referência do RREO (1 a 6).",
      },
      co_tipo_demonstrativo: {
        type: "string",
        enum: [...SICONFI_RREO_TIPOS],
        default: "RREO",
        description: "Tipo de demonstrativo ('RREO' ou 'RREO Simplificado').",
      },
      no_anexo: {
        type: "string",
        minLength: 1,
        maxLength: 120,
        description: "Nome do anexo (ex.: 'RREO-Anexo 01').",
      },
      filtro_conta: {
        type: "string",
        minLength: 1,
        maxLength: 120,
        description: "Filtro local textual em conta ou cod_conta.",
      },
      page: {
        type: "integer",
        minimum: 1,
        maximum: 100,
        default: 1,
        description: "Página de resultados (1 a 100).",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 50,
        default: 30,
        description: "Itens por página (1 a 50, padrão 30).",
      },
    },
  },
  siconfi_rgf: {
    type: "object",
    additionalProperties: false,
    required: ["id_ente", "an_exercicio", "nr_periodo"],
    properties: {
      id_ente: {
        type: "integer",
        minimum: 1,
        description: "Código IBGE numérico do ente federativo.",
      },
      an_exercicio: {
        type: "integer",
        minimum: 2015,
        maximum: 2030,
        description: "Ano do exercício fiscal (2015 a 2030).",
      },
      in_periodicidade: {
        type: "string",
        enum: [...SICONFI_RGF_PERIODICIDADES],
        default: "Q",
        description: "Periodicidade: Q (Quadrimestral) ou S (Semestral).",
      },
      nr_periodo: {
        type: "integer",
        minimum: 1,
        maximum: 3,
        description: "Período do RGF (1 a 3 para quadrimestre; 1 a 2 para semestre).",
      },
      co_poder: {
        type: "string",
        enum: [...SICONFI_RGF_PODERES],
        default: "E",
        description: "Poder: E (Executivo), L (Legislativo), J (Judiciário), M (Ministério Público), D (Defensoria).",
      },
      co_tipo_demonstrativo: {
        type: "string",
        enum: [...SICONFI_RGF_TIPOS],
        default: "RGF",
        description: "Tipo de demonstrativo ('RGF' ou 'RGF Simplificado').",
      },
      no_anexo: {
        type: "string",
        minLength: 1,
        maxLength: 120,
        description: "Nome do anexo (ex.: 'RGF-Anexo 01').",
      },
      filtro_conta: {
        type: "string",
        minLength: 1,
        maxLength: 120,
        description: "Filtro local textual em conta ou cod_conta.",
      },
      page: {
        type: "integer",
        minimum: 1,
        maximum: 100,
        default: 1,
        description: "Página de resultados (1 a 100).",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 50,
        default: 30,
        description: "Itens por página (1 a 50, padrão 30).",
      },
    },
  },
  siconfi_dca: {
    type: "object",
    additionalProperties: false,
    required: ["id_ente", "an_exercicio"],
    properties: {
      id_ente: {
        type: "integer",
        minimum: 1,
        description: "Código IBGE numérico do ente federativo.",
      },
      an_exercicio: {
        type: "integer",
        minimum: 2015,
        maximum: 2030,
        description: "Ano do exercício fiscal (2015 a 2030).",
      },
      no_anexo: {
        type: "string",
        minLength: 1,
        maxLength: 120,
        description: "Nome do anexo da DCA (ex.: 'DCA-Anexo I-AB').",
      },
      filtro_conta: {
        type: "string",
        minLength: 1,
        maxLength: 120,
        description: "Filtro local textual em conta ou cod_conta.",
      },
      page: {
        type: "integer",
        minimum: 1,
        maximum: 100,
        default: 1,
        description: "Página de resultados (1 a 100).",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 50,
        default: 30,
        description: "Itens por página (1 a 50, padrão 30).",
      },
    },
  },
  transferegov_emendas_especiais: {
    type: "object",
    additionalProperties: false,
    properties: {
      recurso: {
        type: "string",
        enum: [...EMENDAS_ESPECIAIS_RECURSOS],
        default: "plano_acao_especial",
        description: "Recurso da API de Transferências Especiais.",
      },
      id_plano_acao: {
        type: "integer",
        minimum: 1,
        description: "ID do plano de ação especial.",
      },
      ano: {
        type: "integer",
        minimum: 2020,
        maximum: 2030,
        description: "Ano do plano de ação especial (2020 a 2030).",
      },
      uf: {
        type: "string",
        pattern: "^[A-Za-z]{2}$",
        description: "UF beneficiária (2 letras).",
      },
      cnpj_beneficiario: {
        type: "string",
        description: "CNPJ do beneficiário ou executor (14 dígitos; pontuação opcional).",
      },
      nome_parlamentar: {
        type: "string",
        minLength: 2,
        maxLength: 120,
        description: "Nome parcial do parlamentar autor da emenda (sujeito a revisão LGPD Art. 20).",
      },
      numero_emenda: {
        type: "string",
        pattern: "^\\d{8,16}$",
        description: "Número da emenda parlamentar (8 a 16 dígitos).",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 50,
        default: 20,
        description: "Máximo de registros (1 a 50, padrão 20).",
      },
      offset: {
        type: "integer",
        minimum: 0,
        maximum: 5000,
        default: 0,
        description: "Deslocamento inicial da paginação (0 a 5000).",
      },
    },
  },
  transferegov_fundo_a_fundo_ted: {
    type: "object",
    additionalProperties: false,
    required: ["modalidade"],
    properties: {
      modalidade: {
        type: "string",
        enum: [...FUNDO_A_FUNDO_TED_MODALIDADES],
        description: "Modalidade: 'fundoafundo' ou 'ted'.",
      },
      recurso: {
        type: "string",
        enum: [...FUNDO_A_FUNDO_TED_RECURSOS],
        default: "plano_acao",
        description:
          "Recurso PostgREST ('programa', 'plano_acao', 'empenho', 'relatorio_gestao', 'termo_execucao', 'nota_credito').",
      },
      id_plano_acao: {
        type: "integer",
        minimum: 1,
        description: "ID do plano de ação.",
      },
      id_programa: {
        type: "integer",
        minimum: 1,
        description: "ID do programa.",
      },
      uf: {
        type: "string",
        pattern: "^[A-Za-z]{2}$",
        description: "Sigla da UF (2 letras).",
      },
      cnpj_recebedor: {
        type: "string",
        description: "CNPJ do ente recebedor ou favorecido (14 dígitos; pontuação opcional).",
      },
      sigla_unidade: {
        type: "string",
        minLength: 2,
        maxLength: 40,
        description: "Sigla parcial do órgão/unidade (repassador, descentralizadora ou descentralizada).",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 50,
        default: 20,
        description: "Máximo de registros (1 a 50, padrão 20).",
      },
      offset: {
        type: "integer",
        minimum: 0,
        maximum: 5000,
        default: 0,
        description: "Deslocamento inicial da paginação (0 a 5000).",
      },
    },
  },
  tesouro_operacoes_credito_ckan: {
    type: "object",
    additionalProperties: false,
    properties: {
      modo: {
        type: "string",
        enum: [...TESOURO_MODOS],
        default: "operacoes_credito_pvl",
        description: "Modo de consulta: 'operacoes_credito_pvl' (SADIPEM) ou 'ckan_datasets' (Tesouro Transparente).",
      },
      uf: {
        type: "string",
        pattern: "^[A-Za-z]{2}$",
        description: "Sigla da UF (obrigatória no modo 'operacoes_credito_pvl').",
      },
      cod_ibge: {
        type: "string",
        pattern: "^\\d{7}$",
        description: "Código IBGE de 7 dígitos para filtrar pleitos PVL.",
      },
      interessado: {
        type: "string",
        minLength: 2,
        maxLength: 120,
        description: "Filtro textual parcial pelo nome do interessado no PVL.",
      },
      status_filtro: {
        type: "string",
        minLength: 1,
        maxLength: 80,
        description: "Filtro textual parcial pelo status do PVL (ex.: 'Deferido').",
      },
      query: {
        type: "string",
        minLength: 2,
        maxLength: 120,
        description: "Termo de busca para conjuntos de dados no modo 'ckan_datasets'.",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 50,
        default: 20,
        description: "Máximo de resultados retornados (1 a 50, padrão 20).",
      },
    },
  },
};
