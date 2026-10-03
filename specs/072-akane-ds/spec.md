# Spec 072 — Akane no Design System

**Status:** em andamento (fase 1 de 5 entregue: backend de estatísticas).
**Branch:** `feat/072-akane-ds` (a partir do `master`).
**Plano de execução:** cinco fases, um commit por fase, como na Nami (spec 070/071).

## Problema

O shell da Akane (`webapp/frontend/src/pages/akane/`, ~6.000 linhas) é o último dos shells de mídia ainda
fora do Design System: tokens próprios (`akane.css`), `TweaksPanel`, `Toast`, 6 modais montados à mão, ícones,
estrelas e heatmap locais, `<input type="date">`, 116 estilos inline e navegação só em estado React (a URL não
muda, nada é linkável). As estatísticas também não fecham com o padrão:

| Sintoma | Causa |
|---|---|
| Gênero, diretor e década "inflados" por revisões | o ranking conta **sessões**, não filmes (`tools.py`, `get_stats`/`get_rewind`) |
| Stats é só um subconjunto do Rewind | duas telas e dois endpoints para a mesma informação |
| Faltam 5 das 8 métricas mínimas do DS | horas só no Rewind; décadas só a top; país/idioma, cinema vs casa e Quero ver adicionados vs vistos não existem |

## Decisões (do dono)

- Direção de arte **"Cinema noir"** (`src/design/art/noir.css`).
- **Backend completo** para as estatísticas: uma tela só (Estatísticas + Rewind) no contrato `StatsPayload`, com as 8 métricas.
- Rollout **em paralelo**: `pages/akane-next/` em `/movies-next`; a troca e a limpeza só na última fase, depois de validado.

## O que muda

### Backend (fase 1 — entregue)

- Colunas novas em `movies`: `original_language`, `countries` (TMDB) e `watchlist_added_at` (entrada no Quero ver).
  Migração idempotente em `schema_pg.sql` e `scripts/migrate_akane_stats_fields.py` (dry-run por padrão; faz o
  backfill de idioma/países pelo TMDB e a data dos filmes que estão hoje no Quero ver).
- `agents/akane/tools_stats.py`: `get_stats_payload(year, month)` no contrato `StatsPayload`, com KPIs contra o
  mesmo trecho do ano anterior, sessões por dia/mês, distribuição de notas por **filme distinto**, rankings
  (gêneros, diretores, décadas, países, idiomas, companhia), recordes e filmes com coração. Datas em
  America/Sao_Paulo, soft delete fora da conta.
- `GET /api/movies/stats/payload?year=&month=`. O `/stats` antigo continua enquanto o shell legado existir
  (ele o consome); a fase 5 move o contrato novo para `/stats`.
- `get_stats`/`get_rewind` passam a contar filmes distintos em gênero, diretor e década.
- `watchlist_added_at` nasce com o filme no Quero ver, é preservada ao ver o filme e renovada ao voltar para a lista.
  Logar a 1ª sessão em até 5 min da criação (fluxo "logar direto", que passa por `add_movie` como `watchlist`) zera a
  data: o filme nunca esteve de fato no Quero ver.

### Front (fases 2–5)

Arte noir e regras de captura (2) · shell novo, Início, Logar, Filmes, Quero ver e Diário (3) · detalhe, Listas,
Etiquetas e Estatísticas (4) · troca do shell, remoção do legado e documentação (5).

## Critérios de sucesso

- Logar um filme em ≤ 2 interações pela linha rápida (`Duna 2 ★4.5 ontem @Cinemark +Ana`).
- Rewatch não infla nenhum ranking; as 8 métricas mínimas aparecem na tela de Estatísticas.
- `npm run audit:design` passa com a Akane `conformant`; testes de lógica pura e de tela cobrindo os fluxos.
- Nenhuma rota antiga quebra sem redirecionamento.

## Rollout

1. Aplicar `scripts/migrate_akane_stats_fields.py --apply` no VPS, de dentro do `makima-web` (primeiro sem `--apply`).
2. Validar `/movies-next` no uso real.
3. Só então a fase 5 (apaga o shell antigo e troca `/stats`).

## Fora de escopo

- Importação do CSV do Letterboxd pela web (segue em `scripts/import_letterboxd_csv.py`).
- Tela de sessões/cinema separada: cinema vs casa continua sendo o local da sessão.
- Renomear rotas da API.
