// Campo de escrita do diário: cresce com o texto e sugere enquanto você digita.
//   @na          → pessoas da Komi (por nome ou apelido); sem ninguém, oferece cadastrar
//   /            → os agentes que dá para citar (Kaguya, Akane, Frieren, Marin, Mai, Yato)
//   /akane Matr  → filmes da Akane; escolher vira [Matrix](akane:movie:<id>)
// Setas/Enter/Tab escolhem, Esc fecha. No celular a lista fica presa acima do teclado (CSS .vl-suggest).
// `value`/`onChange` são o texto guardado (com tokens); o campo mostra o texto de exibição — só "Carla" e
// "Matrix", com o fundo de chip pintado por um espelho atrás do textarea. Backspace/Delete colado no chip
// apaga o chip inteiro; editar no meio dele o transforma em texto comum.
// A detecção do gatilho é a do design (core/markdown: findMention/splitSlashQuery); a busca é da Violet.

import { Fragment, forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { Avatar, Icon, toast, type IconName } from '../../../design'
import { applyMention, findMention, splitSlashQuery, type MentionMatch } from '../../../design/core/markdown'
import { editDisplay, fromDisplay, personToken, spliceDisplay, toDisplay, type Display } from '../lib/markup'
import { createPerson, searchPeople } from '../lib/people'
import { AGENT_META, matchAgent, refIcon } from '../lib/refs'
import { violetApi } from '../violetApi'
import type { RefProvider } from '../types'

interface Item {
  key: string
  label: string
  hint?: string
  icon?: IconName
  avatar?: { name: string; src?: string | null }
  cover?: string | null
  /** O que entra no lugar do gatilho + texto digitado. */
  insert: () => Promise<string> | string
}

interface Open { match: MentionMatch; items: Item[]; index: number; title: string; empty?: string }

export interface SmartTextareaHandle {
  /** Foca o campo: ``true`` (padrão) põe o cursor no fim; um número põe o cursor nessa posição. */
  focus: (at?: boolean | number) => void
  /** Insere texto no cursor (botões @ e / da barra de escrita) e reabre as sugestões. */
  insert: (text: string) => void
  el: HTMLTextAreaElement | null
}

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> & {
  value: string
  onChange: (value: string) => void
  /** Chamado depois que as sugestões já tiveram a chance de usar a tecla. */
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void
  /** Só pessoas (ex.: cartas não citam outros agentes? citam — mas campos curtos podem desligar). */
  triggers?: ('@' | '/')[]
}

let providersCache: RefProvider[] | null = null
async function providers(): Promise<RefProvider[]> {
  if (!providersCache) providersCache = await violetApi.refProviders().catch(() => [])
  return providersCache ?? []
}

export const SmartTextarea = forwardRef<SmartTextareaHandle, Props>(function SmartTextarea(
  { value, onChange, onKeyDown, triggers = ['@', '/'], className, ...rest }, ref,
) {
  const area = useRef<HTMLTextAreaElement>(null)
  const pendingSel = useRef<number | null>(null)
  const [open, setOpen] = useState<Open | null>(null)
  const seq = useRef(0)

  // Texto de exibição derivado do guardado; só é refeito quando o `value` vem de fora (não do que emitimos).
  const disp = useRef<{ raw: string; d: Display }>({ raw: value, d: toDisplay(value) })
  if (disp.current.raw !== value) disp.current = { raw: value, d: toDisplay(value) }
  const shown = disp.current.d
  const emit = useCallback((d: Display) => {
    const raw = fromDisplay(d)
    disp.current = { raw, d }
    onChange(raw)
  }, [onChange])

  // Cresce com o conteúdo (encolhe ao apagar).
  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [shown.text])

  useEffect(() => {
    if (pendingSel.current !== null && area.current) {
      area.current.setSelectionRange(pendingSel.current, pendingSel.current)
      pendingSel.current = null
    }
  })

  const detect = useCallback((text: string, caret: number) => {
    const match = findMention(text, caret, triggers)
    const my = ++seq.current
    if (!match) { setOpen(null); return }
    const show = (o: Omit<Open, 'match' | 'index'> | null) => { if (my === seq.current) setOpen(o && { ...o, match, index: 0 }) }

    if (match.trigger === '@') {
      const q = match.query
      window.setTimeout(() => {
        if (my !== seq.current) return
        searchPeople(q).then((people) => {
          const items: Item[] = people.slice(0, 6).map((p) => ({
            key: p.id, label: p.name, hint: p.hint, avatar: { name: p.name, src: p.avatar ?? null },
            insert: () => `${personToken(p.name, p.id)} `,
          }))
          const exact = people.some((p) => p.name.toLowerCase() === q.toLowerCase())
          if (q.length >= 2 && !exact) {
            const name = q.replace(/[_.]/g, ' ')
            items.push({
              key: 'create', label: `Cadastrar “${name}” na Komi`, icon: 'add',
              insert: async () => {
                const p = await createPerson(name)
                toast(`${p.name} entrou na Komi.`, { tone: 'success' })
                return `${personToken(p.name, p.id)} `
              },
            })
          }
          show({ title: 'Pessoas', items, empty: 'Ninguém com esse nome na Komi' })
        }).catch(() => show(null))
      }, q ? 120 : 0)
      return
    }

    // "/": escolhendo o agente, ou buscando nele.
    const { agent, term, choosing } = splitSlashQuery(match.query)
    providers().then((list) => {
      if (my !== seq.current) return
      if (choosing) {
        const a = agent.toLowerCase()
        const items: Item[] = list
          .filter((p) => !a || p.key.startsWith(a) || p.aliases.some((x) => x.startsWith(a)))
          .map((p) => ({
            key: p.key, label: `/${p.aliases.includes('k') && p.key === 'kaguya' ? 'k' : p.key}`, hint: `${p.label} · ${p.hint}`,
            icon: AGENT_META[p.key]?.icon ?? 'link', insert: () => `/${p.key === 'kaguya' ? 'k' : p.key} `,
          }))
        show(items.length ? { title: 'Citar de outro agente', items } : null)
        return
      }
      const key = matchAgent(agent, list)
      if (!key) { show(null); return }
      if (!term.trim()) { show({ title: AGENT_META[key]?.label ?? key, items: [], empty: `Digite o nome — ${AGENT_META[key]?.hint ?? ''}` }); return }
      window.setTimeout(() => {
        if (my !== seq.current) return
        violetApi.refSearch(key, term.trim()).then((r) => {
          const items: Item[] = r.results.map((x) => ({
            key: `${x.entity_type}:${x.entity_id}`, label: x.label, hint: x.sublabel ?? undefined, cover: x.cover_url,
            icon: refIcon(x.agent, x.entity_type), insert: () => `${x.token} `,
          }))
          show({ title: AGENT_META[key]?.label ?? key, items, empty: `Nada com “${term.trim()}” na ${AGENT_META[key]?.label ?? key}` })
        }).catch(() => show(null))
      }, 180)
    })
  }, [triggers])

  const pick = useCallback(async (item: Item) => {
    if (!open || !area.current) return
    const caret = area.current.selectionStart
    const match = open.match
    setOpen(null)
    let text: string
    try { text = await item.insert() } catch { toast('Não consegui cadastrar agora.', { tone: 'error' }); return }
    const ins = toDisplay(text)
    const cur = disp.current.d
    const next = spliceDisplay(cur, match.start, Math.max(caret, match.start), ins)
    const pos = applyMention(cur.text, match, caret, ins.text).start
    pendingSel.current = pos
    emit(next)
    // Escolher o agente ("/akane ") já abre a busca dele.
    if (text.startsWith('/')) window.setTimeout(() => detect(next.text, pos), 0)
    area.current.focus()
  }, [open, emit, detect])

  useImperativeHandle(ref, () => ({
    el: area.current,
    focus: (at = true) => {
      const el = area.current
      if (!el) return
      el.focus()
      const pos = typeof at === 'number' ? Math.max(0, Math.min(at, el.value.length)) : at ? el.value.length : null
      if (pos !== null) el.setSelectionRange(pos, pos)
    },
    insert: (text: string) => {
      const el = area.current
      if (!el) return
      const cur = disp.current.d
      const s = el.selectionStart ?? cur.text.length, e = el.selectionEnd ?? cur.text.length
      // O gatilho só vale no começo de palavra: põe um espaço antes se precisar.
      const before = cur.text.slice(0, s)
      const lead = before && !/\s$/.test(before) ? ' ' : ''
      const next = spliceDisplay(cur, s, e, { text: lead + text, tokens: [] })
      const caret = s + lead.length + text.length
      pendingSel.current = caret
      emit(next)
      el.focus()
      window.setTimeout(() => detect(next.text, caret), 0)
    },
  }), [emit, detect])

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (open && open.items.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setOpen({ ...open, index: (open.index + (e.key === 'ArrowDown' ? 1 : -1) + open.items.length) % open.items.length })
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); void pick(open.items[open.index]); return }
    }
    if (open && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(null); return }
    // Backspace logo depois de um chip (ou Delete logo antes) apaga o chip inteiro.
    if ((e.key === 'Backspace' || e.key === 'Delete') && !e.altKey && !e.ctrlKey && !e.metaKey) {
      const el = e.currentTarget
      const at = el.selectionStart
      const cur = disp.current.d
      const t = at === el.selectionEnd && cur.tokens.find((x) => (e.key === 'Backspace' ? x.end === at : x.start === at))
      if (t) {
        e.preventDefault()
        pendingSel.current = t.start
        const next = spliceDisplay(cur, t.start, t.end, { text: '', tokens: [] })
        emit(next)
        detect(next.text, t.start)
        return
      }
    }
    onKeyDown?.(e)
  }

  return (
    <div className="vl-smart">
      {shown.tokens.length > 0 && (
        <div className={`${className ?? ''} vl-smart-mirror`} aria-hidden="true">
          {mirror(shown)}
        </div>
      )}
      <textarea
        ref={area}
        rows={1}
        className={className}
        value={shown.text}
        onChange={(e) => {
          const caret = e.target.selectionStart
          const next = editDisplay(disp.current.d, e.target.value, caret)
          emit(next)
          detect(next.text, caret)
        }}
        onClick={(e) => detect(e.currentTarget.value, e.currentTarget.selectionStart)}
        onKeyDown={onKey}
        aria-autocomplete="list"
        aria-expanded={!!open}
        {...rest}
        onBlur={(e) => { window.setTimeout(() => setOpen(null), 120); rest.onBlur?.(e) }}
      />
      {open && (
        <div className="vl-suggest" role="listbox" aria-label={open.title}>
          <div className="vl-suggest-title">{open.title}</div>
          {open.items.length === 0 && open.empty && <div className="vl-suggest-empty">{open.empty}</div>}
          {open.items.map((it, i) => (
            <button
              key={it.key}
              type="button"
              role="option"
              aria-selected={i === open.index}
              className={i === open.index ? 'vl-suggest-item vl-on' : 'vl-suggest-item'}
              onMouseDown={(e) => { e.preventDefault(); void pick(it) }}
            >
              {it.avatar ? <Avatar name={it.avatar.name} src={it.avatar.src} size={26} />
                : it.cover ? <img className="vl-suggest-cover" src={it.cover} alt="" loading="lazy" />
                : <span className="vl-suggest-icon"><Icon name={it.icon ?? 'link'} size={15} /></span>}
              <span className="vl-suggest-text"><b>{it.label}</b>{it.hint && <small>{it.hint}</small>}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
})

/** O espelho: o mesmo texto, com os trechos de token marcados (só o fundo aparece). */
function mirror(d: Display) {
  const out: ReactNode[] = []
  let at = 0
  for (const t of d.tokens) {
    if (t.start > at) out.push(<Fragment key={`t${at}`}>{d.text.slice(at, t.start)}</Fragment>)
    out.push(<mark key={`k${t.start}`} className="vl-smart-chip" data-kind={t.kind}>{d.text.slice(t.start, t.end)}</mark>)
    at = t.end
  }
  // Uma quebra de linha no fim precisa de algo depois para ocupar a linha.
  out.push(<Fragment key="end">{d.text.slice(at)}{d.text.endsWith('\n') ? ' ' : ''}</Fragment>)
  return out
}
