// Excluir uma sessão do diário com confirmação e "Desfazer" (usado no Diário e no detalhe do filme).

import { confirm } from '../../../design/headless/confirm'
import { toast } from '../../../design/headless/toast'
import { akaneApi } from '../akaneApi'
import type { DiaryEntry } from '../types'

/** Devolve true se excluiu (false = o usuário cancelou ou deu erro). */
export async function deleteSession(e: DiaryEntry, title: string, reload: () => void): Promise<boolean> {
  const day = `${e.watched_date.slice(8)}/${e.watched_date.slice(5, 7)}`
  const ok = await confirm({
    title: 'Excluir esta sessão?',
    body: `A sessão de ${title} em ${day} sai do diário. Você poderá desfazer logo depois.`,
    confirmLabel: 'Excluir',
    danger: true,
  })
  if (!ok) return false
  try {
    await akaneApi.deleteDiary(e.id)
  } catch {
    toast('Não foi possível excluir a sessão.', { tone: 'error' })
    return false
  }
  reload()
  toast('Sessão excluída', {
    undo: () => {
      void akaneApi.logWatch(e.movie_id, {
        watched_date: e.watched_date, rating: e.rating, review: e.review, tags: e.tags, rewatch: e.rewatch,
        companion_ids: e.companions.map((p) => p.id), watch_location_id: e.watch_location?.id ?? null, source: 'manual',
      }).then(reload).catch(() => toast('Não foi possível desfazer.', { tone: 'error' }))
    },
  })
  return true
}
