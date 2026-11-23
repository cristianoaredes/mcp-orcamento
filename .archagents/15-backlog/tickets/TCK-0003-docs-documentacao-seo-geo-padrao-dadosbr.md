---
id: TCK-0003
slug: docs-documentacao-seo-geo-padrao-dadosbr
title: "docs: documentação SEO/GEO padrão DadosBR"
source: operator
created_at: 2026-11-23T13:06:13Z
created_by: ops
updated_at: 2026-11-23T13:26:19Z
status: done
severity: low
category: docs
effort: M
flow: normal
ceremony: full
business_impact: ""
linked_findings: []
linked_designs:
  - DES-0003
linked_runs:
  - RUN-20261123-130646-seo-geo-docs
linked_verifications:
  - VER-20261123-132248-tck-0003
linked_docs: []
external_refs: []
external_sync: []
blocks: []
blocked_by: []
related: []
acceptance:
  - check: "npm test"
  - check: "npm run build && npm run build:worker"
depth_decision:
  workflow: lightweight
  design: lightweight
  verify: completo
  source: routing-classifier
  classified_at: 2026-11-23T13:06:33Z
---
# TCK-0003 - docs: documentação SEO/GEO padrão DadosBR

## Contexto

Criado via scripts/ops/ticket/create.py a partir de source=operator.

## Falsificador

Antes do fix na `main` (`fd90379`): `npm view @aredes.me/mcp-orcamento version` retorna `404 Not Found` enquanto o `README.md` anterior instruía instalação imediata via `npx -y @aredes.me/mcp-orcamento`; além disso `docs/`, `CHANGELOG.md` e `llms.txt` inexistiam no repositório e o `README.md` listava `MCP_API_TIMEOUT` sem distinguir de `MCP_HTTP_TIMEOUT` (`8000` ms em `lib/config/timeouts.ts`).

## Log de transicoes

- 2026-11-23T13:06:13Z - **raw** - criado via scripts/ops/ticket/create.py.
- 2026-11-23T13:06:33Z - **triaged** - Auditoria de README vs codigo, aviso npm nao publicado, criacao de docs/, docs/pt-br/README.md, CHANGELOG.md, llms.txt, FAQ SEO/GEO e metadados package.json/GitHub. [triagem: severity low→low, category docs→docs, effort M→M] [depth_decision do routing-classifier: workflow lightweight, design lightweight, verify completo]
- 2026-11-23T13:06:58Z - **linked** - links updated
- 2026-11-23T13:07:29Z - **designed** - DES-0003 com scope_files completo para docs SEO/GEO.
- 2026-11-23T13:08:17Z - **executing** - DES-0003-playbook criado; branch docs/TCK-0003-seo-geo-docs solicitada explicitamente pelo plano aprovado.
- 2026-11-23T13:23:52Z - **verifying** - Independent P10 verification da851304 PASS + VER-20261123-132248-tck-0003
- 2026-11-23T13:26:19Z - **done** - Docs SEO/GEO, CHANGELOG, llms.txt, README audit e npm-unpublished verified via P10 da851304
