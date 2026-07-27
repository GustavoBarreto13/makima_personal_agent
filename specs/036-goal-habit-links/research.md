# Research — 036 Metas e Hábitos cross-agent

## R1 — Mecanismo genérico: dois registries (não um), espelhando o Calendar Hub

**Decisão**: dois módulos de registry na Kaguya, cada um com o contrato certo para o seu caso:
- `agents/kaguya/goal_link_providers.py` — provedores de **vínculo de meta** (buscar + resolver status).
- `agents/kaguya/habit_source_providers.py` — provedores de **fonte automática de hábito** (atividade por dia).

**Racional**: FR-010 pede um mecanismo genérico por tipo de entidade + provedor registrado, mas
metas e hábitos consultam formas diferentes de dado (busca+resolução vs. série temporal). Forçar
os dois em um contrato único obrigaria um dos lados a simular campos que não usa. Cada registry
copia o padrão já validado em `calendar_hub.py` (fatia 019): `register(id, fn)`,
`_try_import_provider(module_path, fn_name)` (degrada para provedor vazio se o módulo não existe
ainda — nenhum erro fatal), e uma função de fan-out best-effort que captura exceção por provedor.

**Alternativas rejeitadas**: um único `link_registry.py` com um contrato "gordo" (search + resolve
+ get_activity, a maioria ignorada por cada provedor) — mais confuso que dois registries pequenos
e coesos.

## R2 — Contrato do provedor de vínculo de meta (Goal Link Provider)

```python
def search_items(query: str) -> list[dict]:
    # -> [{"id": str, "label": str, "sublabel": str|None, "cover_url": str|None}]
def resolve_items(ids: list[str]) -> list[dict]:
    # -> [{"id": str, "label": str, "sublabel": str|None, "cover_url": str|None,
    #      "done": bool, "deep_link": str|None}]
```

`resolve_items` recebe só os ids já vinculados (via `goal_external_links`) e devolve o estado
ATUAL — nunca cacheado. `done: True` é o sinal genérico "conta para o progresso automático"
(fase 1: `status == 'lido'` na Frieren). IDs que não existem mais são simplesmente omitidos da
resposta — o chamador (tools_goals) trata a ausência como "sumiu da lista" (FR-009), não como erro.

**Fase 1**: `agents/frieren/goal_provider.py` implementa os dois (busca por título/autor via
`ILIKE`, reaproveitando a query já usada no menu de livros; resolve via
`SELECT id, title, author, cover_url, status FROM books WHERE id = ANY(ids)`).

## R3 — Contrato do provedor de fonte de hábito (Habit Source Provider)

```python
def get_activity(start_date: str, end_date: str) -> dict[str, float]:
    # -> {"2026-07-05": 1.0, "2026-07-06": 25.0, ...}  (dias sem atividade: ausentes do dict)
```

Um único método, símile do provedor do Calendar Hub (`(start, end) -> lista`), mas devolvendo um
mapa esparso data→valor. Para hábito binário (diário), qualquer chave presente conta como
cumprido (o valor em si é irrelevante, convenciona-se `1.0`). Para hábito mensurável (leitura), o
valor é a soma diária real (páginas) — comparado com `target_value` pela mesma regra que já existe
em `habit_strength.met_target`.

**Fase 1**:
- `agents/journal/habit_provider.py` → 1.0 nos dias com ≥1 bullet de conteúdo não-vazio.
- `agents/frieren/habit_provider.py` → soma de `reading_logs.pages_read` agrupada por `date`.

## R4 — Nada persistido derivado: métrica de meta e check-in automático calculados na leitura

**Decisão**: nem o progresso automático da meta nem os check-ins automáticos de hábito escrevem
linha nova em `habit_checkins`. Ambos são computados a cada consulta, mesclando os dados do
provedor em memória — coerente com `goal_progress.py`/`habit_strength.py` (motores puros que já
recebem tudo pronto e nunca tocam banco). Isso resolve de graça o edge case "removeu o registro na
fonte → some o check-in" (FR-007) e "livro relido volta para 'lendo' → progresso recalcula pra
baixo" (edge case da meta): não há nada para invalidar, o valor é sempre o estado atual.

**Consequência prática**: `habit_checkins` **não ganha coluna nova** (`source`); a distinção
manual/automático em `_serialize_habit`/`get_habit_history` é calculada comparando o mapa de dias
manuais (do banco) com o mapa de dias automáticos (do provedor) no momento da leitura — um dia com
as duas fontes conta uma vez (união dos conjuntos), sem duplicidade (FR-007/AC4).

## R5 — Vínculo de meta: tabela genérica nova, não reaproveitar `person_links` da Komi

**Decisão**: nova tabela `goal_external_links (goal_id, provider_id, entity_id)`, com
`UNIQUE (goal_id, provider_id, entity_id)`, em vez de estender `person_links` (que já é
polimórfica) para também servir metas.

**Racional**: `person_links` amarra uma PESSOA a qualquer entidade; aqui é uma META que amarra a
uma entidade de outro domínio — semântica diferente (não é "quem está envolvido", é "o que conta
para este número"). Reaproveitar a tabela da Komi criaria acoplamento errado (Kaguya escrevendo na
tabela de outro agente) e um `entity_type` fantasma sem dono claro. O padrão de design (chave
composta idempotente, `entity_id` como TEXT) é copiado da Komi como **referência de forma**, não
como tabela compartilhada — igual a Assumptions do spec.md.

**Diferença de cardinalidade vs. Komi**: aqui o vínculo NÃO é exclusivo — o mesmo livro pode contar
para duas metas (edge case do spec: "Mesmo livro em duas metas: permitido"). `person_links` também
não é exclusivo por pessoa, então o padrão de idempotência (`ON CONFLICT DO NOTHING`) serve igual.

## R6 — Progresso automático da meta: contagem genérica de `done=True`, sem campo extra no schema

**Decisão**: quando `goals.metric_mode = 'auto'`, o valor "atual" da métrica é
`COUNT(*)` dos itens em `goal_external_links` cujo `resolve_items` (de qualquer provedor vinculado)
devolveu `done: True` — agregando por TODOS os provedores vinculados àquela meta, não um único
"provider dono da métrica". Isso evita precisar de uma coluna `metric_provider_id`: a meta de
leitura da fase 1 só tem vínculos de um provedor (`frieren_books`), então a distinção nunca aparece
na prática, e a arquitetura já suporta (sem mudança futura) uma meta com vínculos de dois
provedores diferentes contando juntos para o mesmo número — o que é uma generalização razoável do
requisito, não uma complexidade extra.

`metric_current` (coluna já existente, NUMERIC) continua sendo a fonte de verdade em modo
**manual**. Em modo **auto**, a coluna vira "o último valor calculado" (congelado só no instante em
que a meta volta para manual — edge case do spec) e a leitura ignora o valor armazenado, sempre
recalculando ao vivo.

## R7 — Bloqueio de edição manual em modo automático

**Decisão**: `update_goal` recusa `metric_current` quando `goal.metric_mode == 'auto'`, devolvendo
`{"status": "error", "message": "..."}` explicando a fonte (FR-003, AC3). Uma função dedicada
`set_metric_mode(goal_id, mode)` faz a transição: `manual → auto` não faz nada especial (passa a
computar ao vivo); `auto → manual` primeiro computa o valor ao vivo uma última vez e grava em
`metric_current` antes de trocar o modo (edge case: "o último valor calculado vira o valor manual
inicial").

## R8 — Resiliência: falha de provedor não derruba a consulta (FR-008)

Cada chamada ao registry (`goal_link_providers.resolve`, `habit_source_providers.get_activity`) é
envolvida em `try/except` dentro do PRÓPRIO registry (não em cada chamador) — mesmo padrão do
`calendar_hub.aggregate`. Em caso de exceção: `goal_link_providers.resolve` devolve `[]` +
sinaliza o provider_id na lista de erros; a UI mostra "não foi possível carregar os livros agora"
naquele grupo, sem afetar marcos/tarefas/experimentos que já carregaram. Em hábitos,
`habit_source_providers.get_activity` devolve `{}` em falha — equivalente a "nenhuma atividade
detectada esse período" (degrada para um funcionamento são, mesmo que subestime o hábito
temporariamente).

## R9 — Sem tools ADK novas (Webapp-only), como 024/029/030/035

Mesma decisão das últimas fatias da Kaguya: nenhuma função nova é registrada como tool do agente
ADK. `tools.py` só re-exporta para o router usar. A Kaguya no Telegram pode citar o progresso
automático ao responder perguntas existentes sobre metas/hábitos (o dado já vem calculado dentro
de `list_goals`/`get_habit`), mas não há fluxo conversacional de vínculo (fora de escopo, conforme
Assumptions do spec.md).

## R10 — Sem coluna de parâmetros no provedor de hábito (YAGNI)

Cogitou-se um `habits.source_config JSONB` para parametrizar a fonte (ex.: "só contar páginas de
UM livro específico"). Nenhuma das duas fontes da fase 1 precisa de parâmetro — descartado por
YAGNI (Constitution Principle V). Se um provedor futuro precisar de parâmetro, a migração adiciona
a coluna nesse momento; `habits.source_provider_id TEXT NULL` sozinho já resolve o caso atual.
