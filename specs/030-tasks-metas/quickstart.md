# Quickstart — Validação ponta a ponta: Metas

Guia de validação (não é código de implementação). Prova que a feature funciona da camada de
lógica até a UI. Detalhes de schema/endpoints em `data-model.md` e `contracts/api-goals.md`.

## Pré-requisitos

- `.venv` do makima com dependências instaladas; `DATABASE_URL` apontando para um PostgreSQL.
- Schema aplicado (as 2 tabelas novas + as 3 colunas `goal_id`) — rodar
  `python -m scripts.setup_schemas` (local) ou, no VPS, dentro do container `makima-web` (o
  hostname do Postgres só resolve lá — ver `CLAUDE.md` raiz). A 029 já deve estar aplicada.
- Cookie de sessão válido para exercitar `/api/*` (login Google no webapp).

## 1. Motor puro de progresso (pytest — sem banco)

`tests/agents/test_kaguya_goal_progress.py` deve cobrir (espelhando
`test_kaguya_experiment_adherence.py`):
- Só métrica: 3 de 12 ⇒ `metric_pct == 25`, `progress_pct == 25`.
- Só marcos: 1 de 3 ⇒ `milestones_pct == 33`, `progress_pct == 33`.
- **Métrica + marcos**: média das duas dimensões (ex.: 25 e 33 ⇒ `progress_pct == 29`).
- **Sem métrica e sem marcos**: `progress_pct is None` (meta direcional).
- **Valor acima do alvo**: 15 de 12 ⇒ `metric_pct == 100` (satura, sem erro).
- `is_overdue`/`days_remaining` respeitam o prazo e o fuso.

Rodar: `python -m pytest tests/agents/test_kaguya_goal_progress.py -q` → tudo verde.

## 2. Camada de lógica (REPL/manual)

Sequência mínima (shell Python com o ambiente do makima):
1. `create_goal("Ler 12 livros", deadline, metric_target=12, metric_unit="livros", why="...")` → `{"status":"ok","id":N}`.
2. `update_goal(N, metric_current=3)` → ok; `get_goal(N)` traz `metric_pct=25`, `progress_pct=25`.
3. `add_milestone(N, "4 livros até março")` ×3; `update_milestone(mid, done=True)` num deles →
   `get_goal(N)` traz `milestones_done/total` e o `progress_pct` combinado.
4. `link_movement(N, "experiment", X)` / `"task"`, `"habit"` → `get_goal(N).movements` agrupa por
   tipo com o status de cada item.
5. `unlink_movement("experiment", X)` → some dos movimentos; o experimento continua existindo.
6. `delete_goal(N)` → a meta some; conferir que o experimento/tarefa/hábito **continuam** (goal_id
   voltou a `NULL` via `ON DELETE SET NULL`) — SC-005.
7. Recriar e `review_goal(N, "achieved", "aprendi X")` → status `closed`, some das ativas (FR-013/015).

Conferir: datas saem como `"YYYY-MM-DD"`; "hoje"/prazo respeitam UTC-3.

## 3. REST (com webapp rodando)

`uvicorn webapp.backend.main:app --reload --port 8080`. Com o cookie de sessão:
- `POST /api/tasks/goals` (201) → criar; sem `title`/`deadline` ⇒ **422**.
- `PATCH /api/tasks/goals/{id}` → atualizar `metric_current`; `GET /{id}` → `progress_pct`.
- `POST /api/tasks/goals/{id}/milestones` + `PATCH .../milestones/{mid}` (done).
- `POST /api/tasks/goals/{id}/link` {item_type, item_id}; `POST .../unlink`.
- `GET /api/tasks/goals/{id}` → traz `milestones` + `movements`.
- `GET /api/tasks/goals/areas` → contagem de ativas por área (SC-006).
- `GET /api/tasks/goals/linkable?item_type=task` → itens vinculáveis.
- `POST .../review`; `DELETE /api/tasks/goals/{id}` (itens continuam).
- Qualquer rota **sem cookie** ⇒ **401**.

## 4. Frontend (UI)

`npm run dev` em `webapp/frontend/`. Na Kaguya:
1. Abrir a aba **Metas** (item 🎯 na sidebar).
2. Criar uma meta (título + prazo + métrica ou marcos) → aparece na lista de ativas, agrupada por área.
3. Atualizar o valor da métrica e concluir um marco → a barra de progresso reflete os dois.
4. Abrir o detalhe → **vincular** um experimento, uma tarefa e um hábito → aparecem agrupados com status.
5. Criar um experimento **a partir da meta** (FR-011) → já nasce vinculado.
6. **Desvincular** um item → some da meta, permanece na sua seção.
7. **Encerrar** com a revisão (desfecho + aprendizado) → vai para "encerradas", com vínculos históricos.
8. **Excluir** uma meta → confirma; os itens vinculados continuam existindo nas suas seções (SC-005).

## 5. Critérios de aceite cobertos

US1 (criar + métrica + marcos + progresso), US2 (vincular/desvincular movimentos + criar já
vinculado), US3 (revisão + desfecho + separação ativas/encerradas + contagem por área), e os edge
cases (prazo vencido, sem métrica/marcos, valor acima do alvo, excluir desvincula, item arquivado).

## Deploy (quando solicitado)

Aplicar o schema dentro do container `makima-web` **antes** de subir a nova imagem; conferir
`\d goals`, `\d goal_milestones` e a coluna `goal_id` em `\d tiny_experiments` / `\d tasks` / `\d habits`.
