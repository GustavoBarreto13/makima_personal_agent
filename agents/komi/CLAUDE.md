# CLAUDE.md — agents/komi

## O que é este agente

**Komi** é a dona da **identidade canônica de pessoas** (inspirada em Komi-san wa Comyushou desu —
tímida, mas cuidadosa com cada detalhe de quem está ao redor). Todo agente que fala de uma pessoa
(Nami, Kaguya, Violet, Akane, Frieren, Yato…) aponta para a mesma linha em `people`.

Responsabilidades:
- Cadastrar, editar, apagar (lixeira) e restaurar pessoas, com **três nomes** (Nome, Apelido, Nome completo).
- **Espaço** da pessoa: pessoal, trabalho ou os dois (a Kaguya filtra por ele).
- **Aniversário** como campo de toda pessoa + outras datas importantes, cada uma com **lembrete**.
- **Memória** da pessoa: os backlinks de todos os agentes numa linha do tempo, com **resumo por IA**.
- **Anotações** (presentes, gosta, não gosta, notas) — a IA só *sugere*, o dono aceita.
- **Interações** ("falei com X ontem") → "sem contato há N dias", estatísticas.
- **Relacionamentos** configuráveis, **relações entre pessoas**, **grupos**, **mesclar** duplicadas, **briefing**.
- Expor o **contrato de integração** (`integration.py`) que qualquer agente atual ou futuro usa.

Specs: `specs/014-pessoas/` (base), `specs/077-komi-ds/spec.md` (esta reforma).

---

## Arquitetura

```
Hermes / Telegram → komi_agent (ADK, singleton) ─┐
Webapp /people  → routers/pessoas.py ───────────┼→ agents/komi/*  → PostgreSQL
Hermes (MCP)    → mcp_servers/makima (domínio komi, 34 tools + resumo da Kurisu)
```

| Módulo | Papel |
|---|---|
| `tools.py` | CRUD de pessoas, nomes, datas, aniversário, busca (`find_people`, `suggest_people`), `get_person_summary`, `get_people_overview` |
| `integration.py` | **Contrato** para outros agentes: vínculos, resolver pessoa, menções, memória, mesclagem |
| `naming.py` | Motor puro: `norm`, validação de espaço/aniversário, idade, próximo aniversário, `today_sp` |
| `schema.py` + `schema_pg.sql` | Schema idempotente; `ensure_schema()` roda sob demanda (lock consultivo) |
| `tools_notes.py` / `tools_interactions.py` / `tools_categories.py` / `tools_relations.py` | Anotações, interações, relacionamentos configuráveis, relações e grupos |
| `tools_merge.py` + `duplicates.py` | Mesclar (prévia → confirmar, **sem desfazer**) e sugestão de duplicatas |
| `briefing.py` | "O que eu preciso saber antes de falar com ela?" (cada bloco isolado) |
| `summaries.py` | Cache do resumo de IA (`person_memory_summaries`) |
| `tools_stats.py` | `StatsPayload` do Design System (contatos por mês, sem contato, aniversários, menções cruzadas) |
| `calendar_provider.py` | Fonte `komi` do Calendar Hub da Kaguya: aniversários e datas **no calendário, não como tarefa** |
| `toolset.py` | `TOOLS` (34) reaproveitadas pelo host MCP e pelo agente ADK |
| `rows.py` | `valor()` — leitura de linha agnóstica ao tipo de cursor |

A IA do resumo vive na **Kurisu**: `agents/kurisu/person_summary.py` (modelo `KOMI_MODEL`, env
`KOMI_GEMINI_MODEL`, padrão = o da Violet) e `agents/kurisu/komi_tools.py` (tool `summarize_person_memory`,
juntada ao domínio `komi` em `mcp_servers/makima/registry.py`). `agents/komi/` **não** importa a Kurisu.

---

## Schema PostgreSQL

Coluna a coluna em [`docs/referencia/POSTGRES.md`](../../docs/referencia/POSTGRES.md#9-domínio-komi--pessoas). Resumo:

| Tabela | Para quê |
|---|---|
| `people` | Identidade: `name` (**Nome**, o que o dono escolhe), `nickname` (**Apelido**), `full_name` (**Nome completo**) + colunas `_norm`; `context` (`personal`/`work`/`both`); `birth_day/month/year` + `birthday_remind_days`; `category` (slug); `merged_into` |
| `person_aliases` | "Outras formas" de chamar (só para a busca achar) |
| `person_dates` | Outras datas importantes (casamento, formatura…) com `remind_days_before` |
| `person_links` | Vínculo polimórfico pessoa ↔ item de qualquer agente (`entity_type` livre, validado por formato) |
| `person_categories` | **Relacionamentos** como lista configurável (slug, rótulo, ícone do DS, ordem, arquivado) |
| `person_notes` | Anotações: `kind` (presente/gosta/nao_gosta/nota), `context`, `source` (manual/ia), `source_refs`, `status` (ativa/sugerida/descartada) |
| `person_interactions` | Contatos: `kind` (mensagem/ligacao/encontro/video/outro), `context`, `happened_at` |
| `person_memory_summaries` | Cache do resumo de IA por (pessoa, espaço) com `source_hash` → "desatualizado" |
| `person_relation_kinds` / `person_relations` | Tipos de relação com inverso (pai↔filho) e o par canônico |
| `person_groups` / `person_group_members` | Grupos livres ("turma da faculdade") |
| `komi_migrations` | Etapas de dados já aplicadas por `scripts/migrate_komi_ds.py` |

### Regras que não se quebram

- **Nome, Apelido e "outras formas" são chaves de resolução**: nenhum pode colidir com o de outra pessoa
  viva (`_conflito_de_nome`, mensagem cita de quem é). `@Bia` e `@Beatriz` resolvem a mesma pessoa.
- **Soft delete sempre** (`deleted=TRUE`); vínculos históricos ficam e voltam no `restore_person`.
- **Interação/anotação/item da memória têm espaço `personal` ou `work` — nunca `both`**. "Ambos" é só da
  pessoa; é isso que separa trabalho de pessoal nas abas.
- **Datas no fuso America/Sao_Paulo** (`naming.today_sp`, `AT TIME ZONE`); nunca `CURRENT_DATE`.
- **Aniversário não é tarefa.** Dia + mês andam juntos (CHECK), ano é opcional (sem ano, sem idade);
  29/02 cai em 28/02 em ano comum. Lembrete = `birthday_remind_days` (`NULL` = sem; `0` = no dia).
- **Anotação sugerida pela IA nunca vira ativa sozinha**; descartada guarda `text_norm` para não voltar.
- **Mesclar não tem desfazer** (a tool, o router e a tela dizem isso antes); apagar pessoa tem.

---

## Como integrar um agente com a Komi (3 passos)

Contrato completo (e docstring) em [`integration.py`](integration.py). Nada na Komi nem na tela dela muda.

1. **Gravar o vínculo** na mesma transação do item (import lazy, evita ciclo):
   ```python
   from agents.komi.integration import link_people, sync_people
   link_people(cur, "meu_tipo", item_id, person_ids)   # ao criar (acrescenta)
   sync_people(cur, "meu_tipo", item_id, person_ids)   # ao editar (substitui o conjunto)
   ```
   `entity_type` é livre (minúsculas, números e `_`). Antes de vincular, o agente resolve a pessoa com
   `resolve_person(texto)` — **0** matches: oferecer cadastro; **1**: usar e dizer "encontrei [Nome]";
   **2+**: perguntar qual. Nunca vincular sem confirmação quando há dúvida.
2. **Criar `agents/<agente>/komi_provider.py`** com `LINK_TYPES = [{entity_type, agent, label, icon, resolve, …}]`
   (campos opcionais: `by_person`, `summary_key`/`summary`, `last_activity`/`activity_kind`, `on_unlink`,
   `on_merge`). A Komi descobre o arquivo sozinha. `resolve(ids)` devolve itens com `entity_id`, `title`,
   `snippet`, `date`, `deep_link` e `context` (`personal`/`work`).
3. **Pronto**: o agente aparece na Memória, nos filtros por agente, no briefing e no "há quanto tempo". Um
   provedor com erro **nunca** derruba o perfil (a Memória avisa "pode estar incompleta").

Outros usos do contrato: `people_for_space(space)` (pessoas de trabalho × pessoais), `parse_mentions` /
`render_mention` / `plain_text` / `replace_mention_id` (token `@[Nome](komi:id)`, o mesmo da Violet),
`unlink_item` / `link_item` (desvincular com Desfazer), `copy_links` (duplicar item).

| Agente | entity_type | Provedor |
|---|---|---|
| Nami | `transaction` | `agents/nami/komi_provider.py` |
| Kaguya | `task` (+ `task_waiting` via `waiting_person_id`) | `agents/kaguya/komi_provider.py` |
| Frieren | `book` | `agents/frieren/komi_provider.py` |
| Violet | `journal_bullet`, `journal_letter` | `agents/journal/komi_provider.py` |
| Akane | `movie_diary_entry` | `agents/akane/komi_provider.py` |
| Komi | `interaction` (e datas) | embutido na própria Komi |

---

## Tools (34 no Hermes/MCP + `summarize_person_memory` da Kurisu)

| Grupo | Tools |
|---|---|
| Pessoa | `create_person`, `update_person`, `delete_person`, `restore_person`, `get_person`, `get_person_summary`, `list_people`, `find_people`, `resolve_person` |
| Nomes | `add_alias`, `remove_alias` (Nome/Apelido/Nome completo vão em `create_person`/`update_person`) |
| Datas | `set_birthday`, `upcoming_birthdays`, `add_important_date`, `update_important_date`, `delete_important_date` |
| Memória | `get_person_memory`, `get_person_briefing`, `add_person_note`, `list_person_notes`, `log_interaction`, `list_interactions` |
| Relacionamentos | `list_categories`, `create_category`, `list_relation_kinds`, `relate_person`, `list_relations`, `create_people_group`, `list_people_groups`, `add_person_to_group`, `remove_person_from_group` |
| Duplicadas | `find_duplicates`, `preview_merge`, `merge_people` (**irreversível**: sempre com confirmação explícita) |

Roteamento: "falei com X ontem" → `log_interaction`; "a Bia gosta de orquídeas" → `add_person_note` (`gosta`);
**aniversário → Komi** (`set_birthday`), nunca tarefa na Kaguya (`create_task(type="birthday")` redireciona para cá).
Skill do Hermes: `hermes/skills/komi-pessoas/SKILL.md`.

---

## Router REST — `/api/people/*`

Rotas completas em [`webapp/docs/API.md`](../../webapp/docs/API.md#pessoas-apipeople). Todas com
`Depends(require_user)`. **Rotas fixas (`/overview`, `/search`, `/suggest`, `/stats`, `/categories`, `/groups`,
`/duplicates`, `/merge`, `/notes/…`, `/interactions/…`, `/uploads/avatar`) são declaradas ANTES de `/{person_id}`.**
`PATCH` usa `exclude_unset` (enviar `null` limpa o campo; não enviar não mexe).

---

## Calendário e lembretes (aniversário ≠ tarefa)

- `calendar_provider.py` entrega ao Calendar Hub da Kaguya o aniversário (campo da pessoa, com idade quando há
  ano) e as outras datas; o espelho Google "Komi — Pessoas" (`agents/kaguya/gcal_mirror.py`) leva o **lembrete**
  como `popup` `dias × 1440 − 540` minutos antes (evento de dia inteiro, avisa às 9h).
- O digest matinal da Kaguya traz "Aniversários hoje e nos próximos 7 dias" com as ideias de presente
  (`upcoming_birthdays`).
- O sync antigo Komi↔Kaguya (spec 026: `birthday_sync_links`, `komi_sync.py`) foi **removido**; a migração
  `scripts/migrate_komi_ds.py` leva as tarefas `birthday` antigas para a lixeira depois de garantir o campo.

---

## Comportamento no Telegram / WhatsApp

- Sempre começa com `Komi:`; tímida mas precisa. **Nunca cria duplicata silenciosamente** (confere
  `find_people` antes); confirma a interpretação ("Vou cadastrar Ana Silva como amiga, certo?").
- Apagar pede confirmação; **mesclar** mostra a prévia e avisa que não desfaz.
- Formatação HTML (`<b>`, `<i>`), nunca markdown; erros com ❌, confirmações com ✅.

---

## O que NÃO fazer aqui

- **Não deletar fisicamente** pessoa, interação ou anotação — soft delete.
- **Não importar `agents.nami/kaguya/frieren/journal/akane` no topo** de `agents/komi/*`: ciclos. Os provedores
  moram no pacote de cada agente e são descobertos em tempo de execução.
- **Não duplicar a regra de resolução** (0/1/2+) nem o token `@[Nome](komi:id)` num agente: use `integration.py`.
- **Não criar tarefa de aniversário** na Kaguya nem reintroduzir o sync antigo.
- **Não gravar vínculo fora da transação do item**: `link_people`/`sync_people` recebem o cursor do chamador.
- **Não assumir que `person_links.entity_type` é uma lista fechada**: o banco só impõe o formato.
- **Não usar `CURRENT_DATE`/`date.today()`** em regra de aniversário ou "há quanto tempo" (UTC no container).

Testes: `tests/agents/test_komi*.py` (+ `komi_testing.py`, que monta um banco com o schema de todos os agentes),
`tests/test_people_router.py`, `tests/test_komi_toolset.py`.
