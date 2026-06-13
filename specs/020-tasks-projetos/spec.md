# Feature Specification: Planejamento de Projetos — Camada de Organização + Projetos na Kaguya

**Feature Branch**: `020-tasks-projetos`

**Created**: 2026-06-13

**Status**: Draft

**Conceito de origem**: este spec materializa o conceito desenhado em
`C:\Users\gusta\.claude\plans\quero-que-a-kaguya-luminous-waffle.md` (sessão de
brainstorming). Ele se apoia no sistema de tarefas já entregue nas fases 011–013
(Listas, Kanban, tarefas+subtarefas, tags, smart-lists, recorrência) e em 016
(Meu Dia + motor de capacidade `capacity.py`, cujo estilo de **motor puro** é
reaproveitado aqui). Todo o frontend segue os tokens visuais do shell Kaguya já
existente (`webapp/frontend/src/pages/kaguya/kaguya.css`).

**Input**: User description: "Quero que a Kaguya tenha uma parte de planejamento de
projetos. Para usar no trabalho (Data Science, BI, código) e também para projetos
pessoais não-técnicos. Vamos ancorar em três frameworks que se compõem: **PARA** (Second
Brain) como organização de alto nível das Listas; **GTD Natural Planning** como esqueleto
de cada projeto (Propósito → Visão → Brainstorm → Fases → Próximas ações); e o **Meu Dia**
existente como execução. Fase = marco (data-alvo opcional). Saúde do projeto ponderada por
estimativa (`duration_min`). Templates por tipo (DS/BI/código/pessoal). Webapp primeiro,
**guiando o usuário pela mão** na construção do projeto (wizard, empty states que ensinam),
Telegram básico. Sem dependências entre tarefas."

---

## Escopo da fase

**Entra nesta fase**:

1. **Camada de organização PARA** sobre as Listas que já existem — baldes Projetos / Áreas
   / Arquivo na sidebar (Recursos reservado para o futuro), com os Grupos (pastas) aninhados
   dentro de um balde. Mover Listas entre baldes.
2. **Projeto = Lista promovida + esqueleto GTD** — propósito, visão, brainstorm, status,
   datas; **Fases** (com data-alvo opcional = marco) agrupando tarefas existentes.
3. **Motor de saúde** puro e derivado (nunca persistido): % concluído ponderado por
   estimativa (`duration_min`), por fase e do projeto, com status 🟢/🟡/🔴.
4. **Templates por tipo** que semeiam fases na criação (Data Science/CRISP-DM, BI, código,
   pessoal genérico).
5. **Webapp que guia a construção** — wizard passo a passo (tipo → propósito → visão →
   fases sugeridas → primeira ação), tela do Projeto (cabeçalho + board de fases + saúde),
   e **timeline** (Gantt-leve; marcos = fases com data).
6. **Telegram básico** — criar/promover projeto, consultar saúde, próxima ação, mover entre
   baldes.

**Fica para fases futuras**: o balde **Recursos (R)** completo (provável ponte com a
**Kurisu**, RAG do vault Obsidian); **ritual de revisão** de Áreas (weekly/monthly review
do GTD); **dependências entre tarefas / caminho crítico**; sprints/velocity/burndown;
colaboração; templates editáveis pelo usuário (v1 traz moldes fixos no código).

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Organizar tudo por acionabilidade com PARA (Priority: P1)

Abro `/tasks` e minhas Listas aparecem organizadas em **baldes de topo** na sidebar:
**Projetos** (metas com prazo), **Áreas** (responsabilidades contínuas, sem prazo) e
**Arquivo** (inativas). Cada Lista declara seu balde; meus Grupos (pastas) ficam aninhados
dentro de um balde. Movo uma Lista de balde com uma ação direta.

**Why this priority**: é a fundação de organização — sem saber *onde cada coisa vive*, o
planejamento de projeto fica solto. Sozinha, esta story já arruma a casa e dá clareza
imediata, separando "o que tem prazo" do "o que eu só mantenho".

**Independent Test**: com o banco existente (Listas e Grupos já criados), classificar cada
Lista num balde, mover Listas entre baldes, e confirmar que a sidebar reflete a hierarquia
`Balde → Grupo → Lista` e que o Arquivo lista as arquivadas.

**Acceptance Scenarios**:

1. **Given** Listas existentes sem classificação, **When** abro `/tasks`, **Then** elas
   aparecem por padrão no balde **Áreas** (default seguro) e o Inbox segue no topo.
2. **Given** uma Lista no balde Áreas, **When** a movo para **Projetos**, **Then** a
   mudança persiste e ela passa a aparecer na seção Projetos na próxima carga.
3. **Given** um Grupo (pasta) com Listas, **When** olho a sidebar, **Then** o Grupo aparece
   dentro de um único balde e suas Listas sob ele.
4. **Given** uma Lista arquivada (`archived_at` preenchido), **When** olho a sidebar,
   **Then** ela aparece no balde **Arquivo**, independente do seu `para_type`.
5. **Given** o balde **Recursos**, **When** olho a sidebar nesta fase, **Then** ele não
   aparece (reservado para o futuro) — sem erro nem seção vazia.

---

### User Story 2 - Promover uma Lista a Projeto com fases e saúde (Priority: P1)

Pego uma Lista e a **promovo a Projeto**: ela ganha **propósito** (por quê), **visão de
sucesso**, **status** e datas. Crio **Fases** (ex.: Coleta → Limpeza → Modelagem → Deploy),
cada uma com data-alvo opcional, e ligo tarefas a fases. Pelo Telegram pergunto "como está
o projeto X?" e a Kaguya responde com a **saúde** (🟢/🟡/🔴), o % concluído e a fase atual.

**Why this priority**: é o coração da feature — a camada de planejamento por cima das
tarefas. Entrega valor já pelo Telegram, antes mesmo da UI rica.

**Independent Test**: com o schema aplicado, promover uma Lista, semear fases (na mão ou
por template), atribuir tarefas a fases, e validar que `project_status` agrega o progresso
correto e classifica a saúde conforme as datas.

**Acceptance Scenarios**:

1. **Given** uma Lista comum, **When** a promovo a Projeto, **Then** ela passa a ter
   `para_type='project'` e um registro de plano com propósito/visão/status, sem mover
   nenhuma tarefa.
2. **Given** um Projeto, **When** crio fases com data-alvo, **Then** elas ficam ordenadas e
   uma fase com data aparece como **marco**.
3. **Given** tarefas atribuídas a fases, **When** consulto a saúde, **Then** o % concluído é
   **ponderado por estimativa** (`duration_min`) e há uma barra por fase.
4. **Given** um Projeto com `start_date` e `target_date`, **When** o ritmo real fica abaixo
   do esperado pela linha do tempo, **Then** o status é 🟡 (em risco) ou 🔴 (atrasado);
   senão 🟢.
5. **Given** um Projeto sem datas (ou uma Área), **When** consulto a saúde, **Then** recebo
   só os percentuais, **sem** status de prazo (degradação graciosa).
6. **Given** "qual a próxima ação do projeto X?", **When** a Kaguya responde, **Then** ela
   indica a próxima tarefa aberta do projeto e pode adicioná-la ao Meu Dia.

---

### User Story 3 - Construir um projeto guiado pela webapp (Priority: P1)

Crio um projeto pela webapp e a tela **me conduz pela mão**: escolho o **tipo** (que já
semeia as fases), respondo *por que* quero fazer isso, *como vai ser quando estiver pronto*,
ajusto as **fases sugeridas** e capturo a **primeira ação**. Depois, na tela do Projeto, vejo
cabeçalho (propósito/visão/saúde), o **board de fases** com tarefas e a **próxima ação
sempre em destaque**. Empty states me dizem o próximo passo; nunca encaro um formulário vazio.

**Why this priority**: é o **critério de sucesso da feature** (decisão do usuário): alguém
que nunca planejou um projeto consegue montar um bom plano só seguindo a tela. A webapp é a
superfície primária.

**Independent Test**: criar um projeto do zero pelo wizard sem instrução externa, pulando
passos opcionais, e confirmar que ao final existe um projeto com fases e uma primeira ação;
abrir a tela do Projeto e ver saúde + board de fases + próxima ação.

**Acceptance Scenarios**:

1. **Given** o botão "Novo projeto", **When** abro o fluxo, **Then** vejo um **wizard passo
   a passo** (uma pergunta por vez), não um formulário cheio de campos.
2. **Given** o passo de tipo, **When** escolho "Data Science", **Then** as fases CRISP-DM
   são pré-criadas e exibidas para eu ajustar.
3. **Given** um projeto pessoal simples, **When** preencho só nome + tipo e pulo o resto,
   **Then** o projeto é criado em segundos (cada passo é pulável).
4. **Given** a tela de um Projeto sem propósito, **When** a abro, **Then** um empty state me
   convida a "definir por que este projeto existe →" (nunca uma tela morta).
5. **Given** uma fase sem tarefas, **When** olho o board, **Then** ela mostra "adicione a
   primeira ação desta fase".
6. **Given** a tela do Projeto, **When** a olho, **Then** a **próxima ação** aparece sempre
   em destaque no cabeçalho.
7. **Given** uma Lista comum na sidebar, **When** clico em "Promover a Projeto", **Then** o
   mesmo wizard abre já vinculado àquela Lista (sem duplicar tarefas).

---

### User Story 4 - Ver o projeto na linha do tempo (Priority: P2)

No projeto, abro a **timeline** e vejo as fases numa régua de datas — sobreposições,
prazos e os **marcos** (fases com data-alvo) de relance, do começo ao fim do projeto.

**Why this priority**: a timeline é a visão macro que fecha o ciclo de planejamento, mas o
projeto já é gerenciável pelo board de fases (US3). Vem depois por depender das fases e datas.

**Independent Test**: num projeto com fases datadas, abrir a timeline e validar que cada
fase aparece na posição correta da régua e que fases com data-alvo são marcadas como marco.

**Acceptance Scenarios**:

1. **Given** um projeto com fases datadas, **When** abro a timeline, **Then** cada fase
   aparece posicionada entre `start_date` e `target_date` do projeto.
2. **Given** uma fase com data-alvo, **When** olho a timeline, **Then** ela é destacada como
   **marco**.
3. **Given** uma fase sem data, **When** olho a timeline, **Then** ela aparece de forma
   coerente (ex.: sequencial), sem quebrar a régua.
4. **Given** o seletor de template no wizard, **When** crio o projeto, **Then** as fases
   semeadas já aparecem na timeline.

---

### Edge Cases

- **Promover Lista que já é Projeto**: a ação é idempotente/bloqueada com mensagem amigável
  ("esta Lista já é um Projeto") — nunca cria plano duplicado (`project_id` é UNIQUE).
- **Rebaixar Projeto para Lista/Área**: o plano e as fases são removidos (ou arquivados);
  as tarefas **permanecem** na Lista, perdendo só o vínculo de fase (`phase_id = NULL`).
- **Apagar uma fase com tarefas**: as tarefas ficam sem fase (`phase_id = NULL`), visíveis
  na Lista normalmente — nunca são excluídas junto.
- **Saúde sem nenhuma estimativa**: se nenhuma tarefa tem `duration_min`, o peso-fallback
  (padrão) é aplicado a todas, e o % vira efetivamente contagem de tarefas — sem divisão
  por zero.
- **Projeto sem fases**: a saúde considera todas as tarefas da Lista como um bloco único; o
  board mostra uma seção "sem fase".
- **`target_date` no passado com projeto incompleto**: status 🔴 (atrasado), independentemente
  do ritmo.
- **Mover Lista para Arquivo**: usa o `archived_at` existente; o `para_type` é preservado
  para quando ela for desarquivada.
- **Tarefa de uma fase movida para outra Lista**: ao trocar de Lista (Projeto), a tarefa
  perde o vínculo de fase (`phase_id = NULL`) — fases pertencem a um plano específico.
- **Conflito de canais (webapp + Telegram)**: last-write-wins, como no resto da Kaguya; a
  UI re-busca o estado após cada mutação.

## Requirements *(mandatory)*

### Functional Requirements

**Organização PARA**

- **FR-001**: Toda Lista (`task_projects`) e todo Grupo (`task_project_groups`) MUST ter uma
  classificação PARA (`para_type` ∈ {`project`, `area`, `resource`}), com `area` como padrão
  seguro para o legado.
- **FR-002**: A sidebar MUST organizar as Listas em baldes de topo — **Projetos**, **Áreas**
  e **Arquivo** nesta fase (Recursos reservado, não exibido) — com os Grupos aninhados dentro
  de um balde e o Inbox sempre acessível.
- **FR-003**: O balde **Arquivo** MUST ser derivado de `archived_at IS NOT NULL`, ortogonal
  ao `para_type` (arquivar/desarquivar não altera o `para_type`).
- **FR-004**: Usuário MUST poder mover uma Lista entre baldes (alterar `para_type`) pelos dois
  canais.

**Projeto + esqueleto GTD**

- **FR-005**: Usuário MUST poder **promover** uma Lista a Projeto e **rebaixá-la**; promover
  cria um plano 1:1 com a Lista e seta `para_type='project'`; rebaixar remove plano e fases
  preservando as tarefas (`phase_id = NULL`).
- **FR-006**: Um Projeto MUST guardar propósito, visão, brainstorm (notas livres), status
  (`planejado`/`ativo`/`pausado`/`concluido`/`arquivado`), `start_date` e `target_date`
  (todos opcionais exceto status, que tem default).
- **FR-007**: Usuário MUST poder criar, renomear, reordenar (posições esparsas) e excluir
  **Fases** de um Projeto; cada Fase MAY ter `target_date` (com data = marco).
- **FR-008**: Toda tarefa MAY pertencer a uma Fase (`phase_id` opcional); excluir a fase
  desliga o vínculo sem apagar a tarefa.

**Saúde / rollup**

- **FR-009**: O sistema MUST calcular a saúde do Projeto de forma **derivada** (nunca
  persistida): % concluído **ponderado por estimativa** (`duration_min`), por Fase e do
  Projeto inteiro; tarefas sem estimativa recebem um peso-fallback determinístico.
- **FR-010**: Quando o Projeto tem `start_date` e `target_date`, o sistema MUST classificar a
  saúde em 🟢 (no prazo) / 🟡 (em risco) / 🔴 (atrasado) comparando o ritmo real com o
  esperado pela linha do tempo; sem datas (ou em Áreas), o status de prazo é omitido.

**Templates**

- **FR-011**: A criação de um Projeto MUST oferecer **templates por tipo** (Data Science /
  CRISP-DM, Dashboard BI, Projeto de código, Pessoal genérico) que **semeiam as fases**;
  todas as fases semeadas MUST ser editáveis depois. Os moldes são fixos no código nesta fase.

**Webapp guiado (superfície primária)**

- **FR-012**: A criação/promoção de Projeto no webapp MUST ser um **wizard passo a passo**
  (tipo → propósito → visão → fases sugeridas → primeira ação), com **cada passo pulável** —
  nunca um formulário vazio.
- **FR-013**: A tela do Projeto MUST usar **empty states que ensinam o próximo passo**,
  **divulgação progressiva** (campos avançados só quando relevantes) e manter a **próxima
  ação sempre visível** no cabeçalho.
- **FR-014**: A webapp MUST oferecer o **board de fases** (fases como seções com tarefas e
  barra de progresso) e a **timeline** (Gantt-leve, marcos = fases com data).

**Paridade e canais**

- **FR-015**: Toda regra de negócio de planejamento MUST viver numa única camada de lógica
  (`tools_plans.py` + motores puros); Telegram e webapp MUST ser fachadas finas e paritárias
  (nenhuma regra duplicada ou exclusiva de canal), como no resto da Kaguya.
- **FR-016**: O Telegram MUST cobrir o essencial: criar/promover projeto (com template),
  consultar saúde/status, próxima ação e mover Lista entre baldes.

### Key Entities

- **Plano de Projeto** (`project_plans`): a promoção de uma Lista; guarda propósito, visão,
  brainstorm, status, datas e o tipo de template. 1:1 com a Lista.
- **Fase** (`project_phases`): etapa de um Projeto, com data-alvo opcional (= marco) e
  posição; agrupa tarefas.
- **Lista** (`task_projects`, existente): ganha `para_type`; continua sendo o container das
  tarefas.
- **Grupo** (`task_project_groups`, existente): ganha `para_type`; pasta dentro de um balde.
- **Tarefa** (`tasks`, existente): ganha `phase_id` opcional.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: **Critério de sucesso da UX guiada** — um usuário que nunca planejou um projeto
  consegue, **só seguindo o wizard** (sem ajuda externa), criar um projeto com fases e uma
  primeira ação. Se a tela "trava" o usuário ou exige um formulário vazio, falhou.
- **SC-002**: Criar um projeto técnico a partir de um template leva ≤ 30s e já nasce com as
  fases do molde; um projeto pessoal mínimo (nome + tipo) nasce em ≤ 10s.
- **SC-003**: 100% das operações essenciais (promover, criar fase, mover entre baldes,
  consultar saúde, próxima ação) executáveis pelos dois canais, com cada canal funcionando
  com o outro desligado (auditável por checklist de paridade).
- **SC-004**: A saúde reflete corretamente o progresso ponderado: dado um conjunto de tarefas
  com estimativas conhecidas, o % e o status (🟢/🟡/🔴) batem com o cálculo esperado (coberto
  por teste do motor puro).
- **SC-005**: Zero divergência entre views: promover/criar fase/atribuir tarefa feito num
  canal aparece nos demais na próxima leitura (mesma base, sem sync).
- **SC-006**: Toda a organização PARA é não-destrutiva sobre o legado: aplicar a feature num
  banco com Listas existentes não move nem apaga nenhuma tarefa; Listas sem classificação
  caem em Áreas.

## Assumptions

- O schema novo é aplicado pelo mesmo mecanismo dos outros agentes
  (`scripts/setup_schemas.py`, executado de dentro do container no VPS — ver `CLAUDE.md`
  raiz), de forma **idempotente** (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`).
- O motor de saúde segue o estilo de **motor puro** já consagrado em `capacity.py` (sem banco,
  sem rede, 100% testável) — reuso de padrão, não dependência nova.
- A estimativa de tarefa usa o campo `duration_min` que **já existe** (introduzido no Meu Dia,
  fase 016) — nenhum campo novo de estimativa é criado.
- A UI segue os tokens OKLCH do shell Kaguya existente (`kaguya.css`), sem biblioteca de UI
  nova; o `design-guide.md` desta spec descreve o wizard, a tela do Projeto e a timeline.
- "Projeto" aqui é uma **Lista promovida** — a UI continua chamando a entidade base de
  "Lista"; "Projeto" é o estado de uma Lista que tem plano.
- Nenhuma dependência nova: sem biblioteca de Gantt (a timeline é desenhada com os
  primitivos do shell), sem `dateutil` adicional além do já presente.
- O domínio de sessão "tarefas" do coordinator permanece o mesmo — só ganha tools novas.
