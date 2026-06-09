# Tasks: Nami · Finanças

**Input**: `specs/002-nami-financas/` — plan.md, spec.md, data-model.md, contracts/api.md, research.md, quickstart.md

**Branch**: `002-nami-financas`

**Testes**: não incluídos (sem framework formal nesta feature — validação via `quickstart.md`)

---

## Formato: `[ID] [P?] [Story] Descrição com caminho`

- **[P]**: paralelo (arquivos diferentes, sem dependência incompleta)
- **[Story]**: US1–US10, mapeia para `spec.md`
- Caminhos são relativos à raiz do repo

---

## Phase 1: Setup (Infraestrutura compartilhada)

**Objetivo**: script de migração, pasta de uploads, dependência python-multipart, estrutura de pastas frontend.

- [ ] T001 Criar `scripts/migrate_nami_webapp.py` — ALTERs IF NOT EXISTS em `accounts`/`credit_cards`/`subscriptions` + CREATE TABLE IF NOT EXISTS `personal_loans` e `financings` conforme `specs/002-nami-financas/data-model.md` §3.1/§3.2
- [ ] T002 [P] Montar `StaticFiles` em `webapp/backend/main.py`: importar `StaticFiles`, criar `webapp/uploads/icons/.gitkeep`, adicionar `app.mount("/uploads", StaticFiles(directory="webapp/uploads"), name="uploads")` após mount do frontend dist
- [ ] T003 [P] Adicionar `python-multipart` ao `requirements.txt` (necessário para `UploadFile` do FastAPI)
- [ ] T004 [P] Criar estrutura de diretórios: `webapp/frontend/src/pages/nami/modals/`, `webapp/frontend/src/pages/nami/components/`, `webapp/frontend/src/pages/nami/screens/` (criar arquivos `index.ts` vazios ou `.gitkeep` para confirmar a estrutura)

**Checkpoint**: estrutura de pastas e script de migração presentes — pronto para fase fundacional.

---

## Phase 2: Foundational (Pré-requisitos bloqueantes)

**Objetivo**: migração rodada, tipos TS, CSS tokens, namiApi, Toast, NamiShell esqueleto, rota em App.tsx — tudo isso bloqueia TODAS as user stories.

**⚠️ CRÍTICO**: Nenhuma user story pode começar antes desta fase estar completa.

- [ ] T005 Executar `scripts/migrate_nami_webapp.py` no PostgreSQL (local ou `docker exec makima-web`) — verificar via `\d personal_loans`, `\d financings` e `SELECT column_name FROM information_schema.columns WHERE table_name='accounts' AND column_name IN ('color','short','icon_url')` conforme `quickstart.md §regressão`
- [ ] T006 [P] Criar `webapp/frontend/src/pages/nami/types.ts` — interfaces TypeScript: `Transaction`, `Account` (com `color?`, `short?`, `icon_url?`), `Card` (com `brand?`, `last4?`, `grad?`), `Category`, `Budget`, `Subscription` (com `color?`, `icon_url?`, `next_billing_day?`), `PersonalLoan`, `Financing`, `StatsResponse` (shape completo de `contracts/api.md §GET /stats`), `MonthlyEntry`, `DailyEntry`
- [ ] T007 [P] Criar `webapp/frontend/src/pages/nami/nami.css` — CSS custom properties do handoff §2: paleta OKLch clara completa (`--paper` … `--out-tint`), `[data-theme='dark']` sobrescrita completa, tipografia (`--display: 'Bricolage Grotesque'`, `--sans: 'DM Sans'`, `--mono: 'DM Mono'`), radius (`--r-sm: 8px`, `--r-md: 12px`, `--r-lg: 18px`), sombras (`--shadow-sm/md/lg`), utilitários `.amount`/`.priv` com `[data-privacy='on']` que aplica `filter: blur(7px)` + `hover { filter: none }`
- [ ] T008 Criar `webapp/frontend/src/pages/nami/namiApi.ts` — wrapper tipado sobre `webapp/frontend/src/lib/api.ts`: `getStats(month)`, `getCategories()`, `getAccounts()`, `createAccount(body)`, `deleteAccount(id)`, `getCards()`, `createCard(body)`, `deleteCard(id)`, `getSubscriptions()`, `createSubscription(body)`, `deleteSubscription(id)`, `getBudgets(month)`, `createBudget(body)`, `deleteBudget(month, cat)`, `getTransactions(month, filters)`, `createTransaction(body)`, `deleteTransaction(id)`, `getPersonalLoans()`, `createPersonalLoan(body)`, `deletePersonalLoan(id)`, `getFinancings()`, `createFinancing(body)`, `deleteFinancing(id)`, `uploadIcon(file)` (depende de T006/types.ts)
- [ ] T009 [P] Criar `webapp/frontend/src/pages/nami/Toast.tsx` — pill `fixed bottom: 88px center`, fundo `var(--ink)`, texto `var(--paper)`, ícone check tangerina, `border-radius: 999px`, desaparece em 2600 ms com animação subida 14px + fade-in (referência: `webapp/frontend/src/pages/frieren/Toast.tsx` se existir)
- [ ] T010 Criar `webapp/frontend/src/pages/nami/NamiShell.tsx` — shell completo: sidebar `250px` com brand mark circular 42px (`nami.jpg`) + nome "Nami" Bricolage 19px + role "Finanças" DM Mono tangerina, botão "Nova transação" full-width, grupos de navegação (Visão geral: Dashboard; Dia a dia: Transações/Contas/Cartões; Planejamento: Orçamentos/Assinaturas/Empréstimos/Financiamentos) com badges de valor, link "Voltar à Makima"; topbar `56px` com título da tela ativa + seletor de mês (só em dashboard/transações/contas/cartões/orçamentos) + busca pill; SummBar `64px` fixo na base (Entrou verde, Saiu coral, Saldo, barra de fluxo, "+ Nova transação"); estado `{ view, currentMonth, searchQuery }`; deep-link hash: ler `window.location.hash` ao montar, escrever `history.replaceState` ao navegar (FR-006)
- [ ] T011 Adicionar rota `<Route path="/nami/*" element={<NamiShell />} />` em `webapp/frontend/src/App.tsx` + link "Nami" → `/nami` na sidebar principal do Layout (componente que contém os outros links de navegação do webapp)

**Checkpoint**: Abrir `http://localhost:5173/nami` → NamiShell renderiza com sidebar + topbar + SummBar; `/nami#cartoes` abre na view de Cartões (ainda vazia).

---

## Phase 3: User Story 1 — Lançamento rápido (Priority: P1) 🎯 MVP

**Objetivo**: lançar transação em ≤ 3 interações a partir de qualquer tela da seção Nami.

**Teste independente**: lançar despesa R$ 50 "Restaurante" via Quick-Add (Enter) → toast + saldo atualiza sem reload; pressionar `A` → AddModal abre com foco no valor; Esc fecha sem salvar.

- [ ] T012 [US1] Criar endpoint `GET /api/finances/categories` em `webapp/backend/routers/finances.py` — lista hardcoded de 15 categorias (id, name, icon, color, kind) conforme seed de `specs/002-nami-financas/data-model.md §categorias`; adicionar modelo Pydantic `CategoryOut` e `Depends(require_user)`
- [ ] T013 [P] [US1] Criar `webapp/frontend/src/pages/nami/components/QuickAdd.tsx` — barra inline: botão toggle tipo (despesa coral ↔ receita verde), campo valor prefixo "R$", campo descrição, chips de categoria rápida (5 despesa / 4 receita, cor da categoria, clicáveis), botão "Lançar" (habilitado só com valor > 0), `Enter` em qualquer campo salva, reset + foco retorna ao valor após salvar; recebe `onSaved` callback; usa `namiApi.createTransaction`
- [ ] T014 [P] [US1] Criar `webapp/frontend/src/pages/nami/modals/AddModal.tsx` — toggle despesa/receita (2 abas no topo), valor central 56px Bricolage cor por tipo, grid categorias 4×N (ícone + nome, seleção visual), descrição (opcional), conta/cartão (select), data, botões "Cancelar" ghost e "Adicionar" tangerina (desabilitados se inválido), `Enter` salva, `Esc` fecha, clique no scrim fecha, foco automático no valor ao abrir; usa `namiApi.createTransaction` e `namiApi.getAccounts`/`getCards`
- [ ] T015 [US1] Integrar QuickAdd + AddModal no `webapp/frontend/src/pages/nami/NamiShell.tsx` — atalho global `A`/`+` abre AddModal (keydown listener no window, ignorado se `event.target` é input/textarea/select); `onSaved` de ambos chama `handleTransactionSaved()` que atualiza o estado de stats/contas/transações recentes + exibe Toast; QuickAdd aparece no topo do Dashboard e de Transactions

**Checkpoint**: US1 funcional e testável independentemente.

---

## Phase 4: User Story 2 — Dashboard do mês (Priority: P1) 🎯 MVP

**Objetivo**: visão consolidada do mês — hero, 4 stat cards, fluxo de caixa, donut, previews, seletor de mês.

**Teste independente**: abrir `/nami` → dashboard carrega com todos os painéis; clicar na seta de mês anterior → todos os valores atualizam.

- [ ] T016 [US2] Criar endpoint `GET /api/finances/stats?month=YYYY-MM` em `webapp/backend/routers/finances.py` — queries SQL diretas com `psycopg2`: `income`/`expense`/`net` (soma por tipo no mês), `income_count`/`expense_count`, `prev_month_expense`, `savings_rate`, `by_category[]` (despesas agrupadas + pct), `daily_spending[]` (sparse por dia do mês), `cashflow[]` (últimos 12 meses), `patrimônio` (soma `balance_inicial` + transações em conta), `patrimônio_liquido`; shape exato em `specs/002-nami-financas/contracts/api.md §GET /stats`
- [ ] T017 [P] [US2] Criar `webapp/frontend/src/pages/nami/components/DonutChart.tsx` — SVG puro (sem lib externa): fatias via `stroke-dasharray`/`stroke-dashoffset` em `<circle>`, `cx`/`cy` = centro, anel com gap; legenda ao lado com cor, nome da categoria, % e valor absoluto; props: `data: { categoria, total, pct }[]`
- [ ] T018 [P] [US2] Criar `webapp/frontend/src/pages/nami/components/CashflowChart.tsx` — barras duplas verticais por mês (verde entradas, coral saídas) via SVG ou CSS grid, escala relativa ao maior valor, mês atual visualmente destacado (`font-weight: 700`, fundo pill); props: `data: { month, income, expense }[]`, `currentMonth: string`
- [ ] T019 [US2] Criar `webapp/frontend/src/pages/nami/screens/Dashboard.tsx` — hero card (FR-012: layout 2 colunas, `nami-hero.png` `align-self: flex-end`, saudação contextual Bom dia/Boa tarde/Boa noite, saldo `clamp(42px,5.5vw,62px)` Bricolage verde/coral, 2 CTAs); 4 stat cards (Receitas c/ contagem, Despesas c/ sparkline mini de barras + variação vs. mês anterior verde/coral, Saldo do mês c/ barra de taxa de economia, Patrimônio c/ disponível líquido); QuickAdd inline; gráficos DonutChart + CashflowChart; painel "Próximos vencimentos" (FR-016: merge de subscriptions/personal_loans/financings por dias restantes, até 4 itens); top-3 orçamentos (barra de progresso + link "Gerenciar →"); 6 últimas transações TxRow + link "Ver extrato →"; preview de contas (logo/sigla, nome, saldo)
- [ ] T020 [US2] Integrar `Dashboard.tsx` no `NamiShell.tsx` como view padrão (`view === 'dashboard'`); propagar `currentMonth` do shell para Dashboard via props; seletor de mês na topbar ativo nesta view; `onTransactionSaved` do Dashboard chama `handleTransactionSaved()` no shell

**Checkpoint**: US1 + US2 completos — MVP entregável.

---

## Phase 5: User Story 3 — Transações / Extrato (Priority: P2)

**Objetivo**: extrato completo agrupado por dia, com filtros, busca e exclusão.

**Teste independente**: abrir Transações → lista agrupada por data; filtrar por "Despesas"; buscar 2+ chars → filtra em tempo real; excluir transação no hover → remove com toast.

- [ ] T021 [P] [US3] Criar `webapp/frontend/src/pages/nami/components/TxRow.tsx` — layout (FR-017): CatBadge 38×38 (ícone Lucide sobre fundo `color opacity 14%`), nome 13.5px bold, categoria·fonte pill 11.5px, valor `±` 14.5px bold `font-variant-numeric: tabular-nums`, botão lixeira `opacity-0 group-hover:opacity-100`; hover na linha: `background: var(--card-2)`; `onDelete` callback chama `namiApi.deleteTransaction(id)`
- [ ] T022 [US3] Criar `webapp/frontend/src/pages/nami/screens/Transactions.tsx` — QuickAdd no topo; chips de filtro (Tudo/Despesas/Receitas + categorias como chips clicáveis multi-select); lista agrupada por data descendente (data relativa: "Hoje"/"Ontem"/ou "Sex, 6 jun"), cada grupo com saldo líquido do dia; filtros e busca filtram localmente (sem re-fetch); ao excluir TxRow: re-fetch ou splice local + toast
- [ ] T023 [US3] Integrar `Transactions.tsx` no `NamiShell.tsx`; conectar campo de busca da topbar: digitar 2+ chars navega para view `transactions` e passa `searchQuery` para Transactions via props/estado do shell

**Checkpoint**: US3 funcional — extrato completo com filtros e exclusão.

---

## Phase 6: User Story 4 — Contas (Priority: P2)

**Objetivo**: CRUD de contas com cor de acento, sigla, IconField (upload + URL).

**Teste independente**: criar conta "Nubank" sigla "NU" cor roxa → card com barra de acento roxa; colar URL de logo → preview circular; upload arquivo → logo persiste; excluir conta.

- [ ] T024 [US4] Criar endpoint `POST /api/finances/uploads/icon` em `webapp/backend/routers/finances.py` — `UploadFile` via FastAPI, validar `file.content_type.startswith('image/')` → HTTP 400 se inválido; salvar em `webapp/uploads/icons/<uuid4>.<ext>` (extrair ext do `file.filename`); retornar `{"url": "/uploads/icons/<uuid>.<ext>"}`; `Depends(require_user)`
- [ ] T025 [US4] Estender `POST /api/finances/accounts` e `GET /api/finances/accounts` em `webapp/backend/routers/finances.py` — adicionar `color: Optional[str]`, `short: Optional[str]`, `icon_url: Optional[str]` ao modelo Pydantic `CreateAccountBody`; incluir esses campos no `INSERT`; `SELECT` deve retornar os três campos novos
- [ ] T026 [P] [US4] Criar `webapp/frontend/src/pages/nami/modals/IconField.tsx` — props: `value: string | null`, `fallbackLabel: string`, `onChange(url: string | null)`: preview 56×56 circular (img se URL, círculo colorido com `fallbackLabel` se null), botão "Enviar imagem" → `<input type="file" accept="image/*">` oculto → lê `FileReader` como Data URL → chama `namiApi.uploadIcon(file)` → `onChange(url)`, campo de texto para colar URL diretamente, botão "Remover" se `value !== null`, `onError` na img volta para sigla
- [ ] T027 [P] [US4] Criar `webapp/frontend/src/pages/nami/modals/FormModal.tsx` — modal genérico com campo de schema dinâmico: header Bricolage 20px 700 + botão X, scrim `backdrop-filter: blur`, `onMouseDown` fora fecha, `Enter` salva, `Esc` fecha; suporta os tipos de campo de FR-019 (`text`, `url`, `number`, `date`, `money`, `select`, `segment`, `color` swatches 34×34px border-radius 9px, `image` → `IconField`); foco automático no primeiro campo ao abrir; botões "Cancelar" ghost + "Salvar" tangerina
- [ ] T028 [US4] Criar `webapp/frontend/src/pages/nami/screens/Accounts.tsx` — grid `repeat(auto-fill, minmax(280px, 1fr))`; cada card: barra de acento 4px lateral `background: var(--account-color)`, logo circular 40px (img ou sigla sobre fundo colorido), nome, tipo, saldo Bricolage 28px, entradas/saídas do mês; painel composição patrimonial (barra horizontal segmentada); botão "+ Nova conta" → FormModal (campos: nome, tipo select, saldo money, sigla text 2-chars, cor swatches, ícone IconField); excluir no hover → DELETE
- [ ] T029 [US4] Integrar `Accounts.tsx` no `NamiShell.tsx`; atualizar badge de Contas na sidebar (patrimônio total compacto) após criação/exclusão

**Checkpoint**: US4 funcional — CRUD de contas com ícone personalizado.

---

## Phase 7: User Story 5 — Cartões (Priority: P2)

**Objetivo**: plástico visual com gradiente, bandeira, fatura e barra de uso do limite.

**Teste independente**: criar cartão Nubank Mastercard `last4=4471`, gradiente roxo → plástico com `•••• 4471`, barra de uso em laranja; fatura ≥ 80% do limite → barra coral.

- [ ] T030 [US5] Estender `POST /api/finances/cards` e `GET /api/finances/cards` em `webapp/backend/routers/finances.py` — adicionar `brand: Optional[str]`, `last4: Optional[str]` (VARCHAR 4), `grad: Optional[str]` ao Pydantic `RegisterCreditCardBody`; incluir nos `INSERT`/`SELECT`
- [ ] T031 [US5] Criar `webapp/frontend/src/pages/nami/screens/Cards.tsx` — grid `repeat(auto-fill, minmax(340px, 1fr))`; cada card: plástico (`aspect-ratio: 1.586`, `border-radius: 18px`, gradiente CSS do campo `grad`, chip EMV SVG, número `•••• •••• •••• {last4}`, nome titular, ícone bandeira), fatura do mês (soma transações do cartão), botão "Pagar fatura", barra de uso do limite (laranja se < 80%, coral se ≥ 80%, `width: Math.min(fatura/limite*100, 100)%`), datas fecha/vence/disponível calculadas, últimos 4 lançamentos do mês; FormModal (nome, bandeira select, last4 text 4 chars, limite money, dia fechamento 1–28, dia vencimento 1–28, gradiente swatches); excluir no hover
- [ ] T032 [US5] Integrar `Cards.tsx` no `NamiShell.tsx`; atualizar badge de Cartões na sidebar (fatura total do mês compacta) após operações

**Checkpoint**: US5 funcional — plástico visual fiel ao design com fatura calculada.

---

## Phase 8: User Story 6 — Assinaturas (Priority: P2)

**Objetivo**: CRUD de assinaturas recorrentes com logo, stat cards e ordenação por próxima cobrança.

**Teste independente**: criar "Netflix" R$ 55,90/mês dia 15 cor vermelha → aparece ordenada por dias restantes; stat cards atualizados; colar URL logo → logo aparece.

- [ ] T033 [US6] Estender `POST /api/finances/subscriptions` e `GET /api/finances/subscriptions` em `webapp/backend/routers/finances.py` — adicionar `color: Optional[str]`, `icon_url: Optional[str]`, `next_billing_day: Optional[int]` ao Pydantic `CreateSubscriptionBody`; incluir nos `INSERT`/`SELECT`
- [ ] T034 [US6] Criar `webapp/frontend/src/pages/nami/screens/Subscriptions.tsx` — 3 stat cards (total/mês coral, total/ano, próxima cobrança com nome do serviço e dias restantes); lista ordenada por dias até próximo `next_billing_day`; cada item: logo colorido OU img 42×42 `border-radius: 12px`, nome + categoria, dia de cobrança + dias restantes, valor/mês; FormModal (serviço, valor money, dia cobrança 1–28, ciclo mensal/anual, categoria select, cor swatches, ícone IconField); excluir no hover
- [ ] T035 [US6] Integrar `Subscriptions.tsx` no `NamiShell.tsx`; atualizar badge de Assinaturas na sidebar (total mensal compacto); ícone de assinatura deve aparecer no painel "Próximos vencimentos" do Dashboard (passar dados de subscriptions para Dashboard)

**Checkpoint**: US6 funcional — assinaturas com logo e ordenação por vencimento.

---

## Phase 9: User Story 7 — Orçamentos (Priority: P2)

**Objetivo**: envelopes mensais por categoria com barras de progresso e cores de alerta.

**Teste independente**: criar orçamento "Lazer" R$ 500 → barra parte de zero; lançar R$ 600 em Lazer → barra coral + "Passou R$ 100"; criar outro orçamento → "Lazer" não aparece no select.

- [ ] T036 [US7] Criar `webapp/frontend/src/pages/nami/screens/Budgets.tsx` — painel resumo (total gasto / total orçado / barra geral de progresso); lista de envelopes: ícone Lucide + nome categoria, valor gasto / limite, %, barra de progresso (cor da categoria se ≤ 85%, `--gold` se 85–99%, `--out` se > 100%), rodapé "X% usado · restam R$…" ou "Passou R$ Y" em coral; FormModal (categoria select — só categorias sem orçamento no mês, derivado de diff entre categories fixas e budgets existentes, limite money); excluir no hover → `DELETE /api/finances/budgets/:month/:categoria`
- [ ] T037 [US7] Integrar `Budgets.tsx` no `NamiShell.tsx`; top-3 orçamentos do Dashboard devem ler do mesmo estado (ou refetch) após mudanças

**Checkpoint**: US7 funcional — orçamentos com alertas visuais.

---

## Phase 10: User Story 8 — Empréstimos entre pessoas (Priority: P2)

**Objetivo**: `personal_loans` — CRUD com direction, LoanCard, dots de parcelas, stat cards A receber/A pagar.

**Teste independente**: criar "Emprestei R$ 500 para Ana, 5 parcelas, 0 pagas" → badge "emprestou" verde, 5 dots vazios, stat "A receber" atualizado; criar "Peguei R$ 200 de Carlos" → badge "você deve" coral, stat "A pagar" atualizado.

- [ ] T038 [US8] Criar endpoints `GET /api/finances/personal-loans`, `POST /api/finances/personal-loans`, `DELETE /api/finances/personal-loans/:id` em `webapp/backend/routers/finances.py` — Pydantic `PersonalLoanBody` (direction: str, person_name: str, total_amount: float, installments: int, paid_installments: int = 0, next_due_day: Optional[int], note: Optional[str]); GET retorna `{"status":"ok","loans":[...]}` sem registros `deleted=True`; DELETE faz `UPDATE ... SET deleted=TRUE`; todos com `Depends(require_user)`; shape exato em `contracts/api.md`
- [ ] T039 [P] [US8] Criar `webapp/frontend/src/pages/nami/components/LoanCard.tsx` — badge `direction`: fundo verde "emprestou" / fundo coral "você deve"; nome da pessoa + valor restante calculado (`total * (1 - paid/installments)`) em destaque Bricolage; total + valor da parcela (`total/installments`); barra de progresso (`paid/installments * 100%`); dots de parcelas: `✓` verde para `i < paid_installments`, número cinza para `i >= paid_installments`, `max-width` com overflow `…` se > 12; rodapé "X/Y parcelas · próximo dia DD"; observação em itálico se preenchida; botão lixeira no hover; props: `loan: PersonalLoan`, `onDelete`
- [ ] T040 [US8] Criar `webapp/frontend/src/pages/nami/screens/Loans.tsx` — 2 stat cards: "A receber" verde (soma `direction=lent`) e "A pagar" coral (soma `direction=borrowed`); grid de `LoanCard`; FormModal (segment "Emprestei"/"Peguei emprestado" → define `direction`, pessoa text, total money, parcelas number, parcelas pagas number, dia vencimento 1–28, observação text); excluir via `LoanCard.onDelete` + toast
- [ ] T041 [US8] Integrar `Loans.tsx` no `NamiShell.tsx`; dados de `personal_loans` devem ser passados para o painel "Próximos vencimentos" do Dashboard

**Checkpoint**: US8 funcional — empréstimos pessoa-a-pessoa separados dos financiamentos.

---

## Phase 11: User Story 9 — Financiamentos (Priority: P2)

**Objetivo**: `financings` — CRUD com lender, interest_rate, saldo devedor, separação total de Empréstimos.

**Teste independente**: criar "MacBook Pro / Nubank / R$ 12k / 12 parcelas / taxa 2,1% a.m." → badge "financiamento" coral; aba Empréstimos não exibe o item.

- [ ] T042 [US9] Criar endpoints `GET /api/finances/financings`, `POST /api/finances/financings`, `DELETE /api/finances/financings/:id` em `webapp/backend/routers/finances.py` — Pydantic `FinancingBody` (description: str, lender: Optional[str], total_amount: float, installments: int, paid_installments: int = 0, next_due_day: Optional[int], interest_rate: Optional[str], note: Optional[str]); GET retorna `{"status":"ok","financings":[...]}` sem `deleted=True`; DELETE soft delete; `Depends(require_user)`; shape exato em `contracts/api.md`
- [ ] T043 [US9] Criar `webapp/frontend/src/pages/nami/screens/Financings.tsx` — 2 stat cards: "Saldo devedor" coral (soma `total*(1-paid/installments)`) e "Parcelas/mês" (contagem de financiamentos ativos); grid de cards de financiamento: badge "financiamento" coral, descrição + credor, saldo devedor calculado em destaque, taxa de juros descritiva (texto livre), barra de progresso, dots de parcelas (reutilizar lógica de `LoanCard` sem o badge de direction), próximo vencimento; FormModal (descrição text, credor text, valor money, parcelas totais number, parcelas pagas number, dia vencimento 1–28, taxa text, observação text); excluir no hover + toast
- [ ] T044 [US9] Integrar `Financings.tsx` no `NamiShell.tsx`; dados de `financings` passados para o painel "Próximos vencimentos" do Dashboard; confirmar que `Loans.tsx` não recebe dados de financings e vice-versa

**Checkpoint**: US9 funcional — financiamentos completamente separados de empréstimos.

---

## Phase 12: User Story 10 — Tweaks: aparência e privacidade (Priority: P3)

**Objetivo**: tema claro/escuro, cor de acento, densidade, privacidade — tudo persistido no localStorage.

**Teste independente**: ativar tema escuro → tokens escuros; mudar acento para azul-maré → CSS vars atualizam; ativar privacidade → blur 7px nos valores; recarregar → preferências restauradas.

- [ ] T045 [US10] Completar `webapp/frontend/src/pages/nami/TweaksPanel.tsx` — tema claro/escuro: aplica `data-theme="dark"|"light"` no elemento root da seção via ref; 4 swatches de acento (Tangerina `#EF8B3D` / Azul-maré `#3B82C4` / Coral `#E0524A` / Ouro `#C9A227`) que sobrescrevem `--tang` e derivadas via `root.style.setProperty`; densidade Confortável/Compacto (altera `--tx-height` usada nas TxRows); modo privacidade: aplica `data-privacy="on"|""` no root + exibe mensagem contextual; cada mudança emite `onPreferenceChange(key, value)` para o shell persistir
- [ ] T046 [US10] Implementar persistência de Tweaks em `webapp/frontend/src/pages/nami/NamiShell.tsx` — `useEffect` ao montar: ler `localStorage.getItem('nami:theme')`, `nami:accent`, `nami:density`, `nami:privacy` e aplicar; `onPreferenceChange` de TweaksPanel: `localStorage.setItem(key, value)` + aplicar imediatamente no root; garantir que valores padrão (tema claro, tangerina, confortável, sem privacidade) sejam usados se não há preferência salva

**Checkpoint**: US10 funcional — preferências persistem após F5.

---

## Phase 13: Polish e Validação Final

**Objetivo**: responsividade, fidelidade de tokens, edge cases, quickstart.md completo, regressão do bot.

- [ ] T047 [P] Implementar responsividade em `webapp/frontend/src/pages/nami/nami.css` — media query `< 880px`: sidebar `width: 66px`, ocultar textos de link, exibir só ícones (FR-037); `< 900px`: grids de 2 colunas (fluxo+donut, contas+vencimentos) viram `grid-cols-1` (FR-038); `< 760px`: `nami-hero.png` `display: none` no hero card (FR-039)
- [ ] T048 [P] Implementar edge cases visuais — estado vazio em cada tela (mensagem "Nenhuma transação neste mês" etc., sem NaN/undefined); erro de rede ao salvar (modal permanece, erro inline no modal, sem estado inconsistente); validação no `IconField` rejeita `file.type` que não começa com `image/` antes de enviar ao backend; `<img onError>` volta para sigla de fallback; saldo negativo de conta em coral; fatura do cartão ≥ 100% do limite (barra coral cheia, lançamento ainda permitido)
- [ ] T049 [P] Verificar fidelidade visual conforme `specs/002-nami-financas/quickstart.md §gate de fidelidade` — inspecionar no browser: Bricolage/DM Sans/DM Mono carregadas; CSS vars do token sistema presentes no root; `--in` verde / `--out` coral; valores BRL formatados `Intl.NumberFormat('pt-BR')` + compacto `1,2k`; `tabular-nums`; deep-link `/nami#cartoes` funciona; breakpoints de responsividade
- [ ] T050 Rodar `specs/002-nami-financas/quickstart.md` completo — Cenários 1 a 8 (US1–US10), gate de fidelidade e regressão do bot — documentar quais passam/falham e corrigir falhas
- [ ] T051 [P] Verificar regressão do bot Telegram — enviar despesa ao bot; confirmar que tabela `loans` não foi alterada (`\d loans`), tabelas `personal_loans` e `financings` existem com dados corretos, bot responde normalmente

---

## Dependências e Ordem de Execução

### Dependências entre fases

- **Phase 1** (Setup): sem dependências — pode começar imediatamente
- **Phase 2** (Foundational): depende de Phase 1 — BLOQUEIA todas as user stories
- **Phase 3–12** (User Stories): todas dependem de Phase 2; podem prosseguir em sequência de prioridade
- **Phase 13** (Polish): depende de todas as user stories desejadas estarem completas

### Dependências entre User Stories

- **US1 (P1)**: pode começar após Phase 2 — sem dependência de outras stories
- **US2 (P1)**: pode começar após Phase 2 — sem dependência de outras stories (mas se integra com US1 via `handleTransactionSaved`)
- **US3 (P2)**: pode começar após Phase 2 — depende de `TxRow.tsx` (paralelo com US2)
- **US4 (P2)**: pode começar após Phase 2 — `IconField.tsx` e `FormModal.tsx` criados aqui são reutilizados por US5/US6/US7/US8/US9
- **US5–US7 (P2)**: podem começar após Phase 2; US5/US6 reutilizam `IconField`/`FormModal` de US4 (esperar T026/T027)
- **US8 (P2)**: pode começar após Phase 2; `LoanCard.tsx` de US8 pode ser reutilizado por US9
- **US9 (P2)**: pode começar após Phase 2; se reutilizar `LoanCard.tsx`, esperar T039 de US8
- **US10 (P3)**: pode começar após Phase 2; melhor depois de US1/US2 para ter contexto visual completo

### Dependências dentro de cada User Story

- Tipos (types.ts) → namiApi.ts → componentes → telas → integração no shell
- `FormModal.tsx` e `IconField.tsx` devem ser criados antes das telas que os usam (US4 antes de US5/US6)
- `LoanCard.tsx` antes de `Loans.tsx` e `Financings.tsx`

---

## Execução em paralelo por story

```
# Phase 2 — paralelos:
T006 (types.ts) ‖ T007 (nami.css) ‖ T009 (Toast.tsx)
→ T008 (namiApi.ts, depende de T006)
→ T010 (NamiShell, depende de T006/T007/T009)
→ T011 (App.tsx, depende de T010)

# US1 — paralelos:
T013 (QuickAdd.tsx) ‖ T014 (AddModal.tsx)
→ T015 (integração NamiShell, depende de T013+T014)

# US2 — paralelos:
T017 (DonutChart.tsx) ‖ T018 (CashflowChart.tsx)
→ T019 (Dashboard.tsx, depende de T017+T018)
→ T020 (integração NamiShell, depende de T019)

# US4 — paralelos:
T026 (IconField.tsx) ‖ T027 (FormModal.tsx)
→ T028 (Accounts.tsx, depende de T026+T027)

# US8 → US9 — serial (LoanCard reutilizado):
T039 (LoanCard.tsx) → T040 (Loans.tsx) → T041 (integração)
→ T043 (Financings.tsx pode reutilizar LoanCard)
```

---

## Estratégia de Implementação

### MVP: apenas US1 + US2 (P1)

1. Completar Phase 1: Setup
2. Completar Phase 2: Foundational (**crítico**)
3. Completar Phase 3: US1 — Lançamento rápido
4. **PARAR E VALIDAR**: quickstart.md Cenários 1
5. Completar Phase 4: US2 — Dashboard
6. **PARAR E VALIDAR**: quickstart.md Cenários 1 e 2
7. Fazer deploy/demo se pronto

### Entrega incremental

1. Setup + Foundational → NamiShell vazio funcionando
2. US1 → lançamento rápido — SC-001 passa
3. US2 → dashboard completo — SC-003 passa
4. US3 → extrato — SC-002 parcial
5. US4 → contas com ícone — SC-007 passa
6. US5 → cartões
7. US6 → assinaturas
8. US7 → orçamentos
9. US8 → empréstimos — SC-008 passa (metade)
10. US9 → financiamentos — SC-002/SC-008 completos
11. US10 → tweaks — SC-004/SC-005/SC-010 passam
12. Phase 13 → SC-006/SC-009 verificados

---

## Notas

- `[P]` = arquivos diferentes, sem dependência incompleta — podem ser implementados em paralelo
- `[Story]` mapeia a tarefa para a user story para rastreabilidade com `spec.md`
- Cada fase termina com um checkpoint independentemente testável
- Não usar `git add .` — `webapp/frontend/dist/` está no `.gitignore`; adicionar arquivos individualmente
- Executar a migração (T005) **uma única vez** no banco de produção — é idempotente mas cuidado no VPS
- `FormModal.tsx` e `IconField.tsx` (T027/T026) são reutilizados por US5, US6, US7, US8, US9 — vale a pena polir bem antes de avançar
