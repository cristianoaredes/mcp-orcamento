# Política de Privacidade e Transparência LGPD — MCP Orçamento

Este documento descreve como o **MCP Orçamento** (`@aredes.me/mcp-orcamento`) trata dados durante consultas sob demanda a fontes públicas brasileiras de orçamento e finanças públicas, em conformidade com a **Lei nº 13.709/2018 (LGPD)**.

> **Importante:** O MCP Orçamento é um software open source (`AGPL-3.0-only`) executado localmente pelo usuário (CLI `stdio` / `HTTP/SSE`) ou auto-hospedado por um operador (ex.: Cloudflare Workers). O operador da instância atua como agente de tratamento responsável por observar a legislação aplicável ao seu ambiente.

## 1. Escopo de dados consultados sob demanda

- **STN / SICONFI (Tesouro Nacional):** `siconfi_entes`, `siconfi_extrato_entregas`, `siconfi_rreo`, `siconfi_rgf` e `siconfi_dca` (`apidatalake.tesouro.gov.br/ords/siconfi/tt/*`).
- **Transferegov (MGI):** `transferegov_emendas_especiais` (`transferenciasespeciais/*`) e `transferegov_fundo_a_fundo_ted` (`fundoafundo/*`, `ted/*`).
- **STN / SADIPEM e Tesouro Transparente CKAN:** `tesouro_operacoes_credito_ckan` (`ords/sadipem/tt/pvl` e `ckan/api/3/action/package_search`).

## 2. Finalidade, minimização e fluxos (LGPD Art. 6º e Art. 7º)

O servidor atua em modo **somente leitura** e **sem banco de dados permanente próprio**. Cache em memória (`MemoryCache`) ou KV (`KVCache`) armazena apenas respostas válidas e bem-sucedidas por tempo limitado (`MCP_CACHE_TTL`, mínimo `60s` em KV), descartando erros e respostas malformadas. Logs estruturados são emitidos exclusivamente em `stderr` com redação (`lib/shared/log-redaction.ts`).

## 3. Salvaguardas contra homônimos e decisões automatizadas (LGPD Art. 20)

Consultas em `transferegov_emendas_especiais` podem filtrar por nome de parlamentar (`nome_parlamentar_emenda_plano_acao`) e retornar nomes de parlamentares/beneficiários/executores. Resultados que incluem nomes parlamentares ou nominais carregam o campo estruturado `lgpd_notice` (`HOMONYM_HUMAN_REVIEW_NOTICE`) alertando sobre risco de homônimos e vedando decisões automatizadas sem revisão humana e conferência documental (CPF/CNPJ/número da emenda) na fonte oficial.

## 4. Encarregado / DPO (LGPD Art. 41) e Incidentes (LGPD Art. 48)

- Operadores auto-hospedados podem configurar `MCP_DPO_CONTACT` no Cloudflare Worker para exposição automática em `GET /health` (`privacy.dpo_contact`).
- Reportes ao projeto open source: [github.com/cristianoaredes/mcp-orcamento/issues](https://github.com/cristianoaredes/mcp-orcamento/issues) (sem dados pessoais sensíveis) ou GitHub Security Advisories para incidentes confidenciais.
- Runbook interno de resposta a incidentes e notificação à ANPD: [`.archagents/10-runbooks.md`](.archagents/10-runbooks.md).
