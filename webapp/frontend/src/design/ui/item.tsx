// Itens e páginas de detalhe: Img, MediaCard, ListRow, Timeline, Tabs, DetailPage.
// MediaCard serve livro, filme, anime, série, treino…: capa com proporção fixa e, sem imagem,
// capa tipográfica (gradiente + ícone do domínio).

import { useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { Icon } from './Icon'
import type { IconName } from './icons'
import { Stars } from './rating'
import { cx, StatusChip, type Status } from './primitives'

// ── Img ──────────────────────────────────────────────────────────────────────

export interface ImgProps {
  src?: string | null
  alt?: string
  /** Proporção reservada (sem pulo de layout). */
  ratio?: 'poster' | 'still' | 'square'
  /** Mostrado sem imagem ou se ela falhar. */
  fallback?: ReactNode
  className?: string
  style?: CSSProperties
}

export function Img({ src, alt = '', ratio, fallback, className, style }: ImgProps) {
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const showFallback = !src || state === 'error'
  return (
    <div className={cx('ds-img', ratio && `ds-ratio-${ratio}`, className)} style={style}>
      {showFallback ? fallback : (
        <img
          src={src ?? undefined}
          alt={alt}
          loading="lazy"
          decoding="async"
          data-loaded={state === 'ok'}
          onLoad={() => setState('ok')}
          onError={() => setState('error')}
        />
      )}
    </div>
  )
}

// ── MediaCard ────────────────────────────────────────────────────────────────

export interface MediaCardProps {
  title: string
  /** Linha mono pequena (ex.: "Força · Smart Fit"). */
  subtitle?: string
  image?: string | null
  /** Ícone do domínio na capa tipográfica. */
  icon: IconName
  /** Matiz da capa tipográfica. */
  hue: number
  rating?: number | null
  status?: Status
  /** Selo no canto superior direito (ex.: PR). */
  badge?: ReactNode
  /** Linha de baixo, à esquerda e à direita. */
  meta?: ReactNode
  metaRight?: ReactNode
  /** Índice, para a entrada escalonada. */
  index?: number
  onOpen?: () => void
}

export function MediaCard({ title, subtitle, image, icon, hue, rating, status, badge, meta, metaRight, index = 0, onOpen }: MediaCardProps) {
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.() } }
  return (
    <article
      className="ds-mcard"
      tabIndex={0}
      role="button"
      aria-label={title}
      style={{ '--ds-i': Math.min(index, 10), '--ds-ch': hue } as CSSProperties}
      onClick={onOpen}
      onKeyDown={onKey}
    >
      <div className="ds-cover">
        {image ? <img src={image} alt="" loading="lazy" decoding="async" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icon name={icon} size={38} strokeWidth={1.5} />}
        {status && <span className="ds-cv-l"><StatusChip status={status} /></span>}
        {badge && <span className="ds-cv-r">{badge}</span>}
      </div>
      <div className="ds-mc-b">
        <h3>{title}</h3>
        {subtitle && <span className="ds-mono">{subtitle}</span>}
        {(rating !== undefined || metaRight) && (
          <div className="ds-mc-m">{rating !== undefined ? <Stars value={rating} /> : <span />}{metaRight}</div>
        )}
        {meta && <div className="ds-mc-m">{meta}</div>}
      </div>
    </article>
  )
}

// ── ListRow ──────────────────────────────────────────────────────────────────

export interface ListRowProps {
  title: string
  meta?: string
  icon: IconName
  hue: number
  rating?: number | null
  trailing?: ReactNode
  onOpen?: () => void
}

export function ListRow({ title, meta, icon, hue, rating, trailing, onOpen }: ListRowProps) {
  return (
    <button type="button" className="ds-lrow" style={{ '--ds-ch': hue } as CSSProperties} onClick={onOpen}>
      <span className="ds-lead"><Icon name={icon} size={18} /></span>
      <span className="ds-t"><b>{title}</b>{meta && <span>{meta}</span>}</span>
      {trailing}
      {rating !== undefined && <Stars value={rating} />}
      <Icon name="right" size={16} />
    </button>
  )
}

/** Linha estática (não clicável) de rótulo/valor, para listas de exercícios, parciais, etc. */
export function InfoRow({ title, detail, value }: { title: string; detail?: string; value?: string }) {
  return (
    <div className="ds-lrow" style={{ cursor: 'default' }}>
      <span className="ds-t"><b>{title}</b>{detail && <span>{detail}</span>}</span>
      {value && <span className="ds-num" style={{ fontWeight: 600 }}>{value}</span>}
    </div>
  )
}

// ── Timeline ─────────────────────────────────────────────────────────────────

export interface TimelineEntry {
  title: string
  detail?: string
}

export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <div className="ds-tl" role="list">
      {entries.map((e, i) => (
        <div key={i} className="ds-tli" role="listitem">
          <div><b>{e.title}</b>{e.detail && <><br /><span>{e.detail}</span></>}</div>
        </div>
      ))}
    </div>
  )
}

// ── Tabs (roving tabindex, setas) ────────────────────────────────────────────

export interface TabDef {
  id: string
  label: string
}

export function Tabs({ tabs, value, onChange, label }: { tabs: TabDef[]; value: string; onChange: (id: string) => void; label: string }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const i = tabs.findIndex((t) => t.id === value)
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
    onChange(tabs[n].id)
    refs.current[tabs[n].id]?.focus()
  }
  return (
    <div className="ds-tabs" role="tablist" aria-label={label} onKeyDown={onKey}>
      {tabs.map((t) => (
        <button
          key={t.id}
          ref={(el) => { refs.current[t.id] = el }}
          type="button"
          role="tab"
          id={`ds-tab-${t.id}`}
          aria-selected={t.id === value}
          aria-controls={`ds-panel-${t.id}`}
          tabIndex={t.id === value ? 0 : -1}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ── DetailPage ───────────────────────────────────────────────────────────────

export interface DetailTab extends TabDef {
  content: ReactNode
}

export interface DetailPageProps {
  /** Rótulo do voltar, ex.: "Treinos". Volta preservando os filtros da lista de origem. */
  backLabel: string
  onBack: () => void
  title: string
  subtitle?: ReactNode
  /** Chips de status/tipo acima do título. */
  chips?: ReactNode
  rating?: number | null
  image?: string | null
  icon: IconName
  hue: number
  /** Ação primária + secundárias (editar, menu ⋯). */
  actions?: ReactNode
  tabs: DetailTab[]
  tab?: string
  onTab?: (id: string) => void
}

export function DetailPage({ backLabel, onBack, title, subtitle, chips, rating, image, icon, hue, actions, tabs, tab, onTab }: DetailPageProps) {
  const [inner, setInner] = useState(tabs[0]?.id ?? '')
  const current = tab ?? inner
  const set = (id: string) => { setInner(id); onTab?.(id) }
  const active = tabs.find((t) => t.id === current) ?? tabs[0]
  return (
    <>
      <div>
        <button type="button" className="ds-back-l" onClick={onBack}><Icon name="left" size={16} /> {backLabel}</button>
      </div>
      <section className="ds-glass ds-dhead" style={{ '--ds-ch': hue } as CSSProperties}>
        <div className="ds-dcover">{image ? <img src={image} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} /> : <Icon name={icon} size={44} strokeWidth={1.4} />}</div>
        <div className="ds-dh-b">
          {chips && <div className="ds-inline">{chips}</div>}
          <h2>{title}</h2>
          {rating !== undefined && (
            <div className="ds-inline"><Stars value={rating} lg /><span className="ds-mono">{rating ? `${snapLabel(rating)} / 5` : 'sem nota'}</span></div>
          )}
          {subtitle && <p style={{ color: 'var(--ds-ink-3)' }}>{subtitle}</p>}
          {actions && <div className="ds-dh-act">{actions}</div>}
        </div>
      </section>
      <Tabs tabs={tabs} value={active.id} onChange={set} label={`Seções de ${title}`} />
      <div role="tabpanel" id={`ds-panel-${active.id}`} aria-labelledby={`ds-tab-${active.id}`} className="ds-stack" style={{ gap: 20 }}>
        {active.content}
      </div>
    </>
  )
}

const snapLabel = (v: number): string => (Math.round(v * 2) / 2).toFixed(1)
