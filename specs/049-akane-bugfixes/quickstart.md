# Quickstart: Correções de bugs da Akane

Validação manual por user story, contra um PostgreSQL real com dados de teste (não executável
neste sandbox — sem `DATABASE_URL`).

## US1 — Tela Início carrega sem erro

1. Ter ao menos 1 filme com `liked = TRUE` e uma sessão em `diary_entries` nos últimos 7 dias.
2. Abrir `/movies` (Início) no webapp — esperado: sem erro 500, atividade recente mostra o
   coração/curtida certo.
3. Pedir "resumo da coleção" pelo Telegram (Akane) — esperado: resposta normal.
4. Soft-deletar um filme com sessão nos últimos 7 dias (`UPDATE movies SET deleted = TRUE
   WHERE id = ...`) — esperado: contagem do sparkline de 7 dias não inclui essa sessão.

## US2 — Notas corretas nos gráficos

1. Avaliar filmes com notas 1, 2, 3, 4, 5 (inteiras) e 1.5/2.5 (meias).
2. Abrir Início — esperado: barras de 1★-5★ e das meias todas aparecem no histograma.
3. Abrir Rewind do ano corrente — esperado: mesmo histograma correto.
4. Conferir "pessoas mais assistidas" no Rewind — esperado: nomes com capitalização/acentos
   corretos (ex. "Satoshi Kon", não "satoshi kon").

## US3 — Rewatch de filme já catalogado

1. Ter um filme já cadastrado (com ao menos 1 sessão).
2. Abrir "Logar filme", buscar o mesmo título, selecionar o resultado — esperado: sem erro,
   nova sessão de reassistida criada.
3. Buscar um filme que NÃO está no catálogo e confirmar — esperado: cria o filme + 1ª sessão
   (comportamento preservado).
4. Rodar o teste #2 depois das 21h (horário de Brasília) sem alterar a data padrão — esperado:
   sessão grava com a data local de hoje, não amanhã.

## US4 — Sync do Letterboxd confiável

1. Montar (ou usar um fixture) uma entrada RSS sem `letterboxd:watchedDate`, só com
   `pubDate` — esperado: sessão criada com a data de `pubDate` convertida corretamente
   (não descartada).
2. Simular indisponibilidade total do feed (mock de exceção de rede em todas as tentativas)
   — esperado: alerta disparado (Telegram via `scheduler/notify.py`), não um "sucesso" com
   0 itens.
3. Rodar sync legítima sem itens novos — esperado: SEM alerta (só log informativo).
4. Entrada com nota fora de `0.5..5.0` — esperado: valor ajustado aos limites, mesma regra
   do import CSV.

## Validação estática (executável agora)

- `python -m py_compile` nos módulos Python alterados.
- Import smoke test de `agents.akane.tools` e `webapp.backend.main` com env vars dummy.
- `tsc -b --force` no frontend.
- `npm run build`.
