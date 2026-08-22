# Guia de Design — Viagens (Yato) · fatia 066

Este documento é o **brief de design** da seção **Viagens** do app Makima. Serve para duas coisas:

1. **Gerar o protótipo hi-fi no Claude Design** — cole a **§13** (prompt pronto, auto-suficiente).
2. **Portar o protótipo para o React real** depois — as §§1–12 são a fonte de verdade visual e de
   comportamento, no mesmo porte dos guias da Marin (021) e da Mai (022).

> **Diferença em relação aos guias anteriores**: os guias da Akane/Marin/Mai foram escritos *depois*
> do protótipo, documentando o que já existia. Este vem **antes** — aqui as decisões são tomadas, não
> registradas. Se o Claude Design divergir num detalhe estético, tudo bem; se divergir nas **regras de
> veredito** (§2.3 e §4), está errado e precisa voltar.

> **Stack alvo**: React 19 + TypeScript + Vite 6. Padrão Shell do projeto: cada domínio em
> `webapp/frontend/src/pages/<domain>/`. Chamadas de API sempre via `yatoApi.ts` sobre `lib/api.ts`
> (nunca `fetch` direto). Tokens CSS escopados em `.yato-shell`. Rota em `App.tsx`:
> `<Route path="/travel/*" element={<YatoShell />} />` **antes** do catch-all `/*`.

---

## 1. Conceito visual — identidade do Yato

**Referência**: **Yato** (*Noragami*) — o deus errante sem templo, de moletom e cachecol azul-marinho,
que atende qualquer pedido por 5 ienes. Anda a pé, conhece atalho, dorme em qualquer canto, é
escandaloso e obcecado por economia — e, quando o assunto é sério, é o mais competente da sala.

**Direção aprovada**: **Caderno de bordo / dossiê**.

> Papel kraft, mapa topográfico tramado ao fundo, carimbos de veredito, tickets de ônibus destacáveis.
> Utilitário, denso, editorial — a estética de quem faz **pesquisa de campo** antes de embarcar, não
> de quem folheia catálogo de agência.

**Princípio central — a UI não vende destino, ela mostra grau de certeza.**

Todos os outros shells do Makima celebram um acervo: a Akane exibe pôster, a Mai exibe temporada, a
Frieren exibe capa. Este **não**. O usuário não tem medo de escolher a cidade errada; ele tem medo de
**chegar e não conseguir se locomover**. Então o herói visual aqui é o **veredito** — a informação de
quanto se sabe, e quão confiável é o que se sabe. Nada de foto bonita de pousada.

**Princípios concretos**:

- **Certeza tem cor própria.** Confirmado, ausente, inconclusivo e pendente têm cores fixas que
  **não** acompanham o acento (§2.3). É a única coisa que o usuário lê de relance.
- **Inconclusivo não é ruim.** Nunca vermelho, nunca ✗, nunca cinza-morto. É âmbar de "ainda em
  aberto". Metade do valor do agente está em não confundir *não sei* com *não tem*.
- **Densidade sobre respiro.** É um dossiê, não uma galeria. Linhas compactas, tabelas, muito dado
  por tela — o oposto da Mai.
- **Papel e carimbo.** Cards têm textura sutil de papel e borda de ticket (recorte serrilhado nas
  bordas de alguns componentes). Carimbo = veredito.
- **Emojis com parcimônia**: 🎒 (assinatura, sidebar), 🚌, 🛺, 🚶, 🗺️, ⛩️, 💴.
- **Voz da copy** — Yato falando: direta, orgulhosa, obcecada por economia ("cinco ienes!"), com
  senso de humor, mas **honesta sobre o que não sabe**. Estado vazio do dossiê não diz "nenhum dado";
  diz *"ainda não checamos nada dessa cidade. Vamos por partes."*

**Frase da sidebar** (manter exata):
> *"Só saio de casa quando sei como volto."*

---

## 2. Tokens OKLCH — escopo `.yato-shell`

Todos os tokens dentro de `.yato-shell { }`. **Escuro é o padrão**; claro sobrescreve em
`[data-theme='light']`. Acento trocável via `[data-accent]`. Densidade via `[data-density]`.

### 2.1 Superfícies, tinta e linhas (escuro base — "couro de caderno de campo")

```css
.yato-shell {
  /* superfícies */
  --paper:   oklch(0.14 0.014 250);   /* fundo principal — azul-tinta muito escuro */
  --paper-2: oklch(0.18 0.016 250);   /* sidebar, topbar */
  --card:    oklch(0.21 0.014 250);   /* cards, painéis */
  --card-2:  oklch(0.25 0.014 250);   /* hover, inputs, card interno */

  /* tinta */
  --ink:   oklch(0.94 0.010 90);      /* levemente quente — nanquim sobre papel */
  --ink-2: oklch(0.74 0.014 90);
  --ink-3: oklch(0.56 0.014 88);
  --ink-4: oklch(0.42 0.012 86);

  /* linhas */
  --line:   oklch(0.31 0.016 250);
  --line-2: oklch(0.25 0.014 250);
  --line-dash: oklch(0.36 0.018 250);  /* tracejado de ticket e de rota */

  /* sombras */
  --shadow-sm: 0 1px 2px oklch(0 0 0 / 0.45);
  --shadow-md: 0 3px 10px oklch(0 0 0 / 0.50);
  --shadow-lg: 0 16px 40px oklch(0 0 0 / 0.60);

  /* barras semi-transparentes */
  --topbar-bg:  oklch(0.18 0.016 250 / 0.86);
  --footbar-bg: oklch(0.18 0.016 250 / 0.94);
}
```

### 2.2 Papel kraft e textura de mapa

```css
.yato-shell {
  --kraft:      oklch(0.34 0.032 68);        /* papel kraft — cards de ticket/ema */
  --kraft-2:    oklch(0.40 0.036 68);        /* kraft claro, hover */
  --kraft-ink:  oklch(0.90 0.020 80);        /* tinta sobre kraft */
  --map-line:   oklch(0.30 0.018 250 / 0.55); /* curvas de nível do fundo */
  --grid-line:  oklch(0.28 0.014 250 / 0.35); /* malha milimetrada */
}
```

**Textura de fundo** (aplicar no `.yato-shell`, atrás de tudo, `pointer-events: none`):
duas camadas — uma malha milimetrada de 24px em `--grid-line` e curvas de nível topográficas
irregulares em `--map-line`, ambas em `opacity: 0.5`. No tema claro, subir para `opacity: 0.7`.
A textura **nunca** compete com o conteúdo: se algum texto ficar difícil de ler sobre ela, ela perde.

### 2.3 ⚠️ Cores de veredito — fixas, independentes do acento

**Esta é a regra mais importante do shell.** Não trocar com `[data-accent]`, não estilizar por
capricho, não reordenar semanticamente.

```css
.yato-shell {
  --verdict-ok:        oklch(0.72 0.15 152);   /* CONFIRMADO — verde */
  --verdict-ok-tint:   oklch(0.72 0.15 152 / 0.16);

  --verdict-none:      oklch(0.62 0.10 25);    /* AUSENTE — terracota dessaturado, NÃO vermelho-alarme */
  --verdict-none-tint: oklch(0.62 0.10 25 / 0.16);

  --verdict-unknown:      oklch(0.78 0.13 78);  /* INCONCLUSIVO — âmbar */
  --verdict-unknown-tint: oklch(0.78 0.13 78 / 0.16);

  --verdict-pending:      oklch(0.52 0.012 250); /* PENDENTE — neutro apagado */
  --verdict-pending-tint: oklch(0.52 0.012 250 / 0.14);
}
```

| Veredito | Cor | Símbolo | Leitura |
|---|---|---|---|
| `confirmado` | verde | ● preenchido | verifiquei e **existe** |
| `ausente` | terracota | ○ com traço | verifiquei e **não existe** |
| `inconclusivo` | âmbar | ◐ meio-preenchido | verifiquei e **não deu pra saber** |
| `pendente` | neutro | ○ vazio | **ainda não verifiquei** |

**Proibido**:
- pintar `inconclusivo` de vermelho, ou usar ✗ / ⚠️ / ícone de erro nele;
- usar a mesma cor para `ausente` e `inconclusivo`;
- renderizar `pendente` como se fosse `ausente` (o vazio não é resposta);
- deixar o veredito legível **só** pela cor — sempre acompanha símbolo + rótulo em texto
  (acessibilidade e daltonismo).

### 2.4 Acento — default azul-cachecol, 3 variantes via `[data-accent]`

```css
/* padrão de fábrica — azul-cachecol do Yato */
.yato-shell {
  --yato:        oklch(0.58 0.14 250);
  --yato-deep:   oklch(0.74 0.13 250);   /* texto-acento sobre escuro */
  --yato-bright: oklch(0.82 0.11 250);
  --yato-tint:   oklch(0.58 0.14 250 / 0.16);
  --yato-tint-2: oklch(0.58 0.14 250 / 0.30);
  --accent-h: 250;
}

/* ouro — a moeda de 5 ienes */
.yato-shell[data-accent='ouro'] {
  --yato: oklch(0.72 0.13 85); --yato-deep: oklch(0.82 0.12 86); --yato-bright: oklch(0.88 0.10 86);
  --yato-tint: oklch(0.72 0.13 85 / 0.16); --yato-tint-2: oklch(0.72 0.13 85 / 0.30);
  --accent-h: 85;
}

/* carmim — o manto de Yato / o vermelho de santuário */
.yato-shell[data-accent='carmim'] {
  --yato: oklch(0.58 0.18 22); --yato-deep: oklch(0.72 0.16 24); --yato-bright: oklch(0.80 0.14 24);
  --yato-tint: oklch(0.58 0.18 22 / 0.16); --yato-tint-2: oklch(0.58 0.18 22 / 0.30);
  --accent-h: 22;
}

/* musgo — estrada de terra */
.yato-shell[data-accent='musgo'] {
  --yato: oklch(0.58 0.10 145); --yato-deep: oklch(0.72 0.10 146); --yato-bright: oklch(0.80 0.09 146);
  --yato-tint: oklch(0.58 0.10 145 / 0.16); --yato-tint-2: oklch(0.58 0.10 145 / 0.30);
  --accent-h: 145;
}
```

`[data-accent]` **sem valor** = azul-cachecol (não escrever `data-accent="azul"`).

### 2.5 Perfil da viagem e categorias de orçamento

```css
.yato-shell {
  /* perfil orçamento × conforto — usado em chips e na régua ANTT */
  --profile-eco:   oklch(0.70 0.13 145);   /* economia */
  --profile-mid:   oklch(0.74 0.12 85);    /* equilibrado */
  --profile-lux:   oklch(0.72 0.12 300);   /* conforto */

  /* orçamento */
  --budget-ok:     oklch(0.70 0.12 152);   /* dentro do estimado */
  --budget-warn:   oklch(0.78 0.13 78);    /* 80–100% do estimado */
  --budget-over:   oklch(0.64 0.17 22);    /* estourou */
  --budget-track:  oklch(0.30 0.014 250);  /* trilho da barra */
}
```

### 2.6 Tema claro `[data-theme='light']` — "caderno aberto na mesa"

```css
.yato-shell[data-theme='light'] {
  --paper:   oklch(0.96 0.010 85);    /* papel creme */
  --paper-2: oklch(0.93 0.014 82);
  --card:    oklch(0.99 0.006 85);
  --card-2:  oklch(0.95 0.010 84);

  --ink:   oklch(0.24 0.020 250);
  --ink-2: oklch(0.42 0.018 250);
  --ink-3: oklch(0.56 0.016 250);
  --ink-4: oklch(0.70 0.012 250);

  --line:   oklch(0.86 0.014 84);
  --line-2: oklch(0.91 0.010 84);
  --line-dash: oklch(0.78 0.018 84);

  --kraft:     oklch(0.86 0.045 70);
  --kraft-2:   oklch(0.90 0.038 70);
  --kraft-ink: oklch(0.30 0.030 60);

  --map-line:  oklch(0.72 0.020 250 / 0.45);
  --grid-line: oklch(0.80 0.014 250 / 0.40);

  /* vereditos escurecem para manter contraste sobre papel claro */
  --verdict-ok:      oklch(0.52 0.15 152);
  --verdict-none:    oklch(0.50 0.12 25);
  --verdict-unknown: oklch(0.58 0.14 72);
  --verdict-pending: oklch(0.62 0.010 250);

  --shadow-sm: 0 1px 2px oklch(0 0 0 / 0.10);
  --shadow-md: 0 3px 10px oklch(0 0 0 / 0.12);
  --shadow-lg: 0 16px 40px oklch(0 0 0 / 0.16);
}
```

### 2.7 Tipografia

| Papel | Família | Uso |
|---|---|---|
| Display | **Bitter** (serifada com peso de máquina de escrever) | títulos de tela, nome da cidade, hero |
| Texto | **Inter** | corpo, labels, botões |
| Mono | **JetBrains Mono** | datas, horários, valores, códigos de veredito, coordenadas, número de linha de ônibus |
| Carimbo | **Bitter 700 + `letter-spacing: 0.14em` + `text-transform: uppercase`** | rótulo dos vereditos |

Importar do Google Fonts. Escala: display 30/24/19px · corpo 15/13.5px · micro 11.5px · mono 12.5px.

### 2.8 Raios, densidade e ticket

```css
.yato-shell {
  --r-sm: 4px;  --r-md: 8px;  --r-lg: 12px;  --r-pill: 999px;
  --gap: 14px;
  --day-col-w: 300px;   /* largura da coluna de dia no roteiro */
}
.yato-shell[data-density='compact'] { --gap: 9px;  --day-col-w: 244px; }
.yato-shell[data-density='large']   { --gap: 20px; --day-col-w: 356px; }
```

**Borda de ticket** (para `TripCard` e `AppSuggestionCard`): recorte serrilhado nas laterais,
via `mask-image` com `radial-gradient` repetido de 7px, mais uma linha vertical tracejada
(`--line-dash`) separando o "canhoto" do corpo do card.

---

## 3. Layout do Shell (`.yato-shell`)

Herda a estrutura dos demais shells (ver `webapp/docs/FRONTEND.md` §"Os nove shells"):

```
┌──────────┬──────────────────────────────────────────────────────┐
│          │  TOPBAR  busca · viagem ativa · progresso protocolo  │
│ SIDEBAR  ├──────────────────────────────────────────────────────┤
│  220px   │                                                      │
│          │  CONTEÚDO (scroll próprio, max-width 1180px)          │
│  🎒 YATO │                                                      │
│  nav     │                                                      │
│  frase   │                                                      │
│  [+ Nova ├──────────────────────────────────────────────────────┤
│   viagem]│  FOOTBAR  próxima pendência do checklist · tweaks     │
└──────────┴──────────────────────────────────────────────────────┘
```

### Sidebar (`.yato-side`) — 220px

Marca `🎒 YATO` + subtítulo "viagens". Nav: **Início · Viagens · Roteiro · Mobilidade · Orçamento ·
Checklist**. Cada item com contador à direita quando aplicável (nº de viagens, passos pendentes do
protocolo, itens de checklist abertos). Rodapé: a frase da §1 em itálico + botão primário
**"+ Nova viagem"**.

Quando há **viagem ativa** (status `confirmada` ou `em_curso`), a sidebar mostra abaixo da marca um
mini-card kraft com cidade/UF, datas e contagem regressiva ("faltam 12 dias").

### Topbar (`.yato-topbar`) — 56px, sticky, semi-transparente com `backdrop-filter: blur(10px)`

Busca à esquerda (`Buscar viagem, cidade…`), seletor de viagem ativa no centro e, à direita, a
**barra de progresso do protocolo** da cidade ativa: 7 segmentos, cada um pintado com a cor do seu
veredito, mais o texto `4/7 checados`. Clicar leva ao Dossiê.

### Footbar (`.footbar`) — 44px

Esquerda: próxima pendência do checklist ("⬜ instalar 99 · Tiradentes"). Direita: engrenagem que
abre o `TweaksPanel`.

---

## 4. ⭐ Componente-assinatura: `MobilityDossier`

É para este shell o que o `SeasonAccordion` é para a Mai — **não existe em nenhum outro lugar do
app**, e é a razão de a seção existir. Renderiza os 7 passos do protocolo como uma coluna de
carimbos verticais.

```
┌───────────────────────────────────────────────────────────────────────┐
│  DOSSIÊ DE MOBILIDADE · TIRADENTES/MG        checado em 14/08/2026    │
│  cidade pequena · 7.500 hab                             ▓▓▓▓▓▓░ 6/7   │
├───────────────────────────────────────────────────────────────────────┤
│ ●  1 · PORTE DA CIDADE            ┃ CONFIRMADO   │ 14/08 · MUNIC/IBGE │
│    Cidade pequena. Base estatística: 51% dos municípios não têm       │
│    ônibus urbano; apps chegam a 26%. Expectativa: táxi/mototáxi sim,  │
│    ônibus urbano provavelmente não.                                   │
├───────────────────────────────────────────────────────────────────────┤
│ ○  2 · UBER                       ┃ AUSENTE      │ 14/08 · simulação  │
│    Simulei corrida com endereço real: nenhum carro disponível.        │
├───────────────────────────────────────────────────────────────────────┤
│ ●  3 · 99                         ┃ CONFIRMADO   │ 14/08 · simulação  │
│    Apareceram carros na simulação in-app. 99Pop e 99Táxi.             │
├───────────────────────────────────────────────────────────────────────┤
│ ◐  4 · INDRIVE                    ┃ INCONCLUSIVO │ 14/08 · lista ofic.│
│    Cidade não aparece na lista do app, mas o InDrive mira cidades     │
│    desse porte. Refazer a simulação mais perto da viagem.             │
├───────────────────────────────────────────────────────────────────────┤
│ ◐  5 · TRANSPORTE PÚBLICO         ┃ INCONCLUSIVO │ 14/08 · Google Maps│
│    Sem rotas no Maps/Moovit — mas só ~150 cidades brasileiras estão   │
│    mapeadas. Ausência de dado NÃO prova ausência de ônibus.           │
├───────────────────────────────────────────────────────────────────────┤
│ ●  6 · TRANSFER DA HOSPEDAGEM     ┃ CONFIRMADO   │ 15/08 · WhatsApp   │
│    Pousada faz transfer da rodoviária por R$ 40 e organiza passeios.  │
├───────────────────────────────────────────────────────────────────────┤
│ ○  7 · DESLOCAMENTOS              ┃ PENDENTE     │  —   [ Checar → ]  │
│    Medir hospedagem → cada ponto do roteiro (a pé / carro / ônibus).  │
├───────────────────────────────────────────────────────────────────────┤
│  ESTRATÉGIA RECOMENDADA:  🚶 caminhável + 🛺 transfer da pousada      │
│  Falta 1 passo. Com 99 confirmado, há plano B para chuva/noite.       │
└───────────────────────────────────────────────────────────────────────┘
```

**Anatomia de cada linha** (grid `20px 1fr 132px 150px`):

1. **Marcador de veredito** — o símbolo da §2.3, na cor do veredito.
2. **Número + nome do passo** em Bitter 600 uppercase; abaixo, a **evidência** em corpo `--ink-2`.
   Se `pendente`, o corpo mostra a **instrução operacional** do passo (o que o usuário deve fazer),
   não uma evidência vazia.
3. **Carimbo do veredito** — pill com borda 1.5px na cor do veredito, fundo `-tint`, rótulo em
   fonte de carimbo. Levemente rotacionado (`transform: rotate(-1.5deg)`) para parecer estampado.
4. **Data + fonte** em mono `--ink-3`; se `pendente`, botão `[ Checar → ]` que abre o
   **Wizard do Protocolo** naquele passo.

**Cabeçalho**: cidade/UF em display, porte da cidade, data da última checagem e a barra de 7
segmentos. Se a última checagem tiver mais de 180 dias, um tarja âmbar atravessa o cabeçalho:
*"dossiê com mais de 6 meses — revalidar antes de viajar"*.

**Rodapé**: estratégia consolidada (um dos 6 valores: caminhável / transporte público / app de
corrida / táxi-mototáxi / transfer da hospedagem / carro alugado), mais uma frase de leitura do
Yato e a contagem de passos que ainda faltam. **Se algum passo está `pendente`, o rodapé diz isso
explicitamente** e nunca apresenta a estratégia como definitiva.

**Caso especial — escala pedonal**: cidades como Jericoacoara/CE e Caraíva/BA podem ter o dossiê
fechado como *"escala pedonal — mobilidade motorizada não se aplica"*. Nesse estado, os passos 2–5
aparecem colapsados sob um resumo, com o selo `N/A` neutro (não `ausente`).

**Regras inegociáveis** (FR-009, FR-010, FR-011 da `spec.md`):
- Nunca mostrar os 7 passos como formulário único a preencher de uma vez — o wizard vai um a um.
- Ausência de dado renderiza `inconclusivo`, jamais `ausente`.
- Nenhum texto da UI pode afirmar "tem Uber aqui" sem o passo estar `confirmado`.

---

## 5. Demais componentes

### 5.1 `VerdictChip`

Pill com símbolo + rótulo, nas 4 cores da §2.3. Tamanhos `sm` (linha de tabela) e `md` (dossiê,
com rotação de carimbo). Sempre com rótulo textual — nunca só a cor.

### 5.2 `TripCard`

Card de ticket kraft com canhoto serrilhado à esquerda. Conteúdo: cidade/UF em display, intervalo
de datas em mono, chip de perfil (`economia` / `equilibrado` / `conforto` nas cores da §2.5), chip
de status, e duas métricas no canhoto — **dias de viagem** e **prontidão** (barra de 7 segmentos do
protocolo, em miniatura). Para viagem futura, contagem regressiva. Viagem `cancelada` fica
dessaturada (`filter: saturate(0.4)`) com uma tarja diagonal `CANCELADA`.

### 5.3 `DayColumn` + `ItineraryItem`

O roteiro é um **board horizontal de colunas por dia** (`--day-col-w` cada, scroll-x). Cada coluna:
cabeçalho com o dia da semana + data em mono + custo estimado somado do dia; dentro, três faixas
fixas — **manhã · tarde · noite** — separadas por linha tracejada. Faixa vazia mostra placeholder
discreto (`+ adicionar`).

`ItineraryItem`: título, horário em mono **se houver** (senão nada — não inventar horário), endereço
em `--ink-3`, custo estimado à direita, e um **ícone circular do modal de deslocamento** na borda
esquerda (🚶 a pé · 🚌 transporte público · 🚗 app · 🚕 táxi · 🛺 mototáxi · 🚐 transfer · • outro).
Entre dois itens consecutivos, uma **linha vertical tracejada** com o ícone do modal do item
seguinte — a "costura" da rota do dia.

### 5.4 `AppSuggestionCard`

Ticket kraft pequeno: nome do app, tipo (app de corrida / transporte público / táxi), abrangência
declarada e link. **Selo permanente e obrigatório** no rodapé do card, em âmbar:
`⚑ cobertura declarada — confirmar in-app`. Este selo não é opcional e não pode ser removido nem
quando o app é a Uber ou a 99 (FR-015).

### 5.5 `ComfortMatrix`

Régua horizontal com as 5 categorias ANTT em ordem: `convencional → executivo → semi-leito → leito →
leito-cama`. Cada degrau mostra a inclinação aproximada do assento como um pequeno diagrama de
poltrona inclinada. A categoria **recomendada** ganha destaque de acento + um balão com a
justificativa ("11h em período noturno: convencional anula seu dia seguinte"). Categorias abaixo da
recomendada ficam esmaecidas; acima, disponíveis mas neutras. Abaixo da régua, a **fila de ROI de
upgrades** como lista numerada (transfer privativo → hospedagem → passeio privativo → executiva
doméstica), reordenada conforme o dossiê.

### 5.6 `BudgetBar`

Uma linha por categoria: rótulo, barra empilhada (realizado sobre trilho do estimado), valores em
mono à direita (`R$ 340 / R$ 400`). Cores: `--budget-ok` até 80%, `--budget-warn` de 80 a 100%,
`--budget-over` acima — e nesse caso a barra ultrapassa o trilho visivelmente, com o excedente
hachurado. Total no topo, em display.

### 5.7 `ChecklistRow`

Checkbox quadrado estilo carimbo (marcado = carimbo de tinta, não ✓ genérico), rótulo, e um chip
discreto de origem: `do dossiê` (acento) ou `manual` (neutro). Itens vindos do dossiê carregam
tooltip com o passo que os gerou.

### 5.8 `Icon`

SVG inline, stroke 1.6px, `currentColor`, 24×24 viewBox. Set mínimo: mochila, ônibus, mototáxi,
carro, pedestre, mapa, carimbo, moeda, calendário, relógio, cifrão, check, meio-círculo, círculo
vazio, chevron, busca, engrenagem, plus, alerta.

---

## 6. As 6 telas

### 6.1 Início (`home`)

Hero em kraft com a **próxima viagem**: cidade/UF em display grande, datas, contagem regressiva,
perfil. À direita do hero, o **medidor de prontidão**: os 7 segmentos do protocolo em grande +
percentual do checklist + "faltam X dias".

Abaixo, em grid de 3 colunas:
- **Estratégia de mobilidade** do destino (resumo do dossiê, com botão "abrir dossiê");
- **Orçamento** (barra total estimado × realizado);
- **Próximas pendências** do checklist (até 5 linhas).

Rodapé da tela: faixa horizontal com as **próximas viagens** (TripCards) e um bloco de "linha do
tempo do dia 1" — os itens de roteiro do primeiro dia, para dar a sensação de que a viagem já
começou.

**Estado vazio**: ilustração leve de mochila + "Nenhuma viagem no horizonte. Cinco ienes e eu te
levo pra qualquer lugar." + botão "+ Nova viagem".

### 6.2 Viagens (`trips`)

Lista/grid de `TripCard`, com chips de filtro por status (todas · planejando · confirmada · em curso
· concluída · cancelada) e ordenação (data de ida · criada · prontidão · orçamento). Alternância
grid ⇄ lista. Na lista, colunas: cidade/UF, datas, perfil, prontidão (7 segmentos mini), orçamento,
status.

### 6.3 Detalhe + Roteiro (`trip`) — a tela mais densa

Topo: cabeçalho da viagem (cidade em display, datas editáveis, perfil, status) com 4 KPIs em mono —
dias, itens de roteiro, prontidão, orçamento. À direita, um **resumo do dossiê em 7 pontinhos**
clicável.

Corpo: o **board de dias** (§5.3), scroll horizontal, com botão `+` em cada faixa de período.

Rodapé da tela: a `ComfortMatrix` do trecho de ida/volta, se houver duração informada.

**Estado importante**: se as datas mudarem e sobrarem itens fora do novo intervalo, aparece uma
faixa âmbar no topo — *"3 itens ficaram fora das novas datas"* — com as ações **mover** ou
**remover**. Nunca sumir com o item calado (FR-005).

### 6.4 Dossiê de Mobilidade (`mobility`)

Duas colunas: à esquerda, o `MobilityDossier` completo (§4); à direita, uma coluna de 320px com
- **estratégia recomendada** em destaque;
- **apps sugeridos** (`AppSuggestionCard`) para a UF do destino;
- **contatos locais** salvos (cooperativa de táxi, mototáxi, pousada) em cards mono.

**Estado vazio** (cidade sem dossiê): card central com a estatística macro do research
("51% dos municípios não têm ônibus urbano") e o botão grande **"Iniciar protocolo"**, que abre o
wizard no passo 1.

### 6.5 Orçamento (`budget`)

Topo: 3 números grandes — estimado, realizado, saldo — com o saldo em `--budget-over` se negativo.
Corpo: uma `BudgetBar` por categoria (transporte ida · transporte volta · hospedagem · alimentação ·
mobilidade local · passeios · outros). Abaixo, a **lista de gastos** em tabela mono (data, categoria,
descrição, valor), cada linha com um selo discreto `→ Nami` indicando que já foi lançada nas
finanças. Botão primário: **"Registrar gasto"**.

### 6.6 Checklist (`checklist`)

Lista agrupada por categoria (antes de comprar · antes de embarcar · na chegada), com barra de
progresso no topo. Itens gerados do dossiê aparecem primeiro, com o chip `do dossiê`. Campo de
adição rápida ao final de cada grupo. Um botão secundário **"Regerar do dossiê"** acrescenta itens
novos sem duplicar nem apagar os manuais.

---

## 7. Modais

### 7.1 `NewTripModal`
Cidade + UF (UF é `<select>` obrigatório — evita a ambiguidade de cidades homônimas), datas de ida e
volta, perfil (3 botões segmentados), título opcional. Validação visível: volta ≥ ida, intervalo ≤ 60
dias. Ao salvar com uma cidade que já tem dossiê, mostrar aviso positivo: *"já temos dossiê de
Tiradentes/MG, checado em 14/08"*.

### 7.2 `NewItemModal`
Dia (`<select>` com os dias da viagem), período (3 botões), horário opcional, título, endereço,
modal de deslocamento (ícones selecionáveis), custo estimado. Atalho `⌘/Ctrl+Enter` salva.

### 7.3 `LogExpenseModal`
Categoria, valor, descrição, data. **Aviso explícito e permanente** no rodapé:
*"lança na Nami no ato — uma despesa por gasto"*. Se o lançamento falhar, o modal informa que
**nada foi salvo dos dois lados** (FR-021).

### 7.4 ⭐ `ProtocolWizard` — um passo por vez
Modal alto, um passo por vez, com: número do passo, nome, **instrução operacional** em destaque
(o que fazer, literalmente), campo de evidência (texto livre), seletor de fonte (simulação in-app ·
página oficial · Google Maps · Moovit · contato com hospedagem · relato local · outro) e os botões de
veredito — **Confirmado · Ausente · Inconclusivo · Pular por ora**.

O botão `Inconclusivo` tem o mesmo peso visual dos outros dois: registrar dúvida é resultado
legítimo, não desistência. Rodapé: `passo 4 de 7` + navegação ‹ ›. Fechar no meio mantém o dossiê
parcial e retomável.

### 7.5 `Toast`
Pill no canto inferior direito, 2.8s, fundo com gradiente de acento.

---

## 8. Tweaks (preferências client-only)

Persistidos em `localStorage` sob a chave `yato-tweaks`, aplicados como `data-*` no `.yato-shell`.

| Key | Opções | Default | Aplica |
|---|---|---|---|
| `tema` | Escuro / Claro | Escuro | `data-theme='light'` |
| `acento` | Azul-cachecol / Ouro / Carmim / Musgo | Azul-cachecol | `data-accent='ouro\|carmim\|musgo'` |
| `densidade` | Grande / Médio / Compacto | Médio | `data-density='large\|medium\|compact'` |
| `textura` | Ligada / Desligada | Ligada | esconde a malha + curvas de nível |
| `ordenacao` | Data de ida / Criada / Prontidão / Orçamento | Data de ida | prop `sort` na tela Viagens |

---

## 9. Contrato de dados por tela

Rotas sob `/api/travel/*` (router `webapp/backend/routers/travel.py`, fachada fina sobre
`agents/yato/tools.py`). Os shapes formais virão em `specs/066-travel-agent/contracts/` quando o
`/speckit.plan` rodar; até lá, **este guia é a referência**.

| Tela | Endpoints |
|---|---|
| Início | `GET /api/travel/trips?status=confirmada,em_curso&limit=1` + `GET /api/travel/trips/{id}/readiness` + `GET /api/travel/trips/{id}/budget` + `GET /api/travel/trips/{id}/checklist?done=false&limit=5` |
| Viagens | `GET /api/travel/trips` (params: `status`, `sort`, `limit`) |
| Detalhe + Roteiro | `GET /api/travel/trips/{id}` + `GET /api/travel/trips/{id}/itinerary` |
| Dossiê | `GET /api/travel/dossiers/{uf}/{city}` + `GET /api/travel/apps?uf={uf}` |
| Orçamento | `GET /api/travel/trips/{id}/budget` + `GET /api/travel/trips/{id}/expenses` |
| Checklist | `GET /api/travel/trips/{id}/checklist` |
| Criar viagem | `POST /api/travel/trips` |
| Alterar viagem | `PATCH /api/travel/trips/{id}` (datas, status, perfil) |
| Item de roteiro | `POST /api/travel/trips/{id}/itinerary` · `PATCH`/`DELETE /api/travel/itinerary/{item_id}` |
| Passo do protocolo | `PUT /api/travel/dossiers/{uf}/{city}/checks/{check_key}` |
| Estratégia consolidada | `GET /api/travel/dossiers/{uf}/{city}/strategy` |
| Matriz de conforto | `GET /api/travel/comfort?hours={h}&night={bool}&profile={p}` |
| Registrar gasto | `POST /api/travel/trips/{id}/expenses` (lança na Nami na mesma transação) |
| Orçamento estimado | `PUT /api/travel/trips/{id}/budget` |
| Checklist | `POST /api/travel/trips/{id}/checklist` · `PATCH /api/travel/checklist/{item_id}` · `POST /api/travel/trips/{id}/checklist/regenerate` |

**Shapes-chave** (o protótipo pode usá-los como mock direto):

```ts
type Verdict = 'confirmado' | 'ausente' | 'inconclusivo' | 'pendente';
type CheckKey = 'porte_cidade' | 'uber' | '99' | 'indrive'
              | 'transporte_publico' | 'hospedagem_transfer' | 'deslocamentos';

interface Trip {
  id: string; title: string | null;
  city: string; state_uf: string;
  start_date: string; end_date: string;          // YYYY-MM-DD, sempre UTC-3
  profile: 'economia' | 'equilibrado' | 'conforto';
  status: 'planejando' | 'confirmada' | 'em_curso' | 'concluida' | 'cancelada';
  notes: string | null;
}

interface ItineraryItem {
  id: string; trip_id: string;
  day_date: string; period: 'manha' | 'tarde' | 'noite';
  start_time: string | null;                      // HH:MM ou null — não inventar
  title: string; address: string | null;
  transport_mode: 'a_pe' | 'transporte_publico' | 'app_corrida'
                | 'taxi' | 'mototaxi' | 'transfer' | 'outro' | null;
  cost_estimate: number | null; position: number;
}

interface MobilityCheck {
  check_key: CheckKey; verdict: Verdict;
  source: 'simulacao_in_app' | 'pagina_oficial' | 'google_maps' | 'moovit'
        | 'contato_hospedagem' | 'relato_local' | 'outro' | null;
  evidence: string | null; checked_at: string | null;
}

interface MobilityDossier {
  city: string; state_uf: string;
  city_size: 'capital' | 'media' | 'pequena';
  pedestrian_scale: boolean;
  checks: MobilityCheck[];                        // sempre os 7, em ordem
  strategy: 'caminhavel' | 'transporte_publico' | 'app_corrida'
          | 'taxi_mototaxi' | 'transfer_hospedagem' | 'carro_alugado' | null;
  pending_count: number; stale: boolean;          // stale = > 180 dias
  summary: string | null; last_checked_at: string | null;
}

interface BudgetItem {
  category: 'transporte_ida' | 'transporte_volta' | 'hospedagem' | 'alimentacao'
          | 'mobilidade_local' | 'passeios' | 'outros';
  estimated: number; actual: number;
}
```

---

## 10. Regras do projeto (não violar)

1. **Nunca `fetch` direto** — sempre via `yatoApi.ts` (sobre `lib/api.ts`).
2. **CSS escopado em `.yato-shell`** — zero vazamento para outros shells.
3. **Rota antes do catch-all** em `App.tsx`: `<Route path="/travel/*" element={<YatoShell />} />`
   antes do `/*` (o path é em inglês, como `/series`, `/movies`, `/people`).
4. **Sem lógica de domínio no front** — a matriz ANTT, a consolidação da estratégia e a validação de
   datas vivem no backend (`agents/yato/`). O front só renderiza o que vier.
5. **Cores de veredito são fixas** (§2.3) e não mudam com `[data-accent]`.
6. **`inconclusivo` nunca é vermelho** e nunca usa ícone de erro.
7. **Veredito nunca é comunicado só por cor** — sempre símbolo + rótulo textual.
8. **Selo "confirmar in-app"** é obrigatório em todo `AppSuggestionCard` (FR-015).
9. **Datas em UTC-3** — usar `todayLocalISO()` de `webapp/frontend/src/pages/violet/dateUtils.ts`.
   Proibido `new Date().toISOString().slice(0,10)`.
10. **Rotas fixas antes das paramétricas** no router FastAPI (`/apps`, `/comfort` antes de
    `/trips/{id}`), e `require_user` em todas as rotas `/api/travel/*`.
11. **`[data-accent]` sem valor** = azul-cachecol (não `data-accent="azul"`).
12. **Horário é opcional** no roteiro — se `start_time` é `null`, não renderizar horário nenhum.

---

## 11. Entregáveis esperados do porte

```
webapp/frontend/src/pages/yato/
├── YatoShell.tsx              # shell root: sidebar + topbar + router interno + footbar
├── yatoApi.ts                 # client: todos os endpoints /api/travel/*
├── types.ts                   # Trip, ItineraryItem, MobilityDossier, MobilityCheck, BudgetItem…
├── yato.css                   # tokens OKLCH em .yato-shell + tema claro + 4 acentos + densidade
├── TweaksPanel.tsx
├── screens/
│   ├── HomeScreen.tsx         # Início (hero + prontidão + 3 painéis + próximas viagens)
│   ├── TripsScreen.tsx        # Viagens (grid ⇄ lista + filtros + ordenação)
│   ├── TripDetailScreen.tsx   # Detalhe + board de dias
│   ├── MobilityScreen.tsx     # Dossiê + apps + contatos
│   ├── BudgetScreen.tsx       # Orçamento + lista de gastos
│   └── ChecklistScreen.tsx    # Checklist agrupado
├── components/
│   ├── MobilityDossier.tsx    # ⭐ exclusivo — os 7 carimbos + estratégia
│   ├── VerdictChip.tsx
│   ├── TripCard.tsx           # ticket kraft com canhoto serrilhado
│   ├── DayColumn.tsx
│   ├── ItineraryItem.tsx
│   ├── AppSuggestionCard.tsx  # com selo "confirmar in-app"
│   ├── ComfortMatrix.tsx      # régua ANTT + fila de ROI
│   ├── BudgetBar.tsx
│   ├── ChecklistRow.tsx
│   ├── ReadinessMeter.tsx     # os 7 segmentos, 3 tamanhos
│   └── Icon.tsx
├── modals/
│   ├── NewTripModal.tsx
│   ├── NewItemModal.tsx
│   ├── LogExpenseModal.tsx
│   └── ProtocolWizard.tsx     # ⭐ um passo por vez
└── ui/
    └── Toast.tsx
```

**Backend**: `webapp/backend/routers/travel.py` — fachada fina sobre `agents/yato/tools.py`,
registrado em `webapp/backend/main.py` **antes** do catch-all do SPA:

```python
from webapp.backend.routers import travel as travel_router
app.include_router(travel_router.router, prefix="/api/travel", tags=["travel"])
```

**`Layout.tsx`** (array `DOMAINS`) — acrescentar:

```tsx
{
  // Yato · Viagens — roteiros solo, dossiê de mobilidade e orçamento (spec 066)
  character:   'Yato',
  label:       'Viagens',
  mainPath:    '/travel',
  activePaths: ['/travel'],
  color:       'var(--c-yato)',
  colorDim:    'var(--c-yato-dim)',
}
```

**`index.css`** (`:root`) — acrescentar:

```css
--c-yato:     #4a6fa5;   /* Yato — azul-cachecol (viagens, spec 066) */
--c-yato-dim: #17202f;   /* Yato dim — azul profundo para background de badge */
```

---

## 12. Checklist de entrega

- [ ] Tokens OKLCH completos em `.yato-shell` (§2), sem vazamento para outros shells.
- [ ] Tema claro + 4 acentos + 3 densidades funcionando via `data-*`.
- [ ] Cores de veredito fixas, **independentes** do acento, com símbolo + rótulo textual.
- [ ] `inconclusivo` em âmbar em todos os estados — nenhum vermelho, nenhum ✗.
- [ ] Textura de mapa/malha atrás do conteúdo, desligável pelo tweak, sem prejudicar leitura.
- [ ] Fontes Bitter + Inter + JetBrains Mono importadas do Google Fonts.
- [ ] As 6 telas renderizando (Início, Viagens, Detalhe+Roteiro, Dossiê, Orçamento, Checklist).
- [ ] `MobilityDossier` com os 7 passos, carimbo rotacionado, evidência/instrução, rodapé de
      estratégia e contagem de pendentes.
- [ ] Tarja de dossiê desatualizado (>180 dias) no cabeçalho.
- [ ] Estado "escala pedonal" colapsando os passos 2–5 com selo `N/A` neutro.
- [ ] `ProtocolWizard` um passo por vez, com `Inconclusivo` no mesmo peso visual dos demais.
- [ ] `TripCard` com canhoto serrilhado, chip de perfil, prontidão em miniatura e tarja de cancelada.
- [ ] Board de dias com as 3 faixas de período, costura tracejada e horário só quando existir.
- [ ] Faixa de itens órfãos ao mudar datas, com ações mover/remover.
- [ ] `AppSuggestionCard` sempre com o selo "cobertura declarada — confirmar in-app".
- [ ] `ComfortMatrix` com as 5 classes ANTT, recomendação destacada e fila de ROI.
- [ ] `BudgetBar` com os 3 estados de cor e excedente hachurado.
- [ ] `LogExpenseModal` avisando que lança na Nami no ato.
- [ ] Sidebar colapsa para 64px `<900px`; board de dias vira coluna única `<720px`.
- [ ] Rota `/travel/*` em `App.tsx` antes do `/*` catch-all.
- [ ] Entry `Yato` em `Layout.tsx` + `--c-yato` / `--c-yato-dim` em `index.css`.

---

## 13. Prompt pronto para o Claude Design

> Copie tudo abaixo da linha e cole no Claude Design. É auto-suficiente — não depende deste repo.

---

Crie um protótipo hi-fi (HTML + CSS + React via Babel no browser, dados mock em memória) da seção
**Viagens** de um app pessoal de gestão de vida chamado **Makima**, onde cada seção é "curada" por
uma personagem de anime. Esta seção é curada pelo **Yato** (de *Noragami*) — o deus errante sem
templo, de moletom e cachecol azul-marinho, que atende qualquer pedido por 5 ienes: anda a pé,
conhece atalho, é escandaloso e obcecado por economia, e extremamente competente quando o assunto é
sério.

**O problema que a seção resolve.** O usuário viaja **sozinho, sem carro, para cidades pequenas e
médias do interior do Brasil**. O medo dele não é escolher a cidade errada — é **chegar e não
conseguir se locomover**. No Brasil, 51% dos municípios (2.867) não têm nenhum ônibus urbano, e apps
de corrida chegam a apenas 26% (1.465). Pior: os números de cobertura divergem violentamente por
fonte, então nada pode ser afirmado sem verificação.

**Princípio central do design: a UI não vende destino, ela mostra grau de certeza.** Nada de foto
bonita de pousada. O herói visual é o **veredito** — o quanto se sabe e quão confiável é.

**Direção visual: "caderno de bordo / dossiê".** Papel kraft, mapa topográfico tramado ao fundo
(malha milimetrada + curvas de nível, sutis), carimbos de veredito levemente rotacionados, cards com
borda serrilhada de ticket de ônibus. Utilitário, denso, editorial — estética de pesquisa de campo.
Escuro por padrão, com tema claro ("caderno aberto na mesa"). Tipografia: **Bitter** (display,
serifada com peso de máquina de escrever), **Inter** (texto), **JetBrains Mono** (datas, valores,
códigos).

**Paleta (OKLCH, escopada em `.yato-shell`)**
- Fundo escuro azul-tinta: `oklch(0.14 0.014 250)`; superfícies `0.18` / `0.21` / `0.25`.
- Tinta levemente quente: `oklch(0.94 0.010 90)` e degraus até `oklch(0.42 0.012 86)`.
- Papel kraft dos tickets: `oklch(0.34 0.032 68)`.
- Acento padrão azul-cachecol: `oklch(0.58 0.14 250)`. Variantes trocáveis: ouro
  `oklch(0.72 0.13 85)`, carmim `oklch(0.58 0.18 22)`, musgo `oklch(0.58 0.10 145)`.

**⚠️ Cores de veredito — FIXAS, não mudam com o acento. Esta é a regra mais importante:**
- `CONFIRMADO` = verde `oklch(0.72 0.15 152)`, símbolo ● — "verifiquei e existe"
- `AUSENTE` = terracota dessaturado `oklch(0.62 0.10 25)`, símbolo ○ com traço — "verifiquei e não existe"
- `INCONCLUSIVO` = âmbar `oklch(0.78 0.13 78)`, símbolo ◐ — "verifiquei e não deu pra saber"
- `PENDENTE` = neutro apagado `oklch(0.52 0.012 250)`, símbolo ○ vazio — "ainda não verifiquei"

**Proibido**: pintar `inconclusivo` de vermelho ou dar a ele ícone de erro/alerta; usar a mesma cor
para `ausente` e `inconclusivo`; comunicar veredito só pela cor (sempre símbolo + rótulo em texto).
*Não saber* é um resultado legítimo e precisa parecer legítimo.

**Componente-assinatura: o `MobilityDossier`.** É o coração da seção e não deve existir nada parecido
em nenhuma outra tela. Renderiza um protocolo fixo de **7 passos** para descobrir como se locomover
numa cidade, como uma coluna vertical de carimbos:

1. **Porte da cidade** — calibra a expectativa estatística
2. **Uber** — checar a lista oficial e depois **simular uma corrida no app com um endereço real**
3. **99** — mesma coisa: página oficial + simulação in-app
4. **InDrive** — buscar a cidade dentro do app (costuma ser a melhor aposta no interior)
5. **Transporte público** — Google Maps / Moovit mostram rotas de ônibus?
6. **Transfer da hospedagem** — perguntar à pousada por WhatsApp: tem transfer? como os hóspedes se
   locomovem? tem táxi/mototáxi confiável?
7. **Deslocamentos** — medir hospedagem → cada ponto do roteiro (a pé / carro / ônibus)

Cada linha do dossiê tem: símbolo do veredito · número + nome do passo em maiúsculas · texto de
evidência (ou, se pendente, a **instrução do que fazer**) · **carimbo do veredito** (pill com borda,
fundo translúcido e `rotate(-1.5deg)`) · data + fonte em mono. Se pendente, um botão `[ Checar → ]`.

Cabeçalho do dossiê: cidade/UF, porte, data da última checagem e uma **barra de 7 segmentos**, cada
um pintado com a cor do seu veredito. Rodapé: a **estratégia consolidada** (caminhável / transporte
público / app de corrida / táxi-mototáxi / transfer da hospedagem / carro alugado) e quantos passos
ainda faltam — e se falta algum, o rodapé diz isso e **não** apresenta a estratégia como definitiva.

Detalhe crítico do passo 5: se o Google Maps não mostra rotas, o veredito é **inconclusivo**, nunca
ausente — só ~150 cidades brasileiras estão mapeadas, então ausência de dado não prova ausência de
ônibus. A UI deve deixar isso explícito no texto de evidência.

**Layout do shell**: sidebar de 220px (marca `🎒 YATO`, nav, mini-card da viagem ativa com contagem
regressiva, a frase *"Só saio de casa quando sei como volto."* em itálico e o botão "+ Nova viagem"),
topbar sticky de 56px (busca, seletor de viagem ativa, barra de progresso do protocolo `4/7 checados`)
e footbar de 44px (próxima pendência do checklist + engrenagem de preferências).

**Gere estas 6 telas:**

1. **Início** — hero kraft com a próxima viagem (cidade em display, datas, contagem regressiva,
   perfil) + medidor de prontidão (7 segmentos do protocolo + % do checklist); abaixo, 3 painéis
   (estratégia de mobilidade, orçamento, próximas pendências); rodapé com as próximas viagens e a
   linha do tempo do dia 1.
2. **Viagens** — grid/lista de cards de ticket kraft com canhoto serrilhado: cidade/UF, datas,
   chip de perfil (economia/equilibrado/conforto), status, prontidão em miniatura. Filtros por
   status e ordenação. Viagem cancelada dessaturada com tarja diagonal.
3. **Detalhe + Roteiro** — cabeçalho com 4 KPIs em mono; corpo é um **board horizontal de colunas
   por dia**, cada coluna com três faixas fixas (manhã · tarde · noite) separadas por tracejado.
   Cada item tem título, horário **só se existir**, endereço, custo, e um ícone circular do modal de
   deslocamento (🚶 a pé · 🚌 ônibus · 🚗 app · 🚕 táxi · 🛺 mototáxi · 🚐 transfer). Entre itens
   consecutivos, uma linha vertical tracejada com o ícone do próximo deslocamento — a "costura" da
   rota. Rodapé: a régua de conforto (abaixo).
4. **Dossiê de Mobilidade** — o `MobilityDossier` completo à esquerda; à direita, coluna de 320px
   com a estratégia recomendada, os **apps regionais sugeridos** e os contatos locais salvos.
   Os apps regionais brasileiros ("Uber do interior") são: Garupa, Urbano Norte, Ubiz Car, BibiMob,
   Bora94, Chofer 46, Urban66, Rota Pop, V1 — mais Uber, 99, InDrive e, para transporte público,
   Cittamobi e Moovit. **Todo card de app carrega obrigatoriamente o selo âmbar
   `⚑ cobertura declarada — confirmar in-app`** — inclusive Uber e 99.
5. **Orçamento** — 3 números grandes (estimado, realizado, saldo) + uma barra por categoria
   (transporte ida, transporte volta, hospedagem, alimentação, mobilidade local, passeios, outros),
   com verde até 80%, âmbar de 80 a 100% e vermelho acima — nesse caso a barra ultrapassa o trilho
   com o excedente hachurado. Abaixo, tabela mono de gastos, cada linha com um selo `→ Nami`
   (as despesas são espelhadas no app de finanças no momento do registro).
6. **Checklist pré-viagem** — agrupado por categoria (antes de comprar · antes de embarcar · na
   chegada), com barra de progresso, checkbox estilo carimbo de tinta e um chip de origem
   `do dossiê` ou `manual`.

**E estes 4 modais:**

- **Nova viagem** — cidade + UF (UF obrigatória, evita cidades homônimas), datas, perfil, título.
- **Novo item de roteiro** — dia, período, horário opcional, título, endereço, modal de deslocamento,
  custo estimado.
- **Registrar gasto** — categoria, valor, descrição, data, com aviso permanente
  *"lança nas finanças no ato — uma despesa por gasto"*.
- **Wizard do protocolo** ⭐ — **um passo por vez, nunca os 7 de uma vez**. Mostra o número do passo,
  o nome, a **instrução operacional literal** em destaque, campo de evidência, seletor de fonte
  (simulação in-app · página oficial · Google Maps · Moovit · contato com hospedagem · relato local ·
  outro) e os botões **Confirmado · Ausente · Inconclusivo · Pular por ora** — os três vereditos com
  o **mesmo peso visual**. Rodapé `passo 4 de 7` com navegação ‹ ›.

**Uma outra régua que precisa aparecer** (no rodapé da tela de Detalhe): a **matriz economia ×
conforto** das classes de ônibus reguladas pela ANTT, como uma régua horizontal de 5 degraus —
`convencional` (~45° de inclinação) → `executivo` (~130–140°, ar e banheiro obrigatórios) →
`semi-leito` (~135–145°) → `leito` (~150–160°) → `leito-cama` (180°, totalmente plano). Cada degrau
com um mini-diagrama da poltrona reclinada. A classe **recomendada** destacada no acento, com balão
de justificativa. A heurística: acima de 8h em viagem noturna, convencional anula o dia seguinte —
recomendar semi-leito ou superior; acima de 12h, o leito-cama pode substituir uma diária de hotel.
Abaixo da régua, a fila de upgrades por retorno: **transfer privativo → hospedagem melhor → passeio
privativo → executiva doméstica**.

**Dados mock** (use exatamente estes, para o protótipo não parecer genérico):

- **Viagem ativa: Tiradentes/MG, 12–15 de setembro, perfil economia, status confirmada.**
  Roteiro de 4 dias, ~10 itens (ex.: dia 13 manhã "Igreja São Francisco de Assis" a pé, R$ 15;
  dia 13 tarde "Maria Fumaça para São João del-Rei" transfer, R$ 60; dia 14 manhã "Serra de São
  José — trilha" mototáxi, R$ 20). Alguns itens com horário, a maioria sem.
- **Dossiê de Tiradentes/MG**, cidade pequena, checado em 14–15/08: passo 1 confirmado; **Uber
  ausente** (simulação in-app, nenhum carro); **99 confirmado** (simulação in-app, 99Pop e 99Táxi);
  **InDrive inconclusivo** (não aparece na lista, mas o app mira cidades desse porte);
  **transporte público inconclusivo** (sem rotas no Maps, mas só ~150 cidades mapeadas);
  **transfer da hospedagem confirmado** (WhatsApp: R$ 40 da rodoviária); **deslocamentos pendente**.
  Estratégia: caminhável + transfer da pousada. 6 de 7 checados.
- **Orçamento**: hospedagem R$ 600 estimado / R$ 580 realizado; transporte ida+volta R$ 400 / R$ 390;
  alimentação R$ 300 / **R$ 385 (estourado)**; mobilidade local R$ 150 / R$ 60; passeios R$ 200 / R$ 120.
- **Checklist**: 9 itens, 5 concluídos — "instalar 99" (do dossiê, feito), "salvar telefone da
  cooperativa de táxi" (do dossiê, pendente), "combinar transfer com a pousada" (do dossiê, feito),
  "baixar mapa offline" (do dossiê, pendente), "compartilhar roteiro com alguém de confiança"
  (manual, pendente).
- **Histórico**: "Ouro Preto/MG, 3–6 de maio, concluída" e "Cambará do Sul/RS, 20–24 de junho,
  cancelada".
- **Uma cidade de escala pedonal**: **Caraíva/BA** — dossiê fechado como "escala pedonal —
  mobilidade motorizada não se aplica", com os passos 2–5 colapsados sob um resumo e selo `N/A`
  neutro (não "ausente"). Serve para demonstrar esse estado especial.

**Voz da copy**: Yato falando — direta, orgulhosa, obcecada por economia ("cinco ienes!"), com humor,
mas **rigorosamente honesta sobre o que não sabe**. O estado vazio do dossiê não diz "nenhum dado";
diz *"ainda não checamos nada dessa cidade. Vamos por partes."* O estado vazio de viagens diz
*"Nenhuma viagem no horizonte. Cinco ienes e eu te levo pra qualquer lugar."*

**Entregue**: um `index.html` que carregue React via Babel, um `styles.css` com todos os tokens OKLCH
escopados em `.yato-shell` (incluindo tema claro em `[data-theme='light']`, os 4 acentos em
`[data-accent]` e 3 densidades em `[data-density]`), os componentes em arquivos `.jsx` separados,
um `data.js` com os mocks acima e um painel de preferências (tema · acento · densidade · textura
ligada/desligada · ordenação). Responsivo: sidebar colapsa para 64px abaixo de 900px; o board de
dias vira coluna única abaixo de 720px.
