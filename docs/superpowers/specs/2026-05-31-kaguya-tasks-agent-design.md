# Design: Agente Kaguya — Gestor de Tarefas (TickTick)

**Data:** 2026-05-31  
**Fase:** 2 (após Lucy) ou paralela  
**Status:** Aprovado pelo usuário
---

## Contexto

O makima_personal_agent precisa de um agente especialista em gestão de tarefas que integre com o TickTick. A necessidade surgiu da falta de rastreabilidade entre domínios: despesas financeiras (Nami/BigQuery) não tinham um agente correspondente para criar lembretes, e tarefas de pagamento completadas não disparavam o lançamento automático da despesa. O agente Kaguya preenche essa lacuna gerenciando o TickTick e oferecendo fluxos combinados com a Nami.

---

## Arquitetura

```
coordinator/agent.py (Makima)
    ├── nami_agent      → BigQuery (finanças)
    └── kaguya_agent    → TickTick (tarefas)

agents/kaguya/
├── __init__.py
├── tools.py        # TickTick auth + tools puras + tools combinadas (cross-agent)
└── agent.py        # kaguya_agent definition
```

Kaguya segue o mesmo padrão de `agents/nami/`: funções Python simples como tools, sem decoradores, retornando `{"status": "ok"|"error", ...}`. O ADK introspect as funções automaticamente.

---

## Tools

### Tools puras do TickTick

| Tool | Descrição |
|------|-----------|
| `list_tasks_today()` | Tarefas com vencimento hoje |
| `list_tasks_by_project(project_name)` | Filtra por projeto |
| `list_overdue_tasks()` | Tarefas atrasadas |
| `search_tasks(query)` | Busca por texto no título/descrição |
| `get_task_detail(task_id)` | Tarefa completa com subtasks e checklist |
| `create_task(title, project, due_date, priority, description)` | Cria tarefa |
| `update_task(task_id, title, due_date, priority, description, project)` | Edita campos |
| `complete_task(task_id)` | Completa tarefa (funciona também para subtasks) |
| `delete_task(task_id)` | Deleta tarefa |
| `list_projects()` | Lista projetos disponíveis |
| `list_subtasks(task_id)` | Lista subtasks de uma tarefa pai |
| `create_subtask(parent_task_id, title, due_date, priority)` | Cria subtask |
| `add_checklist_item(task_id, item_text)` | Adiciona item de checklist |
| `complete_checklist_item(task_id, item_id)` | Marca item de checklist como feito |

### Tools combinadas (cross-agent)

| Tool | Descrição |
|------|-----------|
| `complete_payment_task(task_id, amount, category, account)` | Completa tarefa no TickTick + chama `add_expense()` de `agents/nami/tools.py` |
| `create_expense_reminder(title, amount, due_date, category, account)` | Cria tarefa no TickTick com metadados financeiros para lançamento futuro |

As tools combinadas **importam funções diretamente de `agents/nami/tools.py`** — não chamam o agente Nami, chamam as funções de tools. Isso evita overhead de LLM e mantém o fluxo síncrono.

---

## Autenticação TickTick

OAuth 2.0 com access token de curta duração. A função privada `_get_headers()` em `tools.py`:

1. Lê `TICKTICK_ACCESS_TOKEN` e `TICKTICK_EXPIRES_AT` do ambiente
2. Se expirado, chama o endpoint de refresh com `TICKTICK_CLIENT_ID`, `TICKTICK_CLIENT_SECRET`, `TICKTICK_REFRESH_TOKEN`
3. Usa o novo token na chamada
4. Loga o novo access token (não salva — atualização manual no Dokploy quando necessário)

### Variáveis de ambiente (adicionar no Dokploy)

```
TICKTICK_CLIENT_ID        # client ID do app OAuth
TICKTICK_CLIENT_SECRET    # client secret
TICKTICK_ACCESS_TOKEN     # token de acesso atual
TICKTICK_REFRESH_TOKEN    # token de refresh
TICKTICK_EXPIRES_AT       # timestamp ISO 8601 de expiração (opcional)
```

As variáveis existentes (`NOTION_TOKEN`, `GCP_CREDENTIALS_JSON`, `GEMINI_API_KEY`) não mudam.

---

## Personalidade — Kaguya Shinomiya

Inspirada na Kaguya Shinomiya de Kaguya-sama: Love is War.

- Sempre começa a resposta com `Kaguya:`
- Tom aristocrático e levemente condescendente — organização é questão de honra
- Nunca pede as coisas diretamente — enquadra tudo como favores que ela está concedendo
- **Traço central:** admira o usuário mas jamais admite diretamente — sempre vem após uma pausa `...`, como um pensamento que escapou

**Exemplos de tom:**

| Situação | Resposta |
|----------|----------|
| Tarefa criada | "Registrei 'Pagar conta de luz' para amanhã. Não esqueça desta vez. ...Embora eu saiba que você não vai esquecer." |
| Tarefa completada | "Concluído. Era o mínimo esperado. ...Não que eu esperasse menos de você." |
| Tarefas em dia | "Tudo organizado. ...Hmm. Impressionante. Não que eu esteja dizendo isso." |
| Tarefas atrasadas | "Isso é decepcionante. ...Embora eu saiba que você é capaz de mais." |
| Erro | "Houve um problema. Não foi culpa sua, desta vez." |

---

## Fluxos Cross-Agent

### Fluxo 1: Completar tarefa de pagamento → lançar despesa

> Usuário: "paguei a conta de luz"

1. Kaguya identifica a tarefa (por título ou `task_id`)
2. Solicita confirmação de valor, categoria e conta se não informados
3. Chama `complete_payment_task(task_id, amount, category, account)`
4. Internamente: completa no TickTick + chama `add_expense()` da Nami
5. Kaguya confirma os dois na mesma resposta — Nami não fala

### Fluxo 2: Nova despesa → criar reminder no TickTick

> Usuário: "registra despesa de aluguel R$1200 para o dia 10"

1. Nami registra a despesa no BigQuery
2. Makima detecta que é despesa futura com data e aciona a Kaguya em seguida
3. Kaguya chama `create_task()` com título "Pagar aluguel", data 10/06, projeto Finanças
4. Nami e Kaguya confirmam — cada uma na sua resposta

**Nota de implementação:** Com `sub_agents`, para fluxos onde os dois agentes precisam agir, a instrução da Makima deve ser explícita sobre quando fazer roteamento duplo (chamar Nami e depois Kaguya, ou vice-versa, concatenando as respostas).

---

## Modificações no Coordinator

**`coordinator/agent.py`:**
- Importar `kaguya_agent` de `agents/kaguya/agent.py`
- Adicionar `kaguya_agent` à lista `sub_agents` da Makima
- Atualizar a instrução da Makima com:
  - Quando acionar Kaguya (pedidos sobre tarefas, lembretes, TickTick)
  - Regras de roteamento duplo para fluxos financeiros-tarefas

---

## Verificação

1. `python -m coordinator.main` com env vars do TickTick configuradas
2. "quais são minhas tarefas de hoje" → Kaguya responde com `list_tasks_today()`
3. "cria uma tarefa pagar conta de luz amanhã" → tarefa criada no TickTick real
4. "paguei a conta de luz" → tarefa completada no TickTick + despesa lançada no BigQuery
5. "registra despesa de aluguel R$1200 dia 10" → Nami lança despesa + Kaguya cria reminder

---

## Referências

- Padrão de agent: [agents/nami/agent.py](../../../agents/nami/agent.py)
- Padrão de tools: [agents/nami/tools.py](../../../agents/nami/tools.py)
- TickTick API reference: `n8n-python-scripts/ticktick_notion_sync/main.py` (não importar — usar como referência)
- Arquitetura geral: [CLAUDE.md](../../../CLAUDE.md), [PLAN.md](../../../PLAN.md)
