# Quickstart — Validação ponta a ponta: Tiny Experiments

Guia de validação (não é código de implementação). Prova que a feature funciona da camada de
lógica até a UI. Detalhes de schema/endpoints em `data-model.md` e `contracts/api-experiments.md`.

## Pré-requisitos

- `.venv` do makima com dependências instaladas; `DATABASE_URL` apontando para um PostgreSQL.
- Schema aplicado (as 2 tabelas novas) — rodar `python -m scripts.setup_schemas` (local) ou,
  no VPS, dentro do container `makima-web` (o hostname do Postgres só resolve lá — ver
  `CLAUDE.md` raiz).
- Cookie de sessão válido para exercitar `/api/*` (login Google no webapp).

## 1. Motor puro de aderência (pytest — sem banco)

`tests/agents/test_kaguya_experiment_adherence.py` deve cobrir (espelhando
`test_kaguya_habit_strength.py`):
- 3 de 4 períodos cumpridos ⇒ `adherence_pct == 75`.
- **Uma falha isolada não zera**: 6 cumpridos em 7 ⇒ `adherence_pct == 86`, `> 0`.
- Cadência **semanal**: `period_date` normaliza para a segunda-feira; 1 check-in/semana conta 1 período.
- **Períodos pausados** não entram em `periods_expected` (D4/FR-017).
- `periods_expected` nunca passa do total entre `start` e `min(hoje,end)`.

Rodar: `python -m pytest tests/agents/test_kaguya_experiment_adherence.py -q` → tudo verde.

## 2. Camada de lógica (REPL/manual)

Sequência mínima (em um shell Python com o ambiente do makima):
1. `create_experiment("Vou meditar 5 min", start, end, cadence="daily")` → `{"status":"ok","id":N}`.
2. `log_experiment(N, hoje, done=True, feeling=4)` → ok; **repetir** com `done=False` ⇒ o
   registro de hoje é **atualizado** (upsert), não duplicado (FR-006).
3. `log_experiment(N, ontem, done=True)` → backfill aceito (FR-005).
4. `list_experiments()` → o item traz `adherence_pct`, `periods_done/expected`, `logged_current`.
5. `pause_experiment(N)` → status `paused`; `list_experiments_due_today()` **não** o traz (FR-014).
6. `resume_experiment(N)` → status `active`; `paused_period_days` acumulou.
7. `review_experiment(N, "pivot", "aprendi X")` → status `completed`, some dos ativos (FR-010/012).

Conferir: datas saem como `"YYYY-MM-DD"`; "hoje" respeita UTC-3.

## 3. REST (com webapp rodando)

`uvicorn webapp.backend.main:app --reload --port 8080`. Com o cookie de sessão:
- `POST /api/tasks/experiments` (201) → criar; `end_date < start_date` ⇒ **400**.
- `POST /api/tasks/experiments/{id}/log` → check-in; `feeling=9` ⇒ **422**.
- `GET /api/tasks/experiments/{id}` → traz `logs`.
- `GET /api/tasks/experiments/due-today` → só ativos pendentes do período.
- `POST .../pause` e `.../resume`; `POST .../review`.
- Qualquer rota **sem cookie** ⇒ **401**.

## 4. Frontend (UI)

`npm run dev` em `webapp/frontend/`. Na Kaguya:
1. Abrir a aba **Experimentos** (item 🧪 na sidebar).
2. Criar um experimento (fórmula + datas + cadência) → aparece na lista de ativos, aderência 0%.
3. Check-in rápido de hoje (fez? + sensação) → aderência atualiza.
4. Abrir o detalhe → ver o **tracker** (logs) e fazer **backfill** de um dia passado.
5. **Pausar** e **retomar** pelo detalhe.
6. **Concluir** com a revisão (veredicto + aprendizado) → vai para "concluídos".
7. Em **Meu Dia**: o experimento ativo do dia aparece com check-in de 1 toque e **some**
   após registrado.

## 5. Critérios de aceite cobertos

US1 (criar + check-in + aderência), US2 (revisão + veredicto), US3 (Meu Dia), e os FRs de
pausa (FR-017), semana de calendário (Q2), backfill (Q3), upsert (FR-006), fuso UTC-3 (FR-016).

## Deploy (quando solicitado)

Aplicar o schema dentro do container `makima-web` **antes** de subir a nova imagem; conferir
`\d tiny_experiments` e `\d tiny_experiment_logs`.
