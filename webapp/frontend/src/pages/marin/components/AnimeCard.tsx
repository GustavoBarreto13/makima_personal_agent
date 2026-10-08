// Card (grade) e linha (lista) de anime: pôster, título, estúdio, nota, coração e o progresso de quem está assistindo.

import { hueFromName, Icon, MediaCard, ProgressBar, StatusChip } from '../../../design'
import { useMarin } from '../context'
import { STATUS } from '../lib/status'
import type { Anime } from '../types'

/** "MAPPA · Inverno 2024" (o que houver). */
export const byline = (a: Anime): string => [a.studio, a.season].filter(Boolean).join(' · ')

/** "12/28" ou "12" quando o total é desconhecido. */
export const progressText = (a: Anime): string => (a.total ? `${a.watched}/${a.total}` : `${a.watched}`)

export function AnimeCard({ anime, index, showStatus = true }: { anime: Anime; index?: number; showStatus?: boolean }) {
  const marin = useMarin()
  const tone = STATUS[anime.status].tone
  const inProgress = anime.status === 'assistindo' || anime.status === 'pausado'
  return (
    <MediaCard
      title={anime.title}
      subtitle={byline(anime) || undefined}
      image={anime.poster}
      icon="anime"
      hue={hueFromName(anime.title)}
      // Estrelas só quando há nota (a nota do anime é opcional em qualquer estado).
      rating={anime.rating ?? undefined}
      cover="poster"
      status={showStatus && tone && tone !== 'done' ? tone : undefined}
      badge={anime.liked ? <Icon name="heart" size={14} label="Curti" /> : undefined}
      // Faixa de progresso + "11/28" na mesma linha (cabe até na grade compacta do celular, mesmo com estrelas acima).
      meta={inProgress && anime.watched > 0 ? (
        <span className="mr-meta-prog">
          {anime.progress !== null && <ProgressBar value={anime.progress * 100} label={`${Math.round(anime.progress * 100)}% assistido`} />}
          <span className="ds-mono" title="Episódios assistidos">{progressText(anime)}</span>
        </span>
      ) : undefined}
      index={index}
      onOpen={() => marin.goto({ view: 'catalog', animeId: anime.id })}
    />
  )
}

/** Linha da lista (modo "lista" do Catálogo). */
export function AnimeRow({ anime }: { anime: Anime }) {
  const marin = useMarin()
  const tone = STATUS[anime.status].tone
  const meta = [byline(anime), anime.total ? `${anime.total} eps` : null].filter(Boolean).join(' · ')
  return (
    <button type="button" className="ds-lrow" onClick={() => marin.goto({ view: 'catalog', animeId: anime.id })}>
      <span className="ds-lead"><Icon name={STATUS[anime.status].icon} size={18} /></span>
      <span className="ds-t"><b>{anime.title}</b>{meta && <span>{meta}</span>}</span>
      {tone && tone !== 'done' && <StatusChip status={tone} label={STATUS[anime.status].label} />}
      {anime.status === 'assistindo' && anime.progress !== null && <span className="ds-num">{Math.round(anime.progress * 100)}%</span>}
      {anime.liked && <Icon name="heart" size={14} label="Curti" />}
      {anime.rating ? <span className="ds-num">{anime.rating.toFixed(1)}</span> : null}
      <Icon name="right" size={16} />
    </button>
  )
}
