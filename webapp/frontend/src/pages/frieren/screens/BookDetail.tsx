// Tela de detalhe de um livro — exibe todas as informações do livro:
// capa, metadados, resenha, estantes e diário de leitura específico deste livro.
// Layout em duas colunas: capa fixa à esquerda, informações scrolláveis à direita.

import type { Book, ActivityEntry, Shelf } from '../types'
import { Icon } from '../ui/Icons'
import { Cover } from '../ui/Cover'
import { Stars } from '../ui/Stars'
import { ProgressBar } from '../ui/ProgressBar'

// Props recebidas da FrierenShell
interface BookDetailProps {
  // ID do livro a exibir
  bookId: string
  books: Book[]
  activity: ActivityEntry[]
  shelves: Shelf[]
  navigate: (view: string, param?: string | null) => void
  openLog: (bookId?: string | null) => void
}

// Formata data ISO em texto legível (ex.: "3 de Mar 2026")
function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
                 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${d.getDate()} de ${MESES[d.getMonth()]} ${d.getFullYear()}`
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

// Componente principal do detalhe do livro
export function BookDetail({ bookId, books, activity, shelves, navigate, openLog }: BookDetailProps) {
  // Busca o livro pelo ID na lista carregada pelo shell
  const book = books.find(b => b.id === bookId)

  // Estado de erro: livro não encontrado (ID inválido ou removido)
  if (!book) {
    return (
      <div className="page">
        <p style={{ marginTop: 40, color: 'var(--ink-3)' }}>Livro não encontrado.</p>
      </div>
    )
  }

  // Filtra as entradas de atividade específicas deste livro (diário do livro)
  const bookActivity = activity.filter(a => a.bookId === book.id)

  // Estantes que contêm este livro — usadas para exibir chips de estante
  const bookShelves = shelves.filter(s => book.shelves.includes(s.id))

  // Rótulo de status legível para o chip no cabeçalho
  const statusLabel: Record<string, string> = {
    reading:  'Lendo agora',
    read:     'Lido',
    owned:    'Quero ler',
    wishlist: 'Wishlist',
  }

  // Cor do chip de status — verde para lendo, dourado para lido, neutro para os demais
  const statusBg = {
    reading:  'var(--teal)',
    read:     'var(--gold-deep)',
    owned:    'var(--card)',
    wishlist: 'var(--card)',
  }[book.status] ?? 'var(--card)'

  return (
    <div className="page">

      {/* ── BOTÃO VOLTAR ── */}
      <button className="detail-back" onClick={() => navigate('catalogo')}>
        <Icon name="arrowLeft" /> Biblioteca
      </button>

      {/* ── LAYOUT DE DUAS COLUNAS ── */}
      {/* Coluna esquerda: capa sticky + ações | Coluna direita: informações scrolláveis */}
      <div className="detail-hero">

        {/* ── COLUNA ESQUERDA: CAPA E AÇÕES ── */}
        <div className="detail-cover-wrap">
          {/* Capa do livro em tamanho maior */}
          <Cover book={book} />

          {/* Barra de progresso — exibida apenas se o livro estiver sendo lido */}
          {book.status === 'reading' && book.progress != null && (
            <div>
              <div className="rc-prog-meta" style={{ marginBottom: 6 }}>
                <span>pág. {book.page} de {book.pages}</span>
                <span>{Math.round(book.progress * 100)}%</span>
              </div>
              <ProgressBar value={book.progress} />
            </div>
          )}

          {/* Botão principal de registro de leitura */}
          <button
            className="btn btn-primary"
            style={{ justifyContent: 'center' }}
            onClick={() => openLog(book.id)}
          >
            <Icon name="plus" /> Registrar leitura
          </button>
        </div>

        {/* ── COLUNA DIREITA: INFORMAÇÕES ── */}
        <div className="detail-info">

          {/* Gênero em fonte mono — destaque sutil acima do título */}
          {book.genre && (
            <div className="detail-genre">{book.genre}</div>
          )}

          {/* Título principal em Newsreader (serif) */}
          <h1 className="detail-title">{book.title}</h1>

          {/* Autor e ano de publicação */}
          <p className="detail-author">
            de <b>{book.author}</b>
            {book.year != null && ` · ${book.year}`}
          </p>

          {/* Linha de avaliação: estrelas + número + chip de status */}
          <div className="detail-rating-row">
            {book.rating != null ? (
              <>
                <Stars value={book.rating} lg />
                <span className="rating-num" style={{ fontSize: 14 }}>
                  {book.rating.toFixed(1)}
                </span>
              </>
            ) : (
              <span style={{
                color: 'var(--ink-3)',
                fontStyle: 'italic',
                fontFamily: 'var(--serif)',
              }}>
                Ainda sem nota
              </span>
            )}

            {/* Chip de status com cor contextual */}
            <span
              className="chip active"
              style={{
                cursor: 'default',
                background: statusBg,
                borderColor: ['owned', 'wishlist'].includes(book.status)
                  ? 'var(--line)'
                  : 'transparent',
                color: ['owned', 'wishlist'].includes(book.status) ? 'var(--ink-2)' : '#fff',
              }}
            >
              {statusLabel[book.status] ?? book.status}
            </span>
          </div>

          {/* Grade de metadados: páginas, publicação, gênero, data de término */}
          <div className="detail-meta-grid">
            {book.pages != null && (
              <div className="dm-cell">
                <div className="k">Páginas</div>
                <div className="v">{book.pages}</div>
              </div>
            )}
            {book.year != null && (
              <div className="dm-cell">
                <div className="k">Publicado</div>
                <div className="v">{book.year}</div>
              </div>
            )}
            {book.genre && (
              <div className="dm-cell">
                <div className="k">Gênero</div>
                <div className="v" style={{ fontSize: 13 }}>{book.genre}</div>
              </div>
            )}
            {book.finished && (
              <div className="dm-cell">
                <div className="k">Terminado</div>
                <div className="v" style={{ fontSize: 13 }}>{fmtDate(book.finished)}</div>
              </div>
            )}
            {book.status === 'reading' && book.progress != null && (
              <div className="dm-cell">
                <div className="k">Progresso</div>
                <div className="v">{Math.round(book.progress * 100)}%</div>
              </div>
            )}
          </div>

          {/* ── RESENHA PESSOAL ── */}
          <div className="detail-section-title">Sua resenha</div>
          {book.review ? (
            // Texto da resenha em itálico e fonte serif
            <p className="detail-review">{book.review}</p>
          ) : (
            // Estado vazio — mensagem contextual por status
            <p className="detail-empty-review">
              {book.status === 'wishlist'
                ? 'Ele te espera na wishlist.'
                : 'Você ainda não escreveu sobre este livro. Registre uma leitura para começar.'}
            </p>
          )}

          {/* ── ESTANTES ── */}
          {/* Só exibe se o livro pertencer a pelo menos uma estante */}
          {bookShelves.length > 0 && (
            <>
              <div className="detail-section-title">Nas estantes</div>
              <div className="chips">
                {bookShelves.map(s => (
                  // Chip clicável navega para a estante correspondente
                  <button
                    key={s.id}
                    className="chip"
                    onClick={() => navigate('estante', s.id)}
                  >
                    {/* Ponto colorido com a cor da estante */}
                    <span style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: s.accent,
                      display: 'inline-block',
                      marginRight: 6,
                    }} />
                    {s.name}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ── DIÁRIO DESTE LIVRO ── */}
          {/* Histórico de sessões de leitura específicas deste livro */}
          {bookActivity.length > 0 && (
            <>
              <div className="detail-section-title">Diário deste livro</div>
              <div className="feed">
                {bookActivity.map(a => (
                  <div key={a.id} className="feed-item" style={{ paddingLeft: 0 }}>
                    {/* Linha vertical lateral indicando sequência do diário */}
                    <div className="feed-body" style={{
                      borderLeft: '2px solid var(--line)',
                      paddingLeft: 16,
                    }}>
                      <div className="feed-line">
                        {/* Texto descritivo por tipo de entrada */}
                        {a.type === 'finished' ? (
                          <b>Terminou o livro</b>
                        ) : a.type === 'started' ? (
                          <b>Começou a ler</b>
                        ) : (
                          <>
                            <b>+{a.pages} páginas</b>
                            {a.page != null && (
                              <span className="verb"> — até a pág. {a.page}</span>
                            )}
                          </>
                        )}
                      </div>

                      {/* Nota pessoal da sessão, se houver */}
                      {a.note && <div className="feed-note">"{a.note}"</div>}

                      <div className="feed-meta">
                        <span>{relDate(a.date)}</span>
                        {/* Estrelas de avaliação se a entrada tiver nota */}
                        {a.rating != null && <Stars value={a.rating} />}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
