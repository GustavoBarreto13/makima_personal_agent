# Feature Specification: Nami cross-agent — pessoas, calendário, Hub e lembretes

**Feature Branch**: `047-nami-cross-agent`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "Ligar a infraestrutura cross-agent já pronta: seletor de pessoas (Komi) ao criar transação no webapp (backend já aceita person_ids), eventos financeiros da Nami no calendário da Kaguya no webapp (calendar_provider pronto, hub só agrega no Telegram), health score no card da Nami no Hub (Makima), e botão de lembrete na Kaguya a partir dos próximos vencimentos (create_expense_reminder existe)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Vincular pessoas a transações pelo webapp (Priority: P1)

Ao registrar um gasto ("jantar com a Ana"), seleciono a(s) pessoa(s) envolvida(s) no
próprio formulário. Depois, no perfil da Ana (Pessoas), vejo os gastos vinculados — e na
lista de transações, as pessoas aparecem como chips.

**Why this priority**: O backend já grava o vínculo (infra da spec 014); só falta a porta
de entrada visual — é a integração de maior valor imediato.

**Independent Test**: Criar transação com pessoa vinculada e vê-la no perfil da pessoa no
diretório da Komi.

**Acceptance Scenarios**:

1. **Given** o formulário de novo lançamento, **When** o usuário busca "An" no seletor de pessoas, **Then** vê as correspondências do diretório e seleciona uma ou mais.
2. **Given** transação criada com pessoa vinculada, **When** o usuário abre o perfil da pessoa, **Then** a transação aparece na seção de vínculos financeiros.
3. **Given** transações com pessoas na lista, **When** o usuário visualiza a lista, **Then** vê chips com os nomes.
4. **Given** busca sem correspondência, **When** o usuário não encontra a pessoa, **Then** pode seguir sem vínculo (nunca bloqueia o lançamento).

---

### User Story 2 - Vencimentos e gastos no calendário unificado (Priority: P2)

No calendário do webapp (Kaguya), vejo também os eventos financeiros — despesas do período
e vencimentos — com identidade visual própria (💰), somente leitura, com atalho para o item
na Nami.

**Why this priority**: O agregador multi-fonte já funciona no Telegram; o calendário web
mostra só tarefas — a visão unificada do dia fica incompleta.

**Independent Test**: Com despesas na semana, abrir o calendário web e ver os eventos
financeiros nos dias corretos.

**Acceptance Scenarios**:

1. **Given** despesas registradas na semana, **When** o usuário abre o calendário do webapp, **Then** vê os eventos financeiros nos dias correspondentes, visualmente distintos das tarefas.
2. **Given** um evento financeiro no calendário, **When** o usuário clica, **Then** navega para o item na seção da Nami (somente leitura no calendário — sem arrastar/editar).
3. **Given** a fonte financeira indisponível, **When** o calendário carrega, **Then** as tarefas aparecem normalmente (falha da fonte extra é silenciosa e isolada).

---

### User Story 3 - Saúde financeira na home (Hub) (Priority: P3)

Na home do sistema (Hub da Makima), o card da Nami mostra o score de saúde financeira 0–100
— minha situação financeira visível assim que abro o painel.

**Why this priority**: Visibilidade passiva de alto valor e esforço mínimo; depende do
padrão de stats do Hub já existente.

**Independent Test**: Abrir a home e comparar o score do card com o da tela da Nami.

**Acceptance Scenarios**:

1. **Given** o Hub carregado, **When** o usuário vê o card da Nami, **Then** o score 0–100 aparece como stat.
2. **Given** o cálculo indisponível, **When** o Hub carrega, **Then** o card mostra "—" sem erro (padrão de isolamento do Hub).

---

### User Story 4 - "Lembrar-me" cria lembrete na Kaguya (Priority: P3)

Nos próximos vencimentos (Dashboard/Parcelamentos), clico em "Lembrar-me" e um lembrete de
pagamento é criado na lista de Finanças da Kaguya com a data e o valor — sem sair da tela.

**Why this priority**: Une o aviso (Nami) à ação (Kaguya); o mecanismo de criação já existe
no lado da Kaguya.

**Independent Test**: Clicar em "Lembrar-me" num vencimento e encontrar a tarefa criada na
Kaguya com data e valor nas notas.

**Acceptance Scenarios**:

1. **Given** um vencimento próximo exibido, **When** o usuário clica em "Lembrar-me", **Then** uma tarefa de lembrete é criada na lista de Finanças da Kaguya com prioridade alta, data do vencimento e valor de referência.
2. **Given** o lembrete criado, **When** o usuário clica de novo no mesmo vencimento, **Then** o sistema evita duplicar (aviso ou desabilitado).

### Edge Cases

- Pessoa com 2+ correspondências no seletor: exigir escolha explícita (regra de smart-match do projeto — nunca vincular sem confirmação).
- Transações antigas sem pessoas: exibem normalmente, sem chips.
- Calendário: volume alto de despesas num dia — agrupar/limitar visualmente para não abafar as tarefas.
- Fuso: eventos financeiros no calendário caem no dia local correto (UTC-3), consistente com a spec 040.
- Lembrete para vencimento sem data exata (só dia do mês): usar a próxima ocorrência do dia.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O formulário de lançamento do webapp MUST permitir buscar e vincular uma ou mais pessoas do diretório, com busca por prefixo, escolha explícita em caso de ambiguidade e vínculo opcional (nunca bloqueante).
- **FR-002**: As transações com pessoas vinculadas MUST exibi-las como chips na listagem; o perfil da pessoa MUST listar os vínculos financeiros (comportamento já existente do diretório é mantido).
- **FR-003**: O calendário do webapp MUST agregar os eventos financeiros da fonte já existente (despesas e vencimentos) como itens somente leitura, visualmente distintos, com navegação para o item de origem; falha da fonte MUST ser isolada e silenciosa.
- **FR-004**: O card da Nami no Hub MUST exibir o score de saúde financeira, seguindo o padrão de isolamento de falha do Hub (indisponível vira "—").
- **FR-005**: Os próximos vencimentos MUST oferecer a ação "Lembrar-me" que cria lembrete de pagamento na lista de Finanças da Kaguya (data do vencimento, valor de referência, prioridade alta), com proteção contra duplicação.

### Key Entities

- **Vínculo pessoa-transação**: relação N:N entre pessoas do diretório e transações (infra existente da spec 014).
- **Evento financeiro de calendário**: representação somente leitura de despesa/vencimento no calendário unificado, com referência ao item de origem.
- **Lembrete de pagamento**: tarefa criada na Kaguya a partir de um vencimento da Nami (mecanismo existente `create_expense_reminder`).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Vincular uma pessoa ao criar transação adiciona menos de 10 segundos ao fluxo.
- **SC-002**: 100% dos eventos financeiros aparecem no dia local correto no calendário.
- **SC-003**: Score do Hub idêntico ao da Nami no mesmo instante.
- **SC-004**: "Lembrar-me" cria exatamente 1 tarefa por vencimento (zero duplicatas nos testes).

## Assumptions

- A infraestrutura de vínculo (spec 014), o provedor de calendário da Nami (spec 019) e o mecanismo de lembrete da Kaguya (FR-014) já existem e são reutilizados sem mudança de contrato.
- O seletor de pessoas reutiliza o componente/padrão já usado nas cartas da Violet e no diretório da Komi.
- Escrita bidirecional no calendário (arrastar despesa) está fora do escopo — eventos financeiros são somente leitura.
- Independente das demais specs da reforma; ideal após a 041 (para lembretes de parcelas).
