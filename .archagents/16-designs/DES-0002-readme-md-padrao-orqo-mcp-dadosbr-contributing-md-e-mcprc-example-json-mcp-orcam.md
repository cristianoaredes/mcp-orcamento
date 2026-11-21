---
id: DES-0002
slug: readme-md-padrao-orqo-mcp-dadosbr-contributing-md-e-mcprc-example-json-mcp-orcam
title: "README.md padrão Orqo/mcp-dadosbr, CONTRIBUTING.md e .mcprc.example.json (mcp-orcamento)"
created_at: 2026-11-21T19:34:13Z
status: approved
ticket: TCK-0002
type: design
scope_files_new:
  - CONTRIBUTING.md
  - .mcprc.example.json
scope_files_modified:
  - README.md
  - package.json
scope_files_deleted: []
blast_radius: low
playbook: .archagents/16-designs/playbooks/DES-0002-playbook.md
acceptance_delta: unchanged
---
# DES-0002 - README.md padrão Orqo/mcp-dadosbr, CONTRIBUTING.md e .mcprc.example.json (mcp-orcamento)

## Problema

O `README.md` inicial (`76` linhas) resume o catálogo básico da `v0.1.0`, mas ainda não segue o padrão editorial público da Orqo (`mcp-dadosbr`: narrativa de problema, exemplos em conversa, catálogo detalhado das 8 ferramentas, sinergia no ecossistema `@aredes.me/*`, perímetro de execução dual-runtime, instalação/configuração completa, arquitetura interna com Mermaid, seção de honestidade/limites, governança Codebase OPS, FAQ, licença AGPL-3.0-only, contribuição, LGPD e seção em inglês). Além disso, faltam `CONTRIBUTING.md` (alinhado à arquitetura modular `lib/`) e `.mcprc.example.json` (incluído em `package.json` `files`).

## Solucao

1. **`.mcprc.example.json` e `package.json`:**
   - Criar `.mcprc.example.json` compatível com `ConfigFile` (`lib/types/index.ts#L19-L28`) e `resolveApiConfig()` (`lib/config/index.ts#L103-L166`), documentando `_defaults` e `apiUrls` (`tesouroOrds`, `transferegov`, `tesouroCkan`) e `auth.headers`.
   - Adicionar `".mcprc.example.json"` ao array `"files"` em `package.json`.
2. **`CONTRIBUTING.md`:**
   - Criar guia bilíngue (Português / English) no tom de `mcp-dadosbr`, descrevendo a arquitetura modular em `lib/` (`bin/`, `adapters/`, `config/`, `core/`, `infrastructure/`, `shared/`, `tools/`, `workers/`) — **sem** alegação obsoleta de arquivo único — Node `22.12+ | 24 | 26`, comandos `npm test`, `npm run test:coverage`, `npm run test:transport`, `npm run build:worker`, fluxo de PR para `main` via branch de feature/docs e governança `.archagents/`.
3. **`README.md` (~360–430 linhas):**
   - Reescrever seguindo integralmente a estrutura editorial de `mcp-dadosbr`: cabeçalho `by Orqo`, 5 badges Shields.io, barra de âncoras verificadas por slug GitHub, problema + tabela comparativa, 5 prompts de conversa com cruzamento no ecossistema `@aredes.me/*`, catálogo completo das 8 ferramentas (SICONFI 5, Transferegov 2, Tesouro/SADIPEM+CKAN 1) explicitando ausência de painéis HTML `ui://`, perímetro de execução (`stdio`, `HTTP/SSE` com fail-closed `MCP_API_KEY` fora de loopback, Cloudflare Worker), instalação/configuração (todas as env vars reais + allowlists SSRF + notas de Worker/`wrangler.toml`), arquitetura interna (Mermaid `flowchart LR` + `lib/core/mcp-server.ts`, `tools.ts`, `http-client.ts`, `agentic-guard.ts`, `transferegov.ts` `[,()*%\\]`, `worker.ts`, `test/integration/transports.mjs` 101 chamadas), 7 limites explícitos na seção Honestidade, governança Codebase OPS (ligando `.archagents/README.md`, `SPC-0001`, `TCK-0001`, `DES-0001`, `VER-20261121-183924-tck-0001`), FAQ, GNU `AGPL-3.0-only` (`LICENSE`, `NOTICE.md`), Desenvolvimento e contribuição (somente links existentes no repositório, sem `docs/` inexistente), Privacidade/LGPD (`PRIVACY.md`, `MCP_DPO_CONTACT`) e seção `## English`.

## Mudancas

- Criar `.mcprc.example.json` e incluir em `package.json` (`"files"`).
- Criar `CONTRIBUTING.md`.
- Reescrever `README.md`.

## Criterios de sucesso

- [ ] `npm run build && npm run build:worker` e `npx vitest run` passam após as edições.
- [ ] `README.md` tem entre ~360 e 430 linhas (>= 320), todas as seções obrigatórias e zero links relativos ou âncoras quebradas (`README_STRUCTURE_OK` e `LINKS_OK:`).
- [ ] `check-scope.py` reporta `out_of_scope: []` e `secret-scan.sh` retorna limpo.
