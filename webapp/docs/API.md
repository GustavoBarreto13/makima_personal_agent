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
| `GET` | `/api/finances/transactions` | Lista transações de um período; filtro opcional por categoria/tipo e paginação (spec 043). Cada transação traz `people: [{id, name}]` vinculada (spec 014/047). | `?start_date=&end_date=&categoria=&tipo=&limit=&offset=` |
| `POST` | `/api/finances/transactions` | Cria uma transação (devolve 201). `person_ids` vincula pessoas do diretório da Komi (spec 047), opcional. | Body: `CreateTransactionBody` |
| `PATCH` | `/api/finances/transactions/{tx_id}` | Atualiza uma transação existente — `card_id` (spec 043) troca a origem para cartão, mutuamente exclusivo com `conta`. | Body: `UpdateTransactionBody` |
| `DELETE` | `/api/finances/transactions/{tx_id}` | Soft-delete de uma transação. | — |
| `GET` | `/api/finances/transactions/export` | Exporta as transações filtradas como CSV (`;` + BOM UTF-8, compatível com Excel pt-BR) — spec 043. | `?start_date=&end_date=&categoria=&tipo=` |

### Transferências (spec 043)

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `POST` | `/api/finances/transfers` | Registra transferência atômica entre duas contas (`tipo='Transferencia'`, excluída de receita/despesa nos relatórios). | Body: `CreateTransferBody` |

### Resumo e análises

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `GET` | `/api/finances/summary` ⚠ | Gasto agrupado por categoria, conta ou tipo. | `?period=YYYY-MM&group_by=categoria\|conta\|tipo` |
| `GET` | `/api/finances/trend` | Tendência mensal de receitas e despesas — card "Tendência de gastos" do Dashboard (spec 042). | `?months=N` |
| `GET` | `/api/finances/health` | Score de saúde financeira (0–100) — card "Saúde financeira" do Dashboard (spec 042). | `?month=YYYY-MM` |
| `GET` | `/api/finances/commitments/{month}` | Compromissos futuros (parcelas, assinaturas). | Path: `YYYY-MM` |
| `GET` | `/api/finances/stats` ★ | Stats consolidados do mês (SQL agregado para o dashboard). | `?month=YYYY-MM` (obrigatório) |
| `GET` | `/api/finances/categories` | Metadados fixos das categorias (ícone, cor, tipo). | — |

⚠ `/summary` **não tem consumidor na UI** (decisão da spec 042) — é redundante com `/stats`
(que já traz o agregado por categoria pronto para o Dashboard). Existe só para o agente
responder no Telegram ("onde vai mais meu dinheiro?" → `get_spending_summary`).

### Contas

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `GET` | `/api/finances/accounts` | Lista contas. | `?status=ativo\|encerrado` |
| `POST` | `/api/finances/accounts` | Cria conta (devolve 201) e salva campos visuais (cor, ícone, abreviação). | Body: `CreateAccountBody` |
| `GET` | `/api/finances/accounts/{account_id}/balance` | Saldo atual da conta. | — |
| `PATCH` | `/api/finances/accounts/{account_id}` | Atualiza campos da conta (nome, instituição, saldo, campos visuais) — spec 043. Tipo não é editável. | Body: `UpdateAccountBody` |
| `DELETE` | `/api/finances/accounts/{account_id}` | Encerra a conta. | — |

### Cartões de crédito

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `GET` | `/api/finances/cards` | Lista cartões com resumo de fatura e campos visuais. | — |
| `POST` | `/api/finances/cards` | Registra cartão (devolve 201). | Body: `RegisterCreditCardBody` |
| `PATCH` | `/api/finances/cards/{card_id}` | Atualiza campos do cartão (limite, taxa, dias, campos visuais) — spec 043. Conta vinculada não é editável. | Body: `UpdateCardBody` |
| `POST` | `/api/finances/cards/{card_id}/payment` | Registra pagamento de fatura (devolve 201). | Body: `CardPaymentBody` |
| `DELETE` | `/api/finances/cards/{card_id}` | Encerra o cartão. | — |

### Empréstimos bancários / financiamentos unificados (spec 046)

Sistema único PRICE/SAC + 6 simuladores — antes só existia para o Telegram
(`agents/nami/tools_loans.py`); o antigo `financings` (webapp-only) foi migrado para cá
via `scripts/migrate_financings_to_loans.py` (idempotente, `financings` preservada intacta
como backup). Saldo devedor e parcelas sempre calculados no backend — o resultado é
idêntico ao do Telegram (SC-002).

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `GET` | `/api/finances/loans` | Lista empréstimos/financiamentos com saldo devedor calculado. | `?status=ativo\|quitado\|todos` |
| `POST` | `/api/finances/loans` | Registra empréstimo (devolve 201). | Body: `RegisterLoanBody` |
| `GET` | `/api/finances/loans/{loan_id}/balance` | Saldo devedor do empréstimo. | — |
| `PATCH` | `/api/finances/loans/{loan_id}` | Edita nome/notas/status/parcelas_pagas. | Body: `UpdateLoanBody` |
| `POST` | `/api/finances/loans/{loan_id}/payment` | Registra parcela paga — avança contador, recalcula saldo, lança despesa (devolve 201). | Body: `RegisterLoanPaymentBody` |
| `GET` | `/api/finances/loans/priority` | Prioridade de quitação — Método Avalanche (empréstimos + cartões com dívida). | — |
| `POST` | `/api/finances/loans/{loan_id}/simulate/payoff` | Simula quitação antecipada hoje. | — |
| `POST` | `/api/finances/loans/{loan_id}/simulate/amortization` | Simula amortização extraordinária. | Body: `SimulateAmortizationBody` |
| `POST` | `/api/finances/loans/{loan_id}/simulate/accelerated` | Simula parcela acelerada. | Body: `SimulateAcceleratedBody` |
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
| `GET` | `/api/finances/subscriptions` | Lista recorrências (assinaturas e/ou contas fixas) com campos visuais enriquecidos. `kind` filtra por tipo (spec 044) — vazio traz ambos. | `?status=ativo\|pausado\|cancelado&kind=assinatura\|conta_fixa` |
| `POST` | `/api/finances/subscriptions` | Cria assinatura ou conta fixa (devolve 201); `kind`/`auto_lancar` decidem o comportamento (spec 044). | Body: `CreateSubscriptionBody` |
| `PATCH` | `/api/finances/subscriptions/{sub_id}` | Atualiza recorrência (pausar, reativar, valor, campos visuais — spec 043; `kind`/`auto_lancar` — spec 044). Categoria não é editável. | Body: `UpdateSubscriptionBody` |
| `DELETE` | `/api/finances/subscriptions/{sub_id}` | Soft-delete da recorrência. | — |

### Contas Fixas (spec 044)

Mesma tabela `subscriptions` (`kind='conta_fixa'`) — endpoints dedicados ao fluxo de
confirmação de valor real.

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `GET` | `/api/finances/recurring-status` | Status do ciclo corrente de cada recorrência (paga/pendente/atrasada/agendada) + custo fixo mensal total + contagem de pendências. | `?kind=assinatura\|conta_fixa` |
| `POST` | `/api/finances/subscriptions/{sub_id}/pay` | Confirma o pagamento com o valor real — cria a despesa vinculada e rola o próximo vencimento (atômico). | Body: `MarkSubscriptionPaidBody` |
| `POST` | `/api/finances/subscriptions/{sub_id}/skip` | Pula o ciclo corrente sem lançar despesa (ex.: mês sem fatura). | — |

### Lista de Compras (spec 045)

Duas tabelas novas: `shopping_lists` (nomeada, ativa/arquivada) e `shopping_list_items`
(nome, quantidade/unidade texto livre, preço estimado, checked, ordem). Uso duplo — webapp
(mobile-first) e Telegram, mesma fonte de dados.

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `GET` | `/api/finances/shopping-lists` | Lista listas de compras. | `?status=ativa\|arquivada\|todas` |
| `POST` | `/api/finances/shopping-lists` | Cria uma lista nomeada nova (devolve 201). | Body: `CreateShoppingListBody` |
| `GET` | `/api/finances/shopping-lists/frequent` | Itens mais recorrentes nas listas já arquivadas. | `?limit=10` |
| `GET` | `/api/finances/shopping-lists/{list_id}` | Detalhe: itens, contadores (pendentes/no carrinho) e total estimado. | — |
| `POST` | `/api/finances/shopping-lists/{list_id}/items` | Adiciona um ou mais itens numa frase só (devolve 201); não duplica item já pendente. | Body: `AddShoppingItemsBody` |
| `POST` | `/api/finances/shopping-lists/{list_id}/finish` | Finaliza a compra — lança a despesa (Supermercado) + arquiva a lista + abre a próxima lista ativa (atômico, devolve 201). | Body: `FinishShoppingBody` |
| `PATCH` | `/api/finances/shopping-items/{item_id}` | Edita nome/quantidade/unidade/preço e/ou marca/desmarca no carrinho. | Body: `UpdateShoppingItemBody` |
| `DELETE` | `/api/finances/shopping-items/{item_id}` | Remove um item (exclusão real). | — |

### Parcelamentos

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `GET` | `/api/finances/installments` | Lista grupos de parcelamento. | `?status=ativo\|quitado` |
| `GET` | `/api/finances/installments/{group_id}` | Detalhe do grupo — cabeçalho + linha do tempo das parcelas (spec 041). | — |
| `POST` | `/api/finances/installments` | Cria compra parcelada (devolve 201; gera N transações). Aceita `conta` **ou** `card_id` (spec 041), mutuamente exclusivos. | Body: `CreateInstallmentBody` |
| `POST` | `/api/finances/installments/{group_id}/cancel` | Cancela as parcelas futuras (mantém as já pagas) — spec 041. | — |
| `DELETE` | `/api/finances/installments/{group_id}` | Remove todo o grupo de parcelamento (passadas + futuras). | — |
| `GET` | `/api/finances/cards/{card_id}/installments` | Parcelamentos ativos de um cartão + comprometimento mensal (spec 041). | — |

### Upload de ícone

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `POST` | `/api/finances/uploads/icon` | Faz upload de ícone (PNG/JPEG/WebP/GIF, máx 1 MB). Retorna `{"url": "/uploads/icons/<nome>"}`. | Multipart: campo `file` |

### Empréstimos pessoa-a-pessoa (spec 046)

Domínio separado dos empréstimos bancários (sem juros, direção emprestei/peguei). Os
endpoints agora chamam `agents/nami/tools_personal_loans.py` em vez de SQL direto (FR-006
— mesma camada de lógica usada pelo Telegram).

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `GET` | `/api/finances/personal-loans` | Lista empréstimos pessoais. | `?direction=lent\|borrowed` |
| `POST` | `/api/finances/personal-loans` | Registra empréstimo pessoal (devolve 201). | Body: `CreatePersonalLoanBody` |
| `PATCH` | `/api/finances/personal-loans/{loan_id}` | Edita campos (só os informados). | Body: `UpdatePersonalLoanBody` |
| `POST` | `/api/finances/personal-loans/{loan_id}/payment` | Registra parcela paga — só avança o contador, sem lançar despesa (devolve 201). | — |
| `DELETE` | `/api/finances/personal-loans/{loan_id}` | Soft-delete. | — |

> **Removido (spec 046, FR-007)**: as rotas antigas `GET/POST/DELETE /financings` foram
> desativadas — o sistema migrou para `/loans` acima. A tabela `financings` permanece no
> banco como backup, sem rota HTTP.

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
| `GET` | `/api/books` | Lista todos os livros com a página atual de leitura (inclui `created_at`, usado na ordenação "Adicionado recentemente"). | — |
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
| `PATCH` | `/api/books/{book_id}/metadata` | Atualiza metadados (título, autor, capa, nota, datas, resenha, preço…). | Body: `UpdateBookMetadataBody` |
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

### Marcações coloridas (book_bullets)

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `GET` | `/api/books/{book_id}/bullets` | Lista as marcações do livro (ordenadas por posição). | — |
| `POST` | `/api/books/{book_id}/bullets` | Cria marcação colorida (devolve 201). | Body: `CreateBulletBody` `{content, color, page_number?}` |
| `PATCH` | `/api/books/bullets/{bullet_id}` | Edita marcação (só campos enviados). | Body: `UpdateBulletBody` |
| `DELETE` | `/api/books/bullets/{bullet_id}` | Remove marcação. | — |

> `color` ∈ `rosa` \| `amarelo` \| `verde` \| `azul` \| `laranja`.

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

### Conselho do Dia (spec 061 — persona Violet, lógica na Kurisu)

Chamam a lógica de `agents/kurisu/counsel.py` (cross-domain intencional — mesmo desenho do
Tutor de Idiomas, ver `agents/kurisu/CLAUDE.md`). Detalhes campo a campo em
`specs/061-violet-conselho-diario/contracts/rest-api.md`.

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `POST` | `/api/journal/counsel` | Gera (ou regenera) o conselho do dia — leitura do dia + RAG + síntese Gemini; até ~60s. Falha em qualquer etapa não grava nada. | Body: `GenerateCounselBody` `{date, type_id?}` |
| `GET` | `/api/journal/counsel` | Conselho já gerado da data, sem gerar nada novo (leitura pura). | `?date=YYYY-MM-DD&type_id=1` |
| `GET` | `/api/journal/counsel/history` | Histórico dos conselhos mais recentes (qualquer data). | `?limit=20` |
| `PATCH` | `/api/journal/counsel/actions` | Marca uma ação sugerida como já convertida em tarefa (não cria a tarefa — só registra o vínculo). | Body: `MarkCounselActionBody` `{page_id, action_index, task_id}` |

> A `origem` ("base"/"web") de cada item do bloco de ferramentas é decidida **no
> servidor**, por checagem de `uri` contra os trechos realmente recuperados na base — nunca
> confia na auto-declaração do modelo.

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
| `POST` | `/api/tasks/projects` | Cria uma lista (`context` opcional — `personal` padrão ou `work`, spec 038). |
| `PATCH` | `/api/tasks/projects/{project_id}` | Edita uma lista (renomear, mover de grupo, cor/ícone, reordenar, `context` — Inbox recusa `work`). |
| `DELETE` | `/api/tasks/projects/{project_id}` | Exclui uma lista; `?mode=move_to_inbox\|delete_tasks` decide o destino das tarefas (Inbox → 400). |
| `GET` | `/api/tasks/projects/archived` | Lista as listas arquivadas, com data de arquivamento e contagem de tarefas (spec 039). |
| `POST` | `/api/tasks/projects/{project_id}/archive` | Arquiva uma lista sem mover/apagar tarefas nem colunas (spec 039). Inbox → 400. |
| `POST` | `/api/tasks/projects/{project_id}/restore` | Restaura uma lista arquivada (spec 039). |
| `POST` | `/api/tasks/groups` | Cria um grupo de listas. |
| `PATCH` | `/api/tasks/groups/{group_id}` | Renomeia/reordena um grupo. |
| `DELETE` | `/api/tasks/groups/{group_id}` | Exclui um grupo (as listas dele ficam sem grupo). |
| `POST` | `/api/tasks/groups/{group_id}/context` | Define o contexto (`personal`\|`work`) de todas as listas do grupo de uma vez (spec 038, FR-003). |
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
| `GET` | `/api/tasks/search` | Busca tarefas abertas por texto (`?q=`). Única view que também traz tarefas de listas arquivadas — cada item ganha `archived: bool` (spec 039, FR-003). |
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

> **spec 034**: `PATCH /api/tasks/{task_id}` ganhou os campos `gtd_status`
> (`next_action`\|`waiting`\|`someday`\|`null`), `waiting_note` e `context_id` — ver
> "Processamento do inbox" e "Contextos" abaixo.

### Processamento do inbox (GTD clarify) — spec 034

| Método | Rota | O que faz |
|---|---|---|
| `GET` | `/api/tasks/inbox/queue` | Itens do Inbox ainda não processados (`{items, total}`), ordenados por captura. |
| `POST` | `/api/tasks/inbox/{task_id}/process` | Aplica uma decisão (`next_action`\|`waiting`\|`someday`\|`schedule`\|`done`\|`trash`). |

### Views fixas de mercado (Todas/Hoje/Amanhã/Próximos 7 Dias/Inbox) — spec 034

Bloco fixo no topo da sidebar (FR-006) — não editável pelo usuário, sem linha em banco.

| Método | Rota | O que faz |
|---|---|---|
| `GET` | `/api/tasks/views/counts` | Contadores das 5 views, para os badges da sidebar. |
| `GET` | `/api/tasks/views/all` | Todas as tarefas abertas, independente de lista ou data. |
| `GET` | `/api/tasks/views/today` | Vencem hoje + atrasadas (mesma regra de "Hoje + Vencidas"). |
| `GET` | `/api/tasks/views/tomorrow` | Vencem amanhã. |
| `GET` | `/api/tasks/views/next7` | Vencem nos próximos 7 dias corridos (inclui hoje). |
| `GET` | `/api/tasks/views/inbox` | Tarefas-pai abertas do Inbox. |

### Contextos de execução — spec 034

Campo dedicado (não tag) — no máximo um contexto por tarefa.

| Método | Rota | O que faz |
|---|---|---|
| `GET` | `/api/tasks/contexts` | Lista os contextos (ordem da sidebar). |
| `POST` | `/api/tasks/contexts` | Cria um contexto (400 se já existir com o mesmo nome, ignorando caixa). |
| `PATCH` | `/api/tasks/contexts/{context_id}` | Renomeia/reordena/reicona um contexto. |
| `DELETE` | `/api/tasks/contexts/{context_id}` | Exclui um contexto (as tarefas ficam sem contexto, nunca são apagadas). |

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
| `PATCH` | `/api/tasks/calendar/prefs/{calendar_id}` | Atualiza as preferências de um calendário (upsert parcial); `context` (`personal`\|`work`, spec 038) decide contra qual capacity do Meu Dia os eventos contam. |
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
| `GET` | `/api/tasks/habits/source-providers` | Lista as fontes automáticas de check-in registradas (spec 036 — ex.: diário da Violet, leitura da Frieren). |

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

### Metas e Hábitos cross-agent (spec 036)

| Método | Rota | O que faz |
|---|---|---|
| `GET` | `/api/tasks/goals/link-providers` | Lista os provedores de vínculo de meta registrados (ex.: livros da Frieren). |
| `GET` | `/api/tasks/goals/link-providers/{provider_id}/search` | Busca itens vinculáveis num provedor (`?q=`; lista vazia se o provedor falhar). |
| `POST` | `/api/tasks/goals/{goal_id}/links` | Vincula um item de outro agente à meta (`{provider_id, entity_id}`). |
| `DELETE` | `/api/tasks/goals/{goal_id}/links/{provider_id}/{entity_id}` | Desvincula (o item de origem nunca é tocado). |
| `PATCH` | `/api/tasks/goals/{goal_id}/metric-mode` | Alterna a métrica entre `manual` e `auto` (`{mode}`). |

`GET /api/tasks/goals/{goal_id}` ganha `metric_mode` na meta e `movements.external` (grupos por
`provider_id`, cada um com `provider_name`, `unavailable` e `items`). `GET /api/tasks/habits/*`
ganham `source_provider_id`/`done_today_source` no hábito e `source` em cada dia do histórico
(`manual`/`auto`/`both`). Ver `specs/036-goal-habit-links/contracts/rest-api.md`.

### Meu Dia e time-blocking (fatia 016)

| Método | Rota | O que faz |
|---|---|---|
| `GET` | `/api/tasks/my-day` | Ritual do Meu Dia: plano, pendências de ontem, sugestões e capacity (`?date=`; vazio = hoje). Inclui também `plano_work`/`plano_personal`, `pendencias_ontem_work`/`_personal`, `sugestoes_work`/`_personal` e `capacity_work`/`capacity_personal` (spec 038) — os campos sem sufixo continuam sendo a união (visão única). Os eventos em `eventos`/`eventos_work`/`eventos_personal` trazem `location` (spec 039, pode ser `""`). |
| `POST` | `/api/tasks/{task_id}/my-day` | Marca a tarefa no Meu Dia de uma data (body opcional; ausente = hoje). |
| `DELETE` | `/api/tasks/{task_id}/my-day` | Tira a tarefa do Meu Dia (não a apaga). |
| `POST` | `/api/tasks/{task_id}/reschedule` | Atalho do ritual de pendências: hoje, amanhã ou fora do Meu Dia. |
| `POST` | `/api/tasks/{task_id}/time-block` | Grava o bloco de tempo (`end_at` é derivado se ausente). |
| `DELETE` | `/api/tasks/{task_id}/time-block` | Remove o bloco de tempo (mantém a tarefa no plano). |

### Revisão semanal guiada (spec 035)

Passos individuais reusam rotas já existentes (`/inbox/queue`, `/inbox/{id}/process`,
`/filters/builtin/{key}/tasks`, `/projects`, `/calendar/aggregate`) — as rotas abaixo cobrem só
o **estado da revisão em si**.

| Método | Rota | O que faz |
|---|---|---|
| `GET` | `/api/tasks/reviews/current` | Revisão aberta (ou `null`) — leitura pura. |
| `POST` | `/api/tasks/reviews/start` | Inicia uma revisão nova, ou retoma a aberta (`resumed: bool` na resposta). |
| `PATCH` | `/api/tasks/reviews/{review_id}/step` | Marca um dos 6 passos como visto (idempotente). |
| `POST` | `/api/tasks/reviews/{review_id}/complete` | Conclui a revisão (`note` opcional). Passos faltando → 200 com `{"error": "steps_pending", "missing": [...]}`. |
| `GET` | `/api/tasks/reviews/last` | Revisão concluída mais recente (indicador do painel), ou `null`. |
| `GET` | `/api/tasks/reviews/history` | Histórico de revisões concluídas, mais recente primeiro. |
| `GET` | `/api/tasks/reviews/waiting-ordered` | Itens "aguardando" ordenados pelos mais antigos primeiro (passo 3). |
| `POST` | `/api/tasks/projects/{project_id}/mark-reviewed` | Marca a lista como revisada agora (passo 4). |

O lembrete de domingo (US3) não tem rota REST — é enviado direto ao Telegram pelo job agendado
`weekly_review_reminder` (ver `scheduler/CLAUDE.md`).

### Foco / Pomodoro (spec 037)

Tempo restante nunca é contado só no cliente — `/focus/active` traz `started_at`/duração e o
widget deriva o countdown localmente entre buscas. `/focus/active` também fecha automaticamente
qualquer sessão abandonada antes de responder (crédito no máximo o tempo de foco planejado).

| Método | Rota | O que faz |
|---|---|---|
| `GET` | `/api/tasks/focus/prefs` | Preferência atual de duração (foco/pausa), lembrada entre sessões. |
| `GET` | `/api/tasks/focus/active` | Sessão ativa (com `phase`/`remaining_sec`), ou `null`. |
| `POST` | `/api/tasks/focus/start` | Inicia uma sessão (`task_id?`, `focus_min`, `break_min`, `force?`); 409 se já existe uma ativa e `force` é falso. |
| `POST` | `/api/tasks/focus/{id}/finish` | Conclui a sessão ativa (`note?` opcional); registra o tempo efetivamente focado. |
| `POST` | `/api/tasks/focus/{id}/cancel` | Cancela a sessão ativa — não entra nas estatísticas. |
| `GET` | `/api/tasks/focus/today` | Resumo do dia local: tempo total focado + número de sessões. |
| `GET` | `/api/tasks/focus/week` | Série dos últimos 7 dias locais (hoje incluso). |
| `GET` | `/api/tasks/focus/history` | Sessões concluídas de um dia local (`?date=`; vazio = hoje). |

### Meu Dia — contexto Trabalho/Pessoal (spec 038)

O contexto é propriedade da **lista** (`context` em `/projects`) e do **calendário**
(`context` em `/calendar/prefs`) — nunca da tarefa (herdado por JOIN, nunca copiado). O motor
de capacity não muda: `/my-day` só passa a chamar a mesma função 3× (total, trabalho,
pessoal). Ver as rotas já listadas acima (`/projects`, `/groups/{id}/context`,
`/calendar/prefs/{id}`, `/my-day`) — nenhuma rota nova exclusiva desta spec além de
`/groups/{id}/context`.

### Arquivar listas + localização nos eventos (spec 039)

Arquivar reusa `task_projects.archived_at` (já existia, gravado internamente por
`delete_project`) — `archive_project`/`restore_project` não tocam tarefas/colunas, diferente
da exclusão. Todas as views operacionais (`/my-day`, `/calendar`, `/eisenhower`,
`/filters/*`, `/views/*`, `/tags/{name}`) excluem listas arquivadas; `/search` é a única
exceção (sinaliza com `archived: bool`). `/my-day` também passa a trazer `location` em cada
evento (antes só chegava na agenda/popover do Calendar Hub).

### Lembrete de pagamento cross-agent (spec 047, US4)

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `POST` | `/api/tasks/reminders` | Cria lembrete de pagamento na lista "Finanças" a partir de um vencimento da Nami (Dashboard). Chama `create_expense_reminder` (cross-agent já existente); protege contra duplicata — mesmo título + mesma `due_date` numa tarefa aberta não cria de novo, devolve a existente com `duplicate: true`. | Body: `CreateReminderBody` |

---

## Filmes (`/api/movies/*`)

Todos os endpoints exigem autenticação. Chamam as tools da Akane (`agents/akane/`), com
metadados do TMDB e sincronização opcional com o Letterboxd (RSS). Contrato detalhado:
`specs/015-akane-filmes/contracts/movies-api.md`.

### Busca, catálogo e telas agregadas

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `GET` | `/api/movies/tmdb/search` | Busca filmes no TMDB por título (não grava nada). Cada resultado inclui `local_id`/`in_catalog` (spec 049) — permite logar reassistida de um filme já catalogado em vez de recriar. | `?q=termo` (obrigatório) |
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
| `POST` | `/api/movies/{movie_id}/refresh-metadata` | "Buscar Dados" (spec 050) — rebusca metadados no TMDB e sobrescreve os campos de catálogo; nunca toca em dado pessoal. `tmdb_id` opcional aplica um candidato específico (troca de match). | Body: `RefreshMetadataBody` |
| `PATCH` | `/api/movies/{movie_id}/catalog` | Edita manualmente os campos de catálogo (título, ano, diretor, gêneros, duração, sinopse) — spec 050. | Body: `UpdateMovieCatalogBody` |
| `PATCH` | `/api/movies/{movie_id}/rating` | Define a nota atual do filme. | Body: `RatingBody` |
| `PATCH` | `/api/movies/{movie_id}/like` | Marca/desmarca o coração (curtir). | Body: `LikeBody` |
| `PATCH` | `/api/movies/{movie_id}/status` | Atualiza o status (watchlist ↔ watched). | Body: `StatusBody` |
| `PATCH` | `/api/movies/{movie_id}/notes` | Atualiza as anotações soltas do filme. | Body: `NotesBody` |
| `DELETE` | `/api/movies/{movie_id}` | Soft delete (preserva o diário). | — |
| `GET` | `/api/movies/{movie_id}/vault` | Itens do Cofre do filme. | — |
| `POST` | `/api/movies/{movie_id}/vault` | Adiciona um item ao Cofre (devolve 201). | Body: `AddVaultItemBody` |
| `DELETE` | `/api/movies/vault/{vault_id}` | Remove um item do Cofre. | — |
| `PATCH` | `/api/movies/diary/reorder` | Reordena sessões de um mesmo dia (spec 050) — registrada antes de `/diary/{diary_id}` para não colidir com o path param. | Body: `ReorderDiaryBody` |
| `PATCH` | `/api/movies/diary/{diary_id}` | Edita manualmente uma sessão (data, nota, resenha, tags, revisão) — spec 050; recalcula os agregados do filme. | Body: `UpdateDiaryEntryBody` |
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
| `GET` | `/api/animes/currently-watching` | ⚠ Animes com status `assistindo`. Sem consumidor na UI — o `HomeScreen` usa `get_home()`. Existe como endpoint de integração/agente (o `marin_agent` no Telegram chama a mesma função Python como ADK tool). | — |
| `GET` | `/api/animes/diary` | Histórico de sessões em ordem cronológica decrescente. | `?limit=N` |
| `GET` | `/api/animes/stats` | Estatísticas de animes do ano. | `?year=YYYY` |
| `GET` | `/api/animes/schedule` | Episódios futuros dos animes em progresso. | `?days=N` |
| `GET` | `/api/animes/home` | Todos os blocos da HomeScreen numa única chamada. | — |
| `POST` | `/api/animes/sync` | Sincroniza com o MyAnimeList (delta ou full; idempotente; devolve 202). | Body: `{"full": bool}` |
| `GET` | `/api/animes/rewind` | Retrospectiva anual (spec 054) — mesmo shape de `/stats`, camada fina sobre `get_stats`. | `?year=YYYY` |

### Listas personalizadas (spec 054)

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `GET` | `/api/animes/lists` | Todas as listas com contagem de animes. | — |
| `POST` | `/api/animes/lists` | Cria uma lista/coleção. | Body: `CreateListBody` |
| `GET` | `/api/animes/lists/{list_id}` | Detalhe de uma lista + animes que a compõem. | — |
| `PATCH` | `/api/animes/lists/{list_id}` | Atualiza campos (só os informados). | Body: `UpdateListBody` |
| `DELETE` | `/api/animes/lists/{list_id}` | Remove a lista (cascade nos itens). | — |
| `POST` | `/api/animes/lists/{list_id}/items` | Adiciona um anime à lista (idempotente por posição). | Body: `AddToListBody` |
| `DELETE` | `/api/animes/lists/{list_id}/items/{anime_id}` | Remove um anime da lista. | — |

### Etiquetas (spec 054)

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `GET` | `/api/animes/tags` | Nuvem de etiquetas com contagem de animes. | — |
| `POST` | `/api/animes/{anime_id}/tags` | Adiciona uma etiqueta (normalizada — minúsculas, sem acento). | Body: `TagBody` |
| `DELETE` | `/api/animes/{anime_id}/tags/{tag}` | Remove uma etiqueta do anime. | — |

### Detalhe e ações por anime

| Método | Caminho | Descrição | Body / Query |
|---|---|---|---|
| `GET` | `/api/animes/{anime_id}` | Detalhes completos (aceita UUID, `mal_id` ou título fuzzy). | — |
| `GET` | `/api/animes/{anime_id}/episodes` | Episódios paginados (12 por página). | `?page=N` |
| `POST` | `/api/animes/{anime_id}/log` | Registra uma sessão de episódios assistidos (devolve 201). | Body: `LogWatchBody` |
| `PATCH` | `/api/animes/{anime_id}/status` | Atualiza o status do anime na lista. | Body: `StatusBody` |
| `PATCH` | `/api/animes/{anime_id}/score` | Define a nota pessoal (escala MAL: 0–10, passo 0.5). | Body: `ScoreBody` |
| `PATCH` | `/api/animes/{anime_id}/notes` | Salva o Caderno da Marin — anotações soltas (spec 054). Texto vazio limpa. | Body: `NotesBody` |
| `DELETE` | `/api/animes/{anime_id}` | Soft delete (histórico preservado; remove também os vínculos de lista, spec 054 FR-006). | — |
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
| `GET` | `/api/hub/summary` | Agrega 2 stats reais por agente para os 8 domínios (Nami, Frieren, Komi, Violet, Kaguya, Mai, Marin, Akane). Cada agente é calculado em try/except isolado — falha vira `null` naquela chave, resposta sempre 200. Valores já vêm formatados como string. Card da Nami: stat = saldo do mês, stat2 = score de saúde financeira 0–100 (spec 047, mesma tool `get_financial_health_score` da tela — isolado em try/except próprio). | — |
