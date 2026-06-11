# App de Tasks (Makima / Kaguya) — Recomendações para as Specs

Documento de referência para esboçar as specs de um **sistema de tarefas próprio**, com
PostgreSQL como source of truth, integrado ao `makima_personal_agent`.
Decisão de partida: **romper com o TickTick** — você passa a ser dono do motor.

---

## 1. Decisão de arquitetura

- **Source of truth:** PostgreSQL local (o mesmo de Nami / Frieren / Journal). Sem API externa de tarefas.
- **Agente Kaguya muda de natureza:** deixa de ser factory com MCP do TickTick e vira um agente igual à Nami — `tools.py` falando com o banco via `agents/db.py`. Mantém **só** o MCP do Google Calendar. O `mcp_servers/ticktick/server.py` se aposenta.
- **Cross-agent fica mais simples:** `complete_payment_task` (tarefa + despesa) vira uma transação no mesmo banco, sem cruzar API externa.
- **Dois frontends, uma base:**
  - **Telegram** (captura/conversa via Kaguya) — já existe, só reescrever as tools para o Postgres.
  - **Sub-app visual na webapp** (Kanban / lista / calendar) no padrão Frieren/Journal: router `/api/tasks/*` no FastAPI + páginas React.
- **Escopo single-user:** é pessoal. Não especifique permissões, assignees, comentários ou colaboração — isso simplifica muito o modelo.

---

## 2. O que você reassume ao sair do TickTick (escopo obrigatório, não opcional)

Tudo isso o TickTick dava de graça e agora é responsabilidade do app:

- **Recorrência** — as duas lógicas (data fixa vs. por conclusão). É o ponto de maior risco de bug; especifique os edge cases com cuidado.
- **Captura por linguagem natural** — "revisar relatório sexta às 17h #trabalho" → data + recorrência + projeto + tag. A Kaguya já tem a base (Gemini), mas hoje escreve no TickTick; precisa apontar para o Postgres.
- **Smart lists / filtros salvos.**
- **Lembretes / notificações** — use o **próprio Telegram** como canal (você já tem o bot) em vez de push web.

Você abre mão de: app mobile nativo, widgets, e sync pronto. Em troca: schema sob seu controle, tudo num banco, app do seu jeito.

---

## 3. Modelo de dados

Princípio central: **uma tarefa, várias views** — a mesma linha em `tasks` renderiza como lista (ordena por `position`/`due_date`), Kanban (agrupa por `column_id`) e calendar (`start_at`/`end_at`).

Schema de partida já esboçado em `schema_tasks_pg.sql`. Tabelas núcleo:

| Tabela | Papel |
|---|---|
| `task_projects` | Listas / contextos GTD (@Trabalho, @Casa…), com `parent_id` para grupos |
| `task_columns` | Colunas de Kanban por projeto (`is_done_column` completa a task) |
| `tasks` | Núcleo — título, projeto, coluna, subtarefa (`parent_id`), prioridade, datas, recorrência |
| `task_recurrences` | `rrule` (iCal) + `mode` ('fixed' \| 'after_completion') |
| `task_tags` + `task_tag_links` | Tags de energia/tempo (`high-energy`, `5min`, `donext`) |
| `task_filters` | Smart lists — regras em `JSONB`, view default por filtro |
| `habits` + `habit_checkins` | Módulo de hábitos (frequência num/den, valor mensurável) |

Extensões deixadas para depois (não inchar a v1): dependências entre tarefas (Gantt), histórico de ocorrências de recorrentes, anexos.

---

## 4. Features e a melhor referência de cada uma

O "melhor de cada ferramenta", já filtrado para o seu contexto:

- **Captura sem fricção** → *Todoist* (NLP inline). Maior ROI do app. Canal natural: Telegram.
- **Múltiplas views sobre uma base** → *Notion / Vikunja*. Lista, Kanban, calendar a partir do mesmo registro.
- **Velocidade e UX** → *Linear*. Command palette (Cmd+K), criar tarefa em segundos, keyboard-first. É a referência para o frontend React.
- **Polish e animações** → *Things 3*. Para a fase de refino visual (combina com seu gosto por dark/indigo).
- **Recorrência** → *Todoist*. Copie a lógica de edge cases (reagendar+completar pula ocorrências, "complete forever", reset de subtarefas).
- **Smart lists** → *TickTick / OmniFocus Perspectives*. Filtro salvo como objeto de primeira classe na sidebar (`JSONB`).
- **Time-blocking** → *TickTick*. Arrastar tarefa para um horário. Seu diferencial natural: você já tem tarefas (Postgres) **e** agenda (Calendar via Kaguya) — cruze os dois.
- **Ritual de planejamento diário** → *Sunsama*. Tela "Meu dia": revisar ontem → priorizar hoje → estimar duração (`duration_min`) → ver se cabe (capacity) → shutdown no fim do dia.
- **Priorização** → *Matriz de Eisenhower*. Deriva de `priority` + `due_date`; é uma view 2×2, não um campo novo.
- **Hábitos** → *Loop Habit Tracker*. Use a "força do hábito" (`pow(0.5, freq/13)`, perdoa falhas) em vez de streak frágil. Calculada sobre `habit_checkins`.
- **Foco** → *Pomodoro* opcional (TickTick / Super Productivity). Vincular timer a uma tarefa.
- **Gamificação** → discreta, se usar (*Karma* do Todoist). Regra: a metáfora tem que casar com o objetivo.

---

## 5. Faseamento sugerido

- **Fase 0 — Specs.** Você está aqui. Definir schema, escopo por fase, edge cases de recorrência.
- **Fase 1 — MVP.** Schema + CRUD + view lista + Kanban (um board) + captura via Telegram apontando para o Postgres. Já é um app utilizável.
- **Fase 2 — Datas e organização.** Calendar/due dates + recorrência (as duas lógicas) + smart lists + tags.
- **Fase 3 — Time-blocking.** Cruzar com o Google Calendar + tela "Meu dia" (ritual Sunsama).
- **Fase 4 — Hábitos.** Módulo `habits` + força do hábito + heatmap (você já tem heatmap no Journal/Frieren para reaproveitar).
- **Fase 5 — Polish.** UX à la Linear/Things, notificações via Telegram, web responsiva.

---

## 6. Código aberto para estudar (por relevância ao seu stack)

- **Super Productivity** (Angular/TS, **MIT**) — estrutura geral, local-first, sync por operações.
- **Vikunja** (Go + Vue, AGPL) — "uma tarefa, várias views" + DSL de filtros. Referência mais próxima do que você quer.
- **Loop / uhabits** (Kotlin, GPL) — algoritmo de força do hábito.
- **Taskwarrior / TaskChampion** (C++/Rust) — se um dia quiser sync multi-device criptografado.

---

## 7. Caveats para as specs

- **Recorrência é o maior risco.** Especifique explicitamente: ocorrência pulada ao reagendar, fim de série, subtarefas em recorrentes, ocorrências futuras escondidas.
- **AI scheduling (estilo Motion)** é escopo grande e de payoff incerto. Corte da v1 ou deixe para muito depois.
- **Licenças copyleft** (AGPL/GPL nos repos acima): estudar é livre; reusar código tem implicações. MIT (Super Productivity) é o mais seguro para se inspirar.
- **Notificações:** resolva via Telegram em vez de inventar push web — você já tem o canal e ele é mais confiável no mobile.
- **Não especifique colaboração.** Single-user é uma simplificação enorme; só reabra isso se o objetivo mudar.
