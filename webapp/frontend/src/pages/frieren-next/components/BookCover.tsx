// Capa 2:3 de livro (sem a moldura de card): a imagem do Google Books ou, sem ela, a capa tipográfica do DS
// (gradiente na cor do título + ícone de livro + título). Usada nas prateleiras do Início, no Diário e nos
// seletores. Com `progress`, mostra uma faixa de progresso na base (livro em leitura).

import type { CSSProperties, ReactNode } from 'react'
import { hueFromName, Icon } from '../../../design'
import { cx } from '../../../design/ui/primitives'

export function BookCover({ title, src, badge, small, titleOnCover = true, progress, selected, onOpen, label }: {
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
  /** Destacada como escolhida (seletores). */
  selected?: boolean
  onOpen?: () => void
  /** Rótulo acessível (padrão: o título). */
  label?: string
}) {
  return (
    <button
      type="button"
      className={cx('fr-cover', small && 'fr-cover-sm', selected && 'fr-cover-on')}
      aria-label={label ?? title}
      aria-pressed={selected === undefined ? undefined : selected}
      onClick={onOpen}
      // --ds-ch é o matiz da capa tipográfica do DS: cada título ganha uma cor própria e estável.
      style={{ '--ds-ch': hueFromName(title) } as CSSProperties}
    >
      <span className="ds-cover ds-cover-poster fr-ccover">
        {src
          ? <img className="fr-cimg" src={src} alt="" loading="lazy" decoding="async" />
          : <><Icon name="book" size={small ? 18 : 34} strokeWidth={1.5} />{titleOnCover && !small && <span className="ds-cv-t">{title}</span>}</>}
        {badge && <span className="ds-cv-r">{badge}</span>}
        {progress != null && progress > 0 && (
          // A largura é o próprio dado (porcentagem lida), não um estilo de layout.
          <span className="fr-cprog" aria-hidden="true"><i style={{ width: `${Math.round(progress * 100)}%` }} /></span>
        )}
      </span>
    </button>
  )
}
