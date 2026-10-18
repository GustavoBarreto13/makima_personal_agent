# Spec 077 — Komi no Design System: nomes, memória, espaços e contrato de integração

**Status:** em andamento (branch `077-komi-ds`, a partir do `master`).
**Plano de execução:** fases com um commit cada (como nas specs 072–076), mais revisão final com a skill
`impeccable`. Plano completo aprovado em `/root/.claude/plans/vamos-fazer-a-migra-o-buzzing-treasure.md`.

## Problema

A Komi (`webapp/frontend/src/pages/komi/`, rota `/people/*`) é o último shell `legacy` da ordem de migração:
sidebar própria, `komi.css`, `icons.tsx` e `TweaksPanel` locais, `confirm()/alert()` nativos, `DatePicker`
legado, navegação por `useState` e nenhuma tela de estatísticas. No backend, cada agente integra do seu jeito:

| Sintoma | Causa |
|---|---|
| O filtro de pessoas da Kaguya (espaço Trabalho) nunca filtra | `people.context` não existe e ninguém chama `person_ids_for_space` |
| Só dá para ter "apelidos" soltos | um único campo de nome + aliases sem papel definido |
| Aniversário vira tarefa na Kaguya | `komi_sync.py` (spec 026) espelha `person_dates` como `type=birthday` |
| Violet alarga o `CHECK` de `person_links` no boot | `entity_type` é uma lista fixa no schema |
| Cartas, filmes e "aguardando" não aparecem no perfil | `get_person_summary` tem um bloco escrito à mão por domínio |
| Não dá desvincular nem mesclar | a agregação é só leitura |
| Os testes `test_komi*.py` estavam quebrados | assertavam `person`/`people` em vez de `perfil`/`matches` |

## Decisões (do dono)

- Direção de arte **"Caderno de bilhetes"**.
- **Três campos de nome:** Nome (o que o dono escolhe), Apelido e Nome completo. Nos outros agentes, o nome
  principal e o apelido funcionam igual para referenciar a pessoa.
- **Aniversário** é campo de toda pessoa (com lembrete); "datas importantes" são as outras (casamento…).
  Aniversários entram no calendário da Kaguya, **não são mais tarefas**, e têm lembrete.
- **Relacionamentos** (família, amigos…) são uma **lista configurável**.
- **Espaço** da pessoa: pessoal, trabalho ou ambos; em "ambos" a Memória e as Anotações separam trabalho × pessoal.
- **Memória** por pessoa: backlinks de qualquer agente + interações, com **resumo por IA**.
- **Anotações** (presentes, do que gosta…), também **sugeridas pela IA** a partir dos backlinks (só valem após aceite).
- **Registro de interações**; **desvincular**, **mesclar**, **briefing** e **relações entre pessoas**.
- **Contrato de integração** pronto para qualquer agente atual ou futuro (escrever vínculo, resolver pessoa e
  expor backlinks por um provedor).
- **Tools novas no Hermes.**

## O que muda

1. **Dados** (`agents/komi/schema_pg.sql`, `scripts/migrate_komi_ds.py`): nomes, `context`, categorias,
   aniversário, anotações, interações, resumos, relações e grupos.
2. **Contrato** (`agents/komi/integration.py` + `agents/<agente>/komi_provider.py`).
3. **Aniversários** no calendário com lembrete (espelho do Google + digest), sem tarefa.
4. **IA** na Kurisu (`person_summary.py`), estatísticas (`tools_stats.py`), mesclar/briefing/relações.
5. **API** `/api/people/*` ampliada e **tools** do Hermes (+ skill `komi-pessoas`).
6. **Kaguya** passa a filtrar pessoas pelo espaço e a linkar direto para a pessoa.
7. **Front** `pages/komi/` no Design System (`conformant`), arte `bilhetes`.
8. **Fechamento:** auditoria, `impeccable`, documentação.

## Paridade (nada pode sumir)

Diretório com busca e filtro por relacionamento, Início (contato, datas, "a acertar"), próximas datas,
perfil com vínculos (finanças, tarefas, diário, cartas, livros), criar/editar/excluir, avatar por upload,
apelidos, datas importantes, `komiApi.search/create` usados por Nami, Akane e Violet, deep link
`/people#pessoa/<id>`.

## Critérios de sucesso

- `@Bia` e `@Beatriz` resolvem a mesma pessoa em Violet, Kaguya e Hermes.
- Escrever `@Bia` numa tarefa e no diário faz os dois aparecerem na Memória, sem mexer na tela da Komi.
- Aniversário aparece no calendário da Kaguya (não como tarefa) com lembrete na véspera.
- No espaço Trabalho da Kaguya só aparecem pessoas `work` e `both`.
- `npm run audit:design` passa com a Komi `conformant`; testes de backend e front verdes.

## Rollout

1. `docker exec makima-web sh -c "cd /app && python -m scripts.migrate_komi_ds"` (dry-run), depois `--apply`,
   **antes** do deploy do backend. As tabelas novas também nascem por `ensure_schema()` no primeiro acesso.
2. Deploy; `docker restart makima-hermes` se só o `config.yaml` mudou.
3. `hermes mcp test komi` lista as tools novas.

## Fora do escopo

Kurisu `export_pessoas` (spec 028), provedor do Yato (companheiros de viagem), `person_ids` em
`update_transaction` (Nami) e na UI da Frieren, listagem da lixeira de pessoas, frequência de contato por pessoa.
