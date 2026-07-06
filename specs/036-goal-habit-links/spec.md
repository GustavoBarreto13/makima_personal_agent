# Feature Specification: Metas e Hábitos vinculados a outros agentes (Kaguya ↔ Frieren/Violet)

**Feature Branch**: `036-goal-habit-links`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "Linkar Hábitos e Metas com outros agents: meta 'ler 12 livros no ano' com progresso vindo da Frieren (livros vinculados concluídos), hábito 'escrever no diário' com check-in automático da Violet, hábito mensurável de leitura com páginas dos logs da Frieren. Fase 1 só Livros e Diário, mas estruturado para adicionar os demais agentes (Nami, Akane, Marin, Mai) depois sem retrabalho."

## Visão geral

As Metas (spec 030) e os Hábitos (spec 014) da Kaguya hoje só enxergam o próprio domínio:
uma meta agrega tarefas, hábitos e experimentos; um check-in de hábito é manual. Mas a vida
do usuário já está registrada nos outros agentes — a Frieren sabe quais livros ele terminou
e quantas páginas leu por dia; a Violet sabe em que dias ele escreveu no diário.

Esta spec conecta essas pontas: uma meta pode ter **movimentos externos** (ex.: livros
vinculados manualmente, cujo progresso é contado quando concluídos) e um hábito pode ter uma
**fonte automática** (ex.: escrever no diário gera o check-in do dia sozinho; páginas lidas
alimentam um hábito mensurável). A fase 1 cobre **Livros (Frieren)** e **Diário (Violet)**;
a arquitetura é um registro extensível de provedores, para que cada novo agente entre depois
sem mudança estrutural.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Meta de leitura com progresso automático (Priority: P1)

O usuário cria a meta "Ler 12 livros em 2026" (métrica-alvo: 12 livros) e, no detalhe da
meta, **vincula manualmente** os livros da sua biblioteca (Frieren) que contam para ela. O
progresso passa a ser **automático**: o valor atual é o número de livros vinculados já
concluídos ("lido"). Ao terminar um livro na Frieren, a meta reflete sozinha. Os livros
aparecem na meta como "movimentos externos", com capa, título e status.

**Why this priority**: é o caso de uso que motivou a feature — a meta de leitura viva, sem
atualização manual de número.

**Independent Test**: criar meta com alvo 12, vincular 3 livros (1 já lido, 2 em andamento) e
conferir progresso 1/12; marcar mais um como lido na Frieren e conferir 2/12 sem tocar na
meta; desvincular um livro e conferir o recálculo.

**Acceptance Scenarios**:

1. **Given** uma meta com métrica em modo automático, **When** vinculo livros pela busca da
   biblioteca, **Then** eles aparecem como movimentos externos com capa, título e status.
2. **Given** livros vinculados, **When** um deles muda para "lido" na Frieren, **Then** o
   valor atual da métrica reflete a mudança na próxima consulta, sem ação do usuário.
3. **Given** uma métrica em modo automático, **When** tento editar o valor atual à mão,
   **Then** a edição é bloqueada com aviso explicando a fonte do número.
4. **Given** um livro vinculado, **When** o desvinculo, **Then** ele sai dos movimentos e do
   cálculo — mas permanece intacto na biblioteca.
5. **Given** uma meta com movimentos internos (tarefas/hábitos/experimentos) e externos,
   **When** consulto o detalhe, **Then** vejo ambos agrupados por tipo.

---

### User Story 2 - Hábito com check-in automático do diário (Priority: P1)

O usuário tem o hábito "Escrever no diário". Em vez de marcar manualmente, ele configura o
hábito com a **fonte automática** "diário (Violet)": todo dia em que existe registro no
diário conta como check-in feito. O heatmap, a sequência e a "força" do hábito passam a
refletir a escrita real. Check-ins automáticos aparecem distinguíveis dos manuais.

**Why this priority**: junto com US1, é o pedido central — elimina a burocracia de registrar
o que outro agente já sabe.

**Independent Test**: criar o hábito com fonte "diário", escrever um bullet na Violet hoje e
conferir o check-in de hoje marcado como automático; apagar o conteúdo do dia na Violet e
conferir que o check-in some.

**Acceptance Scenarios**:

1. **Given** um hábito com fonte "diário", **When** escrevo no diário num dia, **Then** o
   check-in daquele dia aparece automaticamente, marcado como derivado.
2. **Given** check-ins automáticos, **When** consulto heatmap, sequência e força do hábito,
   **Then** eles consideram os automáticos igual aos manuais.
3. **Given** um dia com check-in automático, **When** o conteúdo daquele dia é removido do
   diário, **Then** o check-in deixa de existir (a fonte é a verdade — nada fica órfão).
4. **Given** um hábito com fonte automática, **When** tento marcar manualmente um dia que a
   fonte já cobre, **Then** o sistema evita duplicidade (o dia conta uma vez).

---

### User Story 3 - Hábito mensurável alimentado pela leitura (Priority: P2)

O usuário tem o hábito mensurável "Ler X páginas por dia". Com a fonte "leitura (Frieren)",
o valor do dia vem da **soma das páginas registradas** nos logs de leitura da Frieren. O
check-in do dia é criado com esse valor; a comparação com a meta diária do hábito segue a
regra normal de hábitos mensuráveis.

**Why this priority**: estende o mecanismo da US2 para hábitos com valor numérico; útil, mas
o caso binário entrega o grosso do valor primeiro.

**Independent Test**: criar hábito mensurável (alvo 20 páginas/dia) com fonte "leitura";
registrar 15 + 10 páginas em dois logs no mesmo dia na Frieren e conferir check-in de 25
páginas naquele dia.

**Acceptance Scenarios**:

1. **Given** um hábito mensurável com fonte "leitura", **When** registro páginas lidas na
   Frieren, **Then** o valor do dia soma todos os logs daquele dia.
2. **Given** um dia sem log de leitura, **When** consulto o hábito, **Then** não há check-in
   automático naquele dia.

---

### User Story 4 - Extensível para os próximos agentes (Priority: P3)

Quando o usuário quiser uma meta ligada a filmes (Akane), animes (Marin), séries (Mai) ou
finanças (Nami), adicionar o novo tipo de vínculo **não** exige mudança estrutural: cada
agente novo entra publicando seu próprio provedor (busca de itens + resolução de status +
datas de atividade), e as telas de vínculo passam a oferecer o novo tipo automaticamente.

**Why this priority**: é garantia de arquitetura, não feature visível — validada entregando
os dois provedores da fase 1 pelo mesmo mecanismo genérico.

**Independent Test**: conferir que livros e diário funcionam por um mecanismo único e
genérico (nenhum código das Metas/Hábitos cita "livro" ou "diário" nominalmente), e que o
picker de vínculo lista os tipos disponíveis dinamicamente.

**Acceptance Scenarios**:

1. **Given** os dois provedores da fase 1, **When** examino o fluxo de vínculo, **Then** o
   mesmo mecanismo genérico serve ambos (tipo + identificador + provedor).
2. **Given** um tipo de entidade sem provedor registrado, **When** vínculos dele são
   consultados, **Then** o sistema degrada com aviso — sem erro fatal.

---

### Edge Cases

- **Agente fora do ar / provedor falha**: a consulta da meta ou do hábito **não quebra** — os
  movimentos externos daquele tipo aparecem como indisponíveis e o restante da tela funciona
  (resolução best-effort).
- **Livro excluído da biblioteca**: o vínculo aponta para algo que não existe mais — some da
  lista de movimentos sem erro e sai do cálculo do progresso.
- **Livro relido / status regride**: se um livro vinculado volta de "lido" para "lendo", o
  progresso recalcula para baixo — o número é sempre derivado do estado atual, nunca
  congelado.
- **Alternar métrica entre manual e automático**: permitido; ao voltar para manual, o último
  valor calculado vira o valor manual inicial (editável de novo).
- **Mesmo livro em duas metas**: permitido — vínculo externo não é exclusivo (diferente dos
  movimentos internos da spec 030, que mantêm sua regra própria).
- **Fuso horário**: "o dia" de um check-in automático é o dia local (UTC-3) do registro na
  fonte — escrever no diário às 23h conta no dia certo.
- **Fonte adicionada a hábito com histórico manual**: os check-ins manuais antigos são
  preservados; dias cobertos por ambos contam uma vez.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O usuário MUST poder **vincular e desvincular** manualmente entidades de outros
  agentes a uma meta (fase 1: livros da Frieren), buscando pelo nome.
- **FR-002**: Movimentos externos MUST aparecer no detalhe da meta com identificação visual
  do item (ex.: capa/título/status do livro), agrupados por tipo, ao lado dos movimentos
  internos existentes.
- **FR-003**: Uma meta MUST poder ter a métrica em modo **manual** (comportamento atual) ou
  **automático**; em automático, o valor atual MUST ser derivado dos vínculos (ex.: livros
  vinculados com status concluído) e a edição manual MUST ser bloqueada com aviso.
- **FR-004**: O progresso automático MUST ser **calculado na consulta** (nunca copiado e
  persistido), refletindo sempre o estado atual da fonte — inclusive regressões.
- **FR-005**: Um hábito MUST poder ter uma **fonte automática** de check-ins (fase 1: diário
  da Violet para hábitos binários; leitura da Frieren para mensuráveis, somando as páginas do
  dia).
- **FR-006**: Check-ins automáticos MUST ser distinguíveis dos manuais na interface e MUST
  alimentar heatmap, sequência e força do hábito como os manuais.
- **FR-007**: Check-ins automáticos MUST existir apenas enquanto a fonte os sustentar
  (removido o registro na fonte, some o check-in) e um mesmo dia MUST contar uma única vez
  mesmo com fonte + marcação manual.
- **FR-008**: A resolução de vínculos e fontes MUST ser **best-effort**: falha de um agente
  degrada a exibição daquele tipo com aviso, sem derrubar a consulta da meta/hábito.
- **FR-009**: Vínculos para entidades inexistentes MUST ser ignorados sem erro (fora da
  lista e do cálculo).
- **FR-010**: O mecanismo de vínculo MUST ser **genérico por tipo de entidade + provedor
  registrado**: adicionar um novo agente MUST exigir apenas um novo provedor, sem mudança no
  modelo de dados nem nas telas genéricas.
- **FR-011**: Excluir uma meta MUST apenas remover seus vínculos externos — jamais tocar nas
  entidades dos outros agentes; o inverso idem.
- **FR-012**: O dia de um check-in automático MUST ser o dia local (America/Sao_Paulo) do
  registro na fonte.

### Key Entities *(include if feature involves data)*

- **Vínculo externo de meta**: associação meta ↔ entidade de outro agente (tipo + referência);
  não duplica dados do item, apenas o referencia. Não exclusivo (o mesmo item pode servir a
  mais de uma meta).
- **Modo da métrica**: propriedade da meta — manual (valor digitado, comportamento atual) ou
  automático (valor derivado dos vínculos na consulta).
- **Fonte de hábito**: configuração que liga um hábito a uma origem automática de check-ins
  (qual fonte + parâmetros), convivendo com check-ins manuais.
- **Provedor de vínculo**: contrato que cada agente participante publica — buscar itens,
  resolver status/apresentação de itens vinculados e informar datas/valores de atividade —
  registrado num ponto único e descoberto dinamicamente.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Na meta de leitura, terminar um livro na Frieren atualiza o progresso na
  próxima consulta da meta em 100% dos casos, sem qualquer ação na meta.
- **SC-002**: Vincular um livro existente a uma meta leva no máximo **3 passos** (abrir
  picker → buscar → confirmar).
- **SC-003**: Escrever no diário gera o check-in automático do dia correto (fuso local) em
  100% dos casos testados, inclusive após as 21h.
- **SC-004**: Com um agente indisponível, a tela da meta/hábito continua funcional,
  degradando apenas a seção afetada — zero erros fatais nos cenários testados.
- **SC-005**: Nenhuma operação de vínculo/desvínculo/exclusão altera dados nos agentes de
  origem: contagens de livros e registros do diário permanecem idênticas antes e depois.
- **SC-006**: Os dois provedores da fase 1 operam pelo mesmo mecanismo genérico — adicionar
  um terceiro tipo não exige alteração no modelo de dados (verificável por revisão de
  design na entrega).

## Assumptions

- **Vínculo manual por decisão do usuário**: livros contam para a meta apenas se vinculados
  explicitamente (nada de "todo livro lido no ano conta sozinho") — decisão de produto de
  2026-07-06.
- **Fase 1 = Frieren + Violet**: livros (meta e hábito de leitura) e diário (hábito de
  escrita). Nami/Akane/Marin/Mai ficam para fases futuras via novos provedores.
- **Arquitetura de referência**: copia dois padrões já validados no repo — a tabela genérica
  de vínculos da Komi (`entity_type`/`entity_id` texto, idempotente) e o registry fan-out do
  Calendar Hub (provedor por agente, ex.: `calendar_provider.py` da spec 019).
- **Nada persistido derivado**: progresso automático e check-ins automáticos são calculados
  na leitura (merge em memória antes dos motores puros de progresso/força) — coerente com
  `goal_progress.py`/`habit_strength.py`, sem jobs de sincronização.
- **Donos dos dados**: cada provedor vive no pacote do agente dono
  (ex.: `agents/frieren/goal_provider.py`); a Kaguya não consulta tabelas alheias
  diretamente.
- **Canal**: webapp primeiro; a Kaguya no Telegram pode citar progresso automático ao
  responder sobre metas/hábitos, mas fluxos conversacionais de vínculo ficam fora de escopo.
- **Usuário único**, como nos demais domínios.
