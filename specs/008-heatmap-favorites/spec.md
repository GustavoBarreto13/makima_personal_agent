# Feature Specification: Heatmap Vermelho em Dias com Favorito

**Feature Branch**: `005-violet-journal-features`

**Created**: 2026-06-10

**Status**: Draft

**Input**: User description: "Heatmap ficar vermelho se tiver um bullet favorito — sinalização
visual no heatmap"

**Depends on**: spec 007 (favoritar bullet) — sem favoritos não há o que sinalizar.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Enxergar os dias marcantes no heatmap (Priority: P1)

Olhando o heatmap anual nos Insights, o usuário identifica de relance os dias que contêm pelo
menos um bullet favorito: essas células aparecem em vermelho (garnet), destacando-se da escala
normal de intensidade de escrita. O ano vira um mapa visual dos dias marcantes.

**Por que esta prioridade**: É a feature em si — o heatmap é o consumo principal dos favoritos
da spec 007 e transforma a marcação individual em visão panorâmica do ano.

**Teste independente**: Favoritar um bullet em um dia qualquer, abrir Insights e confirmar que
a célula daquele dia está vermelha; desfavoritar e confirmar que a célula volta à escala normal.

**Acceptance Scenarios**:

1. **Given** um dia possui ao menos um bullet favorito, **When** o heatmap dos Insights é
   exibido, **Then** a célula desse dia aparece em um tom único de vermelho (garnet), no lugar
   da cor de intensidade normal.

2. **Given** um dia possui bullets favoritos e alta intensidade de escrita, **When** o heatmap
   é exibido, **Then** o vermelho prevalece sobre a cor de intensidade (favorito tem prioridade
   visual).

3. **Given** o único bullet favorito de um dia é desfavoritado, **When** o heatmap é
   recarregado, **Then** a célula volta à cor da escala normal de intensidade.

4. **Given** o usuário passa o cursor sobre uma célula vermelha, **When** a dica (tooltip)
   aparece, **Then** ela indica que o dia tem favorito, além das informações já exibidas
   (data e palavras).

5. **Given** o heatmap exibe a legenda "menos → mais", **When** existem dias com favorito,
   **Then** a legenda inclui a indicação do que a célula vermelha significa.

6. **Given** o filtro de ano dos Insights (spec 005), **When** o usuário troca o ano, **Then**
   os dias vermelhos refletem os favoritos do ano selecionado.

---

### Edge Cases

- Vários bullets favoritos no mesmo dia: a célula é igualmente vermelha (sem gradação por
  quantidade).
- Dia com favorito sempre tem escrita (favorito pressupõe bullet existente) — não há caso de
  célula vermelha em dia "vazio"; se o bullet favorito for excluído, o dia volta à escala
  normal.
- Acessibilidade: a informação não depende só da cor — o tooltip também comunica o favorito em
  texto.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O heatmap dos Insights MUST exibir em vermelho único (garnet) toda célula de dia
  que contenha ao menos um bullet favorito no ano exibido.
- **FR-002**: O vermelho MUST prevalecer sobre a escala de intensidade de escrita — qualquer
  nível de intensidade é substituído pelo vermelho quando há favorito.
- **FR-003**: O tooltip da célula MUST indicar a presença de favorito, além da data e contagem
  de palavras já exibidas.
- **FR-004**: A legenda do heatmap MUST incluir a explicação da célula vermelha (dia com
  favorito).
- **FR-005**: A sinalização MUST refletir o estado atual dos favoritos: favoritar/desfavoritar
  um bullet atualiza o dia correspondente na próxima exibição do heatmap.
- **FR-006**: A sinalização MUST funcionar para qualquer ano exibido no heatmap (integração com
  o filtro de ano da spec 005).

### Key Entities

- **Dia do heatmap (extensão)**: além da contagem de palavras, cada dia passa a carregar a
  informação "tem favorito" (sim/não), derivada dos bullets favoritos do dia (spec 007).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: O usuário localiza qualquer dia com favorito no heatmap anual em menos de
  5 segundos, sem precisar abrir nenhuma entrada.
- **SC-002**: 100% dos dias com ao menos um bullet favorito aparecem vermelhos, e nenhum dia
  sem favorito aparece vermelho (zero falsos positivos/negativos).
- **SC-003**: Após desfavoritar o único bullet favorito de um dia, a célula volta à escala
  normal na próxima carga da tela.

## Assumptions

- Tom de vermelho único (decisão do usuário): a célula não mantém gradação de intensidade —
  sinal binário, claro e imediato. O tom é o garnet da paleta existente do Violet, o mesmo da
  marcação de favorito no bullet (spec 007).
- O heatmap afetado é o da tela Insights — único heatmap existente no Violet hoje. Se outros
  heatmaps surgirem, herdam o comportamento.
- Atualização na recarga da tela é suficiente (não há exigência de tempo real entre a página de
  escrita e os Insights abertos simultaneamente).
- Esta spec depende da 007 (favoritar bullet) e convive com a 009 (clique no heatmap): células
  vermelhas continuam clicáveis para navegar ao dia.
