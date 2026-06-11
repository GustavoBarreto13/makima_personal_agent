# Feature Specification: Kaguya · Tarefas — Sub-app no Webapp (Híbrido TickTick)

**Feature Branch**: `004-kaguya-tarefas-webapp`

**Created**: 2026-06-09

**Status**: ⛔ Superseded por [`specs/010-kaguya-tasks-app/`](../010-kaguya-tasks-app/spec.md) (2026-06-11)

> **Nota de supersedência**: esta spec mantinha o TickTick como source of truth com espelho
> local (modelo Híbrido). A decisão registrada em `agents/kaguya/specs_app_tasks_recomendacoes.md`
> e formalizada na spec master 010 **elimina o TickTick por completo** — o PostgreSQL local
> vira o motor de tarefas. Nada desta spec deve ser implementado; o sub-app de tarefas do
> webapp nasce na spec `011-tasks-mvp` (filha da 010).

**Input**: Seção "Tarefas" no webapp do Makima (domínio Kaguya), modelo Híbrido: espelho local
das tarefas do TickTick sincronizado em background, com UI web rápida (estilo TickTick) que lê do
espelho e escreve direto no TickTick (write-through). Plano de referência:
`/root/.claude/plans/d-vida-poss-vel-fazer-graceful-otter.md`.

> **Decisão de arquitetura (do usuário)**: modelo **Híbrido**. O painel mantém uma cópia local
> sincronizada das tarefas para entregar uma UI rápida, mas o **TickTick continua sendo a fonte
> de verdade** — toda escrita feita no painel vai direto para o TickTick (write-through), e o
> celular permanece em sincronia.

---

## User Scenarios & Testing *(mandatory)*

<!--
  Cada história é uma fatia verticalmente independente e testável.
  P1 = MVP utilizável sozinho; P2 = funcionalidade completa após P1; P3 = qualidade de vida.
-->

### User Story 1 — Ver minhas tarefas reais do TickTick, rápido (Priority: P1)

O usuário abre a seção **Tarefas** no painel web do Makima (mesma sidebar de Finanças, Livros e
Diário) e encontra **suas tarefas reais do TickTick** já organizadas, carregando instantaneamente.
Ele alterna entre visões — **Hoje**, **Atrasadas**, **Próximas**, **Todas** — e navega por
projeto. Abre uma tarefa para ver descrição, subtarefas e itens de checklist. Faz uma busca por
texto e encontra qualquer tarefa, em qualquer projeto, na hora. Por trás, o painel se mantém fiel
ao TickTick através de uma sincronização automática em background, com um indicador visível de
"sincronizado há X / sincronizar agora".

**Por que esta prioridade**: É o coração da ideia — um "TickTick na web" que é **rápido** e mostra
**as tarefas de verdade**. Sozinha, já entrega valor: consultar e buscar tarefas pelo navegador sem
a lentidão de bater no TickTick a cada clique. A sincronização que alimenta essa visão é o
substrato que torna tudo confiável.

**Teste independente**: Acessar `/tasks` autenticado, ver as listas populadas a partir da última
sincronização, alternar entre as visões, abrir o detalhe de uma tarefa (com subtarefas/checklist),
buscar por um termo e receber resultados em menos de 1s. Editar uma tarefa no app do TickTick no
celular, acionar "sincronizar agora" e ver a mudança refletida no painel — com o indicador de
sincronização atualizado.

**Acceptance Scenarios**:

1. **Given** o usuário autenticado abre `/tasks`, **When** a página carrega, **Then** as tarefas
   aparecem agrupadas nas visões Hoje/Atrasadas/Próximas/Todas e por projeto, sem espera perceptível
   (lê da cópia local sincronizada, não do TickTick ao vivo).
2. **Given** a lista de tarefas, **When** o usuário abre uma tarefa, **Then** vê título, descrição,
   prioridade, data de vencimento, subtarefas e itens de checklist.
3. **Given** centenas de tarefas espalhadas em vários projetos, **When** o usuário digita um termo na
   busca, **Then** recebe os resultados correspondentes (por título e descrição) em menos de 1s.
4. **Given** uma tarefa foi concluída ou removida no TickTick por outro dispositivo, **When** ocorre
   a próxima sincronização (automática ou manual), **Then** o painel deixa de mostrá-la entre as
   ativas e o estado fica coerente com o TickTick.
5. **Given** o painel está aberto, **When** o usuário olha o indicador de sincronização, **Then** vê
   há quanto tempo foi a última sincronização e um botão "sincronizar agora"; em caso de falha de
   sincronização, vê um estado de erro claro (não um "ok" falso).

---

### User Story 2 — Gerenciar tarefas pelo painel, refletindo no TickTick (Priority: P2)

O usuário cria uma tarefa pelo painel (entrada rápida no topo da lista), define projeto, data,
prioridade e descrição, e ela **aparece no TickTick do celular**. Ele edita campos, conclui, exclui,
adiciona subtarefas e marca itens de checklist — tudo pela web — e cada mudança **propaga para a
conta real do TickTick**. O painel reflete a alteração imediatamente, sem esperar o próximo ciclo de
sincronização. As escritas são autoritativas: se algo falhar no TickTick, o painel avisa e não finge
que deu certo.

**Por que esta prioridade**: Transforma o painel de "somente leitura" em um gerenciador completo.
Depende da US1 (a visão e o espelho já existirem), mas entrega a outra metade do valor: operar as
tarefas reais a partir do conforto da web.

**Teste independente**: Criar uma tarefa no painel → confirmar que aparece no app do TickTick no
celular. Editar a data de vencimento no painel → refletir no celular. Concluir uma tarefa no painel →
ela sai das ativas e fica registrada no histórico. Adicionar uma subtarefa e marcar um item de
checklist → ambos visíveis no TickTick.

**Acceptance Scenarios**:

1. **Given** o usuário preenche a entrada rápida com um título, **When** confirma, **Then** a tarefa
   é criada no TickTick e aparece imediatamente na lista do painel.
2. **Given** uma tarefa existente, **When** o usuário altera título, projeto, prioridade ou data,
   **Then** a alteração é gravada no TickTick e refletida na hora no painel.
3. **Given** uma tarefa ativa, **When** o usuário a conclui no painel, **Then** ela é concluída no
   TickTick, sai da lista de ativas e passa a constar como concluída.
4. **Given** uma tarefa, **When** o usuário adiciona uma subtarefa ou um item de checklist e marca
   um item, **Then** as mudanças são gravadas no TickTick e visíveis no detalhe da tarefa.
5. **Given** uma escrita que falha no TickTick (ex.: indisponibilidade), **When** o usuário tenta a
   ação, **Then** o painel mostra um erro claro em português e **não** exibe a operação como concluída.
6. **Given** o usuário exclui uma tarefa, **When** confirma, **Then** o painel avisa que a exclusão é
   irreversível antes de propagar a remoção ao TickTick.

---

### User Story 3 — Visões avançadas estilo TickTick (Priority: P3)

O usuário organiza as tarefas em um quadro **kanban** (arrastar para reordenar e mover entre
projetos/colunas), consulta uma visão **Próximos 7 dias**, usa **atalhos de teclado** para criar e
concluir rapidamente, e vê **tags coloridas** e agrupamento por prioridade. É a camada de "uau" que
aproxima a experiência do app nativo do TickTick.

**Por que esta prioridade**: Qualidade de vida e fator estético. Não bloqueia o uso (US1/US2 já
entregam um gerenciador funcional), mas eleva a experiência.

**Teste independente**: Abrir o quadro kanban, arrastar uma tarefa entre colunas e confirmar que a
mudança propaga ao TickTick; abrir "Próximos 7 dias" e ver as tarefas do intervalo; usar um atalho de
teclado para criar uma tarefa.

**Acceptance Scenarios**:

1. **Given** o quadro kanban, **When** o usuário arrasta uma tarefa para outra coluna/projeto,
   **Then** a mudança é gravada no TickTick e persiste após nova sincronização.
2. **Given** a visão "Próximos 7 dias", **When** o usuário a abre, **Then** vê as tarefas com
   vencimento no intervalo, ordenadas por data.
3. **Given** o foco na lista, **When** o usuário aciona o atalho de criação, **Then** a entrada
   rápida abre sem uso do mouse.

---

### Edge Cases

- **Credencial do TickTick expira**: a renovação de acesso deve ocorrer e **persistir** sozinha, sem
  o usuário precisar reautenticar manualmente; se a renovação falhar, sincronização e escritas param
  e o indicador mostra erro claro.
- **Conflito de edição simultânea** (mesma tarefa alterada no celular e no painel ao mesmo tempo):
  para um único usuário, prevalece a última escrita e a próxima sincronização reconcilia o estado.
- **Distinção concluída vs. excluída no TickTick**: quando uma tarefa some da listagem ativa, o
  painel a reconcilia da melhor forma possível; a heurística de classificação é aceitável para um
  único usuário e documentada.
- **Muitos projetos**: a varredura completa do TickTick (necessária para sincronizar) acontece em
  background, **fora** do caminho do usuário, para não deixar a UI lenta.
- **Sincronização sobreposta**: um novo ciclo não deve começar enquanto outro está rodando.
- **Primeiro acesso / espelho vazio**: antes da primeira sincronização concluir, o painel comunica
  que está carregando os dados, em vez de mostrar "nenhuma tarefa".

## Requirements *(mandatory)*

### Functional Requirements

**Acesso e escopo**

- **FR-001**: O sistema MUST oferecer uma seção "Tarefas" dentro do painel web existente do Makima,
  acessível pela mesma navegação (sidebar) das demais seções, atrás da mesma autenticação.
- **FR-002**: O sistema MUST restringir o acesso ao único usuário autorizado do painel (mesma
  allowlist das outras seções) — sem acesso anônimo.
- **FR-003**: O sistema MUST apresentar toda a interface e mensagens em português, com erros
  comunicados de forma clara (nunca stacktraces ou jargão de implementação).
- **FR-004**: O sistema MUST ser entregue como uma **nova seção do webapp existente**, reaproveitando
  o domínio de tarefas da Kaguya — **sem** criar um novo agente nem duplicar a lógica de domínio.

**Leitura (US1)**

- **FR-005**: O sistema MUST exibir as tarefas em visões Hoje, Atrasadas, Próximas e Todas, e também
  agrupadas por projeto.
- **FR-006**: O sistema MUST exibir, em cada item da lista, ao menos título, projeto, prioridade,
  data de vencimento e indicação de existência de subtarefas/checklist.
- **FR-007**: O sistema MUST exibir o detalhe de uma tarefa com descrição, subtarefas e itens de
  checklist.
- **FR-008**: O sistema MUST permitir busca textual por título e descrição abrangendo todas as
  tarefas de todos os projetos.
- **FR-009**: As listas e buscas MUST responder a partir da cópia local sincronizada (não devem
  depender de uma consulta ao TickTick ao vivo a cada interação do usuário).

**Sincronização (US1)**

- **FR-010**: O sistema MUST manter a cópia local atualizada automaticamente em background, em
  intervalos regulares, sem ação do usuário.
- **FR-011**: O sistema MUST oferecer um comando "sincronizar agora" para atualização sob demanda.
- **FR-012**: O sistema MUST exibir o estado da sincronização: horário/idade da última sincronização
  e um estado de erro distinguível quando ela falha.
- **FR-013**: O sistema MUST reconciliar tarefas concluídas ou removidas no TickTick por outros
  dispositivos, deixando de exibi-las entre as ativas.
- **FR-014**: O sistema MUST renovar e **persistir** automaticamente a credencial de acesso ao
  TickTick, de modo que sincronização e escrita continuem funcionando por longos períodos sem
  reautenticação manual.
- **FR-015**: O sistema MUST evitar ciclos de sincronização sobrepostos.

**Escrita / write-through (US2)**

- **FR-016**: Os usuários MUST poder criar tarefas pelo painel (com título e, opcionalmente, projeto,
  data, prioridade e descrição), propagando a criação ao TickTick.
- **FR-017**: Os usuários MUST poder editar campos de uma tarefa (título, projeto, prioridade, data,
  descrição), propagando ao TickTick.
- **FR-018**: Os usuários MUST poder concluir e excluir tarefas pelo painel, propagando ao TickTick;
  a exclusão MUST exigir confirmação por ser irreversível.
- **FR-019**: Os usuários MUST poder criar subtarefas e adicionar/marcar itens de checklist,
  propagando ao TickTick.
- **FR-020**: O TickTick MUST permanecer a fonte de verdade: toda escrita é autoritativa nele; o
  painel MUST refletir a alteração imediatamente após o sucesso, sem aguardar o próximo ciclo de
  sincronização.
- **FR-021**: Em caso de falha de escrita no TickTick, o sistema MUST comunicar o erro e **não** MUST
  exibir a operação como bem-sucedida nem deixar o painel divergir silenciosamente.

**Visões avançadas (US3 — pode ser entregue depois)**

- **FR-022**: O sistema SHOULD oferecer um quadro kanban com arrastar-e-soltar para reordenar e mover
  tarefas entre colunas/projetos, propagando a mudança ao TickTick.
- **FR-023**: O sistema SHOULD oferecer uma visão "Próximos 7 dias" e atalhos de teclado para criação
  e conclusão rápidas, além de tags coloridas e agrupamento por prioridade.

### Key Entities *(include if feature involves data)*

- **Tarefa**: unidade de trabalho do usuário. Atributos: título, descrição, projeto, prioridade,
  data de início/vencimento, status (ativa/concluída), ordem, tags. Possui subtarefas e itens de
  checklist. Origem e destino de escrita: TickTick.
- **Projeto**: agrupador de tarefas. Atributos: nome, cor, ordem, ativo/arquivado.
- **Subtarefa**: tarefa filha vinculada a uma tarefa-pai.
- **Item de checklist**: item marcável dentro de uma tarefa.
- **Estado de sincronização**: metadados sobre a última sincronização — horário, status
  (ociosa/rodando/erro) e mensagem de erro; contagens de projetos/tarefas.
- **Credencial de acesso ao TickTick**: token de acesso renovável e persistido que autoriza leitura e
  escrita; renova-se automaticamente antes de expirar.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Ao abrir a seção Tarefas ou alternar entre visões, as listas aparecem em **menos de 1
  segundo** em uso típico.
- **SC-002**: A busca textual retorna resultados em **menos de 1 segundo** mesmo com **centenas** de
  tarefas distribuídas em vários projetos.
- **SC-003**: Uma alteração feita em outro dispositivo (ex.: celular) aparece no painel em **até o
  intervalo de sincronização** (alvo: ≤ 10 minutos) e **imediatamente** após "sincronizar agora".
- **SC-004**: Uma tarefa criada, editada ou concluída no painel aparece corretamente no app do
  TickTick em **segundos** após a confirmação (write-through síncrono).
- **SC-005**: **100%** das escritas bem-sucedidas no painel se refletem no TickTick; nenhuma falha de
  escrita é exibida ao usuário como sucesso.
- **SC-006**: O usuário consegue criar uma tarefa completa pelo painel em **menos de 15 segundos**.
- **SC-007**: O painel opera por **semanas** sem exigir reautenticação manual no TickTick (renovação
  de credencial automática e persistida).
- **SC-008**: O usuário consegue, sem instrução prévia, localizar a visão certa (Hoje/Atrasadas/etc.)
  e abrir o detalhe de uma tarefa no **primeiro** uso.

## Assumptions

- **Usuário único**: a feature herda a autenticação e a allowlist do painel web existente; não há
  multiusuário.
- **TickTick é a fonte de verdade**: o painel mantém uma cópia local **apenas para velocidade**; não
  há edição offline. A estratégia é cópia local + sincronização periódica (pull) + escrita direta no
  TickTick (write-through), sem resolução de conflito bidirecional complexa — adequado a um único
  usuário.
- **Conflitos**: em edição simultânea da mesma tarefa, prevalece a última escrita; a próxima
  sincronização reconcilia.
- **Limitações da API do TickTick** (sem busca/listagem global server-side; suporte limitado a
  listar concluídas; leitura projeto-a-projeto) são absorvidas pela cópia local; a distinção entre
  "concluída" e "excluída" na reconciliação é heurística e aceitável para um único usuário.
- **Intervalo de sincronização** padrão de ~10 minutos, configurável.
- **Escopo de domínio**: implementado como nova seção do webapp existente, reaproveitando o domínio
  de tarefas da Kaguya (princípio de footprint mínimo da constitution) — não como novo agente.
- **Agenda separada**: eventos do Google Calendar (também domínio da Kaguya) **não** fazem parte
  desta feature; o escopo aqui é exclusivamente tarefas do TickTick.
- **Fora de escopo v1**: hábitos, foco/pomodoro, recursos do TickTick fora da Open API oficial,
  multiusuário e uma visão dedicada de "concluídas" (o histórico é retido, mas sua navegação completa
  é qualidade de vida posterior).

## Dependencies

- Conta TickTick com credenciais de acesso (Open API) válidas, já usadas hoje pela Kaguya.
- Painel web existente do Makima (autenticação, navegação e armazenamento estrutural compartilhado).
- Acesso de leitura e escrita às tarefas via a integração de tarefas já existente no projeto.
