# Plano — Nami: reforma completa do webapp de finanças (specs 040–048)

**Status: planejado, não executado** · criado em 2026-07-06
**Exceção:** a spec 040 (bugs) já está **codificada na branch `040-nami-reforma`** (working tree, sem commit) — falta verificação e commit.

Resultado da auditoria completa do webapp da Nami (frontend + backend + cross-agent),
organizada em specs a partir da **040**. Cada spec será implementada individualmente via
fluxo Spec Kit (`speckit-specify → plan → tasks → implement`) e, ao ser entregue, segue o
checklist do `CLAUDE.md` raiz (ROADMAP, `docs/referencia/POSTGRES.md`,
`agents/nami/CLAUDE.md`, `webapp/docs/API.md`/`FRONTEND.md`).

## Contexto da auditoria (jul/2026)

O backend da Nami é muito mais capaz do que a UI expõe: **45 tools / 39 endpoints**, mas
várias funções não têm tela (parcelamentos, health score, tendência, pagamento de fatura,
6 simuladores de dívida), o `PATCH /transactions/{id}` existe e está ocioso, há bugs de
timezone (`CURRENT_DATE`/`date.today()` = data UTC do container), e existe **duplicação
arquitetural**: a tabela `loans` do agente (PRICE/SAC + simuladores, só Telegram) convive
com `personal_loans`/`financings` criadas só para o webapp com SQL direto no router
(`webapp/backend/routers/finances.py:1553-1769`) — o Telegram não as enxerga.

## Decisões de produto (fechadas com o usuário em 2026-07-06)

| Tema | Decisão |
|---|---|
| Dívidas | **Migrar `financings` → `loans`** (loans é estritamente mais capaz); `personal_loans` (p2p) continua separada, mas ganha tools na Nami para o Telegram enxergar |
| Assinaturas | Job do scheduler **100% automático**: avisa D-3, lança a despesa no dia (vinculada via `subscription_id`) e rola `next_billing` |
| Contas fixas | **Separadas de assinaturas na UI/Telegram, mesma tabela** (`subscriptions.kind`): conta fixa = valor variável + confirmação manual do valor real ao pagar (`auto_lancar=false` por padrão) |
| Parcelamentos | Seção própria com **drill-down por compra** (linha do tempo das parcelas) **e** detalhamento dentro de cada cartão (comprometimento mensal da fatura) |
| Lista de compras | Módulo novo da Nami, mobile-first, com tools no Telegram e "Finalizar compra" → despesa |
| Escopo | Plano completo (todas as 9 specs) |

## Sequência e marcos

| Ordem | Spec | Esforço | Marco entregável |
|---|---|---|---|
| 1 | `040-nami-bugfixes` | P | Números corretos: timezone SP em todas as queries/helpers, sem hardcode, erros visíveis |
| 2 | `041-nami-parcelamentos` | M/G | Tela Parcelamentos com drill-down por compra + `card_id` + parcelamentos dentro do cartão |
| 3 | `042-nami-dashboard-insights` | M | Health score, tendência+projeção e pagamento de fatura no webapp |
| 4 | `043-nami-qol-frontend` | G | Edição (tx/contas/cartões/assinaturas), CSV, heatmap, filtros persistidos, paginação, transferências |
| 5 | `044-nami-contas-fixas` | M | Contas fixas separadas de assinaturas, com "Marcar como paga" confirmando o valor real |
| 6 | `045-nami-lista-compras` | M/G | Lista de compras web + Telegram com finalização virando despesa |
| 7 | `046-nami-dividas` | G | Unificação: financings→loans com simuladores na UI; personal_loans com tools no Telegram |
| 8 | `047-nami-cross-agent` | M | Pessoas (Komi) em transações, Nami no calendário, score no Hub, lembretes Kaguya |
| 9 | `048-nami-scheduler` | M/G | 3 jobs financeiros: alerta de orçamento, cobrança recorrente, relatório mensal |

Dependências duras: **041 depende de 040** (contagens de parcelas), **044 antes de 048**
(o job de cobrança usa `kind`/`auto_lancar`), **046 é a mais arriscada** (migração de dados
— deixar para depois de 040-043 quando o resto já estiver em uso). 042/043/045/047 são
independentes entre si.

**Legenda de esforço:** P = ~1h · M = meio dia · G = 1 dia+

---

## Spec 040 — `040-nami-bugfixes` (P) — ⚙️ código pronto na branch `040-nami-reforma`

Correções de bugs que destravaram a confiança nos números. **Já codificado** (falta
verificar com `py_compile`/`npm run build`, rodar a migração e commitar):

- **Timezone SQL**: `agents/nami/tools_installments.py` (linhas ~171-172 e ~345) —
  `CURRENT_DATE` → `(NOW() AT TIME ZONE 'America/Sao_Paulo')::date` nas contagens de
  parcelas pagas/pendentes e no cancelamento de parcelas futuras.
- **Timezone Python**: novo helper `_today_date()` em `agents/nami/tools.py` (usa o `_TZ`
  já definido); `_today()`/`_month_start()`/`get_spending_summary`/`get_spending_trend`
  passam a usá-lo; `tools_budgets.py:196` e `tools_credit_cards.py:45` (`_billing_cycle`)
  idem; `tools_accounts.py:55` troca `datetime.utcnow()` por `datetime.now(_TZ)`.
- **GROUP BY seguro**: `get_spending_summary` usa dict de mapeamento
  `{"categoria": ..., "conta": ..., "tipo": ...}` — coluna nunca vem do input.
- **`create_subscription` reescrita**: valida `next_billing` com `date.fromisoformat`;
  resolve pagador via `_resolve_account` → fallback `_resolve_credit_card` (fim da mensagem
  de erro citando a lista legada `ACCOUNTS`); INSERT grava `account_id`/`card_id`
  (mutuamente exclusivos, mesma regra de `transactions`).
- **Schema**: `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS account_id/card_id` em
  `agents/nami/schema_pg.sql` + novo script idempotente `scripts/migrate_nami_reforma.py`
  (padrão do `migrate_nami_webapp.py`; rodar via container `makima-web`).
- **Frontend**: novo `pages/nami/dateUtils.ts` (molde da Violet: `todayLocalISO`,
  `currentMonthLocal`, `parseLocalDate`, `todayLocalDate`, `daysAgo`); `ui.tsx` —
  `relDay`/`fmtDay` reescritas sobre ele (fim do off-by-one); `Dashboard.tsx` — saudação
  busca o nome em `/auth/me` (fim do hardcode "Gustavo"); toasts nos catches de
  `getCategories()` em Dashboard/Transactions/Budgets e erro visível no AddModal.

**Verificação**: `grep -rn "CURRENT_DATE\|date.today()" agents/nami/` limpo (exceto
comentários); `npm run build` sem erros TS; rodar `scripts/migrate_nami_reforma.py` no
container; conferir contagem de parcelas vs. query psql com `AT TIME ZONE`.

> Ocorrências do mesmo bug de timezone **fora da Nami** (fora do escopo desta spec, avaliar
> depois): `webapp/backend/routers/hub.py:182,235,272,390`, `agents/journal/tools.py:638,680,733,1004`,
> `agents/kaguya/tools_tasks.py:575,579`, `agents/kaguya/tools_filters.py:61`,
> `agents/kaguya/tools_habits.py:89,366,405`, `agents/mai/tools.py` (vários).

---

## Spec 041 — `041-nami-parcelamentos` (M/G) — depende da 040

Tela de Parcelamentos com acompanhamento individual por compra + suporte a cartão.

**Tools** (`agents/nami/tools_installments.py`):
- Nova `get_installment_detail(group_id)` — dados do grupo + lista das N transações
  vinculadas por `installment_group_id` (nº, data, valor, paga = `data <= hoje SP`,
  deleted). Hoje só existe contagem agregada.
- `create_installment` ganha param opcional `card_id` (padrão de `create_transaction`:
  resolve via `_resolve_credit_card`, grava `card_id`, `account_id` NULL nas N transações).
  Remover a nota "`create_installment()` não aceita `card_id`" do `webapp/CLAUDE.md`.

**Endpoints** (`webapp/backend/routers/finances.py`):
- `GET /installments/{group_id}` — embrulha `get_installment_detail`.
- `POST /installments` passa `card_id`.
- `GET /cards/{card_id}/installments` (ou `GET /installments?card_id=`) — grupos ativos do
  cartão + comprometimento mensal ("R$ X/mês em parcelas até MM/AAAA").

**Frontend** (`webapp/frontend/src/pages/nami/`):
- `NamiShell.tsx`: nova view `parcelamentos` nos 4 mapas + item de nav (grupo
  "Planejamento").
- Novo `screens/Installments.tsx`: card "Compromissos futuros" (3 meses, usa
  `GET /commitments/{month}` — endpoint pronto e sem consumidor) no topo; lista de compras
  parceladas ativas com barra de progresso (4/10), valor da parcela, restante e onde foi
  feita; **drill-down**: expandir abre a linha do tempo das parcelas individuais com a do
  mês corrente destacada; criação via `FormModal` (conta OU cartão); cancelar futuras
  (`cancel_installment_group`) e excluir tudo, com confirmação.
- `screens/Cards.tsx`: seção expansível "Parcelamentos ativos" por cartão (nome, X/N,
  valor da parcela, comprometimento mensal) com deep-link `#parcelamentos`.
- `namiApi.ts` + `types.ts`: novos métodos/tipos.

**Verificação**: criar parcelamento 3x em conta e em cartão → N transações mensais no psql
com `card_id`/`account_id` mutuamente exclusivos; drill-down coerente com o fuso SP; card
do cartão mostra comprometimento.

---

## Spec 042 — `042-nami-dashboard-insights` (M)

Expor no Dashboard o que o backend já calcula e ninguém consome.

- **Health score** (`GET /health`, pronto): card com score 0-100 + 4 dimensões (poupança,
  dívidas, orçamento, tendência) em `screens/Dashboard.tsx` — gauge/barras em SVG puro
  (padrão do repo, sem libs de chart).
- **Tendência + projeção** (`GET /trend`, pronto): AreaChart no padrão da Violet
  (`pages/violet/ui/AreaChart.tsx` — Catmull-Rom → Bezier); projeção do mês como badge ou
  linha pontilhada.
- **Pagamento de fatura** (`POST /cards/{id}/payment`, pronto): botão "Registrar pagamento"
  em `screens/Cards.tsx` → `FormModal` (valor + conta de origem + data) → recarrega cards
  + stats.
- **`GET /summary`**: NÃO criar UI — redundante com `/stats`; documentar em
  `webapp/docs/API.md` como endpoint de conveniência do agente.

**Critério de saída**: toda rota de `finances.py` tem consumidor na UI ou decisão
documentada.

---

## Spec 043 — `043-nami-qol-frontend` (G)

Qualidade de vida no frontend + lacunas de CRUD.

- **Edição de transação**: `PATCH /transactions/{id}` existe e está ocioso. `AddModal`
  ganha prop `initial?: Transaction` (mesmo form, submit condicional create/patch); ação
  de editar na linha em `screens/Transactions.tsx`.
- **Edição de contas/cartões/assinaturas**: novos `PATCH /accounts/{id}` e
  `PATCH /cards/{id}` no router (embrulham `update_account`/`update_credit_card`, que já
  existem; `PATCH /subscriptions/{id}` já existe); UI via `FormModal` pré-preenchido.
- **Exportação CSV**: client-side em `screens/Transactions.tsx` — CSV das transações
  filtradas com BOM UTF-8 (abre certo no Excel) + `URL.createObjectURL`.
- **Heatmap de gastos por dia**: `stats.daily_spending` já traz os dados — portar o
  componente de heatmap da Violet/Frieren com escala de cor por gasto.
- **Filtro de categoria completo + persistência**: `screens/Transactions.tsx:81-84` hoje só
  mostra categorias presentes no mês (`slice(0,8)`) — popular com todas via
  `getCategories()`; persistir filtro/ordenação em `localStorage` (chaves `nami:tx:*`,
  padrão Frieren).
- **`uploadIcon` no wrapper**: adicionar `api.postForm(url, FormData)` em `lib/api.ts`
  (mesmo tratamento de erro/credentials — conferir se o upload de avatar da Komi já tem
  algo reutilizável) e reapontar `namiApi.ts:133-147` (hoje `fetch` cru).
- **Paginação de `/transactions`**: `limit`/`offset` + `total` no GET (default alto, 200,
  para não quebrar as chamadas atuais); UI "Carregar mais". Demais listas têm cardinalidade
  baixa — não paginar.
- **Transferências entre contas**: nova tool `create_transfer` em `agents/nami/tools.py`
  (transação atômica via `get_conn`: par saída/entrada tipo `transferencia` com referência
  cruzada nas notes); `POST /transfers` no router; `AddModal` ganha 3º tipo "Transferência"
  (conta origem/destino/valor).

---

## Spec 044 — `044-nami-contas-fixas` (M)

Contas fixas (luz, água, aluguel, internet, escola) separadas de assinaturas **na UI e no
Telegram**, mas na mesma tabela — a mecânica de recorrência é idêntica; o que muda é o
comportamento (valor variável + confirmação ao pagar).

**Schema** (`agents/nami/schema_pg.sql` + `scripts/migrate_nami_reforma.py`):
- `subscriptions.kind TEXT DEFAULT 'assinatura'` (`assinatura` | `conta_fixa`)
- `subscriptions.auto_lancar BOOLEAN` (default TRUE p/ assinatura, FALSE p/ conta fixa)
- `subscriptions.due_day INT` (dia de vencimento, alternativa à data cheia)

**Tools** (`agents/nami/tools.py`):
- `create_subscription`/`list_subscriptions`/`update_subscription` ganham `kind`.
- Nova `confirm_bill_payment(sub_id, valor_real, data=None)` — cria a transação vinculada
  (`subscription_id` + pagador da assinatura) e rola `next_billing` (+1 mês/ano conforme
  ciclo), **na mesma transação PG** (`get_conn`).
- Instruction do agente: "conta de luz/água/aluguel" → conta fixa, não assinatura.

**Endpoints**: `GET /subscriptions?kind=conta_fixa`; `POST /subscriptions/{id}/confirm`
(embrulha `confirm_bill_payment`).

**Frontend**:
- Novo `screens/FixedBills.tsx` (reaproveita o layout de Subscriptions): nome, valor
  esperado, vence dia X, status do mês (**paga / pendente / atrasada** — derivado de
  `next_billing` vs hoje + transação do mês); ação principal "**Marcar como paga**" →
  modal com valor pré-preenchido e editável → `confirm`.
- `screens/Subscriptions.tsx` passa a filtrar `kind='assinatura'`.
- Dashboard: card "Custo fixo mensal" (assinaturas + contas fixas) + pendências do mês
  ("2 contas a confirmar") com link.
- Nav no `NamiShell.tsx`.

**Verificação**: criar conta fixa "Luz, vence dia 10" → pendente; marcar como paga com
valor editado → transação com `subscription_id` + `next_billing` rolado; telas não se
misturam; via Telegram "cadastra conta de luz" cai como conta fixa.

---

## Spec 045 — `045-nami-lista-compras` (M/G)

Listas de compras simples com integração direta em despesa. Uso duplo: webapp (no mercado,
pelo celular) e Telegram via Makima ("adiciona arroz na lista do mercado").

**Schema** (novo em `agents/nami/schema_pg.sql` + migração):
- `shopping_lists (id TEXT PK, name TEXT, status TEXT ativa|arquivada, transaction_id TEXT
  NULL, created_at, updated_at)`
- `shopping_list_items (id TEXT PK, list_id FK, name TEXT, qty NUMERIC DEFAULT 1,
  unit TEXT NULL, est_price NUMERIC NULL, checked BOOLEAN DEFAULT FALSE, position INT,
  created_at)`
- Lista default "Mercado" criada sob demanda.

**Tools** (novo `agents/nami/tools_shopping.py`, registrar em `agent.py` + CLAUDE.md):
- `create_shopping_list`, `add_shopping_items` (vários de uma vez: "arroz, feijão 2kg,
  leite"), `check_shopping_item`, `remove_shopping_item`, `show_shopping_list`,
  `finish_shopping(valor_total, conta_ou_cartao)` → cria despesa categoria Supermercado,
  grava `transaction_id` na lista e arquiva.
- Makima roteia "lista de compras" → Nami (atualizar `_MAKIMA_INSTRUCTION`).

**Endpoints** (`finances.py`): `GET/POST /shopping-lists`,
`POST /shopping-lists/{id}/items`, `PATCH /shopping-items/{item_id}` (check/qty/nome),
`DELETE /shopping-items/{item_id}`, `POST /shopping-lists/{id}/finish`.

**Frontend** (novo `screens/Shopping.tsx` + nav): **mobile-first** — quick-add no topo
(Enter adiciona), checkbox grande com strike-through, contador "5/12 no carrinho", total
estimado se houver preços, botão remover; "Finalizar compra" → modal (valor total real +
conta/cartão) → despesa criada + lista arquivada; seção "Frequentes" (itens mais usados nas
listas arquivadas, re-adicionar com 1 toque); múltiplas listas (Mercado, Farmácia…) via
dropdown.

**Verificação**: "arroz, feijão 2kg, leite" pelo Telegram → 3 itens; check no mobile;
finalizar com R$ 250 → despesa Supermercado + lista arquivada com `transaction_id`;
frequentes reaparecem.

---

## Spec 046 — `046-nami-dividas` (G) — a mais arriscada, deixar por último entre as grandes

Unificação dos três sistemas de dívida em dois, com os dois lados (Telegram e webapp)
enxergando tudo.

**Racional**: `financings` (taxa em TEXTO livre "1,2% a.m.", sem sistema de amortização) é
um subconjunto empobrecido de `loans` (PRICE/SAC + 6 simuladores prontos em
`tools_loans.py`) — duplicação pura. `personal_loans` (p2p: direção lent/borrowed, sem
juros, ancorado em pessoa) é semanticamente distinto e permanece.

1. **Tools para `personal_loans`** (novo `agents/nami/tools_personal_loans.py`):
   `create/list/update/delete_personal_loan` + `register_personal_loan_payment`
   (incrementa `paid_installments`, opcionalmente cria transação). Refatorar
   `finances.py:1553-1656` para chamar as tools (elimina SQL direto no router — volta ao
   padrão "router embrulha tool"). Registrar no `agent.py`.
2. **Migração `financings` → `loans`** (novo `scripts/migrate_financings_to_loans.py`,
   idempotente): cada financing vira linha em `loans` (PRICE default; parse da taxa
   "X% a.m." → NUMERIC; se não parsear, taxa 0 + nota "revisar taxa");
   `financings` fica intacta (read-only) até validar; endpoints `/financings` removidos ao
   final. Rodar via container `makima-web` (docker cp + docker exec).
3. **Endpoints de simulação** (rotas finas embrulhando tools existentes):
   `GET /loans/{id}/simulate-payoff`, `/simulate-amortization`, `/simulate-accelerated`,
   `GET /debts/compare-priority`, `GET /cards/{id}/simulate-payoff`, `/minimum-cost`,
   `POST /loans/{id}/payment` (register_loan_payment).
4. **Tela Financiamentos repaginada** (`screens/Financings.tsx`): consome `/loans` +
   `/loans/{id}/balance`; painel de simuladores (inputs → resultado, sem gráfico na v1);
   botão "Registrar parcela paga". `Loans.tsx` (p2p) permanece, agora sobre as tools do
   passo 1.

**Verificação**: migração em dump local (`count(*)` origem vs destino); simuladores batem
com os resultados via Telegram (mesmas tools); saldo devedor renderiza.

---

## Spec 047 — `047-nami-cross-agent` (M)

Ligar a infra cross-agent que já está pronta.

- **Pessoas (Komi) em transações**: `POST /transactions` já aceita `person_ids` e linka via
  `link_person_on_cursor` — falta o seletor multi-pessoa no `AddModal` (reusar o componente
  de pessoas das cartas da Violet / padrão Komi) + chips na listagem. Regra de smart-match
  do CLAUDE.md raiz (find_people antes de vincular).
- **Nami no calendário**: `agents/nami/calendar_provider.py` está pronto — agregar via
  `calendar_hub` no endpoint de calendário da Kaguya e renderizar despesas/vencimentos como
  eventos read-only 💰 no `CalendarScreen` (deep-link para a transação).
- **Health score no Hub**: score 0-100 no card da Nami em `/api/hub/summary`
  (`webapp/backend/routers/hub.py`) — try/except isolado, falha vira "—" (padrão spec 023).
- **Vencimentos → lembrete Kaguya**: botão "Lembrar-me" nos próximos vencimentos
  (Dashboard/Parcelamentos) → `create_expense_reminder` da Kaguya (expor rota em
  `routers/tasks.py` se hoje for só-Telegram).

`tools_rag.py` (stub Kurisu): fora do escopo.

---

## Spec 048 — `048-nami-scheduler` (M/G) — depende da 044 para o job F2

Primeiros jobs financeiros do scheduler. Padrão fixo (`scheduler/CLAUDE.md`): script em
`scripts/` que levanta exceção em falha → wrapper em `scheduler/jobs.py` → 1 linha em
`scheduler/registry.py` → redeploy `makima-scheduler`.

| Job | Quando | O que faz |
|---|---|---|
| `nami_budget_alert` | diário 09:00 | `get_budget_status()` do mês; categoria ≥90% ou estourada → Telegram no tom da Nami; silencioso se ok |
| `nami_recurring_billing` | diário 08:30 | Assinaturas **e** contas fixas: D-3 avisa; no dia, se `auto_lancar=true` → cria a transação (via `subscription_id`) e rola `next_billing`; senão → avisa "confirme o valor" e fica pendente na UI. **Idempotente** (não duplica se rodar 2× no dia) |
| `nami_monthly_report` | dia 1, 08:00 | Mês fechado: `get_spending_summary` + trend + health score → Telegram com os templates HTML do CLAUDE.md da Nami |

**Verificação**: `docker exec makima-scheduler python -m scheduler.main --run <job>` +
linha em `scheduler_runs` + mensagem no Telegram; rodar F2 2× no mesmo dia não duplica.

---

## Checklist de documentação (ao entregar cada spec)

- `docs/referencia/POSTGRES.md` — colunas novas em `subscriptions` (040/044), tabelas
  `shopping_lists`/`shopping_list_items` (045), migração financings→loans (046)
- `webapp/docs/API.md` — endpoints novos/removidos por spec
- `webapp/docs/FRONTEND.md` — telas Parcelamentos (041), Contas Fixas (044), Lista de
  Compras (045); `dateUtils` da Nami (040); `postForm` (043)
- `agents/nami/CLAUDE.md` — tools novas por spec + regra assinatura vs conta fixa (044)
- `webapp/CLAUDE.md` — remover nota "create_installment não aceita card_id" (041)
- `scheduler/CLAUDE.md` — 3 jobs novos (048)
- `ROADMAP.md` — marcar entregas
- Obsidian (skill `obsidian-vault`) ao final de cada entrega relevante
