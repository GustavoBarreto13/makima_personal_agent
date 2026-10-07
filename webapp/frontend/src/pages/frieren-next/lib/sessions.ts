// Excluir uma sessão de leitura com confirmação e "Desfazer". A sessão é apagada de verdade no servidor,
// então o "Desfazer" guarda a linha inteira e a regrava igual (mesmo ID, mesmas páginas, mesma nota).

import { confirm } from '../../../design/headless/confirm'
import { toast } from '../../../design/headless/toast'
import { frierenApi } from '../frierenApi'
import type { Session } from '../types'

export async function deleteSession(s: Session, reload: () => void): Promise<void> {
  const ok = await confirm({
    title: 'Excluir esta sessão?',
    body: `${s.title} · ${s.pages} ${s.pages === 1 ? 'página' : 'páginas'} em ${s.date.split('-').reverse().join('/')}.`,
    confirmLabel: 'Excluir',
    danger: true,
  })
  if (!ok) return
  try {
    await frierenApi.deleteSession(s.bookId, s.id)
  } catch {
    toast('Não foi possível excluir a sessão.', { tone: 'error' })
    return
  }
  reload()
  toast('Sessão excluída', {
    undo: () => {
      frierenApi
        .restoreSession(s.bookId, {
          id: s.id, date: s.date, page_start: s.page - s.pages, page_end: s.page, pages_read: s.pages, session_notes: s.note,
        })
        .then(reload)
        .catch(() => toast('Não foi possível desfazer. Registre a sessão de novo.', { tone: 'error' }))
    },
  })
}
