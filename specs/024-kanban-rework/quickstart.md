# Quickstart — Validação da 024 (Kanban "Vidro" + Views)

Roteiro para provar que a feature funciona ponta a ponta. Detalhes de schema/contrato em `data-model.md` e `contracts/kanban-views.md`.

## Pré-requisitos

- PostgreSQL com o schema do Kaguya aplicado **incluindo a tabela `kanban_views`** e o seed da view "Completa".
- Backend e frontend rodando localmente (ver `webapp/CLAUDE.md`):
  ```bash
  uvicorn webapp.backend.main:app --reload --port 8080      # backend
  cd webapp/frontend && npm install && npm run dev           # frontend (5173)
  ```
- Sessão autenticada (cookie `makima_session` via Google OAuth — `ALLOWED_EMAIL`).

## Setup do schema (one-time)

No VPS, rodar **dentro do container** (o host não resolve o hostname do Postgres do Swarm):
```bash
docker exec makima-web sh -c "cd /app && python -m scripts.setup_schemas"
```
Local: aplicar o `agents/kaguya/schema_tasks_pg.sql` atualizado no banco de dev.

## Cenários de validação

### 1. Fidelidade visual na view default (A1)
- Abrir `/tasks`, selecionar uma lista **com board** e ≥1 coluna com cards.
- **Esperado:** board renderiza no estilo "Vidro" (gradiente, colunas glass com blur, numerais grandes, cards glass, rodapé-resumo) — comparável lado a lado com `design_handoff_kaguya_kanban/preview-vidro.png`. A view ativa default é **"Completa"**.

### 2. Adornos das colunas e cards (A2/A3)
- **Esperado:** numeral de contagem correto; sub-linha `Σ <tempo>` / "sem estimativa" / "concluídas"; capacity meter com nº de segmentos = `round(min(Σduration_min/240,1)*5)`; cards com barra de prioridade (respeitando tweak `pmark`), DateChip relativo (data local UTC-3; vencida em vermelho), chip de estimativa, chip de projeto, anel de subtarefas com fração; card concluído com check verde.

### 3. Performance do drag (A6/R19/R20)
- Num board com **≥30 cards**, arrastar entre colunas e reordenar dentro da coluna.
- **Esperado:** overlay segue o cursor; card se move imediatamente (optimistic); **sem spinner** no drop; movimento fluido (~60fps, sem stutter do blur); drop em "concluído" completa a tarefa (com confirmação de cascata se houver subtarefas abertas); erro de rede reverte (rollback).

### 4. Tema e motion (A5)
- Alternar `theme` light/dark no TweaksPanel → board reflete os overrides dark do handoff.
- `anim=off` → transições de hover desativadas.

### 5. CRUD de views + built-in protegida (A8)
```bash
# listar (deve conter "Completa", is_builtin=true)
curl -b cookies.txt http://localhost:8080/api/tasks/kanban-views

# criar uma view "Foco" (só cards limpos, sem capacity meter)
curl -b cookies.txt -X POST http://localhost:8080/api/tasks/kanban-views \
  -H 'Content-Type: application/json' \
  -d '{"name":"Foco","display":{"adornos":{"capacity_meter":false,"subtask_ring":true,"summary_footer":true,"card_chips":true},"slots":["abertas","tempo_estimado","em_andamento"]},"filter":null}'

# tentar deletar a built-in → deve falhar 400
curl -b cookies.txt -X DELETE http://localhost:8080/api/tasks/kanban-views/<id_da_Completa>
```
- **Esperado:** "Foco" persiste e reaparece no `GET`; DELETE/PATCH na "Completa" → HTTP 400.

### 6. Trocar de view (A9) + memória por lista (A10)
- No board, trocar para "Foco" pelo seletor → adornos/slots mudam **imediatamente** sem recarregar; **estrutura de colunas inalterada**.
- Recarregar a página → a lista reabre na "Foco" (localStorage). Trocar de lista → outra lista pode ter outra view ativa.

### 7. View com filtro (A11)
- Criar uma view com `filter` (ex.: `priority gte 2`), ativá-la.
- **Esperado:** cards de prioridade < 2 somem; contadores de coluna, capacity meter e slots do rodapé recalculam sobre o conjunto filtrado; a semântica casa com a smart-list equivalente (mesmo DSL).

## Gate automatizado

```bash
pytest tests/agents/test_kaguya_kanban_views.py -q   # CRUD, built-in protegida, filtro reusa o DSL
```
