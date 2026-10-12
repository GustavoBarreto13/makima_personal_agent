// Escrever — o coração da Violet. A estrutura do diário antigo continua (data, sonho, Conselho, emoções, cartas,
// momentos) e a escrita é como era: no próprio bullet, sem janela nem barra.
//   • tocar no texto de um momento edita ali mesmo, com o cursor onde você tocou; salva sozinho (e ao sair);
//   • a última linha ("Registrar um momento…") já é um campo: é só tocar e escrever;
//   • Enter cria o próximo momento; apagar tudo + Backspace remove (com Desfazer); Esc sai;
//   • @ sugere pessoas da Komi e / cita filmes, livros, tarefas… de outros agentes (SmartTextarea);
//   • os chips abaixo da lista escolhem o tipo do momento; o Aa do topo troca a fonte do dia na hora;
//   • deslizar para os lados troca de dia (quando não está editando).
// O foco vai para o campo na mesma tarefa do toque (flushSync), senão o teclado do celular não abre.
// Ler um dia não cria nada: a página só nasce no primeiro registro (ensurePage).

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type TouchEvent } from 'react'
import { flushSync } from 'react-dom'
import {
  Button, DatePicker, EmptyState, ErrorState, Hero, Icon, IconButton, LoadingState, Menu, Page, toast, useBreakpoint, useKeyboardInset, type MenuItem,
} from '../../../design'
import { addDaysISO, fmtDateLong, fmtRelative, pluralize } from '../../../design/core/format'
import { CounselCard } from '../components/CounselCard'
import { EmotionCard } from '../components/EmotionCard'
import { EmotionForm } from '../components/EmotionForm'
import { FontMenuButton } from '../components/FontPicker'
import { LetterCard } from '../components/LetterCard'
import { LetterComposer } from '../components/LetterComposer'
import { RichText } from '../components/RichText'
import { SmartTextarea, type SmartTextareaHandle } from '../components/SmartTextarea'
import { TutorModal } from '../components/TutorModal'
import { useViolet } from '../context'
import { caretForEdit } from '../lib/caret'
import { fontClass, KINDS, kindMeta } from '../lib/kinds'
import { wordCount } from '../lib/markup'
import { violetApi } from '../violetApi'
import type { Bullet, BulletKind, EmotionLog, Font, Letter, Page as DayPage, TutorAnalysis } from '../types'

interface Editing { position: number; kind: BulletKind; text: string; id: number | null; original: string }

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const hhmm = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function Write({ date }: { date: string }) {
  const v = useViolet()
  const bp = useBreakpoint()
  const phone = bp === 'sm'
  const kb = useKeyboardInset()

  const [state, setState] = useState<'loading' | 'error' | 'ok'>('loading')
  const [tries, setTries] = useState(0)
  const [page, setPage] = useState<DayPage | null>(null)
  const [bullets, setBullets] = useState<Bullet[]>([])
  const [dream, setDream] = useState('')
  const [editing, setEditing] = useState<Editing | null>(null)
  const [menuFor, setMenuFor] = useState<number | null>(null)
  const [tailKind, setTailKind] = useState<BulletKind>('bullet')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [emotions, setEmotions] = useState<EmotionLog[]>([])
  const [letters, setLetters] = useState<Letter[]>([])
  const [emotionForm, setEmotionForm] = useState<EmotionLog | 'new' | null>(null)
  const [letterForm, setLetterForm] = useState<Letter | 'new' | null>(null)
  const [analysis, setAnalysis] = useState<Record<number, TutorAnalysis>>({})
  const [corrected, setCorrected] = useState<Set<number>>(new Set())
  const [analyzing, setAnalyzing] = useState<number | null>(null)
  const [modal, setModal] = useState<TutorAnalysis | null>(null)

  const editorRef = useRef<SmartTextareaHandle>(null)
  const ensuring = useRef<Promise<number> | null>(null)
  const saved = useRef<Map<number, string>>(new Map())
  const editingRef = useRef<Editing | null>(null)
  const failing = useRef(false)
  editingRef.current = editing

  const font: Font = page?.font ?? v.prefs.font
  const isToday = date === v.today

  // ── carregar o dia ──
  useEffect(() => {
    let live = true
    setState('loading'); setEditing(null); setCorrected(new Set()); ensuring.current = null
    violetApi.page(date).then(async (r) => {
      if (!live) return
      setPage(r.page); setBullets(r.bullets); setDream(r.page.dream ?? '')
      saved.current = new Map(r.bullets.map((b) => [b.position, b.content]))
      if (r.page.id) {
        const [e, l] = await Promise.all([violetApi.emotionLogs(r.page.id).catch(() => []), violetApi.letters(r.page.id).catch(() => [])])
        if (live) { setEmotions(e); setLetters(l.map((x) => ({ ...x, date }))) }
      } else { setEmotions([]); setLetters([]) }
      if (live) setState('ok')
    }).catch(() => { if (live) setState('error') })
    return () => { live = false }
  }, [date, tries])

  /** O id da página, criando-a no primeiro registro. */
  const pageId = useCallback(async (): Promise<number> => {
    if (page?.id) return page.id
    if (!ensuring.current) {
      ensuring.current = violetApi.ensurePage(date).then((r) => { setPage(r.page); return r.page.id as number })
    }
    return ensuring.current
  }, [page, date])

  // ── salvar um momento (autosave) ──
  const persist = useCallback(async (e: Editing): Promise<Bullet | null> => {
    // Espaço no fim (deixado pela sugestão de @ e /) não vai para o banco.
    const content = e.text.replace(/\s+$/, '')
    if (saved.current.get(e.position) === content && e.id) return null
    if (!e.id && !content.trim()) return null
    setSaveState('saving')
    let r: Awaited<ReturnType<typeof violetApi.upsertBullet>>
    try {
      const id = await pageId()
      r = await violetApi.upsertBullet({ page_id: id, position: e.position, content, kind: e.kind })
    } catch (err) { setSaveState('error'); throw err }
    setSaveState('saved')
    if (r.bullet) {
      const b = r.bullet
      saved.current.set(e.position, b.content)
      setBullets((prev) => {
        const old = prev.find((x) => x.position === b.position)
        const tutor = old?.tutor ? { ...old.tutor, stale: old.content.trim() !== b.content.trim() ? true : old.tutor.stale } : old?.tutor
        const next = old ? prev.map((x) => (x.position === b.position ? { ...b, tutor } : x)) : [...prev, b]
        return next.sort((a, c) => a.position - c.position)
      })
      if (editingRef.current && editingRef.current.position === e.position && !editingRef.current.id) {
        setEditing((cur) => (cur && cur.position === e.position ? { ...cur, id: b.id } : cur))
      }
      v.reload()
      return b
    }
    if (r.deleted) {
      saved.current.delete(e.position)
      setBullets((prev) => prev.filter((x) => x.position !== e.position))
      v.reload()
    }
    return null
  }, [pageId, v])

  // Autosave com respiro de 800 ms enquanto digita.
  useEffect(() => {
    if (!editing) return
    const t = window.setTimeout(() => {
      void persist(editing).catch(() => {
        if (!failing.current) toast('Não consegui salvar — o texto continua aqui; tento de novo enquanto você escreve.', { tone: 'error' })
        failing.current = true
      }).then(() => { failing.current = false })
    }, 800)
    return () => window.clearTimeout(t)
  }, [editing, persist])

  // ── edição ──
  const ordered = useMemo(() => [...bullets].sort((a, b) => a.position - b.position), [bullets])

  function newPosition(after?: number): number {
    if (after === undefined) return (ordered[ordered.length - 1]?.position ?? 0) + 1000
    const next = ordered.find((b) => b.position > after)
    if (!next) return after + 1000
    const mid = Math.floor((after + next.position) / 2)
    return mid > after ? mid : (ordered[ordered.length - 1]?.position ?? 0) + 1000
  }

  const startNew = (kind: BulletKind = editing?.kind ?? 'bullet', after?: number) => {
    setMenuFor(null)
    flushSync(() => setEditing({ position: newPosition(after), kind, text: '', id: null, original: '' }))
    editorRef.current?.focus()
  }

  /** Edita um momento ali mesmo; ``caret`` = posição do cursor (onde você tocou). */
  const startEdit = (b: Bullet, caret?: number) => {
    setMenuFor(null)
    flushSync(() => {
      setCorrected((s) => { const n = new Set(s); n.delete(b.id); return n })
      setEditing({ position: b.position, kind: b.kind, text: b.content, id: b.id, original: b.content })
    })
    editorRef.current?.focus(caret ?? true)
  }

  /** Termina a edição: salva já, e se o texto ficou vazio o momento sai (com Desfazer). */
  const commit = useCallback(async (e: Editing | null = editingRef.current) => {
    if (!e) return
    setEditing(null)
    try {
      await persist(e)
      if (e.id && !e.text.trim() && e.original.trim()) {
        toast('Momento apagado.', {
          undo: () => { void persist({ ...e, text: e.original, id: null }).catch(() => toast('Não consegui desfazer.', { tone: 'error' })) },
        })
      }
    } catch { toast('Não consegui salvar — confira a conexão.', { tone: 'error' }) }
  }, [persist])

  const onKeyDown = (ev: KeyboardEvent<HTMLTextAreaElement>) => {
    const e = editingRef.current
    if (!e) return
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.nativeEvent.isComposing) {
      ev.preventDefault()
      if (!e.text.trim()) { void commit(e); return }
      void commit(e)
      startNew(e.kind, e.position)
      return
    }
    if (ev.key === 'Backspace' && e.text === '') {
      ev.preventDefault()
      const prev = [...ordered].reverse().find((b) => b.position < e.position)
      void commit(e)
      if (prev) startEdit(prev)
      return
    }
    if (ev.key === 'Escape') { ev.preventDefault(); void commit(e) }
  }

  // ── ações de um momento ──
  async function toggleFavorite(b: Bullet) {
    setBullets((p) => p.map((x) => (x.id === b.id ? { ...x, favorite: !b.favorite } : x)))
    try { await violetApi.setFavorite(b.id, !b.favorite) } catch {
      setBullets((p) => p.map((x) => (x.id === b.id ? { ...x, favorite: b.favorite } : x)))
      toast('Não consegui favoritar.', { tone: 'error' })
    }
  }

  async function setKind(b: Bullet, kind: BulletKind) {
    const id = await pageId()
    const r = await violetApi.upsertBullet({ page_id: id, position: b.position, content: b.content, kind }).catch(() => null)
    if (r?.bullet) setBullets((p) => p.map((x) => (x.id === b.id ? { ...r.bullet as Bullet, tutor: x.tutor } : x)))
    else toast('Não consegui trocar o tipo.', { tone: 'error' })
  }

  async function remove(b: Bullet) {
    try {
      await violetApi.deleteBullet(b.id)
      saved.current.delete(b.position)
      setBullets((p) => p.filter((x) => x.id !== b.id))
      v.reload()
      toast('Momento apagado.', {
        undo: () => { void persist({ position: b.position, kind: b.kind, text: b.content, id: null, original: '' }).then((nb) => { if (nb && b.favorite) void violetApi.setFavorite(nb.id, true).then(() => setBullets((p) => p.map((x) => (x.id === nb.id ? { ...x, favorite: true } : x)))) }) },
      })
    } catch { toast('Não consegui apagar.', { tone: 'error' }) }
  }

  async function analyze(b: Bullet) {
    setAnalyzing(b.id)
    try {
      const r = await violetApi.analyzeTutor(b.id, 'en')
      setAnalysis((a) => ({ ...a, [b.id]: r.analysis }))
      setBullets((p) => p.map((x) => (x.id === b.id ? { ...x, tutor: { analysis_id: r.analysis.id, has_correction: true, error_count: r.analysis.errors.length } } : x)))
      setModal(r.analysis)
    } catch (e) { toast(e instanceof Error ? e.message : 'A Kurisu não conseguiu analisar agora.', { tone: 'error' }) }
    setAnalyzing(null)
  }

  async function loadAnalysis(b: Bullet): Promise<TutorAnalysis | null> {
    if (analysis[b.id]) return analysis[b.id]
    const r = await violetApi.bulletAnalysis(b.id).catch(() => null)
    if (r?.analysis) { setAnalysis((a) => ({ ...a, [b.id]: r.analysis as TutorAnalysis })); return r.analysis }
    return null
  }

  async function toggleCorrected(b: Bullet) {
    if (corrected.has(b.id)) { setCorrected((s) => { const n = new Set(s); n.delete(b.id); return n }); return }
    if (await loadAnalysis(b)) setCorrected((s) => new Set(s).add(b.id))
  }

  // Botão flutuante / atalho N do shell: começa um momento novo.
  useEffect(() => {
    const on = () => { if (!editingRef.current) startNew('bullet') }
    window.addEventListener('violet:new-moment', on)
    return () => window.removeEventListener('violet:new-moment', on)
  })

  // ── sonho e fonte ──
  async function saveDream() {
    if ((page?.dream ?? '') === dream.trim()) return
    if (!page?.id && !dream.trim()) return
    try {
      const id = await pageId()
      await violetApi.setDream(id, dream)
      setPage((p) => (p ? { ...p, dream: dream.trim() || null } : p))
      v.reload()
    } catch { toast('Não consegui salvar o sonho.', { tone: 'error' }) }
  }

  async function changeFont(f: Font) {
    const before = page?.font ?? null
    setPage((p) => (p ? { ...p, font: f } : p))
    try {
      const r = await violetApi.setFont(date, f)
      setPage((p) => (p ? { ...p, id: p.id ?? r.page_id, font: f } : p))
    } catch {
      setPage((p) => (p ? { ...p, font: before } : p))
      toast('Não consegui trocar a fonte.', { tone: 'error' })
    }
  }

  // ── deslizar para trocar de dia (celular) ──
  const touch = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (e: TouchEvent) => { if (!editing) touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }
  const onTouchEnd = (e: TouchEvent) => {
    const t = touch.current
    touch.current = null
    if (!t || editing) return
    const dx = e.changedTouches[0].clientX - t.x, dy = e.changedTouches[0].clientY - t.y
    if (Math.abs(dx) > 80 && Math.abs(dy) < 50) {
      const next = addDaysISO(date, dx < 0 ? 1 : -1)
      if (next <= v.today) v.goto({ view: 'write', date: next === v.today ? undefined : next })
    }
  }

  const go = (d: string) => v.goto({ view: 'write', date: d === v.today ? undefined : d })

  if (state === 'loading') return <Page><LoadingState variant="row" count={5} label="Abrindo o dia…" /></Page>
  if (state === 'error') return <Page><ErrorState onRetry={() => setTries((n) => n + 1)} /></Page>

  const words = ordered.reduce((s, b) => s + wordCount(b.content), 0) + wordCount(dream)
  const hasContent = ordered.length > 0 || !!dream.trim() || emotions.length > 0 || letters.length > 0

  // Lista com o rascunho novo encaixado na posição dele. As linhas têm chave pela POSIÇÃO: o rascunho que
  // acabou de ser salvo continua sendo o mesmo campo (o foco e o teclado não piscam no autosave).
  type Row = { b: Bullet } | { draft: true; position: number }
  const rowPos = (r: Row) => ('b' in r ? r.b.position : r.position)
  const rows: Row[] = ordered.map((b) => ({ b }) as Row)
  if (editing && !editing.id && !ordered.some((b) => b.position === editing.position)) {
    rows.push({ draft: true, position: editing.position })
    rows.sort((a, c) => rowPos(a) - rowPos(c))
  }
  // A última linha é sempre um campo vazio, pronto para escrever, na posição que o próximo momento terá.
  // Quando é ela que está em edição, o rascunho ocupa o lugar dela (mesma chave = mesmo campo).
  const lastRow = rows[rows.length - 1]
  const tailPos = (lastRow ? rowPos(lastRow) : 0) + 1000
  const showTail = !(editing && lastRow && rowPos(lastRow) === editing.position)
  const startTail = (kind: BulletKind = tailKind, text = '') => {
    setMenuFor(null)
    setEditing({ position: tailPos, kind, text, id: null, original: '' })
  }
  const activeKind = editing?.kind ?? tailKind
  const pickKind = (k: BulletKind) => {
    if (editing) { setEditing({ ...editing, kind: k }); return }
    setTailKind(k)
    flushSync(() => startTail(k))
    editorRef.current?.focus()
  }

  const editor = (
    <SmartTextarea
      ref={editorRef}
      className="vl-bullet-input"
      value={editing?.text ?? ''}
      onChange={(text) => setEditing((cur) => (cur ? { ...cur, text } : cur))}
      onKeyDown={onKeyDown}
      onBlur={(ev) => {
        // Escolher uma sugestão ou o tipo do momento não encerra a edição.
        if ((ev.relatedTarget as HTMLElement | null)?.closest('.vl-suggest, .vl-kindrow')) return
        void commit()
      }}
      placeholder={ordered.length ? 'Registrar um momento…' : isToday ? 'Como foi o seu dia? Escreva aqui…' : 'Escrever sobre este dia…'}
      aria-label="Momento"
    />
  )

  const bulletMenu = (b: Bullet): MenuItem[] => [
    { id: 'fav', label: b.favorite ? 'Tirar dos favoritos' : 'Favoritar', onSelect: () => void toggleFavorite(b) },
    ...KINDS.map((k) => ({ id: `k-${k.kind}`, label: `Tipo: ${k.label}`, checked: b.kind === k.kind, onSelect: () => void setKind(b, k.kind) })),
    { id: 'tutor', label: b.tutor?.has_correction && !b.tutor.stale ? 'Ver análise do Tutor' : 'Pedir análise ao Tutor (inglês)', onSelect: () => { if (b.tutor?.has_correction && !b.tutor.stale) void loadAnalysis(b).then((a) => a && setModal(a)); else void analyze(b) } },
    { id: 'del', label: 'Apagar', onSelect: () => void remove(b) },
  ]

  return (
    <Page>
      <div className={`vl-write ${fontClass(font)}`} style={{ ['--vl-kb' as string]: `${kb}px` }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <Hero
          compact
          eyebrow={page?.num ? `#${page.num} · ${isToday ? 'hoje' : fmtRelative(date, v.today)}` : isToday ? 'Hoje' : cap(fmtRelative(date, v.today))}
          eyebrowIcon="journal"
          title={cap(fmtDateLong(date))}
          meta={(
            <>
              {hasContent ? `${pluralize(ordered.length, 'momento', 'momentos')} · ${pluralize(words, 'palavra', 'palavras')}` : 'Página em branco'}
              <span className="vl-savestate" role="status" aria-live="polite">
                {saveState === 'saving' ? ' · salvando…' : saveState === 'saved' ? ' · salvo' : saveState === 'error' ? ' · não salvo ainda' : ''}
              </span>
            </>
          )}
          actions={
            <div className="vl-daynav">
              <IconButton icon="left" label="Dia anterior" onClick={() => go(addDaysISO(date, -1))} />
              <div className="vl-daypick"><DatePicker value={date} onChange={(d) => { if (d && d <= v.today) go(d) }} /></div>
              <IconButton icon="right" label="Próximo dia" disabled={isToday} onClick={() => go(addDaysISO(date, 1))} />
              {!isToday && <Button size="sm" onClick={() => go(v.today)}>Hoje</Button>}
              <FontMenuButton value={font} onChange={(f) => void changeFont(f)} compact={phone} />
            </div>
          }
        />

        <label className="vl-dream">
          <Icon name="dream" size={16} />
          <textarea
            rows={1}
            value={dream}
            placeholder="O que você sonhou?"
            aria-label="Sonho"
            onChange={(e) => { setDream(e.target.value); e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px` }}
            onBlur={() => void saveDream()}
          />
        </label>

        {!v.prefs.focus && (
          <>
            <CounselCard date={date} hasContent={hasContent} />

            <section className="vl-daysec" aria-label="Registro emocional">
              <header><Icon name="heart" size={15} /><h3>Registro emocional</h3>{emotions.length > 0 && <span className="vl-muted">{emotions.length}</span>}</header>
              {emotions.map((e) => <EmotionCard key={e.id} log={e} today={v.today} onOpen={() => v.goto({ view: 'emotions', emotionId: e.id })} />)}
              <button type="button" className="vl-addline" onClick={() => setEmotionForm('new')}>
                <Icon name="add" size={14} />{emotions.length ? 'Registrar outra emoção' : 'Como você se sentiu? Registrar emoção'}
              </button>
            </section>

            <section className="vl-daysec" aria-label="Cartas">
              <header><Icon name="mail" size={15} /><h3>Cartas</h3>{letters.length > 0 && <button type="button" className="vl-linklike" onClick={() => v.goto('letters')}>todas as cartas</button>}</header>
              <div className="vl-letters-row">
                {letters.map((l) => <LetterCard key={l.id} letter={l} today={v.today} onOpen={() => (l.status === 'draft' ? setLetterForm(l) : v.goto({ view: 'letters', letterId: l.id }))} />)}
              </div>
              <button type="button" className="vl-addline" onClick={() => setLetterForm('new')}><Icon name="add" size={14} />Escrever uma carta</button>
            </section>
          </>
        )}

        <section className="vl-bullets" aria-label="Momentos do dia">
          {rows.length === 0 && !editing && !isToday && !hasContent && (
            <EmptyState icon="journal" title="Nada escrito neste dia" hint="Toque na linha abaixo e escreva. @ cita uma pessoa, / cita um filme, livro ou tarefa." />
          )}
          {[...rows.map((row) => {
            if (!('b' in row)) {
              return (
                <div key={`p-${row.position}`} className="vl-bullet vl-editing" data-kind={editing?.kind}>
                  <span className="vl-mark" aria-hidden="true">{editing?.kind === 'bullet' ? <span className="vl-dot" /> : <Icon name={kindMeta(editing?.kind ?? 'bullet').icon} size={15} />}</span>
                  <div className="vl-bullet-main">{editor}</div>
                </div>
              )
            }
            const b = row.b
            const isEditing = editing?.id === b.id || (editing && !editing.id && editing.position === b.position)
            const shown = corrected.has(b.id) ? analysis[b.id]?.corrected_text ?? b.content : b.content
            return (
              <div key={`p-${b.position}`} className={`vl-bullet${isEditing ? ' vl-editing' : ''}`} data-kind={isEditing ? editing?.kind : b.kind} data-fav={b.favorite || undefined}>
                <button type="button" className="vl-mark" onClick={() => void toggleFavorite(b)}
                  aria-label={`${kindMeta(b.kind).label} — ${b.favorite ? 'tirar dos favoritos' : 'favoritar'}`} aria-pressed={b.favorite} title={kindMeta(b.kind).label}>
                  {b.favorite ? <Icon name="heart" size={15} /> : b.kind === 'bullet' ? <span className="vl-dot" /> : <Icon name={kindMeta(b.kind).icon} size={15} />}
                </button>
                <div className="vl-bullet-main">
                  {isEditing ? editor : (
                    <div className="vl-bullet-text" role="button" tabIndex={0} aria-description="toque para editar"
                      onClick={(ev) => startEdit(b, corrected.has(b.id) ? undefined : caretForEdit(ev.currentTarget, b.content, ev.clientX, ev.clientY))}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startEdit(b) } }}>
                      <RichText text={shown} />
                    </div>
                  )}
                  {!isEditing && b.tutor?.has_correction && !b.tutor.stale && (
                    <button type="button" className="vl-tutor-toggle" onClick={() => void toggleCorrected(b)}>
                      <Icon name="school" size={12} />{corrected.has(b.id) ? 'corrigido · ver original' : 'ver corrigido'}{b.tutor.error_count > 0 && ` · ${b.tutor.error_count}`}
                    </button>
                  )}
                  {analyzing === b.id && <span className="vl-muted vl-small">A Kurisu está lendo…</span>}
                </div>
                {!isEditing && (
                  <span className="vl-bullet-side">
                    <span className="vl-time">{hhmm(b.created_at)}</span>
                    <span className="vl-menuwrap">
                      <IconButton icon="more" label="Ações do momento" size={16} onClick={() => setMenuFor(menuFor === b.id ? null : b.id)} />
                      {menuFor === b.id && <Menu label="Ações do momento" items={bulletMenu(b)} onClose={() => setMenuFor(null)} />}
                    </span>
                  </span>
                )}
              </div>
            )
          }), showTail ? (
            <div key={`p-${tailPos}`} className="vl-bullet vl-tail" data-kind={tailKind}>
              <span className="vl-mark" aria-hidden="true">{tailKind === 'bullet' ? <span className="vl-dot" /> : <Icon name={kindMeta(tailKind).icon} size={15} />}</span>
              <div className="vl-bullet-main">
                <SmartTextarea
                  className="vl-bullet-input"
                  value=""
                  onChange={(text) => startTail(tailKind, text)}
                  onFocus={() => startTail()}
                  placeholder={ordered.length ? 'Registrar um momento…' : isToday ? 'Como foi o seu dia? Escreva aqui…' : 'Escrever sobre este dia…'}
                  aria-label="Novo momento"
                />
              </div>
            </div>
          ) : null]}
          <div className="vl-kindrow" role="group" aria-label="Tipo do momento">
            {KINDS.map((k) => (
              <button key={k.kind} type="button" className={`vl-kindchip${activeKind === k.kind ? ' vl-on' : ''}`} aria-pressed={activeKind === k.kind}
                onMouseDown={(e) => e.preventDefault()} onClick={() => pickKind(k.kind)}>
                <Icon name={k.icon} size={14} />{k.label}
              </button>
            ))}
          </div>
        </section>
      </div>

      {modal && <TutorModal analysis={modal} onClose={() => setModal(null)} />}
      {emotionForm && (
        <EmotionForm date={date} log={emotionForm === 'new' ? null : emotionForm} onClose={() => setEmotionForm(null)}
          onSaved={(log) => {
            setEmotions((p) => (p.some((x) => x.id === log.id) ? p.map((x) => (x.id === log.id ? log : x)) : [...p, log]))
            if (!page?.id) setTries((n) => n + 1)
            v.reload()
          }} />
      )}
      {letterForm && (
        <LetterComposer date={date} letter={letterForm === 'new' ? null : letterForm} defaultFont={font} onClose={() => setLetterForm(null)}
          onSaved={(l) => {
            if (!l) return
            setLetters((p) => (p.some((x) => x.id === l.id) ? p.map((x) => (x.id === l.id ? l : x)) : [...p, l]))
            if (!page?.id) setTries((n) => n + 1)
            v.reload()
          }} />
      )}
    </Page>
  )
}
