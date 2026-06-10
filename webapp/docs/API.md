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
