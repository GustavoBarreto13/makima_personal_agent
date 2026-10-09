// durations.ts — opções de duração compartilhadas entre TaskModal e EventPopover.
//
// Usadas em selects de "Duração" onde o valor (v) é em minutos e label é a string legível.
// O valor 0 significa "sem duração definida" (sem estimativa nem time-block).

export interface DurationOption {
  v: number      // duração em minutos (0 = sem duração)
  label: string  // texto exibido no select
}

export const DURATIONS: DurationOption[] = [
  { v: 0,   label: 'Sem duração' },
  { v: 15,  label: '15 min' },
  { v: 30,  label: '30 min' },
  { v: 45,  label: '45 min' },
  { v: 60,  label: '1 h' },
  { v: 90,  label: '1 h 30' },
  { v: 120, label: '2 h' },
  { v: 180, label: '3 h' },
  { v: 240, label: '4 h' },
]

/**
 * Encontra o valor de duração mais próximo na lista de opções.
 *
 * Útil para pré-selecionar o select quando a tarefa já tem `duration_min` ou
 * quando derivamos a duração de `end - start` de um evento do calendário.
 * Se a duração exata não estiver na lista, seleciona o valor imediatamente
 * abaixo (arredondamento para baixo), ou 0 se for menor que 15 min.
 *
 * @param minutes - Duração em minutos a ser aproximada.
 * @returns O valor (v) da opção mais próxima na lista DURATIONS.
 */
export function snapDuration(minutes: number): number {
  if (minutes <= 0) return 0
  // Percorre de trás para frente — pega o maior valor que seja ≤ minutes
  for (let i = DURATIONS.length - 1; i >= 0; i--) {
    if ((DURATIONS[i].v ?? 0) <= minutes) return DURATIONS[i].v ?? 0
  }
  return 0
}
