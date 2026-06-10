# Feature Specification: Favoritar Bullet pelo Próprio Ícone

**Feature Branch**: `007-favorite-bullet`

**Created**: 2026-06-10

**Status**: Draft

**Input**: User description: "Favoritar bullet clicando no ícone do próprio bullet — ação de
favoritar diretamente no bullet"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Marcar um bullet como favorito no próprio bullet (Priority: P1)

Relendo a página de um dia, o usuário encontra um bullet especialmente significativo. Em vez de
abrir menus, ele clica diretamente no marcador (o ícone/ponto à esquerda do texto) e o bullet
vira favorito — o marcador muda imediatamente para a cor de destaque vermelha (garnet),
sinalizando o estado. Um novo clique desfaz.

**Por que esta prioridade**: É a feature inteira: a marcação direta e sem fricção é o que
permite que o heatmap de favoritos (spec 008) e futuras visualizações existam.

**Teste independente**: Abrir a página de um dia com bullets, clicar no marcador de um deles e
ver a mudança visual imediata; recarregar a página e confirmar que o estado persistiu; clicar
novamente e confirmar que voltou ao normal.

**Acceptance Scenarios**:

1. **Given** um bullet não favorito de qualquer tipo (bullet, destaque, sonho, ideia, sabedoria,
   nota), **When** o usuário clica no marcador do bullet, **Then** o bullet vira favorito e o
   marcador passa a ser exibido em vermelho (garnet) imediatamente.

2. **Given** um bullet favorito, **When** o usuário clica no marcador, **Then** o favorito é
   removido e o marcador volta à aparência normal do seu tipo.

3. **Given** um bullet foi favoritado, **When** o usuário recarrega a página ou volta ao dia em
   outra sessão, **Then** o bullet continua marcado como favorito.

4. **Given** o usuário passa o cursor sobre o marcador, **When** o cursor está em cima, **Then**
   há indicação de que o marcador é clicável (affordance) e uma dica do que o clique faz.

5. **Given** um bullet favorito, **When** o usuário edita o texto (duplo clique no texto) ou o
   tipo do bullet, **Then** o estado de favorito é preservado.

6. **Given** um bullet favorito, **When** o bullet é excluído, **Then** o estado de favorito
   deixa de existir junto (não há favorito órfão).

---

### Edge Cases

- Clique acidental: o segundo clique desfaz na hora — nenhuma confirmação é necessária.
- Falha de comunicação ao salvar o estado: a interface reverte o marcador ao estado anterior
  (sem favorito "fantasma" que se perde no reload).
- Bullets recém-criados nascem não favoritos.
- Não há limite de favoritos por dia ou no total.
- O clique no marcador não entra em conflito com a edição: editar continua sendo duplo clique
  no texto do bullet, e o clique simples no texto continua sem efeito.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Cada bullet MUST possuir um estado booleano de favorito, persistido junto do
  bullet e padrão "não favorito" na criação.
- **FR-002**: Um clique simples no marcador (ícone/ponto) do bullet MUST alternar o estado de
  favorito — sem menus ou passos intermediários.
- **FR-003**: O bullet favorito MUST ter sinalização visual permanente e imediata: o marcador é
  exibido em vermelho (garnet), independentemente do tipo do bullet.
- **FR-004**: O marcador MUST indicar que é clicável (cursor/hover) e oferecer uma dica textual
  da ação.
- **FR-005**: O estado de favorito MUST sobreviver a edições de texto e persistir entre sessões.
- **FR-006**: A exclusão do bullet MUST remover o estado de favorito junto.
- **FR-007**: Os dias que possuem ao menos um bullet favorito MUST ser identificáveis pelo
  sistema de forma agregada por ano (insumo para o heatmap da spec 008).
- **FR-008**: Em caso de falha ao persistir, a interface MUST reverter a marcação visual e o
  estado real nunca diverge do exibido após a página recarregar.

### Key Entities

- **Bullet (extensão)**: o bullet existente do diário ganha o atributo "favorito" (sim/não).
  Nenhuma outra propriedade do bullet muda; favorito é ortogonal ao tipo (kind).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Favoritar ou desfavoritar um bullet exige exatamente 1 clique e o feedback visual
  aparece em menos de 200 ms.
- **SC-002**: 100% dos favoritos marcados persistem após recarregar a página ou trocar de
  sessão.
- **SC-003**: Zero ações destrutivas acidentais: alternar favorito nunca altera texto, tipo,
  posição ou existência do bullet.

## Assumptions

- "Favorito" é um estado novo e ortogonal ao tipo `highlight` (Destaque) já existente — um
  destaque é um *tipo* de bullet; favorito é uma *marcação* aplicável a qualquer tipo,
  inclusive ao próprio destaque.
- A cor do favorito é o vermelho garnet já presente na paleta do Violet (mesma família visual
  do heatmap da spec 008).
- Uma tela/coleção "Favoritos" na sidebar está fora do escopo desta spec (pode virar feature
  futura); o consumo imediato dos favoritos é o heatmap (spec 008).
- A spec 008 (heatmap vermelho) depende desta feature.
