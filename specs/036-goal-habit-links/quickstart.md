# Quickstart — 036 Metas e Hábitos cross-agent

Pré-requisito: `DATABASE_URL` apontando para um Postgres com o schema atualizado
(`python -m scripts.setup_schemas` ou o `_ensure_tables`/migração idempotente do próprio módulo).

## Cenário 1 — Meta de leitura com progresso automático (SC-001, SC-002)

1. Crie uma meta "Ler 12 livros em 2026" com `metric_target=12`, `metric_unit="livros"`.
2. `PATCH /api/tasks/goals/{id}/metric-mode {"mode":"auto"}`.
3. `GET /api/tasks/goals/link-providers/frieren_books/search?q=duna` → pegue um `id`.
4. `POST /api/tasks/goals/{id}/links {"provider_id":"frieren_books","entity_id":"<id>"}` — repita
   para 3 livros (1 já "lido" na Frieren, 2 "lendo").
5. `GET /api/tasks/goals/{id}` → `metric_current` calculado = 1 (só o "lido" conta), `metric_pct` ≈ 8%.
6. Na Frieren, marque outro livro vinculado como "lido" (`update_book_status`).
7. `GET /api/tasks/goals/{id}` de novo, sem tocar a meta → valor sobe para 2, sem ação manual (SC-001).
8. `DELETE /api/tasks/goals/{id}/links/frieren_books/{entity_id}` num dos livros → recontagem cai.

**Esperado**: passos 3–4 levam no máximo 3 ações de UI (abrir busca → buscar → confirmar — SC-002).

## Cenário 2 — Hábito de diário com check-in automático (SC-003)

1. Crie o hábito "Escrever no diário" (binário, sem `target_value`) com
   `source_provider_id="violet_diary"`.
2. Escreva um bullet com conteúdo no diário (Violet) na data de hoje, inclusive testando após 21h
   local.
3. `GET /api/tasks/habits/{id}` → `done_today: true`, `done_today_source: "auto"`.
4. Apague o conteúdo daquele bullet (ou a página) → `GET` de novo → `done_today: false`.

## Cenário 3 — Hábito mensurável de leitura (US3)

1. Crie o hábito "Ler 20 páginas por dia" (`target_value=20`, `unit="páginas"`,
   `source_provider_id="frieren_reading"`).
2. Registre dois `reading_logs` no mesmo dia na Frieren: 15 páginas + 10 páginas.
3. `GET /api/tasks/habits/{id}/history?year=2026` → o dia aparece com `value: 25`, `done: true`
   (25 ≥ 20).
4. Um dia sem log de leitura não aparece no histórico esparso.

## Cenário 4 — Degradação com provedor indisponível (SC-004)

1. Simule falha do provedor Frieren (ex.: derrube a conexão do Postgres momentaneamente, ou passe
   um `provider_id` cujo módulo real lance exceção).
2. `GET /api/tasks/goals/{id}` numa meta com vínculos Frieren → resposta 200, `movements.external`
   traz `"unavailable": true` para aquele provedor, resto da tela (marcos, tarefas, hábitos)
   intacto.
3. `GET /api/tasks/habits/{id}` num hábito com fonte Frieren indisponível → `done_today` cai para
   o que os check-ins manuais já indicavam (nunca 500).

## Cenário 5 — Extensibilidade (SC-006)

1. Revisão de código: nenhuma função em `tools_goals.py`/`tools_habits.py` cita literalmente
   `"livro"` ou `"diário"` — apenas `provider_id` genérico resolvido via registry.
2. `GET /api/tasks/goals/link-providers` e `GET /api/tasks/habits/source-providers` listam os
   provedores dinamicamente (a partir do registry, não de uma lista hardcoded na rota).
