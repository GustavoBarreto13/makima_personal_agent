# Data Model — Calendar Hub (fatia 019)

Mudança de schema mínima (uma coluna em `tasks` + uma preferência de calendário). Tudo o mais é
**externo** (Google/conectores), **derivado na leitura** (agregação) ou **estado de UI**. Referências:
`agents/kaguya/schema_tasks_pg.sql` e o protótipo `design_handoff_kaguya_calendario/cal-data.js`.

---

## 1. Mudança de schema — `tasks.google_event_id`

| Coluna | Tipo | Papel |
|---|---|---|
| `google_event_id` | `TEXT NULL` | Id do evento espelho no calendário "Kaguya — Tarefas". `NULL` = não espelhada. |
| `google_synced_at` *(opcional)* | `TIMESTAMPTZ NULL` | Último push OK — só se houver reconcile job. |

O id do calendário espelho é **global** (resolvido por `gcal.ensure_kaguya_calendar`).

## 2. Preferência de calendário (visibilidade + cor) — persistência

A visibilidade e a cor por calendário **persistem** (FR-005). Opções (decidir na implementação):
- **Tabela** `calendar_prefs (calendar_id TEXT PK, visible BOOL, color TEXT, position INT)` no Postgres
  — recomendado (compartilha entre dispositivos; single-user). **Cor por evento** (override) só existe
  para eventos editáveis: tarefa → um campo de cor na tarefa (futuro) ou um `event.color` no evento do
  Google; nas bases read-only não há override persistido.
- Alternativa leve: `localStorage` (só local). O protótipo usa estado em memória.

---

## 3. Modelo de calendários conectados (do handoff `cal-data.js`)

### Contas (`CAL_ACCOUNTS`) — agrupam calendários
| id | nome | sub |
|---|---|---|
| `makima` | Makima · suíte | bases do app |
| `google` | gustavo@gmail.com | Google Agenda |

### Calendários (`CALENDARS`)
`{id, account, kind, name, color(oklch), avatar, visible, primary?}`

| id | conta | kind | nome | cor | fonte em produção | editável |
|---|---|---|---|---|---|---|
| `kaguya` | makima | base | Kaguya · Tarefas | `0.56 0.13 252` (azul) | `tasks` (datadas/time-block) | **sim** |
| `nami` | makima | base | Nami · Finanças | `0.70 0.17 52` (laranja) | provider Nami | não |
| `frieren` | makima | base | Frieren · Livros | `0.72 0.10 184` (teal) | provider Frieren | não |
| `akane` | makima | base | Akane · Filmes | `0.60 0.20 18` (carmim) | provider Akane | não |
| `violet` | makima | base | Violet · Diário | `0.58 0.16 300` (violeta) | provider Violet | não |
| `animes` | google | integration | Animes | `0.64 0.18 350` (rosa) | conector Animes | não |
| `futebol` | google | integration | Palmeiras / Copa | `0.60 0.15 150` (verde) | conector Futebol | não |
| `feriados` | google | integration | Feriados no Brasil | `0.72 0.135 80` (dourado) | conector Feriados | não |
| `gcal` | google | integration | Agenda pessoal | `0.58 0.13 250` (índigo) | Google Calendar principal (`gcal.py`) | **sim** |

`kaguya` é `primary: true` ("padrão"). Cores recoloríveis via paleta `CAL_SWATCHES` (as 9 cores acima
+ `oklch(0.62 0.05 280)` cinza).

---

## 4. Evento unificado (UI) e `CalendarItem` (provider/conector)

### Evento na UI (shape do protótipo)
```jsonc
{
  "id": "ce1",
  "cal": "kaguya",                // id do calendário conectado
  "day": "2026-06-11",            // YYYY-MM-DD
  "start": "14:00", "end": "15:30", // HH:MM (null/null se all-day)
  "allDay": false,
  "color": null,                  // override por evento (null = cor do calendário)
  "kind": "event" | "task",       // task → borda tracejada no grid
  "loc": "Cinemark",              // opcional
  "taskId": 123                   // quando kind=task (liga à tarefa)
}
```

### `CalendarItem` (saída normalizada de cada provider/conector)
Os providers cross-agent e os conectores externos devolvem este shape, mapeado para o evento da UI:
```jsonc
{
  "cal": "nami",                  // id do calendário/camada
  "date": "2026-06-08",           // dia (ISO) — obrigatório
  "start": "17:00", "end": "17:30", // HH:MM opcional (null = all-day)
  "all_day": true,
  "title": "Pagar Cartão Itaú",
  "kind": "event",                // event | task
  "ref_id": "456",                // id no domínio (deep-link)
  "deep_link": "/nami/...",       // rota para abrir no domínio (read-only)
  "color": null,                  // opcional; senão cor do calendário
  "loc": null
}
```

### Fontes datadas por base (cross-agent) — providers
| `cal` | Camada | Fontes datadas | Deep-link |
|---|---|---|---|
| `nami` | Finanças | `subscriptions.next_billing`, vencimentos de parcelas/cartão (`first_due`/`primeiro_vencimento`/`due_day`), `transactions.data` | `/nami/...` |
| `frieren` | Livros | `reading_logs.date` (sessões/metas), `books.date_finished` (conclusões/lançamentos) | `/books/...` |
| `akane` | Filmes | `diary_entries.watched_date` (sessões/estreias) | (tela de filmes) |
| `violet` | Diário | `journal_pages.date` (entradas) | `/journal/...` |

> Quais registros viram all-day vs timed e os títulos exibidos seguem o protótipo (ex.: Nami =
> vencimentos all-day; Frieren = "Ler 20 páginas" timed + "Meta semanal" all-day). Refinar com o
> domínio na implementação.

### Conectores externos (integrações)
| `cal` | Fonte (a definir) | Itens |
|---|---|---|
| `animes` | AniList / futuro agente `media` | próximos episódios (all-day ou com hora) |
| `futebol` | API de calendário esportivo | jogos (timed + `loc`) |
| `feriados` | BrasilAPI / tabela estática | feriados (all-day) |
| `gcal` | Google Calendar principal (`gcal.py`) | eventos da Agenda pessoal (editável) |

---

## 5. Mapeamento Tarefa → Evento espelho (Google "Kaguya — Tarefas")

Apenas tarefas-pai com `due_date` (não na lixeira):

| Condição na tarefa | Evento no Google |
|---|---|
| time-block (`start_at`/`end_at`) | evento **com hora** `start_at`–`end_at` |
| `due_time` (sem bloco) | evento **com hora**, duração `duration_min` ou 30min |
| só `due_date` | evento **dia inteiro** |
| concluída | título com prefixo **"✓ "** (reabrir remove) |
| recorrente | só a **ocorrência viva** (sem RRULE no Google) |
| soft-deleted / perdeu data | evento **removido** (restore recria) |

Upsert por `google_event_id`. Anti-duplicação: o calendário espelho e o "TickTick" ficam **fora** do
overlay de eventos do Google na UI.

---

## 6. Geometria e helpers (do protótipo — referência da UI)

- `--hh` (altura de 1h): 52px (`agora`) / 54px (`helvetico`) / 60px (`editorial`); `--gutter: 58px`;
  `--col-w: 264px` (coluna de calendários). **Snap 15min**. Grade 00h–24h, scroll inicial ~07:00.
- Helpers de tempo: `timeToMin`/`minToTime`/`fmtTime`/`fmtEst`/`d2iso`/`iso2d`/`isoAdd`/`snapMin`.
- Semana ISO calculada pelo **meio da semana** (quinta) para casar com o Notion.
