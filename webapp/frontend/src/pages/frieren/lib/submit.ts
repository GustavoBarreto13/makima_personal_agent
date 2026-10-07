// Grava um rascunho de leitura: registra a sessão (se avançou de página) e, se marcou "terminei", conclui o
// livro. Devolve a mensagem do aviso e um "Desfazer" que volta o livro exatamente ao estado de antes.

import type { FrierenApi, MetadataPatch } from '../frierenApi'
import type { Book } from '../types'
import type { LogDraft } from './log'

type Api = Pick<FrierenApi, 'log' | 'finish' | 'deleteSession' | 'setStatus' | 'updateMetadata'>

export interface SubmitResult {
  message: string
  undo: () => Promise<void>
}

export async function submitLog(d: LogDraft, book: Book, api: Api): Promise<SubmitResult> {
  const advances = d.page !== null && d.page > book.page
  let logId: string | null = null

  // 1) A sessão só existe se houve página nova (o servidor recusa "nenhum progresso").
  if (advances && d.page !== null) {
    const r = await api.log(book.id, {
      current_page: d.page,
      ...(d.note.trim() ? { session_notes: d.note.trim() } : {}),
      log_date: d.date,
    })
    logId = r.log_id
  }

  // 2) Terminou: status "lido", data de término = o dia informado e a nota (se deu).
  if (d.finished) {
    await api.finish(book.id, { date_finished: d.date, ...(d.rating ? { rating: d.rating } : {}) })
  }

  const delta = advances && d.page !== null ? d.page - book.page : 0
  const message = d.finished
    ? `${book.title} terminado — que jornada!`
    : `+${delta} ${delta === 1 ? 'página' : 'páginas'} em ${book.title}`

  // Foto do livro antes da gravação: o "Desfazer" devolve status, datas e nota a estes valores.
  const before = { status: book.status, started: book.started, finished: book.finished, rating: book.rating }

  return {
    message,
    undo: async () => {
      if (logId) await api.deleteSession(book.id, logId)
      // Registrar leitura muda o status para "lendo" e terminar muda para "lido": volta ao de antes.
      if (before.status !== (d.finished ? 'lido' : 'lendo')) await api.setStatus(book.id, before.status)
      const patch: MetadataPatch = {}
      const clear: string[] = []
      // A data de início nasceu nesta gravação? Some junto.
      if (!before.started) clear.push('date_started')
      if (d.finished) {
        if (before.finished) patch.date_finished = before.finished
        else clear.push('date_finished')
        if (d.rating) {
          if (before.rating) patch.rating = before.rating
          else clear.push('rating')
        }
      }
      if (clear.length) patch.clear = clear
      if (Object.keys(patch).length) await api.updateMetadata(book.id, patch)
    },
  }
}
