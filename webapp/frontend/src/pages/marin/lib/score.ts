// Nota do anime: o banco e o MyAnimeList usam 0–10 em pontos inteiros; o Design System mostra 0–5 estrelas
// com meia estrela. A regra é "meia estrela = 1 ponto do MAL": 8/10 é 4 estrelas, 7/10 é 3,5 estrelas.
// Nenhuma tela faz essa conta sozinha — usa estas funções (que reaproveitam as do DS).

import { fromFiveScale, toFiveScale } from '../../../design/core/format'

/** Nota do MAL (0–10) em estrelas (0.5–5). Sem nota (null, 0) continua sem nota. */
export function toStars(mal: number | null | undefined): number | null {
  if (mal == null || !Number.isFinite(Number(mal)) || Number(mal) <= 0) return null
  return toFiveScale(Number(mal), 10)
}

/** Estrelas (0–5, meia estrela) na nota do MAL (0–10, inteira). 0 ou vazio = 0 (o servidor lê como "sem nota"). */
export function toMal(stars: number | null | undefined): number {
  if (stars == null || !(stars > 0)) return 0
  return fromFiveScale(stars, 10)
}

/** "8/10", ou null quando não há nota. Mostrado ao lado das estrelas para a nota do MAL não se perder. */
export function malLabel(stars: number | null | undefined): string | null {
  const mal = toMal(stars)
  return mal > 0 ? `${mal}/10` : null
}
