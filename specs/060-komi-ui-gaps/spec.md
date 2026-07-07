# Feature Specification: Completar a interface da Komi — apelidos, busca, estatísticas, lixeira e desvínculo

**Feature Branch**: `060-komi-ui-gaps`

**Created**: 2026-07-07

**Status**: Rascunho — auditoria completa em 2026-07-07, código ainda não implementado

**Input**: User description: "Fechar os gaps de interface e paridade da Komi encontrados na
auditoria: gerenciar apelidos (hoje só é possível adicionar — apelidos existentes aparecem
como chips somente-leitura, não há como remover ou corrigir um apelido errado, nem endpoint
para isso, nem tool para o agente); busca real no diretório (o placeholder promete 'pessoa,
apelido, cidade' mas o filtro só olha o nome — o endpoint de smart-match do backend, que
cobre apelidos, nunca é chamado pela UI); tela de estatísticas de relacionamentos (a Komi é
o único shell sem stats: distribuição por categoria, aniversários por mês, densidade de
vínculos por domínio, pessoas há mais tempo sem interação — incluindo quem NUNCA teve
interação, que hoje a seção 'reconectar' da Home nunca sugere); restaurar pessoa excluída
(lixeira, como a Kaguya tem — hoje só via SQL manual); desvincular um item cross-agent pelo
hub da pessoa (a agregação é somente-leitura: um vínculo errado de transação/tarefa/livro/
bullet não pode ser desfeito); e limpeza de código morto (PersonPicker sem CSS que a Violet
teve que reimplementar, função de API órfã, indicadores de vínculo dos cards que sempre
mostram '–' em 3 de 4 domínios) e exposição ao agente Telegram das tools que hoje são
webapp-only (editar/excluir data importante)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Gerenciar apelidos (Priority: P1)

Como usuário, quero remover ou corrigir um apelido de uma pessoa — hoje apelidos existentes
aparecem como chips somente-leitura no modal de edição: uma vez adicionado errado, não há
nenhum caminho (interface ou agente) para removê-lo.

**Why this priority**: CRUD incompleto do dado que alimenta o smart-match de todos os
agentes: um apelido errado causa vínculos errados em cascata (auto-link do diário, buscas).
Combina com a spec 058 (apelidos presos) para tornar apelidos gerenciáveis de ponta a ponta.

**Independent Test**: Adicionar um apelido errado a uma pessoa, removê-lo pelo modal de
edição, confirmar que sumiu e que a busca não o encontra mais.

**Acceptance Scenarios**:

1. **Given** uma pessoa com apelidos, **When** o usuário remove um apelido no modal de
   edição, **Then** ele some da pessoa, da busca e do smart-match.
2. **Given** um apelido com erro de grafia, **When** o usuário o corrige, **Then** a versão
   nova substitui a antiga (sem duplicar).
3. **Given** o agente no Telegram, **When** o usuário pede para remover um apelido,
   **Then** a operação está disponível também por lá.
4. **Given** falha na remoção, **When** a operação aborta, **Then** o usuário vê aviso e o
   chip permanece.

---

### User Story 2 - Busca real no diretório (Priority: P2)

Como usuário, quero buscar pessoas por nome, apelido ou cidade — como o campo de busca
promete — e hoje só o nome funciona: o filtro é local e ignora apelidos e cidade, enquanto o
mecanismo de busca inteligente do servidor (que cobre apelidos com normalização de acentos)
existe e nunca é usado pela interface.

**Why this priority**: O placeholder mente para o usuário e a capacidade de servidor fica
ociosa — mesmo padrão do filtro de gênero da Mai (spec 057). Buscar pelo apelido é o caso de
uso mais natural do domínio ("como eu chamo a pessoa").

**Independent Test**: Buscar por um apelido cadastrado e pela cidade de uma pessoa e
confirmar que ambas retornam a pessoa; buscar com acento divergente e confirmar o match.

**Acceptance Scenarios**:

1. **Given** uma pessoa com apelido, **When** o usuário busca pelo apelido, **Then** a
   pessoa aparece no resultado.
2. **Given** uma pessoa com cidade preenchida, **When** o usuário busca pela cidade,
   **Then** a pessoa aparece.
3. **Given** uma busca com caixa/acentos divergentes, **When** executada, **Then** o match
   acontece (normalização do smart-match).
4. **Given** uma busca sem resultados, **When** a lista renderiza, **Then** o estado vazio
   explica que é a busca (com ação de limpar), não "diretório vazio".

---

### User Story 3 - Estatísticas de relacionamentos (Priority: P2)

Como usuário, quero uma visão de estatísticas do meu círculo — distribuição por categoria,
aniversários por mês, densidade de vínculos por domínio, pessoas há mais tempo sem
interação — e quero que as sugestões de reconexão incluam quem **nunca** teve interação
registrada (hoje a Home só sugere quem já interagiu alguma vez: o caso mais extremo de
"sumido" nunca aparece).

**Why this priority**: A Komi é o único shell sem tela de estatísticas (Nami, Kaguya,
Frieren, Akane, Marin e Mai têm). A inversão da lógica de reconexão corrige uma feature que
hoje faz o oposto da intenção.

**Independent Test**: Abrir a tela de estatísticas e conferir os blocos contra os dados
reais; cadastrar uma pessoa sem nenhuma interação e confirmar que ela aparece como
candidata à reconexão.

**Acceptance Scenarios**:

1. **Given** o acervo de pessoas, **When** o usuário abre as estatísticas, **Then** vê
   distribuição por categoria/relação, aniversários por mês e densidade de vínculos por
   domínio (finanças, tarefas, diário, livros).
2. **Given** pessoas com e sem interações, **When** as estatísticas listam "há mais tempo
   sem contato", **Then** quem nunca interagiu aparece no topo (não é omitido).
3. **Given** a seção de reconexão da Home, **When** renderiza, **Then** inclui pessoas sem
   qualquer interação registrada como candidatas.
4. **Given** um acervo vazio ou recém-criado, **When** a tela abre, **Then** estados vazios
   amigáveis (sem erro).

---

### User Story 4 - Lixeira: restaurar pessoa excluída (Priority: P2)

Como usuário, quero desfazer a exclusão de uma pessoa — a exclusão já é lógica (os dados
ficam no banco), mas não existe nenhum caminho para listar excluídas nem restaurar, exceto
SQL manual no servidor.

**Why this priority**: Paridade com o padrão do repo (Kaguya tem lixeira com restauração) e
rede de segurança para exclusão acidental de um cadastro rico (contatos, datas, vínculos,
histórico).

**Independent Test**: Excluir uma pessoa, abrir a lixeira, restaurá-la e confirmar que ela
volta ao diretório com datas, apelidos e vínculos intactos.

**Acceptance Scenarios**:

1. **Given** uma pessoa excluída, **When** o usuário abre a lixeira, **Then** ela aparece
   listada com a data da exclusão.
2. **Given** a lixeira, **When** o usuário restaura uma pessoa, **Then** ela volta ao
   diretório com todos os dados e vínculos preservados.
3. **Given** uma pessoa restaurada cujo apelido foi reutilizado por outra durante a exclusão
   (regra da spec 058), **When** a restauração acontece, **Then** o conflito é apresentado
   ao usuário (o apelido não é tomado de volta silenciosamente).
4. **Given** o agente no Telegram, **When** o usuário pede para restaurar alguém, **Then** a
   operação está disponível também por lá.

---

### User Story 5 - Desvincular itens cross-agent pelo hub (Priority: P3)

Como usuário, quero remover um vínculo errado entre uma pessoa e um item de outro domínio
(transação, tarefa, livro, bullet do diário) diretamente do hub da pessoa — hoje a
agregação é somente-leitura: um vínculo criado por engano (ex.: smart-match na pessoa
errada) fica lá para sempre.

**Why this priority**: Fecha o ciclo do sistema de vínculos: criar existe em todos os
agentes, desfazer não existe em nenhum lugar. Menos frequente que os demais, por isso P3.

**Independent Test**: Vincular uma transação à pessoa errada, abrir o hub dela, desvincular
e confirmar que o item sumiu do hub (e o item em si continua intacto no domínio de origem).

**Acceptance Scenarios**:

1. **Given** o hub da pessoa com itens vinculados, **When** o usuário desvincula um item,
   **Then** o vínculo some do hub e das contagens — e o item continua existindo no domínio
   de origem.
2. **Given** um desvínculo, **When** confirmado, **Then** há confirmação prévia (ação
   destrutiva do vínculo) e feedback de sucesso/erro.
3. **Given** um bullet do diário com menção @pessoa no texto, **When** desvinculado,
   **Then** o comportamento é claro: o vínculo manual some; a menção textual permanece no
   diário (o texto não é editado).

---

### User Story 6 - Limpeza de código morto e paridade do agente (Priority: P3)

Como mantenedor, quero eliminar as promessas não cumpridas catalogadas na auditoria: o
componente de seleção de pessoa "reutilizável" está morto e sem estilo (o diário teve que
reimplementar o seu); a função de listagem do cliente de API nunca é chamada; 3 dos 4
indicadores de vínculo dos cards do diretório mostram sempre "–"; e as operações de
editar/excluir data importante não estão disponíveis para o agente no Telegram (só no
webapp), embora a documentação as liste como públicas.

**Why this priority**: Dívida que confunde manutenção e paridade Telegram↔webapp incompleta.

**Independent Test**: Verificar que não restam componentes/funções órfãos no shell da Komi;
pelo Telegram, editar e excluir uma data importante de uma pessoa.

**Acceptance Scenarios**:

1. **Given** o seletor de pessoa compartilhado, **When** a limpeza é feita, **Then** ou ele
   é estilizado e adotado pelos consumidores (diário), ou é removido — nunca mantido morto.
2. **Given** os indicadores de vínculo dos cards do diretório, **When** renderizam,
   **Then** mostram contagens reais por domínio ou são removidos (nada de "–" permanente).
3. **Given** o agente no Telegram, **When** o usuário pede para editar ou excluir uma data
   importante, **Then** a operação funciona (paridade com o webapp).
4. **Given** a documentação do agente, **When** atualizada, **Then** reflete exatamente
   quais operações estão disponíveis por qual canal.

---

### Edge Cases

- Remover o último apelido de uma pessoa: permitido (apelidos são opcionais).
- Corrigir um apelido para um que já pertence a outra pessoa ativa: erro claro nomeando a
  dona (regra da spec 058).
- Busca combinada com filtros de categoria existentes: os dois se compõem.
- Estatísticas com todas as pessoas sem interação: blocos renderizam com estados vazios
  coerentes, não erro.
- Restaurar pessoa cujos vínculos apontam para itens excluídos nos domínios de origem: os
  vínculos seguem a política da spec 058 (mantidos, não contados).
- Desvincular um item cuja origem foi o vínculo automático de @menção do diário: um novo
  salvamento do mesmo bullet não pode recriar o vínculo removido silenciosamente (decisão de
  comportamento registrada no plano).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O usuário DEVE poder remover e corrigir apelidos de uma pessoa pela interface
  e pelo agente; remoções/correções refletem imediatamente na busca e no smart-match.
- **FR-002**: A busca do diretório DEVE cobrir nome, apelido e cidade — usando o mecanismo
  de busca inteligente do servidor (com normalização) — e o placeholder/estados vazios DEVEM
  refletir o comportamento real.
- **FR-003**: O sistema DEVE oferecer uma tela de estatísticas de relacionamentos com, no
  mínimo: distribuição por categoria, aniversários por mês, densidade de vínculos por
  domínio e ranking de tempo sem interação incluindo quem nunca interagiu.
- **FR-004**: A sugestão de reconexão da Home DEVE incluir pessoas sem interação registrada.
- **FR-005**: O sistema DEVE oferecer lixeira de pessoas: listar excluídas e restaurar
  (interface e agente), preservando dados e vínculos; conflitos de apelido na restauração
  são apresentados, não resolvidos silenciosamente.
- **FR-006**: O hub da pessoa DEVE permitir desvincular qualquer item cross-agent, com
  confirmação, sem afetar o item no domínio de origem.
- **FR-007**: As operações de editar/excluir data importante DEVEM estar disponíveis para o
  agente no Telegram; a documentação do agente DEVE indicar o canal de cada operação.
- **FR-008**: Os órfãos catalogados na auditoria DEVEM deixar de ser órfãos ou ser
  removidos: seletor de pessoa compartilhado (adotar com estilo ou remover), função de
  listagem do cliente de API, indicadores de vínculo sempre-vazios dos cards.

### Key Entities

- **Apelido**: passa a ter ciclo de vida completo (adicionar, corrigir, remover) em ambos os
  canais.
- **Pessoa excluída**: visível na lixeira, restaurável com dados e vínculos preservados.
- **Vínculo pessoa↔item**: passa a ser removível pelo hub (a criação já existe nos agentes).
- **Estatísticas de relacionamentos**: visão agregada derivada (não armazena dados próprios).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um apelido errado pode ser removido pela interface em menos de 10 segundos a
  partir do diretório; após a remoção, zero matches por ele.
- **SC-002**: Buscas por apelido e cidade retornam a pessoa em 100% dos casos cadastrados;
  zero divergência entre o que o placeholder promete e o que a busca faz.
- **SC-003**: A tela de estatísticas renderiza todos os blocos com dados coerentes com o
  diretório; pessoas sem interação aparecem no ranking de reconexão.
- **SC-004**: Uma pessoa excluída e restaurada volta com 100% dos dados e vínculos.
- **SC-005**: Um vínculo desfeito some do hub e das contagens imediatamente e após
  recarregar; o item de origem permanece intacto em 100% dos casos.
- **SC-006**: Zero componentes/funções órfãos remanescentes no shell da Komi (checagem por
  item da auditoria); editar/excluir data funciona pelo Telegram.

## Assumptions

- Escopo de paridade escolhido pelo usuário na auditoria de 2026-07-07: gestão de apelidos +
  restore, busca real + estatísticas, desvínculo cross-agent e digest de aniversários (este
  último na spec 059).
- A busca por cidade pode exigir ampliar o smart-match do servidor (hoje cobre nome e
  apelido) — decisão de plano; o requisito é o comportamento prometido pelo campo.
- A lixeira segue o padrão da Kaguya (listar + restaurar); exclusão definitiva (purge) fica
  fora do escopo desta spec.
- O ranking "tempo sem interação" usa as mesmas fontes da visão geral atual (diário,
  finanças, tarefas), com a correção de eficiência da spec 058 (FR-011) como pré-requisito
  desejável, não bloqueante.
- Depende da spec 058 nas regras de apelido (unicidade só entre ativas) e na política de
  vínculos de itens excluídos; pode ser planejada em paralelo.
