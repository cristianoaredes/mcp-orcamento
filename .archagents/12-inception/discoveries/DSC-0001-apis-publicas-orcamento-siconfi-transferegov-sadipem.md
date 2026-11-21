---
id: DSC-0001
slug: apis-publicas-orcamento-siconfi-transferegov-sadipem
title: "Discovery de APIs públicas de orçamento e finanças (SICONFI, Transferegov, SADIPEM e CKAN) para o mcp-orcamento v0.1.0"
created_at: "2026-11-21T14:20:00-03:00"
status: decided
linked_brief: BRF-0001
linked_spec: SPC-0001
sources:
  - ../mcp-dadosbr/.archagents/12-inception/discoveries/DSC-0001-expansao-fontes-transversais-v070.md
  - https://apidatalake.tesouro.gov.br/ords/siconfi/tt/entes
  - https://api.transferegov.gestao.gov.br/transferenciasespeciais/
  - https://api.transferegov.gestao.gov.br/fundoafundo/
  - https://api.transferegov.gestao.gov.br/ted/
  - https://apidatalake.tesouro.gov.br/ords/sadipem/tt/pvl
  - https://www.tesourotransparente.gov.br/ckan/api/3/action/package_search
external_refs: []
external_sync: []
---

# DSC-0001 — Discovery de APIs públicas de orçamento e finanças (SICONFI, Transferegov, SADIPEM e CKAN) para o mcp-orcamento v0.1.0

## Contexto

Conforme decisão em `mcp-dadosbr` (`BRF-0001` / `DSC-0001`), o `@aredes.me/mcp-orcamento` é instanciado a partir do molde arquitetural do `mcp-dadosbr` (Node `stdio` + `HTTP/SSE` + Cloudflare Worker + governança `codebase-ops`), dedicado às consultas públicas de execução fiscal e orçamentária federal, estadual e municipal sem exigência de API key.

## Fontes consultadas e evidências

1. **STN / SICONFI ORDS (`https://apidatalake.tesouro.gov.br/ords/siconfi/tt/*`):**
   - `entes`: lista os ~5.570 entes federativos (`cod_ibge`, `ente`, `capital` com padding de espaços ex. `'0  '`, `regiao`, `uf`, `esfera`, `exercicio`, `populacao`, `cnpj`). Exige filtragem server-side e teto de retorno (`<= 50`) para evitar sobrecarga de contexto.
   - `extrato_entregas`: histórico de entregas por `id_ente` e `an_referencia`.
   - `rreo`, `rgf`, `dca`: relatórios contábeis/fiscais que retornam centenas a ~3.240 linhas por ente/exercício; exigem descoberta de `anexos_disponiveis`, filtro textual por conta (`filtro_conta`) e paginação (`<= 50`) antes da serialização. Latência de ORDS justifica timeout de `15_000ms`.
2. **Transferegov PostgREST (`https://api.transferegov.gestao.gov.br/{transferenciasespeciais,fundoafundo,ted}/*`):**
   - `/transferenciasespeciais/`: expõe `plano_acao_especial` (`ano_plano_acao`, `uf_beneficiario_plano_acao`, `cnpj_beneficiario_plano_acao`, `nome_parlamentar_emenda_plano_acao`, `numero_emenda_parlamentar_plano_acao`), `executor_especial` (`cnpj_executor`), `empenho_especial` (`uf_beneficiario_empenho`, `cnpj_beneficiario_empenho`), `ordem_pagamento_ordem_bancaria_especial` e `relatorio_gestao_novo_especial`. Contém nomes de parlamentares/executores (exige `lgpd_notice` LGPD Art. 20) e requer sanitização de operadores PostgREST `[,()*%\\]` nos filtros `ilike`.
   - `/fundoafundo/` e `/ted/`: expõem `programa`, `plano_acao`, `empenho`/`relatorio_gestao` (exclusivos `fundoafundo`) e `termo_execucao`/`nota_credito` (exclusivos `ted`).
   - Rotas legadas `/maisbrasil` e `/siconv` retornam HTTP 404 na origem; `/obrasgov` excede timeout >10s — ambas excluídas da `v0.1.0`.
3. **STN / SADIPEM PVL e Tesouro Transparente CKAN:**
   - `https://apidatalake.tesouro.gov.br/ords/sadipem/tt/pvl?uf=...`: operações de crédito subnacionais (PVL), filtrável por `cod_ibge`, `interessado` e `status`.
   - `https://www.tesourotransparente.gov.br/ckan/api/3/action/package_search?q=...&rows=...`: catálogo de datasets abertos do Tesouro Transparente.

## Hipóteses

- **H1 (Paridade Worker-safe com cargas ORDS):** filtrar e paginar (`<= 50`) listas extensas de SICONFI e SADIPEM antes de `serializeBoundedToolOutput` mantém o uso de memória compatível com Cloudflare Workers (`128 MB`) e o payload JSON dentro de `MCP_MAX_TOOL_OUTPUT_CHARS`.
- **H2 (Segurança PostgREST e SSRF):** remover `[,()*%\\]` em parâmetros textuais e restringir hosts configuráveis a `ALLOWED_TESOURO_ORDS_HOSTS`, `ALLOWED_TRANSFEREGOV_HOSTS` e `ALLOWED_TESOURO_CKAN_HOSTS` elimina injeção de filtro PostgREST e SSRF.

## Decisão

Aprovado o catálogo inicial `v0.1.0` com **8 tools** Worker-safe e sem API key (`siconfi_entes`, `siconfi_extrato_entregas`, `siconfi_rreo`, `siconfi_rgf`, `siconfi_dca`, `transferegov_emendas_especiais`, `transferegov_fundo_a_fundo_ted`, `tesouro_operacoes_credito_ckan`), promovido para `BRF-0001` e `SPC-0001`.
