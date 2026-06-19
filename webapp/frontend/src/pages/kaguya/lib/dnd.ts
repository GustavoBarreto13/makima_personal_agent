// lib/dnd.ts — utilitários compartilhados de drag-and-drop para o shell Kaguya.
//
// Por que centralizar aqui?
// As telas Kanban, Eisenhower, Lista e Meu Dia usam exatamente os mesmos
// blocos de sensor e a mesma aritmética de posição. Em vez de copiar o mesmo
// código em cada arquivo, extraímos aqui para que qualquer ajuste futuro
// (ex.: mudar o limiar de ativação) valha em todas as telas de uma vez.

import { useSensors, useSensor, PointerSensor } from '@dnd-kit/core'
import type { Task } from '../types'

// ─── useDndSensors ────────────────────────────────────────────────────────────
// Hook que configura o sensor padrão do @dnd-kit para toda a app Kaguya.
//
// PointerSensor com activationConstraint.distance = 5px significa:
//   - Deslocamento < 5px  → trata como CLIQUE (onOpen da tarefa dispara).
//   - Deslocamento ≥ 5px  → ativa o ARRASTE (DnD começa).
//
// Isso resolve o conflito clique vs. arraste sem precisar de onPointerDown manual.
export function useDndSensors() {
  return useSensors(
    useSensor(PointerSensor, {
      // Usuário precisa mover o ponteiro pelo menos 5 pixels antes de o
      // DnD considerar que ele está arrastando — não apenas clicando.
      activationConstraint: { distance: 5 },
    }),
  )
}

// ─── midPosition ──────────────────────────────────────────────────────────────
// Calcula uma posição local temporária para o optimistic update durante o drag.
//
// O sistema de posições do backend usa inteiros esparsos (multiplicados de 1000).
// Ao soltar um card, precisamos de um número que fique ENTRE os dois vizinhos
// para que a UI mostre a ordem correta antes de o backend responder.
//
// O backend vai gravar a posição real após o reload silencioso, então o valor
// que calculamos aqui é só para a tela não pular de posição.
//
// Parâmetros:
//   after  — tarefa que ficará ACIMA do card movido (ou null se for o primeiro).
//   before — tarefa que ficará ABAIXO do card movido (ou null se for o último).
//
// Exemplos:
//   midPosition(null, null)   → 1000  (coluna vazia, posição padrão)
//   midPosition(null, B)      → Math.floor(B.position / 2)  (antes do 1º card)
//   midPosition(A, null)      → A.position + 1000            (depois do último)
//   midPosition(A, B)         → Math.floor((A.position + B.position) / 2)
export function midPosition(
  after:  Task | null | undefined,
  before: Task | null | undefined,
): number {
  // Coluna (ou lista) vazia: usa posição inicial padrão.
  if (!after && !before) return 1000

  // Inserindo antes do primeiro card: posição é metade da posição do primeiro.
  if (!after) return Math.floor(before!.position / 2)

  // Inserindo após o último card: adiciona 1000 à posição do último.
  if (!before) return after.position + 1000

  // Inserindo entre dois cards: ponto médio inteiro.
  return Math.floor((after.position + before.position) / 2)
}
