// Prateleiras de pôsteres do Início: Favoritos, Atividade recente e Quero ver em destaque.

import { Button, Icon, SectionHeader, Stars } from '../../../design'
import { fmtDuration } from '../../../design/core/format'
import { useAkane } from '../context'
import type { DiaryEntry, FavoriteFilm, HomeData } from '../types'
import { Poster } from './Poster'

export function FavoriteShelf({ favorites, onPick }: { favorites: FavoriteFilm[]; onPick: () => void }) {
  const akane = useAkane()
  return (
    <section aria-labelledby="ax-fav">
      <SectionHeader title="Filmes favoritos" id="ax-fav" action={<Button variant="ghost" size="sm" icon="edit" onClick={onPick}>{favorites.length ? 'Editar' : 'Escolher'}</Button>} />
      <div className="ax-fav-grid">
        {favorites.slice(0, 4).map((f) => (
          <Poster key={f.id} title={f.title} src={f.poster_url} onOpen={() => akane.goto({ view: 'films', movieId: f.id })} />
        ))}
        {favorites.length === 0 && (
          <button type="button" className="ax-fav-add" onClick={onPick}><Icon name="add" size={20} /><span>Escolher favoritos</span></button>
        )}
      </div>
    </section>
  )
}

/** As 4 sessões mais recentes, em pôsteres com a nota e as marcas (coração, revisão, resenha). */
export function RecentShelf({ entries }: { entries: DiaryEntry[] }) {
  const akane = useAkane()
  return (
    <section aria-labelledby="ax-rec">
      <SectionHeader title="Atividade recente" id="ax-rec" action={<Button variant="ghost" size="sm" iconRight="right" onClick={() => akane.goto('diary')}>Tudo</Button>} />
      {entries.length === 0
        ? <p className="ds-hint">Nenhuma sessão ainda.</p>
        : (
          <div className="ax-fav-grid">
            {entries.slice(0, 4).map((e) => (
              <div key={e.id} className="ax-act">
                <Poster title={e.movie_title ?? 'Filme'} src={e.poster_url} onOpen={() => akane.goto({ view: 'films', movieId: e.movie_id })} />
                <div className="ax-marks">
                  {e.rating ? <Stars value={e.rating} /> : <span className="ds-mono">sem nota</span>}
                  {e.liked && <Icon name="heart" size={13} label="Curtido" />}
                  {e.rewatch && <Icon name="rewatch" size={13} label="Revisão" />}
                  {e.review && <Icon name="journal" size={13} label="Com resenha" />}
                </div>
              </div>
            ))}
          </div>
        )}
    </section>
  )
}

/** Faixa horizontal com o que está esperando no Quero ver. */
export function WatchlistStrip({ items }: { items: HomeData['watchlist_highlight'] }) {
  const akane = useAkane()
  if (items.length === 0) return null
  return (
    <section aria-labelledby="ax-want">
      <SectionHeader title="Esperando no Quero ver" id="ax-want" action={<Button variant="ghost" size="sm" iconRight="right" onClick={() => akane.goto('watchlist')}>Ver tudo</Button>} />
      <div className="ax-strip">
        {items.map((m) => (
          <div key={m.id} className="ax-want">
            <Poster title={m.title} src={m.poster_url} titleOnCover={false} onOpen={() => akane.goto({ view: 'films', movieId: m.id })} />
            <b className="ax-want-t">{m.title}</b>
            <span className="ax-want-s">{[m.director?.[0], m.runtime ? fmtDuration(m.runtime) : null].filter(Boolean).join(' · ')}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
