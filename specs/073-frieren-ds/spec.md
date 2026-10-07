# Spec 073 — Frieren no Design System

**Status:** em andamento — fase 1 (backend) entregue; migração ainda não aplicada no VPS.
**Branch:** `073-frieren-ds` (a partir do `master`).
**Plano de execução:** cinco fases, um commit por fase, como na Akane (spec 072).

## Problema

O shell da Frieren (`webapp/frontend/src/pages/frieren/`, ~7.300 linhas) é `legacy`: `Toast`, `TweaksPanel`,
ícones e estrelas locais, 5 modais montados à mão, `frieren.css` com 1.311 linhas de tokens próprios e cores
literais, `<input type="date">`, datas calculadas em UTC (`toISOString().slice(0,10)`) e navegação só em
estado React (a URL não muda, nada é linkável, o Voltar do navegador sai da página).

As estatísticas não fecham com o padrão:

| Sintoma | Causa |
|---|---|
| "Maior sequência" maior do que a real | o heatmap só tem dias com leitura; o código conta entradas, não dias seguidos |
| Abandonados contam como lidos; pausados aparecem em "Quero ler" | o front reduz os 7 status do backend a 4 (`FrierenShell.tsx:45-53`) |
| Notas abaixo de 3 somem do histograma | faixas fixas `5, 4.5, 4, 3.5, 3` |
| Páginas de livros excluídos entram na soma | `/stats` não faz JOIN com `books` |
| Faltam 7 das 9 métricas mínimas do DS | não há livros iniciados/abandonados, dias lendo, dias por livro, livro mais longo, meta anual |

## Decisões (do dono)

- Direção de arte **"Biblioteca élfica"** (`src/design/art/elfica.css`): papel claro, verde-floresta, prata.
- **Backend completo**, como na Akane: favoritos, data de abandono e estatísticas no contrato `StatsPayload`.
- Favoritos = **vitrine de até 4 livros** na Início **+ coração "Curti"** por livro.
- **Os 7 status reais** (Lendo, Pausado, Quero ler, Estante, Wishlist, Lido, Abandonado) viram facetas.
- **Nenhuma funcionalidade some** — só é melhorada ou adicionada.
- Rollout **em paralelo**: `pages/frieren-next/` em `/books-next`; a troca e a limpeza só na fase 5.

## O que muda

### Backend (fase 1)

- `books.liked` (coração), `books.date_abandoned` e a tabela `book_favorites(book_id, position)` (vitrine).
  Migração idempotente em `schema_pg.sql` e `scripts/migrate_frieren_ds.py` (dry-run por padrão; faz o
  backfill de `date_abandoned` a partir de `updated_at` dos livros já abandonados).
- `update_book_status` grava `date_abandoned` ao abandonar e limpa ao sair de `abandonado`.
- Nota de 0.5 a 5.0 em passos de 0.5 (antes 1.0–5.0).
- `agents/frieren/tools_stats.py`: `get_stats_payload(year, month)` no contrato `StatsPayload`, KPIs contra o
  mesmo trecho do ano anterior, páginas por dia/mês, distribuição de notas 0.5–5, rankings (gêneros, autores,
  idiomas), recordes (sequência real por dias de calendário, dia recorde, livro mais longo) e livros com coração.
  Datas em America/Sao_Paulo, soft delete fora da conta.
- Rotas novas em `/api/books`: `GET /home`, `GET|PUT /favorites`, `PATCH /{id}/like`, `GET /stats/payload`
  (durante o rollout; na fase 5 ocupa o lugar do `/stats` antigo).

### Front (fases 2–5)

Arte élfica e ícones (2) · shell novo, Início, Catálogo, Quero ler, Wishlist e Diário (3) · detalhe, Estantes,
Resenhas e Estatísticas (4) · troca do shell, remoção do legado e documentação (5).

## Paridade (nada pode sumir)

10 telas · busca no topo · adicionar livro (Google Books + fallback por título + status inicial) · editar os 15
campos · excluir livro · registrar leitura (página, +10/+25/+50, terminei com nota, data, nota do dia) · editar e
excluir sessão · resenha inline (Ctrl+Enter / Esc) · marcas coloridas (CRUD) · estantes (CRUD, adicionar/remover
livros) · link da loja na wishlist · filtros e as 7 ordenações · capa tipográfica de fallback · densidade e layout
do hero (agora em Preferências) · retrato e "Voltar à Makima".

## Critérios de sucesso

- Registrar leitura em ≤ 2 interações pela linha rápida (`Duna p. 240 ontem`).
- As 9 métricas mínimas aparecem em Estatísticas; sequência conta dias seguidos; abandonados fora de "lidos".
- `npm run audit:design` passa com a Frieren `conformant`; testes de lógica pura e de tela cobrindo os fluxos.
- Todos os itens da paridade conferidos no navegador.

## Rollout

1. Aplicar `scripts/migrate_frieren_ds.py --apply` no VPS, de dentro do `makima-web` (primeiro sem `--apply`).
2. Validar `/books-next` no uso real.
3. Só então a fase 5 (apaga o shell antigo, `/books` passa a ser o novo, `/stats` troca de contrato).

## Fora de escopo

- Upload de capa (continua por URL).
- Mudanças nas tools do agente (Telegram/Hermes) além do necessário: coração, favoritos, `date_abandoned`.
- Migração da Marin e da Mai.
