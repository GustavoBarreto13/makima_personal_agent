# Tasks: Foco / Pomodoro — timer por tarefa e estatísticas (Kaguya)

**Input**: Design documents from `specs/037-tasks-focus-pomodoro/`
**Prerequisites**: plan.md, research.md, data-model.md, contracts/rest-api.md, quickstart.md

Sem testes automatizados (nenhuma suíte no repo — padrão das specs 024–036); validação via
`quickstart.md` + `tsc -b --force`.

## Phase 1: Setup

- [X] T001 Adicionar tabelas `focus_sessions` (+ índice único parcial `uq_focus_sessions_open`
      + índice `idx_focus_sessions_started_at`) e `focus_prefs` (+ seed `id=1`) em
      `agents/kaguya/schema_tasks_pg.sql`, conforme `data-model.md`.

## Phase 2: Foundational (motor puro + camada de lógica)

- [X] T002 Criar `agents/kaguya/focus_stats.py` — função pura `aggregate_by_day(sessions:
      list[dict]) -> dict[str, dict]` que recebe sessões já carregadas
      (`{date_local, duration_focused_min}`) e devolve `{date: {total_min, sessoes}}`;
      seguir o estilo docstring/Example de `capacity.py`.
- [X] T003 Criar `agents/kaguya/tools_focus.py` com:
      - `_serialize_session(row)` — monta o dict de resposta incluindo `task_title` (join
        opcional com `tasks`).
      - `_close_if_abandoned(cur, session_row) -> dict` — implementa R2: se vencida, fecha com
        `completed=false` e `ended_at = started_at + duration_planned_min`.
      - `get_focus_prefs() -> dict`.
      - `_derive_phase(session_row) -> dict` — calcula `phase` (`"foco"`/`"pausa"`) e
        `remaining_sec` a partir de `started_at`/`duration_planned_min`/`break_planned_min`
        (R1).
- [X] T004 Em `agents/kaguya/tools_focus.py`, implementar `get_active_session() -> Optional[dict]`
      — busca a linha com `ended_at IS NULL`; se existir, chama `_close_if_abandoned` primeiro;
      se ainda ativa após isso, retorna serializada com `_derive_phase`; senão `None`.
- [X] T005 Reexportar as funções novas de `tools_focus.py` em `agents/kaguya/tools.py`
      (bloco `from agents.kaguya.tools_focus import (...)  # noqa: F401`).

**Checkpoint**: schema criado, motor de estatísticas e leitura de sessão ativa prontos —
nenhuma sessão pode ser criada ainda (isso é US1).

---

## Phase 3: User Story 1 - Focar numa tarefa com a duração que eu escolher (Priority: P1) 🎯 MVP

**Goal**: iniciar, concluir antecipadamente e cancelar sessões; presets e custom; sessão
avulsa; preferência lembrada.

**Independent Test**: iniciar foco 25/5 numa tarefa e deixar terminar; iniciar custom 15min e
concluir antes; iniciar terceiro e cancelar — só os dois primeiros no histórico.

- [X] T006 [US1] Em `tools_focus.py`, implementar `start_session(task_id: Optional[int],
      focus_min: int, break_min: int, force: bool = False) -> dict` — dentro de uma
      transação: se existe sessão ativa e `not force`, retorna
      `{"status": "error", "message": "já existe uma sessão de foco ativa"}`; se `force`,
      fecha a anterior (`ended_at=now()`, `completed=false`) antes de abrir a nova; sempre
      atualiza `focus_prefs` com os valores recebidos (R4); insere e retorna a sessão
      serializada.
- [X] T007 [US1] Em `tools_focus.py`, implementar `finish_session(session_id: int, note:
      Optional[str] = None) -> dict` — calcula `duration_focused_min = min(duration_planned_min,
      minutos decorridos)`, seta `ended_at=now()`, `completed=true`, `note`; erro se a sessão
      não existe ou já está fechada.
- [X] T008 [US1] Em `tools_focus.py`, implementar `cancel_session(session_id: int) -> dict` —
      seta `ended_at=now()`, `completed=false`, sem nota; mesma validação de T007.
- [X] T009 [US1] [P] Rotas REST em `webapp/backend/routers/tasks.py`: `GET /focus/prefs`,
      `GET /focus/active`, `POST /focus/start`, `POST /focus/{id}/finish`,
      `POST /focus/{id}/cancel` — Pydantic models `StartFocusBody`, `FinishFocusBody`;
      `_check_result` nas que retornam `{"status": ...}`; `/focus/active` retorna o dict ou
      `null` direto (sem `_check_result`, como `list_my_day`).
- [X] T010 [US1] [P] Em `webapp/frontend/src/pages/kaguya/types.ts`, adicionar `FocusSession`,
      `FocusPhase = 'foco' | 'pausa'`, `FocusPrefs`.
- [X] T011 [US1] [P] Em `webapp/frontend/src/pages/kaguya/kaguyaApi.ts`, adicionar
      `kaguyaApi.focus.{prefs, active, start, finish, cancel}`.
- [X] T012 [US1] Criar `webapp/frontend/src/pages/kaguya/modals/FocusStartModal.tsx` — escolhe
      preset (25/5, 50/10) ou custom, mostra `task_title` se veio de uma tarefa, ação
      "Iniciar" (chama `kaguyaApi.focus.start`; se 409, confirma e reenvia com `force: true`).
- [X] T013 [US1] Adicionar botão "Focar" nas linhas de tarefa (`components/TaskRow.tsx`) e no
      detalhe da tarefa (`modals/TaskModal.tsx`), abrindo `FocusStartModal` com o `task_id`;
      adicionar entrada "Foco avulso" em algum ponto de acesso geral (ex.: `KaguyaShell.tsx`,
      próximo ao botão de tweaks) que abre o mesmo modal sem `task_id`.

**Checkpoint**: US1 completo e testável isoladamente — sessões podem ser iniciadas, concluídas
e canceladas via API, mesmo sem o widget flutuante ainda (widget é US2).

---

## Phase 4: User Story 2 - O timer me acompanha pelo painel inteiro (Priority: P1)

**Goal**: widget flutuante persistente, tempo derivado do relógio real, sobrevive a
reload/navegação.

**Independent Test**: iniciar foco, navegar por 3 telas conferindo o widget, dar F5 e conferir
tempo restante correto.

- [X] T014 [US2] Criar `webapp/frontend/src/pages/kaguya/components/FocusWidget.tsx` —
      recebe a sessão ativa via prop (ou busca sozinho, decisão de implementação), deriva
      `remaining_sec` localmente com `setInterval(1000)` a partir de `started_at` recebido do
      servidor (nunca conta do zero na tela — R1); mostra fase, tarefa (ou "avulso"), tempo
      formatado `MM:SS`, ações "Concluir" e "Cancelar"; ao esgotar o tempo de foco, muda
      visualmente para "pausa" sem nova chamada ao servidor (a fase já é derivável
      localmente a partir do mesmo timestamp).
- [X] T015 [US2] Em `KaguyaShell.tsx`: estado `activeFocus: FocusSession | null`, buscar em
      `GET /focus/active` no mount e sempre que um `FocusStartModal` iniciar uma sessão com
      sucesso; montar `<FocusWidget />` fora do switch de views (mesmo nível de `<Toast />`),
      passando `activeFocus` e callbacks `onFinish`/`onCancel` que chamam a API e limpam o
      estado.
- [X] T016 [US2] [P] Poll de segurança: em `KaguyaShell.tsx`, re-chamar `GET /focus/active` a
      cada ~30s enquanto há sessão ativa (cobre o caso de a sessão ter sido fechada por
      abandono em outra aba/dispositivo) — apenas para ressincronizar, não para contar o
      tempo (isso continua sendo local, R1).

**Checkpoint**: US1 + US2 juntos já entregam o ciclo completo de uso diário do pomodoro.

---

## Phase 5: User Story 3 - Ver quanto foquei hoje e na semana (Priority: P2)

**Goal**: resumo do dia e da semana no Meu Dia; histórico de sessões de um dia.

**Independent Test**: completar 2 sessões hoje, conferir "Focado hoje: 40min · 2 sessões" e a
série da semana; listar sessões do dia com tarefa/horário/duração.

- [X] T017 [US3] Em `tools_focus.py`, implementar `list_sessions_for_range(start_date: str,
      end_date: str) -> list[dict]` — query com `COALESCE(ended_at, now()) AT TIME ZONE
      'America/Sao_Paulo'` para `date_local` (R6), incluindo sessões ativas (contam parcial
      no dia de hoje) e fechadas com `completed=true` (canceladas/abandonadas não entram —
      FR-005/SC-003).
- [X] T018 [US3] Em `tools_focus.py`, implementar `get_focus_today() -> dict` e
      `get_focus_week() -> dict` usando `list_sessions_for_range` + `focus_stats.aggregate_by_day`.
- [X] T019 [US3] Em `tools_focus.py`, implementar `get_focus_history(date_str: Optional[str] =
      None) -> list[dict]` — sessões concluídas (`completed=true`) do dia local pedido
      (default hoje), com `task_title`, `started_at`, `duration_focused_min`, `note`.
- [X] T020 [US3] [P] Rotas REST em `webapp/backend/routers/tasks.py`: `GET /focus/today`,
      `GET /focus/week`, `GET /focus/history`.
- [X] T021 [US3] [P] Em `kaguyaApi.ts` e `types.ts`, adicionar `focus.today`, `focus.week`,
      `focus.history` e os tipos `FocusDayStats`, `FocusWeekStats`, `FocusHistoryEntry`.
- [X] T022 [US3] Em `webapp/frontend/src/pages/kaguya/screens/TodayScreen.tsx` (Meu Dia),
      adicionar seção "Focado hoje" (tempo total + contagem de sessões) e uma mini-série dos
      últimos 7 dias; buscar via `kaguyaApi.focus.today`/`week` no mount da tela.

**Checkpoint**: todas as 3 user stories entregues e testáveis independentemente.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T023 [P] Atualizar `agents/kaguya/CLAUDE.md`: árvore de arquivos (`focus_stats.py`,
      `tools_focus.py`) + nova seção "Foco / Pomodoro (spec 037)" documentando o modelo
      "nada persistido derivado" (fechamento automático de sessão abandonada calculado na
      leitura) e o padrão de widget persistente no shell.
- [X] T024 [P] Atualizar `webapp/docs/API.md` com as 8 rotas novas de `/focus/*`.
- [X] T025 [P] Atualizar `webapp/docs/FRONTEND.md` descrevendo `FocusWidget`,
      `FocusStartModal` e a seção "Focado hoje" do Meu Dia.
- [X] T026 Atualizar `ROADMAP.md`: nova linha da fase 037 (✅) na tabela de Fases, atualizar
      "Status atual", remover a linha de pendência "⏳ 037" da tabela de Pendências.
- [X] T027 Validação estática: `python -m py_compile` (ou import) dos módulos novos
      (`focus_stats.py`, `tools_focus.py`) e `agents.kaguya.tools`/`webapp.backend.main` com
      env vars dummy (mesmo procedimento das specs 035/036 — sem Postgres real no sandbox);
      `tsc -b --force` no frontend.
- [ ] T028 Executar os 6 cenários de `quickstart.md` contra um PostgreSQL real (VPS ou dev
      DB) — migração do schema (`focus_sessions`/`focus_prefs`) já aplicada; falta rodar os
      cenários de validação um a um (não executável neste ambiente — sem `DATABASE_URL`
      configurado neste sandbox).

## Dependencies & Execution Order

- **Setup (T001)** → bloqueia tudo.
- **Foundational (T002–T005)** → bloqueia todas as user stories.
- **US1 (T006–T013)** é o MVP — nenhuma dependência de US2/US3.
- **US2 (T014–T016)** depende de US1 existir (precisa de sessões para exibir), mas é um
  incremento de UI puro — nenhuma tabela/rota nova.
- **US3 (T017–T022)** depende apenas da Foundational (lê `focus_sessions` diretamente) —
  poderia ser feita em paralelo a US2 se necessário, mas faz mais sentido sequencial (US1 →
  US2 → US3) para ter dados reais para testar o resumo.
- **Polish (T023–T028)** por último.

## Parallel Example

Dentro de US1, T009 (rotas), T010 (types) e T011 (api client) podem rodar em paralelo (arquivos
diferentes) assim que T006–T008 (lógica de negócio) estiverem prontos.

## Implementation Strategy

**MVP scope**: Setup + Foundational + US1 já entrega o núcleo utilizável via API (sem UI de
widget ainda) — mas como o objetivo do usuário é usar no dia a dia, o MVP prático real é
Setup + Foundational + US1 + US2 (ciclo completo com timer visível). US3 (estatísticas) é
incremento visível separado.
