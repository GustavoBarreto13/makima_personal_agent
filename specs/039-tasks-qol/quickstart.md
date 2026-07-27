# Quickstart: validação — spec 039

Requer `DATABASE_URL` real (não executável no sandbox — mesmo padrão das specs 035–038).

## Parte A — Arquivar listas

1. Criar lista "Teste Arquivo" com 3 tarefas: 1 com `my_day_date=hoje`, 1 com
   `due_date=hoje`, 1 sem data. Adicionar uma recorrência numa delas.
2. `POST /projects/{id}/archive` — conferir 200.
3. Conferir que a lista **não aparece** em: `GET /projects` (sidebar), `GET /my-day`,
   `GET /calendar?start=hoje&end=hoje+7`, `GET /eisenhower`, `GET /views/today`,
   `GET /views/next7`. As 3 tarefas dela não aparecem em nenhuma.
4. `GET /search?q=teste` (ou o título de uma tarefa) — a tarefa **aparece**, com
   `"archived": true`.
5. `GET /projects/archived` — a lista aparece com `task_count: 3` e `archived_at` preenchido.
6. `POST /projects/{id}/restore` — 200. Repetir passo 3: a lista e as tarefas **voltam** a
   aparecer em todas as views (SC-001/SC-002).
7. Tentar arquivar o Inbox (`POST /projects/{inbox_id}/archive`) — 400.
8. Telegram: pedir "crie uma tarefa na lista Teste Arquivo" **enquanto arquivada** — a
   Kaguya deve responder que a lista está arquivada e oferecer restaurar (FR-008).

## Parte B — Localização nos eventos

1. Criar um evento no Google Calendar de hoje com endereço (ex.: "Av. Paulista, 1000,
   São Paulo").
2. `GET /my-day?date=hoje` — o evento em `eventos` (ou `_work`/`_personal`) traz
   `"location": "Av. Paulista, 1000, São Paulo"`.
3. Abrir o Meu Dia no webapp — o bloco do evento mostra o local; clicar nele abre
   `https://www.google.com/maps/search/?api=1&query=Av.%20Paulista%2C%201000%2C%20S%C3%A3o%20Paulo`
   em nova aba (SC-004 — acentos e vírgula preservados).
4. Abrir a Agenda (`CalendarScreen`), clicar no evento (popover) — mesmo local, mesmo link.
5. Criar um evento com local = uma URL de Meet (`https://meet.google.com/abc-defg-hij`) —
   o link abre essa URL diretamente, não uma busca no Maps (FR-010/cenário 4).
6. Criar um evento sem local — nenhum espaço vazio ou link quebrado aparece em nenhuma
   das 3 superfícies (FR-011).
