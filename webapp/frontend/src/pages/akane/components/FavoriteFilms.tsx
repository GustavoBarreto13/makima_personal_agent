// Vitrine "Filmes favoritos" da Home — porte do FavoriteFilms do handoff
// (akane/screens-a.jsx): cabeçalho com régua + link Editar/Concluir; em modo
// edição cada slot ganha × (remover) e, havendo < 4, o slot ＋ Adicionar abre
// o FavPicker. No app real os favoritos persistem via akaneApi.setFavorites
// (não em localStorage como no protótipo).

import { useState } from 'react'
import type { FavoriteFilm } from '../types'
import { Icon } from '../ui/Icon'
import { Poster } from './Poster'
import { FavPicker } from './FavPicker'

interface FavoriteFilmsProps {
  /** Favoritos atuais (vêm do GET /home, já ordenados por posição). */
  favorites: FavoriteFilm[]
  /** Abrir o detalhe de um filme. */
  onSelectMovie: (id: string) => void
  /** Persistir a nova lista de IDs (o chamador chama a API e recarrega). */
  onSave: (ids: string[]) => void
}

/** Vitrine editável de até 4 filmes favoritos. */
export function FavoriteFilms({ favorites, onSelectMovie, onSave }: FavoriteFilmsProps) {
  const [editing, setEditing] = useState(false)
  const [picking, setPicking] = useState(false)

  const favs = favorites.slice(0, 4)
  const ids = favs.map(f => f.id)

  const removeFav = (id: string) => onSave(ids.filter(x => x !== id))
  const addFav = (id: string) => {
    if (!ids.includes(id) && ids.length < 4) onSave([...ids, id])
    setPicking(false)
  }

  return (
    <div className="lb-sec">
      <div className="lb-sec-head">
        <span className="t">Filmes favoritos</span>
        <span className="rule" />
        <span className="lb-sec-link" onClick={() => setEditing(v => !v)}>{editing ? 'Concluir' : 'Editar'}</span>
      </div>
      <div className="fav-grid">
        {favs.map(f => (
          <div key={f.id} className="fav-slot">
            {editing
              ? <>
                  <div className="poster-static">
                    <Poster title={f.title} posterUrl={f.poster_url} palette={f.poster_palette} />
                  </div>
                  <button className="fav-remove" title="Remover" onClick={() => removeFav(f.id)}><Icon name="x" /></button>
                </>
              : <a className="poster-link" onClick={() => onSelectMovie(f.id)}>
                  <Poster title={f.title} posterUrl={f.poster_url} palette={f.poster_palette} />
                </a>}
          </div>
        ))}
        {editing && favs.length < 4 && (
          <button className="fav-add" onClick={() => setPicking(true)}><Icon name="plus" /><span>Adicionar</span></button>
        )}
        {/* Estado vazio fora do modo edição: convite para escolher */}
        {!editing && favs.length === 0 && (
          <button className="fav-add" onClick={() => { setEditing(true); setPicking(true) }}>
            <Icon name="plus" /><span>Escolher favoritos</span>
          </button>
        )}
      </div>
      {picking && (
        <FavPicker exclude={ids} onPick={addFav} onClose={() => setPicking(false)} />
      )}
    </div>
  )
}
