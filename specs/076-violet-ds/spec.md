# Spec 076 — Violet no Design System

**Status:** entregue (backend, front, Hermes e documentação). Falta no VPS: conferir `VIOLET_GEMINI_MODEL`, rodar a limpeza de páginas vazias e, opcional, o backfill de distorções.
**Branch:** `076-violet-ds` (a partir da `075-kaguya-ds`, que ainda não foi integrada ao `master` e traz o DS
que esta spec usa).
**Plano de execução:** fases com um commit cada, como nas specs 072–075, mais uma revisão final com a
skill `impeccable`.

## Problema

A Violet (`webapp/frontend/src/pages/violet/`, rota `/journal/*`) é `legacy`: sidebar própria,
`<textarea>` cru, ícones e gráficos locais, `TweaksPanel`, `violet.css` com regras globais que vazam,
um único breakpoint (900px) e nenhuma navegação por URL. Além disso:

| Sintoma | Causa |
|---|---|
| O Arquivo mostra muitos dias vazios | `GET /page` cria página só por visitar uma data; `list_entries` lista todas as páginas, pega o 1º bullet mesmo vazio e marca sonho com `dream IS NOT NULL` |
| O número do dia (#N) muda na busca | `ROW_NUMBER` recalculado sobre o resultado filtrado |
| `@menções` nunca viram vínculo na Komi | `upsert_bullet` lê `result["people"]`, mas `find_people` devolve `matches` |
| Vínculos órfãos na Komi | editar ou apagar bullet não remove `person_links` |
| `@Ana` vincula "Ana Lima" sem perguntar | auto-link por prefixo |
| Ofensiva zera antes de você escrever hoje e reinicia em 1º/jan | cálculo só no browser, por ano |
| Horários deslocados em 3h | `get_stats` agrupa em UTC |
| Taxa de destaque ×100 duas vezes | backend já devolve % e o front multiplica |
| Não dá para apagar um bullet | `deleteBullet` existe e ninguém chama |
| Pessoas e tags não filtram | o clique só abre o arquivo |
| Conselho do Dia escolhe 3 notas e as usa de exemplo | poucas queries, um trecho por card |

## Decisões (do dono)

- Direção de arte **"Papel de carta"** — preservar o visual atual; a estrutura já funciona.
- Três fontes de escrita: **Normal**, **Roteiro** (Courier Prime) e **Cursiva** (Caveat). Fonte **por dia**
  (com padrão global nas preferências) e **por carta**; escolhida já durante a edição.
- `@Nome` com autocomplete da Komi; texto guarda o ID (`@[Nome](komi:id)`).
- Referências a outros agentes com `/k`, `/akane`, `/frieren`, `/marin`, `/mai`, `/yato`
  (`[Matrix](akane:movie:123)`), guardadas em `journal_refs` para backlinks futuros. Nami fora.
- Refletir no modelo do Journalistic (stream de seções configuráveis).
- Insights com a **força** dos hábitos da Kaguya (`habit_strength`), sem ofensiva.
- Conselho do Dia reescrito: RAG amplo, texto longo e denso com citações, continuidade com os últimos
  7 dias, tom franco ("não passa a mão na cabeça").
- Revisão semanal todo domingo à noite pelo Hermes.
- Avaliação dos Valores guiada (12 áreas, matriz 1–10, diagnóstico, ações compromissadas), contexto do Conselho.
- Abas novas: Cartas e Registro emocional (com análise de padrões).
- Modelo único de IA na Violet: **Gemini Flash 3.8** (`VIOLET_GEMINI_MODEL`).
- Mobile-first: tudo funciona no celular e é bom de escrever nele.

## O que muda

Ver o plano aprovado (fases 1–9). Resumo:

1. **Backend** — schema (`font`, `person_id` nas menções, `journal_refs`), parser `markup.py`, sync de
   vínculos Komi, provedores de referência (`search_local` em Akane/Marin/Mai/Yato), força da escrita,
   Refletir, Arquivo corrigido (leitura não cria página), stats no fuso local, cartas e emoções consolidadas.
2. **DS** — fontes `script`/`hand`, gatilho `/` no `findMention`, `useKeyboardInset`, viewport.
3. **Shell** — `AppShell`, rotas por hash, arte papel de carta, preferências.
4. **Escrever** — editor de bullets mobile-first, barra acima do teclado, fontes, autocomplete.
5. **Arquivo, Cartas, Registro emocional, Pessoas, Tags, Coleções.**
6. **Refletir.**
7. **Insights** (`StatsPage`), **Conselho**, **Revisão semanal**, **Valores**.
8. **Hermes** — tools novas e skill.
9. **Fechamento** — conformidade, `impeccable`, docs.

## Paridade (nada pode sumir)

Escrever (sonho, bullets com 6 tipos, favorito, Tutor por bullet, navegação de datas), Conselho do Dia
(gerar/regerar, ações → tarefa), Registro emocional TCC, Cartas (rascunho/lacrar/pessoas), Arquivo com
busca, Refletir, Insights (8 abas), Coleções (sonhos, destaques, ideias, sabedoria, notas), Pessoas,
Tags, Tutor de Idiomas, modo foco/amplo, voltar à Makima.

## Critérios de sucesso

- Escrever "hoje assisti /akane Matrix com a @Fulana" no celular em 390px, escolhendo nas sugestões, e o
  vínculo aparece na Komi.
- O Arquivo só mostra dias com conteúdo; o número do dia é estável.
- `npm run audit:design` passa com a Violet `conformant`; testes de lógica pura (backend e front).

## Rollout

1. Deploy. As colunas e tabelas novas são criadas por `_ensure_tables` no primeiro acesso.
2. `scripts/cleanup_violet_empty_pages.py` (dry-run, depois `--apply`) dentro do `makima-web`.
3. Conferir o ID do Gemini Flash 3.8 (`VIOLET_GEMINI_MODEL`) no ambiente.

## Fora de escopo

- Backlinks nos outros agentes (o modelo `journal_refs` já fica pronto).
- Migração da Komi para o DS (só o contrato do resumo da pessoa muda).
- Rename `agents/journal → agents/violet`.

## Estado da implementação

- [x] Fase 1 — backend
- [x] Fase 2 — fundações do DS
- [x] Fase 3 — shell
- [x] Fase 4 — Escrever
- [x] Fase 5 — Arquivo, Cartas, Emoções, Pessoas, Tags, Coleções
- [x] Fase 6 — Refletir
- [x] Fase 7 — Insights, Conselho, Revisão semanal, Valores
- [x] Fase 8 — Hermes
- [x] Fase 9 — fechamento

Verificação: `pytest tests/agents/test_violet_076.py` (34 casos puros) e `tests/agents/test_violet_076_db.py` (17 casos
contra um PostgreSQL real, com todos os schemas); a suíte inteira do backend tem as mesmas 84 falhas antigas de antes da
spec (nenhuma nova). Front: `npm test` (1023 testes, inclui `VioletShell.test.tsx`), `npm run audit:design` e `npm run build`.
Não verificado aqui: as chamadas reais ao Gemini (sem chave local) e o uso no celular de verdade.
