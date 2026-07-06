# Feature Specification: Lucy — agente de Gmail (email)

**Feature Branch**: `032-lucy-gmail` (diretório da spec; nenhuma branch git criada — regra "não criar branch automaticamente")

**Created**: 2026-07-05

**Status**: Draft

**Input**: User description: Trazer a Lucy (domínio email/Gmail) para dentro do Makima como agente nativo, aposentando o script externo do n8n (`n8n-python-scripts/lucy_email_agent`). Preservar exatamente a classificação e o digest que já funcionavam, adicionando persistência do histórico em PostgreSQL. Duas metades: agente interativo somente-leitura + script agendado de digest diário.

## Clarifications

### Session 2026-07-05

- Q: Numa reexecução do digest para o mesmo dia, o registro de um email já gravado deve ser atualizado com a nova classificação ou mantido como na primeira vez? → A: Atualizar (upsert com sobrescrita — ON CONFLICT DO UPDATE); o identificador único do email garante zero linhas duplicadas, e o histórico reflete sempre o último digest enviado.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Digest matinal automático de emails (Priority: P1)

Todo dia às 8h da manhã (horário de São Paulo), o usuário recebe no Telegram, sem fazer nada,
um resumo dos emails que chegaram no dia anterior: uma visão geral do estado da caixa, um briefing
das newsletters/conhecimento, os itens que exigem ação imediata, e os demais emails agrupados por
categoria com prioridade sinalizada. Ao mesmo tempo, a caixa de entrada é organizada — cada email
recebe a label da sua categoria e os "Junk" saem da caixa de entrada (arquivados). Emails "Junk"
nunca aparecem no resumo, mas são etiquetados/arquivados mesmo assim.

**Why this priority**: É o valor central e o comportamento que já existia e precisa ser preservado.
Substitui a dependência do n8n. Sozinho, já entrega o benefício principal (triagem matinal sem
abrir o Gmail).

**Independent Test**: Rodar o job de digest manualmente para um dia com emails conhecidos e verificar
que (a) chegou uma mensagem no Telegram no formato esperado, (b) as labels foram aplicadas e os Junk
saíram da inbox no Gmail. Não depende do agente interativo nem da persistência.

**Acceptance Scenarios**:

1. **Given** existem emails recebidos ontem na conta, **When** o digest roda às 8h, **Then** o usuário
   recebe uma única mensagem no Telegram com visão geral + briefing + ação imediata + grupos por
   categoria (Junk oculto) e rodapé com tokens/custo/hora.
2. **Given** um email foi classificado como "Finance", **When** o digest termina, **Then** esse email
   tem a label "Finance" aplicada no Gmail e continua na inbox.
3. **Given** um email foi classificado como "Junk", **When** o digest termina, **Then** esse email
   NÃO aparece no resumo do Telegram, recebe a label "Junk" e é removido da caixa de entrada.
4. **Given** o dia anterior não teve nenhum email, **When** o digest roda, **Then** o usuário recebe
   uma mensagem indicando caixa limpa/nada relevante (sem erro).

---

### User Story 2 - Consultar emails sob demanda pela Makima (Priority: P2)

O usuário, conversando com a Makima no Telegram, pede à Lucy para ver seus emails não lidos/recentes,
buscar um email por remetente/assunto/palavra, ou abrir o conteúdo de um email específico. A Lucy
responde ao vivo (dados atuais da caixa), em português, com a persona dela, e nunca altera nada.

**Why this priority**: Complementa o digest com consulta interativa quando o usuário quer olhar a
caixa fora do horário do resumo. Independente do digest.

**Independent Test**: Enviar à Makima "Lucy, meus emails não lidos" e "busca email do Nubank" e
verificar que ela lista resultados atuais da conta, formatados, começando por "Lucy:", sem tocar
na caixa.

**Acceptance Scenarios**:

1. **Given** há emails não lidos na conta, **When** o usuário pede os não lidos, **Then** a Lucy
   lista os emails recentes/não lidos (remetente, assunto, data) ao vivo.
2. **Given** existe um email de um remetente específico, **When** o usuário busca por esse remetente,
   **Then** a Lucy retorna os emails correspondentes.
3. **Given** o usuário identificou um email na lista, **When** pede para abrir/ler esse email,
   **Then** a Lucy mostra o conteúdo dele.
4. **Given** qualquer pedido do usuário, **When** o pedido implicaria enviar, arquivar, deletar ou
   marcar um email, **Then** a Lucy recusa/informa que só faz leitura (nenhuma alteração na caixa).

---

### User Story 3 - Histórico de emails classificados consultável (Priority: P3)

Cada email processado pelo digest fica guardado com sua classificação (categoria, prioridade, resumo,
ação, data). Rodar o digest mais de uma vez para o mesmo dia não gera registros duplicados. Esse
histórico é a base para consultas futuras e uma eventual tela no webapp (não incluída aqui).

**Why this priority**: É a única novidade em relação ao comportamento antigo (que era stateless).
Habilita evolução futura, mas não é pré-requisito para o valor imediato do digest.

**Independent Test**: Rodar o digest duas vezes para o mesmo dia e verificar no armazenamento que cada
email aparece exatamente uma vez, com categoria/prioridade/resumo/ação preenchidos.

**Acceptance Scenarios**:

1. **Given** o digest processou N emails, **When** ele termina, **Then** existem N registros de
   histórico, cada um com categoria, prioridade, resumo, ação e data local.
2. **Given** o digest já rodou hoje, **When** ele roda de novo para o mesmo dia, **Then** o número de
   registros não aumenta (idempotência por identificador do email).

---

### Edge Cases

- **Mais de 50 emails no dia anterior**: o digest processa no máximo 50 (os mais recentes); os
  excedentes são ignorados nesta execução (comportamento herdado do base).
- **Falha na classificação (serviço de IA indisponível/timeout)**: há novas tentativas com espera
  crescente; persistindo a falha, o job termina em erro, é registrado e o usuário é alertado.
- **Falha de conexão com o Gmail**: o job termina em erro, registrado e alertado; nada parcial é
  enviado como se fosse sucesso.
- **Uma das 10 labels não existe na conta**: a falha ao etiquetar um email não pode derrubar o job
  inteiro — os demais continuam sendo processados; o problema é reportado.
- **Email sem corpo em texto puro**: usar o conteúdo HTML com tags removidas para o resumo.
- **Consulta interativa em caixa muito grande**: os resultados são limitados a um número razoável
  (padrão 10) para não estourar a mensagem.

## Requirements *(mandatory)*

### Functional Requirements

**Agente interativo (somente leitura) — US2**

- **FR-001**: A Lucy MUST listar emails recentes/não lidos da conta quando solicitado, com remetente,
  assunto e data, usando dados atuais da caixa.
- **FR-002**: A Lucy MUST buscar emails por remetente, assunto ou palavra-chave e retornar os
  correspondentes.
- **FR-003**: A Lucy MUST exibir o conteúdo de um email específico quando o usuário pedir para abri-lo.
- **FR-004**: A Lucy MUST responder em português, com a persona dela, iniciando cada resposta com
  "Lucy:" e usando formatação compatível com o Telegram.
- **FR-005**: A Lucy MUST NOT executar nenhuma ação que altere a caixa (enviar, responder, arquivar,
  deletar, marcar como lido) — o agente interativo é estritamente de leitura.

**Digest agendado — US1**

- **FR-006**: O sistema MUST, uma vez por dia às 08:00 (America/Sao_Paulo), buscar os emails recebidos
  no dia anterior (limitado a 50, os mais recentes).
- **FR-007**: O sistema MUST classificar cada email em exatamente UMA de 10 categorias fixas
  (Art / Hobbies, Finance, Knowledge, Shopping, Personal, Health, Security, Work, Junk, Other),
  atribuindo também prioridade (high/medium/low), um resumo de uma linha e uma ação sugerida
  (arquivar/responder/ler/agir/ignorar), seguindo as MESMAS diretrizes de categorização do script base.
- **FR-008**: O sistema MUST aplicar no Gmail a label correspondente à categoria de cada email.
- **FR-009**: O sistema MUST remover da caixa de entrada (arquivar) todos os emails classificados como
  "Junk".
- **FR-010**: O sistema MUST enviar ao usuário, via Telegram, um digest no formato estabelecido:
  visão geral, INTEL BRIEFING (consolidado das newsletters/conhecimento), AÇÃO IMEDIATA (itens
  críticos), grupos por categoria com prioridade sinalizada por cor, categoria "Junk" oculta, e
  rodapé com contagem de tokens, custo aproximado e hora.
- **FR-011**: Quando não houver emails no dia anterior, o sistema MUST ainda enviar uma mensagem
  indicando que não há nada relevante (sem tratar como erro).

**Persistência do histórico — US3**

- **FR-012**: O sistema MUST persistir cada email classificado (identificador do email, remetente,
  assunto, categoria, prioridade, resumo, ação e data local de recebimento) de forma durável.
- **FR-013**: A persistência MUST ser idempotente por identificador do email: reexecuções para o mesmo
  período não criam registros duplicados. Numa reexecução, o registro existente MUST ser atualizado com
  a classificação mais recente (sobrescrita por conflito de identificador), mantendo o histórico
  consistente com o último digest enviado.

**Operação / confiabilidade — transversal a US1/US3**

- **FR-014**: O digest MUST ser executado pelo agendador existente do projeto, com o registro de cada
  execução (início, fim, status, duração) e alerta automático ao usuário via Telegram em caso de falha.
- **FR-015**: Uma falha ao etiquetar/arquivar um email individual MUST NOT interromper o processamento
  dos demais emails da mesma execução.

### Key Entities *(include if feature involves data)*

- **Email classificado (histórico)**: representa um email processado pelo digest e sua classificação.
  Atributos: identificador único do email (usado para idempotência), remetente (nome e endereço),
  assunto, categoria (uma das 10), prioridade, resumo, ação sugerida, data local de recebimento,
  momento da classificação.
- **Categoria**: um dos 10 rótulos fixos que definem tanto a label aplicada no Gmail quanto o
  agrupamento no digest. "Junk" tem tratamento especial (oculto no digest, arquivado na caixa).
- **Digest diário**: a mensagem enviada ao Telegram — derivada dos emails classificados do dia,
  não é persistida como entidade própria.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em dias com emails, o usuário recebe o digest no Telegram dentro de 5 minutos do horário
  agendado (08:00 local), em 100% das execuções bem-sucedidas.
- **SC-002**: Todo email do dia anterior que não seja "Junk" aparece no digest exatamente uma vez, sob
  a categoria atribuída pela classificação.
- **SC-003**: Nenhum email "Junk" aparece no digest, e 100% dos "Junk" saem da caixa de entrada
  (arquivados) ao final da execução.
- **SC-004**: Reexecutar o digest para o mesmo dia resulta em zero registros de histórico duplicados
  (mesma contagem de linhas), e cada registro reflete a classificação da execução mais recente.
- **SC-005**: O usuário consegue obter, sob demanda pela Makima, a lista de emails não lidos/recentes
  e o resultado de uma busca, recebendo resposta em até 15 segundos em condições normais.
- **SC-006**: O agente interativo realiza zero alterações na caixa de entrada (nenhum envio, arquivo,
  exclusão ou marcação) em qualquer interação.
- **SC-007**: Quando o job falha, o usuário recebe um alerta no Telegram e a execução fica registrada
  com status de erro — nenhuma falha silenciosa.
- **SC-008**: A classificação reproduz o comportamento do script base: para um conjunto de emails de
  referência, as 10 categorias, prioridades e ações usam o mesmo vocabulário e as mesmas diretrizes.

## Assumptions

- **Acesso ao Gmail via IMAP + senha de app** (`GMAIL_USERNAME` / `GMAIL_APP_PASSWORD`), sem OAuth —
  decisão do usuário; o mesmo mecanismo do script base. Envio de email não é suportado (fora de escopo).
- **Classificação por IA** reutiliza o provedor Gemini já usado no projeto (`GEMINI_API_KEY`), modelo
  padrão `gemini-2.5-flash` (o base usava `gemini-2.0-flash`; configurável por env).
- **Pré-requisito no Gmail**: as 10 labels de categoria já existem na conta (o script base assume isso).
- **Push e alertas no Telegram** reutilizam o bot e o chat já configurados
  (`TELEGRAM_BOT_TOKEN` / `TELEGRAM_ALERT_CHAT_ID`); usuário único.
- **Agendamento** reutiliza o `scheduler/` existente (padrão da fase 032) — não se cria nova infra de
  agendamento. Alinhado ao Princípio II da constitution: o digest permanece um **script batch Python**
  (não vira lógica ADK); só a camada interativa é ADK. A migração é de n8n → scheduler do próprio repo,
  não para dentro do ADK.
- **Armazenamento** é o PostgreSQL padrão do projeto (nova tabela `lucy_emails`); "data local" é
  derivada em America/Sao_Paulo (regra de fuso do projeto).
- **Padrão de agente** segue o singleton dos demais (`agents/nami`, `agents/akane`): `__init__.py`,
  `tools.py`, `agent.py`, `CLAUDE.md`, `schema_pg.sql`.
- **Escopo diário fixo** (dia anterior, cap 50) e formato do digest são herdados do base sem alteração.

### Out of Scope

- Enviar ou responder emails (nem pelo agente, nem pelo digest).
- Gerenciar a caixa pelo agente interativo (arquivar, deletar, marcar como lido, aplicar labels sob demanda).
- Autenticação via OAuth / Gmail API (mantém-se IMAP + senha de app).
- Portar o `clean_inbox.py` (limpeza em massa da caixa) — pode virar fase futura.
- Tela no webapp para o histórico `lucy_emails` — o schema fica preparado, mas a UI não entra nesta fase.
- Alterar categorias, diretrizes de classificação ou o layout do digest — a fase preserva o comportamento existente.
