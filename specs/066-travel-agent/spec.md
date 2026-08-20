# Feature Specification: Yato — agente de Viagens (fatia 066)

**Feature Branch**: `066-travel-agent`

**Created**: 2026-08-20

**Status**: Draft

**Input**: "Vamos criar um novo agente.. tanto no bot quanto to front end.. Joguei a base dele no
arquivo specs/065-travel-agent/research.md. Me ajude a criar as specs iniciais com o speckit."

**Decisões fechadas no brainstorm**:
numeração = **066** (a 065 já é "Kaguya — modo férias" no `ROADMAP.md`; a pasta foi renomeada com
`git mv`, preservando o histórico do `research.md`); persona = **Yato** (*Noragami*) — o deus
errante sem templo que atende qualquer pedido por 5 ienes, encaixe natural para viagem solo,
low-budget e itinerante; storage = **PostgreSQL** (padrão da casa); escopo = **MVP sem APIs pagas**
— nenhuma integração com Amadeus/Skyscanner/Google Flights, ClickBus/Buser, GTFS ou Google
Places/Routes nesta fatia, portanto **zero env var nova**; entrega = **agente conversacional
(bot em produção via Hermes/MCP) + front-end React**, os dois na mesma fatia, a pedido do usuário.

**Fonte de conhecimento**: `specs/066-travel-agent/research.md` (duas pesquisas). O núcleo do
domínio é o **medo de mobilidade urbana** do viajante solo sem carro: 51% dos municípios
brasileiros (2.867) não têm ônibus urbano e apps de corrida chegam a apenas 26% (1.465) — MUNIC/IBGE
via NTU. Nenhum número de cobertura é confiável (a 99 aparece com 1.093 cidades numa fonte e 3.600
na declaração da própria empresa), e é por isso que o agente **verifica antes de afirmar**.

---

## Escopo da fatia

**Entra na 066** (schema novo — `agents/yato/schema_pg.sql` — mais o agente, o toolset MCP,
a skill do Hermes e o front-end):

- **Catálogo de viagens** — tabela `trips`: destino (cidade + UF), datas de ida/volta, perfil
  (`economia` | `equilibrado` | `conforto`), status (`planejando` | `confirmada` | `em_curso` |
  `concluida` | `cancelada`), notas e soft delete. Viagens passadas podem ser cadastradas como
  histórico.
- **Roteiro dia a dia** — tabela `trip_items`: uma linha por atividade, ancorada em uma data do
  intervalo da viagem, com **período** (`manha` | `tarde` | `noite`) obrigatório e **horário
  opcional**, endereço/referência, custo estimado, modal de deslocamento até o item
  (`a_pe` | `transporte_publico` | `app_corrida` | `taxi` | `mototaxi` | `transfer` | `outro`) e
  posição dentro do dia. O agrupamento geográfico por dia é **assistido, não algorítmico** — o
  agente recomenda, o usuário decide.
- **Dossiê de mobilidade do destino** — o diferencial do agente. Tabelas `mobility_dossiers` (1 por
  cidade) e `mobility_checks` (1 por passo do protocolo). Materializa o **protocolo de 7 passos** do
  research: (1) calibrar expectativa pelo porte da cidade, (2) verificar Uber, (3) verificar 99,
  (4) verificar InDrive, (5) verificar transporte público no Google Maps/Moovit, (6) plano B pela
  hospedagem (WhatsApp da pousada), (7) estimar deslocamentos. Cada passo carrega um **veredito**
  — `confirmado` | `ausente` | `inconclusivo` — mais a fonte e a data da checagem.
- **Base de conhecimento de mobilidade regional** — tabela-semente `mobility_apps` com os apps do
  research (Garupa, Urbano Norte, Ubiz Car, BibiMob, Bora94, Chofer 46, Urban66, Rota Pop, V1,
  InDrive, Uber, 99) e os de transporte público (Cittamobi, Moovit), com abrangência **declarada**
  por região/UF, link e observações. Serve para o agente responder "o que instalar antes de
  embarcar" — mas cobertura declarada nunca vira veredito: quem decide é o dossiê.
- **Matriz economia × conforto** — motor **puro** (sem banco), no padrão `capacity.py` /
  `goal_progress.py` da Kaguya: categorias rodoviárias da ANTT (convencional → executivo →
  semi-leito → leito → leito-cama) com a heurística de **custo de exaustão** (viagem noturna acima
  de 8h em convencional anula o dia seguinte; leito-cama acima de 12h substitui a diária de hotel)
  e a fila de **ROI de upgrades** (transfer privativo > upgrade de hotel > passeio privativo >
  executiva doméstica).
- **Orçamento estimado × realizado** — tabela `trip_budget_items` por categoria (`transporte_ida`,
  `transporte_volta`, `hospedagem`, `alimentacao`, `mobilidade_local`, `passeios`, `outros`), com
  **cross-agent Nami**: registrar um gasto realizado lança a despesa na mesma transação PostgreSQL,
  no padrão atômico de `complete_payment_task` (Kaguya↔Nami).
- **Checklist pré-viagem** — tabela `trip_checklist_items`, semeada a partir do dossiê (instalar o
  app X, salvar o telefone da cooperativa de táxi, combinar o transfer com a pousada, baixar o mapa
  offline, compartilhar o roteiro com alguém de confiança) e aberta a itens livres.
- **Agente Yato** — `agents/yato/` com `tools.py` (fachada), módulos de lógica, `agent.py`
  (singleton ADK `gemini-2.5-flash`, sem MCP próprio) e `toolset.py` (`TOOLS: list[Callable]`)
  registrado em `DOMAINS["yato"]` de `mcp_servers/makima/registry.py` — é assim que o bot em
  produção (Hermes) enxerga o domínio.
- **Skill do Hermes** — `hermes/skills/yato-viagens/SKILL.md`, no padrão de `nami-financas`.
- **Front-end** — shell `webapp/frontend/src/pages/yato/` + router `webapp/backend/routers/travel.py`
  (`/api/travel/*`), no padrão de `movies.py` + `AkaneShell.tsx`. Telas: lista de viagens, detalhe
  com roteiro por dia, painel do dossiê de mobilidade, orçamento e checklist.

**Fica para depois** (o research pede muito mais do que uma fatia aguenta — registrado aqui para
não se perder):

- **Google Places / Routes** — horários de funcionamento, matriz de distâncias e tempo real de
  deslocamento a pé / de carro / de transporte público.
- **GTFS** (Schedule e Realtime) e roteadores próprios (OpenTripPlanner, OSRM) — hoje o agente
  registra *se* há transporte público, não *qual linha às que horas*.
- **Busca de passagens** — aéreas (Google Flights / Skyscanner / Amadeus) e rodoviárias
  (ClickBus / Quero Passagem / Buson / Buser), com alertas de preço e a janela de compra de 21–45
  dias. Nesta fatia o agente **orienta** (janela, dia da semana, comparadores a abrir), não compra
  nem cota.
- **Roteiro multi-destino** — uma viagem com várias cidades (`trip_destinations`), com o roteiro e o
  dossiê pendurados no destino em vez da viagem.
- **Clusterização geográfica** dos pontos por dia (K-Means / DBSCAN) e otimização de rota.
- **Milhas e cashback** — Livelo / Smiles / Latam Pass / Azul Fidelidade, Méliuz.
- **Cross-agent Kaguya** — virar tarefas e eventos no Calendar (comprar passagem, check-in, ida ao
  aeroporto/rodoviária).
- **Cross-agent Komi** — companhias de viagem e contatos locais (motorista, pousada).
- **Cross-agent Lucy** — importar confirmações de reserva do e-mail.
- **Cross-agent Violet** — puxar o diário do período da viagem para o retrospecto.
- **Hospedagem com "pontuação de localização"** — raio de caminhada até eixos de transporte, que
  depende de geocodificação (fatia 2).

---

## Clarifications

### Sessão 2026-08-20 (`/speckit.clarify`)

- **Multi-destino** → **uma cidade por viagem** na 066. `trips` carrega `city` + `state_uf`
  diretamente; roteiro itinerante (A → B → C) se modela como viagens encadeadas. Uma tabela
  `trip_destinations` pode ser introduzida na fatia 2 sem migrar dados existentes.
- **Escopo do dossiê** → **global por cidade + snapshot na viagem**. O dossiê vive em
  `mobility_dossiers` (uma linha por cidade+UF, reaproveitada entre viagens); ao mudar o status da
  viagem para `confirmada`, o sistema congela uma cópia do estado dos 7 checks em
  `trip_mobility_snapshots`, para que o histórico da viagem não seja reescrito por revalidações
  posteriores.
- **Momento do lançamento na Nami** → **no ato, um lançamento por gasto**. Cada gasto realizado vira
  uma despesa na Nami na mesma transação PostgreSQL, em tempo real durante a viagem. Sem
  consolidação ao fechar.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Criar a viagem e montar o roteiro (Priority: P1)

Pelo bot: "Yato, quero ir pra Tiradentes de 12 a 15 de setembro, modo economia." Ele cria a viagem,
entende que são 4 dias e me deixa ir preenchendo o roteiro por conversa — "no dia 13 de manhã, Igreja
São Francisco de Assis" — cada item ancorado num dia e num período. No webapp eu vejo a viagem com
os dias em colunas e os itens dentro.

**Why this priority**: sem o catálogo e o roteiro não existe objeto sobre o qual pendurar
mobilidade, orçamento e checklist. É a menor fatia que já entrega valor sozinha (substitui o
Google Docs / Notion de roteiro).

**Independent Test**: criar viagem, adicionar 5 itens em 3 dias, listar o roteiro pelo bot e pelo
webapp — sem tocar em nenhuma outra parte da feature.

**Acceptance Scenarios**:

1. **Given** nenhuma viagem cadastrada, **When** peço "criar viagem para Tiradentes/MG de 12/09 a
   15/09, perfil economia", **Then** a viagem é criada com status `planejando` e 4 dias derivados
   do intervalo.
2. **Given** a viagem criada, **When** adiciono "Igreja São Francisco de Assis" no dia 13 de manhã,
   **Then** o item aparece no dia 13, período `manha`, na última posição do período.
3. **Given** itens em dias diferentes, **When** peço o roteiro, **Then** recebo os itens agrupados
   por dia e ordenados por período (manhã → tarde → noite) e posição.
4. **Given** uma tentativa de adicionar item numa data fora do intervalo da viagem, **When** envio o
   pedido, **Then** o sistema recusa e explica o intervalo válido.

---

### User Story 2 - Dossiê de mobilidade: descobrir como me locomover ANTES de comprar (Priority: P1)

"Yato, como eu me viro em Tiradentes sem carro?" Ele **não** responde de memória: abre (ou retoma)
o dossiê da cidade e me conduz pelos 7 passos, um de cada vez, dizendo exatamente o que fazer em
cada um ("simule uma corrida no app da 99 com um endereço real da cidade e me diga se apareceu
carro"). Registra cada resposta como `confirmado`, `ausente` ou `inconclusivo`, com a fonte. No fim,
me devolve o veredito consolidado e a estratégia de mobilidade recomendada — e o webapp mostra o
mesmo painel com os 7 passos coloridos.

**Why this priority**: é o motivo de existir do agente. O research é inteiro construído sobre isso:
o risco não é a cidade ser perigosa, é o viajante ficar a pé sem alternativa.

**Independent Test**: rodar o protocolo completo para uma cidade, ver os 7 checks gravados com
veredito e fonte, e receber a estratégia recomendada — funciona mesmo sem roteiro montado.

**Acceptance Scenarios**:

1. **Given** uma cidade sem dossiê, **When** peço a checagem de mobilidade, **Then** o agente cria o
   dossiê e apresenta o passo 1 (porte da cidade + expectativa estatística), sem pular para o
   veredito.
2. **Given** o dossiê em andamento, **When** informo "a 99 mostrou carros na simulação", **Then** o
   passo da 99 fica `confirmado`, com fonte `simulacao_in_app` e a data de hoje.
3. **Given** que o Google Maps não mostra rotas de ônibus, **When** registro esse passo, **Then** o
   veredito é **`inconclusivo`** (nunca `ausente`) e o agente explica que só ~150 cidades
   brasileiras estão mapeadas no Moovit.
4. **Given** todos os passos de app e transporte público em `ausente` ou `inconclusivo`, **When**
   peço a recomendação, **Then** o agente recomenda transfer da hospedagem / táxi-mototáxi local e
   sinaliza que apps não são caminho confiável ali.
5. **Given** um dossiê com checagens de mais de 6 meses, **When** abro a viagem, **Then** o sistema
   marca o dossiê como desatualizado e sugere revalidar.

---

### User Story 3 - O que instalar e o que levar antes de embarcar (Priority: P2)

Com o dossiê fechado, peço o pacote de partida. Yato consulta a base de apps regionais pela UF do
destino ("no Norte/Nordeste, Urbano Norte; em Minas, Ubiz Car"), monta o checklist pré-viagem
(instalar apps, salvar telefone da cooperativa de táxi, combinar transfer, baixar mapa offline,
compartilhar roteiro com alguém de confiança) e eu vou marcando os itens no webapp.

**Why this priority**: converte o diagnóstico da US2 em ação. Depende do dossiê, por isso P2.

**Independent Test**: para uma cidade de MG, pedir sugestões de app e gerar o checklist; marcar
itens como feitos e ver o progresso.

**Acceptance Scenarios**:

1. **Given** destino em Minas Gerais, **When** peço apps de mobilidade, **Then** recebo os apps cuja
   abrangência declarada cobre MG, cada um marcado como "cobertura declarada — confirmar in-app".
2. **Given** o dossiê com "Uber ausente" e "transfer da pousada confirmado", **When** gero o
   checklist, **Then** ele inclui "combinar transfer com a pousada" e **não** inclui "instalar Uber".
3. **Given** o checklist gerado, **When** marco um item como concluído, **Then** o progresso do
   checklist é atualizado e persiste entre sessões.

---

### User Story 4 - Economia × conforto: escolher a classe do ônibus e onde gastar mais (Priority: P2)

"São 11 horas de ônibus, saindo 22h. Vale pagar leito?" Yato aplica a matriz: viagem noturna acima
de 8h ⇒ recomenda semi-leito ou superior; acima de 12h, mostra que o leito-cama pode substituir uma
diária de hotel. E quando sobra orçamento, ele ordena os upgrades por retorno: transfer privativo
primeiro (numa cidade sem app, é o maior ganho), depois hotel, depois passeio privativo — executiva
doméstica por último.

**Why this priority**: é a régua de decisão que o usuário pediu ("do máximo de economia a
investimentos pontuais em conforto"). Vale sozinho, sem viagem cadastrada.

**Independent Test**: chamar a recomendação com duração, período e orçamento e conferir a saída
contra a tabela da ANTT do research — motor puro, testável sem banco.

**Acceptance Scenarios**:

1. **Given** trecho de 11h em período noturno, **When** peço a recomendação de classe, **Then**
   recebo semi-leito ou superior, com a justificativa do custo de exaustão.
2. **Given** trecho de 3h diurno, **When** peço a recomendação, **Then** convencional é aceitável e
   o agente não empurra upgrade.
3. **Given** trecho de 13h noturno, **When** peço a recomendação, **Then** o agente compara o
   diferencial do leito-cama contra o custo de uma diária de hotel.
4. **Given** perfil `economia` com folga de orçamento e dossiê sem apps de corrida, **When** peço
   onde investir, **Then** o transfer privativo aparece no topo da fila de ROI.

---

### User Story 5 - Orçamento estimado × realizado, integrado à Nami (Priority: P3)

Defino o teto por categoria antes de sair. Durante a viagem, "Yato, gastei 45 no almoço" registra o
realizado **e** lança a despesa nas finanças da Nami de uma vez só. No fim, vejo estimado × realizado
por categoria e o total da viagem.

**Why this priority**: agrega valor real, mas a viagem já é planejável sem isso — e é a parte que
toca outro domínio, então entra por último.

**Independent Test**: definir estimativas, registrar dois gastos, conferir o resumo e confirmar que
as despesas apareceram na Nami com a mesma data e valor.

**Acceptance Scenarios**:

1. **Given** a viagem criada, **When** defino R$ 600 de hospedagem e R$ 400 de transporte, **Then**
   o orçamento total estimado é R$ 1.000.
2. **Given** o orçamento definido, **When** registro um gasto de R$ 45 em alimentação, **Then** o
   realizado da categoria sobe para R$ 45 **e** existe uma despesa correspondente na Nami.
3. **Given** uma falha ao lançar na Nami, **When** registro o gasto, **Then** **nada** é gravado dos
   dois lados (tudo-ou-nada) e o agente informa o erro.
4. **Given** gastos registrados, **When** peço o resumo, **Then** vejo estimado, realizado e saldo
   por categoria, com as categorias estouradas destacadas.

---

### Edge Cases

- **Viagem de um dia só** (bate-volta): o roteiro tem um único dia; o sistema não quebra.
- **Data de volta anterior à ida** ou intervalo maior que 60 dias: recusar com mensagem clara.
- **Item de roteiro sem horário**: é o caso normal — período basta; a ordenação usa a posição.
- **Alterar as datas de uma viagem que já tem itens**: itens fora do novo intervalo precisam de
  tratamento explícito (o sistema avisa quantos ficaram órfãos e pede a decisão, nunca apaga em
  silêncio).
- **Cidade homônima** (ex.: várias "Bom Jesus"): o dossiê é chaveado por cidade **+ UF**; se a UF não
  foi informada, o agente pergunta antes de criar.
- **Protocolo interrompido no meio**: o dossiê fica parcial e retomável; a recomendação consolidada
  informa que passos faltam checar em vez de fingir um veredito.
- **Cidade sem carro por definição** (Jericoacoara, Caraíva): o dossiê aceita ser fechado como
  "escala pedonal — mobilidade motorizada não se aplica".
- **App regional que encerrou a operação**: a base é heurística e pode estar velha; toda sugestão
  sai com o rótulo de cobertura declarada.
- **Gasto registrado sem viagem em curso**: recusar e pedir a viagem.
- **Fuso horário**: todas as datas usam `America/Sao_Paulo` (UTC-3) — nada de `CURRENT_DATE` nem de
  `toISOString()` no front (regra global do repo).
- **Viagem cancelada**: mantém histórico e orçamento realizado; some das visões de "próximas".

## Requirements *(mandatory)*

### Functional Requirements

**Catálogo e roteiro (US1)**

- **FR-001**: O sistema MUST persistir viagens em `trips` com `id` (UUID em TEXT), `title`,
  `city` NOT NULL, `state_uf` NOT NULL (2 letras) — **uma cidade por viagem** nesta fatia, `start_date` / `end_date` NOT NULL,
  `profile` (`economia` | `equilibrado` | `conforto`, default `equilibrado`), `status`
  (`planejando` | `confirmada` | `em_curso` | `concluida` | `cancelada`, default `planejando`),
  `notes`, `created_at` / `updated_at` TIMESTAMPTZ e `deleted` DEFAULT FALSE.
- **FR-002**: O sistema MUST validar `end_date >= start_date` e recusar intervalos acima de 60 dias.
- **FR-003**: O sistema MUST persistir itens de roteiro em `trip_items` com `trip_id` FK,
  `day_date` NOT NULL (dentro do intervalo da viagem), `period` (`manha` | `tarde` | `noite`)
  NOT NULL, `start_time` NULL-ável, `title` NOT NULL, `address`, `transport_mode`
  (`a_pe` | `transporte_publico` | `app_corrida` | `taxi` | `mototaxi` | `transfer` | `outro`),
  `cost_estimate` NUMERIC(10,2), `notes` e `position` INTEGER (ordem dentro do par dia+período).
- **FR-004**: O sistema MUST recusar item cujo `day_date` esteja fora de `[start_date, end_date]`,
  informando o intervalo válido.
- **FR-005**: Ao alterar as datas de uma viagem com itens fora do novo intervalo, o sistema MUST
  informar quantos itens ficaram órfãos e exigir decisão explícita (mover ou remover) — nunca
  apagar silenciosamente.
- **FR-006**: A listagem do roteiro MUST devolver os itens agrupados por `day_date` e ordenados por
  `period` (manhã → tarde → noite) e `position`.

**Dossiê de mobilidade (US2)**

- **FR-007**: O sistema MUST persistir um dossiê por cidade em `mobility_dossiers`
  (`city` + `state_uf` únicos), com `city_size` (`capital` | `media` | `pequena`),
  `pedestrian_scale` BOOLEAN (cidade de escala pedonal), `summary`, `last_checked_at` e
  `created_at` / `updated_at`.
- **FR-008**: O sistema MUST persistir os passos do protocolo em `mobility_checks`, um por
  `check_key` ∈ {`porte_cidade`, `uber`, `99`, `indrive`, `transporte_publico`,
  `hospedagem_transfer`, `deslocamentos`}, cada um com `verdict`
  (`confirmado` | `ausente` | `inconclusivo` | `pendente`), `source`
  (`simulacao_in_app` | `pagina_oficial` | `google_maps` | `moovit` | `contato_hospedagem` |
  `relato_local` | `outro`), `evidence` (texto livre) e `checked_at`.
- **FR-009**: O agente MUST conduzir o protocolo **passo a passo**, com a instrução operacional de
  cada passo (o research define exatamente o que fazer em cada um), e MUST NOT declarar veredito
  em nome do usuário.
- **FR-010**: Ausência de dado MUST ser gravada como `inconclusivo`, **nunca** como `ausente`.
  Especificamente: transporte público não aparecer no Google Maps/Moovit é `inconclusivo`.
- **FR-011**: O agente MUST NOT afirmar que Uber, 99, InDrive ou transporte público existem numa
  cidade sem um check `confirmado` no dossiê; sem isso, a resposta MUST ser explicitamente
  probabilística e vir acompanhada da instrução de verificação.
- **FR-012**: O sistema MUST consolidar o dossiê numa **estratégia de mobilidade recomendada**
  (`caminhavel` | `transporte_publico` | `app_corrida` | `taxi_mototaxi` | `transfer_hospedagem` |
  `carro_alugado`), derivada dos vereditos, informando quais passos ainda estão `pendente`.
- **FR-013**: O sistema MUST marcar como desatualizado o dossiê cujo `last_checked_at` tenha mais de
  180 dias e sugerir revalidação.
- **FR-013a**: O dossiê é **global por cidade** (`city` + `state_uf`), reaproveitado entre viagens.
  Ao mudar o status de uma viagem para `confirmada`, o sistema MUST congelar uma cópia do estado
  corrente dos 7 checks em `trip_mobility_snapshots` (`trip_id`, `snapshot_at`, payload dos checks),
  de modo que revalidações posteriores do dossiê não reescrevam o histórico daquela viagem.

**Base de apps regionais (US3)**

- **FR-014**: O sistema MUST manter `mobility_apps` com `name`, `kind`
  (`app_corrida` | `transporte_publico` | `taxi`), `coverage_scope`
  (`nacional` | `regiao` | `uf` | `cidades`), `coverage_values` TEXT[] (siglas de região/UF ou nomes
  de cidade), `url`, `notes` e `source_updated_at`, semeada com os apps do `research.md`.
- **FR-015**: A consulta por UF/cidade MUST devolver os apps candidatos rotulados como **cobertura
  declarada — confirmar in-app**, e MUST NOT ser usada como veredito de disponibilidade.

**Checklist pré-viagem (US3)**

- **FR-016**: O sistema MUST persistir `trip_checklist_items` (`trip_id`, `label`, `category`,
  `done` BOOLEAN, `position`, `origin` = `dossie` | `manual`) e gerar itens automaticamente a partir
  dos vereditos do dossiê, sem duplicar item já existente com o mesmo rótulo.

**Matriz economia × conforto (US4)**

- **FR-017**: O sistema MUST expor um motor **puro** (sem acesso a banco) que, dados
  duração em horas, período (diurno/noturno) e perfil da viagem, recomende a categoria rodoviária
  ANTT (`convencional` | `executivo` | `semi_leito` | `leito` | `leito_cama`) com justificativa.
- **FR-018**: A recomendação MUST aplicar o custo de exaustão: acima de 8h em período noturno,
  recomendar no mínimo `semi_leito`; acima de 12h, apresentar o `leito_cama` como substituto
  potencial de uma diária de hospedagem.
- **FR-019**: O sistema MUST ordenar upgrades de conforto por retorno — transfer privativo >
  upgrade de hospedagem > passeio privativo > classe executiva doméstica — ponderando o dossiê
  (sem app de corrida confirmado, o transfer sobe).

**Orçamento e cross-agent Nami (US5)**

- **FR-020**: O sistema MUST persistir `trip_budget_items` com `trip_id`, `category`
  (`transporte_ida` | `transporte_volta` | `hospedagem` | `alimentacao` | `mobilidade_local` |
  `passeios` | `outros`), `estimated` NUMERIC(10,2), `actual` NUMERIC(10,2) DEFAULT 0 e
  `nami_transaction_ids` TEXT[].
- **FR-021**: Registrar um gasto realizado MUST lançar a despesa correspondente na Nami **no ato**,
  um lançamento por gasto, **na mesma transação PostgreSQL** (padrão atômico de
  `complete_payment_task`): falhando um lado, nada é gravado. Não há consolidação ao encerrar a
  viagem.
- **FR-022**: O resumo de orçamento MUST apresentar estimado, realizado e saldo por categoria e no
  total, destacando categorias estouradas.

**Agente, MCP e canais**

- **FR-023**: Toda a lógica de domínio MUST viver em `agents/yato/` (fachada `tools.py` + módulos),
  com `toolset.py` expondo `TOOLS: list[Callable]` e registro em `DOMAINS["yato"]` de
  `mcp_servers/makima/registry.py`, tornando o domínio acessível pelo Hermes em produção.
- **FR-024**: `agents/yato/agent.py` MUST expor o singleton ADK (`gemini-2.5-flash`, sem MCP
  próprio), registrado em `coordinator/agent.py` (`sub_agents` + `_MAKIMA_INSTRUCTION`) para o
  caminho legado/dev, e `hermes/skills/yato-viagens/SKILL.md` MUST descrever o roteamento no Hermes.
- **FR-025**: O Yato MUST responder em **HTML** (nunca markdown), começar toda resposta com "Yato:"
  e chamar tools antes de responder — nunca inventar cobertura, preço ou horário. Personalidade:
  deus vagabundo do *Noragami* — escandaloso, orgulhoso, obcecado por economia ("5 ienes!"), mas
  competente e protetor de verdade quando o assunto é a segurança do viajante.

**Front-end e API**

- **FR-026**: `webapp/backend/routers/travel.py` MUST expor `/api/travel/*` cobrindo viagens,
  roteiro, dossiê, apps, checklist e orçamento, consumindo `agents.yato.tools` diretamente (padrão
  `movies.py`), com `require_user`.
- **FR-027**: `webapp/frontend/src/pages/yato/` MUST entregar um shell com as telas de lista de
  viagens, detalhe com roteiro por dia, painel do dossiê (os 7 passos com veredito visível),
  orçamento e checklist, no padrão de shell dos demais agentes.

**Paridade e convenções**

- **FR-028**: `agents/yato/schema_pg.sql` MUST ser registrado em `scripts/setup_schemas.py`
  (`SCHEMA_FILES`), e as tabelas MUST ser criadas com `IF NOT EXISTS` (sem script de migração de
  dados — schema novo).
- **FR-029**: Todas as datas e horas MUST usar `America/Sao_Paulo` (UTC-3): no banco,
  `(NOW() AT TIME ZONE 'America/Sao_Paulo')::date`; no front, `todayLocalISO()` de
  `webapp/frontend/src/pages/violet/dateUtils.ts`. `CURRENT_DATE`, `NOW()::date` e
  `toISOString().slice(0,10)` MUST NOT ser usados em contexto de UI/relatório.
- **FR-030**: A fatia MUST NOT introduzir nenhuma variável de ambiente nova nem chamada a API
  externa paga.

### Key Entities

- **Trip** (`trips`): a viagem — cidade/UF de destino, intervalo de datas, perfil orçamento×conforto,
  status. Raiz de tudo o mais.
- **TripItem** (`trip_items`): atividade do roteiro ancorada em dia + período, com custo estimado e
  modal de deslocamento.
- **MobilityDossier** (`mobility_dossiers`): o retrato de mobilidade de uma cidade, reutilizável
  entre viagens; porte, escala pedonal, síntese e data da última checagem.
- **MobilityCheck** (`mobility_checks`): um passo do protocolo de 7 passos, com veredito, fonte e
  evidência. É onde mora a honestidade epistêmica do agente.
- **TripMobilitySnapshot** (`trip_mobility_snapshots`): cópia congelada dos 7 checks no momento em
  que a viagem foi confirmada — preserva o que se sabia *na época* da viagem.
- **MobilityApp** (`mobility_apps`): catálogo-semente de apps de corrida e de transporte público com
  abrangência **declarada** — heurística, nunca veredito.
- **TripChecklistItem** (`trip_checklist_items`): tarefa pré-embarque, derivada do dossiê ou manual.
- **TripBudgetItem** (`trip_budget_items`): estimado × realizado por categoria, com as transações da
  Nami vinculadas.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O usuário monta uma viagem de 4 dias com 10 itens de roteiro em menos de 5 minutos de
  conversa, sem sair para outra ferramenta.
- **SC-002**: O protocolo de mobilidade completo (7 passos) é concluído para uma cidade em menos de
  10 minutos, e 100% dos passos ficam gravados com veredito, fonte e data.
- **SC-003**: Em 100% das respostas sobre disponibilidade de Uber/99/InDrive/transporte público sem
  check `confirmado`, o agente apresenta a informação como probabilística e diz como verificar —
  zero afirmações categóricas sem evidência.
- **SC-004**: Ausência de dado é classificada como `inconclusivo` em 100% dos casos; nenhum passo
  vira `ausente` sem evidência explícita.
- **SC-005**: A recomendação de classe rodoviária bate com a tabela ANTT do `research.md` em 100%
  dos casos de teste de duração × período.
- **SC-006**: Nenhum gasto de viagem fica registrado só de um lado: 100% dos lançamentos existem
  simultaneamente no orçamento da viagem e na Nami, ou em nenhum dos dois.
- **SC-007**: O usuário abre o app do destino e, em uma tela, sabe se consegue se locomover sem
  carro e o que precisa instalar antes de embarcar.
- **SC-008**: O checklist gerado a partir do dossiê não contém nenhum item contraditório com os
  vereditos (ex.: "instalar Uber" numa cidade com Uber `ausente`).
- **SC-009**: A feature não adiciona nenhuma variável de ambiente nem dependência externa nova.

## Assumptions

- **Usuário único.** O sistema inteiro é single-user (padrão do repo); nada de compartilhamento de
  viagem ou colaboração.
- **Roteiro por período, horário opcional.** O research trata granularidade horária como ideal, mas
  ela depende de horários de funcionamento vindos do Google Places (fatia 2). Até lá, período
  (manhã/tarde/noite) é obrigatório e horário é um extra.
- **Viagens passadas são aceitas** como histórico — a mesma estrutura serve para planejar e para
  registrar o que já aconteceu.
- **Front-end na mesma fatia**, a pedido explícito do usuário ("tanto no bot quanto to front end"),
  ao contrário de Mai (022) e Marin (021), que adiaram o front.
- **A base de apps regionais é semeada por script**, a partir do `research.md`, e envelhece: ela
  orienta, não decide.
- **Sem geocodificação**: endereços são texto livre nesta fatia; "pontuação de localização" da
  hospedagem depende de coordenadas e fica para a fatia 2.
- **O agente não compra nada** — nem passagem, nem hospedagem. Ele orienta (janela de compra de
  21–45 dias, terça/quarta mais barato, comparadores a abrir) e registra a decisão do usuário.
- **Cautela documentada**: o research registra 123Milhas/MaxMilhas em recuperação judicial; o agente
  não recomenda essas plataformas.
- **Uma cidade por viagem**: roteiro itinerante se modela como viagens encadeadas (decisão do
  clarify).
- **Persistência PostgreSQL** no banco existente do projeto, com as tabelas criadas por
  `scripts/setup_schemas.py`.
