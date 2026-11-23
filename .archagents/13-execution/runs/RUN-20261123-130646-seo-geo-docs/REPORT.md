---
status: completed
run_id: RUN-20261123-130646-seo-geo-docs
ticket: TCK-0003
design: ""
start_time: 2026-11-23T13:06:46Z
end_time: 2026-11-23T13:26:20.180086Z
environment: dev
mode: dry-run
operator: ops
commits: []
files_modified: []
test_result:
  status: null
  summary: ""
  details: ""
---
# RUN-20261123-130646-seo-geo-docs - TCK-0003

## Resumo executivo

<!-- result:inicio — gerado a partir do result.json; o que está entre as marcas é regravado a cada drive -->
**Resultado de TCK-0003** (status do ticket: done) — `result.json` gerado em 2026-11-23T13:26:20Z, HEAD `fd9037959912`

implementado ? · verificado ✓ · publicado ? (nenhum commit cita o ticket: nada a publicar não é publicado)

| # | Estado | Atendido | ✓ evidência · ✗ falta · ? não medido |
|---|---|---|---|
| 1 | Pedido compreendido | ✓ | ✓ ticket em 'done' (saiu de raw) · ✓ acceptance[]: 2 critério(s) · ✓ restrições registradas: nenhuma · ? evento de rota: não liga a ticket nem a run (não medido) |
| 2 | Execução autorizada | ? | ✓ o ticket passou por executing (status 'done') · ✓ nenhuma restrição read-only · ? run sem drive (guiado à mão): o handoff do designed→executing não foi lido · ? budget.json ausente: sem teto de orçamento medido · ? max_attempts_total ausente no run: sem teto de tentativas medido |
| 3 | Tarefa executada | ? | ✓ 6 arquivo(s) alterado(s) no working tree (TCK-3115) · ? actions.jsonl: sem passos de iteração do driver |
| 4 | Requisito comprovado | ✓ | ✓ lock: passes true · ✓ lock fresh: o conteúdo é o que foi verificado · ✓ VER vinculado ao ticket (exigido) · ✓ o VER vinculado vale para o writer (veredito aprovado, posterior ao último executing e com fuso) |
| 5 | Publicação autorizada | ? | ✓ nenhuma restrição no-publish · ? run sem drive: a autonomia não foi registrada · ? sessão: as restrições da sessão não são conhecidas aqui (não medido) · ? URL de PR: não medida (sem rede) · ? autonomia concedida ao operador: não medida aqui (o nível do drive é o --level do ratchet, default L2) |

**Requisitos** (acceptance[]; o lock vale para o ticket inteiro):
- `npm test` (esperado: ``) — lock passes ✓, fresh
- `npm run build && npm run build:worker` (esperado: ``) — lock passes ✓, fresh

**Pendências** (1):
- Não coberto aqui (VER-20261123-132248-tck-0003): - Os testes unitarios Vitest (`51/51`) e `test:transport` (`101` chamadas offline) exercitam mocks de `fetch` e loopback HTTP sem consultar SICONFI/Transferegov/SADIPEM/Tesouro Transparente ao vivo durante a suite (amostras vivas dos 8 tools foram coletadas separadamente antes das edicoes finais). - O alvo Cloudflare Workers foi compilado via `tsc -p tsconfig.worker.json` e testado com KV mockado em Node, sem deploy ou execucao em runtime `worker…

**Não medido** (13):
- drive: run sem drive (guiado à mão)
- budget.json: ausente (sem teto de orçamento medido)
- actions.jsonl: sem passos de iteração do driver
- run.json: sem max_attempts_total
- evento de rota: não liga a ticket nem a run (não medido)
- run sem drive (guiado à mão): o handoff do designed→executing não foi lido
- budget.json ausente: sem teto de orçamento medido
- max_attempts_total ausente no run: sem teto de tentativas medido
- run sem drive: a autonomia não foi registrada
- sessão: as restrições da sessão não são conhecidas aqui (não medido)
- URL de PR: não medida (sem rede)
- autonomia concedida ao operador: não medida aqui (o nível do drive é o --level do ratchet, default L2)
- publicado: nenhum commit cita o ticket: nada a publicar não é publicado

**Consumo:** não medido (cost_source: unknown)

_O relatório descreve o instante em que foi gerado; quem decide é o ticket, o lock, o VER e o git._
<!-- result:fim -->

## Evidence Gate

| Check | Esperado | Obtido | Status |
|---|---|---|---|
