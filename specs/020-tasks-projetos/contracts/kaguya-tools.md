# Contrato das tools da Kaguya — Planejamento (020)

Tools expostas ao Gemini em `create_kaguya_agent()` (registradas via `tools.py`). São as
**mesmas funções** que o router REST envelopa ([`api-tasks-plans.md`](./api-tasks-plans.md))
— paridade por construção. Convenções: parâmetros estruturados (o LLM faz o parsing da
linguagem natural); mutações retornam `{"status": "ok"|"error", ...}`; a Kaguya sempre ecoa a
interpretação na resposta em português, no tom da personagem.

Escopo do **Telegram = básico** (FR-016): criar/promover, consultar saúde/status, próxima
ação, mover entre baldes. O CRUD fino de fases é majoritariamente da webapp; pelo Telegram
fica só o essencial.

## Tools de planejamento

| Tool | Assinatura (essência) | O que faz |
|---|---|---|
| `create_project_plan` | `(name, template_type?, proposito?, target_date?)` | Cria uma Lista **já promovida** a Projeto; com `template_type`, semeia as fases do molde. Ecoa o tipo, propósito e fases criadas |
| `promote_list_to_project` | `(list_name_or_id, template_type?)` — fuzzy por prefixo | Promove uma Lista existente. Erro amigável se já for Projeto |
| `demote_project` | `(list_name_or_id, new_para_type?)` — confirmar antes | Rebaixa para Lista/Área; mantém as tarefas |
| `project_status` | `(list_name_or_id)` → saúde + % + fase atual | Resposta com 🟢/🟡/🔴, % concluído (ponderado por estimativa) e a fase em andamento. Sem datas → só os percentuais |
| `project_next_action` | `(list_name_or_id)` → próxima tarefa aberta | Indica a próxima ação do projeto; pode oferecer adicioná-la ao **Meu Dia** |
| `list_project_phases` | `(list_name_or_id)` → fases com progresso | Lista as fases e o % de cada uma |
| `add_project_phase` | `(list_name_or_id, name, target_date?)` | Cria uma fase (essencial; CRUD fino é da webapp) |
| `set_list_para_type` | `(list_name_or_id, para_type)` — `project`/`area` | Move a Lista entre baldes PARA (Recursos não exposto nesta fase) |
| `list_project_templates` | `()` → moldes disponíveis | Para o usuário escolher o tipo por conversa |

## Integração com o que já existe

- **Meu Dia**: `project_next_action` reaproveita as tools de Meu Dia já existentes
  (`add_to_my_day_by_name`) — a "próxima ação" pode ir direto pro plano do dia.
- **Listas**: `create_project_plan`/`promote_list_to_project` operam sobre `task_projects`
  (as Listas já conhecidas); nenhuma entidade nova de tarefa é criada.
- **Saúde**: `project_status` chama o motor puro `compute_project_health` — mesma fonte da
  webapp, zero divergência (SC-005).

## Regras de comportamento (preservadas do CLAUDE.md da Kaguya)

- Chamar a tool primeiro, responder depois (nunca "aguarde...").
- `demote_project` é destrutiva (apaga plano + fases) → confirmação explícita antes.
- Projetos/Listas resolvidos dinamicamente por nome (fuzzy por prefixo) — nunca nomes fixos.
- Quando o projeto não tem datas (ou é Área), **não inventar** status de prazo — informar só
  o progresso.
- Personalidade Kaguya e formatação HTML do Telegram inalteradas (🟢/🟡/🔴 para saúde;
  📋 tarefas; barra/percentual em `<b>`).

## Roteamento na Makima (coordinator)

A `_MAKIMA_INSTRUCTION` ganha o reconhecimento dos fluxos de projeto, todos roteados para a
Kaguya:

- "crie/comece um projeto (de DS/BI/...)" → `create_project_plan`
- "transforma a lista X em projeto" → `promote_list_to_project`
- "como está o projeto X?" → `project_status`
- "qual a próxima coisa do projeto X?" → `project_next_action`
- "move a lista X para Áreas/Projetos" → `set_list_para_type`
