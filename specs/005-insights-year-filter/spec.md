# Feature Specification: Filtro de Ano nos Insights

**Feature Branch**: `005-violet-journal-features`

**Created**: 2026-06-10

**Status**: Draft

**Input**: User description: "Escolher ano da aba insights — filtro de ano na aba de insights"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Ver a análise de um ano específico (Priority: P1)

O usuário abre a tela Insights e, em vez de ver apenas a análise do ano corrente, encontra um
seletor de ano junto ao título ("Análise {ano}"). Ao escolher um ano anterior, todo o painel —
hero, big numbers, heatmap, e as 7 abas (Diário, Palavras, Coleções, Horários, Pessoas, Tags,
Sequências) — é recalculado para o ano escolhido.

**Por que esta prioridade**: É a feature em si. Hoje o ano é fixo no ano corrente, então todo
o histórico de anos anteriores fica invisível na análise. Sem o seletor, nada mais existe.

**Teste independente**: Abrir Insights, trocar para um ano anterior com dados e confirmar que
hero, big numbers, heatmap e abas mostram os números daquele ano (ex.: total de palavras e dias
escritos diferentes do ano corrente). Voltar para o ano atual e confirmar que os números voltam.

**Acceptance Scenarios**:

1. **Given** o usuário está na tela Insights, **When** a tela carrega, **Then** o ano corrente
   está selecionado por padrão e o título exibe "Análise {ano corrente}".

2. **Given** existem entradas registradas em 2025 e 2026, **When** o usuário seleciona 2025,
   **Then** hero, big numbers, heatmap e todas as 7 abas exibem exclusivamente dados de 2025,
   e o título passa a exibir "Análise 2025".

3. **Given** o usuário está vendo um ano anterior, **When** observa o heatmap, **Then** a grade
   cobre o ano completo (1º de janeiro a 31 de dezembro), e não apenas até a data de hoje.

4. **Given** o usuário está vendo o ano corrente, **When** observa o heatmap, **Then** a grade
   cobre de 1º de janeiro até hoje (comportamento atual preservado).

5. **Given** o usuário seleciona um ano anterior, **When** observa as métricas de sequência,
   **Then** a "maior sequência" reflete o ano selecionado e a "sequência atual" (que só faz
   sentido em relação a hoje) é exibida apenas quando o ano selecionado é o corrente.

---

### User Story 2 — Saber quais anos têm registro (Priority: P2)

O usuário não precisa adivinhar quais anos possuem dados: o seletor oferece exatamente os anos
do intervalo entre a primeira entrada registrada no diário e o ano corrente.

**Por que esta prioridade**: Evita seleção às cegas e estados vazios desnecessários, mas o
valor principal (US1) funciona mesmo com uma lista fixa de anos.

**Teste independente**: Com a primeira entrada do diário em 2025, confirmar que o seletor
oferece 2025 e 2026 — e nenhum ano anterior a 2025 nem futuro.

**Acceptance Scenarios**:

1. **Given** a primeira entrada do diário é de 2025 e hoje é 2026, **When** o usuário abre o
   seletor, **Then** as opções são exatamente 2026 e 2025 (ordem decrescente).

2. **Given** o diário só tem entradas no ano corrente, **When** o usuário abre o seletor,
   **Then** apenas o ano corrente é oferecido.

---

### Edge Cases

- Ano selecionado sem nenhuma escrita (intervalo com lacuna): todas as métricas exibem zero e o
  heatmap aparece inteiro no nível "sem escrita" — sem erro nem tela quebrada.
- Virada de ano com a tela aberta: o padrão é definido no carregamento; não é necessário
  atualizar automaticamente à meia-noite.
- Anos futuros nunca são oferecidos no seletor.
- A seleção de ano não precisa persistir entre visitas: ao reabrir os Insights, volta ao ano
  corrente.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A tela Insights MUST exibir um seletor de ano visível na região do hero, junto ao
  título "Análise {ano}".
- **FR-002**: O seletor MUST oferecer todos os anos do intervalo entre o ano da primeira entrada
  registrada e o ano corrente, em ordem decrescente, sem anos futuros.
- **FR-003**: O ano corrente MUST ser a seleção padrão ao abrir a tela.
- **FR-004**: Ao trocar o ano, o sistema MUST recalcular e reexibir todo o conteúdo da tela:
  hero, big numbers, heatmap e as 7 abas — nenhuma métrica do ano anterior selecionado pode
  permanecer visível.
- **FR-005**: Para anos anteriores ao corrente, o heatmap MUST cobrir o ano completo
  (1º jan – 31 dez); para o ano corrente, MUST cobrir de 1º jan até hoje.
- **FR-006**: A métrica "sequência atual" MUST ser exibida apenas quando o ano selecionado é o
  corrente; em anos anteriores, apenas a "maior sequência" do ano é exibida.
- **FR-007**: Um ano sem dados MUST exibir métricas zeradas e heatmap vazio, sem erro.

### Key Entities

- **Ano de análise**: o ano-calendário que parametriza todas as consultas da tela Insights. As
  consultas de estatísticas e heatmap já são parametrizadas por ano hoje; a feature introduz a
  escolha pelo usuário e a descoberta do intervalo de anos disponíveis.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O usuário consegue visualizar a análise de qualquer ano com registro em no máximo
  2 cliques a partir da tela Insights.
- **SC-002**: Após trocar o ano, 100% das métricas visíveis (hero, big numbers, heatmap, abas)
  refletem o ano selecionado — nenhum valor residual do ano anterior.
- **SC-003**: A troca de ano exibe os novos dados em menos de 2 segundos em uso normal.
- **SC-004**: Selecionar um ano sem dados nunca resulta em erro visível ou tela quebrada.

## Assumptions

- As consultas de estatísticas e de heatmap já aceitam o ano como parâmetro; o trabalho da
  feature está em expor a escolha ao usuário e em descobrir o intervalo de anos com registro.
- O intervalo de anos é contíguo (da primeira entrada até hoje) — anos intermediários sem dados
  aparecem no seletor e exibem zeros, o que é aceitável para um diário pessoal.
- A preferência de ano não é persistida entre sessões (decisão de simplicidade — YAGNI).
- As specs 008 (heatmap de favoritos) e 009 (navegação pelo heatmap) operam sobre o mesmo
  heatmap e devem funcionar para qualquer ano selecionado.
