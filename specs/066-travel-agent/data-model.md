# Data Model: Yato — agente de Viagens

Fonte: `spec.md` (Key Entities + Functional Requirements) e `research.md`. Schema alvo:
`agents/yato/schema_pg.sql`, aplicado por `python -m scripts.setup_schemas`. Convenções seguidas
(ver `plan.md` Phase 0, D1–D4): IDs `TEXT PRIMARY KEY` (`str(uuid.uuid4())`), enums como `TEXT` com
comentário, `updated_at` setado à mão, sem CHECK/trigger, `IF NOT EXISTS` em tudo.

8 tabelas: `trips` · `trip_items` · `mobility_dossiers` · `mobility_checks` ·
`trip_mobility_snapshots` · `mobility_apps` · `trip_checklist_items` · `trip_budget_items`.

---

## `trips`

A viagem — raiz de tudo o mais. Uma cidade por viagem (decisão do clarify).

| Coluna | Tipo | Nulo? | Default | Descrição |
|---|---|---|---|---|
| `id` | TEXT | PK | — | UUID gerado em Python. |
| `title` | TEXT | SIM | — | Título livre (ex.: "Tiradentes de setembro"); se vazio, UI monta `Cidade/UF`. |
| `city` | TEXT | NÃO | — | Cidade de destino. |
| `state_uf` | TEXT(2) | NÃO | — | UF, 2 letras maiúsculas. |
| `start_date` | DATE | NÃO | — | Data de ida. |
| `end_date` | DATE | NÃO | — | Data de volta; `>= start_date` (FR-002). |
| `profile` | TEXT | NÃO | `'equilibrado'` | `economia` \| `equilibrado` \| `conforto`. |
| `status` | TEXT | NÃO | `'planejando'` | `planejando` \| `confirmada` \| `em_curso` \| `concluida` \| `cancelada`. |
| `notes` | TEXT | SIM | — | Notas livres. |
| `created_at` | TIMESTAMPTZ | NÃO | `NOW()` | Criação. |
| `updated_at` | TIMESTAMPTZ | NÃO | `NOW()` | Atualização (setado à mão nos UPDATEs). |
| `deleted` | BOOLEAN | NÃO | `FALSE` | Soft delete. |

**Validações na camada de tools** (FR-002): `end_date >= start_date`; `end_date - start_date <= 60`
dias — recusar com mensagem clara em ambos os casos.

**Máquina de estados de `status`**: `planejando → confirmada → em_curso → concluida`, com
`cancelada` alcançável de qualquer estado anterior a `concluida`. A transição
`planejando/confirmada → confirmada` (i.e., ao **entrar** em `confirmada`) é o gatilho do snapshot
de mobilidade (FR-013a) — ver `trip_mobility_snapshots` abaixo. Viagens `cancelada` somem das
visões de "próximas" mas mantêm histórico e orçamento realizado (Edge Cases).

**Índices**: `idx_trips_deleted (deleted)` · `idx_trips_status (status)` ·
`idx_trips_dates (start_date, end_date)` (consultas de "próxima viagem"/dossiê desatualizado).

---

## `trip_items`

Roteiro dia a dia — uma linha por atividade.

| Coluna | Tipo | Nulo? | Default | Descrição |
|---|---|---|---|---|
| `id` | TEXT | PK | — | UUID. |
| `trip_id` | TEXT | NÃO | — | **FK** → `trips(id)`. |
| `day_date` | DATE | NÃO | — | Deve estar em `[trips.start_date, trips.end_date]` (FR-004). |
| `period` | TEXT | NÃO | — | `manha` \| `tarde` \| `noite`. |
| `start_time` | TIME | SIM | — | Horário opcional (Edge Cases: período basta). |
| `title` | TEXT | NÃO | — | Nome da atividade/ponto. |
| `address` | TEXT | SIM | — | Endereço/referência em texto livre (sem geocodificação nesta fatia). |
| `transport_mode` | TEXT | SIM | — | `a_pe` \| `transporte_publico` \| `app_corrida` \| `taxi` \| `mototaxi` \| `transfer` \| `outro`. |
| `cost_estimate` | NUMERIC(10,2) | SIM | — | Custo estimado do item. |
| `notes` | TEXT | SIM | — | Notas livres. |
| `position` | INTEGER | NÃO | `0` | Ordem dentro do par `(day_date, period)`. |
| `created_at` | TIMESTAMPTZ | NÃO | `NOW()` | — |
| `updated_at` | TIMESTAMPTZ | NÃO | `NOW()` | — |

**Regra de órfãos** (FR-005): ao alterar `trips.start_date`/`end_date`, qualquer `trip_item` cujo
`day_date` fique fora do novo intervalo é reportado (contagem) e exige decisão explícita do usuário
(mover para uma data válida ou remover) — a tool de update de datas **nunca** apaga em silêncio.

**Listagem** (FR-006): `ORDER BY day_date, CASE period WHEN 'manha' THEN 0 WHEN 'tarde' THEN 1 WHEN
'noite' THEN 2 END, position`.

**Índices**: `idx_trip_items_trip (trip_id)` · `idx_trip_items_day (trip_id, day_date)`.

---

## `mobility_dossiers`

O dossiê de mobilidade — **global por cidade**, reaproveitado entre viagens (clarify).

| Coluna | Tipo | Nulo? | Default | Descrição |
|---|---|---|---|---|
| `id` | TEXT | PK | — | UUID. |
| `city` | TEXT | NÃO | — | Cidade. |
| `state_uf` | TEXT(2) | NÃO | — | UF. |
| `city_size` | TEXT | SIM | — | `capital` \| `media` \| `pequena` — calibra a expectativa do passo 1. |
| `pedestrian_scale` | BOOLEAN | NÃO | `FALSE` | Cidade de escala pedonal (ex.: Jericoacoara) — fecha o dossiê sem mobilidade motorizada aplicável. |
| `summary` | TEXT | SIM | — | Síntese consolidada (estratégia recomendada + observações). |
| `last_checked_at` | TIMESTAMPTZ | SIM | — | Última vez que algum check foi atualizado. |
| `created_at` | TIMESTAMPTZ | NÃO | `NOW()` | — |
| `updated_at` | TIMESTAMPTZ | NÃO | `NOW()` | — |

**Constraint**: `UNIQUE(city, state_uf)` — chave de negócio; se a UF não vier informada, a tool
pergunta antes de criar (Edge Cases, cidades homônimas).

**Desatualização** (FR-013): `last_checked_at < NOW() - INTERVAL '180 days'` ⇒ a tool de leitura do
dossiê marca `stale: true` e sugere revalidação — calculado na query, não uma coluna própria.

**Índices**: `idx_mobility_dossiers_city_uf` (implícito pela UNIQUE) ·
`idx_mobility_dossiers_last_checked (last_checked_at)`.

---

## `mobility_checks`

Um passo do protocolo de 7 passos. É onde mora a honestidade epistêmica do agente (FR-009 a FR-011).

| Coluna | Tipo | Nulo? | Default | Descrição |
|---|---|---|---|---|
| `id` | TEXT | PK | — | UUID. |
| `dossier_id` | TEXT | NÃO | — | **FK** → `mobility_dossiers(id)`. |
| `check_key` | TEXT | NÃO | — | `porte_cidade` \| `uber` \| `99` \| `indrive` \| `transporte_publico` \| `hospedagem_transfer` \| `deslocamentos`. |
| `verdict` | TEXT | NÃO | `'pendente'` | `confirmado` \| `ausente` \| `inconclusivo` \| `pendente`. |
| `source` | TEXT | SIM | — | `simulacao_in_app` \| `pagina_oficial` \| `google_maps` \| `moovit` \| `contato_hospedagem` \| `relato_local` \| `outro`. |
| `evidence` | TEXT | SIM | — | Texto livre — o que foi observado/relatado. |
| `checked_at` | TIMESTAMPTZ | SIM | — | Data/hora da checagem (NULL enquanto `pendente`). |

**Constraint**: `UNIQUE(dossier_id, check_key)` — upsert por passo.

**Regra dura** (FR-010, FR-011, SC-003, SC-004): ausência de dado (ex.: rota de ônibus não aparece
no Google Maps/Moovit) grava `verdict='inconclusivo'`, **nunca** `'ausente'`. `'ausente'` só é
gravado com evidência explícita de tentativa e falha (ex.: simulação no app não achou carro). A
tool nunca declara `confirmado`/`ausente` sozinha — o veredito vem sempre da resposta do usuário ao
passo conduzido.

**Estratégia consolidada** (FR-012) — calculada em `agents/yato/tools_mobility.py`, não persistida
como coluna própria (deriva-se dos 7 vereditos toda vez que é lida):
`caminhavel` (se `pedestrian_scale`) \| `transporte_publico` \| `app_corrida` \| `taxi_mototaxi` \|
`transfer_hospedagem` \| `carro_alugado`, junto com a lista dos `check_key` ainda `pendente`.

**Índices**: `idx_mobility_checks_dossier (dossier_id)`.

---

## `trip_mobility_snapshots`

Cópia congelada dos 7 checks no momento em que a viagem foi confirmada (clarify + FR-013a).

| Coluna | Tipo | Nulo? | Default | Descrição |
|---|---|---|---|---|
| `id` | TEXT | PK | — | UUID. |
| `trip_id` | TEXT | NÃO | — | **FK** → `trips(id)`. |
| `dossier_id` | TEXT | NÃO | — | **FK** → `mobility_dossiers(id)` — de qual cidade era o snapshot. |
| `snapshot_at` | TIMESTAMPTZ | NÃO | `NOW()` | Quando a viagem entrou em `confirmada`. |
| `checks_payload` | JSONB | NÃO | — | Array dos 7 checks congelados: `[{check_key, verdict, source, evidence, checked_at}, ...]` (D9 do plan.md). |

**Gatilho**: a tool que muda `trips.status` para `confirmada` MUST inserir exatamente uma linha aqui
(lendo o estado corrente de `mobility_checks` do dossiê da cidade da viagem e serializando em
`checks_payload`) antes de commitar a mudança de status — mesma transação. Revalidações posteriores
do dossiê (US2 rodado de novo depois da viagem confirmada) não alteram este snapshot.

**Índices**: `idx_trip_mobility_snapshots_trip (trip_id)`.

---

## `mobility_apps`

Base de conhecimento regional — cobertura **declarada**, nunca veredito (FR-014, FR-015). Tabela-
semente populada por `scripts/seed_mobility_apps.py` a partir de `research.md`.

| Coluna | Tipo | Nulo? | Default | Descrição |
|---|---|---|---|---|
| `id` | TEXT | PK | — | UUID. |
| `name` | TEXT | NÃO | — | Nome do app (Garupa, Urbano Norte, Ubiz Car, BibiMob, Bora94, Chofer 46, Urban66, Rota Pop, V1, InDrive, Uber, 99, Cittamobi, Moovit). |
| `kind` | TEXT | NÃO | — | `app_corrida` \| `transporte_publico` \| `taxi`. |
| `coverage_scope` | TEXT | NÃO | — | `nacional` \| `regiao` \| `uf` \| `cidades`. |
| `coverage_values` | TEXT[] | SIM | — | Siglas de região/UF ou nomes de cidade, conforme `coverage_scope`. |
| `url` | TEXT | SIM | — | Link oficial. |
| `notes` | TEXT | SIM | — | Observações do research (ex.: "declara 3.600 cidades, fonte MUNIC diverge"). |
| `source_updated_at` | DATE | SIM | — | Quando a informação foi observada no research (base envelhece). |

**Consulta por UF/cidade** (FR-015): resultado sempre rotulado *"cobertura declarada — confirmar
in-app"* na camada de apresentação — a tabela nunca decide disponibilidade sozinha.

**Índices**: `idx_mobility_apps_kind (kind)`.

---

## `trip_checklist_items`

Checklist pré-embarque, semeado do dossiê ou manual (FR-016).

| Coluna | Tipo | Nulo? | Default | Descrição |
|---|---|---|---|---|
| `id` | TEXT | PK | — | UUID. |
| `trip_id` | TEXT | NÃO | — | **FK** → `trips(id)`. |
| `label` | TEXT | NÃO | — | Texto do item (ex.: "Combinar transfer com a pousada"). |
| `category` | TEXT | SIM | — | Agrupamento livre na UI (ex.: "app", "documento", "contato"). |
| `done` | BOOLEAN | NÃO | `FALSE` | Progresso — persiste entre sessões (US3 cenário 3). |
| `position` | INTEGER | NÃO | `0` | Ordem de exibição. |
| `origin` | TEXT | NÃO | `'manual'` | `dossie` \| `manual`. |
| `created_at` | TIMESTAMPTZ | NÃO | `NOW()` | — |

**Regra de geração** (FR-016, SC-008): a tool de regeneração a partir do dossiê **não duplica** item
já existente com o mesmo `label` na mesma viagem, e nunca inclui item contraditório com um veredito
(ex.: não gera "instalar Uber" se `mobility_checks` tem `uber.verdict = 'ausente'`).

**Índices**: `idx_trip_checklist_items_trip (trip_id)`.

---

## `trip_budget_items`

Estimado × realizado por categoria (FR-020 a FR-022).

| Coluna | Tipo | Nulo? | Default | Descrição |
|---|---|---|---|---|
| `id` | TEXT | PK | — | UUID. |
| `trip_id` | TEXT | NÃO | — | **FK** → `trips(id)`. |
| `category` | TEXT | NÃO | — | `transporte_ida` \| `transporte_volta` \| `hospedagem` \| `alimentacao` \| `mobilidade_local` \| `passeios` \| `outros`. |
| `estimated` | NUMERIC(10,2) | NÃO | `0` | Teto planejado da categoria. |
| `actual` | NUMERIC(10,2) | NÃO | `0` | Acumulado dos gastos realizados (soma de `log_trip_expense`). |
| `nami_transaction_ids` | TEXT[] | SIM | — | IDs das transações correspondentes na Nami — um por gasto lançado. |
| `updated_at` | TIMESTAMPTZ | NÃO | `NOW()` | — |

**Constraint**: `UNIQUE(trip_id, category)` — uma linha por categoria por viagem; criada sob demanda
(upsert) quando o usuário define uma estimativa ou registra o primeiro gasto daquela categoria.

**Lançamento atômico** (FR-021, SC-006): registrar um gasto **incrementa `actual`** desta linha e
**insere uma transação na Nami**, na mesma transação PostgreSQL — padrão `complete_payment_task`
(ver `plan.md` referências). Mapa de categoria Yato→Nami (D6 do `plan.md`):

| Categoria Yato | Categoria Nami |
|---|---|
| `alimentacao` | `Alimentacao` |
| `transporte_ida` | `Transporte` |
| `transporte_volta` | `Transporte` |
| `mobilidade_local` | `Transporte` |
| `hospedagem` | `Viagem` |
| `passeios` | `Viagem` |
| `outros` | `Viagem` |

Falha em qualquer lado (ex.: categoria Nami inválida, conta inexistente) ⇒ `conn.rollback()` ⇒
**nada** é gravado dos dois lados (FR-021, US5 cenário 3).

**Resumo** (FR-022): `saldo = estimated - actual`; categoria "estourada" quando `actual > estimated`.

**Índices**: `idx_trip_budget_items_trip (trip_id)`.

---

## Resumo de cobertura de Functional Requirements

| FR | Tabela(s) / mecanismo |
|---|---|
| FR-001, FR-002 | `trips` |
| FR-003 a FR-006 | `trip_items` |
| FR-007 a FR-013 | `mobility_dossiers`, `mobility_checks` |
| FR-013a | `trip_mobility_snapshots` |
| FR-014, FR-015 | `mobility_apps` |
| FR-016 | `trip_checklist_items` |
| FR-017 a FR-019 | motor puro `agents/yato/comfort_matrix.py` (sem tabela — ver `plan.md` D5) |
| FR-020 a FR-022 | `trip_budget_items` + `create_transaction_on_cursor` (Nami) |
| FR-023, FR-024, FR-028 | estrutura do pacote (`plan.md` Project Structure) — sem tabela própria |
| FR-025 | personalidade do agente — sem tabela |
| FR-026, FR-027 | `webapp/backend/routers/travel.py`, `webapp/frontend/src/pages/yato/` — ver `contracts/api-travel.md` |
| FR-029 | todas as colunas `TIMESTAMPTZ`/`DATE` acima — resolução de "hoje" em `America/Sao_Paulo` na camada de tools |
| FR-030 | ausência de qualquer coluna/tabela ligada a API paga (nenhuma chave, nenhum token) |
