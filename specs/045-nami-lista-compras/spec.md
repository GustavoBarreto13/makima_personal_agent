# Feature Specification: Lista de Compras — do item no Telegram à despesa lançada

**Feature Branch**: `045-nami-lista-compras`

**Created**: 2026-07-06

**Status**: Draft

**Input**: User description: "Seção de Lista de Compras da Nami, bem completa e simples de usar. Uso duplo: webapp mobile-first (no mercado, pelo celular) e Telegram via Makima ('adiciona arroz na lista do mercado'). Itens com quantidade/unidade/preço estimado opcionais, checkbox de carrinho, múltiplas listas, itens frequentes, e 'Finalizar compra' que lança a despesa (valor total real) e arquiva a lista."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Montar a lista ao longo da semana (Priority: P1)

Durante a semana, sempre que noto que algo acabou, mando pro Telegram: "adiciona arroz,
feijão 2kg e leite na lista do mercado" — os 3 itens entram de uma vez. No webapp, um campo
de adição rápida faz o mesmo (Enter adiciona).

**Why this priority**: A captura sem atrito é o que faz uma lista de compras ser usada de
verdade — se der trabalho, o usuário volta pro papel.

**Independent Test**: Adicionar itens pelo Telegram e vê-los na tela do webapp (e
vice-versa) — mesma lista, duas portas de entrada.

**Acceptance Scenarios**:

1. **Given** a lista "Mercado", **When** o usuário manda "adiciona arroz, feijão 2kg, leite" no Telegram, **Then** 3 itens são criados (feijão com quantidade 2kg) e o agente confirma.
2. **Given** o webapp aberto, **When** o usuário digita um item no campo rápido e tecla Enter, **Then** o item entra no fim da lista e o campo limpa para o próximo.
3. **Given** nenhuma lista criada, **When** o primeiro item é adicionado, **Then** a lista padrão "Mercado" é criada automaticamente.
4. **Given** o Telegram, **When** o usuário pergunta "o que tem na lista do mercado?", **Then** o agente responde os itens pendentes.

---

### User Story 2 - Usar a lista no mercado (celular) (Priority: P1)

No mercado, abro o webapp no celular: itens com checkbox grande, risco ao marcar, contador
"5/12 no carrinho" e total estimado (quando os itens têm preço). Consigo remover item e
desfazer marcação com um toque.

**Why this priority**: É o momento de uso real da lista — a tela precisa funcionar bem em
pé, com uma mão, no corredor do mercado.

**Independent Test**: Em viewport mobile, marcar/desmarcar/remover itens com toques únicos;
contador e total estimado atualizam na hora.

**Acceptance Scenarios**:

1. **Given** a lista com 12 itens, **When** o usuário marca 5, **Then** os marcados ficam riscados e o contador mostra "5/12 no carrinho".
2. **Given** itens com preço estimado, **When** o usuário marca itens, **Then** o total estimado do carrinho atualiza.
3. **Given** um item marcado por engano, **When** o usuário toca de novo, **Then** desmarca sem diálogo de confirmação.

---

### User Story 3 - Finalizar a compra e virar despesa (Priority: P1)

No caixa, toco em "Finalizar compra": informo o valor total real e a conta ou cartão usado
— a despesa é lançada (categoria de mercado) e a lista é arquivada com o vínculo para a
transação. A lista ativa fica limpa para a próxima compra.

**Why this priority**: É a integração que dá sentido à lista dentro da Nami — a compra vira
registro financeiro sem digitação extra.

**Independent Test**: Finalizar com R$ 250 numa conta; conferir a despesa criada, a lista
arquivada com vínculo e uma nova lista vazia pronta.

**Acceptance Scenarios**:

1. **Given** a lista com itens marcados, **When** o usuário finaliza informando R$ 250 e o cartão, **Then** uma despesa de R$ 250 (categoria de mercado) é criada no cartão e a lista é arquivada com o vínculo à transação.
2. **Given** a finalização concluída, **When** o usuário volta à seção, **Then** vê a lista ativa vazia (ou a próxima lista) e a compra anterior no histórico.
3. **Given** o usuário desistiu de finalizar, **When** cancela o diálogo, **Then** a lista permanece intacta.
4. **Given** finalização sem informar valor, **When** tenta confirmar, **Then** validação clara impede.

---

### User Story 4 - Itens frequentes e múltiplas listas (Priority: P2)

Vejo os itens que mais compro ("Frequentes") e re-adiciono com um toque. Posso ter mais de
uma lista (Mercado, Farmácia, Petshop) e alternar entre elas.

**Why this priority**: Acelera a montagem recorrente (a lista de mercado é ~80% repetida),
mas a lista única já entrega o fluxo completo.

**Independent Test**: Após 2 compras arquivadas com "arroz", ele aparece em Frequentes e
volta pra lista com um toque; criar lista "Farmácia" e alternar.

**Acceptance Scenarios**:

1. **Given** compras arquivadas contendo "arroz" repetidamente, **When** o usuário abre Frequentes, **Then** "arroz" aparece entre os primeiros e um toque o adiciona à lista ativa.
2. **Given** múltiplas listas, **When** o usuário alterna no seletor, **Then** cada lista mantém seus próprios itens e estado.
3. **Given** um item já presente na lista ativa, **When** re-adicionado dos Frequentes, **Then** não duplica (ou incrementa a quantidade — comportamento único e consistente).

### Edge Cases

- Quantidade/unidade são texto livre interpretado ("2kg", "3", "1 dúzia") — sem validação rígida; o que não parsear vira parte do nome.
- Finalizar lista sem nenhum item marcado: permitido com confirmação ("finalizar mesmo sem itens no carrinho?") — o usuário pode ter marcado de memória.
- Itens não marcados ao finalizar: perguntar se movem para a próxima lista (manter pendentes) ou arquivam junto.
- Lista arquivada é imutável (histórico); excluir lista ativa pede confirmação.
- Dois dispositivos abertos ao mesmo tempo: última escrita vence (single-user; sem resolução de conflito sofisticada).
- Telegram: nomes de lista resolvidos por prefixo ("farm" → "Farmácia"); ambiguidade pede esclarecimento.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST suportar múltiplas listas de compras nomeadas, com a lista padrão "Mercado" criada sob demanda; cada lista tem status ativa ou arquivada.
- **FR-002**: Itens MUST ter nome, quantidade opcional, unidade opcional, preço estimado opcional, estado marcado/desmarcado e ordem estável.
- **FR-003**: O agente no Telegram MUST suportar: adicionar vários itens numa frase, listar itens pendentes, marcar/remover item e finalizar a compra — com roteamento correto pela Makima ("lista de compras" → Nami).
- **FR-004**: O webapp MUST oferecer tela mobile-first com adição rápida (Enter), checkbox de toque único com item riscado, contador X/N no carrinho, total estimado quando houver preços e remoção com um toque.
- **FR-005**: "Finalizar compra" MUST coletar o valor total real e o pagador (conta ou cartão), criar a despesa na categoria de mercado, arquivar a lista com vínculo à transação criada — em operação atômica.
- **FR-006**: O sistema MUST exibir itens frequentes (derivados do histórico de listas arquivadas) com re-adição em um toque, sem duplicar itens já presentes.
- **FR-007**: Listas arquivadas MUST permanecer consultáveis como histórico (o que foi comprado, quando, por quanto).

### Key Entities

- **Lista de compras**: coleção nomeada de itens com status (ativa/arquivada) e, quando finalizada, vínculo com a transação da compra.
- **Item de lista**: nome + atributos opcionais (quantidade, unidade, preço estimado) + estado no carrinho + posição.
- **Item frequente**: agregado derivado do histórico (não é entidade persistida própria) — os nomes mais recorrentes nas listas arquivadas.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Adicionar um item leva menos de 5 segundos por qualquer porta (Telegram ou webapp).
- **SC-002**: Finalizar a compra (valor + pagador) leva menos de 20 segundos e gera exatamente uma despesa vinculada.
- **SC-003**: A tela funciona em viewport de celular com alvos de toque confortáveis (uso com uma mão) — validado em teste manual mobile.
- **SC-004**: Itens adicionados por uma porta aparecem na outra imediatamente após recarregar (mesma fonte de dados).
- **SC-005**: Após 3 compras, os Frequentes refletem os itens realmente repetidos.

## Assumptions

- Preço estimado é opcional e informativo — o valor da despesa é sempre o total real informado na finalização.
- A categoria padrão da despesa é a de mercado/supermercado existente; o usuário pode trocar na finalização.
- Sem preços por item obrigatórios, o app não tenta reconciliar item a item com o cupom fiscal (fora do escopo).
- Ordenação manual (drag) é desejável mas não obrigatória na v1 — ordem de inserção basta.
- Independente das demais specs (só requer a Nami base).
