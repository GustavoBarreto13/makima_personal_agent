# Data Model — Planejamento de Projetos (020)

Este documento registra o **delta de schema** desta fase sobre o sistema de tarefas já
existente (`agents/kaguya/schema_tasks_pg.sql`, fases 011–016). Tudo é **aditivo e
idempotente**: nenhuma tabela existente é recriada, nenhuma tarefa é movida ou apagada.

## Aplicação

- **Arquivo novo**: `agents/kaguya/schema_projects_pg.sql` — `CREATE TABLE IF NOT EXISTS`
  para as tabelas novas e `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` para as colunas novas.
- **Aplicador**: `scripts/setup_schemas.py` ganha a entrada para o novo arquivo
  (executado de dentro do container `makima-web` no VPS — ver `CLAUDE.md` raiz).
- **Sem seed**: nenhuma linha é semeada; o legado é classificado por `DEFAULT 'area'`.

## Colunas novas em tabelas existentes

```sql
-- Lista: classificação PARA. Arquivo continua sendo o archived_at já existente.
ALTER TABLE task_projects
    ADD COLUMN IF NOT EXISTS para_type TEXT NOT NULL DEFAULT 'area'
        CHECK (para_type IN ('project', 'area', 'resource'));

-- Grupo (pasta): vive dentro de um único balde PARA.
ALTER TABLE task_project_groups
    ADD COLUMN IF NOT EXISTS para_type TEXT NOT NULL DEFAULT 'area'
        CHECK (para_type IN ('project', 'area', 'resource'));

-- Tarefa: vínculo opcional a uma fase. SET NULL pra não perder a tarefa ao apagar a fase.
ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS phase_id INT REFERENCES project_phases(id) ON DELETE SET NULL;
```

> Ordem de aplicação: criar `project_phases` **antes** do `ALTER TABLE tasks` (a FK
> `phase_id` referencia a tabela nova). O arquivo `schema_projects_pg.sql` ordena os
> statements: `project_plans` → `project_phases` → `ALTER`s.

## Tabelas novas

```sql
-- project_plans — a promoção de uma Lista a Projeto (1:1 com task_projects)
CREATE TABLE IF NOT EXISTS project_plans (
    id SERIAL PRIMARY KEY,
    project_id INT NOT NULL UNIQUE REFERENCES task_projects(id) ON DELETE CASCADE,
    proposito TEXT,                       -- GTD passo 1: por quê
    visao TEXT,                           -- GTD passo 2: visão de sucesso
    brainstorm TEXT,                      -- GTD passo 3: notas livres
    status TEXT NOT NULL DEFAULT 'planejado'
        CHECK (status IN ('planejado','ativo','pausado','concluido','arquivado')),
    start_date DATE,                      -- início (base da linha do tempo)
    target_date DATE,                     -- entrega-alvo do projeto inteiro
    template_type TEXT,                   -- molde usado na criação (informativo)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- project_phases — fases (= marcos quando têm target_date)
CREATE TABLE IF NOT EXISTS project_phases (
    id SERIAL PRIMARY KEY,
    plan_id INT NOT NULL REFERENCES project_plans(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    target_date DATE,                     -- opcional; preenchida = marco na timeline
    position BIGINT NOT NULL DEFAULT 0,   -- ordenação esparsa ×1000 (padrão da casa)
    completed_at TIMESTAMPTZ,             -- fase fechada manualmente (ou derivada de 100%)
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_project_phases_plan ON project_phases(plan_id, position);
CREATE INDEX IF NOT EXISTS ix_tasks_phase ON tasks(phase_id) WHERE phase_id IS NOT NULL;
```

## Relacionamentos

```
task_project_groups (Grupo, +para_type)
        │  (group_id, já existente)
        ▼
task_projects (Lista, +para_type) ──1:0..1── project_plans (Plano)
        │  (project_id, já existente)                 │
        ▼                                             ▼
      tasks (+phase_id) ───────N:0..1───────► project_phases (Fase)
```

- `task_projects` (1) ↔ (0..1) `project_plans` — uma Lista pode ou não ser Projeto
  (`project_id` UNIQUE garante no máximo um plano por Lista).
- `project_plans` (1) → (N) `project_phases` — `ON DELETE CASCADE`: rebaixar/excluir o plano
  apaga as fases.
- `project_phases` (1) → (N) `tasks` via `tasks.phase_id` — `ON DELETE SET NULL`: apagar a
  fase desliga o vínculo, a tarefa permanece. **Invariante**: uma tarefa só pode apontar para
  uma fase do mesmo Plano da sua Lista (validado na camada de lógica, não no banco).

## Baldes PARA (como a sidebar deriva os baldes)

| Balde | Critério | Exibido nesta fase? |
|---|---|---|
| **Projetos** | Lista com `para_type='project'` e `archived_at IS NULL` | ✅ |
| **Áreas** | Lista com `para_type='area'` e `archived_at IS NULL` | ✅ |
| **Recursos** | Lista com `para_type='resource'` e `archived_at IS NULL` | ❌ (reservado — research D6) |
| **Arquivo** | Lista com `archived_at IS NOT NULL` (qualquer `para_type`) | ✅ |

Grupos seguem o mesmo `para_type` e aparecem dentro do balde correspondente; Listas sem grupo
aparecem direto sob o balde. O Inbox (`is_inbox = TRUE`) segue sempre no topo, fora dos baldes.

## Contrato dos motores puros

### `agents/kaguya/project_health.py`

```python
def compute_project_health(
    tasks: list[dict],          # tarefas da Lista: {completed_at, duration_min, phase_id, ...}
    phases: list[dict],         # fases do plano: {id, name, target_date, position, ...}
    start_date: date | None,
    target_date: date | None,
    today: date,
) -> dict
```

**Saída** (derivada, nunca persistida):

```python
{
  "pct_concluido": 0.42,            # 0..1, ponderado por duration_min
  "peso_total": 540,               # soma dos pesos (min)
  "peso_feito": 227,
  "status": "em_risco",            # "no_prazo" | "em_risco" | "atrasado" | None (sem datas)
  "pct_esperado": 0.50,            # None se sem start/target
  "by_phase": [
    {"phase_id": 7, "name": "Modelagem", "pct": 0.10, "peso_total": 180,
     "target_date": "2026-07-01", "atrasada": False}
  ],
  "sem_fase": {"pct": 0.80, "peso_total": 60},   # tarefas sem phase_id
  "projecao_termino": "2026-07-20"  # estimativa simples por ritmo; None se sem datas/sem ritmo
}
```

**Regras de cálculo**:
- Peso de cada tarefa = `duration_min`. Sem `duration_min` → **peso-fallback** = mediana dos
  `duration_min` não-nulos do conjunto; se nenhum, `30`.
- `pct_concluido` = soma(peso das tarefas com `completed_at`) / soma(peso de todas). Conjunto
  vazio → `0.0` (sem divisão por zero).
- Por fase: mesmo cálculo restrito às tarefas daquela `phase_id`. `atrasada` = fase com
  `target_date < today` e `pct < 1.0`.
- `pct_esperado = clamp((today − start_date) / (target_date − start_date), 0, 1)`; requer as
  duas datas (senão `None`).
- `status`: sem datas → `None`. Com datas: `target_date < today and pct_concluido < 1` →
  `"atrasado"`; `pct_concluido >= pct_esperado` → `"no_prazo"`; defasagem ≤ 0.15 →
  `"em_risco"`; senão `"atrasado"`.

### `agents/kaguya/project_templates.py`

```python
TEMPLATES: dict[str, dict] = {
  "data_science": {"label": "Data Science (CRISP-DM)", "fases": ["Entender negócio",
     "Entender dados", "Preparar dados", "Modelar", "Avaliar", "Deploy"]},
  "bi":        {"label": "Dashboard BI", "fases": ["Requisitos", "Modelagem de dados",
     "ETL", "Visualização", "Validação", "Publicação"]},
  "codigo":    {"label": "Projeto de código", "fases": ["Discovery", "Design",
     "Implementação", "Testes", "Deploy"]},
  "pessoal":   {"label": "Pessoal (genérico)", "fases": ["Definir", "Organizar",
     "Executar", "Revisar"]},
}

def get_template(template_type: str) -> dict        # erro amigável se desconhecido
def list_templates() -> list[dict]                  # [{type, label, fases}] para a UI
```

Cada `fases` é semeada como linhas em `project_phases` (posições esparsas ×1000) no momento da
criação/promoção. `tarefas_esqueleto` é reservado (opcional, não obrigatório no v1).

## Regras de estado implementadas na camada de lógica

| Regra | Comportamento |
|---|---|
| Promover Lista | cria `project_plans` (UNIQUE em `project_id` bloqueia duplicar) + seta `para_type='project'`; com `template_type`, semeia as fases |
| Rebaixar Projeto | `DELETE` do plano (cascata apaga fases); tarefas ficam com `phase_id = NULL`; `para_type` volta para `area` (ou o escolhido) |
| Mover entre baldes | altera `para_type` da Lista (e opcionalmente do Grupo); Arquivo = `archived_at` (reusa soft delete existente) |
| Fases | CRUD com posição esparsa ×1000 + renormalização transacional em colisão (padrão da casa) |
| Atribuir tarefa a fase | valida que a fase pertence ao plano da Lista da tarefa; senão erro amigável |
| Trocar tarefa de Lista | zera `phase_id` (fases pertencem a um plano específico) |
| Saúde | sempre derivada via `compute_project_health` — nunca lida/gravada do banco |

## Validações de entrada (camada de lógica)

- `para_type` ∈ {`project`,`area`,`resource`} — valor inválido → erro amigável em português.
- `status` do plano ∈ {`planejado`,`ativo`,`pausado`,`concluido`,`arquivado`}.
- `name` da fase obrigatório, não-vazio após trim.
- `start_date`/`target_date`: se ambas presentes, `target_date >= start_date` (senão aviso).
- Promover Lista já promovida → `{"status":"error","message":"Esta Lista já é um Projeto."}`.
- IDs inexistentes → `{"status":"error","message": ...}` em português, nunca exceção crua.
