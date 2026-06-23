# Phase 026: Sincronização bidirecional de aniversários — Komi ↔ Kaguya — Specification

**Criado:** 2026-06-22
**Ambiguity score:** 0.16 (gate: ≤ 0.20)
**Requirements:** 12 locked

## Goal

Todo `person_date` cujo `label ILIKE '%aniver%'` na Komi possui uma tarefa `type='birthday'`
correspondente na Kaguya, e toda mutação (criar / editar data e label / excluir) em qualquer um
dos dois lados propaga automaticamente para o outro lado em até 1 request, sem duplicar o evento
na agenda unificada.

## Background

Hoje existem dois mecanismos de "aniversário" completamente isolados:

- **Komi** (`person_dates`): armazena datas importantes de pessoas com `label TEXT` livre e
  `recurring BOOL`. Aniversários são identificados por `label ILIKE '%aniver%'`. A API de datas
  é **INSERT-only** — `add_important_date()` não retorna o `id` gerado, e não existem funções
  de `update` nem `delete` para `person_dates`. Não há constraint de unicidade na tabela.
- **Kaguya** (`tasks type='birthday'`): aniversário = task com `type='birthday'`, `due_date` como
  data, recorrência anual em `task_recurrences (FREQ=YEARLY, mode='fixed')`, e vínculo de pessoa
  via `person_links (entity_type='task')`. Já existem `create_task`, `update_task`, `delete_task`
  (soft). O padrão de espelho best-effort pós-commit já existe em `agents/kaguya/gcal_sync.py`.
- **Agenda unificada**: `agents/komi/calendar_provider.py` já projeta todos os `person_dates`
  com label de aniversário como eventos 🎂 na agenda. Sem o sync, birthday tasks da Kaguya e
  person_dates da Komi aparecem duplicados na agenda.
- **Tabela de correspondência `birthday_sync_links`**: **não existe** — precisa ser criada.

Triggers do trabalho: usuário quer gerenciar o aniversário de qualquer lado (Komi ou Kaguya)
e que propagação seja automática, com deduplicação visual na agenda.

## Requirements

### Grupo A — Infraestrutura de correspondência

1. **Tabela birthday_sync_links**: Uma tabela de mapeamento 1:1 entre `person_dates.id` e
   `tasks.id` existe no PostgreSQL compartilhado.
   - Current: nenhuma tabela liga `person_dates` a `tasks`; o vínculo entre pessoas e tarefas
     existe apenas em `person_links` (não discrimina aniversário de outros tipos de tarefa)
   - Target: `CREATE TABLE birthday_sync_links (person_date_id INT UNIQUE REFERENCES
     person_dates(id) ON DELETE CASCADE, task_id INT UNIQUE REFERENCES tasks(id) ON DELETE CASCADE,
     created_at TIMESTAMPTZ DEFAULT now())` — executada via script de migração no container
   - Acceptance: `SELECT COUNT(*) FROM birthday_sync_links` retorna sem erro após a migração

2. **person_dates: `add_important_date` retorna o id**: A função `add_important_date()` devolve
   o `id` do registro inserido para que o caller possa gravar `birthday_sync_links`.
   - Current: INSERT sem `RETURNING`; retorno apenas `{"status":"ok","message":"..."}` — o id
     gerado é descartado
   - Target: INSERT com `RETURNING id`; retorno `{"status":"ok","id":<int>,"message":"..."}`
   - Acceptance: chamar `add_important_date()` e ler `result["id"]` retorna um inteiro > 0

3. **Komi: `update_important_date` e `delete_important_date`**: Duas novas funções de mutação
   de `person_dates` por `date_id` existem em `agents/komi/tools.py`.
   - Current: zero funções de update/delete de `person_dates`; não existe nenhum `UPDATE
     person_dates` nem `DELETE FROM person_dates` em todo o repo
   - Target: `update_important_date(date_id, *, date=None, label=None, recurring=None)` → UPDATE
     parcial; `delete_important_date(date_id)` → DELETE físico da linha
   - Acceptance: (a) chamar `update_important_date` com novo `date` reflete no banco; (b) chamar
     `delete_important_date` remove a linha de `person_dates`

4. **REST: PATCH e DELETE para datas**: Os endpoints `PATCH /api/people/{person_id}/dates/{date_id}`
   e `DELETE /api/people/{person_id}/dates/{date_id}` existem em `routers/pessoas.py`.
   - Current: apenas `POST /api/people/{id}/dates` existe; não há PATCH nem DELETE de data
   - Target: dois novos endpoints com `Depends(require_user)`, delegando a `update_important_date`
     e `delete_important_date` respectivamente
   - Acceptance: `PATCH` retorna 200 com a data atualizada; `DELETE` retorna 204

### Grupo B — Sincronização Komi → Kaguya

5. **Hook Komi→Kaguya (criar)**: Ao criar um `person_date` com `label ILIKE '%aniver%'`, o
   sistema cria automaticamente uma tarefa `type='birthday'` na lista "Aniversários" com
   `due_date` = data do aniversário, título `"Aniversário de {nome}"`, vinculada à pessoa
   via `person_links`, e grava o par em `birthday_sync_links`.
   - Current: `add_important_date` apenas insere em `person_dates`; nenhum hook existe
   - Target: após o commit, best-effort (try/except) chama `komi_birthday_sync.push_person_date(date_id)`
     que cria a tarefa e o link se não existir; se já existe (idempotente), verifica convergência
   - Acceptance: criar um person_date de aniversário gera 1 tarefa na lista "Aniversários" + 1
     linha em `birthday_sync_links`; chamar duas vezes não cria duas tarefas

6. **Hook Komi→Kaguya (editar)**: Ao atualizar um `person_date` com label aniversário (data ou
   label), a tarefa Kaguya correspondente tem `due_date` e `title` atualizados; a recorrência
   anual é re-ancorada na nova data.
   - Current: `update_important_date` não existe; nenhum hook existe
   - Target: `update_important_date` chama `push_person_date(date_id)` best-effort; o sync
     detecta a diferença via `birthday_sync_links` e aplica `update_task(task_id, due_date=...,
     title=..., recurrence={"rrule":"FREQ=YEARLY","mode":"fixed"})`
   - Acceptance: mudar a data de um person_date atualiza `due_date` e `anchor_date` da tarefa
     e reflete o novo título "Aniversário de {nome}"

7. **Hook Komi→Kaguya (excluir)**: Ao excluir um `person_date` de aniversário, a tarefa
   Kaguya correspondente é soft-deleted (scope='series') e a linha de `birthday_sync_links` é
   removida pela cascade do ON DELETE CASCADE.
   - Current: `delete_important_date` não existe; nenhum hook existe
   - Target: `delete_important_date` chama `komi_birthday_sync.remove_person_date(task_id)` best-effort
     que chama `delete_task(task_id, scope='series')`; cascade remove a linha do link
   - Acceptance: excluir o person_date soft-deletes a tarefa correspondente; `birthday_sync_links`
     não contém o par após a deleção

### Grupo C — Sincronização Kaguya → Komi

8. **Hook Kaguya→Komi (criar)**: Ao criar uma tarefa `type='birthday'` com pelo menos 1 assignee,
   o sistema cria automaticamente um `person_date` ("aniversário", due_date, recurring=True) na
   Komi para a pessoa vinculada e grava o par em `birthday_sync_links`.
   - Current: `create_task(type='birthday')` não tem hook; `push_task` cobre apenas GCal
   - Target: após o commit, best-effort `komi_sync.push_birthday(task_id)` detecta type='birthday'
     + assignee + ausência de link → cria person_date + link
   - Acceptance: criar tarefa type=birthday com 1 assignee gera 1 person_date "aniversário" na
     Komi + 1 linha em `birthday_sync_links`; assignee sem person_uuid válido é ignorado (log)

9. **Hook Kaguya→Komi (editar)**: Ao atualizar `due_date` ou `title` de uma tarefa
   `type='birthday'`, o `person_dates.date` correspondente é atualizado e a recorrência re-ancorada.
   - Current: `update_task` não tem hook para Komi; apenas GCal sync existe
   - Target: após o commit, `komi_sync.push_birthday(task_id)` compara o `due_date` atual com
     `person_dates.date`; se diferente → `update_important_date(date_id, date=novo_due_date,
     label=derivado_do_titulo)`; recorrência re-ancorada
   - Acceptance: mudar `due_date` da tarefa atualiza `person_dates.date` e `task_recurrences.anchor_date`

10. **Hook Kaguya→Komi (excluir)**: Ao soft-delete de uma tarefa `type='birthday'` com scope='series',
    o `person_date` correspondente é excluído da Komi.
    - Current: `delete_task` não tem hook para Komi; cascade apenas no GCal
    - Target: `komi_sync.remove_birthday(task_id)` chama `delete_important_date(person_date_id)`;
      cascade remove a linha do link
    - Acceptance: soft-delete da tarefa com scope='series' exclui o person_date e o link

### Grupo D — Qualidade e operação

11. **Anti-loop por convergência**: O sync nunca entra em loop infinito — um evento propagado
    não dispara nova propagação.
    - Current: não existe nenhum mecanismo de guard
    - Target: todo writer de sync consulta `birthday_sync_links`, compara o valor salvo com o
      valor atual; se idênticos → no-op (return sem chamar o lado oposto). A convergência
      garante estabilidade após 1 propagação.
    - Acceptance: criar um person_date (Komi→Kaguya sync) não dispara de volta `push_birthday`
      (Kaguya→Komi sync) — verificado em log: apenas 1 write no banco por evento

12. **Migração retroativa**: Todos os `person_dates` com `label ILIKE '%aniver%'` já existentes
    no banco no momento do deploy recebem uma tarefa `type='birthday'` correspondente na Kaguya e
    uma linha em `birthday_sync_links`.
    - Current: nenhum birthday_sync_links existe; person_dates existentes ficam sem tarefa
    - Target: script `scripts/migrate_birthday_sync.py` — executado via `docker exec makima-web
      python -m scripts.migrate_birthday_sync` — itera todos os person_dates de aniversário sem
      link e cria a tarefa + link para cada um
    - Acceptance: após executar o script, `SELECT COUNT(*) FROM birthday_sync_links` = quantidade
      de person_dates com label ILIKE '%aniver%' ativos; zero duplicatas; zero person_dates de
      aniversário sem link

## Boundaries

**In scope:**
- Tabela `birthday_sync_links` (schema + migração de criação)
- `add_important_date` com `RETURNING id`
- Novas funções `update_important_date` e `delete_important_date` em `agents/komi/tools.py`
- Endpoints `PATCH` e `DELETE` para datas em `routers/pessoas.py`
- Módulo `agents/kaguya/komi_sync.py` (push_birthday, remove_birthday, push_person_date, remove_person_date)
- Hook Komi→Kaguya em `add_important_date` / `update_important_date` / `delete_important_date`
- Hook Kaguya→Komi em `tools_tasks.py` (create_task, update_task, delete_task) para type='birthday'
- Helper `_get_birthdays_list_id()` + criação da lista "Aniversários" sob demanda
- Dedup na agenda: `agents/komi/calendar_provider.py` omite person_dates que têm link em `birthday_sync_links`
- Frontend Komi: editar e excluir datas de uma pessoa (usa os novos PATCH/DELETE)
- Script de migração retroativa `scripts/migrate_birthday_sync.py`
- Flag de feature `KOMI_SYNC_ENABLED` (env var, default on)
- Atualização de CLAUDE.md de Komi e Kaguya documentando o sync

**Out of scope:**
- Datas com label SEM 'anivers' (casamento, formatura, etc.) — ficam só na agenda Komi; expandir
  para outros tipos de data é uma fase separada
- Sincronização com o Google Calendar (GCal) — isso já é responsabilidade do `gcal_sync.py`
  existente; não duplicar
- Editar/excluir de datas no CHAT do Telegram pela Komi (o agente já pode criar; update/delete
  via Telegram pode ser adicionado em fase separada separada uma vez que as tools estejam prontas)
- Frontend de uma tela/seção dedicada "Aniversários" no shell Kaguya — a lista "Aniversários"
  já aparece na sidebar como qualquer outra lista
- Push notifications de aniversário
- Modificar `calendar_hub.py` (só `calendar_provider.py` da Komi é editado)
- `specs/019-*` — não tocar

## Constraints

- **Anti-loop obrigatório por convergência**: o guard deve ser no nível de tools (não middleware
  HTTP), pois o bot Telegram e a webapp chamam as mesmas tools. Sem flag de request — apenas
  comparação de valor.
- **Label canônico de sync**: `label ILIKE '%aniver%'` — qualquer variante ("aniversário",
  "aniversario", "aniversário de namoro", "aniversário de casamento") é sincronizada.
- **Título gerado (Komi→Kaguya)**: `"Aniversário de {nome_da_pessoa}"` para o label base.
  Para labels com complemento (ex. "aniversário de namoro"), o título fica
  `"{label capitalizado} de {nome}"`.
- **N:N por pessoa**: uma pessoa pode ter múltiplos person_dates com 'anivers' (ex.: aniversário
  de nascimento + aniversário de namoro) — cada um gera uma tarefa separada; `birthday_sync_links`
  é 1:1 entre `person_date_id` e `task_id`, não 1:N por pessoa.
- **Migração deve rodar no container**: hostname do PostgreSQL (`personal-agent-makimadb-k3bxg9`)
  é serviço Swarm, não resolve fora do container. Rodar sempre via `docker exec makima-web`.
- **FKs cruzam schemas**: `birthday_sync_links` referencia `person_dates.id` (definido no schema
  da Komi) e `tasks.id` (schema da Kaguya) — ambos no mesmo banco PostgreSQL, então FKs
  inter-schema funcionam normalmente.
- **Delete da tarefa Kaguya**: somente `scope='series'` propaga para Komi (apaga a série);
  `scope='this'` (próxima ocorrência apenas) NÃO apaga o person_date.

## Acceptance Criteria

- [ ] `SELECT COUNT(*) FROM birthday_sync_links` executa sem erro após migração do schema
- [ ] `add_important_date()` com label "aniversário" retorna `{"status":"ok","id":<int>,...}`
- [ ] Criar person_date de aniversário via tool/API gera exatamente 1 tarefa `type='birthday'`
  na lista "Aniversários" e 1 linha em `birthday_sync_links`
- [ ] Chamar `add_important_date` duas vezes com os mesmos dados NÃO cria 2 tarefas (idempotência)
- [ ] Atualizar `date` em person_date via `update_important_date` reflete em `tasks.due_date` e
  `task_recurrences.anchor_date` da tarefa correspondente
- [ ] Atualizar `due_date` de uma tarefa `type='birthday'` via `update_task` reflete em
  `person_dates.date` e re-ancora a recorrência
- [ ] Deletar um person_date de aniversário via `delete_important_date` soft-deletes a tarefa
  correspondente (scope='series') e remove o link
- [ ] Deletar uma tarefa `type='birthday'` com scope='series' exclui o person_date correspondente
  e remove o link
- [ ] Um evento propagado (Komi→Kaguya ou Kaguya→Komi) NÃO dispara segundo ciclo de propagação
  (apenas 1 write por evento no log/banco)
- [ ] Script `migrate_birthday_sync.py` executado no container: após rodar, todos os person_dates
  com label ILIKE '%aniver%' têm entrada em `birthday_sync_links`
- [ ] Na agenda unificada, um aniversário com link em `birthday_sync_links` aparece apenas 1x
  (como tarefa Kaguya), não como evento duplicado da camada Komi
- [ ] `KOMI_SYNC_ENABLED=false` desliga o espelho sem quebrar create/update/delete de nenhum dos dois lados
- [ ] `PATCH /api/people/{id}/dates/{date_id}` retorna 200 e reflete a mudança no banco
- [ ] `DELETE /api/people/{id}/dates/{date_id}` retorna 204 e remove a linha de person_dates
- [ ] Frontend da Komi: é possível editar e excluir datas de uma pessoa via UI (sem erro 404)

## Ambiguity Report

| Dimension           | Score | Min  | Status | Notes                                                      |
|---------------------|-------|------|--------|------------------------------------------------------------|
| Goal Clarity        | 0.90  | 0.75 | ✓      | Comportamento create/update/delete/migrate todos definidos |
| Boundary Clarity    | 0.85  | 0.70 | ✓      | ILIKE define in/out; outros labels explicitamente fora     |
| Constraint Clarity  | 0.80  | 0.65 | ✓      | Anti-loop, flag, ILIKE, título, N:N, VPS exec claro        |
| Acceptance Criteria | 0.78  | 0.70 | ✓      | 15 critérios pass/fail cobrindo todos os fluxos            |
| **Ambiguity**       | 0.16  | ≤0.20| ✓      |                                                            |

## Interview Log

| Rodada | Perspectiva      | Pergunta resumida                        | Decisão travada                                             |
|--------|------------------|------------------------------------------|-------------------------------------------------------------|
| 1      | Researcher       | Delete sync: apagar ou desvincular?      | Apagar dos dois lados (cascade)                             |
| 1      | Researcher       | Migração retroativa ou apenas novos?     | Retroativa — script cria tarefas para todos os existentes   |
| 1      | Researcher       | Sync de data apenas ou data+título?      | Data + título sincronizam bidirecionalmente                 |
| 2      | Researcher       | Formato do título da tarefa gerada?      | "Aniversário de {nome}"                                     |
| 2      | Simplifier       | Frontend Komi nesta fase?               | Sim — editar/excluir datas incluído                         |
| 2      | Researcher       | Label canônico (escopo do sync)?         | ILIKE '%aniver%' — qualquer variante sincroniza             |
| 3      | Boundary Keeper  | Uma pessoa com 2 labels 'anivers'?       | N tasks para N labels (1:1 por person_date)                 |
| 3      | Boundary Keeper  | Kaguya→Komi: re-ancora recorrência?      | Sim — due_date atualiza date e re-ancora anchor_date        |

---

*Fase: 026-aniversario-sync*
*Spec criado: 2026-06-22*
*Próximo passo: /gsd:discuss-phase 026 — decisões de implementação (como construir o que está especificado acima)*
