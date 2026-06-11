# Feature Specification: Datas e Recorrência — Fase 2 (fatia 012) do Sistema de Tarefas Próprio

**Feature Branch**: `012-tasks-recurrence`

**Created**: 2026-06-11

**Status**: Draft

**Spec master**: [`specs/010-kaguya-tasks-app/`](../010-kaguya-tasks-app/spec.md) — esta é uma
spec filha da **Fase 2** ("Datas e recorrência", FR-013→FR-018 da master). Schema, princípios
(paridade de canais, soft delete, fuso `America/Sao_Paulo`) e os **9 edge cases de recorrência**
de longo prazo estão definidos lá e em
[`data-model.md`](../010-kaguya-tasks-app/data-model.md). Constrói sobre a **Fase 1** entregue
([`specs/011-tasks-mvp/`](../011-tasks-mvp/spec.md)). O frontend segue o **guia canônico**
[`frontend-design-guide.md`](../010-kaguya-tasks-app/frontend-design-guide.md).

**Input**: User description: "Datas e Recorrência (Fase 2 da spec master 010) — motor de recorrência (fixed/after_completion, RRULE, semântica Todoist, 9 edge cases — SC-004 da master), datas com hora opcional, parsing determinístico de datas no quick-add do webapp (amanhã, sexta 17h) sem LLM e interpretação NLP equivalente no Telegram, geração de ocorrências de aniversário (recorrência anual), paridade total entre canais. Tags, smart-lists e view de calendário ficam para a fatia 013; Eisenhower para fase futura."

---

## Escopo da fatia

**Entra na 012**: motor de recorrência completo (modos `fixed` e `after_completion` expressos em
RRULE) + geração de ocorrências com os 9 edge cases da master + datas de vencimento com hora
opcional editáveis pelos dois canais + parsing determinístico de datas em português no quick-add
do webapp + interpretação NLP de datas/recorrência no Telegram + geração anual de aniversários +
controles de UI (data/hora + recorrência no TaskModal, glyph de recorrência, exclusão escopada).

**Fica para a fatia 013** (tabelas já existem no banco desde a Fase 1): **tags** e o token `#tag`
no quick-add, **smart-lists** (filtros salvos como listas de primeira classe) e a **view de
calendário** (projeção de ocorrências virtuais). **Eisenhower** (matriz prioridade×urgência) fica
para fase futura. Time-blocking e "Meu Dia" (Fase 3), hábitos (Fase 4) e lembretes via Telegram
(Fase 5) seguem fora.

**Sem migração de schema**: `task_recurrences` e os campos `due_date`/`due_time` já nasceram na
Fase 1. Esta fatia só acrescenta lógica, fachadas e UI.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Tarefa recorrente que se regenera ao concluir (Priority: P1)

Crio uma tarefa que se repete — "pagar aluguel todo dia 5" (data-fixa) ou "trocar a água do
filtro a cada 3 dias depois que eu trocar" (pós-conclusão). Ao concluí-la, a ocorrência atual
vira histórico e **uma** próxima ocorrência nasce automaticamente na data certa, com as
subtarefas zeradas. Ocorrências puladas nunca se acumulam: se eu concluir atrasado, ainda nasce
só a próxima ocorrência futura.

**Why this priority**: é o coração — e o maior risco — da Fase 2 (a master chama de "maior risco
do sistema"). Sem a semântica de recorrência correta, o resto não importa. Sozinha, já entrega o
diferencial sobre o MVP.

**Independent Test**: contra um banco com o schema da Fase 1, exercitar os 9 edge cases de
recorrência (motor puro + integração via concluir/excluir) e confirmar que sempre existe no
máximo uma ocorrência viva por série, na data correta.

**Acceptance Scenarios**:

1. **Given** "pagar aluguel todo dia 5" (`fixed`) com ocorrência viva no dia 5, **When** concluo no dia 3, **Then** a do dia 5 é consumida e a próxima nasce no dia 5 do mês seguinte.
2. **Given** a mesma tarefa, **When** concluo só no dia 20, **Then** **uma** ocorrência é consumida e a próxima é o dia 5 seguinte à conclusão — ocorrências puladas não se acumulam.
3. **Given** "trocar água a cada 3 dias" em modo `after_completion`, **When** concluo num dia X, **Then** a próxima vence em X+3, calculada a partir da conclusão real — nunca da âncora.
4. **Given** uma recorrente "toda segunda" reagendada pontualmente para terça e concluída na terça, **When** ela regenera (`fixed`), **Then** a próxima é a **segunda** seguinte (a âncora não muda por reagendamento pontual).
5. **Given** uma recorrente com 2 subtarefas concluídas, **When** ela regenera, **Then** a nova ocorrência nasce com as subtarefas **não-concluídas** (reset).
6. **Given** N conclusões de uma série, **When** consulto o histórico, **Then** existem N linhas consumidas com `completed_at` preservado (uma ocorrência viva por vez; as demais são histórico).

---

### User Story 2 - Agendar com data e hora por qualquer canal (Priority: P1)

Dou data e hora a uma tarefa sem abrir formulário: no webapp digito no quick-add "ligar pro
contador amanhã 9h" ou "revisar contrato sexta 17h"; no Telegram digo "me lembra de pagar o
cartão dia 10". A data é interpretada deterministicamente (webapp) ou por NLP (Telegram), sempre
no fuso `America/Sao_Paulo`, e a Kaguya **ecoa a interpretação** para eu corrigir se preciso.

**Why this priority**: datas são a outra metade da Fase 2 e pré-requisito da recorrência (uma
regra precisa de âncora). P1 junto com a US1.

**Independent Test**: alimentar o parser do webapp com expressões de data variadas e conferir o
`due_date`/`due_time` resultante; pelo Telegram, capturar com data e validar no banco + no eco.

**Acceptance Scenarios**:

1. **Given** o quick-add, **When** digito "ligar pro contador amanhã 9h", **Then** a tarefa nasce com vencimento amanhã às 09:00 e o título limpo "ligar pro contador".
2. **Given** hoje é quarta, **When** digito "revisar contrato sexta 17h", **Then** o vencimento é a próxima sexta às 17:00.
3. **Given** uma expressão ambígua ("sexta") sem mais contexto, **When** a Kaguya interpreta no Telegram, **Then** assume a **próxima sexta futura** e diz qual data assumiu, aceitando correção.
4. **Given** uma tarefa existente sem data, **When** edito pelo TaskModal e escolho data+hora, **Then** o vencimento persiste e aparece igual no Telegram.
5. **Given** o token `#` no quick-add, **When** digito "comprar pão #mercado", **Then** `#` é tratado como reservado para tags (fatia 013) — **não** vira data nem lista; nesta fatia o parser o deixa visível sem quebrar o título.

---

### User Story 3 - Aniversários que voltam todo ano (Priority: P2)

Cadastro "aniversário da minha mãe — 16/09" como tarefa do tipo aniversário. Ela recorre
anualmente sozinha: ao passar (ou eu marcar como vista), a próxima ocorrência é 16/09 do ano
seguinte, sem eu reconfigurar nada.

**Why this priority**: usa o mesmo motor da US1 (recorrência anual) com custo marginal e entrega
um caso de uso concreto e querido. Depende da US1/US2.

**Independent Test**: criar tarefa `type=birthday` com data e confirmar que nasce uma regra anual
(`FREQ=YEARLY`); concluir e verificar a ocorrência do ano seguinte na mesma data.

**Acceptance Scenarios**:

1. **Given** uma tarefa criada com `type=birthday` e data 16/09, **When** ela é salva, **Then** passa a ter recorrência anual fixa ancorada em 16/09.
2. **Given** o aniversário do ano corrente concluído, **When** ele regenera, **Then** a próxima ocorrência é 16/09 do ano seguinte.

---

### User Story 4 - Gerir a vida de uma série recorrente (Priority: P2)

Controlo a série inteira, não só uma ocorrência: edito a regra ("mudei de toda segunda para toda
sexta"), encerro a série de vez ("concluir para sempre") preservando o histórico, ou excluo
escolhendo entre "só esta ocorrência" e "a série inteira".

**Why this priority**: completa a semântica Todoist e evita que recorrentes virem lixo
imortal. Depende da US1.

**Independent Test**: editar a regra de uma recorrente com ocorrência aberta e verificar que a
linha aberta mantém a data e a nova regra vale a partir da próxima geração; encerrar a série e
confirmar que a regra fica inativa (não apagada) e nenhuma próxima nasce; excluir com cada escopo.

**Acceptance Scenarios**:

1. **Given** uma recorrente com ocorrência aberta, **When** edito a regra, **Then** a ocorrência aberta mantém sua data e a nova regra só vale a partir da próxima geração.
2. **Given** uma recorrente viva, **When** escolho "concluir a série para sempre", **Then** a ocorrência atual é concluída, nenhuma próxima nasce, e a regra fica **inativa** (preservada, não apagada — o histórico continua consultável).
3. **Given** uma recorrente viva, **When** excluo com escopo "só esta", **Then** a ocorrência é mandada para a lixeira e a próxima nasce normalmente.
4. **Given** uma recorrente viva, **When** excluo com escopo "a série inteira", **Then** a ocorrência aberta vai para a lixeira, a regra é desativada e nenhuma próxima nasce.
5. **Given** qualquer operação acima feita num canal, **When** consulto pelo outro, **Then** o estado é idêntico (paridade — mesma camada de lógica).

---

### Edge Cases

Os 9 edge cases de recorrência da master (seção *Edge Cases → Recorrência*) são o coração desta
fatia e estão cobertos pelas user stories acima. Resumidos:

1. **Reagendar + completar** (`fixed`): âncora não muda → próxima vem da âncora (US1.4).
2. **Completar adiantado** (`fixed`): consome a ocorrência futura; próxima é o período seguinte (US1.1).
3. **Completar atrasado** (`fixed`): consome **uma** ocorrência; próxima ≥ conclusão; puladas não acumulam (US1.2).
4. **Modo `after_completion`**: próxima a partir da conclusão real (US1.3).
5. **Fim de série** ("complete forever"): desativa a regra sem apagar; preserva histórico (US4.2).
6. **Subtarefas resetam** ao regenerar (US1.5).
7. **Ocorrências futuras não materializadas**: só a próxima existe como linha viva (US1.6); projeção virtual em calendário é da 013.
8. **Editar a regra com ocorrência aberta**: a aberta mantém a data; a nova regra vale da próxima geração (US4.1).
9. **Excluir recorrente**: escolha "só esta" vs "série inteira" (US4.3/US4.4).

Outros:

- **Recorrência exige data**: tentar tornar recorrente uma tarefa sem `due_date` é rejeitado com mensagem amigável (a âncora é a data de vencimento).
- **Série esgotada** (RRULE com `COUNT`/`UNTIL` que termina): ao concluir a última ocorrência, nenhuma próxima nasce e a regra é desativada — sem erro.
- **Data no passado no quick-add** ("ontem"): aceita a data literal (o usuário pode estar registrando algo atrasado); a tela Hoje a mostra como vencida.
- **Hora sem data** ("17h" sozinho): a hora exige uma data; o parser ignora a hora órfã (sem data, sem hora) em vez de inventar um dia.
- **Mudança de horário de verão**: irrelevante — recorrência opera em datas civis (`DATE`), não em instantes UTC.

## Requirements *(mandatory)*

### Functional Requirements

**Motor de recorrência**

- **FR-001**: O sistema MUST suportar recorrência em dois modos — `fixed` (âncora fixa) e `after_completion` (conta a partir da conclusão real) — com a regra expressa em **RRULE** (RFC 5545) e uma **âncora** (data-base da série).
- **FR-002**: A geração MUST ser **lazy**: apenas a próxima ocorrência existe como linha viva; ocorrências futuras são virtuais (calculadas pela regra), nunca materializadas em lote.
- **FR-003**: Concluir uma ocorrência recorrente MUST consumir **exatamente uma** ocorrência e gerar **no máximo uma** próxima; conclusões atrasadas **não** acumulam ocorrências puladas (a próxima é a primeira ocorrência ≥ hoje em modo `fixed`).
- **FR-004**: A conclusão MUST preservar o histórico — a ocorrência consumida permanece como linha concluída (com `completed_at`); a nova ocorrência é uma nova linha que herda título/descrição/prioridade/lista/tipo e **reseta as subtarefas para não-concluídas**.
- **FR-005**: O usuário MUST poder **encerrar a série** ("concluir para sempre"): conclui a ocorrência atual, não gera próxima, e **desativa** a regra sem apagá-la (histórico preservado).
- **FR-006**: A exclusão de uma recorrente MUST oferecer escopo — "só esta ocorrência" (soft delete + gera a próxima) ou "a série inteira" (soft delete + desativa a regra, sem gerar).
- **FR-007**: Editar a regra de uma recorrente com ocorrência aberta MUST manter a data da ocorrência aberta; a nova regra vale a partir da próxima geração.
- **FR-008**: Tornar uma tarefa recorrente MUST exigir `due_date` (a âncora); o sistema rejeita recorrência sem data com mensagem clara.

**Datas**

- **FR-009**: Tarefas MUST aceitar data de vencimento (`due_date`) com hora opcional (`due_time`), editáveis por ambos os canais; toda interpretação de data usa o fuso `America/Sao_Paulo`.
- **FR-010**: O quick-add do webapp MUST interpretar datas em português de forma **determinística** (sem LLM): `hoje`, `amanhã`, dias da semana (`seg`..`dom` / `segunda`..`domingo`), `próxima <dia>`, `DD/MM`, e hora (`9h`, `17:30`), produzindo `due_date`/`due_time` e limpando o título.
- **FR-011**: A Kaguya (Telegram) MUST interpretar datas e recorrência em linguagem natural, **ecoar a interpretação** assumida e resolver ambiguidade ("sexta") para a **próxima ocorrência futura**, aceitando correção conversacional.
- **FR-012**: O token `#` no quick-add MUST permanecer **reservado para tags** (fatia 013) — nunca vira data nem lista; nesta fatia o parser não o transforma em título quebrado.

**Aniversários**

- **FR-013**: Criar uma tarefa com `type=birthday` e `due_date` MUST configurar automaticamente uma recorrência anual (`FREQ=YEARLY`, modo `fixed`, ancorada na data), regenerando todo ano pelo mesmo motor.

**Paridade**

- **FR-014**: Toda capacidade desta fatia (recorrência, datas, encerrar série, exclusão escopada) MUST estar disponível e idêntica nos dois canais; nenhuma regra pode ser exclusiva de um canal (a lógica vive na camada única; Telegram e router `/api/tasks/*` são fachadas finas).

### Key Entities

Definidas na master (`data-model.md`). Esta fatia ativa a entidade **Recorrência**
(`task_recurrences`: `rrule` + `mode` + `anchor_date` + `active`, 1:1 com a tarefa viva da série)
e usa intensivamente os campos de data da **Tarefa** (`due_date`, `due_time`). Tag, Filtro salvo,
Hábito e Check-in seguem adormecidos (fatias/fases seguintes).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Os **9 edge cases de recorrência** da master passam em **teste automatizado** (equivale à SC-004 da master) — contra o motor puro e via concluir/excluir na camada de lógica.
- **SC-002**: 100% das capacidades de recorrência e datas executáveis pelos **dois canais**, com cada canal funcionando com o outro desligado (auditável por checklist de paridade).
- **SC-003**: Concluir uma recorrente atrasada gera **exatamente uma** próxima ocorrência (zero acúmulo de puladas) — verificável contando linhas vivas da série após a conclusão.
- **SC-004**: Após N conclusões de uma série, há **N linhas consumidas** com `completed_at` preservado e **uma** linha viva — histórico íntegro sem tabela extra.
- **SC-005**: Capturar uma tarefa **com data** leva ≤ 5s pelo quick-add (uma linha de texto + Enter) e uma única mensagem pelo Telegram, com a interpretação ecoada.

## Assumptions

- O schema da Fase 1 (com `task_recurrences` e os campos de data) já está aplicado em produção — esta fatia **não** altera o schema.
- A biblioteca de RRULE (`python-dateutil`) é adicionada às dependências para evitar reimplementar a aritmética de recorrência da RFC 5545.
- O parser de datas do webapp é determinístico e cobre o português do dia a dia (relativos, dias da semana, `DD/MM`); casos exóticos ("daqui a duas terças") ficam para o canal Telegram (NLP) — não bloqueiam a fatia.
- "Uma ocorrência viva por vez" é o invariante: a projeção de ocorrências **virtuais** (para a view de calendário) é responsabilidade da fatia 013 e não persiste linhas.
- A captura NLP de datas/recorrência no Telegram usa o modelo já configurado da Kaguya (Gemini) — nenhum serviço novo.
- Recorrência opera em datas civis (`DATE`); horário de verão e instantes UTC não afetam o cálculo de próxima ocorrência.
- O histórico de ocorrências vem das linhas consumidas (`completed_at`); nenhuma tabela de histórico materializada é criada (decisão da master — só se a necessidade aparecer).
