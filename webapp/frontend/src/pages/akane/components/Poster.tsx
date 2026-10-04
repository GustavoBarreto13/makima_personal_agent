// Pôster retangular 2:3 (sem a moldura de card): imagem do TMDB ou, sem ela, a capa tipográfica do DS
// (gradiente na cor do título + ícone + título). Usado nas prateleiras do Início e nas linhas do Diário.

import type { CSSProperties, ReactNode } from 'react'
import { hueFromName, Icon } from '../../../design'
import { cx } from '../../../design/ui/primitives'

export function Poster({ title, src, badge, small, titleOnCover = true, onOpen }: {
  title: string
  src: string | null
  /** Selo no canto superior direito (ex.: coração). */
  badge?: ReactNode
  /** Miniatura (linhas do Diário): sem o título escrito na capa. */
  small?: boolean
  /** Sem imagem, escreve o título na capa. Desligue quando o título já aparece ao lado/abaixo. */
  titleOnCover?: boolean
  onOpen?: () => void
}) {
  return (
    <button type="button" className={cx('ax-poster', small && 'ax-poster-sm')} aria-label={title} onClick={onOpen} style={{ '--ds-ch': hueFromName(title) } as CSSProperties}>
      <span className="ds-cover ds-cover-poster ax-pcover">
        {src
          ? <img className="ax-pimg" src={src} alt="" loading="lazy" decoding="async" />
          : <><Icon name="movie" size={small ? 18 : 34} strokeWidth={1.5} />{titleOnCover && !small && <span className="ds-cv-t">{title}</span>}</>}
        {badge && <span className="ds-cv-r">{badge}</span>}
      </span>
    </button>
  )
}
