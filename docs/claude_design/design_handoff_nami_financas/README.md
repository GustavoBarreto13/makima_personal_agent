# Handoff: Nami — Finanças

> **Para o Claude Code:** Os arquivos HTML neste pacote são **protótipos de design de alta fidelidade** — referências visuais e comportamentais criadas em React/Babel. A tarefa é **reimplementar estes designs no seu stack de backend real** (Node/Django/Rails + React/Next/Vue, etc.), conectado a um banco de dados. Não copie o HTML diretamente. Use este documento + os arquivos de referência para fidelidade pixel-a-pixel.

---

## 1. Visão Geral

**Nami — Finanças** é uma aba de um app maior chamado **Makima Web App**. É um gerenciador financeiro pessoal completo, com tema visual próprio baseado na personagem Nami de One Piece (paleta tangerina + azul-maré, clima "caderno de bordo").

### Stack do protótipo (referência, não produção)
- React 18 + Babel (JSX inline, sem bundler)
- CSS custom properties (design tokens via `--variáveis`)
- Dados em memória (arrays JS mutáveis)
- Fontes: Google Fonts (Bricolage Grotesque, DM Sans, DM Mono)

### Arquitetura de arquivos do protótipo
```
Nami - Finanças.html      ← entry point
nami/
  styles.css              ← todo o sistema visual
  data.js                 ← mock data + helpers financeiros
  ui.jsx                  ← ícones, Money, CatBadge, Donut, Spark
  addmodal.jsx            ← AddModal, QuickAdd, SummBar, Toast, FormModal, IconField
  screens-dash.jsx        ← tela Dashboard
  screens-a.jsx           ← telas Transações, Contas, Cartões
  screens-b.jsx           ← telas Orçamentos, Assinaturas, Empréstimos, Financiamentos
  app.jsx                 ← shell, sidebar, roteamento, state global
  nami-hero.png           ← portrait da Nami (PNG com fundo transparente)
  nami.jpg                ← foto da Nami (usada no brand mark da sidebar)
```

---

## 2. Design Tokens

### Tipografia
| Função | Família | Uso |
|---|---|---|
| `--display` | Bricolage Grotesque | Títulos, números grandes, brand name |
| `--sans` | DM Sans | Corpo, labels, botões |
| `--mono` | DM Mono | Valores monetários, badges, timestamps, rótulos uppercase |

### Escala tipográfica
| Uso | Tamanho | Peso |
|---|---|---|
| Título de página | 30px | 700 |
| Subtítulo de seção | 21px | 600 |
| Número hero (saldo do mês) | clamp(42px, 5.5vw, 62px) | 700 |
| Número stat card | 30px | 700 |
| Título de painel | 16px | 600 |
| Corpo / item de lista | 13.5–14px | 400–600 |
| Label mono uppercase | 9–10.5px | 400, letter-spacing 0.12–0.18em |
| Valor monetário em lista | 14.5px | 700, tabular-nums |

### Cores — Tema Claro
```
/* Superfícies */
--paper:    oklch(0.988 0.008 75)   ≈ #FDFAF5  (fundo principal)
--paper-2:  oklch(0.968 0.013 70)   ≈ #F7F3EC  (fundo sidebar)
--card:     oklch(1 0.002 75)       ≈ #FFFEFB  (cards)
--card-2:   oklch(0.975 0.011 70)   ≈ #F9F6EE  (cards secundários)
--mist:     oklch(0.955 0.022 62)   ≈ #F4EDE0  (hero background)

/* Tinta */
--ink:   oklch(0.29 0.022 52)  ≈ #3A2E1E  (texto principal)
--ink-2: oklch(0.47 0.020 52)  ≈ #5E4F3A  (texto secundário)
--ink-3: oklch(0.605 0.016 54) ≈ #7A6D5C  (texto terciário / labels)
--ink-4: oklch(0.72 0.013 56)  ≈ #9E9488  (placeholders / disabled)

/* Linhas */
--line:   oklch(0.905 0.013 66) ≈ #E8E1D7  (divisores)
--line-2: oklch(0.945 0.010 66) ≈ #F0EBE4  (divisores suaves)

/* Acento principal — Tangerina */
--tang:        oklch(0.685 0.176 52)  ≈ #D4722A  (botões, ativo, links)
--tang-deep:   oklch(0.585 0.165 47)  ≈ #B55A18  (hover)
--tang-bright: oklch(0.77 0.155 60)   ≈ #E89040  (gradientes)
--tang-tint:   oklch(0.685 0.176 52 / 0.12)  (fundo selecionado)
--tang-tint-2: oklch(0.685 0.176 52 / 0.20)  (selection highlight)

/* Azul-maré */
--sea:      oklch(0.56 0.104 234) ≈ #3B73B5
--sea-deep: oklch(0.46 0.100 236) ≈ #2D5990
--sea-tint: oklch(0.56 0.104 234 / 0.12)

/* Ouro */
--gold:     oklch(0.74 0.130 78) ≈ #C9A227
--gold-tint: oklch(0.74 0.130 78 / 0.16)

/* Semântica financeira */
--in:      oklch(0.585 0.115 162) ≈ #2E8B57  (receita / entrou — verde)
--in-tint: oklch(0.585 0.115 162 / 0.13)
--out:     oklch(0.575 0.170 24)  ≈ #C0392B  (despesa / saiu — coral)
--out-tint:oklch(0.575 0.170 24 / 0.12)
```

### Cores — Tema Escuro (alto-mar)
```
--paper:   oklch(0.175 0.018 252)  ≈ #1A1E2A  (fundo principal)
--paper-2: oklch(0.208 0.020 252)  ≈ #1F2433  (fundo sidebar)
--card:    oklch(0.228 0.020 252)  ≈ #232839  (cards)
--tang:    oklch(0.74 0.165 55)    ≈ #E08840  (acento mais brilhante no dark)
--in:      oklch(0.72 0.135 162)   ≈ #52C490  (verde mais vivo)
--out:     oklch(0.70 0.165 26)    ≈ #E05A4A  (coral mais vivo)
```

### Border radius
```
--r-sm: 8px   (chips, botões pequenos)
--r-md: 12px  (cards, campos, modais)
--r-lg: 18px  (hero, cartão plástico)
```

### Sombras
```
--shadow-sm: 0 1px 2px oklch(0.4 0.04 50 / 0.05), 0 1px 1px oklch(0.4 0.04 50 / 0.04)
--shadow-md: 0 2px 6px oklch(0.4 0.04 50 / 0.06), 0 8px 28px oklch(0.4 0.04 50 / 0.08)
--shadow-lg: 0 12px 40px oklch(0.35 0.04 50 / 0.16)
```

---

## 3. Modelo de Dados

### Entidades do backend necessárias

#### Transaction
```
id: string (uuid)
user_id: FK
type: 'in' | 'out'
amount: decimal(12,2)
category_id: FK → Category
merchant: string          ← nome do estabelecimento / descrição
source_id: string         ← ID de Account ou Card
source_type: 'account' | 'card'
date: date
created_at: timestamp
```

#### Account (Conta)
```
id: string (uuid)
user_id: FK
name: string              ← "Nubank", "Itaú", "Caixa"…
kind: enum                ← 'Conta corrente' | 'Poupança' | 'Investimentos' | 'Dinheiro'
balance: decimal(12,2)    ← saldo atual (atualizado a cada transação)
color: string             ← oklch / hex (para o logo colorido)
short: string(2)          ← sigla de 2 letras quando sem ícone
img_url: string?          ← URL ou base64 do ícone customizado
```

#### Card (Cartão de crédito)
```
id: string (uuid)
user_id: FK
name: string              ← "Nubank Ultravioleta", "Itaú Click"…
brand: enum               ← 'Mastercard' | 'Visa' | 'Elo' | 'American Express'
last4: string(4)
limit: decimal(12,2)
close_day: int(1-28)      ← dia que a fatura fecha
due_day: int(1-28)        ← dia que vence
grad: string              ← CSS gradient para o plástico
```

#### Category
```
id: string (slug)         ← 'mercado', 'restaurante', 'transporte'…
name: string
icon: string              ← nome do ícone interno
color: string             ← oklch
kind: 'in' | 'out'
```

Categorias de despesa: `mercado`, `restaurante`, `transporte`, `casa`, `saude`, `lazer`, `compras`, `educacao`, `viagem`, `assinaturas`, `outros`

Categorias de receita: `salario`, `freela`, `investimento`, `reembolso`

#### Budget (Orçamento)
```
id: string (uuid)
user_id: FK
category_id: FK → Category
limit_amount: decimal(12,2)
month: date (primeiro dia do mês, ex: 2026-06-01)
```
> Nota: o protótipo usa um único `BUDGETS` array sem mês; no backend, filtrar pelo mês corrente.

#### Subscription (Assinatura)
```
id: string (uuid)
user_id: FK
name: string
amount: decimal(12,2)
cycle: 'mensal' | 'anual'
next_billing_day: int(1-28)   ← dia do mês em que cobra
category_id: FK → Category
color: string
img_url: string?              ← ícone customizado (upload ou URL)
```

#### Loan (Empréstimo — pessoa a pessoa)
```
id: string (uuid)
user_id: FK
direction: 'lent' | 'borrowed'  ← emprestei / peguei emprestado
person_name: string
total_amount: decimal(12,2)
installments: int
paid_installments: int
next_due_day: int(1-28)
note: string?
```

#### Financing (Financiamento — crédito/parcelas)
```
id: string (uuid)
user_id: FK
description: string           ← "MacBook Pro", "Crédito pessoal"…
lender: string?               ← "Nubank", "Caixa"…
total_amount: decimal(12,2)
installments: int
paid_installments: int
next_due_day: int(1-28)
interest_rate: string?        ← "2,1% a.m." (descritivo)
note: string?
```

---

## 4. Endpoints de API necessários

```
# Transações
GET    /api/transactions?month=YYYY-MM&search=&type=&category=
POST   /api/transactions
DELETE /api/transactions/:id

# Contas
GET    /api/accounts
POST   /api/accounts
DELETE /api/accounts/:id

# Cartões
GET    /api/cards
POST   /api/cards
DELETE /api/cards/:id
GET    /api/cards/:id/invoice?month=YYYY-MM   ← soma de transações do mês

# Orçamentos
GET    /api/budgets?month=YYYY-MM
POST   /api/budgets
DELETE /api/budgets/:id

# Assinaturas
GET    /api/subscriptions
POST   /api/subscriptions
DELETE /api/subscriptions/:id

# Empréstimos
GET    /api/loans
POST   /api/loans
DELETE /api/loans/:id

# Financiamentos
GET    /api/financings
POST   /api/financings
DELETE /api/financings/:id

# Dashboard / estatísticas
GET    /api/stats?month=YYYY-MM    ← income, expense, net, by_category, daily_spending[], cashflow[]
```

### Upload de ícone
```
POST /api/uploads/icon    ← multipart/form-data → retorna { url: "https://..." }
```
> O campo `img_url` em Account e Subscription aceita tanto uma URL de upload quanto qualquer URL externa.

---

## 5. Layout Geral — Shell

```
┌─────────────────────────────────────────────────────────────────────┐
│  SIDEBAR (250px fixo)  │  MAIN (flex: 1)                           │
│                        │  ┌─ TOPBAR (56px, sticky, backdrop-blur) ─┐│
│  ● brand mark + nome   │  │ Título | Mês ‹ Junho 2026 › | Busca   ││
│  [+ Nova transação  A] │  └─────────────────────────────────────── ┘│
│                        │                                            │
│  ── Visão geral ──     │  NM-SCROLL (overflow-y: auto)             │
│  □ Dashboard           │  └─ página ativa (max-width: 1160px)      │
│                        │                                            │
│  ── Dia a dia ──       │                                            │
│  □ Transações          │                                            │
│  □ Contas      42,8k   │                                            │
│  □ Cartões     -1.2k   │                                            │
│                        │                                            │
│  ── Planejamento ──    │                                            │
│  □ Orçamentos          │                                            │
│  □ Assinaturas  369/m  │                                            │
│  □ Empréstimos         │                                            │
│  □ Financiamentos      │                                            │
│                        │                                            │
│  · Voltar à Makima     │                                            │
├─────────────────────────────────────────────────────────────────────┤
│  BARRA RESUMO DO MÊS (64px, sticky no fundo, backdrop-blur)        │
│  Entrou R$ 8.500  Saiu R$ 6.320  |  Saldo R$ 2.180  [====--]  [+] │
└─────────────────────────────────────────────────────────────────────┘
```

**Sidebar** (`width: 250px`):
- `background: var(--paper-2)`, `border-right: 1px solid var(--line)`
- Brand mark: círculo 42px com foto/imagem da Nami (nami.jpg)
- Brand name: Bricolage Grotesque 19px 700; Role: DM Mono 9.5px uppercase tangerina
- Botão "+ Nova transação": tangerina full-width, 12px 16px, border-radius 12px, atalho `A` à direita
- Grupos de nav com label DM Mono 9px uppercase ink-4
- Item ativo: fundo tang-tint, texto tang-deep, peso 600
- Badge de valor à direita de alguns itens (contas, cartões, assinaturas): DM Mono 10.5px
- Footer: link "Voltar à Makima" com bolinha vermelha (cor Makima)

**Topbar** (`height: 56px`, `backdrop-filter: blur(12px)`, `background: var(--topbar-bg)`):
- Título da tela ativa: Bricolage Grotesque 18px 600
- Seletor de mês (só nas telas `dashboard, transacoes, contas, cartoes, orcamentos`): chevrons + label "Junho 2026" 104px min-width
- Campo de busca: pill border-radius, 190px min-width; ao digitar, navega automaticamente para Transações

**Barra de resumo** (`height: 64px`, grid-column spanning ambas as colunas):
- Entrou (verde) | Saiu (coral) | separador | Saldo do mês | barra de fluxo | botão "+ Nova transação"
- `backdrop-filter: blur(16px)`, `background: var(--barbar-bg)`

---

## 6. Telas em Detalhe

### 6.1 Dashboard

**Hero card** (`border-radius: 18px`, `min-height: 312px`, `padding: 32px 40px 0`):
- Background: gradiente radial tangerina suave + azul-maré suave sobre `var(--mist)`
- Grid 2 colunas: cópia à esquerda, portrait à direita
- **Cópia**: eyebrow DM Mono 10.5px uppercase → saudação (Bom dia/Boa tarde) → **número do saldo do mês** (62px Bricolage bold, verde se positivo, coral se negativo) → sub com valores de entrada/saída → 2 CTAs (Nova transação + Ver extrato)
- **Portrait**: imagem Nami transparente `nami-hero.png` ancorada na base (`align-self: flex-end`), 300px max-width, `drop-shadow`, halo glow radial atrás

**Quick-Add inline** (logo abaixo do hero):
- Barra horizontal: `[botão tipo] [R$] [campo valor] [campo descrição] [chips de categoria] [Lançar]`
- Ao clicar no botão de tipo, alterna despesa ↔ receita (muda cor e ícone)
- Chips de categoria rápida: 5 categorias mais comuns para despesa / 4 para receita
- Enter ou "Lançar" salva e reseta o campo
- Foco automático no valor

**Stat cards** (grid 4 colunas):
1. Receitas (verde) — total + contagem
2. Despesas (coral) — total + sparkline de barras + variação vs mês anterior
3. Saldo do mês — total + barra de progresso da taxa de economia
4. Patrimônio — total de todas as contas + disponível líquido

**Grid 2 colunas — Fluxo de caixa + Para onde foi**:
- Fluxo: barras verticais duplas (verde/coral) por mês, mês atual destacado
- Para onde foi: donut SVG com categorias + legenda com %, nome e valor

**Grid 2 colunas — Contas + Próximos vencimentos**:
- Contas: lista com logo, nome, tipo, saldo
- Próximos vencimentos: lista de assinaturas + financiamentos + empréstimos a pagar, ordenada por dias restantes

**Orçamentos preview** (grid 3 colunas): top 3 orçamentos por % usado

**Transações recentes**: últimas 6 transações com TxRow

---

### 6.2 Transações

- Header com botão "Adicionar"
- Quick-Add inline (igual ao dashboard)
- Chips de filtro: Tudo / Despesas / Receitas + chips de categoria
- Lista agrupada por dia com `TxDay` (label com data relativa + saldo líquido do dia)
- Cada `TxRow`: ícone categoria | nome | categoria + fonte | valor | botão excluir (aparece no hover)

**TxRow layout:**
```
[ícone 38x38 arredondado] [nome bold 13.5px] [categoria · fonte pill]   [± R$ valor bold]  [🗑 hover]
                           [                sub 11.5px ink-3           ]
```

---

### 6.3 Contas

- Header "Contas" + botão "Nova conta"
- Resumo: patrimônio total + disponível líquido (texto no sub)
- Grid cards (`repeat(auto-fill, minmax(280px, 1fr))`):
  - Barra de acento (4px) na lateral esquerda com cor da conta
  - Logo: círculo 40px com sigla OU `<img>` se tiver ícone custom
  - Nome + tipo de conta
  - Saldo grande (Bricolage 28px)
  - Rodapé: entradas/saídas do mês
  - Botão excluir (lixeira) aparece no hover, posição `absolute top-right`
- Painel de composição do patrimônio: barra horizontal segmentada + legenda

**Formulário "Nova conta"** (FormModal):
- Nome (text)
- Tipo (select: Conta corrente / Poupança / Investimentos / Dinheiro)
- Saldo atual (money field)
- Sigla (text, 2 chars)
- Cor (color swatches: 7 opções oklch)
- **Ícone** (IconField: upload de arquivo ou URL) ← campo especial

---

### 6.4 Cartões

- Header "Cartões" + botão "Novo cartão"
- Grid cards (`repeat(auto-fill, minmax(340px, 1fr))`):
  - **Plástico** (aspect-ratio 1.586, `border-radius: 18px`): gradiente configurável, nome do cartão, chip EMV SVG, número mascarado `•••• •••• •••• 4471`, titular, bandeira
  - Botão excluir sobre o plástico (fundo semi-transparente branco)
  - Fatura atual + botão "Pagar fatura"
  - Barra de uso do limite (laranja se < 80%, coral se ≥ 80%)
  - Datas: fecha, vence, disponível
  - Últimos 4 lançamentos do mês no cartão

**Formulário "Novo cartão"** (FormModal):
- Nome, Bandeira, Final (4 dígitos), Limite, Dia fechamento, Dia vencimento, Cor (gradient swatches)

---

### 6.5 Orçamentos

- Header + botão "Novo orçamento" (só aparece se houver categorias sem orçamento)
- Painel de resumo: total gasto / total orçado + barra geral
- Lista de budget rows:
  - Ícone categoria + nome + valor gasto / limite + % + botão excluir
  - Barra de progresso: cor da categoria até 85%, ouro acima de 85%, coral se ultrapassou
  - Rodapé: "X% usado · restam R$..." ou "passou R$..."

**Formulário "Novo orçamento"** (FormModal):
- Categoria (select — só categorias ainda sem orçamento no mês)
- Limite mensal (money field)

---

### 6.6 Assinaturas

- Header + botão "Nova assinatura"
- 3 stat cards: Por mês / Por ano / Próxima cobrança
- Lista ordenada por próximo vencimento:
  - Logo colorido OU `<img>` custom 42x42 arredondado
  - Nome + categoria
  - Dia de cobrança + dias restantes
  - Valor/mês
  - Botão excluir (hover)

**Formulário "Nova assinatura"** (FormModal):
- Serviço (text), Valor (money), Dia cobrança (number), Categoria (select), Cor (swatches), **Ícone** (IconField)

---

### 6.7 Empréstimos (pessoa a pessoa)

- Header + botão "Novo empréstimo"
- 2 stat cards: "A receber" (verde, pessoas que devem pra você) + "A pagar" (coral, você deve)
- Grid de LoanCards (`repeat(auto-fill, minmax(330px, 1fr))`):
  - Badge "emprestou" (fundo verde) ou "você deve" (fundo coral)
  - Pessoa + valor restante em destaque
  - Total + parcela
  - Barra de progresso (pago vs restante)
  - Dots de parcelas: ✓ verdes para pagas, números para pendentes
  - Rodapé: X/Y parcelas + próximo vencimento
  - Observação em itálico
  - Botão excluir (hover, `card-del` absolute)

**Formulário "Novo empréstimo"** (FormModal):
- Direção (segment: "Emprestei" / "Peguei emprestado")
- Pessoa, Total, Parcelas, Pagas, Dia vencimento, Observação

---

### 6.8 Financiamentos (crédito / parcelamentos)

- Exatamente igual à estrutura de Empréstimos, com diferenças:
- Badge sempre "financiamento" (coral)
- LoanCard mostra: descrição + credor + saldo devedor + taxa de juros na linha de detalhes
- 2 stat cards: "Saldo devedor" + "Parcelas/mês"

**Formulário "Novo financiamento"** (FormModal):
- Descrição, Credor/banco, Valor financiado, Parcelas, Pagas, Dia vencimento, Taxa (text)

---

## 7. Componentes Compartilhados

### FormModal (modal genérico de formulário)
- Sempre centralizado `align-items: flex-start; padding-top: 8vh`
- Max-width: 440–480px
- Header: título Bricolage 20px 700 + botão X no canto
- Scrim backdrop blur + `onMouseDown` fora fecha
- Teclado: `Enter` salva, `Esc` fecha
- Foco automático no primeiro campo ao abrir
- Botões: "Cancelar" (ghost) + "Adicionar" (tangerina), desabilitados se inválido

**Tipos de campo suportados:**
- `text` / `url` → `<input>` padrão
- `number` → `<input type="number">`
- `date` → `<input type="date">`
- `money` → container estilizado com `R$` + input sem spinner
- `select` → `<select>` estilizado
- `segment` → chips horizontais (radio visual)
- `color` → grade de swatches clicáveis (34×34px, border-radius 9px)
- `image` → **IconField** (ver abaixo)

### IconField (campo de ícone)
```
[preview 56×56]  [Enviar imagem ↑]  [campo URL]
```
- Preview mostra imagem se definida, ícone placeholder (cinza) se não
- Shape: `circle` (border-radius 50%) ou `rounded` (border-radius 13px)
- "Enviar imagem": abre input file oculto, lê como Data URL via FileReader
- Campo URL: aceita qualquer URL de imagem ou Data URL
- Botão "Remover" aparece se há imagem
- Backend: ao salvar, fazer upload do Data URL para S3/CDN e salvar só a URL

### AddModal (adicionar transação — modal completo)
- Toggle despesa/receita no topo (2 abas coloridas: coral/verde)
- Valor central grande (56px Bricolage, cor varia por tipo)
- Grid de categorias 4×N com ícone + nome, seleção visual
- Campos: descrição (opcional), conta/cartão (select), data
- Atalho global `A` ou `+` abre o modal (fora de inputs)
- `Enter` salva, `Esc` fecha

### QuickAdd (lançamento rápido inline)
- Barra horizontal na parte superior das telas Dashboard e Transações
- Toggle tipo (clique no botão esquerdo alterna despesa ↔ receita)
- Campo valor + campo descrição separados por divisor vertical
- Chips de categoria rápida (5 despesa / 4 receita, clicáveis com cor)
- Botão "Lançar" habilitado só com valor > 0
- `Enter` em qualquer campo salva
- Após salvar: campos resetam, foco volta pro valor

### TxRow (linha de transação)
```
[CatBadge 38×38]  [nome 13.5px bold]  [categoria · fonte]   [± valor]  [🗑 hover]
```
- CatBadge: ícone sobre fundo colorido com opacidade 14% da cor da categoria
- Hover na linha: `background: var(--card-2)`
- Botão excluir (`.del-btn`): invisível, aparece no hover, fundo out-tint no hover

### SummBar (barra de resumo do mês — rodapé)
- Sempre visível, fixa na base do layout
- "Entrou" (verde) | "Saiu" (coral) | divisor | "Saldo do mês" | barra proporcional | botão "+ Nova transação"

### Toast (notificação temporária)
- Posição: `fixed bottom 88px center`
- Fundo ink, texto paper, ícone check tangerina
- Border-radius 999px (pill)
- Desaparece após 2600ms
- Animação: sobe 14px + fade in

---

## 8. Comportamentos Globais

### Modo privacidade
- Atributo `data-privacy="on"` na raiz do app
- Todos os elementos com classe `.amount` ou `.priv` recebem `filter: blur(7px)`
- Hover remove o blur (reveal ao passar o mouse)
- Toggleado por um switch nas configurações

### Modo escuro
- Atributo `data-theme="dark"` no `<html>`
- Todas as variáveis CSS são sobrescritas via seletor `[data-theme='dark']`
- Nenhuma mudança de estrutura — só tokens

### Cor de acento customizável
- 4 opções: Tangerina (#EF8B3D), Azul-maré (#3B82C4), Coral (#E0524A), Ouro (#C9A227)
- Troca dinamicamente as CSS vars `--tang*` via JavaScript

### Seletor de mês
- Aparece no topbar apenas nas telas: Dashboard, Transações, Contas, Cartões, Orçamentos
- Não aparece em: Assinaturas, Empréstimos, Financiamentos (dados não são mensais)
- Navega entre os meses com dados disponíveis

### Busca global
- Campo no topbar
- Ao digitar, navega automaticamente para a tela Transações
- Filtra por nome do estabelecimento e nome da categoria

### Deep linking por hash
- A URL `/Nami - Finanças.html#transacoes` abre direto na tela correta
- Útil para o link do Makima apontar para abas específicas

### Atualização reativa
- Ao adicionar/remover qualquer entidade, o estado da aplicação re-renderiza completamente
- Saldo das contas se atualiza ao adicionar/remover transações em conta (não em cartão)
- Fluxo de caixa mensal recalculado

---

## 9. Responsividade

- `< 880px`: sidebar colapsa para 66px (só ícones), textos somem
- `< 900px`: grids 2-colunas viram 1 coluna
- `< 760px`: hero oculta o portrait da Nami

---

## 10. Assets

| Arquivo | Uso |
|---|---|
| `nami/nami-hero.png` | Portrait transparente da Nami, hero do dashboard |
| `nami/nami.jpg` | Foto para o brand mark circular na sidebar |

---

## 11. Notas de Implementação

1. **Formatação de moeda**: sempre BRL pt-BR. Usar `Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 })`. Para compacto (>= 1000): `1,2k` format.

2. **Fonte tabular**: valores monetários em listas/cards sempre com `font-variant-numeric: tabular-nums` para alinhar colunas.

3. **Cálculo de fatura do cartão**: soma de transações `type='out'` com `source_id = card.id` no mês selecionado.

4. **Orçamentos por mês**: no protótipo são globais, mas no backend devem ser filtrados por mês (ou permitir cópia/template de um mês para outro).

5. **Privacidade no backend**: o blur é puramente front-end. Dados sensíveis são sempre transmitidos — a privacidade é apenas visual para evitar olhares.

6. **Ícones**: o protótipo usa SVG paths inline (ver `nami/ui.jsx` — objeto `ICONS`). No backend podem ser substituídos por uma biblioteca (Lucide, Heroicons, etc.) usando os mesmos nomes como referência.

7. **Categorias**: são entidades fixas no protótipo. No backend, podem ser fixas (seed) ou customizáveis por usuário.

8. **Empréstimos vs Financiamentos**: são entidades separadas. Empréstimos são informais entre pessoas (sem instituição financeira). Financiamentos têm credor, taxa de juros e são de instituições.
