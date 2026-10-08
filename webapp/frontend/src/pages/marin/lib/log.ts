// Logar episódio: o que a linha rápida ("Frieren ep 12", "Dungeon Meshi ep 5-8 ★4.5 ontem") entende e como vira
// um rascunho. Lógica pura (sem React nem rede): a decisão de salvar direto ou abrir o formulário é daqui.

import { createCaptureParser, type CaptureResult } from '../../../design/core/capture'
import type { Anime } from '../types'

/** Episódio (`ep 12`, `ep 5-8`), nota (`★4.5`) e data no passado (`ontem`, `sexta`, `12/09`). */
export const logParser = createCaptureParser({ rules: ['progress', 'rating', 'date'], dateDirection: 'past' })

export interface LogDraft {
  /** Anime escolhido (null = ainda não escolhido). */
  animeId: string | null
  /** O que foi digitado como título (para achar o anime). */
  title: string
  /** Primeiro episódio da sessão; null = não informou. */
  epStart: number | null
  /** Último episódio da sessão; null = não informou. */
  epEnd: number | null
  date: string
  /** Nota da sessão em estrelas (0.5–5); null = sem nota. */
  rating: number | null
  notes: string
}

export const emptyDraft = (today: string, animeId: string | null = null, ep: number | null = null): LogDraft => ({
  animeId, title: '', epStart: ep, epEnd: ep, date: today, rating: null, notes: '',
})

/** Minúsculas, sem acento e sem pontuação: "Frieren" e "frieren!" são o mesmo título. */
export function norm(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

/** Próximo episódio a assistir (o seguinte ao último visto); null quando já viu todos. */
export function nextEpisode(a: Anime): number | null {
  const next = a.watched + 1
  return a.total && next > a.total ? null : next
}

/** Todos os nomes pelos quais um anime pode ser achado (principal, inglês e japonês). */
const names = (a: Anime): string[] => [a.title, a.titleEnglish, a.titleJapanese].filter(Boolean)

/** Animes na ordem em que o formulário sugere: assistindo, pausados, os da fila e, por fim, o resto. */
export function candidates(animes: Anime[]): Anime[] {
  const rank: Record<string, number> = { assistindo: 0, pausado: 1, quero_assistir: 2, completo: 3, abandonado: 4 }
  return [...animes].sort((a, b) => rank[a.status] - rank[b.status] || b.updatedAt.localeCompare(a.updatedAt))
}

/** O anime "certo" para o título digitado, só quando não há dúvida.
 *  - Sem título: o único anime que está sendo assistido.
 *  - Título igual (sem acento/maiúscula): se só um anime tem esse nome.
 *  - Começo do título ("Dungeon" → "Dungeon Meshi"): se só um anime começa assim.
 *  Qualquer empate → null (o formulário pergunta). */
export function pickAnime(title: string, animes: Anime[]): Anime | null {
  const t = norm(title)
  if (!t) {
    const watching = animes.filter((a) => a.status === 'assistindo')
    return watching.length === 1 ? watching[0] : null
  }
  const exact = animes.filter((a) => names(a).some((n) => norm(n) === t))
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) return null
  const starts = animes.filter((a) => names(a).some((n) => norm(n).startsWith(t)))
  return starts.length === 1 ? starts[0] : null
}

/** Animes cujo nome ou estúdio contém o texto (para a busca do formulário). */
export function searchAnimes(q: string, animes: Anime[]): Anime[] {
  const n = norm(q)
  if (!n) return candidates(animes)
  return candidates(animes).filter((a) => names(a).some((x) => norm(x).includes(n)) || norm(a.studio).includes(n))
}

export function draftFromCapture(r: CaptureResult, ctx: { today: string; animes: Anime[] }): LogDraft {
  const f = r.fields
  const title = f.title.trim()
  const anime = pickAnime(title, ctx.animes)
  // "ep 12" é um episódio; "ep 5-8" é o intervalo. Só vale o que for de episódio ("p. 240" não é de anime).
  const prog = f.progress && f.progress.unit === 'ep' ? f.progress : null
  let epStart: number | null = null
  let epEnd: number | null = null
  if (prog) {
    epEnd = prog.to
    epStart = prog.from ?? prog.to
  } else if (anime) {
    // Sem episódio na linha: assume o próximo (o que quase sempre é o que se quer logar).
    epStart = epEnd = nextEpisode(anime)
  }
  return { ...emptyDraft(ctx.today), animeId: anime?.id ?? null, title, epStart, epEnd, date: f.dueDate ?? ctx.today, rating: f.rating }
}

/** Mensagem de erro do campo certo, ou null se dá para salvar. */
export function validateDraft(d: LogDraft, anime: Anime | null, today: string): { field: 'anime' | 'eps' | 'date' | 'rating'; message: string } | null {
  if (!d.animeId || !anime) return { field: 'anime', message: 'Escolha o anime.' }
  if (!d.date) return { field: 'date', message: 'Escolha o dia em que você assistiu.' }
  if (d.date > today) return { field: 'date', message: 'A data não pode ser no futuro.' }
  for (const ep of [d.epStart, d.epEnd]) {
    if (ep !== null && (!Number.isInteger(ep) || ep < 1)) return { field: 'eps', message: 'O episódio precisa ser um número inteiro a partir de 1.' }
  }
  if (d.epStart !== null && d.epEnd !== null && d.epEnd < d.epStart) return { field: 'eps', message: 'O último episódio não pode vir antes do primeiro.' }
  if (anime.total && ((d.epEnd ?? 0) > anime.total || (d.epStart ?? 0) > anime.total)) {
    return { field: 'eps', message: `${anime.title} tem ${anime.total} episódios.` }
  }
  if (d.rating !== null && (d.rating < 0.5 || d.rating > 5 || Math.round(d.rating * 2) !== d.rating * 2)) {
    return { field: 'rating', message: 'A nota vai de meia a cinco estrelas.' }
  }
  return null
}

/** Salva direto só quando a linha deixou tudo claro: anime reconhecido e pelo menos um episódio definido. */
export function canSaveQuickly(d: LogDraft, anime: Anime | null, today: string): boolean {
  return d.epStart !== null && validateDraft(d, anime, today) === null
}

/** "Ep 12", "Eps 5–8" ou "1 sessão" (sem número de episódio). */
export function epLabel(start: number | null, end: number | null, count = 0): string {
  if (start !== null && end !== null) return start === end ? `Ep ${start}` : `Eps ${start}–${end}`
  return count > 0 ? `${count} ${count === 1 ? 'episódio' : 'episódios'}` : 'Sessão'
}
