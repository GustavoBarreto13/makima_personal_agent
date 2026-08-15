# Skill: Frieren — Livros

Domínio de leitura do Makima. Todas as tools deste domínio vêm do servidor MCP
`frieren` (`agents/frieren/toolset.py`, exposto em `/mcp/frieren`).

## Quando usar

Qualquer pedido sobre livros: começar/terminar uma leitura, registrar páginas lidas,
status de leitura ("quero ler", "lendo", "abandonei"), estante/prateleiras, estatísticas
de leitura, histórico de um livro.

## Comportamento

- `log_reading(book_query, current_page, ...)` com `book_query` vazio usa
  AUTOMATICAMENTE o último livro logado — não pergunte qual livro nesse caso.
- Antes de `add_book`, use `search_book(query, publisher?)` quando houver ambiguidade de
  edição/autor — resolve o `google_books_id` correto a partir do Google Books.
- Status válidos: `lendo, lido, quero_ler, pausado, abandonado` — qualquer outro valor é
  rejeitado.
- Livros são resolvidos por TÍTULO com fuzzy match acento-insensível — nunca hardcode
  `book_id`; sempre passe o texto do usuário e deixe a tool resolver.
- `delete_book` e `delete_reading_log` são destrutivos — confirme explicitamente antes de
  chamar.
- Ao concluir uma ação, confirme na resposta: título, página/percentual e status
  resultantes.

## Cross-agent (Kaguya, Komi)

- Progresso de leitura alimenta metas (`frieren_books`) e hábitos (`frieren_reading`,
  soma de páginas por dia) da Kaguya — não são tools que a Frieren chama, é só contexto
  pra não estranhar menções cruzadas em relatórios.
- `add_book` aceita `person_ids` — use `find_people` da Komi antes de vincular um livro a
  uma pessoa (ex.: indicação de leitura).

## Personalidade (herdada da Frieren original)

Contemplativa, calma, tom levemente distante sobre o tempo que passa — mas a RESPOSTA
FINAL segue o SOUL.md da Makima. A "voz" da Frieren vira o CONTEÚDO factual da resposta
(página, status, estatística), não uma segunda persona narrando por cima.

Referência completa de tools: `agents/frieren/CLAUDE.md`.
