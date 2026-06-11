# Data Model — Tasks MVP (011)

O schema completo (DDL, índices, constraints, decisões transversais) está na master:
[`specs/010-kaguya-tasks-app/data-model.md`](../010-kaguya-tasks-app/data-model.md).
Este documento registra apenas o **delta da Fase 1**: o que é aplicado, o que fica
adormecido e as regras de estado que a camada de lógica implementa agora.

## Aplicação

- **Arquivo**: `agents/kaguya/schema_tasks_pg.sql` — transcrição fiel do DDL da master
  (todas as tabelas, de uma vez — FR-001).
- **Aplicador**: `scripts/setup_schemas.py` ganha a chamada para o novo arquivo
  (idempotente: `CREATE TABLE IF NOT EXISTS`, executado de dentro do container no VPS).
- **Seed**: `INSERT INTO task_projects (name, is_inbox, icon) VALUES ('Inbox', TRUE, '📥')`
  protegido pelo índice único parcial `uq_task_projects_inbox`.

## Tabelas ativas nesta fase

| Tabela | Uso no MVP |
|---|---|
| `task_project_groups` | grupos na sidebar (CRUD completo) |
| `task_projects` | CRUD + regras do Inbox (indelével, inarquivável, destino de capturas órfãs) |
| `task_columns` | Kanban: CRUD de colunas, no máximo uma `is_done_column` por projeto |
| `tasks` | CRUD completo; campos de recorrência/Meu Dia ficam NULL |
| `task_tags`, `task_tag_links` | criadas, **sem UI** (Fase 2); a camada de lógica ainda não as expõe |

## Tabelas adormecidas (criadas, intocadas até a fase indicada)

`task_recurrences` (012) · `task_filters` (012) · `habits`, `habit_checkins` (014).

## Regras de estado implementadas na camada de lógica (Fase 1)

| Regra | Comportamento |
|---|---|
| Estados derivados | aberta = `completed_at IS NULL AND deleted_at IS NULL`; vencida = aberta com `due_date < hoje`; sem coluna `status` |
| Completar pai | com subtarefas abertas → exige `cascade=True` explícito (o canal pergunta antes); completa filhas na mesma transação |
| Reabrir | limpa `completed_at`; reabrir subtarefa de pai concluído é bloqueado (sugerir reabrir o pai) |
| Soft delete | seta `deleted_at`; restauração limpa o campo; toda leitura filtra `deleted_at IS NULL` |
| Excluir projeto | exige escolha: `move_to_inbox=True` (re-projeta tarefas) ou exclusão em cascata (soft delete das tarefas + DELETE das colunas); Inbox bloqueado |
| Mover entre projetos | destino com board → primeira coluna por `position`; sem board → `column_id = NULL` |
| Coluna done | mover card para ela = completar (mesma função `complete_task`); excluir coluna → tarefas ficam com `column_id = NULL` |
| Posições | esparsas ×1000; média inteira ao inserir entre vizinhos; renormalização transacional do escopo quando a diferença < 1 |
| Captura órfã | sem projeto resolvido → Inbox (`SELECT id FROM task_projects WHERE is_inbox`) |
| Atomicidade pagamento | `complete_task` + insert de despesa (helper da Nami) no mesmo cursor/commit |

## Validações de entrada (camada de lógica)

- `title` obrigatório, não-vazio após trim.
- `priority` ∈ {0,1,2,3}.
- `due_time` exige `due_date` (constraint no banco, validada antes para erro amigável).
- `parent_id`: subtarefa não pode ter subtarefa própria nesta fase (1 nível — validado
  na lógica; o banco permite mais para extensão futura).
- IDs inexistentes → `{"status": "error", "message": ...}` em português, nunca exceção crua.
