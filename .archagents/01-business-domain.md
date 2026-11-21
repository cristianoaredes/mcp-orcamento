# Domínio e regras

Base inicial: bootstrap `mcp-orcamento` (`0.1.0`, `SPC-0001`).

O domínio cobre dados fiscais e orçamentários públicos brasileiros:
- **SICONFI (STN ORDS):** `siconfi_entes` (cadastro de entes federativos com filtros obrigatórios), `siconfi_extrato_entregas` (entregas por ente e exercício), `siconfi_rreo` (RREO bimestral), `siconfi_rgf` (RGF quadrimestral/semestral por poder) e `siconfi_dca` (Declaração de Contas Anuais).
- **Transferegov (MGI PostgREST):** `transferegov_emendas_especiais` (emendas Pix / art. 166-A em `transferenciasespeciais/*` com `lgpd_notice` para dados nominais) e `transferegov_fundo_a_fundo_ted` (`fundoafundo/*` e `ted/*`, excluindo `/maisbrasil` e `/siconv` que retornam HTTP 404 e `/obrasgov` por latência >10s).
- **SADIPEM & Tesouro Transparente CKAN:** `tesouro_operacoes_credito_ckan` (PVL por UF em `sadipem/tt/pvl` e busca de datasets CKAN em `package_search`).

## Fontes

- `.archagents/12-inception/discoveries/DSC-0001-apis-publicas-orcamento-siconfi-transferegov-sadipem.md`
- `.archagents/12-inception/specs/SPC-0001-catalogo-inicial-v010-orcamento.md`
