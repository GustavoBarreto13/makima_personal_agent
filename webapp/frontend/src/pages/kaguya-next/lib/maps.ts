// Link do Google Maps para o local de um evento (spec 039).
//
// Sem chave de API: usa a busca universal do Maps. Se o local já for uma URL
// (Google Meet, link de vídeo etc. — FR-010/cenário 4), abre a própria URL em
// vez de tentar buscá-la no Maps.

export function mapsLinkFor(loc: string): string {
  const trimmed = loc.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmed)}`
}
