# Feature Specification: Violet · Diário

**Feature Branch**: `003-violet-diario`

**Created**: 2026-06-09

**Status**: Draft

**Input**: Redesign completo do app de bullet journal Violet, fiel ao handoff de design em
`docs/claude_design/design_handoff_violet/`, escopo full-stack.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Escrever o dia (Write) (Priority: P1)

O usuário abre o diário e encontra a entrada de hoje em uma página limpa, temática, focada na
escrita. Ele registra o sonho da noite, adiciona bullets de diferentes tipos (destaque, ideia,
sabedoria, nota, bullet simples) usando os chips de tipo, e navega para entradas anteriores ou
para a lista completa. O shell da aplicação (sidebar com os agentes, topbar, botão "Voltar à
Makima") envolve toda a experiência.

**Por que esta prioridade**: É a tela que o usuário abre todos os dias. Sem ela, nada mais
faz sentido. O valor do redesign começa aqui — layout editorial, marcadores tipados com cor e
timestamp, o shell visual da Violet.

**Teste independente**: Acessar `/journal` com o design Violet ativo, registrar ao menos um
bullet de cada tipo, confirmar que aparece com marcador correto (cor + ícone), timestamp visível,
menções `@pessoa` e `#tag` renderizadas em verde/azul. Navegar com os botões « ‹ ● › ». Entregar
isso já resolve a dor diária do usuário.

**Acceptance Scenarios**:

1. **Given** o usuário abre `/journal` hoje, **When** a página carrega, **Then** o cabeçalho
   exibe: mês+dia (fonte sans, acento-deep), dia da semana em Newsreader 56px/700, número da
   entrada `#N` e rótulo "Hoje" em acento-deep, tudo dentro de `max-width: 600px` centralizado.

2. **Given** a entrada de hoje não tem sonho registrado, **When** o usuário vê o cabeçalho,
   **Then** aparece o prompt de sonho (ícone lua em fundo gold-tint + texto Newsreader itálico
   em ink-4) com opacidade reduzida; ao clicar/digitar, o campo se ativa.

3. **Given** o usuário clica no chip "Destaque", **When** adiciona um novo bullet, **Then** o
   marcador é um coração `♥` vermelho (garnet) e o fundo do bullet recebe gradiente lateral
   `linear-gradient(90deg, garnet-tint, transparent 70%)`.

4. **Given** o usuário clica no chip "Ideia", **When** adiciona o bullet, **Then** o marcador
   é uma lâmpada em amber e o tipo é registrado como `idea` no banco.

5. **Given** o usuário digita `@Pedro` em um bullet, **When** o texto é renderizado, **Then**
   `@Pedro` aparece em emerald / font-weight 500 e é clicável (abre filtro de pessoa).

6. **Given** o usuário clica em `‹` no footer, **When** navega para a entrada anterior,
   **Then** a página exibe a entrada do dia anterior com seus bullets e o número `#(N-1)`.

7. **Given** o usuário está na primeira entrada, **When** tenta clicar em `«`, **Then** o
   botão fica desabilitado e a navegação não muda.

8. **Given** viewport ≤ 900px, **When** a página carrega, **Then** a sidebar colapsa para
   64px (apenas chips de ícone, sem labels) e o conteúdo principal ocupa o restante.

---

### User Story 2 — Navegar o arquivo (Journal) (Priority: P2)

O usuário quer ver o histórico completo das suas entradas, agrupadas por mês em cards com
excerpt e indicadores (destaques, sonho). Pode buscar por texto na topbar e clicar em um card
para abrir aquela entrada no Write.

**Por que esta prioridade**: Segunda tela mais usada — permite reler o passado. Completa o
loop escrever → arquivar.

**Teste independente**: Acessar a tela Journal, confirmar que as entradas aparecem agrupadas
por mês em ordem decrescente, cada card com o número do dia, dia da semana, excerpt de 2 linhas,
contagem de bullets e pills de destaque/sonho. Clicar em um card deve abrir aquela entrada no
Write.

**Acceptance Scenarios**:

1. **Given** o usuário abre a tela Journal, **When** há entradas de meses diferentes, **Then**
   cada grupo de mês tem um cabeçalho em DM Mono uppercase e os cards aparecem em ordem
   decrescente por data.

2. **Given** um card de entrada, **When** renderizado, **Then** exibe: número do dia em
   Newsreader 30px/600 à esquerda, dia da semana em DM Mono 9.5px uppercase, número da entrada
   `#N` + dias atrás, excerpt de 2 linhas (`-webkit-line-clamp: 2`) do primeiro bullet, rodapé
   com contagem de bullets + pill garnet (se tiver destaque) + pill gold (se tiver sonho).

3. **Given** o usuário digita na busca da topbar, **When** há resultados, **Then** os cards são
   filtrados mostrando apenas entradas com matching, excerpt destacado.

4. **Given** o usuário clica em um card, **When** a navegação ocorre, **Then** o Write abre
   com `entryIdx` apontado para aquela entrada e o scroll reseta ao topo.

5. **Given** o usuário está no Write e clica em "Lista" no footer, **When** navega, **Then**
   vai para a tela Journal.

---

### User Story 3 — Explorar coleções derivadas (Priority: P3)

O usuário acessa coleções automáticas derivadas dos seus bullets: Dreams (sonhos registrados),
Highlights (destaques), Ideas, Wisdom, Notes — todas em grids de cards com accent bar colorida.
Também acessa Tags (nuvem ponderada) e People (grid de avatares com iniciais), clicando em
qualquer item para filtrar entradas.

**Por que esta prioridade**: Permite reencontrar conteúdo específico sem lembrar a data.
Destaques e sabedoria em especial são coleções de alto valor emocional para o usuário.

**Teste independente**: Acessar "Highlights" na sidebar, confirmar que os cards exibem os
bullets de tipo `highlight` com accent bar garnet, texto do bullet, link para a entrada de
origem. Fazer o mesmo para Dreams. Confirmar que Tags renderiza nuvem proporcional à frequência.

**Acceptance Scenarios**:

1. **Given** o usuário clica em "Dreams" na sidebar, **When** a tela carrega, **Then** exibe
   grid de cards com todos os textos de sonho (`entry.dream`), accent bar em gold, tipografia
   Newsreader itálico, data e link para a entrada de origem.

2. **Given** o usuário clica em "Highlights" na sidebar, **When** a tela carrega, **Then**
   exibe grid de cards com todos os bullets de `kind = highlight`, accent bar em garnet, texto
   em sans, data e link para origem.

3. **Given** o usuário clica em "Tags" na sidebar, **When** a tela carrega, **Then** exibe
   nuvem de tags onde o tamanho de cada tag é proporcional à frequência (`font-size` escala entre
   `0.92em` e `0.92em + 0.55em`); ao passar o mouse, recebe fundo `accent-tint`.

4. **Given** o usuário clica em "People" na sidebar, **When** a tela carrega, **Then** exibe
   grid 4 colunas com um card por pessoa (avatar circular 42px com inicial, fundo emerald-tint,
   nome 14.5px/600, contagem de menções em DM Mono 10.5px).

5. **Given** uma coleção está vazia (ex: nenhum bullet de `wisdom`), **When** o usuário abre
   "Wisdom", **Then** a tela exibe estado vazio com mensagem amigável ao invés de grid vazio.

6. **Given** o usuário clica em uma tag na nuvem de Tags, **When** navega, **Then** vai para
   a tela Journal filtrada por aquela tag, mostrando apenas entradas que a contêm.

---

### User Story 4 — Consultar Insights (Priority: P4)

O usuário abre a tela de Insights e encontra um hero com a imagem da Violet e uma frase
personalizada com dados reais. Navega pelas 7 abas (Diário, Sonhos, Destaques, Tags, Pessoas,
Sabedoria, Ideias) e vê: heatmap anual por palavras escritas, gráfico de área de palavras/mês,
distribuição por hora do dia, big numbers (entradas, palavras, sequência) e chips de contagem
para destaques/tags/menções/sonhos.

**Por que esta prioridade**: É a "recompensa" do hábito de escrita — mostra ao usuário o
impacto acumulado. Alto valor motivacional, mas não é bloqueante para escrever.

**Teste independente**: Acessar a tela Insights, confirmar que o hero exibe imagem da Violet
com halo, copy com dados reais, e que a aba "Diário" exibe heatmap anual colorido por nível de
palavras (5 níveis: heat-0 a heat-4), chips de contagem e os três "grandes números".

**Acceptance Scenarios**:

1. **Given** o usuário abre a tela Insights, **When** a página carrega, **Then** o hero exibe:
   coluna esquerda com eyebrow em DM Mono uppercase accent-deep, H1 Newsreader 52px/600 com badge
   "Pro", parágrafo Newsreader itálico 17px com dados do usuário (total de entradas, dias escritos,
   maior sequência); coluna direita com `violet.png` envolvida por halo radial.

2. **Given** o usuário está na aba "Diário", **When** o heatmap é renderizado, **Then** exibe
   grade 7×semanas-do-ano com células 9×9px, cor derivada da contagem de palavras do dia
   (heat-0=0 palavras até heat-4=≥190 palavras), rodapé com chips de "dias escritos", "entradas",
   "maior sequência" e legenda do gradiente.

3. **Given** o usuário está na aba "Diário", **When** vê o gráfico de área, **Then** exibe
   curva suave (Catmull-Rom/Bezier) com gradiente abaixo em accent 22%→2%, eixo X com labels
   de mês em DM Mono 9px.

4. **Given** o usuário está na aba "Diário", **When** vê a distribuição por hora, **Then**
   exibe 12 barras (0h–22h, pares) com gradiente vertical accent→accent-bright, altura proporcional
   à frequência de escrita naquele horário, labels em DM Mono 9px.

5. **Given** o usuário está na aba "Diário", **When** vê os grandes números, **Then** exibe
   grid 3 colunas com: número total de entradas, total de palavras, média de palavras/dia —
   número em Newsreader 48px/400 accent-deep, label DM Sans 13px, sub DM Mono 10.5px.

6. **Given** o usuário clica em uma aba de coleção (ex: "Sonhos"), **When** a aba ativa muda,
   **Then** a área de conteúdo exibe os insights específicos da coleção (contagem, estatísticas
   mais frequentes, distribuição temporal).

---

### User Story 5 — Refletir com a Violet (Reflect) (Priority: P5)

O usuário abre a tela Reflect e encontra um card com uma pergunta de reflexão no estilo de carta
da Violet Evergarden. Pode trocar a pergunta ("Outra pergunta") ou respondê-la no Write ("Responder
hoje"). Abaixo, a seção "Releia-se" exibe um item de cada tipo (sabedoria, destaque, sonho, ideia)
selecionados deterministicamente pelo dia do ano.

**Por que esta prioridade**: Feature de profundidade emocional — diferencia o Violet de um
journal comum. Dependente das demais telas funcionarem.

**Teste independente**: Acessar a tela Reflect, confirmar que o card de pergunta exibe uma das
4 perguntas predefinidas assinadas por "Violet", que o botão "Outra pergunta" cicla pelas 4
perguntas, e que a seção "Releia-se" exibe 4 itens (um por tipo) com conteúdo real do banco.

**Acceptance Scenarios**:

1. **Given** o usuário abre a tela Reflect, **When** a página carrega, **Then** o card exibe
   fundo `linear-gradient(150deg, mist, card 64%)`, borda `sapphire / 0.18`, padding 34px 36px,
   eyebrow DM Mono uppercase accent-deep, pergunta Newsreader 30px/500, assinatura Newsreader
   itálico 13.5px ink-3, dois botões: "Responder hoje" (accent) e "Outra pergunta" (neutro).

2. **Given** o usuário clica em "Outra pergunta", **When** o estado atualiza, **Then** a
   pergunta muda para a próxima das 4 predefinidas em ciclo.

3. **Given** o usuário clica em "Responder hoje", **When** a navegação ocorre, **Then** vai
   para a tela Write com a entrada de hoje aberta.

4. **Given** há bullets de cada tipo no banco, **When** a seção "Releia-se" carrega, **Then**
   exibe exatamente um item de cada tipo (Sabedoria, Destaque, Sonho, Ideia), selecionados pela
   mesma semente para o mesmo dia (mesma data = mesmos itens; dia diferente = itens diferentes).

5. **Given** um tipo não tem itens (ex: nenhum dream), **When** a seção "Releia-se" carrega,
   **Then** o slot daquele tipo não aparece (ou exibe estado vazio), sem erro.

---

### User Story 6 — Personalizar a experiência (Tweaks) (Priority: P6)

O usuário abre o painel de Tweaks e configura: tema (claro/escuro), acento (safira/ouro/esmeralda/
granada), modo de escrita (normal/amplo/foco), tipografia (clássica/técnica). As preferências
persistem entre sessões no perfil do usuário.

**Por que esta prioridade**: Elevada pela fidelidade ao design (os Tweaks são parte central da
Violet), mas não bloqueia uso básico. Tema claro já vem como padrão no P1.

**Teste independente**: Abrir o painel de Tweaks, trocar o tema para escuro, recarregar a
página, confirmar que o tema escuro persiste. Trocar o acento para "Ouro" e confirmar que todos
os elementos de acento da UI mudam de safira para ouro.

**Acceptance Scenarios**:

1. **Given** o usuário abre o painel de Tweaks, **When** muda o tema para "Escuro", **Then**
   `data-theme="dark"` é setado no `<html>`, todos os tokens de cor sobrescrevem para o tema
   escuro (fundo `oklch(0.165 0.014 262)`), e a preferência é salva no perfil.

2. **Given** o usuário escolhe o acento "Esmeralda", **When** a preferência é aplicada, **Then**
   as variáveis CSS `--accent`, `--accent-deep`, `--accent-bright`, `--accent-tint`,
   `--accent-tint-2` são sobrescritas no `:root` com os valores da paleta esmeralda, e todos os
   elementos de acento (botões, nav ativo, heatmap, borda de foco) mudam de cor.

3. **Given** o usuário ativa o modo "Foco", **When** aplicado, **Then** a sidebar colapsa
   (width → 0), `grid-template-columns` vai para `0 1fr`, e o Write expande para `max-width: 680px`
   com padding-top 72px e o dia-da-semana aumenta para 68px.

4. **Given** o usuário ativa tipografia "Técnica", **When** aplicado, **Then** o dia-da-semana
   muda de Newsreader itálico para DM Sans 42px/700, e os bullets usam DM Mono 13.5px/1.85 ao
   invés de DM Sans 15.5px/300.

5. **Given** o usuário fecha e reabre o app, **When** a preferência foi salva, **Then** o tema,
   acento, modo e tipografia carregam com os valores que o usuário configurou.

---

### Edge Cases

- O que acontece quando o dia não tem nenhuma entrada registrada ainda (primeiro acesso do dia)?
- Como a tela Write se comporta quando não há nenhuma entrada no banco (novo usuário)?
- O que acontece com bullets que contêm apenas espaços ou foram salvos vazios?
- Como ficam menções e tags em bullets deletados — são removidas da contagem imediatamente?
- O heatmap para dias futuros não deve exibir dados (células heat-0 apenas até hoje).
- Navegar além da primeira ou última entrada com os botões « e » não deve quebrar.
- Uma coleção completamente vazia (ex: usuário nunca escreveu um `wisdom`) deve exibir estado
  vazio e não uma grid em branco sem mensagem.
- O "Releia-se" do Reflect com menos de 4 tipos com conteúdo deve pular os tipos ausentes.
- Em viewport ≤ 900px, a aba de Insights com hero de duas colunas deve colapsar para coluna única
  e o retrato da Violet deve ser ocultado.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Modelo de dados e backend

- **FR-001**: O sistema DEVE armazenar o tipo de cada bullet (`kind`) com os valores possíveis:
  `bullet`, `highlight`, `dream`, `idea`, `wisdom`, `note` — persistido no banco por entrada.

- **FR-002**: O sistema DEVE armazenar um campo de sonho (`dream`) por entrada diária, separado
  dos bullets — texto livre opcional, nulo se o usuário não registrou sonho.

- **FR-003**: O sistema DEVE calcular e armazenar (ou derivar na consulta) a contagem de palavras
  por dia, para alimentar o heatmap com intensidade proporcional à escrita.

- **FR-004**: Os endpoints existentes de heatmap DEVEM retornar palavras escritas por dia (não
  contagem de bullets) para que os 5 níveis de calor sejam baseados em volume de escrita.

- **FR-005**: Os endpoints de coleções (`/api/journal/collection/:type`) DEVEM retornar bullets
  filtrados por `kind`, com data e referência à entrada de origem.

- **FR-006**: O sistema DEVE expor um endpoint de sonhos (`/api/journal/dreams`) que retorna
  todos os campos `dream` não nulos das entradas, com data e número de entrada.

- **FR-007**: As preferências de Tweaks (tema, acento, modo, tipografia) DEVEM ser persistidas
  no dispositivo do usuário (chave `vl-tweaks` em `localStorage`), restauradas automaticamente
  ao carregar a aplicação. Comportamento consistente com o painel de Tweaks do Frieren.

#### Shell e navegação

- **FR-008**: A aplicação DEVE exibir uma sidebar fixa de 244px com dois grupos de navegação
  separados por divisor: grupo principal (Write, Journal, Reflect, Insights) e grupo de coleções
  (Dreams, Highlights, Tags, People, Notes, Wisdom, Ideas) — este com contadores numéricos em
  DM Mono 10.5px.

- **FR-009**: Cada item de navegação da sidebar DEVE exibir um chip (círculo 28×28px) com ícone
  SVG 15×15px; inativo com fundo ink; ativo com fundo accent e box-shadow.

- **FR-010**: A sidebar DEVE exibir no cabeçalho: avatar circular 40px de `violet.png` com
  borda accent/0.32, nome "Violet" em Newsreader 19px/500, role "Diário" em DM Mono 9px uppercase.

- **FR-011**: A sidebar DEVE ter um botão "Escrever hoje" em largura total, fundo accent, que
  navega para o Write na entrada de hoje (`entryIdx = 0`).

- **FR-012**: O rodapé da sidebar DEVE ter um link "Voltar à Makima" com indicador visual
  (ponto vermelho 6px) e um botão de colapso da sidebar.

- **FR-013**: A topbar DEVE ter altura 54px, fundo translúcido com backdrop-filter blur(12px),
  título da tela ativa em Newsreader 18px/500, campo de busca pill com focus-ring accent-tint,
  e botões de ação icon (34×34px, borda line).

- **FR-014**: Em viewports ≤ 900px, a sidebar DEVE colapsar para 64px mostrando apenas chips
  de ícone (labels ocultos) e o layout DEVE mudar para `grid-template-columns: 64px 1fr`.

#### Tela Write

- **FR-015**: A tela Write DEVE exibir cabeçalho de data com: mês+dia em DM Sans 15px/600
  accent-deep, dia da semana em Newsreader 56px/700 letter-spacing -0.03em, número da entrada
  `#N` e rótulo "Hoje" em accent-deep/600 — dentro de `max-width: 600px` centralizado.

- **FR-016**: A tela Write DEVE exibir prompt de sonho (ícone lua em fundo gold-tint + texto
  Newsreader itálico 17px ink-4) que, ao ser preenchido, persiste no campo `dream` da entrada.

- **FR-017**: Cada bullet DEVE exibir: marcador tipado (glifo/cor conforme `kind`), texto,
  timestamp em DM Mono 10.5px ink-4. Bullets `highlight` DEVEM ter fundo gradiente lateral
  `linear-gradient(90deg, garnet-tint, transparent 70%)`.

- **FR-018**: Bullets de `kind = wisdom` DEVEM renderizar o texto em Newsreader itálico 16.5px.

- **FR-019**: Menções `@NomePessoa` DEVEM ser renderizadas em emerald/500 e `#tag` em
  accent-deep/500, ambas clicáveis (abrem filtro na tela correspondente).

- **FR-020**: A barra de chips de tipo (Bullet, Destaque, Ideia, Sabedoria, Nota, Sonho) DEVE
  estar visível abaixo da lista de bullets para adicionar novos bullets com tipo pré-selecionado.
  Cada chip tem ícone colorido + label, `border-radius: 999px`.

- **FR-021**: O footer de navegação (WriteFoot) DEVE estar fixo no rodapé do main (`height: 52px`,
  `backdrop-filter: blur(14px)`) com botões `«` (primeira), `‹` (anterior), `Lista`, `●` (hoje),
  `›` (próximo), `»` (última) — todos com `height: 32px`, `border-radius: 8px`.

- **FR-022**: O botão "hoje" do WriteFoot DEVE ter estilo diferenciado (borda accent, cor
  accent-deep). Os botões `«` e `»` DEVEM ser desabilitados quando na primeira/última entrada.

#### Tela Journal

- **FR-023**: A tela Journal DEVE exibir um stream de entradas agrupadas por mês em ordem
  decrescente, com cabeçalho de mês em DM Mono uppercase letter-spacing 0.14em.

- **FR-024**: Cada card de entrada DEVE exibir: número do dia Newsreader 30px/600 + dia da
  semana DM Mono 9.5px uppercase, número `#N` + "X dias atrás", excerpt de 2 linhas com
  `-webkit-line-clamp: 2`, rodapé com contagem de bullets + pill garnet (se tiver highlight)
  + pill gold (se tiver dream). Hover: shadow-md + translateY(-2px) + borda accent/0.30.

- **FR-025**: Ao clicar em um card na Journal, o sistema DEVE navegar para Write com a entrada
  correspondente aberta e scroll resetado ao topo.

#### Telas de Coleção

- **FR-026**: As telas de coleção (Dreams, Highlights, Ideas, Wisdom, Notes) DEVEM exibir grid
  `repeat(auto-fill, minmax(280px, 1fr))` com cards que têm accent bar de 3px à esquerda na cor
  do tipo, texto principal (Newsreader itálico para wisdom/dreams, sans para os demais), data e
  link para a entrada de origem.

- **FR-027**: A tela Tags DEVE exibir nuvem de tags com font-size proporcional à frequência de
  cada tag (`0.92em + (count/max) * 0.55em`), cada tag com `border-radius: 999px` e hover com
  fundo accent-tint. Tags clicáveis levam ao filtro.

- **FR-028**: A tela People DEVE exibir grid 4 colunas com um card por pessoa mencionada:
  avatar circular 42px (inicial, fundo emerald-tint), nome 14.5px/600, contagem de menções DM
  Mono 10.5px. Clicável para filtro por pessoa.

#### Tela Insights

- **FR-029**: A tela Insights DEVE exibir um hero com grid de 2 colunas (`1fr 248px`):
  lado esquerdo com eyebrow, H1 Newsreader 52px/600 + badge "Pro", parágrafo Newsreader itálico
  17px com dados do usuário; lado direito com `violet.png` + halo radial com blur 3px.

- **FR-030**: A tela Insights DEVE ter 7 abas (Diário, Sonhos, Destaques, Tags, Pessoas,
  Sabedoria, Ideias) com aba ativa distinguida por `border-bottom: 2px solid ink` e font-weight 600.

- **FR-031**: A aba Diário dos Insights DEVE exibir heatmap anual com células 9×9px coloridas
  em 5 níveis (heat-0 a heat-4) baseados em palavras escritas: 0, 1–49, 50–99, 100–189, ≥190
  palavras — com rodapé contendo chips de dias escritos, entradas, maior sequência e legenda.

- **FR-032**: A aba Diário dos Insights DEVE exibir chips de contagem para: Destaques (garnet),
  Tags (sapphire), Menções (emerald), Sonhos (gold) — cada chip com ícone circular 30px, número
  17px/700 e label 13px.

- **FR-033**: A aba Diário dos Insights DEVE exibir gráfico de área SVG de palavras por mês
  com curva suave (Catmull-Rom), gradiente de área accent 22%→2%, linha accent strokeWidth 2,
  labels de mês DM Mono 9px.

- **FR-034**: A aba Diário dos Insights DEVE exibir distribuição por hora do dia (12 barras,
  pares 0h–22h) com gradiente vertical accent→accent-bright, border-radius 4px 4px 0 0, e labels
  DM Mono 9px.

- **FR-035**: A aba Diário dos Insights DEVE exibir 3 "grandes números" em grid 3 colunas:
  total de entradas, total de palavras, média de palavras/dia — número Newsreader 48px/400
  accent-deep, label DM Sans 13px, sub DM Mono 10.5px.

#### Tela Reflect

- **FR-036**: A tela Reflect DEVE exibir um card de pergunta com fundo
  `linear-gradient(150deg, mist, card 64%)`, borda `sapphire/0.18`, padding 34px 36px,
  eyebrow DM Mono 10px uppercase accent-deep, pergunta Newsreader 30px/500 letter-spacing -0.02em,
  assinatura Newsreader itálico 13.5px ink-3.

- **FR-037**: A tela Reflect DEVE ter 4 perguntas predefinidas assinadas por "Violet":
  "O que você sentiu hoje que não conseguiu dizer a ninguém?",
  "Qual pequena coisa de hoje você gostaria de poder reviver?",
  "Por quem você foi grato hoje — e essa pessoa sabe disso?",
  "Se o dia de hoje fosse uma carta, para quem você a enviaria?".

- **FR-038**: O botão "Outra pergunta" DEVE ciclar pelas 4 perguntas. O botão "Responder hoje"
  DEVE navegar para a tela Write com a entrada de hoje.

- **FR-039**: A seção "Releia-se" DEVE exibir exatamente um item de cada tipo que tenha conteúdo
  (Sabedoria, Destaque, Sonho, Ideia), selecionados por semente baseada no dia do ano — mesma
  data sempre retorna os mesmos itens, dia diferente retorna diferentes itens.

#### Sistema visual (Design System)

- **FR-040**: O sistema DEVE usar tokens de cor em CSS custom properties com valores OKLCH:
  `--paper`, `--paper-2`, `--card`, `--card-2`, `--mist`, `--ink` a `--ink-5`, `--line`,
  `--line-2`, `--sapphire` (e variantes deep/bright/tint), cores por tipo de bullet
  (gold, emerald, garnet, amber, violet-c), heat-0 a heat-4.

- **FR-041**: O sistema DEVE usar as fontes Newsreader (serifa, pesos 400/500/600/700,
  normal+italic), DM Sans (sans, pesos 300/400/500/600/700) e DM Mono (mono, pesos 400/500)
  carregadas via Google Fonts. Font-size base: 14px, line-height base: 1.5.

- **FR-042**: O tema padrão DEVE ser claro. O tema escuro DEVE ser ativado via
  `data-theme="dark"` no `<html>` (via Tweaks). Todos os tokens de cor DEVEM ser sobrescritos
  pelo seletor `[data-theme="dark"]`.

- **FR-043**: O acento DEVE ser intercambiável via variáveis `--accent`, `--accent-deep`,
  `--accent-bright`, `--accent-tint`, `--accent-tint-2` atualizadas por `style.setProperty`
  no App. Safira é o padrão. Opções: Safira, Ouro, Esmeralda, Granada.

- **FR-044**: O modo Foco DEVE aplicar as classes CSS correspondentes (sidebar colapsada,
  write-wrap expandido, dia-da-semana 68px). O modo Amplo DEVE ampliar o write-wrap para 720px
  e o texto dos bullets para 16.5px/1.78. A tipografia Técnica DEVE usar DM Sans para o dia
  e DM Mono para os bullets.

- **FR-045**: Todos os ícones DEVEM ser SVG inline com stroke de 1.8px, strokeLinecap round,
  strokeLinejoin round — exceto heart, moon, gem que são preenchidos. Tamanhos: 15px (nav),
  16px (topbar), 24px (coleções).

- **FR-046**: Os border-radius DEVEM usar tokens: `--r-sm: 7px`, `--r-md: 11px`, `--r-lg: 18px`.
  Sombras DEVEM usar tokens: `--shadow-sm`, `--shadow-md`, `--shadow-lg` com valores OKLCH.

### Key Entities *(include if feature involves data)*

- **Entry**: Representa um dia no diário. Atributos: `id`, `date` (YYYY-MM-DD), `num` (número
  sequencial), `dream` (texto opcional do sonho), `created_at`, `updated_at`. Relação: tem muitos
  `Bullet`.

- **Bullet**: Um item de bullet journal dentro de uma entrada. Atributos: `id`, `entry_id`,
  `kind` (bullet|highlight|dream|idea|wisdom|note), `text` (pode conter @pessoa e #tag),
  `time` (HH:MM), `position` (esparsidade ×1000), `created_at`. Relação: pertence a um `Entry`;
  gera `Mention`.

- **Mention**: Token inline parseado do texto de um bullet. Atributos: `id`, `bullet_id`,
  `kind` (person|tag), `value` (sem o @ ou #). Derivada automaticamente ao salvar um bullet.

- **Collection**: Coleção derivada, não persistida diretamente. Tipos: Dreams (de `entry.dream`),
  Highlights/Ideas/Wisdom/Notes (de `bullet.kind`), Tags (Mention kind=tag), People
  (Mention kind=person). Inclui contagem e referência à entrada de origem.

- **HeatmapDay**: Dia com dados de escrita para o heatmap. Atributos: `date` (YYYY-MM-DD),
  `words` (contagem de palavras do dia). Derivado do conteúdo dos bullets + campo dream.

- **Stats**: Estatísticas agregadas do diário. Calculadas sob demanda: total de entradas,
  bullets, palavras, dias escritos, média de palavras, frequência semanal, sequência atual,
  maior sequência, contagens por coleção.

- **ReflectPrompt**: Pergunta de reflexão predefinida. Atributos: `text` (a pergunta), `by`
  (sempre "Violet"). Conjunto fixo de 4 prompts.

- **Preferences**: Preferências de personalização do usuário. Atributos: `theme` (light|dark),
  `accent` (sapphire|gold|emerald|garnet), `mode` (normal|wide|focus), `typography`
  (classic|technical). Persistido no perfil do usuário.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O usuário consegue registrar um bullet de qualquer tipo (incluindo sonho do dia)
  em menos de 30 segundos a partir da abertura da tela Write.

- **SC-002**: Todas as 7 telas da aplicação (Write, Journal, Reflect, Insights, Dreams,
  Tags, People) carregam e exibem conteúdo em menos de 2 segundos com banco de dados populado.

- **SC-003**: A fidelidade visual ao mockup do handoff é verificável tela a tela: cada elemento
  de cada tela descrita no README do handoff tem um equivalente implementado com tipografia,
  paleta e espaçamentos corretos.

- **SC-004**: As coleções (Highlights, Dreams, Ideas, Wisdom, Notes) refletem corretamente os
  bullets do banco — adicionar um bullet de tipo `wisdom` faz ele aparecer imediatamente em
  "Wisdom" sem necessidade de ação manual.

- **SC-005**: O heatmap anual exibe dados reais de palavras escritas por dia, com 5 níveis de
  cor distinguíveis visualmente, cobrindo todos os dias do ano atual até hoje.

- **SC-006**: As preferências de Tweaks (tema, acento, modo, tipografia) persistem entre sessões:
  após fechar e reabrir o app, todas as 4 preferências são restauradas para os valores configurados.

- **SC-007**: A troca de acento (ex: safira → esmeralda) aplica em todos os elementos de acento
  da UI sem recarregamento de página — botões, nav ativo, heatmap, rings de foco, accent bars.

- **SC-008**: A aplicação é utilizável em viewport de 375px (mobile) com sidebar colapsada para
  modo ícones, conteúdo principal legível e navegação funcional.

- **SC-009**: A tela Reflect exibe a mesma seleção de 4 itens no "Releia-se" para o mesmo dia —
  abrir a tela duas vezes no mesmo dia retorna os mesmos itens; no dia seguinte, itens diferentes.

- **SC-010**: O modo Foco oculta completamente a sidebar e expande o Write para máximo conforto
  de escrita, trocando de volta para modo normal sem perda de dados ou estado de navegação.

---

## Assumptions

- **Substituição da tela Journal atual**: O design Violet substitui completamente a página
  `Journal.tsx` (dark "Journalistic") — não é uma nova rota paralela. A URL `/journal` passa a
  servir o novo design.

- **Extensão do backend no mesmo arquivo**: O schema do diário é mantido inline em
  `agents/journal/tools.py::_ensure_tables()`. Novas colunas (`kind` no bullet, `dream` e `num`
  na page) são adicionadas nesse mesmo mecanismo — sem arquivo de migration separado. A coluna
  `num` (número sequencial) é derivada ou computada no momento da consulta.

- **Tipo único de diário**: O sistema mantém apenas `type_id = 1` (personal). A infra de
  `journal_types` existe mas não expõe troca de tipo ao usuário nesta fase.

- **Reuso da infraestrutura existente**: Auth via `require_user`, endpoints em
  `webapp/backend/routers/journal.py`, driver psycopg2-binary, conexão via `DATABASE_URL` — todos
  reutilizados sem mudança de stack.

- **Tweaks em localStorage**: As preferências de Tweaks são salvas em `localStorage` (chave
  `vl-tweaks`), consistente com o painel de Tweaks já existente no Frieren. O webapp é
  single-user (auth via cookie + `ALLOWED_EMAIL` sem tabela de usuário), então `localStorage`
  é a abordagem adequada — zero infra adicional, Minimal Footprint.

- **Asset violet.png**: O arquivo `docs/claude_design/design_handoff_violet/violet/violet.png`
  está disponível e será copiado para os assets do webapp (`webapp/frontend/public/` ou
  equivalente).

- **Fontes via Google Fonts**: Newsreader, DM Sans e DM Mono serão carregadas via `<link>`
  do Google Fonts no `index.html`, substituindo as fontes atuais do Journal (Archivo Black,
  Playfair Display).

- **OKLCH suportado**: Todos os tokens de cor usam `oklch()`. O target de browsers é moderno
  (Safari ≥ 15.4, Chrome ≥ 111, Firefox ≥ 113) — sem fallback para outros espaços de cor.

- **Spaced repetition simplificado**: A seleção do "Releia-se" usa semente baseada no dia do
  ano (como no protótipo), não um algoritmo real de spaced repetition. Pode ser melhorado em
  fase futura.

- **Contagem de palavras no cliente**: A contagem de palavras para o heatmap pode ser calculada
  no servidor (via `_ensure_tables` ou trigger) ou no cliente ao salvar — a abordagem exata é
  decisão de implementação, desde que o endpoint de heatmap retorne palavras e não contagem de
  bullets.
