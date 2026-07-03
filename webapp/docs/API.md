# Referência da API

Todos os endpoints retornam JSON. Todos os endpoints `/api/*` exigem o cookie `makima_session`
válido (obtido via `/auth/login`) — sem ele a resposta é **HTTP 401**.

**Contrato de erros:**
- `400` — dado inválido ou regra de negócio (corpo: `{"detail": "mensagem"}`)
- `401` — cookie ausente, expirado ou inválido
- `422` — validação Pydantic falhou (corpo com erros por campo)
- `404` — recurso não encontrado

---

## Autenticação (`/auth/*`)

Rotas públicas — não exigem cookie.

| Método | Caminho | Descrição |
|---|---|---|
| `GET` | `/auth/login` | Inicia o fluxo Google OIDC. Redireciona para a tela de login do Google. |
| `GET` | `/auth/callback` | Google redireciona aqui após login. Valida o token, emite o cookie `makima_session` e redireciona para `/`. |
| `GET` | `/auth/logout` | Apaga o cookie e redireciona para `/`. |
| `GET` | `/auth/me` | Retorna `{"email": "...", "name": "..."}` do usuário logado, ou `401`. |

---

## Health check

| Método | Caminho | Descrição |
|---|---|---|
| `GET` | `/api/healthz` | Rota pública. Retorna `{"status": "ok"}` se o servidor está no ar. |

---

## Finanças (`/api/finances/*`)

Todos os endpoints de finanças exigem autenticação. A maior parte chama as tools da Nami
(`agents/nami/`); os marcados com ★ executam SQL direto no banco (webapp-only).

### Transações

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `GET` | `/api/finances/transactions` | Lista transações de um período. | `?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD` |
| `POST` | `/api/finances/transactions` | Cria uma transação (devolve 201). | Body: `CreateTransactionBody` |
| `PATCH` | `/api/finances/transactions/{tx_id}` | Atualiza uma transação existente. | Body: `UpdateTransactionBody` |
| `DELETE` | `/api/finances/transactions/{tx_id}` | Soft-delete de uma transação. | — |

### Resumo e análises

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `GET` | `/api/finances/summary` | Gasto agrupado por categoria, conta ou tipo. | `?period=YYYY-MM&group_by=categoria\|conta\|tipo` |
| `GET` | `/api/finances/trend` | Tendência mensal de receitas e despesas. | `?months=N` |
| `GET` | `/api/finances/health` | Score de saúde financeira (0–100). | `?month=YYYY-MM` |
| `GET` | `/api/finances/commitments/{month}` | Compromissos futuros (parcelas, assinaturas). | Path: `YYYY-MM` |
| `GET` | `/api/finances/stats` ★ | Stats consolidados do mês (SQL agregado para o dashboard). | `?month=YYYY-MM` (obrigatório) |
| `GET` | `/api/finances/categories` | Metadados fixos das categorias (ícone, cor, tipo). | — |

### Contas

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `GET` | `/api/finances/accounts` | Lista contas. | `?status=ativo\|encerrado` |
| `POST` | `/api/finances/accounts` | Cria conta (devolve 201) e salva campos visuais (cor, ícone, abreviação). | Body: `CreateAccountBody` |
| `GET` | `/api/finances/accounts/{account_id}/balance` | Saldo atual da conta. | — |
| `DELETE` | `/api/finances/accounts/{account_id}` | Encerra a conta. | — |

### Cartões de crédito

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `GET` | `/api/finances/cards` | Lista cartões com resumo de fatura e campos visuais. | — |
| `POST` | `/api/finances/cards` | Registra cartão (devolve 201). | Body: `RegisterCreditCardBody` |
| `POST` | `/api/finances/cards/{card_id}/payment` | Registra pagamento de fatura (devolve 201). | Body: `CardPaymentBody` |
| `DELETE` | `/api/finances/cards/{card_id}` | Encerra o cartão. | — |

### Empréstimos bancários

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `GET` | `/api/finances/loans` | Lista empréstimos bancários. | `?status=ativo\|quitado` |
| `POST` | `/api/finances/loans` | Registra empréstimo (devolve 201). | Body: `RegisterLoanBody` |
| `GET` | `/api/finances/loans/{loan_id}/balance` | Saldo devedor do empréstimo. | — |
| `DELETE` | `/api/finances/loans/{loan_id}` | Soft-delete do empréstimo. | — |

### Orçamentos

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `GET` | `/api/finances/budgets` | Status dos envelopes de orçamento. | `?month=YYYY-MM` |
| `POST` | `/api/finances/budgets` | Define limite de um envelope (devolve 201). | Body: `SetBudgetBody` |
| `DELETE` | `/api/finances/budgets/{month}/{categoria}` | Remove envelope de orçamento. | — |

### Assinaturas

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `GET` | `/api/finances/subscriptions` | Lista assinaturas com campos visuais enriquecidos. | `?status=ativo\|pausado\|cancelado` |
| `POST` | `/api/finances/subscriptions` | Cria assinatura (devolve 201). | Body: `CreateSubscriptionBody` |
| `PATCH` | `/api/finances/subscriptions/{sub_id}` | Atualiza assinatura (pausar, reativar, etc.). | Body: `UpdateSubscriptionBody` |
| `DELETE` | `/api/finances/subscriptions/{sub_id}` | Soft-delete da assinatura. | — |

### Parcelamentos

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `GET` | `/api/finances/installments` | Lista grupos de parcelamento. | `?status=ativo\|quitado` |
| `POST` | `/api/finances/installments` | Cria compra parcelada (devolve 201; gera N transações). | Body: `CreateInstallmentBody` |
| `DELETE` | `/api/finances/installments/{group_id}` | Remove todo o grupo de parcelamento. | — |

> **Atenção:** `create_installment()` **não aceita `card_id`**. Compras parceladas no cartão
> devem ser criadas individualmente com `POST /transactions` para cada parcela.

### Upload de ícone

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `POST` | `/api/finances/uploads/icon` | Faz upload de ícone (PNG/JPEG/WebP/GIF, máx 1 MB). Retorna `{"url": "/uploads/icons/<nome>"}`. | Multipart: campo `file` |

### Empréstimos pessoais (pessoa a pessoa) ★

Tabela webapp-only: `personal_loans`.

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `GET` | `/api/finances/personal-loans` | Lista empréstimos pessoais. | — |
| `POST` | `/api/finances/personal-loans` | Registra empréstimo pessoal (devolve 201). | Body: `CreatePersonalLoanBody` |
| `DELETE` | `/api/finances/personal-loans/{loan_id}` | Soft-delete. | — |

### Financiamentos ★

Tabela webapp-only: `financings`.

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `GET` | `/api/finances/financings` | Lista financiamentos. | — |
| `POST` | `/api/finances/financings` | Registra financiamento (devolve 201). | Body: `CreateFinancingBody` |
| `DELETE` | `/api/finances/financings/{fin_id}` | Soft-delete. | — |

---

## Livros (`/api/books/*`)

Todos os endpoints exigem autenticação. Chamam as tools da Frieren (`agents/frieren/tools.py`).

> **Atenção especial:** As tools da Frieren retornam **strings HTML** (não dicts de status) quando
> há um erro. O router em `books.py` usa `_books_check()` que analisa o HTML procurando padrões de
> erro conhecidos e converte em HTTP 400 com mensagem legível.

> **Ordem das rotas:** rotas com caminho fixo (ex.: `/stats`, `/search-google`) são declaradas
> **antes** da rota variável `/{book_id}` para evitar que um `book_id` com valor `"stats"` seja
> capturado erroneamente.

### Coleção

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `GET` | `/api/books` | Lista todos os livros com a página atual de leitura. | — |
| `POST` | `/api/books` | Adiciona livro à biblioteca (enriquece metadados pelo Google Books). | Body: `AddBookBody` |
| `GET` | `/api/books/stats` | Estatísticas de leitura do ano. | `?year=YYYY` |
| `GET` | `/api/books/heatmap` | Páginas lidas por dia (para o heatmap). | `?year=YYYY` |
| `GET` | `/api/books/activity` | Feed global de atividade de leitura. | `?limit=N` |
| `GET` | `/api/books/search-google` | Busca livros na API do Google Books. | `?q=termo` (obrigatório) |

### Detalhe e ações por livro

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `GET` | `/api/books/{book_id}` | Detalhe do livro, página atual e estantes. | — |
| `GET` | `/api/books/{book_id}/history` | Histórico de sessões de leitura. | — |
| `POST` | `/api/books/{book_id}/log` | Registra sessão de leitura (devolve 201). | Body: `LogReadingBody` |
| `POST` | `/api/books/{book_id}/finish` | Marca livro como lido. | Body: `FinishBookBody` |
| `PATCH` | `/api/books/{book_id}/status` | Atualiza status do livro. | Body: `UpdateStatusBody` |
| `PATCH` | `/api/books/{book_id}/metadata` | Atualiza metadados (título, autor, capa…). | Body: `UpdateBookMetadataBody` |
| `PATCH` | `/api/books/{book_id}/pages` | Atualiza total de páginas. | Body: `UpdatePagesBody` |
| `DELETE` | `/api/books/{book_id}` | Soft-delete do livro. | — |
| `DELETE` | `/api/books/{book_id}/logs/{log_id}` | Remove uma sessão de leitura. | — |

### Estantes

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `GET` | `/api/books/shelves` | Lista estantes do usuário. | — |
| `POST` | `/api/books/shelves` | Cria estante (devolve 201). | Body: `CreateShelfBody` |
| `PATCH` | `/api/books/shelves/{shelf_id}` | Atualiza estante. | Body: `UpdateShelfBody` |
| `DELETE` | `/api/books/shelves/{shelf_id}` | Remove estante. | — |
| `POST` | `/api/books/shelves/{shelf_id}/books/{book_id}` | Adiciona livro à estante (devolve 201). | — |
| `DELETE` | `/api/books/shelves/{shelf_id}/books/{book_id}` | Remove livro da estante. | — |

---

## Diário (`/api/journal/*`)

Todos os endpoints exigem autenticação. Chamam as tools do Journal (`agents/journal/tools.py`).

> **Atenção — validação diferente:** ao contrário das tools da Nami, várias tools do journal
> **não retornam o campo `"status"`** (devolvem lista ou dict direto). Por isso, `_check_result`
> **não** é usado nelas. Além disso, `get_or_create_page` retorna `{"error": "..."}` (não
> `{"status": "error"}`) quando o `type_id` não existe — o router verifica `result.get("error")`
> explicitamente.

### Páginas e bullets

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `GET` | `/api/journal/page` | Busca (ou cria) a página de uma data. | `?date=YYYY-MM-DD&type_id=1` |
| `POST` | `/api/journal/bullets` | Upsert de bullet (por `page_id` + `position`). | Body: `UpsertBulletBody` |
| `DELETE` | `/api/journal/bullets/{bullet_id}` | Remove bullet (cascade apaga menções). | — |
| `PUT` | `/api/journal/page/dream` | Define ou limpa o campo `dream` da página. | Body: `DreamBody` |

### Busca e filtros

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `GET` | `/api/journal/heatmap` | Contagem de bullets por dia (para o heatmap anual). | `?year=YYYY` |
| `GET` | `/api/journal/mentions` | Lista menções (`@pessoa` ou `#tag`) distintas com contagem. | `?kind=person\|tag` |
| `GET` | `/api/journal/filter` | Bullets que mencionam uma pessoa ou tag específica. | `?kind=person\|tag&value=X` |
| `GET` | `/api/journal/search` | Full-text search nos bullets (dicionário português). | `?q=texto` |
| `GET` | `/api/journal/entries` | Lista resumos de entradas (com busca opcional). | `?q=texto` (opcional) |

### Coleções e insights

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `GET` | `/api/journal/collection/{kind}` | Bullets de um tipo específico. | Path: `highlight\|dream\|idea\|wisdom\|note` |
| `GET` | `/api/journal/dreams` | Todas as entradas que têm o campo `dream` preenchido. | — |
| `GET` | `/api/journal/stats` | Insights agregados do ano (total de palavras, dias ativos, etc.). | `?year=YYYY` (obrigatório) |

### Tutor de Idiomas (spec 031 — persona Kurisu)

Chamam a lógica de `agents/kurisu/tutor.py` (cross-domain intencional — ver
`agents/kurisu/CLAUDE.md`). Detalhes campo a campo em
`specs/031-violet-tutor-idiomas/contracts/api.md`.

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `POST` | `/api/journal/bullets/{bullet_id}/tutor` | Analisa a escrita do bullet via Gemini (US1); falha da IA não grava nada. | Body: `AnalyzeTutorBody` `{language}` |
| `GET` | `/api/journal/bullets/{bullet_id}/tutor` | Última análise do bullet — serve o toggle original↔corrigido (US2). | — |
| `GET` | `/api/journal/tutor/progress` | Skills por conceito + nível CEFR + próximo foco + guia ativo (US3/US4). | `?language=en` |
| `GET` | `/api/journal/tutor/analyses` | Histórico de análises recentes. | `?language=en&limit=20` |
| `GET` | `/api/journal/tutor/concepts` | Lista canônica de conceitos gramaticais (popula o seletor do guia). | — |
| `GET` | `/api/journal/tutor/guide` | Guia de estudo ativo do idioma, se houver. | `?language=en` |
| `PUT` | `/api/journal/tutor/guide` | Cria/substitui o guia ativo (desativa o anterior na mesma transação). | Body: `SaveTutorGuideBody` |
| `DELETE` | `/api/journal/tutor/guide` | Remove (desativa) o guia ativo — não afeta análises já salvas. | `?language=en` |

> `GET /api/journal/page` também ganha um campo `tutor` (nullable) em cada bullet —
> `{analysis_id, has_correction, error_count}` — composto **no router** via
> `get_bullets_tutor_meta` (1 query agregada), sem alterar `agents/journal/get_or_create_page`.

---

## Tarefas (`/api/tasks/*`)

Todos os endpoints exigem autenticação. Chamam a camada de lógica da Kaguya
(`agents/kaguya/tools_tasks.py`, `tools_projects.py`, `calendar_hub.py`, `gcal.py`, etc.).
É o maior router do webapp (~96 rotas), então as tabelas abaixo são compactas
(método | rota | o que faz) e organizadas por sub-recurso. Payloads campo a campo
estão nos contratos das specs: `specs/011-tasks-mvp/contracts/`,
`specs/012-tasks-recurrence/contracts/`, `specs/016-tasks-meudia/contracts/`,
`specs/019-tasks-calendar-hub/contracts/`, `specs/020-tasks-projetos/contracts/`,
`specs/024-kanban-rework/contracts/`, `specs/025-task-list-rework/contracts/`,
`specs/029-tasks-tiny-experiments/contracts/` e `specs/030-tasks-metas/contracts/`.

> **Ordem das rotas:** o `GET /api/tasks/{task_id}` genérico fica declarado no **final** do
> arquivo, depois de todos os caminhos literais (`/tags`, `/filters`, `/habits`, `/goals`,
> `/my-day`, etc.). Como `task_id` é `int`, o conversor de tipo rejeita esses nomes e não há
> ambiguidade de rota.

### Sidebar, listas, grupos e colunas (Kanban)

| Método | Rota | O que faz |
|---|---|---|
| `GET` | `/api/tasks/sidebar` | Payload único da sidebar (grupos + listas com contagem e flag de board). |
| `POST` | `/api/tasks/projects` | Cria uma lista. |
| `PATCH` | `/api/tasks/projects/{project_id}` | Edita uma lista (renomear, mover de grupo, cor/ícone, reordenar). |
| `DELETE` | `/api/tasks/projects/{project_id}` | Exclui uma lista; `?mode=move_to_inbox\|delete_tasks` decide o destino das tarefas (Inbox → 400). |
| `POST` | `/api/tasks/groups` | Cria um grupo de listas. |
| `PATCH` | `/api/tasks/groups/{group_id}` | Renomeia/reordena um grupo. |
| `DELETE` | `/api/tasks/groups/{group_id}` | Exclui um grupo (as listas dele ficam sem grupo). |
| `GET` | `/api/tasks/projects/{project_id}/columns` | Lista as colunas do board de uma lista. |
| `POST` | `/api/tasks/columns` | Cria uma coluna (a primeira ativa o Kanban). |
| `PATCH` | `/api/tasks/columns/{column_id}` | Renomeia/reordena/marca "done" uma coluna. |
| `DELETE` | `/api/tasks/columns/{column_id}` | Exclui uma coluna (as tarefas dela ficam sem coluna). |
| `POST` | `/api/tasks/projects/{project_id}/copy-columns` | Copia a estrutura de colunas de outro board (sem tarefas; só se o destino ainda não tiver board). |

### Tarefas e subtarefas

| Método | Rota | O que faz |
|---|---|---|
| `GET` | `/api/tasks` | Lista as tarefas de uma lista, com subtarefas aninhadas (`?project_id=&include_completed=`). |
| `GET` | `/api/tasks/today` | Tarefas de hoje + vencidas (`{overdue, today}`). |
| `GET` | `/api/tasks/eisenhower` | Tarefas-pai abertas para a view Eisenhower (classificação derivada no front). |
| `GET` | `/api/tasks/search` | Busca tarefas abertas por texto (`?q=`). |
| `GET` | `/api/tasks/trash` | Lista a lixeira (soft delete), opcionalmente por lista. |
| `GET` | `/api/tasks/{task_id}` | Busca uma tarefa pelo id (com subtarefas, recorrência, tags e responsáveis). |
| `POST` | `/api/tasks` | Cria uma tarefa ou subtarefa (o webapp permite título vazio para edição inline). |
| `PATCH` | `/api/tasks/{task_id}` | Edita uma tarefa (mover de lista aplica a regra da coluna). |
| `POST` | `/api/tasks/{task_id}/complete` | Completa a tarefa; `needs_cascade` volta como 200 pedindo confirmação (repetir com `cascade=true`). |
| `POST` | `/api/tasks/{task_id}/reopen` | Reabre uma tarefa concluída (bloqueado se o pai está concluído). |
| `POST` | `/api/tasks/{task_id}/position` | Reordena uma tarefa entre dois vizinhos (posição esparsa). |
| `POST` | `/api/tasks/{task_id}/move` | Re-parenteia por DnD 3 zonas (before/child/after); `new_parent_id=null` promove a raiz. |
| `DELETE` | `/api/tasks/{task_id}` | Soft delete (lixeira); `?scope=this\|series` controla recorrentes. |
| `POST` | `/api/tasks/{task_id}/restore` | Restaura uma tarefa da lixeira. |
| `POST` | `/api/tasks/{task_id}/recurrence` | Anexa/substitui a regra de recorrência (exige `due_date`). |
| `DELETE` | `/api/tasks/{task_id}/recurrence` | Remove a recorrência (a tarefa volta a ser simples). |

### Tags

| Método | Rota | O que faz |
|---|---|---|
| `GET` | `/api/tasks/tags` | Lista todas as tags (ordem alfabética). |
| `POST` | `/api/tasks/tags` | Cria uma tag (400 se já existir com o mesmo nome, ignorando caixa). |
| `PATCH` | `/api/tasks/tags/{tag_id}` | Renomeia/recolore uma tag. |
| `DELETE` | `/api/tasks/tags/{tag_id}` | Exclui uma tag (os vínculos somem; as tarefas permanecem). |
| `GET` | `/api/tasks/by-tag` | Tarefas abertas com uma determinada tag (`?name=` com ou sem `#`). |

### Smart-lists (filtros salvos)

| Método | Rota | O que faz |
|---|---|---|
| `GET` | `/api/tasks/filters` | Lista as smart-lists salvas (ordem da sidebar). |
| `GET` | `/api/tasks/filters/today-overdue` | Smart-list built-in "Hoje + Vencidas" (não persistida). |
| `GET` | `/api/tasks/filters/builtins` | Built-ins GTD adicionais (Próximas Ações, Aguardando, Algum dia, Rápidas, Alta energia). |
| `GET` | `/api/tasks/filters/builtin/{key}/tasks` | Tarefas que casam com um built-in GTD (lista plana). |
| `POST` | `/api/tasks/filters` | Cria uma smart-list (rejeita regra sem condição com 400). |
| `PATCH` | `/api/tasks/filters/{filter_id}` | Edita uma smart-list (nome, regras, ícone, view padrão, posição). |
| `DELETE` | `/api/tasks/filters/{filter_id}` | Exclui uma smart-list (nenhuma tarefa é afetada). |
| `GET` | `/api/tasks/filters/{filter_id}/tasks` | Abre uma smart-list: `{tasks, orphans}` (referências órfãs sinalizadas). |

### Kanban views (spec 024) e board de grupo (spec 025)

| Método | Rota | O que faz |
|---|---|---|
| `GET` | `/api/tasks/kanban-views` | Lista as views de Kanban (sempre inclui a built-in "Completa"). |
| `POST` | `/api/tasks/kanban-views` | Cria uma view customizada (valida display/slots e o filtro opcional). |
| `PATCH` | `/api/tasks/kanban-views/{view_id}` | Edita uma view; a built-in "Completa" é imutável (400). |
| `DELETE` | `/api/tasks/kanban-views/{view_id}` | Exclui uma view customizada (a built-in não pode). |
| `GET` | `/api/tasks/kanban-views/{view_id}/board` | Tarefas do board de uma lista com o filtro da view aplicado (`?project_id=`). |
| `GET` | `/api/tasks/groups/{group_id}/board` | Board agregado do grupo: colunas de mesmo nome mescladas entre as listas. |

### Calendário e Calendar Hub (fatia 019)

| Método | Rota | O que faz |
|---|---|---|
| `GET` | `/api/tasks/calendar` | Tarefas datadas + ocorrências virtuais das recorrentes na janela (`?start=&end=&project_id=`). |
| `GET` | `/api/tasks/calendar/sources` | Fontes de calendário do hub (kaguya, nami, frieren, violet, akane + calendários Google), com prefs. |
| `GET` | `/api/tasks/calendar/aggregate` | Agrega eventos de todos os provedores num feed único (`?start=&end=&sources=`). |
| `GET` | `/api/tasks/calendar/prefs` | Preferências de exibição (cor/visibilidade) de todos os calendários. |
| `PATCH` | `/api/tasks/calendar/prefs/{calendar_id}` | Atualiza as preferências de um calendário (upsert parcial). |
| `GET` | `/api/tasks/calendar/calendars` | Lista os calendários Google da conta (com `is_main`/`is_kaguya`). |
| `GET` | `/api/tasks/calendar/events` | Eventos Google no intervalo (exclui "Kaguya — Tarefas" e "TickTick"; falha vira lista vazia). |
| `GET` | `/api/tasks/calendar/gcal-status` | Verifica se o Google Calendar está autenticado (`{connected, reason}`). |
| `POST` | `/api/tasks/calendar/events` | Cria evento no calendário principal (GOOGLE_CALENDAR_MAIN_CALENDAR_ID). |
| `PATCH` | `/api/tasks/calendar/events/{event_id}` | Atualiza campos de um evento Google (parcial). |
| `DELETE` | `/api/tasks/calendar/events/{event_id}` | Remove um evento Google (irreversível; `?calendar_id=` para secundários). |

### Hábitos (fatia 014 de tasks)

| Método | Rota | O que faz |
|---|---|---|
| `GET` | `/api/tasks/habits` | Lista os hábitos ativos, com força, aderência e estado de hoje. |
| `POST` | `/api/tasks/habits` | Cria um hábito (400 se a frequência for inválida). |
| `GET` | `/api/tasks/habits/{habit_id}` | Detalhe de um hábito (com força/aderência). |
| `PATCH` | `/api/tasks/habits/{habit_id}` | Edita um hábito (nome, frequência, meta, ícone, cor). |
| `DELETE` | `/api/tasks/habits/{habit_id}` | Arquiva um hábito (soft delete — histórico preservado). |
| `GET` | `/api/tasks/habits/{habit_id}/history` | Check-ins de um ano (esparso) para o heatmap anual (`?year=`). |
| `POST` | `/api/tasks/habits/{habit_id}/checkin` | Registra/atualiza o check-in de um dia (um por dia). |
| `DELETE` | `/api/tasks/habits/{habit_id}/checkin` | Remove o check-in de um dia (`?date=`; vazio = hoje). |

### Tiny Experiments (spec 029)

| Método | Rota | O que faz |
|---|---|---|
| `GET` | `/api/tasks/experiments` | Lista os experimentos (`?include_completed=` para incluir concluídos). |
| `GET` | `/api/tasks/experiments/due-today` | Experimentos cuja cadência cai hoje e ainda sem check-in (para o Meu Dia). |
| `POST` | `/api/tasks/experiments` | Cria um experimento (400 se `end_date < start_date` ou cadência inválida). |
| `GET` | `/api/tasks/experiments/{experiment_id}` | Detalhe (com `logs` e métricas derivadas). |
| `PATCH` | `/api/tasks/experiments/{experiment_id}` | Edita (fórmula, why/hipótese, cadência, datas). |
| `DELETE` | `/api/tasks/experiments/{experiment_id}` | Exclui (hard delete — check-ins vão junto por CASCADE). |
| `POST` | `/api/tasks/experiments/{experiment_id}/log` | Registra/atualiza o check-in de um período (upsert; permite backfill). |
| `DELETE` | `/api/tasks/experiments/{experiment_id}/log` | Remove o check-in de um período (`?period_date=`). |
| `POST` | `/api/tasks/experiments/{experiment_id}/pause` | Pausa um experimento ativo. |
| `POST` | `/api/tasks/experiments/{experiment_id}/resume` | Retoma um experimento pausado. |
| `POST` | `/api/tasks/experiments/{experiment_id}/review` | Encerra com a revisão (veredicto + aprendizado). |

### Metas (spec 030)

| Método | Rota | O que faz |
|---|---|---|
| `GET` | `/api/tasks/goals` | Lista as metas (`?include_completed=` para incluir encerradas). |
| `GET` | `/api/tasks/goals/areas` | Contagem de metas ativas por área da vida. |
| `GET` | `/api/tasks/goals/linkable` | Itens vinculáveis a uma meta (`?item_type=experiment\|task\|habit`). |
| `POST` | `/api/tasks/goals` | Cria uma meta (400 se o prazo for inválido). |
| `GET` | `/api/tasks/goals/{goal_id}` | Detalhe (com `milestones`, `movements` e progresso). |
| `PATCH` | `/api/tasks/goals/{goal_id}` | Edita uma meta (título, métrica, prazo, área, `metric_current`, etc.). |
| `DELETE` | `/api/tasks/goals/{goal_id}` | Exclui (hard delete; itens vinculados são desvinculados, nunca apagados). |
| `POST` | `/api/tasks/goals/{goal_id}/milestones` | Adiciona um marco. |
| `PATCH` | `/api/tasks/goals/{goal_id}/milestones/{milestone_id}` | Edita um marco (renomear, concluir/reabrir). |
| `DELETE` | `/api/tasks/goals/{goal_id}/milestones/{milestone_id}` | Remove um marco. |
| `POST` | `/api/tasks/goals/{goal_id}/link` | Vincula um item (experimento/tarefa/hábito) à meta. |
| `POST` | `/api/tasks/goals/{goal_id}/unlink` | Desvincula um item (ele permanece na sua seção). |
| `POST` | `/api/tasks/goals/{goal_id}/review` | Encerra a meta com a revisão (desfecho + aprendizado). |

### Meu Dia e time-blocking (fatia 016)

| Método | Rota | O que faz |
|---|---|---|
| `GET` | `/api/tasks/my-day` | Ritual do Meu Dia: plano, pendências de ontem, sugestões e capacity (`?date=`; vazio = hoje). |
| `POST` | `/api/tasks/{task_id}/my-day` | Marca a tarefa no Meu Dia de uma data (body opcional; ausente = hoje). |
| `DELETE` | `/api/tasks/{task_id}/my-day` | Tira a tarefa do Meu Dia (não a apaga). |
| `POST` | `/api/tasks/{task_id}/reschedule` | Atalho do ritual de pendências: hoje, amanhã ou fora do Meu Dia. |
| `POST` | `/api/tasks/{task_id}/time-block` | Grava o bloco de tempo (`end_at` é derivado se ausente). |
| `DELETE` | `/api/tasks/{task_id}/time-block` | Remove o bloco de tempo (mantém a tarefa no plano). |

---

## Filmes (`/api/movies/*`)

Todos os endpoints exigem autenticação. Chamam as tools da Akane (`agents/akane/`), com
metadados do TMDB e sincronização opcional com o Letterboxd (RSS). Contrato detalhado:
`specs/015-akane-filmes/contracts/movies-api.md`.

### Busca, catálogo e telas agregadas

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `GET` | `/api/movies/tmdb/search` | Busca filmes no TMDB por título (não grava nada). | `?q=termo` (obrigatório) |
| `GET` | `/api/movies` | Lista o catálogo com filtros e ordenação. | `?status=&sort=&genre=&tag=&filter=` |
| `POST` | `/api/movies` | Adiciona filme ao catálogo (metadados do TMDB se houver `tmdb_id`). | Body: `AddMovieBody` |
| `GET` | `/api/movies/watchlist` | Filmes na watchlist (`status='watchlist'`). | — |
| `GET` | `/api/movies/diary` | Diário de sessões em ordem cronológica decrescente. | `?limit=N` |
| `GET` | `/api/movies/home` | Todos os blocos da tela Início numa única chamada. | — |
| `GET` | `/api/movies/stats` | Estatísticas de filmes do ano. | `?year=YYYY` |
| `GET` | `/api/movies/rewind` | Year-in-review com destaques do ano. | `?year=YYYY` |
| `GET` | `/api/movies/heatmap` | Sessões por dia do ano (para o heatmap). | `?year=YYYY` |
| `GET` | `/api/movies/people` | Pessoas mais frequentes no catálogo (direção + elenco). | `?limit=N` |
| `GET` | `/api/movies/tags` | Nuvem de etiquetas com contagem e flag de pessoa. | — |
| `POST` | `/api/movies/sync-letterboxd` | Sincroniza o RSS do Letterboxd com o catálogo (idempotente; devolve 202). | — |

### Favoritos e listas

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `GET` | `/api/movies/favorites` | Vitrine de favoritos em ordem de posição. | — |
| `PUT` | `/api/movies/favorites` | Substitui a vitrine (máx. 4 filmes vistos; transação atômica). | Body: `FavoritesBody` |
| `GET` | `/api/movies/lists` | Todas as listas com contagem de filmes. | — |
| `POST` | `/api/movies/lists` | Cria uma lista/coleção (devolve 201). | Body: `CreateListBody` |
| `GET` | `/api/movies/lists/{list_id}` | Detalhe de uma lista com seus filmes. | — |
| `PATCH` | `/api/movies/lists/{list_id}` | Atualiza campos da lista (todos opcionais). | Body: `UpdateListBody` |
| `DELETE` | `/api/movies/lists/{list_id}` | Remove a lista e seus itens (CASCADE). | — |
| `POST` | `/api/movies/lists/{list_id}/items` | Adiciona um filme à lista (devolve 201). | Body: `AddToListBody` |
| `DELETE` | `/api/movies/lists/{list_id}/items/{movie_id}` | Remove um filme da lista. | — |

### Detalhe e ações por filme

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `GET` | `/api/movies/{movie_id}` | Detalhe completo: metadados + people + Cofre + diário (aceita fuzzy match). | — |
| `POST` | `/api/movies/{movie_id}/watch` | Registra uma sessão de visualização (devolve 201). | Body: `LogWatchBody` |
| `PATCH` | `/api/movies/{movie_id}/rating` | Define a nota atual do filme. | Body: `RatingBody` |
| `PATCH` | `/api/movies/{movie_id}/like` | Marca/desmarca o coração (curtir). | Body: `LikeBody` |
| `PATCH` | `/api/movies/{movie_id}/status` | Atualiza o status (watchlist ↔ watched). | Body: `StatusBody` |
| `PATCH` | `/api/movies/{movie_id}/notes` | Atualiza as anotações soltas do filme. | Body: `NotesBody` |
| `DELETE` | `/api/movies/{movie_id}` | Soft delete (preserva o diário). | — |
| `GET` | `/api/movies/{movie_id}/vault` | Itens do Cofre do filme. | — |
| `POST` | `/api/movies/{movie_id}/vault` | Adiciona um item ao Cofre (devolve 201). | Body: `AddVaultItemBody` |
| `DELETE` | `/api/movies/vault/{vault_id}` | Remove um item do Cofre. | — |
| `DELETE` | `/api/movies/diary/{diary_id}` | Remove uma sessão do diário e recalcula contadores. | — |

---

## Animes (`/api/animes/*`)

Todos os endpoints exigem autenticação. Chamam as tools da Marin (`agents/marin/`), com
metadados de Jikan (MAL) + AniList e sincronização com a lista do MyAnimeList (OAuth).
Contrato detalhado: `specs/021-marin-animes/contracts/api-anime.md`.

### Busca, catálogo e telas agregadas

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `GET` | `/api/animes/search` | Busca animes no Jikan (MAL) por título (não grava nada). | `?q=termo&limit=N` |
| `GET` | `/api/animes` | Lista o catálogo com filtros opcionais. | `?status=&sort=&genre=` |
| `POST` | `/api/animes` | Adiciona um anime via `mal_id` (metadados Jikan + AniList; devolve 201). | Body: `AddAnimeBody` |
| `GET` | `/api/animes/watchlist` | Animes com status `quero_assistir` (fila de espera). | — |
| `GET` | `/api/animes/currently-watching` | Animes com status `assistindo`. | — |
| `GET` | `/api/animes/diary` | Histórico de sessões em ordem cronológica decrescente. | `?limit=N` |
| `GET` | `/api/animes/stats` | Estatísticas de animes do ano. | `?year=YYYY` |
| `GET` | `/api/animes/schedule` | Episódios futuros dos animes em progresso. | `?days=N` |
| `GET` | `/api/animes/home` | Todos os blocos da HomeScreen numa única chamada. | — |
| `POST` | `/api/animes/sync` | Sincroniza com o MyAnimeList (delta ou full; idempotente; devolve 202). | Body: `{"full": bool}` |

### Detalhe e ações por anime

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `GET` | `/api/animes/{anime_id}` | Detalhes completos (aceita UUID, `mal_id` ou título fuzzy). | — |
| `GET` | `/api/animes/{anime_id}/episodes` | Episódios paginados (12 por página). | `?page=N` |
| `POST` | `/api/animes/{anime_id}/log` | Registra uma sessão de episódios assistidos (devolve 201). | Body: `LogWatchBody` |
| `PATCH` | `/api/animes/{anime_id}/status` | Atualiza o status do anime na lista. | Body: `StatusBody` |
| `PATCH` | `/api/animes/{anime_id}/score` | Define a nota pessoal (escala MAL: 0–10, passo 0.5). | Body: `ScoreBody` |
| `DELETE` | `/api/animes/{anime_id}` | Soft delete (histórico preservado). | — |
| `DELETE` | `/api/animes/logs/{log_id}` | Remove uma sessão do diário e recalcula `episodes_watched`. | — |

---

## Séries de TV (`/api/series/*`)

Todos os endpoints exigem autenticação. Chamam as tools da Mai (`agents/mai/`), com
metadados do TMDB (API v4 Bearer). Contrato detalhado: `specs/022-mai-series/contracts/api-series.md`.

### Busca, catálogo e telas agregadas

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `GET` | `/api/series/search` | Busca séries no TMDB por título (não grava; retorna flag `in_catalog`). | `?q=termo` (obrigatório) |
| `GET` | `/api/series` | Lista o catálogo com filtros opcionais. | `?status=&genre=&limit=N` |
| `POST` | `/api/series` | Adiciona uma série (metadados TMDB; dedupe por `tmdb_id`; devolve 201). | Body: `AddSeriesBody` |
| `GET` | `/api/series/watchlist` | Séries com status `quero_assistir`. | — |
| `GET` | `/api/series/diary` | Diário de sessões em ordem cronológica decrescente. | `?limit=N` |
| `GET` | `/api/series/upcoming` | Episódios futuros das séries `assistindo`. | — |
| `GET` | `/api/series/stats` | Estatísticas anuais de séries assistidas. | `?year=YYYY` |

### Detalhe, episódios e ações por série

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `GET` | `/api/series/{series_id}` | Detalhe completo: metadados + temporadas + próximo episódio + sessões. | — |
| `POST` | `/api/series/{series_id}/log` | Registra uma sessão de episódios assistidos (devolve 201). | Body: `LogWatchBody` |
| `PATCH` | `/api/series/{series_id}/status` | Altera o status da série. | Body: `UpdateStatusBody` |
| `PATCH` | `/api/series/{series_id}/rating` | Define ou remove a nota da série. | Body: `RateSeriesBody` |
| `PATCH` | `/api/series/{series_id}/notes` | Salva anotações livres. | Body: `SetNotesBody` |
| `POST` | `/api/series/{series_id}/sync-metadata` | Re-sincroniza metadados TMDB (upsert incremental; devolve 202). | — |
| `DELETE` | `/api/series/{series_id}` | Soft delete (preserva o diário). | — |
| `PATCH` | `/api/series/{series_id}/episodes/{season_number}/{episode_number}` | Marca/desmarca um episódio como assistido. | Body: `ToggleEpisodeBody` |
| `PATCH` | `/api/series/{series_id}/seasons/{season_number}/watched` | Marca/desmarca a temporada inteira como assistida. | Body: `ToggleSeasonBody` |
| `GET` | `/api/series/{series_id}/seasons/{season_number}/episodes` | Episódios da temporada (sincroniza via TMDB se não houver cache local). | — |

---

## Pessoas (`/api/people/*`)

Todos os endpoints exigem autenticação. Chamam as tools da Komi (`agents/komi/tools.py`) —
identidade canônica de pessoas com apelidos, datas importantes e vínculos cross-agent.
Contrato detalhado: `specs/014-pessoas/contracts/api-pessoas.md`.

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `GET` | `/api/people/` | Lista todas as pessoas vivas com contagem de vínculos. | — |
| `GET` | `/api/people/search` | Busca pessoas por nome ou apelido (smart-match). | `?q=termo` (obrigatório) |
| `GET` | `/api/people/overview` | Visão agregada de todas as pessoas para a Home do frontend. | — |
| `POST` | `/api/people/uploads/avatar` | Upload de avatar (PNG/JPEG/WebP/GIF, máx 1 MB). Retorna `{"url": "/uploads/icons/<nome>"}`. | Multipart: campo `file` |
| `POST` | `/api/people/` | Cadastra uma nova pessoa (devolve 201). | Body: `CreatePersonBody` |
| `GET` | `/api/people/{person_id}` | Perfil completo de uma pessoa (sem vínculos cross-agent). | — |
| `GET` | `/api/people/{person_id}/summary` | Resumo com vínculos cross-agent (finanças, tarefas, livros, diário). | — |
| `PATCH` | `/api/people/{person_id}` | Atualiza campos do perfil. | Body: `UpdatePersonBody` |
| `DELETE` | `/api/people/{person_id}` | Soft delete (vínculos preservados; devolve 204). | — |
| `POST` | `/api/people/{person_id}/aliases` | Adiciona um apelido (devolve 201). | Body: `AddAliasBody` |
| `POST` | `/api/people/{person_id}/dates` | Adiciona uma data importante (devolve 201). | Body: `AddImportantDateBody` |
| `PATCH` | `/api/people/{person_id}/dates/{date_id}` | Atualiza uma data importante. | Body |
| `DELETE` | `/api/people/{person_id}/dates/{date_id}` | Remove uma data importante (devolve 204). | — |

---

## Hub (`/api/hub/*`)

Endpoint agregador da tela inicial (Makima · Hub, spec 023 — `specs/023-makima-hub/`).
Exige autenticação. Só **lê** dados: SQL direto via `run_select` ou tools já existentes.

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `GET` | `/api/hub/summary` | Agrega 2 stats reais por agente para os 8 domínios (Nami, Frieren, Komi, Violet, Kaguya, Mai, Marin, Akane). Cada agente é calculado em try/except isolado — falha vira `null` naquela chave, resposta sempre 200. Valores já vêm formatados como string. | — |
