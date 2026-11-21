---
id: TCK-0002
slug: documentar-readme-md-completo-no-padrao-orqo-mcp-dadosbr-contributing-md-e-mcprc
title: "Documentar README.md completo no padrão Orqo/mcp-dadosbr, CONTRIBUTING.md e .mcprc.example.json para publicação pública"
source: operator
created_at: 2026-11-21T19:33:50Z
created_by: ops
updated_at: 2026-11-21T19:39:48Z
status: verifying
severity: low
category: docs
effort: S
flow: normal
ceremony: full
business_impact: ""
linked_findings: []
linked_designs:
  - DES-0002
linked_runs:
  - RUN-20261121-193447-tck-0002
linked_verifications: []
linked_docs: []
external_refs: []
external_sync: []
blocks: []
blocked_by: []
related: []
acceptance:
  - check: "npm run build && npm run build:worker"
    expect: ""
  - check: "npx vitest run"
    expect: ""
  - check: "node -e \"import('node:fs').then(fs => { const md = fs.readFileSync('README.md','utf8'); const req = ['by Orqo','## O problema','## Perímetro de execução','## Instalação e configuração','## Como funciona por dentro','## Governança: construído com Codebase OPS by Orqo','## Licença: GNU AGPL-3.0','## Privacidade e LGPD','## English']; if (md.split('\\n').length < 320 || !req.every(h => md.includes(h))) process.exit(1); console.log('README_STRUCTURE_OK'); })\""
    expect: README_STRUCTURE_OK
  - check: "node -e \"import('node:fs').then(fs => { const md = fs.readFileSync('README.md','utf8'); const links = [...md.matchAll(/\\]\\((?!https?:\\/\\/|#|mailto:)([^)#\\s]+)(?:#[^)]*)?\\)/g)].map(m => m[1]); const missing = links.filter(p => !fs.existsSync(p)); if (missing.length) { console.error(missing); process.exit(1); } console.log('LINKS_OK:' + links.length); })\""
    expect: LINKS_OK:
depth_decision:
  workflow: inline
  design: skip
  verify: lightweight
  source: routing-classifier
  classified_at: 2026-11-21T19:34:13Z
---
# TCK-0002 - Documentar README.md completo no padrão Orqo/mcp-dadosbr, CONTRIBUTING.md e .mcprc.example.json para publicação pública

## Contexto

Expandir o `README.md` do `@aredes.me/mcp-orcamento` (`v0.1.0`, `AGPL-3.0-only`) para o padrão editorial completo Orqo/`mcp-dadosbr` (~360–430 linhas), adicionar `CONTRIBUTING.md` bilíngue (PT-BR/EN) alinhado à arquitetura modular em `lib/` e adicionar `.mcprc.example.json` (registrado em `package.json` `files`) para publicação pública.

## Falsificador

Antes da execução, `README.md` possui apenas `76` linhas sem as seções obrigatórias do padrão Orqo/`mcp-dadosbr` (reprovando o critério `README_STRUCTURE_OK`), e `CONTRIBUTING.md` e `.mcprc.example.json` não existem no repositório.

## Log de transicoes

- 2026-11-21T19:33:50Z - **raw** - criado via scripts/ops/ticket/create.py.
- 2026-11-21T19:34:13Z - **triaged** - Triagem TCK-0002: documentacao publica README.md padrao Orqo/mcp-dadosbr, CONTRIBUTING.md e .mcprc.example.json (effort S, low) [triagem: severity low→low, category docs→docs, effort S→S] [depth_decision do routing-classifier: workflow inline, design skip, verify lightweight]
- 2026-11-21T19:34:46Z - **designed** - DES-0002 aprovado com escopo README.md, CONTRIBUTING.md, .mcprc.example.json e package.json
- 2026-11-21T19:34:47Z - **executing** - Iniciar execucao live TCK-0002 sob DES-0002 na branch docs/TCK-0002-readme-orqo-standard
- 2026-11-21T19:39:48Z - **verifying** - README.md expandido para 410 linhas no padrao Orqo/mcp-dadosbr, CONTRIBUTING.md e .mcprc.example.json criados, todos os 4 checks de aceite e transportes validados
