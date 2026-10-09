# Spec 075 — Kaguya no Design System (e um app de tarefas completo)

**Status:** em andamento.
**Branch:** `075-kaguya-ds` (a partir do `master`).
**Plano de execução:** fases 0–13, um commit por fase, como nas specs 072–074. Rollout em paralelo
(`/tasks-next`, como a Frieren e a Akane) e revisão final com a skill `impeccable`.

## Problema

O shell da Kaguya (`webapp/frontend/src/pages/kaguya/`, ~22,6k linhas) é `legacy`: não importa nada de
`src/design/`, tem `Toast`, `Icons`, `TweaksPanel`, `CommandPalette` e 15 modais locais, `kaguya.css` com
2.675 linhas, 13 `window.confirm` e 1 `window.prompt`, emoji na UI, navegação só em estado React (a URL nunca
muda) e nenhum teste. Não existe tela de estatísticas de tarefas.

O pente fino do backend e da UX encontrou bugs reais, além de lacunas de produto:

| Sintoma | Causa |
|---|---|
| "Hoje" vira "amanhã" depois das 21h | `date.today()` / `CURRENT_DATE` no servidor (UTC) em `list_tasks_today`, `_generate_next_occurrence`, `tools_filters._today`, `eisenhower_status` |
| Coluna "Concluído" do Kanban sempre vazia | o board carrega só tarefas abertas (`include_completed=false`) |
| "Semana que vem" tira a tarefa do Meu Dia | `reschedule('later')` zera `my_day_date` sem mexer no vencimento |
| Enter na paleta duplica tarefa | "Criar" é a ação padrão do Enter |
| Clicar fora do modal descarta a edição | o scrim fecha sem confirmar |
| Recorrência perde tags, meta, estimativa e pessoas | `_generate_next_occurrence` copia só 10 campos |
| Concluir/excluir não chega aos netos | a cascata é de um nível, mas há até 12 |
| Evento órfão no Google Calendar | limpar a data não apaga o evento; a nova ocorrência não é espelhada |
| Estimativa e coluna não podem ser limpas | `update_task` trata `None` como "não enviado" |
| Excluir uma lista = arquivar | `delete_project` só seta `archived_at` |
| 3 "hoje + vencidas", 5 helpers de fuso, 2 modelos de capacidade | duplicação histórica |
| Trabalho × Pessoal só vale no Meu Dia e no digest | o campo existe só em `task_projects.context` |
| Telegram vê metade do que o webapp faz | `toolset.py` não expõe metas, experimentos, foco, grupos etc. |

## Decisões (do dono)

- **Nada é removido**, só melhorado ou reorganizado.
- **Kanban:** só visual — a estrutura (toolbar, views, colunas "Vidro", card, dnd) fica idêntica; foi a
  referência do padrão.
- **Rollout em paralelo:** `pages/kaguya-next/` em `/tasks-next`; `/tasks` segue intacto até a troca.
- Direção de arte **"Shuchiin aristocrático"** (`src/design/art/shuchiin.css`).
- **Lista de tarefas no estilo TickTick** (3 painéis, painel de detalhe, adicionar no topo) e **leitor/editor
  de Markdown melhorado**, reaproveitável pelo DS.
- **Espaço Trabalho/Pessoal global**, com digest separado: trabalho só em dias úteis, com exceções
  esporádicas; horário de trabalho editável, almoço (conta ou não como livre), acordar/dormir; dois tempos
  livres (o do trabalho e o geral).
- **Estatísticas** que mostram onde o planejamento falha.
- Entram: logbook de concluídas, edição em massa, calendário completo, adiar/data de início, aguardando com
  pessoa, dependências e projetos sequenciais, templates/duplicar, nomes claros, sidebar unificada e
  configurável (desktop e mobile), paridade no Telegram e unificação do backend.
- Fora de escopo por escolha: reativar o pipeline de lembretes.

## O que muda

Backend: correções e unificação (1) · schema e migração (2) · funcionalidades novas (3) · estatísticas (4) ·
paridade no Telegram (5). Front: arte e ícones (6) · shell e núcleo (7) · planejamento (8) · vida e GTD (9) ·
estatísticas (10) · troca e limpeza (11) · documentação (12) · revisão `impeccable` (13).

## Paridade (nada pode sumir)

- As 17 telas: Meu Dia, Lista, Kanban, Grupo (board e lista), Calendário, Visões de data, Smart-lists/GTD,
  Eisenhower, Hábitos, Experimentos (+ detalhe), Metas (+ detalhe), Foco, Lixeira, Arquivadas.
- Modais/fluxos: tarefa, projeto, grupo, coluna, view do Kanban, filtro, contextos, hábito, meta, experimento,
  foco (iniciar/cancelar), revisão semanal, processamento da Inbox, paleta de comandos, preferências.
- Quick-add com tokens (`@`, `#`, `!`, datas, recorrência); subtarefas e dnd (reordenar, aninhar, mover entre
  colunas/listas/dias); recorrência RRULE; tags; pessoas (Komi); Markdown com menções; bloco de horário;
  estimativa; Meu Dia (planejar/revisar, capacidade); modo férias; atalhos; retrato e "Voltar à Makima".
- **Kanban:** view row (select + Editar + +View), toolbar de prioridade/ordenação, colunas com contador,
  meter de capacidade e rodapé de resumo, card com chips/anel de subtarefas, dnd com `midPosition`, coluna
  done, "Sem board ainda"/copiar colunas, board de grupo unificado por nome com balde "Sem coluna".
- Calendar Hub: semana/mês/dia, fontes, preferências, eventos do GCal, bandeja "Sem horário".
- Foco: floresta, heatmap, horas, "onde eu foco", padrão de falha, conquistas, widget flutuante.

## Contrato com a Komi (pessoas de trabalho)

A Komi ainda não distingue pessoas de trabalho. A Kaguya expõe `agents/kaguya/people_space.py` com
`person_ids_for_space(space)`: se a coluna `people.context` existir (checada uma vez em
`information_schema`), filtra por ela; senão devolve `None` (sem filtro). O seletor de pessoas no espaço
Trabalho passa `space=work`. Pendência registrada em `agents/komi/CLAUDE.md`.

## Critérios de sucesso

- Nenhum item da paridade se perde; o Kanban é visualmente do DS e estruturalmente igual.
- "Hoje" correto em UTC-3 a qualquer hora; recorrência preserva tags/meta/estimativa/pessoas.
- Espaço Trabalho/Pessoal filtra **todas** as telas; digest e tempo livre respeitam agenda e overrides.
- `npm run audit:design` passa com a Kaguya `conformant`; testes de lógica e de tela cobrindo os fluxos.
- Estatísticas mostram reagendamentos, sobrecarga, precisão de estimativa e planejado × feito.
- Conferido no navegador em claro/escuro e celular; `impeccable` rodado no final.

## Rollout

1. VPS, de dentro do `makima-web`: `scripts/migrate_kaguya_ds.py` sem `--apply`, depois com `--apply`,
   **antes** do deploy do backend (colunas novas entram nos `SELECT`).
2. `/tasks-next` convive com `/tasks`; a troca (fase 11) só depois de validar no uso real.

## Fora de escopo

- Reativar o pipeline de lembretes (`due_reminder_sent_at`).
- Mudanças na Komi além do contrato descrito acima.
- Auto-agendamento estilo Motion.
