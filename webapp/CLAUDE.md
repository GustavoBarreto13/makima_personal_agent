## Módulo: webapp

Painel web do Makima — FastAPI (backend) + React (frontend) servidos por um único container.
A API importa diretamente as tools dos agentes (`agents/nami/`, `agents/frieren/`, `agents/journal/`,
`agents/kaguya/`, `agents/akane/`, `agents/marin/`, `agents/mai/`, `agents/komi/`),
lendo e escrevendo nas mesmas tabelas PostgreSQL usadas pelo bot do Telegram.

---

### Stack

**Backend:** Python 3.12 · FastAPI + uvicorn · Authlib (Google OIDC) · itsdangerous (cookies)
**Frontend:** React 19 + TypeScript + Tailwind CSS 3 + Vite 6 · react-router-dom 7

---

### Arquitetura interna

```
webapp/
├── backend/
│   ├── main.py         # app FastAPI: registra routers, CORS (dev), SessionMiddleware, serve dist/
│   ├── config.py       # todas as env vars do módulo (SESSION_SECRET, ALLOWED_EMAIL, etc.)
│   ├── deps.py         # require_user() → valida cookie makima_session via itsdangerous
│   └── routers/
│       ├── auth.py     # /auth/login → /auth/callback → cookie ; /auth/logout ; /auth/me
│       ├── finances.py # /api/finances/* → wraps tools da Nami (PostgreSQL)
│       ├── books.py    # /api/books/*   → wraps tools da Frieren (PostgreSQL)
│       ├── journal.py  # /api/journal/* → wraps tools do Journal (PostgreSQL)
│       ├── tasks.py    # /api/tasks/*   → wraps camada de lógica da Kaguya (~96 rotas)
│       ├── movies.py   # /api/movies/*  → wraps tools da Akane (TMDB + Letterboxd)
│       ├── animes.py   # /api/animes/*  → wraps tools da Marin (Jikan/AniList + MAL)
│       ├── series.py   # /api/series/*  → wraps tools da Mai (TMDB API v4)
│       ├── pessoas.py  # /api/people/*  → wraps tools da Komi (pessoas + vínculos)
│       ├── travel.py   # /api/travel/*  → wraps tools do Yato (viagens + dossiê de mobilidade)
│       └── hub.py      # /api/hub/summary → stats agregados dos 9 agentes (só leitura)
└── frontend/
    └── src/
        ├── lib/api.ts  # fetch tipado, envia cookie automaticamente
        └── pages/      # um shell por domínio (ver pages/CLAUDE.md)
```

---

### Padrão dos routers de backend

Todo router que expõe tools de agente segue este padrão:

```python
from agents.nami.tools import create_transaction  # importa a tool diretamente

def _check_result(result: dict) -> dict:
    # tools retornam {"status": "ok"|"error", ...}
    # converte "error" em HTTP 400; deixa "ok" passar
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result

@router.post("/transactions", status_code=201)
def create_tx(body: CreateTransactionBody, user: dict = Depends(require_user)):
    return _check_result(create_transaction(**body.model_dump()))
```

Regras obrigatórias:
- `Depends(require_user)` em **todas** as rotas `/api/*` — sem exceção
- Nunca lançar HTTP 500 por dados inválidos; usar `_check_result` (400) ou validação Pydantic (422)
- Modelos Pydantic para todos os bodies de POST/PATCH — não aceitar `dict` cru

---

### Autenticação

Fluxo: `GET /auth/login` → Google OIDC → `GET /auth/callback` → cookie `makima_session`

- **SessionMiddleware** (Starlette): guarda o `state` CSRF do OAuth em `request.session`; deve ser adicionado **antes** do CORSMiddleware em `main.py`
- **Cookie `makima_session`**: payload `{"email", "name"}` assinado pelo `itsdangerous.URLSafeTimedSerializer` (salt `"makima-session"`, 7 dias). Assinar/validar usa o mesmo salt e `SESSION_SECRET` em `auth.py` e `deps.py` — nunca mudar o salt
- **Allowlist**: só o email em `ALLOWED_EMAIL` passa; comparação case-insensitive
- **`require_user()`** em `deps.py`: extrai o cookie via `Cookie(default=None)`, valida com o serializer, lança 401 para ausente/expirado/inválido

---

### Domínio: Journal (Diário pessoal — Violet)

Router: `routers/journal.py` · Lógica: `agents/journal/*` (diário) e `agents/kurisu/*` (IA da Violet) · Storage: PostgreSQL.
**Rotas: [`docs/API.md`](docs/API.md#diário-apijournal)** (fonte única). Regras que valem para quem mexe no router:

- `routers/journal.py` é o único ponto que importa Journal + Kurisu ao mesmo tempo (Tutor, Conselho do Dia, revisão
  semanal e leitura emocional são personas da Kurisu aplicadas à Violet). `GET /page` compõe o campo `tutor` de cada
  bullet **no router** (`get_bullets_tutor_meta`).
- **`GET /page` não cria a página** (spec 076): dia vazio volta com `page.id = null`; o front chama `POST /page` no
  primeiro registro. Texto vazio em `POST /bullets` apaga o bullet da posição.
- Vínculos com a Komi são sincronizados por bullet no backend (tokens `@[Nome](komi:id)`); o autocomplete de `@` usa
  `GET /people/suggest` e o de `/` usa `GET /refs/providers` + `GET /refs/search`.
- Registros emocionais e cartas são ortogonais aos bullets. `reappraised_intensity` só com `adaptive_response`
  (validado no router, HTTP 400). Salvar um registro com pensamento automático agenda a classificação de distorções
  (`BackgroundTasks`).
- Tools que devolvem lista/dict sem `status` não passam por `_check_result`; `get_or_create_page`/`ensure_page`
  devolvem `{"error"}`.

---

### Variáveis de ambiente

| Variável | Obrigatório | Descrição |
|---|---|---|
| `TMDB_API_KEY` | sim (Akane, Mai, Marin) | API key v3 do TMDB — metadados, pôsteres e thumbnails |
| `LETTERBOXD_USERNAME` | sim (sync RSS Akane) | Username público do Letterboxd para sync RSS automático |
| `SESSION_SECRET` | sim | Chave para assinar cookies (gerar com `secrets.token_hex(32)`) |
| `ALLOWED_EMAIL` | sim | Único email autorizado (ex.: `gustavobarreto1304@gmail.com`) |
| `GOOGLE_OAUTH_CLIENT_ID` | sim | Client ID do app OAuth no GCP |
| `GOOGLE_OAUTH_CLIENT_SECRET` | sim | Client Secret do app OAuth no GCP |
| `OAUTH_REDIRECT_URL` | sim | URL de callback (dev: `http://localhost:8080/auth/callback`) |
| `GCP_PROJECT_ID` | sim | Necessário para o GCS backup (e Vertex AI RAG do Kurisu) |
| `GCP_CREDENTIALS_JSON` | sim | Credenciais de serviço GCP (GCS backup + Vertex AI) |
| `DATABASE_URL` | sim | PostgreSQL compartilhado — usado por todas as tools (finanças, livros, journal) |

As variáveis de BigQuery/GCP são lidas pelas tools dos agentes diretamente do ambiente — `config.py` não as reexporta.

---

### Como rodar localmente

```bash
# Backend (na raiz do repositório) — porta 8000 em dev:
# o proxy do Vite (frontend/vite.config.ts) repassa /api e /auth para http://localhost:8000.
# A porta 8080 é a do container de produção (uvicorn servindo o dist/).
uvicorn webapp.backend.main:app --reload --port 8000

# Frontend (em webapp/frontend/)
npm install
npm run dev          # dev server em localhost:5173

# Build de produção do frontend (necessário para servir via FastAPI)
npm run build        # gera webapp/frontend/dist/
```

Em desenvolvimento o CORS libera `localhost:5173`. Em produção (container), o FastAPI monta
`frontend/dist/` como estático e CORS não é necessário (mesma origem).

---

### Padrões do frontend

#### Design System (padrão único de UI)

Telas novas e migrações usam `webapp/frontend/src/design/` (guia: [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md);
referência viva: rota `/design`; status por página: [`docs/DESIGN_CONFORMANCE.md`](docs/DESIGN_CONFORMANCE.md)).
Camadas `core/` (TS puro) → `headless/` (hooks) → `ui/` (componentes `.ds-*`, tokens `--ds-*`).
**Toda mudança de UI passa pela skill `makima-design-system`.** Comandos (em `webapp/frontend`):
`npm run tokens` (regenera `tokens.css`/`accents.css` de `tokens.json`/`agents.json`),
`npm run lint:design`, `npm run audit:design` (lint + contraste WCAG por agente × tema + manifesto ×
código; `-- --report` grava o relatório) e `npm test`. Os padrões abaixo (Kaguya) continuam valendo nos
shells legados; no padrão novo, `DatePicker`/`TimePicker`/`Field` vêm de `design/`.

#### Inputs, data e hora — padrão

Nos shells no Design System (Nami, Akane, Frieren, Marin, Kaguya, Violet) os campos vêm de `design/`: `Field`, `DatePicker`, `TimePicker`
(nunca `<input type="date|time">` nativo — o popup do sistema ignora os tokens e varia por OS/browser) e datas sempre pelas partes
**locais** do navegador (`getFullYear/getMonth/getDate`, **nunca** `toISOString().slice(0,10)` — fuso UTC-3). Popovers de campo:
fechar ao clicar fora (`mousedown` + `ref.contains`) e no `Escape`; `z-index: 70` acima dos modais.

Exceção: a **Komi** (legacy) usa `components/DatePicker.tsx` + `components/MiniCalendar.tsx`, que trazem o próprio CSS
(`components/datepicker.css`) e helpers (`components/dateUtils.ts`); saem quando a Komi migrar.

---

#### Roteamento — Shell pattern

Cada domínio com UI própria é um **Shell**: componente raiz com sidebar/navegação interna, desacoplado do `Layout` global. O roteamento usa wildcard para o Shell assumir o controle total das sub-rotas.

```tsx
// App.tsx — ordem importa: Shells específicos antes do catch-all /*
<Route path="/books/*"   element={<FrierenShell />} />   // src/pages/frieren/ (Design System, spec 073)
<Route path="/journal/*" element={<VioletShell />} />    // src/pages/violet/ (Design System, spec 076)
<Route path="/nami/*"    element={<NamiShell />} />      // src/pages/nami/
<Route path="/tasks/*"   element={<KaguyaShell />} />    // src/pages/kaguya/ (/tasks-next redireciona para cá)
<Route path="/movies/*"  element={<AkaneShell />} />     // src/pages/akane/
<Route path="/animes/*"  element={<MarinShell />} />     // src/pages/marin/ (Design System, spec 074)
<Route path="/series/*"  element={<MaiShell />} />       // src/pages/mai/
<Route path="/people/*"  element={<KomiShell />} />      // src/pages/komi/
<Route path="/"          element={<MakimaShell />} />    // src/pages/makima/ — Hub, tela cheia
<Route path="/*"         element={<Layout>...</Layout>} /> // rotas legadas
```

Ao criar um novo domínio: criar o Shell **antes** de adicionar a Route, e colocá-la **antes do `/*`**.

#### Estrutura de pasta por domínio

```
pages/<dominio>/
├── <Dominio>Shell.tsx     # raiz — sidebar, navegação, TweaksPanel
├── TweaksPanel.tsx        # painel lateral de configurações do domínio
├── <dominio>Api.ts        # wrapper tipado dos endpoints /api/<dominio>/*
├── types.ts               # interfaces TypeScript espelhando o schema do backend
├── <dominio>.css          # tokens CSS / variáveis OKLCH isoladas do domínio
├── screens/               # uma tela por seção do shell (ex.: Dashboard, Transactions)
├── modals/                # modais de criação/edição (ex.: AddModal, FormModal)
├── components/            # componentes reutilizados dentro do domínio
└── ui/                    # primitivos visuais (Charts, Icons, ProgressBar, etc.)
```

#### API client — padrão por domínio

Cada domínio tem seu próprio objeto de API que centraliza URLs e tipos. **Componentes nunca fazem `fetch` diretamente** — usam o objeto da camada de API.

```ts
// src/pages/nami/namiApi.ts — wraps /api/finances/*
import { api } from '../../lib/api'
export const namiApi = {
  getStats: (month: string) => api.get(`/api/finances/stats?month=${month}`),
  createTransaction: (body: ...) => api.post('/api/finances/transactions', body),
  // ...
}

// src/pages/violet/violetApi.ts — wraps /api/journal/*
export const violetApi = { page: (date) => api.get(`/api/journal/page?date=${date}`), ... }
```

#### `lib/api.ts` — wrapper base

`api.get / api.post / api.patch / api.put / api.del` — todos incluem `credentials: 'include'` (envia cookie de sessão) e lançam `Error` para status não-2xx. Nunca usar `fetch` nu nos componentes.

---

### Domínio: Violet (Diário pessoal — frontend)

Shell: `pages/violet/VioletShell.tsx` (Design System, arte "Papel de carta") · Rota: `/journal/*` · API: `pages/violet/violetApi.ts`.
Telas, rotas por hash e componentes: [`docs/FRONTEND.md`](docs/FRONTEND.md#violetshell--diário-srcpagesviolet--no-design-system-spec-076).

---

### Fatias de implementação

| Fatia | Descrição | Status |
|---|---|---|
| 0 | Esqueleto (main.py, Dockerfile, healthz) | ✅ |
| 1 | Autenticação Google OAuth | ✅ |
| 2 | Finanças (Nami) — todas as páginas | ✅ |
| 3 | Livros (Frieren) — shell `/books/*` (router `/api/books/*`). Reforma spec 033: página do livro editável (modal "Editar livro"), marcações coloridas (`book_bullets`), resenha inline (editor estilo Violet), gerenciamento de estantes (criar/editar/excluir + livros), Biblioteca agrupada por status com filtro lembrado + ordenação, heatmap em linha única cobrindo o ano. | ✅ |
| 4 | Journal/Diário pessoal (PostgreSQL) | ✅ |
| 5 | Tarefas/Agenda (Kaguya) — shell `/tasks` (router `/api/tasks/*`); Fase 1 lista/Kanban/Hoje + Fase 2 **datas e recorrência** (quick-add com datas pt-BR, controle de recorrência no TaskModal, glyph de repetição, exclusão escopada só-esta/série) + fatia 013: **tags** (`#tag` no quick-add, `TagChip`, editor de tags no TaskModal, `/api/tasks/tags`+`/by-tag`), **smart-lists** (filtros salvos: `FilterModal` construtor de regras, seção na sidebar + built-in "Hoje + Vencidas", `FilterScreen` com aviso de referência órfã, `/api/tasks/filters/*`) e **calendário** (`CalendarScreen` mês/semana com ocorrências virtuais das recorrentes, clique no dia → TaskModal, `/api/tasks/calendar`) + fatia 014: **hábitos** (`HabitsScreen` com anel de consistência + tendência (📈/📉/➡️) + recente, check-in de hoje e heatmap anual, `HabitModal`, `/api/tasks/habits/*`; score "caixa d'água" — EMA peso 0.1 reescalada pela meta, 3 dimensões — calculado na leitura) + fatia 016: **Meu Dia + Time-blocking** (ritual diário com capacity bar, pendências, sugestões, blocos de tempo) + fatia 017: **Eisenhower** (`EisenhowerScreen` 2×2 drag-and-drop derivada de prioridade×urgência) + fatia 018: **Command Palette ⌘K + Atalhos + Recorrência no quick-add** (`CommandPalette` overlay criar/buscar/navegar por teclado, atalhos C/Space/X/Enter na `ListScreen`, parser de recorrência pt-BR determinístico em `lib/parseTask.ts` — Vitest). Spec: `specs/011-tasks-mvp/` + `specs/012-tasks-recurrence/` + `specs/013-tasks-tags-smartlists-calendar/` + `specs/014-tasks-habitos/` + `specs/016-tasks-meudia/` + `specs/017-tasks-eisenhower/` + `specs/018-tasks-palette-atalhos/` + spec 029: **Tiny Experiments** (aba 🧪 `Experimentos` na sidebar — `ExperimentsScreen` lista ativos/concluídos com barra de aderência + check-in rápido, `ExperimentDetailScreen` tracker/pausa/retoma/revisão, `ExperimentModal` criar/editar; seção "Experimentos de hoje" no Meu Dia; endpoints `/api/tasks/experiments/*` — `list`/`due-today`/`get`/`create`/`update`/`delete`/`log`/`removeLog`/`pause`/`resume`/`review`; aderência = razão simples que perdoa falhas, calculada na leitura) + spec 030: **Metas** (aba 🎯 `Metas` na sidebar — `GoalsScreen` lista ativas agrupadas por área da vida + encerradas, `GoalDetailScreen` métrica/marcos + movimentos vinculados (experimentos/tarefas/hábitos, com vincular/desvincular + criar experimento já vinculado) + revisão, `GoalModal` criar/editar; endpoints `/api/tasks/goals/*` — `list`/`areas`/`linkable`/`get`/`create`/`update`/`delete`/`milestones`/`link`/`unlink`/`review`; progresso combina métrica (atual/alvo) + marcos, calculado na leitura; vínculo = coluna `goal_id` FK `ON DELETE SET NULL` em `tiny_experiments`/`tasks`/`habits`). | ✅ |
| 015 | Filmes (Akane) — shell `/movies/*` (router `/api/movies/*`); catálogo Letterboxd-style + TMDB + sync RSS/CSV + stats + listas + cofre. Spec: `specs/015-akane-filmes/`. | ✅ |
| 021 | Animes (Marin) — shell `/animes/*` (router `/api/animes/*`); catálogo com metadados Jikan/AniList, sync MyAnimeList (delta/full), diário de episódios, schedule de lançamentos e stats. Spec: `specs/021-marin-animes/`. | ✅ |
| 022 | Séries de TV (Mai) — shell `/series/*` (router `/api/series/*`); TMDB API v4 (Bearer), temporadas/episódios com toggle individual e por temporada, diário de sessões, upcoming e stats. Spec: `specs/022-mai-series/`. | ✅ |
| 014-pessoas | Pessoas (Komi) — shell `/people/*` (router `/api/people/*`); diretório com avatar (upload multipart), datas importantes, perfil com vínculos cross-agent (finanças, tarefas, livros, diário). Spec: `specs/014-pessoas/`. | ✅ |
| 023 | Hub (Makima) — shell em tela cheia na rota `/` (router `/api/hub/summary`); hero + 8 cards de agente com 2 stats reais cada, calculados em try/except isolado (falha vira "—", nunca 500). Substituiu o Dashboard de finanças como home. Spec: `specs/023-makima-hub/`. | ✅ |
| 024 | Kanban "Vidro" (Kaguya) — reskin glass do board (handoff fiel, perf `@dnd-kit` preservada) + **views configuráveis** (tabela `kanban_views`, `/api/tasks/kanban-views/*`): adornos visíveis + métricas do rodapé + filtro `FilterRules` opcional; view ativa lembrada por lista. Spec: `specs/024-kanban-rework/`. | ✅ frontend + backend (migração pendente no VPS) |
| 044 | **Contas Fixas (Nami)** — nova tela `/nami#contas-fixas`, separada de Assinaturas mas reaproveitando a mesma tabela `subscriptions` (`kind='conta_fixa'`, `auto_lancar` — spec 044). Cada conta fixa mostra o status do ciclo corrente (paga/pendente/atrasada/agendada, via novo `GET /recurring-status`, função pura `_cycle_status` em `tools.py`); "Marcar como paga" confirma o valor real (pode diferir do esperado), lança a despesa vinculada e rola o vencimento **atomicamente** (`mark_subscription_paid` via `get_conn()`); "Pular" rola sem lançar despesa. `Subscriptions.tsx` passa a filtrar só `kind='assinatura'` do array já compartilhado pelo shell (uma leitura só). Dashboard ganha o card "Custo fixo mensal" (contas fixas + assinaturas, anuais proporcionalizadas) com aviso "N contas a confirmar". Agente Nami (Telegram) ganha as duas tools novas e regra de classificação (serviço digital de valor fixo → assinatura; conta doméstica de valor variável → conta fixa). Migração idempotente (`subscriptions.kind`/`auto_lancar`) já rodada em produção. | ✅ |
| 047 | **Cross-agent: pessoas, calendário, Hub e lembretes (Nami)** — liga infraestrutura já pronta de especs anteriores. US1: `AddModal` ganha `PersonPicker.tsx` (busca via `komiApi.search`, cross-domain reuse) para vincular pessoas ao lançar transação (`create_transaction` já aceitava `person_ids` desde a spec 014); `query_expenses` anexa `people` por transação numa query em lote; `TxRow.tsx` mostra chips. US2 (eventos financeiros no calendário web) **já estava pronta** desde a fatia 019 — só verificação, zero código. US3: card da Nami no Hub troca "lançamentos/semana" pelo score de saúde financeira (`get_financial_health_score`, mesmo cálculo da tela, isolado em try/except próprio). US4: `POST /api/tasks/reminders` (Kaguya) expõe `create_expense_reminder` com proteção contra duplicata (mesmo título+vencimento); botão "Lembrar-me" no Dashboard da Nami. Nenhuma migração de schema. | ✅ |
| 046 | **Unificação de dívidas (Nami)** — os 3 sistemas paralelos de dívida viram 1: `financings` (webapp-only) migrado para `loans` (PRICE/SAC + 6 simuladores, antes só Telegram) via `scripts/migrate_financings_to_loans.py` (idempotente por `loans.financing_source_id`; taxa textual parseada por regex, taxa ilegível vira 0 + nota "[REVISAR TAXA]"; `financings` preservada intacta como backup). Corrigido de passagem um drift de produção: `register_loan` já gravava `account_id` numa coluna que não existia em `schema_pg.sql`. Rotas antigas `/financings` (GET/POST/DELETE) **removidas** (FR-007) — `Financings.tsx` reescrita para consumir `/loans`, com card por empréstimo (nome, taxa, saldo devedor já calculado no backend — SC-002 exige paridade exata com o Telegram), botão "Registrar parcela" (`POST /loans/{id}/payment`), painel de simuladores (quitação antecipada/amortização extra/parcela acelerada) e seção "Prioridade de quitação" (avalanche, inclui cartões). `personal_loans` (p2p) ganha camada própria `agents/nami/tools_personal_loans.py` — webapp para de acessar SQL direto (FR-006) — e as 5 tools chegam ao Telegram; `Loans.tsx` ganha "Registrar pagamento". Migração de dados roda dentro do container (mesmo procedimento das demais). | ✅ |
| 045 | **Lista de Compras (Nami)** — nova tela `/nami#lista-compras`, mobile-first (quick-add com Enter, checkbox grande com risco, contador X/N no carrinho, total estimado, remoção com 1 toque); 2 tabelas novas `shopping_lists`/`shopping_list_items` (nenhuma tabela existente tinha essa forma) e módulo novo `agents/nami/tools_shopping.py` com 9 tools, aceitando `list_id` (webapp) ou `list_name` resolvido por prefixo (Telegram) — uma implementação serve as duas portas (SC-004). "Finalizar compra" (`finish_shopping`) é **atômico** via `get_conn()`: lança a despesa (categoria Supermercado) + arquiva a lista com `transaction_id` vinculado + abre a próxima lista ativa (mesmo nome), herdando os itens não marcados. Seção "Frequentes" agrega os itens mais recorrentes nas listas já arquivadas com re-adição em 1 toque; múltiplas listas nomeadas (Mercado, Farmácia…) via seletor na topbar da tela. Agente Nami (Telegram) ganha as 9 tools + seção "LISTA DE COMPRAS" na instrução. Tabelas novas entram via `CREATE TABLE IF NOT EXISTS` em `schema_pg.sql` (aplicadas por `scripts/setup_schemas.py`, não pelo script de migração incremental). | ✅ |
| 043 | **QoL do webapp (Nami)** — edição de transação reaproveitando o `AddModal` em modo dual (botão editar em `TxRow.tsx`, ao lado da lixeira; descoberto de passagem: `update_transaction` nunca atualizava `account_id`/`card_id`, só o campo display `conta` — corrigido). Edição de contas/cartões/assinaturas via `FormModal` com `initialValues` (`update_account`/`update_credit_card` já existiam sem endpoint HTTP — só faltava expor `PATCH /accounts/{id}`/`PATCH /cards/{id}`). Exportação CSV do extrato (`GET /transactions/export`, `;` + BOM UTF-8 para Excel pt-BR) e filtro de categorias completo (`GET /categories` em vez de só as presentes no mês) + persistência de filtro/ordenação em `localStorage`. Transferências entre contas (`Accounts.tsx` ganha botão "Transferir" + `TransferModal.tsx`; `create_transfer` grava par atômico `tipo='Transferencia'` via `get_conn()` — excluído de receita/despesa nos relatórios como consequência do filtro `tipo IN ('Despesa','Receita')` já existente em stats/health/trend/budgets, sem precisar tocar nesse código). Dashboard ganha card "Ritmo de gastos" (heatmap SVG mensal, `HeatmapMonth` em `ui.tsx`, usa `stats.daily_spending` já existente). Paginação de `/transactions` (`limit`/`offset`, `has_more`) com "Carregar mais" em `Transactions.tsx` (página inicial de 300). | ✅ |
| 042 | **Dashboard — health score, tendência e pagamento de fatura (Nami)** — Dashboard ganha o card "Saúde financeira" (score 0-100 + 4 dimensões — Poupança/Dívidas/Orçamento/Tendência — via `GET /health`, reusando o `Donut` de `ui.tsx`) e o card "Tendência de gastos" (evolução mensal + projeção do mês corrente via `GET /trend`, novo componente `AreaTrend` em `ui.tsx` — gráfico de área SVG próprio, sem lib externa); falhas de cada card são isoladas (try/catch próprio, resto do Dashboard não quebra). Tela Cartões ganha "Registrar pagamento" por cartão (`POST /cards/{id}/payment`) e a barra de utilização do limite — antes hardcoded em 0% — passa a usar `divida_atual`/`utilizacao_pct` (campos que `GET /cards` já retornava e o frontend nunca consumia). `GET /summary` permanece sem UI (redundante com `/stats`) — uso documentado como exclusivo do agente. Corrigido de passagem: `GET /health` usava `date.today()` (UTC do servidor) para o mês padrão — trocado por `_today_date()` (America/Sao_Paulo, spec 040); outros 3 pontos do router com o mesmo bug ficaram para uma correção separada. | ✅ |
| 041 | **Parcelamentos (Nami)** — shell `/nami#parcelamentos`; tela nova com lista de compras parceladas ativas (progresso X/N, valor da parcela, restante), drill-down por compra com linha do tempo das parcelas (`GET /api/finances/installments/{id}`, mês corrente destacado), criação aceitando conta **ou** cartão de crédito (`create_installment` ganhou `card_id`), cancelamento de parcelas futuras (`POST .../cancel`) e exclusão total, ambos com confirmação; card "Compromissos futuros" (3 meses, reusa `GET /commitments/{month}`); tela Cartões ganha seção "Parcelamentos ativos" por cartão com comprometimento mensal (`GET /api/finances/cards/{id}/installments`) e navegação para o drill-down; **o modal "Nova transação" (`AddModal.tsx`, único componente reusado em todas as telas) ganhou o checkbox "Parcelar esta compra"** — com conta/cartão explícitos e nº de parcelas, chama `createInstallment` em vez de `createTransaction`, sem precisar passar pela tela Parcelamentos. Migração idempotente (`installment_groups.account_id`/`card_id`) já rodada em produção. | ✅ |
| 025 | **Kanban de Grupo + melhorias de board (Kaguya)** — (a) **Board de grupo** (`GroupBoardScreen`): colunas unificadas por nome entre todas as listas do grupo; DnD move o status dentro da própria lista do card; card mostra chip da lista; balde "Sem coluna" (somente leitura); `GET /api/tasks/groups/{id}/board`. (b) **Navegação de grupo na sidebar**: nome do grupo abre o board; ícone ⚙ no hover edita/exclui. (c) **Seletor de board no topbar**: dropdown aparece em `view=kanban` e `view=group`; grupos como `<optgroup>` com opção "📋 Board do grupo" + listas filhas; valores prefixados `l:<id>` / `g:<id>`. (d) **Copiar colunas de outro board**: estado vazio "Sem board ainda" ganha seletor "ou copiar de…" + botão "Copiar" que chama `POST /api/tasks/projects/{id}/copy-columns`; copia nomes+ordem+`is_done_column` em transação atômica; só aparece se existir ≥1 outro board. (e) **"+ Adicionar tarefa" por coluna também no board de grupo**: `AddTaskModal` generalizado para aceitar N destinos (`AddTaskTarget[]`) — no board de lista continua com destino único (sem seletor); no board de grupo mostra um seletor de lista (uma coluna unificada agrega os `column_id` de várias listas), com a última lista escolhida lembrada por grupo (`localStorage: kaguya:group:add-list:<id>`); oculto na coluna concluída e no balde "Sem coluna" nos dois boards. Spec: `specs/025-task-list-rework/`. | ✅ |
| 066 | **Yato (viagens)** — router `/api/travel/*` (`webapp/backend/routers/travel.py`): viagens + roteiro dia a dia, dossiê de mobilidade (protocolo de 7 passos), matriz de conforto (motor puro `comfort_matrix.py`), checklist pré-viagem e orçamento com lançamento atômico de gastos na Nami (`log_trip_expense`). Card do Yato no Hub (próxima viagem + prontidão do dossiê). Shell `/travel/*` (`pages/yato/`) portado do design handoff — estética "caderno de bordo/dossiê", `MobilityDossier` componente-assinatura + `ProtocolWizard` um passo por vez. | ✅ backend + front-end |
| 069 | **Calendar Hub → Google Calendar (espelho)** — impacto no webapp da spec 069 (motor em `agents/kaguya/gcal_mirror.py`). `calendar_sources_route` (`routers/tasks.py`): `_SKIP_NAMES` (= `gcal.MIRRORED_SOURCES.values()` + `"TickTick"`) esconde os 7 calendários-espelho da injeção de fontes Google — a fonte do hub já os representa na seção "Makima"; e `"Kaguya — Hábitos"` (spec 067) é **reformatado** para essa seção (`account:"makima"`, `kind:"base"`, `name:"Kaguya · Hábitos"`, inserido após a fonte `kaguya`) mantendo `id: "gcal:<id>"` — os alertas são eventos recorrentes reais do Google e continuam vindo por `/calendar/events` + filtro client-side. `CalendarsAside.tsx`: botão de contexto 💼/🏠 e âncora do aviso `firstGcalId` passam a exigir `cal.kind === 'integration'` (não só `isGcal(id)`). Sem migração; sem mudança de schema. | ✅ backend + front-end |
| DS | **Design System Makima (fundação)** — `src/design/` + rota `/design`: tokens, tema global, `AppShell`, `Hero`, coleções (filtros/agrupar/ordenar), captura rápida, `StatsPage`, estrelas 0–5 com meia estrela, ícones Lucide, camadas/feedback, paleta `Ctrl+K`; auditoria `audit:design`; skill `makima-design-system`. Nenhum shell migrado ainda. Guia: `docs/DESIGN_SYSTEM.md` | ✅ fundação |
| 071 | **Nami simples** — reconstrução de `pages/nami/` sobre o Design System (`conformant`): Início "Livre pra gastar", Lançamentos, Cartões por fatura, Recorrentes (conta fixa + assinatura + salário), Resumo (`StatsPage`) e Mais (Contas, Parcelamentos, Empréstimos, Orçamentos, Lista de compras); lançador único (linha rápida + formulário); Desfazer em tudo que dá. Novas rotas `/plan`, `/suggest`, `/accounts/overview`, `/cards/{id}/invoices`, `DELETE /transfers/{id}`; `/stats` agora é `?year=` no contrato `StatsPayload`. Páginas e `Layout` antigos removidos (rotas antigas redirecionam). Spec: `specs/071-nami-simples/`. | ✅ (migração dos dados antigos no VPS pendente) |
| 072 | **Akane no Design System** — `pages/akane/` reconstruída sobre o padrão (`conformant`, arte "Cinema noir"): Início, linha rápida de logar, Filmes/Quero ver/Diário em `useCollection`, detalhe em `DetailPage`, Listas, Etiquetas e Estatísticas (`StatsPage`); rotas por hash (`#filme/<id>`). `GET /api/movies/stats` agora é o `StatsPayload` (une Stats e Rewind; `/rewind` removido). Shell antigo apagado. Spec: `specs/072-akane-ds/spec.md`. | ✅ (migração aplicada no VPS) |
| 073 | **Frieren no Design System** — `pages/frieren/` reconstruída sobre o padrão (`conformant`, arte "Biblioteca élfica"): Início no modelo da Akane (vitrine de favoritos + coração), linha rápida de registrar leitura, Biblioteca com os 7 status, Quero ler, Wishlist, Diário, detalhe em `DetailPage` (resenha, sessões, marcações), Estantes, Resenhas e Estatísticas (`StatsPage`); rotas por hash (`#livro/<id>`). Rotas novas `/home`, `/favorites`, `/{id}/like`, `/{id}/restore`, `/{id}/logs/restore`; `GET /api/books/stats` agora é o `StatsPayload`. `booksApi` saiu de `lib/api.ts` (agora `pages/frieren/frierenApi.ts`). Spec: `specs/073-frieren-ds/spec.md`. | ✅ (migração aplicada no VPS) |
| 076 | **Violet no Design System** — `pages/violet/` reconstruída sobre o padrão (`conformant`, arte "Papel de carta"): escrever pensado para o celular (barra acima do teclado, autosave, toque para editar), fontes Normal/Roteiro/Cursiva por dia e por carta, `@` com autocomplete da Komi (vínculo sincronizado), `/` cita itens da Kaguya/Akane/Frieren/Marin/Mai/Yato, Arquivo só com dias escritos, abas Cartas e Registro emocional (com análise), Refletir no modelo do Journalistic, Insights com a força da escrita, Avaliação dos Valores, Conselho do Dia reescrito e revisão semanal pelo Hermes. Spec: `specs/076-violet-ds/spec.md`. | ✅ (rodar `scripts/cleanup_violet_empty_pages.py` no VPS) |
| 074 | **Marin no Design System** — `pages/marin/` reconstruída sobre o padrão (`conformant`, arte "Neon kawaii"): Início (hero "continue assistindo", vitrine de favoritos), linha rápida de logar episódio (`Frieren ep 12 ★4.5 ontem`), Catálogo, Quero assistir, Diário, Lançamentos, detalhe em `DetailPage`, Listas, Etiquetas e Estatísticas (`StatsPage`); rotas por hash (`#anime/<id>`). Nota: meia estrela = 1 ponto do MAL. Rotas novas `/favorites`, `/{id}/like`, `/{id}/restore`, `/logs/restore`; `GET /api/animes/stats` agora é o `StatsPayload` (une Stats e Rewind; `/rewind` removido). Spec: `specs/074-marin-ds/spec.md`. | ✅ (migração aplicada no VPS em 08/out) |
| 6 | Painel de chat (Makima) | — |

---

### O que NÃO fazer aqui

- **Não mexer em `agents/<domínio>/`, `mcp_servers/` ou `coordinator/` só para servir a tela** — o router é uma fachada fina sobre as tools. Quando a tela precisa de dado ou regra nova, a mudança vai na camada de lógica do agente (como nas specs 071 Nami, 072 Akane e 073 Frieren), sem quebrar as tools que o agente do Telegram/Hermes já usa
- **Não instanciar** o ADK (`InMemoryRunner`, `Agent`) fora da Fatia 6 (chat) — os routers 2/3/4/5 chamam tools Python puras
- **Não registrar** routers sem o `Depends(require_user)` em todas as rotas — vazamento de dados financeiros
- **Não usar `git add .`** ao commitar — `webapp/frontend/dist/` (build) não vai para o git (está no `.gitignore`)
- **Não expor `SESSION_SECRET` em logs** — nunca fazer `logging.info(config.SESSION_SECRET)`
- **Não usar `_check_result`** nos endpoints do journal que retornam lista/dict diretamente (`list_heatmap`, `list_mentions`, `get_bullets_by_mention`, `search_bullets`) — essas tools não têm campo `"status"`
- **Não confundir o schema de erro do journal**: `get_or_create_page` retorna `{"error": "..."}`, não `{"status": "error"}` — verificar `result.get("error")` explicitamente
- **Não fazer `fetch` diretamente em componentes React** — usar o `*Api` do domínio (`namiApi`, `frierenApi`, `violetApi`…) ou `api.*` de `lib/api.ts`
- **Não adicionar rotas de novo Shell após o `/*`** em `App.tsx` — o catch-all capturaria a rota antes do Shell
- **Não criar arquivos em `frontend/dist/`** — é artefato de build; tudo que precisa ser servido deve ir em `frontend/public/` (imagens de personagens, ícones) ou em `/uploads/icons/` (ícones de conta enviados via webapp)
