# Feature Specification: Aniversários confiáveis — digest agendado e sync sem duplicação

**Feature Branch**: `059-komi-aniversarios`

**Created**: 2026-07-07

**Status**: Rascunho — auditoria completa em 2026-07-07, código ainda não implementado

**Input**: User description: "Tornar os aniversários e datas importantes da Komi confiáveis
de ponta a ponta. Hoje a Komi não tem nenhum job agendado — aniversários são o dado mais
sensível a tempo do domínio e o usuário só é lembrado indiretamente, se a data virou tarefa
sincronizada na Kaguya. Criar um digest agendado (Telegram) com os aniversários e datas da
semana, no padrão do scheduler do repo (histórico de execuções + alerta em falha). Além
disso, corrigir as fragilidades do sync bidirecional Komi↔Kaguya encontradas na auditoria:
é possível acabar com aniversários duplicados para a mesma pessoa (não há unicidade nas
datas e o pull da Kaguya cria uma data nova sem verificar se já existe uma equivalente
manual); o push de uma data para a Kaguya acontece em três transações separadas — se o
processo cair no meio, fica uma tarefa órfã sem vínculo, que reaparece duplicada no próximo
push; e todas as falhas do sync são engolidas sem nenhum log, tornando impossível
diagnosticar por que um aniversário não sincronizou."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Digest semanal/diário de aniversários no Telegram (Priority: P1)

Como usuário, quero receber no Telegram um lembrete com os aniversários e datas importantes
que se aproximam — hoje nenhum job da Komi existe: se eu não abrir o webapp nem tiver a data
sincronizada como tarefa, o aniversário passa em branco.

**Why this priority**: Maior lacuna funcional do domínio apontada pela auditoria. Todo o
valor de cadastrar datas é ser lembrado delas; a infraestrutura do scheduler já existe e
outros agentes já a usam (digest da Lucy, sync da Akane).

**Independent Test**: Cadastrar um aniversário para daqui a 2 dias, executar o job
manualmente e confirmar o recebimento da mensagem no Telegram listando a pessoa e a data.

**Acceptance Scenarios**:

1. **Given** pessoas com datas nos próximos dias, **When** o job roda no horário agendado,
   **Then** o usuário recebe no Telegram uma mensagem listando pessoa, rótulo da data e
   quando ocorre (hoje, amanhã, em N dias).
2. **Given** nenhuma data no período coberto, **When** o job roda, **Then** nenhuma mensagem
   é enviada (sem spam de digest vazio).
3. **Given** uma execução do job, **When** ela termina (sucesso ou falha), **Then** fica
   registrada no histórico de execuções do scheduler; em falha, o alerta padrão é disparado.
4. **Given** um aniversário recorrente de pessoa excluída, **When** o digest é montado,
   **Then** a data não aparece.
5. **Given** um 29 de fevereiro em ano não bissexto, **When** o digest cobre o período,
   **Then** a data é tratada de forma consistente com o calendário da Komi (mesma regra de
   projeção).

---

### User Story 2 - Sem aniversários duplicados entre Komi e Kaguya (Priority: P2)

Como usuário, quero que cada pessoa tenha no máximo um aniversário, independentemente de eu
tê-lo cadastrado pela Komi ou como tarefa de aniversário na Kaguya — hoje, se as duas
origens acontecem separadamente, o sync cria uma segunda data para a mesma pessoa, e nada no
banco impede a duplicata.

**Why this priority**: Duplicação silenciosa de dados que se propaga (duas datas → duas
tarefas → dois lembretes no digest). Corrigir depois exige saneamento manual.

**Independent Test**: Cadastrar aniversário pela Komi para uma pessoa; criar depois uma
tarefa de aniversário para a mesma pessoa na Kaguya; confirmar que ao final existe uma única
data e um único vínculo (o sync reconhece a existente em vez de criar outra).

**Acceptance Scenarios**:

1. **Given** uma pessoa com aniversário já cadastrado na Komi, **When** uma tarefa de
   aniversário da mesma pessoa chega pelo sync da Kaguya, **Then** o sync vincula à data
   existente em vez de criar uma segunda.
2. **Given** uma tentativa de cadastrar uma segunda data de aniversário para a mesma pessoa,
   **When** a operação chega ao sistema, **Then** é impedida ou tratada como atualização da
   existente (regra de unicidade por pessoa+tipo).
3. **Given** duplicatas pré-existentes no banco, **When** a correção é aplicada, **Then** um
   saneamento retroativo as consolida (mantendo os vínculos corretos).

---

### User Story 3 - Sync atômico, sem tarefas órfãs (Priority: P2)

Como usuário, quero que o espelhamento de uma data da Komi para a agenda de tarefas seja
tudo-ou-nada — hoje ele acontece em três passos com confirmações independentes: se o
processo cair entre criar a tarefa e gravar o vínculo, fica uma tarefa de aniversário órfã
que reaparece duplicada no próximo sync; a atualização de recorrência também roda em duas
transações separadas.

**Why this priority**: Fragilidade estrutural que fabrica exatamente as duplicatas que a
US2 combate. Baixa frequência, mas efeito acumulativo e invisível.

**Independent Test**: Simular falha entre a criação da tarefa e a gravação do vínculo e
confirmar que nenhum efeito parcial persiste (ou tarefa+vínculo existem juntos, ou nada).

**Acceptance Scenarios**:

1. **Given** o push de uma data para a agenda, **When** qualquer passo falha, **Then**
   nenhum efeito parcial persiste (sem tarefa órfã, sem vínculo pendurado).
2. **Given** a atualização de uma data já sincronizada, **When** o push atualiza tarefa e
   recorrência, **Then** as duas mudanças acontecem juntas ou nenhuma acontece.
3. **Given** tarefas de aniversário órfãs pré-existentes, **When** o saneamento roda,
   **Then** elas são religadas à data correspondente ou removidas.

---

### User Story 4 - Falhas do sync diagnosticáveis (Priority: P3)

Como mantenedor, quero conseguir descobrir por que um aniversário não sincronizou — hoje
todas as exceções do sync (e dos blocos cross-agent do hub) são engolidas sem nenhum
registro, então um erro real de dados fica indistinguível de "domínio indisponível".

**Why this priority**: Não afeta o usuário diretamente, mas transforma qualquer bug futuro
do sync em investigação às cegas. O custo de logar é mínimo.

**Independent Test**: Forçar uma falha no push (ex.: dados inválidos) e confirmar que um
registro de log identifica a operação, a pessoa/data e o motivo — e que o fluxo principal
(CRUD da data) segue não bloqueado.

**Acceptance Scenarios**:

1. **Given** uma falha em qualquer operação do sync, **When** ela é capturada, **Then** um
   log com contexto (operação, entidade, motivo) é emitido; o CRUD principal continua não
   sendo bloqueado (best-effort preservado).
2. **Given** os blocos cross-agent do hub da pessoa, **When** uma consulta de domínio falha,
   **Then** a degradação graciosa continua, mas com log de diagnóstico.

---

### Edge Cases

- Job do digest rodando na virada de dia/mês: o cálculo de "hoje" usa o fuso local
  (America/Sao_Paulo), nunca UTC — convenção do repo.
- Pessoa com múltiplas datas (aniversário + data comemorativa) na mesma semana: o digest
  agrupa por pessoa, sem repetir o cabeçalho.
- Data única (não recorrente) já passada: nunca aparece no digest.
- Sync desativado ou Kaguya indisponível: digest continua funcionando (ele lê da Komi,
  não depende do espelho).
- Consolidação de duplicatas em que as duas datas divergem (dias diferentes): o saneamento
  não escolhe sozinho — lista para decisão manual.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE ter um job agendado da Komi no scheduler do repo que envia ao
  usuário, via Telegram, um digest das datas importantes que se aproximam (janela e horário
  definidos no plano; padrão sugerido: diário de manhã, cobrindo hoje + próximos 7 dias).
- **FR-002**: O digest DEVE omitir pessoas excluídas, datas já passadas (não recorrentes) e
  DEVE ser suprimido quando não houver nada a lembrar.
- **FR-003**: Cada execução do job DEVE ser registrada no histórico de execuções do
  scheduler; falhas DEVEM disparar o alerta padrão — mesmo contrato dos jobs existentes.
- **FR-004**: O sistema DEVE garantir no máximo uma data de aniversário por pessoa: o pull
  do sync reconhece e vincula a data existente; o cadastro direto de uma segunda é impedido
  ou tratado como atualização.
- **FR-005**: O push de uma data para a agenda (criação e atualização, incluindo
  recorrência) DEVE ser atômico: ou todos os efeitos persistem juntos, ou nenhum.
- **FR-006**: Um saneamento retroativo DEVE consolidar duplicatas existentes e religar ou
  remover tarefas de aniversário órfãs; casos ambíguos (datas divergentes) são listados para
  decisão manual, nunca resolvidos silenciosamente.
- **FR-007**: Toda falha capturada nos fluxos best-effort (sync e blocos cross-agent do hub)
  DEVE emitir log com contexto suficiente para diagnóstico, mantendo a não-obstrução do
  fluxo principal.
- **FR-008**: Todos os cálculos de data do digest DEVEM usar o fuso America/Sao_Paulo.

### Key Entities

- **Digest de aniversários**: mensagem agendada com as datas da janela, agrupada por pessoa.
- **Data importante**: passa a ter unicidade de aniversário por pessoa.
- **Vínculo de sync (data↔tarefa)**: criado/atualizado atomicamente com a tarefa espelhada.
- **Execução do job**: registro no histórico do scheduler com resultado e duração.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Com uma data cadastrada na janela do digest, o usuário recebe a mensagem no
  Telegram em 100% das execuções bem-sucedidas do job.
- **SC-002**: Zero digests vazios enviados; zero datas de pessoas excluídas no digest.
- **SC-003**: Após a implementação e o saneamento, nenhuma pessoa tem mais de uma data de
  aniversário; reproduzir o cenário de dupla origem (Komi + Kaguya) termina com uma única
  data vinculada.
- **SC-004**: Falha simulada no meio do push não deixa nenhum efeito parcial persistente.
- **SC-005**: Toda falha de sync produz um registro de log identificável; zero `except`
  silenciosos sem log nos fluxos de sync.
- **SC-006**: O job aparece no histórico de execuções do scheduler com status e duração em
  100% das execuções.

## Assumptions

- O digest segue o padrão do scheduler existente (`scheduler/CLAUDE.md`): wrapper em
  `jobs.py`, entrada declarativa no registry, histórico em `scheduler_runs`, alerta padrão.
- Janela e horário exatos do digest (diário 08:00 cobrindo 7 dias vs. semanal) são decisão
  fina do plano; o padrão dos jobs matinais do repo (digest da Lucy às 08:00) é a referência.
- A unicidade "um aniversário por pessoa" vale para o tipo aniversário; outras datas
  (comemorativas, aniversários de relacionamento) podem repetir rótulos distintos.
- O saneamento retroativo roda uma vez na implantação (script one-time no padrão
  `scripts/migrate_*.py` do repo).
- Esta spec depende conceitualmente da 058 apenas no ponto do fuso do Hub; pode ser
  implementada de forma independente.
