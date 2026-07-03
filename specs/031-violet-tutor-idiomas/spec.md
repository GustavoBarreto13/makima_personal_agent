# Feature Specification: Tutor de Idiomas na Violet (Kurisu)

**Feature Branch**: `031-violet-tutor-idiomas`

**Created**: 2026-07-03

**Status**: Draft

**Input**: User description: "Tutor de Idiomas na Violet (diário). Um botão discreto em cada bullet do diário permite pedir uma análise de escrita em inglês (desenhado para multi-idioma no futuro). Ao clicar, a Kurisu (persona do tutor) analisa a gramática do bullet e retorna: o texto corrigido, uma lista de erros com explicação de cada conceito gramatical, um resumo do que foi ensinado (voz da Kurisu, em PT-BR) e uma nota 0-100. O resultado aparece num modal. A correção fica salva e o bullet ganha um toggle discreto para alternar entre o texto original (nunca sobrescrito) e a versão corrigida. Além disso, cada análise atualiza um perfil de habilidade por conceito gramatical que acumula ao longo do tempo, permitindo mostrar a evolução do usuário — com maestria (0-100) e tendência (subindo/caindo/estável) por conceito. Uma nova tela de progresso na Violet lista os conceitos com barra de maestria, glyph de tendência e histórico de análises recentes. Escopo: só na web (Violet), inglês na UI mas com idioma em todas as tabelas para expandir depois; os aprendizados ficam numa tabela própria da Violet."

## Clarifications

### Session 2026-07-03

- Q: Como identificar os "conceitos gramaticais" para que o progresso acumule de forma estável? → A: Lista canônica curada (~20–30 conceitos comuns) fixada no sistema; conceitos fora dela caem num grupo "outros".
- Q: Quando a maestria/tendência de um conceito é confiável na tela? → A: Exibe desde a 1ª ocorrência com selo "poucos dados"; a tendência só aparece com ≥3 análises daquele conceito.
- Q: A maestria decai por ausência (conceito sem aparecer por muito tempo)? → A: Não — a maestria só muda quando o conceito reaparece numa nova análise.
- Q: Como o usuário guia o aprendizado (livro/método/conceito que está seguindo)? → A: Um "guia de estudo" com foco em texto livre (ex.: "English Grammar in Use, cap. 4") + conceitos-alvo opcionais da lista canônica; um foco ativo por vez, editável.
- Q: O que o guia de estudo influencia além da explicação? → A: Orienta a análise (ênfase nos conceitos do foco + feedback sobre o progresso naquele foco) e destaca/filtra esses conceitos na tela de progresso.
- Q: Acréscimos de valor incluídos no escopo? → A: (1) nível estimado CEFR (A1–C2) na tela de progresso; (2) reescrita natural/idiomática além da correção gramatical; (3) sugestão de próximo foco pela Kurisu com base nos conceitos mais fracos e no guia ativo.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Analisar e corrigir a escrita de um bullet (Priority: P1)

O usuário escreve um bullet do diário em inglês. Ao lado do bullet há uma ação discreta
("analisar escrita"). Ao acioná-la, um tutor (persona Kurisu) avalia a gramática daquele
bullet e devolve, num painel: a versão corrigida do texto, a lista de erros — cada um com o
conceito gramatical envolvido e uma explicação didática em português —, um resumo do que foi
ensinado e uma nota de 0 a 100 para aquela escrita.

**Why this priority**: É o núcleo do valor — receber correção e explicação sobre a própria
escrita. Sem isto, nada mais existe. Entregue sozinho, já é um MVP útil (um corretor-tutor
sob demanda no diário).

**Independent Test**: Escrever um bullet em inglês com erros propositais, acionar a análise e
verificar que o painel mostra correção, erros explicados por conceito, resumo e nota.

**Acceptance Scenarios**:

1. **Given** um bullet em inglês com erros, **When** o usuário aciona "analisar escrita",
   **Then** aparece um painel com texto corrigido, uma reescrita natural/idiomática, lista de
   erros (conceito + explicação em PT-BR), resumo do aprendizado e nota 0–100.
2. **Given** um bullet já correto, **When** o usuário aciona a análise, **Then** o painel
   indica ausência de erros, mantém o texto e atribui nota alta.
3. **Given** o tutor está indisponível (falha temporária do serviço de análise), **When** o
   usuário aciona a análise, **Then** vê uma mensagem de erro amigável e nada é salvo.

---

### User Story 2 - Alternar entre texto original e corrigido no bullet (Priority: P2)

Depois de uma análise, o bullet passa a exibir um alternador discreto que permite ver o texto
como foi escrito originalmente ou a versão corrigida. O texto original nunca é sobrescrito — é
sempre a fonte da verdade do diário; a correção é uma camada consultável.

**Why this priority**: Transforma a correção de um evento único (o painel) em algo persistente
e revisitável no próprio contexto do diário, sem poluir o registro original.

**Independent Test**: Após analisar um bullet, recarregar a página, confirmar que o alternador
aparece e alterna entre original e corrigido, e que o registro salvo do diário continua sendo o
texto original.

**Acceptance Scenarios**:

1. **Given** um bullet já analisado, **When** o usuário abre o diário daquele dia, **Then** o
   bullet mostra um alternador discreto (original ↔ corrigido).
2. **Given** o alternador em "corrigido", **When** o usuário volta para "original", **Then** vê
   exatamente o texto que escreveu.
3. **Given** um bullet analisado, **When** o texto original é consultado em qualquer outra tela
   do diário (arquivo, busca, coleções), **Then** aparece sempre o texto original, nunca o
   corrigido.

---

### User Story 3 - Acompanhar a evolução por conceito gramatical (Priority: P2)

Cada análise alimenta um perfil de habilidade por conceito gramatical (ex.: "verb to be",
"artigos", "past simple"). Uma tela de progresso na Violet lista os conceitos com uma barra de
maestria (0–100), um indicador de tendência (subindo / caindo / estável) e o histórico das
análises recentes — permitindo enxergar frases como "você errava muito em *verb to be*; agora
está dominando".

**Why this priority**: É o diferencial de longo prazo — o tutor não só corrige, ele mede
progresso. Depende de existirem análises (US1), mas entrega valor próprio distinto.

**Independent Test**: Fazer várias análises ao longo de bullets diferentes (algumas com erro em
um conceito, depois sem), abrir a tela de progresso e confirmar que a maestria daquele conceito
sobe e a tendência reflete a melhora.

**Acceptance Scenarios**:

1. **Given** ao menos uma análise concluída, **When** o usuário abre a tela de progresso,
   **Then** vê a lista de conceitos com barra de maestria, glyph de tendência, as análises
   recentes, um nível estimado (CEFR A1–C2) e uma sugestão de próximo foco.
2. **Given** um conceito que teve erros e depois passou a ser usado corretamente em análises
   seguintes, **When** o usuário abre a tela, **Then** a maestria daquele conceito está mais
   alta e a tendência aparece como "subindo".
3. **Given** nenhuma análise feita ainda, **When** o usuário abre a tela, **Then** vê um estado
   vazio explicando como começar (analisar um bullet).

---

### User Story 4 - Guiar o aprendizado por um livro/método/conceito (Priority: P2)

O usuário está seguindo um material de estudo (um livro, um método, ou focando um conceito
específico). Ele registra um **guia de estudo**: uma descrição livre do que está seguindo
(ex.: "English Grammar in Use — cap. 4, past tenses") e, opcionalmente, marca conceitos-alvo da
lista canônica. Enquanto esse guia está ativo, o tutor orienta cada análise por ele — enfatiza
os conceitos do foco nas correções/explicações e comenta como o usuário está indo naquele foco;
e a tela de progresso destaca os conceitos-alvo do guia. Há um foco ativo por vez, editável ou
removível a qualquer momento.

**Why this priority**: Transforma o tutor de reativo (corrige o que aparece) em direcionado
(ajuda a estudar o que o usuário escolheu). É um diferencial forte, mas depende do núcleo de
análise (US1) e do acompanhamento por conceito (US3) já existirem.

**Independent Test**: Definir um guia de estudo com um conceito-alvo, analisar bullets, e
confirmar que as explicações enfatizam o foco e que a tela de progresso destaca aquele conceito;
depois remover o guia e confirmar que a análise volta ao comportamento geral.

**Acceptance Scenarios**:

1. **Given** nenhum guia ativo, **When** o usuário registra um guia de estudo (texto + conceitos-
   alvo opcionais), **Then** o guia passa a constar como ativo e editável.
2. **Given** um guia ativo com um conceito-alvo, **When** o usuário analisa um bullet, **Then** a
   correção/explicação enfatiza o foco e o resumo comenta o progresso naquele foco.
3. **Given** um guia ativo, **When** o usuário abre a tela de progresso, **Then** os conceitos-alvo
   do guia aparecem destacados (ou filtráveis).
4. **Given** um guia ativo, **When** o usuário o remove ou o substitui, **Then** as análises
   seguintes deixam de aplicar o foco anterior (sem afetar as análises já salvas).

---

### Edge Cases

- **Bullet vazio ou muito curto** (ex.: uma palavra): o tutor responde de forma graciosa
  (nota/erros coerentes, sem inventar problemas) ou informa que não há material suficiente.
- **Texto não está em inglês** (usuário escreveu em português): o tutor sinaliza que o texto não
  parece estar no idioma-alvo, em vez de "corrigir" indevidamente.
- **Reanálise do mesmo bullet**: acionar a análise de novo gera uma nova análise; a mais recente
  é a que alimenta o alternador do bullet, e cada análise contribui para o histórico do conceito.
- **Bullet editado após ser analisado**: a análise antiga permanece atrelada ao texto que foi
  analisado (guarda o instantâneo do original); o alternador deixa claro que a correção se refere
  à versão analisada.
- **Bullet excluído**: as análises e a contribuição ao histórico daquele bullet são removidas
  junto (não deixam registros órfãos).
- **Conceito fora do vocabulário conhecido**: o tutor ainda registra o aprendizado, agrupando-o
  no bucket "outros" da lista canônica, sem quebrar o acompanhamento por conceito.
- **Conceito com poucas análises**: enquanto um conceito tiver menos de 3 análises, a tela mostra
  o selo "poucos dados" e omite o indicador de tendência (a maestria já aparece).
- **Guia com conceito-alvo nunca praticado**: se um conceito-alvo do guia ainda não teve análises,
  a tela o mostra como "sem dados ainda" em vez de omiti-lo, para deixar o foco visível.
- **Nenhum guia ativo**: a análise funciona normalmente, apenas sem ênfase direcionada; a tela de
  progresso mostra todos os conceitos sem destaque de foco.
- **Erro/instabilidade do serviço de análise**: nenhuma análise parcial é salva; o usuário recebe
  mensagem clara e pode tentar de novo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST oferecer, em cada bullet do diário, uma ação discreta para solicitar
  a análise de escrita daquele bullet.
- **FR-002**: Ao ser acionado, o sistema MUST analisar a gramática do texto do bullet no idioma-alvo
  e produzir: (a) versão corrigida (correção gramatical mínima), (b) uma **reescrita
  natural/idiomática** (como um nativo escreveria o mesmo conteúdo), (c) lista de erros, cada um
  com o conceito gramatical e uma explicação didática em português, (d) resumo do que foi ensinado
  na voz da persona tutora, e (e) uma nota de 0 a 100 para a escrita.
- **FR-003**: O sistema MUST apresentar o resultado da análise ao usuário num painel dedicado
  logo após a análise.
- **FR-004**: O sistema MUST preservar o texto original do bullet inalterado; a versão corrigida
  é armazenada separadamente e nunca substitui o que o usuário escreveu.
- **FR-005**: Após uma análise, o sistema MUST exibir no bullet um alternador discreto entre o
  texto original e a versão corrigida (a correção gramatical), disponível ao reabrir o diário. A
  reescrita natural/idiomática é apresentada no painel de análise, não no alternador do bullet.
- **FR-006**: O sistema MUST manter um perfil de habilidade por conceito gramatical que acumula
  ao longo do tempo, com uma medida de maestria (0–100) e uma tendência (subindo / caindo /
  estável) por conceito. A maestria MUST mudar somente quando o conceito reaparece numa nova
  análise — não decai apenas pela passagem do tempo sem prática.
- **FR-007**: Cada análise MUST atualizar o perfil dos conceitos envolvidos — registrando os
  conceitos usados corretamente e os que apresentaram erro — de modo que a maestria reflita a
  melhora ou piora ao longo das análises.
- **FR-008**: O sistema MUST oferecer uma tela de progresso que lista os conceitos com barra de
  maestria, indicador de tendência e o histórico das análises recentes. Um conceito MUST aparecer
  desde a sua 1ª ocorrência, sinalizado com um selo "poucos dados" enquanto tiver menos de 3
  análises; o indicador de tendência só MUST ser exibido a partir de 3 análises daquele conceito.
- **FR-014**: O sistema MUST identificar os conceitos gramaticais a partir de uma lista canônica
  curada (~20–30 conceitos comuns); qualquer conceito fora dessa lista MUST ser agrupado num
  bucket "outros", sem interromper o acompanhamento por conceito.
- **FR-015**: O sistema MUST permitir ao usuário definir, editar e remover um **guia de estudo**
  ativo, composto por uma descrição em texto livre do que está seguindo (livro/método/tópico) e,
  opcionalmente, uma seleção de conceitos-alvo da lista canônica. Há no máximo **um guia ativo**
  por idioma por vez.
- **FR-016**: Quando há um guia ativo, o sistema MUST orientar cada análise por ele — enfatizando
  os conceitos-alvo do foco nas correções e explicações e incluindo no resumo um comentário sobre
  o progresso do usuário naquele foco.
- **FR-017**: Quando há um guia ativo, a tela de progresso MUST destacar (ou permitir filtrar) os
  conceitos-alvo do guia.
- **FR-018**: Alterar ou remover o guia de estudo MUST afetar apenas as análises futuras; as
  análises já salvas e o histórico de progresso permanecem inalterados.
- **FR-019**: A tela de progresso MUST exibir um **nível estimado** de proficiência (escala CEFR
  A1–C2) por idioma, derivado das notas das análises recentes. Enquanto houver poucas análises, o
  nível MUST ser sinalizado como estimativa preliminar.
- **FR-020**: Com histórico suficiente, o sistema MUST apresentar uma **sugestão de próximo foco**
  (conceito ou área a estudar) na voz da persona tutora, baseada nos conceitos de menor maestria e,
  quando houver, no guia de estudo ativo.
- **FR-009**: O sistema MUST associar a cada aprendizado registrado o idioma-alvo, de modo que o
  acompanhamento seja separado por idioma (mesmo que a interface ofereça apenas inglês nesta versão).
- **FR-010**: O sistema MUST tratar falhas do serviço de análise sem salvar resultados parciais,
  comunicando o erro em português de forma amigável.
- **FR-011**: Ao excluir um bullet, o sistema MUST remover as análises associadas e sua
  contribuição, sem deixar registros órfãos.
- **FR-012**: O sistema MUST restringir o acesso a estas funções ao usuário autenticado do painel
  (mesma regra de acesso das demais áreas do diário).
- **FR-013**: A funcionalidade MUST estar disponível apenas na interface web (Violet) nesta versão;
  não há necessidade de acioná-la por outro canal (ex.: chat).

### Key Entities *(include if feature involves data)*

- **Análise de escrita**: o resultado de uma avaliação de um bullet num idioma. Guarda o texto
  original analisado (instantâneo), o texto corrigido (correção gramatical), a reescrita
  natural/idiomática, a lista de erros (com conceito e explicação), o resumo do aprendizado, a
  nota e o momento da análise. Pertence a um bullet.
- **Ocorrência de conceito**: o registro, por análise, de um conceito gramatical e se ele foi
  usado corretamente ou com erro naquela análise. É a base histórica do progresso.
- **Habilidade por conceito**: o perfil acumulado de um conceito gramatical num idioma — maestria
  atual (0–100), tendência e quando foi visto pela última vez. Derivável do histórico de
  ocorrências.
- **Conceito gramatical**: a unidade de aprendizado (ex.: "verb to be", "artigos", "past simple"),
  identificada de forma estável a partir de uma **lista canônica curada** para permitir a
  comparação ao longo do tempo; conceitos fora da lista são agrupados como "outros".
- **Guia de estudo (foco ativo)**: o que o usuário está seguindo num idioma — uma descrição em
  texto livre (livro/método/tópico) e, opcionalmente, um conjunto de conceitos-alvo da lista
  canônica. No máximo um por idioma ativo por vez; orienta as análises e o destaque na tela de
  progresso enquanto estiver ativo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A partir de um bullet escrito, o usuário consegue obter uma análise completa
  (correção + erros explicados + resumo + nota) com uma única ação, e vê o resultado em poucos
  segundos.
- **SC-002**: Em 100% das análises concluídas, o texto original do bullet permanece inalterado em
  todas as telas do diário.
- **SC-003**: Após analisar um bullet, o alternador original ↔ corrigido continua disponível ao
  reabrir o diário em uma nova sessão (a correção persiste).
- **SC-004**: Depois de pelo menos 3 análises em que um conceito passa de "com erro" para "usado
  corretamente", a maestria desse conceito aumenta de forma perceptível e a tendência indica
  melhora — verificável na tela de progresso (antes de 3 análises, o conceito exibe o selo
  "poucos dados" e ainda não mostra tendência).
- **SC-005**: Uma falha do serviço de análise nunca resulta em dado salvo pela metade; o usuário
  recebe mensagem clara e pode repetir a ação.
- **SC-006**: O acompanhamento é separado por idioma desde o primeiro registro, sem retrabalho de
  dados para habilitar um segundo idioma no futuro.
- **SC-007**: Com um guia de estudo ativo, o usuário percebe que as análises dão ênfase ao foco
  escolhido (correções/explicações e resumo tratam prioritariamente os conceitos-alvo) e que a
  tela de progresso destaca esses conceitos; ao remover o guia, as análises seguintes voltam ao
  comportamento geral.
- **SC-008**: A cada análise, o usuário recebe — além da correção — uma reescrita natural do que
  escreveu; e na tela de progresso vê um nível estimado (CEFR) e uma sugestão clara do que estudar
  a seguir.

## Assumptions

- O idioma-alvo desta versão é **inglês**; a interface expõe apenas inglês, mas os dados guardam o
  idioma para expansão futura sem migração.
- A persona do tutor é a **Kurisu** (agente de conhecimento do projeto), reaproveitando a dinâmica
  cross-agent; nesta versão os aprendizados ficam numa tabela própria do diário e **não** são
  exportados para a memória/base de conhecimento da Kurisu (gancho para uma spec futura).
- O usuário é único e já autenticado no painel; valem as mesmas regras de acesso do restante do
  diário.
- A análise é **sob demanda** (acionada pelo botão), nunca automática ao salvar um bullet.
- A maestria e a tendência por conceito são **derivadas do histórico de análises** (calculadas a
  partir dos acertos/erros registrados), não informadas manualmente pelo usuário. A maestria não
  decai pela passagem do tempo — só se atualiza quando o conceito reaparece numa nova análise.
- A **lista canônica de conceitos** cobre os erros mais comuns de aprendizes de inglês; ela pode
  crescer no futuro sem migração, e conceitos não mapeados caem no bucket "outros".
- "Hoje"/datas exibidas seguem o fuso local do usuário (UTC-3), como no restante do diário.
- O material analisado é o texto de **um** bullet por vez (não o dia inteiro).
- O **guia de estudo** é fornecido pelo usuário (texto + conceitos-alvo); nesta versão o sistema
  não importa o conteúdo do livro/método de nenhuma base externa. Puxar automaticamente o material
  da base de conhecimento da Kurisu (RAG) fica como gancho para uma spec futura.
