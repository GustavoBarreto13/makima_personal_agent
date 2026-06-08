// Tela de atividade — diário completo de leitura agrupado por data.
// Cada dia com atividade é exibido como um grupo com cabeçalho de data
// e itens de feed para cada entrada de leitura.

import React from 'react'
import type { Book, ActivityEntry } from '../types'
import { Cover } from '../ui/Cover'
import { Stars } from '../ui/Stars'

// Props recebidas da FrierenShell
interface ActivityProps {
  books: Book[]
  activity: ActivityEntry[]
  navigate: (view: string, param?: string | null) => void
}

// Nomes dos meses em português — usados na formatação de datas
const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN',
               'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']

// Formata data ISO em rótulo de dia para o diário (ex.: "HOJE", "3 DE MAR")
function fmtDate(iso: string): string {
  const hoje = new Date().toISOString().slice(0, 10)
  if (iso === hoje) return 'HOJE'
  const d = new Date(iso + 'T00:00:00')
  return `${d.getDate()} DE ${MESES[d.getMonth()]}`
}

// Retorna tempo relativo legível (ex.: "hoje", "ontem", "há 3 dias")
function relDate(iso: string): string {
  const hoje = new Date().toISOString().slice(0, 10)
  if (iso === hoje) return 'hoje'
  const diff = Math.round(
    (new Date(hoje).getTime() - new Date(iso + 'T00:00:00').getTime()) / 86400000
  )
  if (diff === 1) return 'ontem'
  if (diff < 7) return `há ${diff} dias`
  return fmtDate(iso)
}

// Item individual do feed de atividade — exibido em cada grupo de data
function FeedItem({
  a,
  books,
  navigate,
}: {
  a: ActivityEntry
  books: Book[]
  navigate: (view: string, param?: string | null) => void
}) {
  // Busca os dados do livro correspondente à entrada
  const b = books.find(book => book.id === a.bookId)
  if (!b) return null

  return (
    <div className="feed-item">
      {/* Capa clicável — navega para o detalhe do livro */}
      <div
        className="feed-cover"
        onClick={() => navigate('detalhe', b.id)}
        style={{ cursor: 'pointer' }}
      >
        <Cover book={b} />
      </div>

      <div className="feed-body">
        <div className="feed-line">
          {/* Texto descritivo: varia por tipo de entrada */}
          {a.type === 'finished' && (
            <>
              <span className="verb">terminou </span>
              <b
                style={{ cursor: 'pointer' }}
                onClick={() => navigate('detalhe', b.id)}
              >
                {b.title}
              </b>
            </>
          )}
          {a.type === 'started' && (
            <>
              <span className="verb">começou </span>
              <b
                style={{ cursor: 'pointer' }}
                onClick={() => navigate('detalhe', b.id)}
              >
                {b.title}
              </b>
              <span className="verb"> · {b.author}</span>
            </>
          )}
          {a.type === 'progress' && (
            <>
              <span className="verb">leu </span>
              <b
                style={{ cursor: 'pointer' }}
                onClick={() => navigate('detalhe', b.id)}
              >
                {b.title}
              </b>
              {a.pages != null && (
                <span className="verb"> · +{a.pages} páginas</span>
              )}
              {a.page != null && (
                <span className="verb"> · p. {a.page}</span>
              )}
            </>
          )}
          {a.type === 'review' && (
            <>
              <span className="verb">resenhou </span>
              <b
                style={{ cursor: 'pointer' }}
                onClick={() => navigate('detalhe', b.id)}
              >
                {b.title}
              </b>
            </>
          )}
        </div>

        {/* Nota da sessão de leitura, se houver */}
        {a.note && <div className="feed-note">"{a.note}"</div>}

        <div className="feed-meta">
          <span>{relDate(a.date)}</span>

          {/* Badge contextual por tipo de atividade */}
          {a.type === 'finished' && (
            <span className="feed-tag done">terminado</span>
          )}
          {a.type === 'started' && (
            <span className="feed-tag">novo</span>
          )}
          {a.type === 'progress' && a.page != null && (
            <span>até a pág. {a.page}</span>
          )}

          {/* Estrelas de avaliação se a entrada tiver nota */}
          {a.rating != null && <Stars value={a.rating} />}
        </div>
      </div>
    </div>
  )
}

// Componente principal da tela de atividade
export function Activity({ books, activity, navigate }: ActivityProps) {
  // Agrupa as entradas de atividade por data
  // Usa um Record para agrupar e depois ordena as datas do mais recente ao mais antigo
  const grouped: Record<string, ActivityEntry[]> = {}
  activity.forEach(e => {
    if (!grouped[e.date]) grouped[e.date] = []
    grouped[e.date].push(e)
  })

  // Ordena as datas em ordem decrescente (mais recente primeiro)
  const dates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  return (
    <div className="page">

      {/* ── CABEÇALHO ── */}
      <div className="section-head" style={{ marginTop: 32 }}>
        <h2 className="section-title" style={{ fontSize: 28 }}>Diário de leitura</h2>
        <span className="section-sub">cada página conta</span>
      </div>

      {/* Estado vazio — quando não há nenhuma atividade registrada */}
      {dates.length === 0 && (
        <p style={{
          color: 'var(--ink-3)',
          fontStyle: 'italic',
          fontFamily: 'var(--serif)',
          marginTop: 40,
          textAlign: 'center',
        }}>
          Nenhuma atividade registrada ainda.
        </p>
      )}

      {/* ── GRUPOS POR DATA ── */}
      {/* Cada data com atividade forma um grupo com cabeçalho e feed de itens */}
      {dates.map(date => (
        <div key={date}>
          {/* Rótulo da data: "HOJE", "3 DE MAR", etc. */}
          <div className="act-day-label">
            {relDate(date)} · {fmtDate(date)}
          </div>

          {/* Feed de itens de atividade para esta data */}
          <div className="feed">
            {grouped[date].map(a => (
              <FeedItem key={a.id} a={a} books={books} navigate={navigate} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
