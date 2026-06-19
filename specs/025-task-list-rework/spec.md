# Feature Specification: Lista de Tarefas como Árvore + Pessoas (Kaguya · Fatia 025)

**Feature Directory**: `specs/025-task-list-rework`

**Created**: 2026-06-19

**Status**: Draft

**Input**: Handoff de design em `specs/025-task-list-rework/design_handoff_kaguya_lista_arvore/` + decisões do usuário coletadas em planejamento.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Navegar e visualizar a hierarquia completa de tarefas (Priority: P1)

O usuário abre uma lista (projeto) no Kaguya e vê todas as tarefas organizadas em uma árvore:
tarefas de topo com seus filhos aninhados, filhos dos filhos, e assim por diante, em qualquer
profundidade. Cada nível é visualmente recuado (22 px por nível), com linhas-guia verticais
conectando os filhos à mãe. Subtarefas que já estão concluídas ficam riscadas. O usuário pode
colapsar/expandir qualquer ramo para focar no que importa.

**Why this priority**: Sem a árvore visível, todo o resto da feature não existe. É o núcleo.

**Independent Test**: Criar uma tarefa com dois filhos e um neto; conferir que a hierarquia aparece
recuada corretamente, que o caret colapsa/expande o ramo e que o contador "feitas/total" aparece.

**Acceptance Scenarios**:

1. **Given** uma lista com tarefas que têm subtarefas de vários níveis, **When** o usuário abre a vista de Lista, **Then** vê a hierarquia completa recuada, com guias verticais e contadores "done/total" em cada nó que tem filhos.
2. **Given** um nó com filhos, **When** o usuário clica no caret, **Then** o ramo colapsa (filhos somem) e o caret rotaciona para indicar estado colapsado.
3. **Given** um nó colapsado, **When** o usuário recarrega a página, **Then** o nó continua colapsado (estado lembrado por lista no navegador).
4. **Given** um grupo de tarefas, **When** o usuário clica em "Expandir tudo" no cabeçalho do grupo, **Then** toda a subárvore desse grupo abre de uma vez.
5. **Given** uma subtarefa em nível profundo, **When** o usuário passa o mouse sobre ela, **Then** um tooltip mostra o caminho completo da mãe (ex.: "Estudos › ETL ›").

---

### User Story 2 — Criar tarefas e subtarefas rapidamente pelo teclado (Priority: P1)

O usuário está com o cursor em uma linha da árvore e usa atalhos de teclado para criar filhos e
irmãs sem tocar no mouse, navegando pela hierarquia com Tab/Shift+Tab.

**Why this priority**: A criação rápida inline é a principal vantagem de uma árvore. Sem ela, a
feature fica apenas visual.

**Independent Test**: A partir de uma linha existente, pressionar Enter para criar irmã, Tab para
transformar em filha, Shift+Tab para subir um nível. Confirmar que as tarefas persistem e a árvore
reflete a hierarquia correta.

**Acceptance Scenarios**:

1. **Given** cursor na linha de uma tarefa em modo de edição, **When** o usuário pressiona Enter, **Then** um novo campo de texto aparece imediatamente abaixo como irmã (mesmo nível), já em foco para digitar.
2. **Given** cursor em modo de edição, **When** o usuário pressiona Tab, **Then** a linha atual se torna filha da linha imediatamente acima (de mesmo nível), e foco permanece no campo.
3. **Given** cursor em uma subtarefa em modo de edição, **When** o usuário pressiona Shift+Tab, **Then** a subtarefa sobe um nível (vira irmã da antiga mãe), logo abaixo dela na ordem.
4. **Given** cursor em uma nova linha ainda vazia, **When** o usuário pressiona Esc ou tira o foco, **Then** a linha desaparece (sem salvar uma tarefa vazia).
5. **Given** qualquer linha, **When** o usuário clica no botão "+", **Then** um novo campo aparece recuado como filho daquela tarefa e a mãe expande automaticamente.

---

### User Story 3 — Reorganizar a hierarquia arrastando (Priority: P1)

O usuário arrasta qualquer tarefa pelo ícone de alça e a solta em cima, acima ou abaixo de outra
tarefa. A posição vertical do cursor dentro da linha-alvo determina a ação: soltar perto do topo
insere antes (irmã acima), soltar no centro torna filha, soltar perto da base insere depois (irmã
abaixo). Feedback visual claro mostra qual zona está ativa.

**Why this priority**: Re-parentear/reordenar é o diferencial de uma árvore arrastável.

**Independent Test**: Arrastar uma tarefa raiz para cima de outra (zona "centro") e confirmar que
ela vira filha. Arrastar uma subtarefa para "acima" de uma raiz e confirmar que ela se torna raiz.

**Acceptance Scenarios**:

1. **Given** o usuário clica e segura a alça de uma tarefa, **When** arrasta sobre outra linha, **Then** uma linha-guia 2 px aparece na borda superior (zona "antes") ou inferior (zona "após"), ou a linha-alvo fica com borda colorida (zona "filho").
2. **Given** o usuário solta na zona "filho", **Then** a tarefa arrastada se torna filha da alvo, herda a lista (projeto) da mãe, e a mãe expande para mostrar o novo filho.
3. **Given** o usuário solta na zona "antes" ou "após", **Then** a tarefa arrastada vira irmã da alvo, na posição correspondente.
4. **Given** o usuário tenta arrastar uma tarefa para dentro de um descendente dela mesma, **When** solta, **Then** a operação é ignorada (nenhuma mudança).
5. **Given** um drop bem-sucedido, **When** a tela recarrega silenciosamente, **Then** a nova posição persiste (sem flash de spinner).

---

### User Story 4 — Promover uma subtarefa a tarefa independente (Priority: P2)

O usuário abre uma subtarefa (via hover → "Tornar independente" ou no modal de edição) e a
desvincula da mãe. A subtarefa passa a ser uma tarefa de topo na mesma lista, aparecendo no final
das raízes. Uma mensagem discreta confirma a ação.

**Why this priority**: Fundamental para o fluxo de "decompor → separar quando crescer".

**Independent Test**: Criar uma subtarefa, acionar "Tornar independente" e confirmar que ela aparece como raiz, sem parent, e que seus filhos (se tiver) continuam sendo filhos dela.

**Acceptance Scenarios**:

1. **Given** o usuário passa o mouse sobre uma subtarefa, **When** clica em "↗ Tornar independente", **Then** a tarefa some do lugar atual e reaparece como raiz ao final da lista, com toast "Agora é uma tarefa independente".
2. **Given** o modal de edição de uma subtarefa está aberto, **When** o usuário clica em "Tornar independente", **Then** o modal fecha, a tarefa se torna raiz e o toast aparece.
3. **Given** uma subtarefa promovida que tinha filhos, **When** torna-se raiz, **Then** os filhos permanecem seus filhos (a subárvore migra intacta).

---

### User Story 5 — Atribuir pessoas da Komi a tarefas e subtarefas (Priority: P2)

O usuário marca responsáveis em qualquer tarefa (raiz ou subtarefa). Ao passar o mouse, um botão
"Pessoas" abre um popover com busca e lista de pessoas do diretório Komi. Os avatares aparecem
na linha da tarefa, empilhados, e também no card do Kanban. A seção "Pessoas" no modal de edição
permite o mesmo.

**Why this priority**: Integração de pessoas foi decidida como in-scope completo nesta fatia.

**Independent Test**: Abrir o popover de pessoas, selecionar dois responsáveis, fechar — conferir avatares na linha. Abrir o modal da mesma tarefa e confirmar que as pessoas aparecem selecionadas.

**Acceptance Scenarios**:

1. **Given** o usuário passa o mouse sobre uma linha, **When** clica em "Pessoas" (ícone de usuário), **Then** um popover aparece com campo de busca e a lista de pessoas da Komi; pessoas já marcadas mostram um check.
2. **Given** o popover aberto, **When** o usuário clica em uma pessoa, **Then** ela é alternada (add/remove); os avatares na linha atualizam em tempo real.
3. **Given** uma tarefa com responsáveis, **When** o usuário abre o modal de edição, **Then** a seção "Pessoas" mostra todas as pessoas da Komi com as já selecionadas em destaque.
4. **Given** uma tarefa com responsáveis, **When** o usuário abre o Kanban, **Then** o card dessa tarefa exibe os avatares dos responsáveis.
5. **Given** uma pessoa com nome e foto real no diretório Komi, **When** aparece como avatar, **Then** exibe a foto; se não houver foto, exibe as iniciais sobre fundo colorido.

---

### User Story 6 — Subtarefas planejadas aparecem no Meu Dia e em smart lists (Priority: P2)

Quando uma subtarefa é explicitamente adicionada ao Meu Dia (ou cai na regra de uma smart list),
ela aparece nessas vistas como item independente — sem mostrar a hierarquia completa, apenas com
uma indicação visual de que tem mãe. Kanban e Eisenhower continuam mostrando só tarefas raiz.

**Why this priority**: Expande o alcance das subtarefas sem poluir as vistas operacionais principais.

**Independent Test**: Adicionar uma subtarefa ao Meu Dia. Confirmar que ela aparece no Meu Dia com indicação de mãe. Confirmar que o Kanban NÃO a mostra.

**Acceptance Scenarios**:

1. **Given** uma subtarefa adicionada ao Meu Dia, **When** o usuário abre a tela Meu Dia, **Then** a subtarefa aparece como item no plano, com indicação visual "subtarefa de [nome da mãe]".
2. **Given** uma subtarefa cujo vencimento está no período de uma smart list, **When** o usuário abre essa smart list, **Then** a subtarefa aparece como item da lista.
3. **Given** qualquer subtarefa, **When** o usuário abre o Kanban, **Then** ela NÃO aparece como card (Kanban é root-only).
4. **Given** qualquer subtarefa, **When** o usuário abre o Eisenhower, **Then** ela NÃO aparece como quadrante (Eisenhower é root-only).

---

### User Story 7 — Agrupar e ordenar as tarefas da lista (Priority: P3)

O usuário usa os controles de toolbar para agrupar por projeto ou prioridade, e para ordenar por
posição manual, inteligente, vencimento ou prioridade. A ordenação e agrupamento aplicam-se
recursivamente por nível de irmãos.

**Why this priority**: Já existia parcialmente; agora precisa funcionar com a nova árvore.

**Independent Test**: Mudar agrupamento para "Prioridade" e confirmar que as raízes ficam agrupadas por prioridade. Mudar ordenação para "Vencimento" e confirmar que irmãos dentro de cada nível estão ordenados por data.

**Acceptance Scenarios**:

1. **Given** a tela de uma smart list com tarefas de vários projetos, **When** o usuário seleciona "Agrupar: Projeto", **Then** as raízes ficam agrupadas por lista, cada grupo com cabeçalho colapsável.
2. **Given** qualquer vista, **When** o usuário seleciona ordenação "Manual", **Then** o drag-and-drop está habilitado e as tarefas permanecem na ordem salva.
3. **Given** ordenação "Inteligente", **When** renderiza, **Then** tarefas com alta prioridade e data próxima aparecem antes, recursivamente em cada nível de irmãos.
4. **Given** a tela de um único projeto, **When** carrega, **Then** não mostra cabeçalho de grupo (view single-project força "sem agrupamento").

---

### Edge Cases

- O que acontece quando o usuário tenta criar uma subtarefa de uma tarefa já concluída? → Bloqueado com mensagem.
- O que acontece quando a profundidade já é 12 e o usuário tenta indentar mais? → A operação de Tab/drag é ignorada silenciosamente.
- O que acontece quando o usuário arrasta uma tarefa que tem filhos para dentro de um de seus próprios filhos? → Operação bloqueada (anti-ciclo).
- O que acontece quando uma tarefa recorrente é concluída e tem filhos (subárvore)? → A próxima ocorrência é gerada com a subárvore inteira (todos os filhos copiados e resetados para abertos).
- O que acontece se uma smart list não tem regra de project e uma subtarefa casa? → A subtarefa aparece com identificação da lista-mãe.
- O que acontece quando uma pessoa da Komi é removida do diretório? → O avatar some dessa tarefa sem quebrar o carregamento da lista.

---

## Requirements *(mandatory)*

### Functional Requirements

**Árvore e hierarquia:**

- **FR-001**: O sistema DEVE exibir tarefas e suas subtarefas como uma árvore hierárquica de profundidade irrestrita (cap de 12 níveis), com recuo visual proporcional à profundidade.
- **FR-002**: O sistema DEVE exibir linhas-guia verticais conectando visualmente os filhos às mães.
- **FR-003**: Cada nó com filhos DEVE exibir um caret que colapsa/expande o ramo; nós-folha exibem um espaçador do mesmo tamanho (alinhamento).
- **FR-004**: Nós com filhos DEVEM exibir um contador "concluídas/total" de filhos diretos.
- **FR-005**: O estado de colapso de cada nó DEVE persistir no navegador (por lista), de modo que recarregar a página preserve o estado.
- **FR-006**: O cabeçalho de cada grupo DEVE ter um botão "Expandir tudo / Recolher tudo" que afeta toda a subárvore do grupo.
- **FR-007**: Subtarefas em profundidade ≥ 2 DEVEM exibir, ao hover, um tooltip com o caminho completo da mãe (ex.: "Estudos › ETL").

**Criação e edição inline:**

- **FR-008**: Clicar no título de uma tarefa DEVE entrar em modo de edição inline (input de texto).
- **FR-009**: Em modo de edição, `Enter` DEVE confirmar o título e criar uma irmã imediatamente abaixo, já focada.
- **FR-010**: Em modo de edição, `Tab` DEVE transformar a tarefa atual em filha da irmã imediatamente acima (mesma mãe, menor posição), herdando lista e coluna da nova mãe.
- **FR-011**: Em modo de edição, `Shift+Tab` DEVE subir a tarefa um nível (vira irmã da antiga mãe, posicionada logo após ela).
- **FR-012**: Em modo de edição, `Esc` DEVE cancelar a edição; se a linha era nova e vazia, DEVE ser removida.
- **FR-013**: Blur num campo vazio de tarefa recém-criada DEVE remover a linha.
- **FR-014**: O botão "+" em hover DEVE criar uma subtarefa (filho) e expandir a mãe.
- **FR-015**: A linha "Adicionar tarefa" no rodapé de cada grupo DEVE criar uma raiz naquele grupo/projeto.

**Drag-and-drop:**

- **FR-016**: Cada linha DEVE ter uma alça de arraste visível ao hover.
- **FR-017**: Ao arrastar sobre uma linha-alvo, o sistema DEVE calcular a zona pela posição vertical do ponteiro: topo 28% → "antes" (irmã acima), base 28% → "após" (irmã abaixo), centro → "filho".
- **FR-018**: A zona ativa DEVE ter feedback visual distinto: linha-guia 2 px no topo ou base para "antes"/"após"; borda colorida + fundo tintado para "filho".
- **FR-019**: Ao soltar na zona "filho", a tarefa DEVE se tornar filha da alvo, herdando lista (projeto) da nova mãe; a mãe DEVE expandir.
- **FR-020**: O sistema DEVE bloquear drops que criariam ciclos (tarefa dentro de seus próprios descendentes).
- **FR-021**: Após um drop bem-sucedido, a nova posição DEVE persistir sem flash de spinner (recarregamento silencioso).

**Promote (tornar independente):**

- **FR-022**: Em hover, DEVE aparecer o botão "↗" ("Tornar independente") em qualquer subtarefa.
- **FR-023**: Ao acionar, a subtarefa (e toda sua subárvore) DEVE se tornar raiz na mesma lista, com um toast de confirmação "Agora é uma tarefa independente".
- **FR-024**: O botão "Tornar independente" DEVE aparecer também no modal de edição quando a tarefa tem mãe.

**Pessoas (Komi):**

- **FR-025**: Em hover sobre qualquer linha, DEVE aparecer botão de "Pessoas" que abre um popover com busca e lista de pessoas da Komi.
- **FR-026**: O popover DEVE permitir add/remove de responsáveis por clique; as pessoas selecionadas são mostradas com check.
- **FR-027**: Avatares dos responsáveis DEVEM aparecer na linha da árvore (empilhados, máximo 3 visíveis + "+N").
- **FR-028**: O avatar DEVE mostrar foto real se disponível no diretório Komi; caso contrário, iniciais sobre fundo colorido determinístico.
- **FR-029**: A seção "Pessoas" no modal de edição DEVE listar todas as pessoas da Komi com as selecionadas em destaque.
- **FR-030**: O Kanban DEVE exibir avatares dos responsáveis nos cards.

**Modal de edição — banner de mãe:**

- **FR-031**: Quando a tarefa editada tem mãe, o topo do modal DEVE exibir "Subtarefa de «título da mãe»" com botão "Tornar independente" e link clicável para abrir a mãe.

**Cross-view:**

- **FR-032**: Subtarefas com `my_day_date` definido DEVEM aparecer no Meu Dia como itens independentes, com indicação visual de que têm mãe.
- **FR-033**: Subtarefas que casam com as regras de uma smart list DEVEM aparecer nessa lista.
- **FR-034**: O Kanban DEVE continuar exibindo apenas tarefas raiz (sem subtarefas como cards).
- **FR-035**: O Eisenhower DEVE continuar exibindo apenas tarefas raiz.

**Agrupamento e ordenação:**

- **FR-036**: A toolbar DEVE oferecer chips de filtro por prioridade (Tudo / Alta+ / Média+ / Baixa+), toggle "Concluídas", botão de agrupamento (Projeto / Prioridade / Nenhum) e botão de ordenação (Manual / Inteligente / Vencimento / Prioridade).
- **FR-037**: Ordenação "Manual" DEVE habilitar o drag-and-drop. Os demais modos DEVEM aplicar a lógica de sort recursivamente em cada nível de irmãos.
- **FR-038**: Vista de projeto único DEVE forçar agrupamento "Nenhum" (sem cabeçalho de grupo).

---

### Key Entities

- **Tarefa**: unidade atômica da hierarquia. Tem título, lista (projeto), posição entre irmãos, prioridade, vencimento, tipo, notas, recorrência, tags, status e — agora — referência à mãe (opcional) e lista de responsáveis.
- **Responsável**: pessoa do diretório Komi associada a uma tarefa. Tem id, nome e foto (opcional). A associação é N:N (muitas pessoas numa tarefa, uma pessoa em muitas tarefas).
- **Grupo de exibição**: agrupamento visual de tarefas na Lista (por projeto, prioridade ou nenhum). Não tem persistência — é derivado dos dados em tempo de render.
- **Estado de colapso**: memória local (navegador) do nó colapsado/expandido para cada lista. Chave: lista × id da tarefa.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O usuário consegue criar uma hierarquia de 3 níveis de profundidade em menos de 60 segundos usando apenas o teclado (Enter + Tab).
- **SC-002**: O drag-and-drop não gera flash de carregamento visível — ao soltar um item, a árvore continua interativa imediatamente.
- **SC-003**: A árvore reabre exatamente como foi deixada (colapso lembrado) ao recarregar a página, 100% das vezes.
- **SC-004**: A atribuição de uma pessoa a uma tarefa (via popover) completa-se em no máximo 3 cliques.
- **SC-005**: Subtarefas planejadas aparecem no Meu Dia e em smart lists sem qualquer ação manual além de adicioná-las ao Meu Dia.
- **SC-006**: O Kanban e o Eisenhower continuam funcionando sem qualquer diferença visual ou comportamental — sem regressão.
- **SC-007**: A fidelidade visual da Lista está em paridade com o protótipo do handoff (mesmas cores, tipografia, espaçamento de 22 px, guias, densidade compacta/confortável).

---

## Assumptions

- A autenticação e o controle de acesso são os mesmos do webapp atual (usuário único, cookie de sessão).
- O diretório de pessoas (Komi) já tem API funcional (`GET /api/people/`) — não é escopo desta fatia criar/editar pessoas.
- O banco de dados já tem a coluna de referência de mãe na tabela de tarefas — nenhuma migração de schema é necessária.
- O banco já suporta ordenação esparsa com aritmética de ponto médio — a mesma lógica usada hoje para Kanban e Lista.
- A profundidade máxima suportada é 12 níveis — abaixo do limite técnico de qualquer CTE recursiva razoável.
- Todas as subtarefas herdam a lista (projeto) da mãe ao serem re-parenteadas — comportamento definido no handoff.
- Subtarefas não podem ter recorrência própria — apenas a tarefa raiz de uma série pode ser recorrente.
- A clonagem de subárvore em recorrência (ao concluir uma tarefa recorrente) DEVE preservar toda a hierarquia de filhos, com cada filho resetado para aberto.
- O Kanban continua exibindo apenas tarefas de topo — esta fatia não altera o comportamento do Kanban, exceto por adicionar avatares de responsáveis.
- O estado de colapso é armazenado no `localStorage` do navegador (não no servidor) — é por dispositivo.
- O tooltip de migalha de profundidade mostra apenas o caminho da mãe (sem incluir a tarefa atual), em texto corrido com separador "›".
- A ordenação "Inteligente" e outros modos de sort aplicam-se recursivamente em cada nível de irmãos, sem misturar tarefas de níveis distintos.
