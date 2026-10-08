// Temporada de estreia: o Jikan guarda "winter 2024" (em inglês); a tela mostra "Inverno 2024".
// Espelha `season_label` de agents/marin/tools_stats.py, para a lista de estatísticas e o catálogo falarem igual.

const ESTACOES: Record<string, string> = {
  winter: 'Inverno', inverno: 'Inverno',
  spring: 'Primavera', primavera: 'Primavera',
  summer: 'Verão', verao: 'Verão', 'verão': 'Verão',
  fall: 'Outono', autumn: 'Outono', outono: 'Outono',
}

/** "winter 2024" → "Inverno 2024". Texto que não dá para entender (sem ano, estação desconhecida) vira ''. */
export function seasonLabel(season: string | null | undefined): string {
  const parts = (season ?? '').trim().split(/\s+/)
  if (parts.length !== 2 || !/^\d+$/.test(parts[1])) return ''
  const name = ESTACOES[parts[0].toLowerCase()]
  return name ? `${name} ${parts[1]}` : ''
}

/** Ano de uma temporada já formatada ("Inverno 2024" → "2024"); '' quando não há. */
export const seasonYear = (label: string): string => label.split(' ')[1] ?? ''
