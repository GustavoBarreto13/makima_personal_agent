// Pôster 2:3 (sem a moldura de card): a imagem do anime ou, sem ela, a capa tipográfica do DS (gradiente na cor
// do título + ícone + título). Usado nas prateleiras do Início, no Diário, nos seletores e nos Lançamentos.
// Com `progress`, mostra uma faixa de progresso na base (anime em andamento).

import type { CSSProperties, ReactNode } from 'react'
import { hueFromName, Icon } from '../../../design'
import { cx } from '../../../design/ui/primitives'

export function Poster({ title, src, badge, small, titleOnCover = true, progress, selected, onOpen, label }: {
  title: string
  src: string | null
  /** Selo no canto superior direito (ex.: coração). */
  badge?: ReactNode
  /** Miniatura (linhas do Diário): sem o título escrito na capa. */
  small?: boolean
  /** Sem imagem, escreve o título na capa. Desligue quando o título já aparece ao lado/abaixo. */
  titleOnCover?: boolean
  /** 0 a 1: faixa de progresso na base da capa. */
  progress?: number | null
  /** Destacado como escolhido (seletores). */
  selected?: boolean
  onOpen?: () => void
  /** Rótulo acessível (padrão: o título). */
  label?: string
}) {
  return (
    <button
      type="button"
      className={cx('mr-poster', small && 'mr-poster-sm', selected && 'mr-poster-on')}
      aria-label={label ?? title}
      aria-pressed={selected === undefined ? undefined : selected}
      onClick={onOpen}
      // --ds-ch é o matiz da capa tipográfica do DS: cada título ganha uma cor própria e estável.
      style={{ '--ds-ch': hueFromName(title) } as CSSProperties}
    >
      <span className="ds-cover ds-cover-poster mr-pcover">
        {src
          ? <img className="mr-pimg" src={src} alt="" loading="lazy" decoding="async" />
          : <><Icon name="anime" size={small ? 18 : 34} strokeWidth={1.5} />{titleOnCover && !small && <span className="ds-cv-t">{title}</span>}</>}
        {badge && <span className="ds-cv-r">{badge}</span>}
        {progress != null && progress > 0 && (
          // A largura é o próprio dado (porcentagem assistida), não um estilo de layout.
          <span className="mr-pprog" aria-hidden="true"><i style={{ width: `${Math.round(progress * 100)}%` }} /></span>
        )}
      </span>
    </button>
  )
}
