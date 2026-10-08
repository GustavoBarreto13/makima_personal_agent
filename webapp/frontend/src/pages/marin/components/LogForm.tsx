// Formulário de logar episódio (o "Mais detalhes" da linha rápida; substitui o LogWatchModal do shell antigo).
// Escolher o anime (busca + carrossel de pôsteres), o intervalo de episódios (com "próximo" e "+1"), o dia, a
// nota e uma linha sobre a sessão. Ctrl+Enter salva.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, DatePicker, Field, Input, Modal, NumberInput, RateInput, Textarea } from '../../../design'
import { useMarin } from '../context'
import { nextEpisode, searchAnimes, validateDraft, type LogDraft } from '../lib/log'
import { malLabel } from '../lib/score'
import { STATUS } from '../lib/status'
import { Poster } from './Poster'

export function LogForm({ initial, onClose }: { initial: LogDraft; onClose: () => void }) {
  const marin = useMarin()
  const [d, setD] = useState<LogDraft>(initial)
  // A busca começa com o que foi digitado na linha rápida quando o anime não foi reconhecido.
  const [query, setQuery] = useState(initial.animeId ? '' : initial.title)
  const [error, setError] = useState<{ field: string; message: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const stripRef = useRef<HTMLDivElement>(null)

  const anime = marin.animes.find((a) => a.id === d.animeId) ?? null
  const set = (patch: Partial<LogDraft>) => { setD((cur) => ({ ...cur, ...patch })); setError(null) }

  // Carrossel: resultados da busca (ou os candidatos), com o anime escolhido sempre visível no começo.
  const list = useMemo(() => {
    const found = searchAnimes(query, marin.animes).slice(0, 30)
    return anime && !found.some((a) => a.id === anime.id) ? [anime, ...found] : found
  }, [query, marin.animes, anime])

  // A roda do mouse rola o carrossel na horizontal (sem isso, só trackpad/toque rolariam).
  // O listener precisa ser "não passivo" para poder impedir a página de rolar junto.
  useEffect(() => {
    const el = stripRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (e.deltaX !== 0 || el.scrollWidth <= el.clientWidth) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Trocar de anime pré-preenche o episódio com o próximo dele (fica fácil só confirmar).
  const choose = (id: string) => {
    const a = marin.animes.find((x) => x.id === id)
    const ep = a ? nextEpisode(a) : null
    set({ animeId: id, epStart: ep, epEnd: ep })
  }

  const count = d.epStart !== null && d.epEnd !== null && d.epEnd >= d.epStart ? d.epEnd - d.epStart + 1 : null
  const dirty = JSON.stringify(d) !== JSON.stringify(initial)
  const err = (field: string) => (error?.field === field ? error.message : null)
  const int = (v: string): number | null => (v === '' ? null : Math.round(Number(v)))

  const submit = async () => {
    const bad = validateDraft(d, anime, marin.today)
    if (bad) { setError(bad); return }
    setSaving(true)
    try {
      await marin.saveLog(d)
      onClose()
    } catch (e) {
      setError({ field: 'form', message: e instanceof Error ? e.message : 'Não foi possível salvar. Tente de novo.' })
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Logar episódio"
      size="lg"
      dirty={dirty}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon="check" kbd="Ctrl+↵" disabled={saving} onClick={() => void submit()}>Salvar</Button>
        </>
      }
    >
      <div className="ds-stack" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void submit() } }}>
        <Field label="Qual anime?" error={err('anime')} hint={anime ? `${anime.title}${anime.studio ? ` · ${anime.studio}` : ''} · ${STATUS[anime.status].label}` : 'Busque pelo título e toque no pôster.'}>
          {(a) => <Input {...a} value={query} placeholder="Buscar por título ou estúdio…" autoComplete="off" onChange={(e) => setQuery(e.target.value)} />}
        </Field>
        <div className="mr-pick" ref={stripRef} role="listbox" aria-label="Animes">
          {list.map((a) => (
            <div key={a.id} className="mr-pick-i" role="option" aria-selected={a.id === d.animeId}>
              <Poster title={a.title} src={a.poster} selected={a.id === d.animeId} label={`Escolher ${a.title}`} onOpen={() => choose(a.id)} />
            </div>
          ))}
          {list.length === 0 && <p className="ds-hint">Nenhum anime encontrado. Adicione-o ao catálogo primeiro.</p>}
        </div>

        <Field label="Episódios" error={err('eps')} hint={count ? `${count} ${count === 1 ? 'episódio' : 'episódios'} nessa sessão${anime?.total ? ` · o anime tem ${anime.total}` : ''}` : 'Deixe vazio para registrar a sessão sem número de episódio.'}>
          {() => (
            <div className="ds-inline mr-eprow">
              <NumberInput aria-label="Primeiro episódio" min={1} max={anime?.total ?? undefined} value={d.epStart ?? ''} onChange={(e) => { const n = int(e.target.value); set({ epStart: n, epEnd: d.epEnd === null || (n !== null && d.epEnd < n) ? n : d.epEnd }) }} />
              <span aria-hidden="true">até</span>
              <NumberInput aria-label="Último episódio" min={1} max={anime?.total ?? undefined} value={d.epEnd ?? ''} onChange={(e) => set({ epEnd: int(e.target.value) })} />
              <Button size="sm" disabled={!anime || nextEpisode(anime) === null} onClick={() => { const n = anime ? nextEpisode(anime) : null; set({ epStart: n, epEnd: n }) }}>próximo ep</Button>
              <Button size="sm" disabled={d.epEnd === null || (anime?.total != null && d.epEnd >= anime.total)} onClick={() => set({ epEnd: (d.epEnd ?? 0) + 1 })}>+1</Button>
            </div>
          )}
        </Field>

        <div className="ds-cols2">
          <Field label="Quando você assistiu?" error={err('date')}>{(a) => <DatePicker {...a} value={d.date} onChange={(date) => set({ date })} />}</Field>
          <Field label="Sua nota" error={err('rating')} hint={malLabel(d.rating) ? `Nota ${malLabel(d.rating)} no MyAnimeList` : 'Opcional. Cada meia estrela vale 1 ponto.'}>
            {() => (
              <div className="ds-inline">
                <RateInput value={d.rating ?? 0} onChange={(v) => set({ rating: v || null })} />
                {d.rating !== null && <Button size="sm" variant="ghost" onClick={() => set({ rating: null })}>limpar</Button>}
              </div>
            )}
          </Field>
        </div>

        <Field label="Uma linha sobre a sessão" hint="Opcional.">
          {(a) => <Textarea {...a} rows={2} value={d.notes} placeholder="O que ficou da sessão?" onChange={(e) => set({ notes: e.target.value })} />}
        </Field>

        {error?.field === 'form' && <p className="ds-errmsg" role="alert">{error.message}</p>}
      </div>
    </Modal>
  )
}
