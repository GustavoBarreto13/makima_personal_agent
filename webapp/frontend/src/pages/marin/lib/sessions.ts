// Excluir uma sessão do diário com confirmação e "Desfazer" (usado no Diário e no detalhe do anime).
// O Desfazer devolve a sessão ao servidor com o MESMO ID e os mesmos valores (o servidor recalcula o progresso).

import { confirm } from '../../../design/headless/confirm'
import { toast } from '../../../design/headless/toast'
import { marinApi } from '../marinApi'
import type { Session } from '../types'
import { epLabel } from './log'

/** Devolve true se excluiu (false = o usuário cancelou ou deu erro). */
export async function deleteSession(s: Session, reload: () => void): Promise<boolean> {
  const day = `${s.date.slice(8)}/${s.date.slice(5, 7)}`
  const ok = await confirm({
    title: 'Excluir esta sessão?',
    body: `${epLabel(s.epStart, s.epEnd, s.count)} de ${s.title} em ${day} saem do diário e o progresso é recalculado. Você poderá desfazer logo depois.`,
    confirmLabel: 'Excluir',
    danger: true,
  })
  if (!ok) return false
  try {
    await marinApi.deleteLog(s.id)
  } catch {
    toast('Não foi possível excluir a sessão.', { tone: 'error' })
    return false
  }
  reload()
  toast('Sessão excluída', {
    undo: () => {
      void marinApi.restoreLog({
        id: s.id, anime_id: s.animeId, watched_date: s.date, ep_start: s.epStart, ep_end: s.epEnd,
        episodes_count: s.count || null, stars: s.rating, notes: s.notes || null, source: s.source,
      }).then(reload).catch(() => toast('Não foi possível desfazer.', { tone: 'error' }))
    },
  })
  return true
}
