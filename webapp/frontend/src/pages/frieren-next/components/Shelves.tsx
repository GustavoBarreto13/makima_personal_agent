// Prateleiras de capas do Início: Favoritos (vitrine de até 4), Lidos recentemente e Lendo agora.

import { Button, Icon, SectionHeader, Stars } from '../../../design'
import { useFrieren } from '../context'
import type { FavoriteBook, HomeData } from '../types'
import { BookCover } from './BookCover'

export function FavoriteShelf({ favorites, onPick }: { favorites: FavoriteBook[]; onPick: () => void }) {
  const frieren = useFrieren()
  return (
    <section aria-labelledby="fr-fav">
      <SectionHeader title="Livros favoritos" id="fr-fav" action={<Button variant="ghost" size="sm" icon="edit" onClick={onPick}>{favorites.length ? 'Editar' : 'Escolher'}</Button>} />
      <div className="fr-shelf-grid">
        {favorites.slice(0, 4).map((f) => (
          <BookCover key={f.id} title={f.title} src={f.cover_url} onOpen={() => frieren.goto({ view: 'catalog', bookId: f.id })} />
        ))}
        {favorites.length === 0 && (
          <button type="button" className="fr-fav-add" onClick={onPick}><Icon name="add" size={20} /><span>Escolher favoritos</span></button>
        )}
      </div>
    </section>
  )
}

/** Os 4 livros terminados por último, com a nota e as marcas (coração, resenha). */
export function RecentShelf({ books }: { books: HomeData['recent_finished'] }) {
  const frieren = useFrieren()
  return (
    <section aria-labelledby="fr-rec">
      <SectionHeader title="Lidos recentemente" id="fr-rec" action={<Button variant="ghost" size="sm" iconRight="right" onClick={() => frieren.goto('reviews')}>Resenhas</Button>} />
      {books.length === 0
        ? <p className="ds-hint">Nenhum livro terminado ainda. O primeiro "terminei" aparece aqui.</p>
        : (
          <div className="fr-shelf-grid">
            {books.slice(0, 4).map((b) => (
              <div key={b.id} className="fr-act">
                <BookCover title={b.title} src={b.cover_url} onOpen={() => frieren.goto({ view: 'catalog', bookId: b.id })} />
                <div className="fr-marks">
                  {b.rating ? <Stars value={b.rating} /> : <span className="ds-mono">sem nota</span>}
                  {b.liked && <Icon name="heart" size={13} label="Curti" />}
                  {b.has_review && <Icon name="review" size={13} label="Com resenha" />}
                </div>
              </div>
            ))}
          </div>
        )}
    </section>
  )
}

/** Faixa "Lendo agora": capa com a faixa de progresso, página e o atalho de registrar (o antigo NowBar). */
export function ReadingStrip({ reading }: { reading: HomeData['reading'] }) {
  const frieren = useFrieren()
  if (reading.length === 0) return null
  return (
    <section aria-labelledby="fr-now">
      <SectionHeader title="Lendo agora" id="fr-now" action={<Button variant="ghost" size="sm" iconRight="right" onClick={() => frieren.goto('catalog')}>Biblioteca</Button>} />
      <div className="fr-strip">
        {reading.map((b) => {
          const progress = b.total_pages ? Math.min(1, b.current_page / b.total_pages) : null
          return (
            <div key={b.id} className="fr-now">
              <BookCover title={b.title} src={b.cover_url} titleOnCover={false} progress={progress} onOpen={() => frieren.goto({ view: 'catalog', bookId: b.id })} />
              <b className="fr-now-t">{b.title}</b>
              <span className="fr-now-s">
                {b.total_pages ? `p. ${b.current_page} de ${b.total_pages}` : b.current_page ? `p. ${b.current_page}` : 'ainda sem registro'}
                {progress !== null && ` · ${Math.round(progress * 100)}%`}
              </span>
              <Button size="sm" icon="add" onClick={() => frieren.openLog({ bookId: b.id })}>Registrar</Button>
            </div>
          )
        })}
      </div>
    </section>
  )
}
