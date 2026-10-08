// Grava um rascunho de sessão: registra os episódios e devolve um "Desfazer" que volta o anime exatamente ao
// estado de antes (apaga a sessão e, se logar mudou o estado de "quero assistir"/"pausado" para "assistindo",
// devolve o estado antigo).

import type { MarinApi } from '../marinApi'
import type { Anime } from '../types'
import { epLabel, type LogDraft } from './log'

type Api = Pick<MarinApi, 'logWatch' | 'updateStatus' | 'deleteLog'>

export interface SubmitResult {
  message: string
  undo: () => Promise<void>
}

export async function submitLog(d: LogDraft, anime: Anime, api: Api): Promise<SubmitResult> {
  // Quem estava na fila ou pausado e volta a assistir passa a "assistindo" (se a sessão completar o anime, o
  // servidor muda para "completo" sozinho depois). Faz antes de logar, para a conclusão ter a palavra final.
  const reopened = anime.status === 'quero_assistir' || anime.status === 'pausado'
  if (reopened) await api.updateStatus(anime.id, 'assistindo')

  const r = await api.logWatch(anime.id, { ep_start: d.epStart, ep_end: d.epEnd, watched_date: d.date, stars: d.rating, notes: d.notes.trim() || null })
  const logId = r.log_id
  const before = anime.status

  return {
    message: `${epLabel(d.epStart, d.epEnd)} de ${anime.title} registrado`,
    undo: async () => {
      if (logId) await api.deleteLog(logId)
      if (reopened) await api.updateStatus(anime.id, before)
    },
  }
}
