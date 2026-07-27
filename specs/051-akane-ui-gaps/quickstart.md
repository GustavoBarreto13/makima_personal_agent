# Quickstart: Expor na interface funcionalidades já prontas no backend

Validação manual por user story, contra um PostgreSQL real com dados de teste (não executável
neste sandbox — sem `DATABASE_URL`).

## US1 — Adicionar filme a lista / editar lista

1. Criar uma lista ("Favoritos de terror").
2. Abrir o detalhe de um filme, adicionar à lista criada — conferir que aparece ao abrir a
   lista.
3. Editar nome/descrição/cor da lista — reabrir e confirmar persistência.
4. Tentar adicionar o mesmo filme de novo à mesma lista — confirmar que não duplica (ou
   avisa que já está lá).

## US2 — Cofre editável

1. Abrir o detalhe de um filme, adicionar um item ao Cofre (tipo/título/url/fonte) —
   conferir que aparece na seção imediatamente.
2. Remover o item — conferir que some.

## US3 — Sincronização manual

1. Clicar no botão de sincronizar — conferir retorno visível (toast de sucesso com
   criados/atualizados/pulados, ou erro).
2. Simular falha do Letterboxd — conferir mensagem de erro visível (não silenciosa).

## US4 — Mapa de calor

1. Ter sessões em dias distintos do ano — abrir o Rewind, conferir o heatmap com os dias
   destacados proporcionalmente.
2. Ano sem nenhuma sessão — heatmap renderiza vazio, sem quebrar.

## US5 — Excluir filme / excluir sessão

1. Adicionar um filme de teste, excluí-lo (com confirmação) — confirmar que some das
   listagens.
2. Filme com múltiplas sessões — excluir uma específica (com confirmação) — confirmar que
   só ela some, as demais permanecem.

## Pessoas mais assistidas no Rewind

1. Ter sessões de filmes com elenco/equipe cadastrados no ano — abrir Rewind, conferir o
   bloco "Pessoas mais assistidas" com nomes de exibição corretos.

## Erro de rede vs. vazio

1. Simular falha de rede ao carregar Início/Etiquetas/Listas — conferir aviso de erro
   distinto do estado "sem dados ainda".
2. Usuário genuinamente sem dados — conferir que aparece o estado vazio normal (não o de
   erro).

## Copy da Watchlist

1. Abrir "Quero ver" sem nenhum filme — conferir que a copy referencia a ação real
   ("Logar filme" na sidebar).

## Validação estática (executável agora)

- `tsc -b --force` no frontend.
- `npm run build`.
