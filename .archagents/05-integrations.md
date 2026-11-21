# Integrações

Base atual: `TCK-0001` (`v0.1.0`, `SPC-0001`, implementado).

- **SICONFI / SADIPEM (Tesouro Nacional ORDS):** `https://apidatalake.tesouro.gov.br/ords/` (sem API key, timeout `15_000ms`, hosts allowlisted em `ALLOWED_TESOURO_ORDS_HOSTS`).
- **Transferegov (MGI PostgREST):** `https://api.transferegov.gestao.gov.br/` (`transferenciasespeciais/*`, `fundoafundo/*`, `ted/*`; sem API key, hosts allowlisted em `ALLOWED_TRANSFEREGOV_HOSTS`, filtros de texto sanitizados contra operadores PostgREST).
- **Tesouro Transparente (CKAN):** `https://www.tesourotransparente.gov.br/ckan/api/3/action/` (sem API key, hosts allowlisted em `ALLOWED_TESOURO_CKAN_HOSTS`).

## Fontes

- `.archagents/12-inception/discoveries/DSC-0001-apis-publicas-orcamento-siconfi-transferegov-sadipem.md`
