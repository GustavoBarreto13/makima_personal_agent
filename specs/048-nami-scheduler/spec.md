# Feature Specification: Jobs financeiros agendados — orçamento, cobranças e relatório mensal

**Feature Branch**: `048-nami-scheduler`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "Primeiros jobs financeiros do scheduler (hoje não existe nenhum): alerta diário de orçamento estourado/perto do limite, cobrança recorrente automática (assinaturas lançam despesa e rolam next_billing; contas fixas avisam e aguardam confirmação — flag auto_lancar por item), e relatório mensal fechado via Telegram. Decisão aprovada: assinaturas 100% automáticas (avisa D-3 + lança no dia + rola a data)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Assinaturas se lançam sozinhas (Priority: P1)

Minhas assinaturas viram despesa automaticamente: 3 dias antes recebo o aviso no Telegram
("Netflix cobra R$ 55,90 na sexta"); no dia, a despesa é lançada na conta/cartão vinculado
e a próxima cobrança rola para o ciclo seguinte — sem eu fazer nada.

**Why this priority**: Elimina o trabalho manual recorrente mais repetitivo do domínio;
hoje nada rola `next_billing`, então as datas ficam obsoletas após a primeira cobrança.

**Independent Test**: Assinatura com cobrança hoje → rodar o job → despesa criada vinculada
à assinatura, data rolada; rodar de novo → nada duplica.

**Acceptance Scenarios**:

1. **Given** assinatura ativa com cobrança em 3 dias, **When** o job diário roda, **Then** o usuário recebe o aviso no Telegram com nome, valor e data.
2. **Given** assinatura ativa com cobrança hoje e lançamento automático ligado, **When** o job roda, **Then** a despesa é criada (vinculada à assinatura, no pagador cadastrado) e a próxima cobrança rola +1 ciclo (mensal/anual).
3. **Given** o job já executado hoje, **When** roda de novo no mesmo dia, **Then** nenhuma despesa duplica e a data não rola duas vezes (idempotência).
4. **Given** assinatura pausada ou cancelada, **When** o job roda, **Then** nada é lançado nem avisado para ela.

---

### User Story 2 - Contas fixas avisam e aguardam confirmação (Priority: P1)

Para contas de valor variável (luz, água), o job avisa 3 dias antes e no dia do vencimento
("conta de luz vence hoje — confirme o valor"), mas NÃO lança sozinho: a conta fica
pendente até eu confirmar o valor real (pela UI ou Telegram). Contas fixas que eu marquei
como automáticas (ex.: aluguel) lançam como assinaturas.

**Why this priority**: Automação errada em valor variável é pior que nenhuma — o desenho
respeita a natureza de cada conta (decisão da spec 044).

**Independent Test**: Conta fixa com vencimento hoje e lançamento automático desligado →
job roda → aviso enviado, nenhuma despesa criada, status pendente na UI.

**Acceptance Scenarios**:

1. **Given** conta fixa (lançamento automático desligado) vencendo hoje, **When** o job roda, **Then** o Telegram recebe "confirme o valor" e nenhuma despesa é criada.
2. **Given** conta fixa marcada como automática (valor fixo), **When** o job roda no vencimento, **Then** comporta-se como assinatura (lança e rola).
3. **Given** conta fixa não confirmada após o vencimento, **When** o usuário abre a seção Contas Fixas, **Then** vê o status "atrasada".

---

### User Story 3 - Alerta de orçamento antes de estourar (Priority: P2)

Todo dia de manhã, se alguma categoria passou de 90% do orçamento (ou estourou), recebo um
alerta no Telegram no tom da Nami. Se está tudo dentro do limite, nenhum ruído.

**Why this priority**: Orçamento só funciona com feedback no momento certo — descobrir o
estouro no fim do mês não muda comportamento.

**Independent Test**: Categoria a 95% do limite → job roda → alerta recebido; todas abaixo
de 90% → job roda em silêncio.

**Acceptance Scenarios**:

1. **Given** categoria com 95% do orçamento consumido, **When** o job das 09:00 roda, **Then** o Telegram recebe alerta com categoria, gasto, limite e %.
2. **Given** categoria estourada (>100%), **When** o job roda, **Then** o alerta distingue "estourou" de "quase lá".
3. **Given** todas as categorias abaixo de 90%, **When** o job roda, **Then** nenhuma mensagem é enviada.

---

### User Story 4 - Relatório mensal no dia 1º (Priority: P2)

No dia 1º de manhã recebo no Telegram o fechamento do mês anterior: total por categoria,
comparação com o mês anterior, tendência e o score de saúde financeira — formatado no
estilo da Nami.

**Why this priority**: Ritual de fechamento sem esforço; consolida os dados que já existem
em análises prontas.

**Independent Test**: Executar o job manualmente e conferir a mensagem com os números do
mês fechado (batendo com as consultas individuais).

**Acceptance Scenarios**:

1. **Given** dia 1º às 08:00, **When** o job roda, **Then** o Telegram recebe o resumo do mês fechado (categorias, comparação, tendência, score) em HTML no tom da Nami.
2. **Given** o job executado manualmente em outro dia, **When** roda, **Then** reporta o último mês fechado (não o corrente).

### Edge Cases

- Falha no envio do Telegram: a execução registra falha no histórico do scheduler e dispara o alerta padrão de falha de job — sem engolir o erro.
- Assinatura anual: aviso D-3 e rolagem de +1 ano.
- Assinatura sem pagador vinculado (anterior à spec 040): lança com o nome de exibição legado da conta; se impossível, avisa o usuário para completar o cadastro em vez de falhar silenciosamente.
- Cobrança em 29/30/31 rolando para mês curto: a data rolada cai no último dia do mês de destino.
- Vários eventos no mesmo dia (2 assinaturas + 1 conta fixa + orçamento estourado): mensagens agrupadas de forma legível, não spam de N mensagens isoladas.
- Job perdido (container fora do ar no horário): na próxima execução, cobranças vencidas não processadas são recuperadas (lança/avisa com a data devida), sem duplicar.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST ter um job diário de cobranças recorrentes que: avisa no Telegram com 3 dias de antecedência; no vencimento, lança a despesa e rola a próxima cobrança para itens com lançamento automático ligado; apenas avisa e mantém pendente os itens com lançamento automático desligado.
- **FR-002**: O processamento de cobranças MUST ser idempotente por item e por ciclo — reexecuções no mesmo dia (ou recuperação após indisponibilidade) nunca duplicam despesa nem rolam a data duas vezes.
- **FR-003**: O lançamento automático MUST criar a despesa vinculada à recorrência, no pagador cadastrado, com a data devida da cobrança (fuso do Brasil).
- **FR-004**: O sistema MUST ter um job diário de orçamento que alerta no Telegram categorias ≥90% ou estouradas, distinguindo os dois estados, e fica em silêncio quando tudo está dentro do limite.
- **FR-005**: O sistema MUST ter um job mensal (dia 1º) com o fechamento do mês anterior: gastos por categoria, comparação com o mês anterior, tendência e score de saúde — formatado no padrão de mensagens da Nami.
- **FR-006**: Todos os jobs MUST seguir o padrão do agendador do projeto: execução registrada no histórico com duração/status, falha gera alerta automático, e execução manual avulsa é possível para teste.
- **FR-007**: Mensagens do mesmo job no mesmo dia MUST ser agrupadas numa única notificação legível.

### Key Entities

- **Execução de job**: registro histórico existente do agendador (job, horário, duração, status) — reutilizado.
- **Ciclo de cobrança**: instância de uma recorrência num vencimento específico; a chave de idempotência do processamento (recorrência + data devida).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero lançamentos manuais necessários para assinaturas após a entrega (100% automáticas).
- **SC-002**: Zero despesas duplicadas em reexecuções e recuperações (testado com execução dupla no mesmo dia).
- **SC-003**: Alertas de orçamento chegam até as 09:15 nos dias com categoria ≥90%; zero mensagens nos dias sem.
- **SC-004**: O relatório do dia 1º bate com as consultas individuais (resumo, tendência, score) para o mesmo mês.

## Assumptions

- Depende da spec 044 (campos kind/auto_lancar e a semântica de conta fixa) e da spec 040 (pagador vinculado em recorrências).
- O canal de notificação é o Telegram do usuário via mecanismo de alerta já existente no agendador.
- Horários: cobranças 08:30, orçamento 09:00, relatório dia 1º 08:00 (America/Sao_Paulo) — ajustáveis sem mudança de escopo.
- O deploy dos jobs exige rebuild do container do agendador (procedimento padrão do projeto).
