# CLAUDE.md — agents/frieren

## O que é este agente

**Frieren** é o agente de rastreamento de leitura pessoal do sistema Makima.
Inspirada em Frieren de *Frieren: Beyond Journey's End* — elfa maga milenar, contemplativa, paciente.

Responsabilidades:
- Gerenciar um catálogo pessoal de livros com status de leitura
- Registrar progresso de leitura por sessão (página atual, delta de páginas)
- Buscar e enriquecer metadados de livros via Google Books API
- Gerar estatísticas e histórico de leitura
- Exibir menu interativo com botões inline no Telegram

---

## Arquitetura

```
Telegram (usuário)
    ↓
Makima (coordinator)
    ↓
frieren_agent (Agent ADK — singleton)
    ├── tools.py         → BigQuery (leitura/escrita)
    └── tools.py         → Google Books API (metadados)
```

**Frieren é singleton** — não usa `McpToolset`, então não precisa de factory function.
Instância global `frieren_agent` em `agent.py`, importada diretamente em `coordinator/agent.py`.

---

## Banco de dados BigQuery

Dataset: `frieren_books_agent`

### Tabela `books`

Catálogo de livros e estado de leitura.

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | STRING | UUID único da entrada (gerado internamente) |
| `google_books_id` | STRING | ID da Google Books API — para buscar capa e detalhes |
| `title` | STRING | Título do livro |
| `author` | STRING | Autor(es) separados por vírgula |
| `total_pages` | INT64 | Total de páginas da edição do usuário |
| `isbn` | STRING | ISBN-13 (preferido) ou ISBN-10 como fallback |
| `cover_url` | STRING | URL da capa (Google Books API) |
| `description` | STRING | Sinopse (truncada em 500 caracteres) |
| `genre` | STRING | Gênero/categorias separados por vírgula |
| `language` | STRING | Código do idioma (ex.: "pt", "en") |
| `published_year` | INT64 | Ano de publicação |
| `status` | STRING | Estado da leitura (ver abaixo) |
| `date_started` | DATE | Data de início da leitura |
| `date_finished` | DATE | Data de conclusão |
| `rating` | FLOAT64 | Avaliação pessoal de 1.0 a 5.0 |
| `notes` | STRING | Anotações pessoais / resenha |
| `source` | STRING | Origem da entrada (sempre "telegram") |
| `created_at` | TIMESTAMP | Criação do registro |
| `updated_at` | TIMESTAMP | Última atualização |
| `deleted` | BOOL | Soft delete — nunca deletamos fisicamente |

**Particionamento**: `DATE(created_at)`
**Clustering**: `status, author`

#### Status válidos

```
lendo       — livro em leitura no momento
lido        — leitura concluída
quero_ler   — na lista de desejos
pausado     — leitura pausada temporariamente
abandonado  — desistiu do livro
```

Qualquer outro valor é rejeitado pelas tools.

---

### Tabela `reading_logs`

Registro imutável de sessões de leitura. Cada linha é uma sessão: quanto foi lido naquele dia.

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | STRING | UUID único do log |
| `book_id` | STRING | FK para `books.id` |
| `book_title` | STRING | Desnormalizado — facilita consultas sem JOIN |
| `date` | DATE | Data da sessão de leitura |
| `page_start` | INT64 | Página onde estava ANTES da sessão |
| `page_end` | INT64 | Página atual APÓS a sessão |
| `pages_read` | INT64 | Delta: `page_end - page_start` |
| `session_notes` | STRING | Anotações opcionais da sessão |
| `created_at` | TIMESTAMP | Quando o log foi inserido |

**Particionamento**: `date`
**Clustering**: `book_id`

**Por que desnormalizar `book_title`?**
BigQuery é orientado a colunas — JOINs desnecessários entre tabelas grandes adicionam custo. Duplicar o título nos logs permite consultas históricas sem JOIN.

---

## Como criar o dataset e as tabelas

```bash
# 1. Criar o dataset
bq mk --dataset <GCP_PROJECT_ID>:frieren_books_agent

# 2. Rodar o schema — substituir {project} pelo ID real antes de executar
# (o schema.sql usa {project} como placeholder)
bq query --use_legacy_sql=false < agents/frieren/schema.sql
```

---

## Tools públicas (chamadas pelo agente)

### `search_book(query, publisher=None)`
Busca livros na Google Books API. Use **antes de `add_book`** para confirmar o `google_books_id` correto.

- `query`: título, autor, ISBN ou qualquer termo
- `publisher`: filtra com `inpublisher:` da API — útil quando há várias edições

Retorna lista HTML numerada com até 5 resultados (título, autor, páginas, ID Google Books).

---

### `add_book(title, status, google_books_id, author, total_pages)`
Adiciona um livro ao catálogo.

**Fluxo interno:**
1. Valida o `status`
2. Verifica duplicatas pelo título (fuzzy match)
3. Obtém metadados: por `google_books_id` específico → busca textual → fallback manual
4. Sobrescreve `total_pages` e `author` se fornecidos manualmente (edição física pode diferir)
5. Gera UUID para o livro
6. Define `date_started = hoje` se `status == "lendo"`
7. Insere na tabela `books`

---

### `log_reading(book_query, current_page, session_notes, log_date)`
Registra progresso de leitura de uma sessão.

- `book_query`: título parcial. **Se vazio**, usa automaticamente o livro com o log mais recente
- `current_page`: página atual do leitor ao fim da sessão
- `session_notes`: anotações opcionais
- `log_date`: data da sessão em YYYY-MM-DD (padrão: hoje) — permite registrar retroativamente

**Fluxo interno:**
1. Localiza o livro (fuzzy por título ou último logado)
2. Valida que `current_page >= 0` e `<= total_pages`
3. Busca o último `page_end` nos logs para calcular `pages_read = current_page - page_start`
4. Rejeita se `pages_read < 0` (página informada é menor que a última registrada)
5. Rejeita se `pages_read == 0` (nenhum progresso novo)
6. Insere em `reading_logs`
7. Atualiza `status → "lendo"` se o livro estava em outro status — preserva `date_started` original via `COALESCE`

---

### `get_current_reading()`
Lista todos os livros com `status = "lendo"`, com progresso atual via `MAX(page_end)` dos logs.
Usa `LEFT JOIN` — exibe livros mesmo sem nenhum log registrado ainda.

---

### `get_reading_list(status=None)`
Lista todos os livros do catálogo, agrupados por status com cabeçalhos visuais.
Se `status` for informado, filtra somente aquele grupo.

---

### `finish_book(book_query, rating, notes, date_finished, date_started)`
Marca um livro como lido.

- Aceita datas retroativas: `date_finished` e `date_started` em YYYY-MM-DD
- `rating`: nota de 1.0 a 5.0 (opcional)
- `COALESCE(@notes, notes)`: preserva anotações anteriores se `notes=None`
- Usa SET condicional para `date_started`: se o usuário informar, sobrescreve; caso contrário, preserva com `COALESCE`

---

### `update_book_status(book_query, status)`
Atualiza o status de um livro.
Se o novo status for `"lendo"` e `date_started` for NULL, registra hoje como data de início.
Usa `CASE WHEN` no SQL para não sobrescrever uma data de início existente.

---

### `update_book_pages(book_query, total_pages)`
Corrige o total de páginas (quando a API retornou errado ou a edição física difere).
Recalcula e exibe o percentual de progresso atualizado se houver logs.

---

### `get_reading_stats(year=None)`
Estatísticas anuais de leitura. Ano padrão: ano corrente.

Métricas calculadas com **3 queries independentes**:
1. Livros concluídos no ano + avaliação média
2. Total de páginas e sessões de leitura no ano
3. Ritmo médio: média de páginas/dia nos últimos 30 dias **com leitura** (não dias corridos)

---

### `get_book_history(book_query)`
Histórico cronológico de todas as sessões de leitura de um livro.
Formato por sessão: `data: p.X → p.Y (Z páginas) — notas`

---

### `get_book_menu_data(book_query)`
Retorna JSON estruturado para o coordinator montar o menu interativo com botões inline.

Retorna **apenas** o JSON — sem texto adicional. O coordinator detecta o campo `"type": "book_menu"` e constrói os botões automaticamente.

```json
{
  "type":          "book_menu",
  "book_id":       "<uuid>",
  "title":         "Título do Livro",
  "author":        "Autor",
  "status":        "lendo",
  "rating":        null,
  "current_page":  80,
  "total_pages":   412,
  "date_started":  "2026-05-01",
  "date_finished": null,
  "cover_url":     "https://books.google.com/..."
}
```

---

## Funções auxiliares (não expostas ao agente)

### `get_book_by_id(book_id)` e `update_book_by_id(...)`
Usadas diretamente pelo coordinator (`main.py`) para processar callbacks dos botões inline.
**Não são tools do agente** — só importadas em `coordinator/main.py`.

`update_book_by_id` usa SET dinâmico: só inclui no SQL os campos que não forem `None`.
Para `notes`, usa `CONCAT` para appendar ao invés de sobrescrever.

---

## Menu interativo Telegram

Acionado quando o usuário quer gerenciar/ver detalhes de um livro.

**Fluxo completo:**

```
1. Usuário pede menu → Makima roteia para Frieren
2. Frieren chama get_book_menu_data → retorna JSON com type="book_menu"
3. coordinator/main.py detecta o JSON (busca o primeiro '{' na resposta)
4. Se cover_url presente: envia send_photo com a capa + menu na legenda
5. Se sem capa: envia reply_text com o menu em HTML
6. Botões inline renderizados com InlineKeyboardMarkup
```

**Botões disponíveis:**

| Botão | callback_data | Ação |
|---|---|---|
| ⭐ Avaliar | `fm_rate:<id>` | Exibe teclado de estrelas (1–5) |
| ⭐⭐...⭐⭐⭐⭐⭐ | `fm_r:<id>:<nota>` | Salva avaliação e reconstrói menu |
| 🔄 Status | `fm_status:<id>` | Exibe seletor de status |
| Status escolhido | `fm_s:<id>:<status>` | Salva status e reconstrói menu |
| 📝 Nota | `fm_note:<id>` | Remove teclado, pede input de texto livre |
| ✅ Marcar como lido | `fm_finish:<id>` | Marca como lido com data de hoje |
| ⬅️ Voltar | `fm_back:<id>` | Recarrega e exibe menu principal |
| ❌ Fechar | `fm_cancel` | Remove teclado inline |

**Estado pendente (nota):** quando o usuário clica em "📝 Nota", o coordinator armazena
`_pending_action[chat_id] = {"action": "note", "book_id": ...}`.
A próxima mensagem de texto do usuário é interceptada **antes de passar para o agente**
e salva diretamente via `update_book_by_id`.

**Edição de mensagens:** `_edit_menu_message` distingue entre mensagens com foto
(`edit_message_caption`) e texto puro (`edit_message_text`). O Telegram não permite
converter entre os dois tipos na edição.

---

## Infraestrutura e dependências

### Autenticação BigQuery
Segue o padrão da Nami — **sem arquivo de credencial montado em container**:
- `GCP_CREDENTIALS_JSON`: conteúdo completo do JSON do service account como string
- `_client()` usa `service_account.Credentials.from_service_account_info(json.loads(...))`
- Singleton: `_bq_client` global evita criar múltiplas conexões entre chamadas de tool

### Google Books API
- Endpoint: `https://www.googleapis.com/books/v1/volumes`
- Sem `langRestrict` — para não perder livros japoneses, ingleses ou de qualquer idioma
- `GOOGLE_BOOKS_API_KEY` (opcional): aumenta cota de ~1.000 para 10.000 req/dia
- Timeout: 10 segundos por requisição
- Em caso de erro de rede, retorna lista vazia sem quebrar o agente

### Fuso horário
Todos os timestamps e datas usam `America/Sao_Paulo` (UTC-3).
`date.today()` retornaria a data do servidor em UTC, que pode diferir do Brasil perto da meia-noite.
Por isso, `_today()` extrai a data de `datetime.now(_TZ)`.

### Busca fuzzy (normalização de strings)
`_norm()` usa decomposição NFD para remover acentos antes de comparar:
- `"Duna"` == `"duna"` == `"DUNA"` na busca
- NFD separa "ã" em "a" + til combinante; filtramos `unicodedata.category(c) != "Mn"`

---

## Variáveis de ambiente necessárias

```env
GCP_PROJECT_ID=            # ID do projeto GCP (ex.: projetos-448301)
GCP_CREDENTIALS_JSON=      # conteúdo JSON do service account (string completa)
GOOGLE_BOOKS_API_KEY=      # (opcional) aumenta cota da Google Books API
```

---

## Personalidade e formatação

A Frieren sempre começa com `Frieren:`. Tom contemplativo, calmo, levemente distante.

Frases características:
- "O tempo passa, mas os livros ficam."
- "Cada página é uma magia diferente."
- "A leitura é a viagem que não exige movimento."
- "Que jornada interessante."

Nunca usa markdown. Apenas HTML (`<b>`, `<i>`, `<code>`) e emojis.
O Telegram renderiza HTML mas não markdown — formatar com `*` quebraria a exibição.

**Nota sobre `parse_mode`:** O coordinator envia respostas **sem** `parse_mode` por padrão
(exceto nos menus inline, onde `parse_mode="HTML"` é explícito). Os agentes geram HTML
que o Telegram exibe corretamente sem `parse_mode` quando o HTML é simples (sem entidades
mal formadas).

---

## Integração com o coordinator

```python
# coordinator/agent.py
from agents.frieren.agent import frieren_agent

# frieren_agent é adicionado à lista sub_agents da Makima
sub_agents=[nami_agent, kaguya_agent, kurisu_agent, frieren_agent]
```

```python
# coordinator/main.py
from agents.frieren.tools import get_book_by_id, update_book_by_id
```

`get_book_by_id` e `update_book_by_id` são importados diretamente no main.py
para processar callbacks de botões inline sem passar pelo agente.

---

## Cenários comuns de roteamento

| Mensagem do usuário | Tool acionada |
|---|---|
| "li o Duna até a página 80" | `log_reading` |
| "li 30 páginas" (sem título) | `log_reading(book_query="")` → usa último logado |
| "adiciona Duna à minha lista" | `search_book` → `add_book` |
| "terminei o Duna, nota 4.5" | `finish_book` |
| "me mostra o menu do Duna" | `get_book_menu_data` → menu interativo |
| "quantos livros li esse ano" | `get_reading_stats` |
| "histórico de leitura do Duna" | `get_book_history` |
