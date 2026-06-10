# Feature Specification: Navegar para o Dia pelo Heatmap

**Feature Branch**: `005-violet-journal-features`

**Created**: 2026-06-10

**Status**: Draft

**Input**: User description: "Ir para o dia quando clicar no heatmap — navegação ao clicar no
heatmap"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Abrir a entrada de um dia a partir do heatmap (Priority: P1)

Explorando o heatmap anual nos Insights, o usuário vê um dia interessante (uma célula escura de
muita escrita, ou vermelha de favorito) e clica nela. A aplicação navega direto para a tela de
escrita daquele dia, exibindo a entrada completa — sonho, bullets e tudo que foi registrado.

**Por que esta prioridade**: É a feature inteira: transforma o heatmap de visualização passiva
em índice navegável do diário, fechando o ciclo "ver o panorama → mergulhar no dia".

**Teste independente**: Abrir Insights, clicar em uma célula de dia com escrita e confirmar que
a tela Escrever abre naquele dia exato, com os bullets correspondentes visíveis.

**Acceptance Scenarios**:

1. **Given** o heatmap dos Insights exibido, **When** o usuário clica na célula de um dia com
   escrita, **Then** a aplicação navega para a tela Escrever desse dia, mostrando a entrada
   completa.

2. **Given** o heatmap exibido, **When** o usuário clica na célula de um dia sem escrita,
   **Then** a aplicação navega para a tela Escrever desse dia, que abre vazia e pronta para
   registrar (comportamento atual de criação sob demanda).

3. **Given** o usuário passa o cursor sobre uma célula de dia, **When** o cursor está em cima,
   **Then** a célula indica que é clicável (cursor/realce), mantendo o tooltip atual de data e
   palavras.

4. **Given** as células vazias de alinhamento da grade (espaços antes do dia 1º e após o último
   dia do mês), **When** o usuário clica nelas, **Then** nada acontece — não são clicáveis.

5. **Given** o filtro de ano dos Insights (spec 005) em um ano anterior, **When** o usuário
   clica em um dia daquele ano, **Then** a navegação abre a tela Escrever na data correta do
   ano selecionado.

6. **Given** o usuário navegou do heatmap para um dia, **When** quer voltar ao panorama,
   **Then** retorna aos Insights pela navegação normal da sidebar (sem exigência de botão
   "voltar" dedicado).

---

### Edge Cases

- Células de alinhamento (sem dia associado): não clicáveis, sem cursor de link e sem efeito.
- Dia sem escrita: abre a página vazia do dia — é um convite a escrever sobre ele, não um erro.
- Dias futuros: não existem na grade do ano corrente (que termina em hoje), então o caso não
  ocorre; em anos passados todos os dias são clicáveis.
- Convive com a spec 008: células vermelhas (dia com favorito) são clicáveis como as demais.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Toda célula do heatmap dos Insights que representa um dia real MUST ser clicável
  e, ao clique, navegar para a tela Escrever na data daquele dia.
- **FR-002**: Células de alinhamento da grade (sem dia associado) MUST NOT ser clicáveis nem
  apresentar affordance de clique.
- **FR-003**: A célula de dia MUST sinalizar visualmente que é clicável ao passar o cursor,
  preservando o tooltip existente (data e palavras).
- **FR-004**: O clique em um dia sem escrita MUST abrir a tela Escrever desse dia vazia, pronta
  para registro (criação sob demanda, comportamento já existente da tela Escrever).
- **FR-005**: A navegação MUST funcionar para qualquer ano exibido no heatmap, abrindo a data
  correta do ano selecionado (integração com a spec 005).

### Key Entities

*(sem entidades novas — a feature usa o mecanismo de navegação interna por data já existente,
o mesmo empregado pelas telas Refletir e Arquivo para abrir uma entrada específica)*

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O usuário vai do panorama anual à entrada de um dia específico com exatamente
  1 clique.
- **SC-002**: 100% dos cliques em células de dia abrem a data correta (zero deslocamentos de
  um dia por fuso horário ou alinhamento da grade).
- **SC-003**: Cliques em células de alinhamento nunca causam navegação nem erro.

## Assumptions

- O heatmap afetado é o da tela Insights — o único existente no Violet hoje.
- O destino do clique é a tela Escrever (Write) na data clicada, usando a navegação interna por
  data já existente no shell do Violet — mesmo padrão dos links "#N · data" das outras telas.
- Não há necessidade de botão dedicado de retorno aos Insights; a sidebar já cumpre o papel.
- Convive com as specs 005 (ano selecionado) e 008 (células vermelhas continuam clicáveis).
