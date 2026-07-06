# Feature Specification: QoL — arquivar listas + localização nos eventos (Kaguya)

**Feature Branch**: `039-tasks-qol`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "Duas melhorias de qualidade de vida na Kaguya: (A) arquivar listas de verdade — tirar da navegação preservando as tarefas, com tela de arquivadas e restauração; (B) exibir a localização dos eventos do Google Calendar na agenda e no Meu Dia do webapp, com link para o Google Maps."

## Visão geral

Duas pendências pequenas e independentes, empacotadas numa única spec.

**Arquivar listas**: hoje, uma lista encerrada só tem dois destinos — continuar poluindo a
sidebar ou ser excluída (o que força mover ou apagar as tarefas). Falta o meio-termo de
qualquer app maduro: **arquivar** — a lista sai da navegação e dos cálculos do dia a dia,
mas fica íntegra (com suas tarefas) numa área de arquivadas, restaurável a qualquer momento.

**Localização nos eventos**: os eventos do Google Calendar têm local, e a agenda do webapp
já o exibe em parte — mas o Meu Dia não recebe o dado, e não há como abrir o endereço no
mapa. A melhoria: exibir o local de forma consistente onde o evento aparece e transformá-lo
em **link para o Google Maps**.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Arquivar uma lista encerrada (Priority: P1)

Um projeto acaba (ex.: "Mudança de apartamento"). O usuário arquiva a lista pelo menu de
contexto na sidebar: ela desaparece da navegação, das views (Hoje, Meu Dia, smart lists) e
dos contadores — mas nada é movido nem apagado. As tarefas dela (feitas e não feitas) ficam
guardadas junto.

**Why this priority**: é a dor principal — a alternativa atual (excluir) destrói histórico
ou força faxina manual.

**Independent Test**: criar uma lista com 3 tarefas (1 no Meu Dia, 1 vencendo hoje),
arquivá-la e conferir que sumiu da sidebar, do Hoje e do Meu Dia; conferir que a contagem
global de tarefas do banco não mudou.

**Acceptance Scenarios**:

1. **Given** uma lista qualquer (exceto o Inbox), **When** a arquivo pelo menu de contexto,
   **Then** ela some da sidebar sem confirmações sobre as tarefas — nada é movido/apagado.
2. **Given** uma lista arquivada com tarefas datadas, **When** consulto Hoje, Amanhã, Meu
   Dia, matriz e smart lists, **Then** as tarefas dela não aparecem.
3. **Given** o Inbox, **When** procuro a opção de arquivar, **Then** ela não existe para ele.
4. **Given** uma lista arquivada, **When** busco por uma tarefa dela na busca global,
   **Then** a tarefa aparece com uma marca de "lista arquivada" (a busca é a exceção — acha
   tudo).

---

### User Story 2 - Ver e restaurar arquivadas (Priority: P2)

O usuário acessa a área de **listas arquivadas**, vê cada uma com seu nome e contagem de
tarefas, pode abrir para consultar o conteúdo e pode **restaurar** — a lista volta à
navegação exatamente como era.

**Why this priority**: arquivar sem porta de volta é quase excluir; a restauração fecha o
ciclo.

**Independent Test**: arquivar uma lista, abrir a área de arquivadas, conferir o conteúdo,
restaurar e conferir que voltou à sidebar com todas as tarefas e configurações.

**Acceptance Scenarios**:

1. **Given** listas arquivadas, **When** abro a área de arquivadas, **Then** vejo todas, com
   data de arquivamento e contagem de tarefas.
2. **Given** uma lista arquivada, **When** a restauro, **Then** ela reaparece na navegação
   com tarefas, grupo e configurações intactos.
3. **Given** uma lista arquivada, **When** quero excluí-la definitivamente, **Then** o fluxo
   de exclusão existente continua disponível a partir da área de arquivadas.

---

### User Story 3 - Ver o local do evento e abrir no Maps (Priority: P2)

Os eventos do Google Calendar com endereço mostram o **local** onde quer que apareçam no
webapp — na agenda (calendário), no popover de detalhes e nos eventos do **Meu Dia** (hoje o
local não chega lá). Clicar no local abre o endereço no **Google Maps** em nova aba.

**Why this priority**: informação que já existe no evento e se perde na exibição; valor
imediato para o dia a dia ("onde é a consulta?").

**Independent Test**: criar um evento no Google Calendar com endereço, conferir o local
visível no calendário, no popover e no bloco do Meu Dia; clicar e conferir o Google Maps
aberto em nova aba com o endereço buscado.

**Acceptance Scenarios**:

1. **Given** um evento com local, **When** ele aparece no Meu Dia, **Then** o local é
   exibido no bloco do evento.
2. **Given** um evento com local, **When** abro seu detalhe/popover (agenda ou Meu Dia),
   **Then** vejo o local como link que abre o Google Maps em nova aba.
3. **Given** um evento sem local, **When** ele é exibido, **Then** nenhum espaço vazio ou
   link quebrado aparece.
4. **Given** um local não-endereço (ex.: "Google Meet" ou um link de vídeo), **When**
   exibido, **Then** o texto aparece; se for uma URL, abre a própria URL em vez do Maps.

---

### Edge Cases

- **Arquivar lista com tarefas recorrentes**: as recorrências ficam suspensas junto com a
  lista (nenhuma ocorrência nova aparece nas views); restaurar reativa o comportamento
  normal.
- **Arquivar lista cujas tarefas estão no Meu Dia de hoje**: somem do Meu Dia; se a lista
  for restaurada no mesmo dia, voltam.
- **Grupo com todas as listas arquivadas**: o grupo pode ficar vazio na sidebar; segue o
  comportamento atual de grupo vazio.
- **Vínculos de metas/pessoas com tarefas de lista arquivada**: os vínculos permanecem; o
  item aparece como vindo de lista arquivada quando exibido por essas telas.
- **Referências do Telegram**: pedir por nome uma lista arquivada informa que está arquivada
  (e oferece restaurar), em vez de "não encontrada".
- **Local com caracteres especiais** (acentos, vírgulas, "&"): o link do Maps preserva o
  endereço corretamente (URL encoding).
- **Espelho no Google Calendar**: arquivar/restaurar lista não cria nem apaga eventos
  espelhados de forma inconsistente — tarefas de listas arquivadas não são espelhadas.

## Requirements *(mandatory)*

### Functional Requirements

**Parte A — Arquivar listas**

- **FR-001**: O usuário MUST poder **arquivar** qualquer lista exceto o Inbox, sem mover nem
  apagar suas tarefas.
- **FR-002**: Listas arquivadas (e suas tarefas) MUST sair da navegação, dos contadores e de
  todas as views operacionais: Hoje/Amanhã/Próximos dias, Meu Dia, matriz, calendário de
  tarefas e smart lists.
- **FR-003**: A **busca global** MUST continuar encontrando tarefas de listas arquivadas,
  sinalizando a origem arquivada.
- **FR-004**: MUST existir uma área de **arquivadas** listando cada lista com data de
  arquivamento e contagem de tarefas, com acesso ao conteúdo.
- **FR-005**: O usuário MUST poder **restaurar** uma lista arquivada, que volta íntegra
  (tarefas, grupo, configurações); a exclusão definitiva existente MUST continuar possível.
- **FR-006**: Recorrências de listas arquivadas MUST ficar suspensas até a restauração.
- **FR-007**: A exclusão de listas existente MUST permanecer inalterada — arquivar é um
  fluxo novo, não uma mudança do excluir.
- **FR-008**: Pelo Telegram, referir-se a uma lista arquivada MUST informar o estado e
  oferecer a restauração.

**Parte B — Localização nos eventos**

- **FR-009**: O local dos eventos do Google Calendar MUST ser exibido em todos os lugares
  onde o evento aparece no webapp: agenda/calendário, popover de detalhes e Meu Dia.
- **FR-010**: O local MUST ser clicável, abrindo o endereço no Google Maps em **nova aba**,
  com o endereço corretamente codificado; se o local for uma URL, MUST abrir a própria URL.
- **FR-011**: Eventos sem local MUST ser exibidos sem resíduo visual (nenhum rótulo ou link
  vazio).
- **FR-012**: A exibição do local MUST ser somente leitura — editar o local do evento
  continua fora do escopo (fluxos de edição existentes não mudam).

### Key Entities *(include if feature involves data)*

- **Estado de arquivamento da lista**: marca de quando a lista foi arquivada; `null` =
  ativa. Reversível; independente da exclusão.
- **Local do evento**: atributo textual do evento do Google Calendar (endereço ou URL);
  apenas transportado e exibido — nunca editado pelo sistema.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Arquivar e restaurar uma lista preserva 100% das suas tarefas e configurações
  (contagens idênticas antes/depois do ciclo completo).
- **SC-002**: Com uma lista arquivada contendo tarefas datadas, **nenhuma** view operacional
  (Hoje, Meu Dia, matriz, smart lists, calendário) exibe essas tarefas — verificado view a
  view.
- **SC-003**: A busca global encontra tarefas de listas arquivadas em 100% dos casos
  testados, sempre com a sinalização de origem.
- **SC-004**: Todo evento com endereço exibe o local nos três lugares (agenda, popover, Meu
  Dia) e o link abre o Maps com o endereço exato, incluindo endereços com acentos e
  vírgulas.
- **SC-005**: Arquivar uma lista leva no máximo **2 cliques** a partir da sidebar.

## Assumptions

- **Duas melhorias independentes numa spec** por tamanho (P) — podem ser implementadas e
  testadas em qualquer ordem interna.
- **Base existente (parte A)**: a marca de arquivamento já existe no modelo de listas, mas
  hoje só é usada internamente pelo fluxo de exclusão; o risco principal é **transversal** —
  garantir que todas as consultas operacionais excluam listas arquivadas (a sidebar e o
  board de grupo já excluem; as demais serão auditadas no planejamento).
- **Base existente (parte B)**: o local já trafega do Google Calendar até a agenda
  (calendário e popover já têm exibição parcial); o gap conhecido é o Meu Dia, que não
  recebe o campo, e a ausência do link para o Maps.
- **Link do Maps**: padrão de busca universal do Google Maps
  (`https://www.google.com/maps/search/?api=1&query=<endereço>`), sem chave de API.
- **Sem novas capacidades de escrita**: nada nesta spec cria/edita eventos no Google
  Calendar nem altera o fluxo de exclusão de listas.
- **Usuário único**, como nos demais domínios.
