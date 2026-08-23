# CLAUDE.md — agents/yato

## O que é este agente

**Yato** é o agente de viagens do sistema Makima. Inspirado em Yato de *Noragami* —
o deus errante sem templo que atende qualquer pedido por 5 ienes. Escandaloso,
orgulhoso, obcecado por economia, mas competente e genuinamente protetor quando o
assunto é a segurança do viajante — sobretudo mobilidade urbana em cidade pequena
sem carro, o medo central que motivou esta fatia (066).

Responsabilidades:
- Catálogo de viagens (uma cidade por viagem) e roteiro dia a dia por período
- **Dossiê de mobilidade urbana do destino** — o diferencial do agente: protocolo
  de 7 passos que verifica Uber/99/InDrive/transporte público ANTES de o usuário
  comprar a viagem, nunca de memória
- Base de conhecimento de apps regionais de mobilidade ("Uber do interior")
- Matriz economia × conforto (categorias ANTT rodoviárias) — motor puro
- Checklist pré-embarque gerado a partir do dossiê
- Orçamento estimado × realizado, com lançamento atômico de gastos na Nami

MVP **sem nenhuma API paga**: zero variável de ambiente nova (FR-030). Cobertura de
apps e transporte público são heurísticas **declaradas**, nunca veredito — quem
decide é o protocolo de verificação manual conduzido passo a passo pelo agente.

---

## Arquitetura

```
Telegram/Hermes (usuário)
    ↓
yato_agent (Agent ADK — singleton, sem MCP)
    ├── tools.py            → fachada: trips, roteiro, checklist, orçamento,
    │                          cross-agent Nami, re-exports de tools_mobility.py
    ├── tools_mobility.py   → dossiê + protocolo de 7 passos + estratégia + apps
    └── comfort_matrix.py   → motor PURO (sem banco): matriz ANTT + fila de ROI

Webapp (/travel/*)
    ↓
webapp/backend/routers/travel.py  (fachada fina)
    └── agents/yato/tools.py       (ÚNICA dona da lógica de negócio)
```

**Yato é singleton** — não usa `McpToolset`, então não precisa de factory function.
Instância global `yato_agent` em `agent.py`, registrada em `coordinator/agent.py` e
exposta via MCP em `/mcp/yato` (`mcp_servers/makima/registry.py`, `DOMAINS["yato"]`).

---

## Banco de dados PostgreSQL

Schema completo em `agents/yato/schema_pg.sql`. Aplicar via:
```bash
docker exec makima-web sh -c "cd /app && python -m scripts.setup_schemas"
docker exec makima-web sh -c "cd /app && python -m scripts.seed_mobility_apps"
```

### Tabela `trips`

A viagem — raiz de tudo o mais. **Uma cidade por viagem** (decisão do clarify);
roteiro itinerante (A → B → C) se modela como viagens encadeadas.

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | TEXT (UUID) | PK |
| `title` | TEXT | Título livre; vazio → UI monta "Cidade/UF" |
| `city` / `state_uf` | TEXT | Destino — `state_uf` sempre 2 letras |
| `start_date` / `end_date` | DATE | `end_date >= start_date`, intervalo ≤ 60 dias |
| `profile` | TEXT | `economia` \| `equilibrado` \| `conforto` |
| `status` | TEXT | `planejando` → `confirmada` → `em_curso` → `concluida`; `cancelada` de qualquer estado anterior |
| `deleted` | BOOLEAN | Soft delete |

Entrar em `confirmada` pela primeira vez congela o dossiê de mobilidade da cidade
em `trip_mobility_snapshots` (ver abaixo) — na mesma transação do UPDATE.

### Tabela `trip_items`

Roteiro dia a dia. `period` (manha/tarde/noite) é **obrigatório**; `start_time` é
opcional (Edge Cases: período basta). `position` ordena dentro do par
`(day_date, period)`. Recusa `day_date` fora de `[trips.start_date, end_date]`.

### Tabelas `mobility_dossiers` + `mobility_checks`

O coração do agente. `mobility_dossiers` é **global por cidade** (`UNIQUE(city,
state_uf)`), reaproveitado entre viagens. `mobility_checks` guarda os 7 passos do
protocolo, um por `check_key`: `porte_cidade`, `uber`, `99`, `indrive`,
`transporte_publico`, `hospedagem_transfer`, `deslocamentos` — cada um com
`verdict` (`confirmado` \| `ausente` \| `inconclusivo` \| `pendente`), `source` e
`evidence`.

**Regra dura**: ausência de dado é sempre `inconclusivo`, nunca `ausente`.
`last_checked_at` > 180 dias marca o dossiê como `stale` (calculado na leitura,
não é coluna própria).

### Tabela `trip_mobility_snapshots`

Cópia congelada (`checks_payload` JSONB) dos 7 checks no momento em que a viagem
entrou em `confirmada` — preserva o que se sabia *na época*, mesmo que o dossiê
seja revalidado depois.

### Tabela `mobility_apps`

Base-semente (`scripts/seed_mobility_apps.py`, 14 apps do `research.md`) com
cobertura **declarada** por `coverage_scope` (`nacional` \| `regiao` \| `uf` \|
`cidades`) + `coverage_values`. Nunca decide disponibilidade sozinha.

### Tabela `trip_checklist_items`

Checklist pré-embarque. `origin` = `dossie` (gerado automaticamente, sem duplicar
`label`) ou `manual`.

### Tabela `trip_budget_items`

Estimado × realizado por categoria (`transporte_ida`, `transporte_volta`,
`hospedagem`, `alimentacao`, `mobilidade_local`, `passeios`, `outros`), com
`nami_transaction_ids` (array) vinculando as despesas lançadas na Nami.

---

## Tools disponíveis

Implementadas em `agents/yato/tools.py` (+ `tools_mobility.py`). Todas retornam
`{"status": "ok"|"error", ...}`.

| Tool | Descrição |
|---|---|
| `create_trip` / `list_trips` / `get_trip` / `update_trip` | CRUD de viagens; `update_trip` pode devolver `orphans_pending` |
| `delete_trip` | Soft delete (`deleted=TRUE`) — roteiro/checklist/orçamento ficam preservados |
| `resolve_trip_orphans` | Aplica mover/remover sobre itens órfãos de uma mudança de datas |
| `add_itinerary_item` / `list_itinerary` / `update_itinerary_item` / `delete_itinerary_item` | Roteiro dia a dia |
| `get_or_create_mobility_dossier` | Abre/retoma o dossiê da cidade — nunca pula pro veredito |
| `record_mobility_check` | Grava UM passo do protocolo por vez |
| `get_mobility_strategy` | Estratégia consolidada + passos pendentes |
| `suggest_mobility_apps` | Apps regionais candidatos — sempre "cobertura declarada" |
| `list_checklist` / `add_checklist_item` / `set_checklist_item_done` / `update_checklist_item` | Checklist |
| `delete_checklist_item` | Remove um item do checklist (hard delete) |
| `regenerate_checklist_from_dossier` | Gera itens a partir dos vereditos (sem duplicar, sem contradizer) |
| `recommend_comfort_class` | Fachada sobre `comfort_matrix.recommend()` |
| `set_trip_budget` / `get_trip_budget` / `list_trip_expenses` | Orçamento e histórico de gastos |
| `log_trip_expense` | **Cross-agent** — lança na Nami atomicamente |
| `delete_trip_expense` | **Cross-agent** — reverte a transação na Nami e decrementa `actual`, atomicamente (simétrico ao `log_trip_expense`) |
| `get_trip_readiness` | Resumo para a tela Início |

---

## Cross-agent: `log_trip_expense` / `delete_trip_expense` (Yato → Nami)

Únicos pontos do domínio que escrevem fora de suas próprias tabelas — mesmo padrão
de `complete_payment_task` (Kaguya↔Nami). `delete_trip_expense` é simétrico ao
`log_trip_expense`: em vez de chamar `create_transaction_on_cursor` (não existe
`delete_transaction_on_cursor` na Nami), executa o mesmo `UPDATE ... SET deleted
= TRUE` que `agents/nami/tools.py::delete_transaction` faz, direto no cursor
compartilhado — decrementa `actual` e remove o id de `nami_transaction_ids` na
mesma transação.

```python
with get_conn() as conn:
    with conn.cursor() as cur:
        tx = create_transaction_on_cursor(cur, ..., conta=account, source="yato")  # import lazy
        if tx["status"] != "ok":
            conn.rollback(); return {"status": "error", ...}
        cur.execute("UPDATE trip_budget_items SET actual = actual + ... WHERE ...")
```

Mapa de categoria Yato → Nami (fixo):

| Categoria Yato | Categoria Nami |
|---|---|
| `alimentacao` | `Alimentacao` |
| `transporte_ida` / `transporte_volta` / `mobilidade_local` | `Transporte` |
| `hospedagem` / `passeios` / `outros` | `Viagem` |

`account` é parâmetro **obrigatório** de `log_trip_expense` — sem default financeiro, mesma
regra de `complete_payment_task` da Kaguya (agente confirma a conta com o usuário antes de
chamar; webapp usa um seletor no `LogExpenseModal`, populado via `namiApi.getAccounts()`).
Bug de produção corrigido: a versão original resolvia silenciosamente para uma conta fixa
`"Generico"` que nunca existiu nas contas reais (`Itaú`/`Nubank`) — todo lançamento de gasto
falhava. Achado ao validar `delete_trip_expense` ao vivo via MCP em produção.

Falha em qualquer lado (categoria Nami inválida, conta inexistente) ⇒
`conn.rollback()` ⇒ nada é gravado dos dois lados.

---

## Motor puro: `comfort_matrix.py`

Sem banco, sem rede — `recommend(hours, night, profile, has_ride_app)`. Categorias
ANTT (`convencional` → `executivo` → `semi_leito` → `leito` → `leito_cama`) com o
"custo de exaustão": acima de 8h noturno ⇒ no mínimo `semi_leito`; acima de 12h
noturno ⇒ `leito_cama` como possível substituto de uma diária de hotel. Fila de
ROI (`transfer_privativo > upgrade_hospedagem > passeio_privativo >
executiva_domestica`), com o transfer subindo quando `has_ride_app=False`.

Testado isoladamente em `tests/agents/test_yato_comfort.py` (um caso por cenário
de aceite da spec + linha da tabela ANTT do `research.md`).

---

## Variáveis de ambiente

Nenhuma nova (FR-030/SC-009) — usa o mesmo `DATABASE_URL` compartilhado por todos
os agentes.

---

## Webapp: /travel/*

Router em `webapp/backend/routers/travel.py`. Rotas fixas (`/apps`, `/comfort`,
`/dossiers/{uf}/{city}/...`) registradas antes de `/trips/{trip_id}` (padrão
`series.py`). Ver `webapp/docs/API.md` para o contrato completo.

## Frontend: /travel/*

Shell completo em `webapp/frontend/src/pages/yato/` (padrão dos demais shells —
ver `webapp/frontend/src/pages/CLAUDE.md`), estética "caderno de bordo /
dossiê" (kraft, mapa topográfico, carimbos de veredito), portada fielmente de
`specs/066-travel-agent/design_handoff_yato_viagens/`.

```
webapp/frontend/src/pages/yato/
├── YatoShell.tsx      # sidebar + topbar + footbar + roteamento interno + modais globais
├── yatoApi.ts          # client de /api/travel/* — desembrulha {status,trip|item:...} das tools
├── types.ts / dateUtils.ts / steps.ts / yato.css / TweaksPanel.tsx
├── screens/            # HomeScreen, TripsScreen, TripDetailScreen, MobilityScreen, BudgetScreen, ChecklistScreen
├── components/         # MobilityDossier ⭐, VerdictChip, ReadinessMeter/Line, TripCard, DayColumn,
│                        # ItineraryItem, AppSuggestionCard, ComfortMatrix, BudgetBar, ChecklistRow, Icon
├── modals/              # Modal, NewTripModal, NewItemModal, LogExpenseModal, ProtocolWizard
└── ui/Toast.tsx
```

**Gotcha ao consumir as tools pelo REST** — todas devolvem `{"status":"ok", "trip"|"item": {...}}`
(o router é fachada fina, não desembrulha). `yatoApi.ts` já normaliza isso: `createTrip`/`getTrip`
resolvem para o `Trip` direto, `updateTrip` resolve para `Trip | {status:"orphans_pending", ...}`,
`addItineraryItem`/`updateItineraryItem`/`addChecklistItem`/`updateChecklistItem` resolvem para o
item direto. Só `list_trips`, `get_trip_budget`, `get_mobility_strategy`,
`get_or_create_mobility_dossier`, `recommend_comfort_class` e `get_trip_readiness` já são planos
(sem chave de wrapper) — conferir sempre contra `agents/yato/tools.py` antes de assumir o shape.

**Datas exibidas a partir de timestamp** (`last_checked_at`, `checked_at`) — nunca `iso.slice(0,10)`
(erra o dia perto da meia-noite UTC); usar `isoDateOnly()` de `dateUtils.ts`, que lê o fuso LOCAL do
navegador (mesma regra de `todayLocalISO()`).

**Checklist — categoria é livre, não são 3 baldes temporais.** O design-guide fala em "antes de
comprar/embarcar/na chegada", mas `trip_checklist_items.category` é texto livre e
`regenerate_checklist_from_dossier` gera `app`/`contato`/`seguranca` — `ChecklistScreen.tsx` agrupa
dinamicamente pelas categorias que existem nos dados (mais um balde fixo "geral"), não pelos 3
grupos do mock.

**Sem "contatos locais"** — o mock do design tem um painel de contatos da cidade; não há tabela nem
tool para isso no schema real (066 não inclui essa entidade), então `MobilityScreen.tsx` não o
renderiza — nada de inventar dado que a tool não devolve.

Rota `<Route path="/travel/*" element={<YatoShell />} />` em `App.tsx`, antes do catch-all `/*`.
Entrada no roster da Makima em `pages/makima/data.ts` (`AGENTS`) e no menu do `Layout.tsx`
(`--c-yato` / `--c-yato-dim` em `index.css`).

---

## Personalidade e instruções de resposta

```
Você é Yato, de Noragami — escandaloso, orgulhoso, obcecado por economia
("5 ienes!"), mas competente e genuinamente protetor sobre segurança de viagem.

- Inicia TODA resposta com "Yato:"
- Usa HTML puro (nunca markdown)
- Chama a tool primeiro, sempre — nunca inventa cobertura, preço ou horário
- Conduz o protocolo de mobilidade UM PASSO por vez
- Vereditos sempre com símbolo + palavra: ✅ confirmado · ❌ ausente ·
  ❓ inconclusivo · ⏳ pendente
- Emojis com parcimônia: ⛩️ 💴 🚕 🎒 🗺️
```
