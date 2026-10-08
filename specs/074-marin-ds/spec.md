# Spec 074 — Marin no Design System

**Status:** entregue (fases 1–5 + revisão `impeccable`). Migração do banco **pendente no VPS** (ver Rollout).
**Branch:** `074-marin-ds` (a partir do `master`).
**Plano de execução:** cinco fases, um commit por fase, como na Akane (072) e na Frieren (073), mais uma
revisão final com a skill `impeccable`.

## Problema

O shell da Marin (`webapp/frontend/src/pages/marin/`, ~8.700 linhas) é `legacy`: `Toast`, `TweaksPanel`,
ícones, estrelas (10 estrelas) e 5 modais locais; `marin.css` com 2.337 linhas e 90 cores literais;
`<input type="date">`; navegação só em estado React (a URL não muda, nada é linkável, recarregar volta ao
Início); favoritos só no `localStorage` do navegador (`marin.favorites`).

As estatísticas não fecham com o padrão (`webapp/docs/DESIGN_SYSTEM.md`):

| Sintoma | Causa |
|---|---|
| "Episódios por mês" conta sessões | `get_stats` faz `COUNT(*)` em `watch_logs` |
| "Completos" e `by_status` são do acervo todo num tile anual | sem filtro de período |
| Não há "dropados no ano" | não existe data de abandono |
| Faltam temporada de lançamento e distribuição de notas | `get_stats` não calcula |
| Mês errado e chave duplicada "Dez" no heatmap | `Heatmap.tsx` parseia `"YYYY-MM-DD"` como UTC |
| Datas dos episódios um dia antes | `EpisodeLine.tsx` faz `new Date(aired)` |
| Stats e Rewind são a mesma tela | `get_rewind` só chama `get_stats` |

## Decisões (do dono)

- Direção de arte **"Neon kawaii"** (`src/design/art/neon.css`).
- **Substituição direta** em `pages/marin/` (sem prévia em paralelo, diferente da Frieren).
- Nota: **meia estrela = 1 ponto do MAL** (estrelas 0–5 ↔ MAL 0–10 inteiro; "8/10" ao lado). O banco
  continua na escala do MAL, porque o sync com o MyAnimeList depende dela.
- **Backend completo**, como na Akane/Frieren: coração, vitrine de até 4 favoritos e data de abandono.
- **Nenhuma funcionalidade some** — só é melhorada ou adicionada.

## O que muda

### Backend (fase 1)

- `anime.liked` (coração), `anime.date_abandoned` e a tabela `anime_favorites(anime_id, position)`.
  Migração idempotente em `schema_pg.sql` e `scripts/migrate_marin_ds.py` (dry-run por padrão; faz o
  backfill de `date_abandoned` a partir de `mal_updated_at`/`updated_at` dos já abandonados).
- `update_anime_status` e o pull do MAL gravam `date_abandoned` ao abandonar e limpam ao sair de
  `abandonado`.
- `agents/marin/tools_stats.py`: `get_stats_payload(year, month)` no contrato `StatsPayload` — episódios
  reais, animes distintos, horas, completos e dropados **do período**, nota média em estrelas; rankings
  (estúdios, gêneros, temporada de lançamento, formato) por anime distinto; distribuição de notas
  0.5–5; recordes (maratona, sequência em dias corridos, mais assistido); animes com coração como
  "momentos". Datas em America/Sao_Paulo, soft delete fora da conta.
- Tools novas: `set_anime_liked`, `get_favorites`, `set_favorites`, `restore_anime`, `restore_watch_log`
  (as três primeiras também no toolset do agente). `get_home` passa a devolver `favorites`.
- Rotas novas em `/api/animes`: `GET|PUT /favorites`, `PATCH /{id}/like`, `POST /{id}/restore`,
  `POST /logs/restore`. `GET /stats` agora é o `StatsPayload` (aceita `year` e `month`); `/rewind` saiu.
  `get_stats`/`get_rewind` (formato antigo) seguem como tools do agente no Telegram/Hermes.

### Front (fases 2–5)

Arte neon e ícones (2) · shell novo, Início, Catálogo, Quero ver, Diário e Lançamentos (3) · detalhe,
Listas, Etiquetas e Estatísticas (4) · limpeza do legado e documentação (5) · revisão `impeccable`.

## Paridade (nada pode sumir)

10 telas · busca global (título/estúdio/gênero/tag) · adicionar via Jikan · logar episódios (anime, eps,
data, nota, notas, prefill do episódio/anime) · excluir sessão · status · nota · coração/favoritos ·
adicionar a lista · atualizar metadados · remover anime · notas · episódios paginados com log por
episódio · etiquetas · listas CRUD/ranked · Lançamentos com JST/BRT e "Novo ep" · próximo episódio
"Já vi" · Sync MAL (e o sync completo, que hoje não tem botão) · "Começar" da fila · ordenação
padrão/densidade/tema em Preferências · retrato e "Voltar à Makima".

## Critérios de sucesso

- Logar episódio em ≤ 2 interações pela linha rápida (`Frieren ep 12`).
- As 6 métricas mínimas aparecem em Estatísticas; episódios são reais; completos e dropados são do ano.
- `npm run audit:design` passa com a Marin `conformant`; testes de lógica pura e de tela cobrindo os fluxos.
- Todos os itens da paridade conferidos no navegador, claro/escuro e celular.

## Rollout

1. Aplicar `scripts/migrate_marin_ds.py --apply` no VPS, de dentro do `makima-web` (primeiro sem
   `--apply`), **antes** do deploy do front — as colunas novas entram nos `SELECT` da API.
2. Deploy; validar no uso real.

## Fora de escopo

- Reordenar itens de listas "ranked" por arrastar (hoje também não existe).
- Mudanças nas tools do agente (Telegram/Hermes) além de coração, favoritos e `date_abandoned`.
- Migração da Mai.
