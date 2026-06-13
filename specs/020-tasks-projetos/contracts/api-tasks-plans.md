# Contrato REST — `/api/tasks/plans/*` + PARA (020)

Router: `webapp/backend/routers/tasks.py` (estendido). Padrões do repo: todas as rotas com
`Depends(require_user)`; bodies em Pydantic; **mutações** retornam
`{"status": "ok"|"error", ...}` (router aplica `_check_result` → HTTP 400 em erro);
**listagens** retornam o dado direto. Datas: `YYYY-MM-DD`.

Cada endpoint envelopa uma função da camada de lógica (`tools_plans.py` /
`tools_projects.py`) — garante paridade com [`kaguya-tools.md`](./kaguya-tools.md).

## PARA — classificação das Listas/Grupos

| Método e rota | Função | Descrição |
|---|---|---|
| `GET /api/tasks/sidebar` | `get_sidebar()` (estendida) | Agora agrupa Listas/Grupos por **balde PARA** (Projetos/Áreas/Arquivo; Recursos omitido). Cada Lista traz `para_type`, `is_project` (tem plano) e contagem de abertas. Inbox no topo |
| `PATCH /api/tasks/projects/{id}` | `update_project(project_id, para_type?, ...)` | Ganha o campo `para_type` (move a Lista de balde) além dos campos já existentes |
| `PATCH /api/tasks/groups/{id}` | `update_group(group_id, para_type?, ...)` | Ganha `para_type` (move o Grupo de balde) |

## Projetos (planos) e fases

| Método e rota | Função | Descrição |
|---|---|---|
| `GET /api/tasks/plans/templates` | `list_templates()` | Lista os moldes disponíveis (`type`, `label`, `fases`) para o wizard |
| `POST /api/tasks/plans` | `create_project_plan(name, template_type?, proposito?, visao?, start_date?, target_date?, group_id?)` | **Cria** uma Lista já promovida a Projeto; com `template_type`, semeia as fases. Retorna o plano + a Lista criada |
| `POST /api/tasks/plans/promote` | `promote_list_to_project(project_id, template_type?)` | **Promove** uma Lista existente (sem duplicar tarefas). Erro se já for Projeto |
| `GET /api/tasks/plans/{project_id}` | `get_project_plan(project_id)` | Plano + fases + **saúde derivada** (ver formato abaixo). 404 se a Lista não tiver plano |
| `PATCH /api/tasks/plans/{project_id}` | `update_project_plan(project_id, proposito?, visao?, brainstorm?, status?, start_date?, target_date?)` | Edita os campos do plano |
| `DELETE /api/tasks/plans/{project_id}` | `demote_project(project_id, new_para_type?)` | **Rebaixa**: remove plano+fases, zera `phase_id` das tarefas, define `para_type` (default `area`) |
| `GET /api/tasks/plans/{project_id}/phases` | `list_phases(project_id)` | Fases do projeto por `position`, cada uma com sua barra de progresso |
| `POST /api/tasks/plans/{project_id}/phases` | `create_phase(project_id, name, target_date?)` | Cria fase |
| `PATCH /api/tasks/phases/{id}` | `update_phase(phase_id, name?, target_date?, completed_at?)` | Renomeia, (re)data, marca concluída |
| `POST /api/tasks/phases/{id}/position` | `reorder_phase(phase_id, after_id?, before_id?)` | Posição esparsa entre vizinhas; renormaliza em colisão |
| `DELETE /api/tasks/phases/{id}` | `delete_phase(phase_id)` | Tarefas da fase ficam com `phase_id = NULL` |
| `POST /api/tasks/{id}/phase` | `assign_task_phase(task_id, phase_id?)` | Liga a tarefa a uma fase (ou desliga com `phase_id=null`); valida o mesmo plano |

## Formato de `ProjectPlan` (resposta de `GET /plans/{project_id}`)

```json
{
  "project_id": 12,
  "name": "Churn 2026",
  "para_type": "project",
  "proposito": "Reduzir cancelamentos previstos no próximo trimestre",
  "visao": "Modelo em produção com alerta semanal de risco",
  "brainstorm": "tentar XGBoost; pegar dados de NPS; ...",
  "status": "ativo",
  "start_date": "2026-06-01",
  "target_date": "2026-08-30",
  "template_type": "data_science",
  "phases": [
    { "id": 7, "name": "Entender dados", "target_date": "2026-06-15",
      "position": 2000, "completed_at": null }
  ],
  "health": {
    "pct_concluido": 0.42, "peso_total": 540, "peso_feito": 227,
    "status": "em_risco", "pct_esperado": 0.50,
    "by_phase": [ { "phase_id": 7, "name": "Entender dados", "pct": 0.6,
                    "peso_total": 180, "target_date": "2026-06-15", "atrasada": false } ],
    "sem_fase": { "pct": 0.0, "peso_total": 0 },
    "projecao_termino": "2026-09-12"
  },
  "next_action": { "id": 88, "title": "baixar extrato de churn", "phase_id": 7 }
}
```

`health` é **sempre derivada** por `project_health.compute_project_health` no momento da
leitura (nunca persistida). `next_action` = primeira tarefa aberta por `position` (em destaque
no cabeçalho — FR-013).

## Notas de compatibilidade

- As rotas de tarefas existentes (`GET /api/tasks`, `PATCH /api/tasks/{id}`, etc.) ganham
  `phase_id` no shape de `Task` e aceitam `phase_id` no `PATCH` (equivalente a
  `assign_task_phase`).
- Nenhuma rota existente muda de contrato de forma quebradora — só ganha campos novos.
