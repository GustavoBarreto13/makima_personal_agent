# Feature Specification: Registro Emocional (TCC)

**Feature Branch**: `005-violet-journal-features`

**Created**: 2026-06-10

**Status**: Draft

**Input**: User description: "Seção de captura de emoção/sentimento (TCC) — área de registro
emocional"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Registrar uma emoção do dia (Priority: P1)

Na página do dia (tela Escrever), o usuário encontra uma seção de registro emocional — no mesmo
espírito do prompt de sonho. Ali ele cria um registro no formato do Registro de Pensamentos da
TCC (terapia cognitivo-comportamental): descreve a **situação** que disparou a emoção, escolhe a
**emoção** e dá uma nota de **intensidade** (0–10), anota o **pensamento automático** que veio à
cabeça e, quando conseguir reavaliar, escreve a **resposta adaptativa** (o pensamento alternativo
mais equilibrado) com uma **reavaliação da intensidade**. Apenas emoção + intensidade são
obrigatórios — os demais campos podem ser preenchidos depois, conforme o exercício avança.

**Por que esta prioridade**: É o núcleo da feature: capturar o estado emocional no contexto do
dia. Sem o registro, não há análise nem acompanhamento possível.

**Teste independente**: Abrir a página de hoje, criar um registro escolhendo "ansiedade" com
intensidade 7 e preenchendo a situação; recarregar a página e confirmar que o registro persiste
com todos os campos. Editar depois para completar pensamento automático e resposta adaptativa.

**Acceptance Scenarios**:

1. **Given** o usuário está na página de um dia, **When** a página carrega, **Then** existe uma
   seção de registro emocional visível, com convite para registrar quando o dia ainda não tem
   registros.

2. **Given** o usuário inicia um registro, **When** escolhe uma emoção da lista e define a
   intensidade (0–10), **Then** o registro pode ser salvo mesmo sem os demais campos.

3. **Given** o usuário tenta salvar sem escolher emoção, **When** confirma, **Then** o registro
   não é salvo e o campo obrigatório é indicado.

4. **Given** um registro salvo apenas com emoção + intensidade, **When** o usuário o reabre,
   **Then** pode completar situação, pensamento automático, resposta adaptativa e reavaliar a
   intensidade após a resposta.

5. **Given** um dia já tem um registro emocional, **When** o usuário cria outro, **Then** ambos
   coexistem no dia, listados em ordem de criação com horário visível.

6. **Given** um registro existente, **When** o usuário o exclui, **Then** ele some do dia e das
   agregações.

7. **Given** o usuário navega para um dia anterior, **When** a página carrega, **Then** os
   registros emocionais daquele dia são exibidos junto da entrada.

---

### User Story 2 — Usar emoções predefinidas e próprias (Priority: P2)

Ao escolher a emoção, o usuário parte de uma lista base de emoções da TCC (alegria, tristeza,
raiva, medo, ansiedade, culpa, vergonha, nojo) e pode adicionar emoções próprias (ex.:
"frustração", "saudade"), que passam a aparecer na lista para registros futuros.

**Por que esta prioridade**: A lista predefinida mantém os dados consistentes para análise; a
extensão custom evita que o usuário trave por não encontrar a palavra certa. O registro (US1)
já funciona com a lista base sozinha.

**Teste independente**: Criar um registro adicionando a emoção custom "frustração"; em um novo
registro, confirmar que "frustração" aparece na lista junto das predefinidas.

**Acceptance Scenarios**:

1. **Given** o usuário está escolhendo a emoção, **When** abre a lista, **Then** vê as 8 emoções
   base da TCC e as emoções custom já criadas, distinguíveis entre si.

2. **Given** a emoção desejada não está na lista, **When** o usuário digita um novo nome e
   confirma, **Then** a emoção custom é criada, usada no registro atual e oferecida nos próximos.

3. **Given** o usuário tenta criar uma emoção custom com nome igual a uma existente (ignorando
   maiúsculas/minúsculas), **When** confirma, **Then** a existente é reutilizada — sem duplicar.

---

### User Story 3 — Analisar as emoções nos Insights (Priority: P2)

Na tela Insights, uma nova aba "Emoções" agrega os registros do ano selecionado: frequência de
cada emoção, intensidade média, e evolução ao longo dos meses — permitindo enxergar padrões
(ex.: "ansiedade dominou março") como apoio ao acompanhamento terapêutico.

**Por que esta prioridade**: Fecha o ciclo da TCC — registrar sem rever padrões entrega só
metade do valor. Depende de existirem registros (US1), por isso não é P1.

**Teste independente**: Com registros de emoções variadas em meses diferentes, abrir
Insights → aba Emoções e conferir frequências, intensidade média e a distribuição mensal.

**Acceptance Scenarios**:

1. **Given** existem registros emocionais no ano selecionado, **When** o usuário abre a aba
   "Emoções" dos Insights, **Then** vê o total de registros, a emoção mais frequente e a
   intensidade média do ano.

2. **Given** a aba Emoções está aberta, **When** o usuário observa a lista de emoções, **Then**
   cada emoção registrada aparece com sua contagem e intensidade média, ordenada por frequência.

3. **Given** a aba Emoções está aberta, **When** o usuário observa a visão temporal, **Then**
   vê a distribuição dos registros ao longo dos meses do ano selecionado.

4. **Given** o ano selecionado não tem registros emocionais, **When** o usuário abre a aba,
   **Then** vê um estado vazio convidando a registrar — sem erro.

---

### Edge Cases

- Registro com reavaliação de intensidade sem resposta adaptativa preenchida: permitido? Não —
  a reavaliação só se habilita junto da resposta adaptativa (é a medida do efeito dela).
- Textos longos em situação/pensamento/resposta: aceitos; a exibição no dia mostra resumo
  expansível para não dominar a página.
- Exclusão de uma emoção custom em uso: não oferecida nesta versão — emoções custom criadas
  permanecem disponíveis (evita registros órfãos).
- Intensidade fora de 0–10: impossível pela interface (controle limitado ao intervalo).
- Dia sem entrada de diário, mas com vontade de registrar emoção: a página do dia é criada sob
  demanda ao abrir (comportamento atual), então o registro emocional funciona igualmente.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A página do dia MUST exibir uma seção de registro emocional, com estado vazio
  convidativo quando não há registros.
- **FR-002**: Um registro emocional MUST conter: emoção (obrigatória), intensidade 0–10
  (obrigatória), situação/gatilho (opcional), pensamento automático (opcional), resposta
  adaptativa (opcional) e reavaliação de intensidade 0–10 (opcional, habilitada apenas com a
  resposta adaptativa preenchida).
- **FR-003**: O sistema MUST permitir múltiplos registros emocionais por dia, exibidos em ordem
  de criação com horário.
- **FR-004**: O usuário MUST poder editar e excluir registros existentes; campos opcionais podem
  ser completados a qualquer momento após a criação.
- **FR-005**: A lista de emoções MUST conter as 8 emoções base da TCC (alegria, tristeza, raiva,
  medo, ansiedade, culpa, vergonha, nojo) e aceitar emoções custom criadas pelo usuário.
- **FR-006**: Emoções custom MUST ser deduplicadas por nome (sem distinção de
  maiúsculas/minúsculas) e ficam disponíveis para registros futuros.
- **FR-007**: Os registros MUST persistir no armazenamento estruturado existente do diário e
  sobreviver a recarga de página e troca de dispositivo.
- **FR-008**: A tela Insights MUST ganhar uma aba "Emoções" com: total de registros do ano,
  emoção mais frequente, intensidade média geral, contagem + intensidade média por emoção
  (ordenada por frequência) e distribuição mensal dos registros.
- **FR-009**: A aba Emoções MUST respeitar o ano de análise selecionado nos Insights
  (ver spec 005 — filtro de ano).

### Key Entities

- **Registro Emocional**: um exercício de registro de pensamentos da TCC ancorado em um dia do
  diário. Atributos: dia de referência, emoção, intensidade (0–10), situação, pensamento
  automático, resposta adaptativa, intensidade reavaliada (0–10), momento de criação.
- **Emoção**: rótulo nomeado usado nos registros. Pode ser predefinida (as 8 da base TCC) ou
  custom (criada pelo usuário); nomes únicos sem distinção de maiúsculas/minúsculas.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O usuário registra emoção + intensidade em menos de 15 segundos a partir da página
  do dia (caminho mínimo do registro).
- **SC-002**: 100% dos registros criados permanecem visíveis e íntegros após recarregar a página
  e ao navegar entre dias.
- **SC-003**: Um registro pode ser completado (situação, pensamento, resposta, reavaliação) em
  qualquer momento posterior sem perda dos dados já preenchidos.
- **SC-004**: Na aba Emoções, o usuário identifica a emoção mais frequente do ano e sua
  intensidade média em até 5 segundos após abrir a aba.

## Assumptions

- O formato segue o Registro de Pensamentos clássico da TCC (decisão do usuário): situação →
  emoção + intensidade → pensamento automático → resposta adaptativa → reavaliação. Campos além
  de emoção + intensidade são opcionais para não criar atrito no uso diário.
- A seção vive na página do dia (tela Escrever), análoga ao prompt de sonho — não é uma tela
  separada na sidebar.
- A escala de intensidade é 0–10 (convenção comum em instrumentos de TCC no Brasil; alternativa
  0–100% foi descartada por granularidade desnecessária).
- Registros emocionais não contam como bullets: não afetam contagem de palavras, heatmap nem
  estatísticas existentes do diário.
- Uso pessoal e privado (single-user, já autenticado) — sem requisitos adicionais de
  compartilhamento ou exportação clínica nesta versão.
- A aba Emoções integra-se ao filtro de ano da spec 005; se a 005 ainda não estiver
  implementada, a aba opera sobre o ano corrente como as demais.
