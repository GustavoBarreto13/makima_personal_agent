# Feature Specification: Tasks MVP — Fase 1 do Sistema de Tarefas Próprio

**Feature Branch**: `011-tasks-mvp`

**Created**: 2026-06-11

**Status**: Draft

**Spec master**: [`specs/010-kaguya-tasks-app/`](../010-kaguya-tasks-app/spec.md) — esta é a
spec filha da **Fase 1**. Schema, princípios (paridade de canais, soft delete, posições
esparsas) e edge cases de longo prazo estão definidos lá e em
[`data-model.md`](../010-kaguya-tasks-app/data-model.md); o frontend segue o
[`frontend-design-guide.md`](../010-kaguya-tasks-app/frontend-design-guide.md).

**Input**: User description: "Tasks MVP (Fase 1 da spec master 010-kaguya-tasks-app) — primeiro corte utilizável do sistema de tarefas próprio. Aplicar o schema PostgreSQL completo; camada de lógica única; tools da Kaguya reescritas para o Postgres (sai o MCP do TickTick, fica o do Google Calendar); complete_payment_task como transação atômica local; router /api/tasks/*; shell mínimo no webapp (lista, Kanban, Hoje, quick-add); paridade total entre canais; CRUD completo com subtarefas, projetos com grupos, prioridade, posições esparsas, captura NLP em português; PATCH amendment da constitution. Critério de pronto: usuário gerencia o dia a dia de tarefas inteiramente no app próprio, por qualquer canal, sem TickTick."

---

## Escopo da fase

**Entra no MVP**: fundação completa do banco (schema inteiro da master aplicado de uma
vez, evitando migrações futuras) + CRUD de tarefas/subtarefas/projetos/grupos + view
lista + Kanban + tela "Hoje" simples + captura via Telegram (NLP) + quick-add básico no
webapp + fluxo cross-agent de pagamento + aposentadoria do TickTick.

**Fica para as próximas fases** (mesmo com colunas já existentes no banco): recorrência
(012), smart lists/filtros salvos (012), tags na UI (012), calendar view (012),
time-blocking e Meu Dia ritual (013), hábitos (014), lembretes/⌘K completo/animações (015).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Gerenciar tarefas pelo webapp (Priority: P1)

Abro `/tasks` no webapp e vejo meus projetos na sidebar (agrupados, com o Inbox no topo)
e as tarefas do projeto selecionado em lista. Crio, edito, completo, reabro, movo entre
projetos e excluo tarefas e subtarefas. Defino prioridade (4 níveis) e reordeno por
drag-and-drop. Tarefa nova sem projeto cai no Inbox.

**Why this priority**: é o coração do app — sem o CRUD visual confiável, não existe
produto. Sozinha, esta story já entrega um gerenciador de tarefas utilizável.

**Independent Test**: com o banco recém-criado (só o seed Inbox), executar todo o ciclo
de vida de uma tarefa (criar → editar → priorizar → mover → completar → reabrir →
excluir → restaurar) só pelo webapp.

**Acceptance Scenarios**:

1. **Given** o banco recém-criado, **When** abro `/tasks`, **Then** vejo o projeto Inbox na sidebar e uma lista vazia com convite para criar a primeira tarefa.
2. **Given** uma tarefa criada sem projeto explícito, **When** ela é salva, **Then** aparece no Inbox.
3. **Given** uma tarefa na lista, **When** clico no checkbox, **Then** ela é completada com feedback visual e sai da lista de abertas (e posso vê-la entre as concluídas e reabri-la).
4. **Given** duas tarefas A e B adjacentes, **When** arrasto C para entre elas, **Then** a ordem persiste após recarregar a página.
5. **Given** uma tarefa com 2 subtarefas abertas, **When** completo a tarefa pai, **Then** o sistema pede confirmação e, ao confirmar, completa as subtarefas em cascata.
6. **Given** uma tarefa excluída, **When** olho a lixeira do projeto, **Then** posso restaurá-la com todos os campos intactos.
7. **Given** um projeto com tarefas, **When** tento excluí-lo, **Then** escolho entre mover as tarefas para o Inbox ou excluí-las junto; o Inbox em si não oferece opção de exclusão.

---

### User Story 2 - Capturar e consultar pelo Telegram, sem TickTick (Priority: P1)

Falo com a Kaguya em linguagem natural: "anota: revisar relatório no projeto Trabalho,
prioridade alta", "o que tenho pra hoje?", "completa a tarefa do relatório", "apaga essa".
Ela executa contra o banco próprio e confirma a interpretação ("Registrei *revisar
relatório* em *Trabalho*, prioridade alta."). O TickTick não participa de nada — nenhuma
resposta menciona ou depende dele.

**Why this priority**: é a outra metade da paridade de canais (princípio inegociável da
master) e o que efetivamente corta o cordão com o TickTick. P1 junto com a US1 — o MVP
só está pronto com os dois canais vivos.

**Independent Test**: com o webapp desligado, executar todo o ciclo de vida de tarefas e
projetos só pelo Telegram, verificando os dados direto no banco.

**Acceptance Scenarios**:

1. **Given** uma conversa com a Kaguya, **When** digo "cria tarefa comprar café no projeto Casa com prioridade média", **Then** a tarefa existe no banco com projeto e prioridade corretos e a resposta confirma a interpretação.
2. **Given** uma captura ambígua ("me lembra do dentista sexta"), **When** a Kaguya interpreta, **Then** a resposta explicita a interpretação assumida (qual sexta) e aceita correção em linguagem natural.
3. **Given** tarefas criadas pelo webapp, **When** pergunto "o que tenho pra hoje?", **Then** a resposta lista as tarefas de hoje e as vencidas, agrupadas por projeto.
4. **Given** um pedido de exclusão, **When** a Kaguya entende qual tarefa é, **Then** ela pede confirmação antes de excluir (exclusão é destrutiva — nunca executar direto).
5. **Given** qualquer operação feita num canal, **When** consulto pelo outro canal, **Then** o estado é idêntico (mesma fonte de dados, sem sincronização).
6. **Given** o bot Telegram desligado, **When** uso o webapp, **Then** tudo funciona; e vice-versa.

---

### User Story 3 - Visualizar um projeto como Kanban (Priority: P2)

No projeto em que trabalho por etapas, crio colunas (ex.: "A fazer", "Fazendo", "Feito")
e vejo as tarefas como cards. Arrasto cards entre colunas; soltar na coluna marcada como
"concluída" completa a tarefa — o mesmo efeito do checkbox na lista.

**Why this priority**: segunda view sobre os mesmos dados — prova o princípio "uma
tarefa, várias views" da master. Vem depois do CRUD porque depende dele.

**Independent Test**: criar colunas num projeto, mover cards entre elas e validar que
coluna e estado de conclusão persistem e aparecem coerentes na view lista.

**Acceptance Scenarios**:

1. **Given** um projeto sem colunas, **When** crio a primeira coluna, **Then** a view Kanban fica disponível para o projeto.
2. **Given** um card arrastado para a coluna "Feito" (marcada como done), **When** solto, **Then** a tarefa é completada — e na view lista ela aparece como concluída.
3. **Given** uma tarefa movida de um projeto com board para outro com board, **When** a movo, **Then** ela entra na primeira coluna do projeto destino.
4. **Given** uma tarefa completada pela lista (ou pelo Telegram), **When** abro o Kanban, **Then** o card reflete o estado — as views nunca divergem.

---

### User Story 4 - Começar o dia pela tela "Hoje" com quick-add (Priority: P3)

Abro a tela "Hoje" e vejo as tarefas com vencimento hoje e as vencidas, agrupadas por
projeto. Um campo de quick-add no topo cria tarefa em segundos, entendendo atalhos
simples (`#projeto`, `!alta`) — a versão completa com datas e ⌘K chega nas fases 012/015.

**Why this priority**: é a porta de entrada diária e o embrião do "Meu Dia" (Fase 3),
mas o MVP já é utilizável navegando por projetos.

**Independent Test**: criar tarefas com datas variadas direto no banco e validar o
agrupamento da tela Hoje; criar tarefa pelo quick-add com atalhos e conferir os campos.

**Acceptance Scenarios**:

1. **Given** tarefas com vencimento ontem, hoje e amanhã, **When** abro a tela Hoje, **Then** vejo as de hoje e as vencidas (destacadas), e não vejo a de amanhã.
2. **Given** o quick-add, **When** digito "ligar pro banco #Casa !alta" e confirmo, **Then** a tarefa nasce no projeto Casa com prioridade alta e o texto limpo "ligar pro banco".
3. **Given** um atalho que não casa com nada ("#ProjetoQueNãoExiste"), **When** confirmo, **Then** a tarefa vai para o Inbox com o texto original preservado e a UI indica que o projeto não foi encontrado.

---

### User Story 5 - Pagar uma conta: tarefa concluída e despesa lançada de uma vez (Priority: P3)

Digo à Kaguya "paguei a conta de luz, R$ 180 no Nubank, categoria contas". Ela completa
a tarefa correspondente **e** lança a despesa no domínio financeiro (Nami) numa única
operação — ou tudo acontece, ou nada acontece. Antes de executar, confirma valor,
categoria e conta comigo (sem defaults financeiros).

**Why this priority**: é o fluxo cross-agent que justifica o sistema unificado, e fica
mais simples que hoje (uma transação no mesmo banco em vez de duas APIs). Depende das
US1/US2.

**Independent Test**: simular falha no lançamento da despesa e verificar que a tarefa
não foi completada (atomicidade); no caminho feliz, verificar tarefa completa + despesa
lançada.

**Acceptance Scenarios**:

1. **Given** uma tarefa "pagar conta de luz" e a confirmação de valor/categoria/conta, **When** o fluxo executa, **Then** a tarefa está completa e a despesa lançada — consultáveis imediatamente pela Nami e pela Kaguya.
2. **Given** uma falha em qualquer etapa (ex.: conta financeira inexistente), **When** o fluxo executa, **Then** nenhum dos dois efeitos persiste e a resposta explica o que faltou.
3. **Given** o pedido sem valor ou conta, **When** a Kaguya processa, **Then** ela pergunta os dados faltantes antes de executar — nunca assume valores financeiros.

---

### Edge Cases

- **Posições esparsas colidem** (média entre vizinhos chega a diferença < 1): o sistema re-espaça as posições do escopo afetado de forma transparente; a ordem visível nunca muda sozinha.
- **Subtarefa de tarefa concluída**: criar subtarefa numa tarefa concluída reabre a pai? Não — o sistema bloqueia e sugere reabrir a pai primeiro (estado consistente, sem efeitos surpresa).
- **Mover tarefa para projeto sem board**: a tarefa perde a coluna (campo limpo) e aparece só na lista — sem erro.
- **Excluir coluna com cards**: as tarefas da coluna ficam sem coluna (visíveis na lista e na coluna default do board, se existir); nunca são excluídas por arrasto.
- **Exclusão de projeto com board e tarefas**: além da escolha mover-para-Inbox/excluir-junto (master), as colunas do projeto são excluídas junto com ele.
- **Duas instâncias do webapp abertas** (ou webapp + Telegram simultâneos): last-write-wins, conforme a master; a UI re-busca o estado após cada mutação para minimizar janelas de divergência visual.
- **NLP entende errado o projeto** ("trabalho" como palavra do título vs. projeto Trabalho): a confirmação da Kaguya explicita a interpretação; a correção em linguagem natural ("não, era no Inbox mesmo") move a tarefa.
- **Resíduos do TickTick**: variáveis de ambiente `TICKTICK_*` ausentes não podem quebrar nada; nenhuma instrução da Makima/Kaguya menciona TickTick após esta fase.

## Requirements *(mandatory)*

### Functional Requirements

**Fundação**

- **FR-001**: O schema completo definido na master (`data-model.md`) MUST ser aplicado de uma única vez no banco — incluindo tabelas que só ganham UI nas fases seguintes (recorrência, filtros, hábitos) — com o seed do projeto Inbox.
- **FR-002**: Toda regra de negócio de tarefas MUST viver numa única camada de lógica; o canal Telegram e o canal webapp MUST ser fachadas finas e paritárias sobre ela (nenhuma regra duplicada ou exclusiva de canal).
- **FR-003**: O sistema MUST operar sem nenhuma credencial ou chamada ao TickTick; o servidor MCP do TickTick é removido do runtime e o MCP do Google Calendar permanece intacto.

**CRUD (ambos os canais)**

- **FR-004**: Usuário MUST poder criar, ler, editar, completar, reabrir, mover e excluir (soft delete, com restauração) tarefas e subtarefas (1 nível).
- **FR-005**: Usuário MUST poder criar, renomear, reordenar e excluir projetos e grupos de projetos; o Inbox MUST ser indelével e inarquivável.
- **FR-006**: Tarefas MUST aceitar prioridade em 4 níveis e data de vencimento com hora opcional (a UI de datas avançada é da Fase 2, mas o campo já funciona).
- **FR-007**: Completar tarefa pai com subtarefas abertas MUST pedir confirmação e completar em cascata; exclusão de tarefa via Telegram MUST sempre pedir confirmação prévia.
- **FR-008**: A ordenação manual MUST usar posições esparsas com re-espaçamento transparente em colisão.

**Views do webapp**

- **FR-009**: A view lista MUST mostrar as tarefas do projeto selecionado ordenadas por posição, com subtarefas aninhadas e edição inline do título.
- **FR-010**: Projetos MAY ter board Kanban (colunas configuráveis, no máximo uma marcada como "done"); mover card para a coluna done MUST completar a tarefa; lista e Kanban MUST nunca divergir (mesma fonte).
- **FR-011**: A tela Hoje MUST listar tarefas de hoje + vencidas agrupadas por projeto, com quick-add que entende `#projeto` e `!prioridade` de forma determinística.

**Canal Telegram (Kaguya)**

- **FR-012**: A Kaguya MUST interpretar capturas em português natural (título, projeto, prioridade, data simples) e confirmar a interpretação na resposta, aceitando correção conversacional.
- **FR-013**: A Kaguya MUST responder consultas de agenda do dia ("o que tenho pra hoje?") combinando tarefas (banco próprio) e eventos (Google Calendar via MCP, inalterado).

**Cross-agent e governança**

- **FR-014**: O fluxo "paguei X" MUST completar a tarefa e lançar a despesa (domínio Nami) atomicamente — tudo ou nada — confirmando valor/categoria/conta com o usuário antes (sem defaults financeiros).
- **FR-015**: A constitution MUST receber PATCH amendment atualizando o domínio da kaguya de "TickTick + Google Calendar via MCP" para "PostgreSQL + Google Calendar via MCP", e o `CLAUDE.md` da Kaguya MUST ser reescrito refletindo a nova arquitetura.

### Key Entities

Definidas na master (`data-model.md`). Esta fase usa ativamente: **Projeto**, **Grupo de
projetos**, **Coluna**, **Tarefa** (com subtarefas), e cria adormecidas: Recorrência,
Tag, Filtro salvo, Hábito, Check-in.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uma semana de uso real sem abrir o TickTick — todas as tarefas do dia a dia geridas no app próprio (critério de pronto da Fase 1 na master).
- **SC-002**: 100% das operações de CRUD executáveis pelos dois canais, com cada canal funcionando com o outro desligado (auditável por checklist de paridade).
- **SC-003**: Capturar tarefa leva ≤ 10s pelo Telegram (uma mensagem + confirmação) e ≤ 5s pelo quick-add.
- **SC-004**: Zero divergência entre views: qualquer mutação feita em lista, Kanban ou Telegram aparece nas demais na próxima leitura.
- **SC-005**: No fluxo de pagamento, 100% dos casos de falha simulada terminam sem efeito parcial (tarefa completa sem despesa, ou vice-versa).
- **SC-006**: Ordenação manual sobrevive a recarga de página e a 100+ reordenações consecutivas sem corromper a ordem visível.

## Assumptions

- O schema da master é aplicado pelo mesmo mecanismo dos outros agentes (`scripts/setup_schemas.py`, executado de dentro do container no VPS, conforme `CLAUDE.md` do repo).
- A captura NLP usa o modelo já configurado da Kaguya (Gemini) — nenhum serviço novo.
- A tela Hoje do MVP é a versão simples (lista de hoje+vencidas); o ritual "Meu Dia" completo é da Fase 3.
- Datas no quick-add do webapp ("amanhã", "sexta 17h") são da Fase 2 — no MVP o quick-add cobre só `#projeto` e `!prioridade`; data entra pelo TaskModal.
- Tags existem no banco desde já, mas a UI de tags é da Fase 2.
- A lixeira (restauração de soft delete) pode ser uma view simples por projeto — purga automática (30 dias) é tarefa de manutenção futura, não bloqueia o MVP.
- O domínio de sessão "tarefas" do coordinator permanece o mesmo — só a implementação por trás muda.
