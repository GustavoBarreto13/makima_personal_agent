// Formulário de logar um filme (o "Mais detalhes" da linha rápida): escolher o filme no TMDB/catálogo,
// data, nota, coração, onde assistiu, com quem, etiquetas e resenha. Ctrl+Enter salva.

import { useEffect, useRef, useState } from 'react'
import {
  Button, Chip, DatePicker, Field, Icon, Img, Input, Modal, PersonPicker, RateInput, TagInput, Textarea,
  type PersonOption,
} from '../../../design'
import { komiApi } from '../../komi/komiApi'
import { akaneApi } from '../akaneApi'
import { useAkane } from '../context'
import { validateDraft, type CaptureIssues, type LogDraft } from '../lib/log'
import type { TmdbResult } from '../types'
import { PlacePicker } from './PlacePicker'

export function LogForm({ initial, initialResults, issues, onClose }: {
  initial: LogDraft
  initialResults: TmdbResult[]
  issues?: CaptureIssues
  onClose: () => void
}) {
  const akane = useAkane()
  const [d, setD] = useState<LogDraft>(initial)
  const [query, setQuery] = useState(initial.film?.title ?? initial.title)
  const [results, setResults] = useState<TmdbResult[]>(initialResults)
  const [searching, setSearching] = useState(false)
  const [searchFailed, setSearchFailed] = useState(false)
  const [error, setError] = useState<{ field: string; message: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const skipSearch = useRef(initialResults.length > 0 || !!initial.film)
  const set = (patch: Partial<LogDraft>) => { setD((cur) => ({ ...cur, ...patch })); setError(null) }

  // Busca no TMDB enquanto digita (com pausa); a 1ª busca é pulada quando a linha rápida já trouxe os resultados.
  useEffect(() => {
    if (skipSearch.current) { skipSearch.current = false; return }
    const q = query.trim()
    if (q.length < 2) { setResults([]); return }
    let live = true
    const t = setTimeout(() => {
      setSearching(true); setSearchFailed(false)
      akaneApi.tmdbSearch(q)
        .then((r) => { if (live) setResults(r.results) })
        .catch(() => { if (live) setSearchFailed(true) })
        .finally(() => { if (live) setSearching(false) })
    }, 350)
    return () => { live = false; clearTimeout(t) }
  }, [query])

  const dirty = JSON.stringify(d) !== JSON.stringify(initial)
  const err = (field: string) => (error?.field === field ? error.message : null)

  const submit = async () => {
    const draft = d
    const bad = validateDraft(draft, akane.today)
    if (bad) { setError(bad); return }
    setSaving(true)
    try {
      await akane.save(draft)
      onClose()
    } catch (e) {
      setError({ field: 'form', message: e instanceof Error ? e.message : 'Não foi possível salvar. Tente de novo.' })
      setSaving(false)
    }
  }

  const choose = (r: TmdbResult) => { set({ film: r }); setQuery(r.title); setResults([]) }

  return (
    <Modal
      title="Logar filme"
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
        <Field label="Filme" error={err('film')} hint={d.film ? undefined : 'Digite o título e escolha na lista.'}>
          {(a) => (
            <>
              <Input {...a} value={query} placeholder="Ex.: Perfect Blue" autoComplete="off" onChange={(e) => { setQuery(e.target.value); if (d.film) set({ film: null }) }} />
              {d.film && (
                <p className="ax-chosen">
                  <Icon name="check" size={14} /> <b>{d.film.title}</b>
                  <span className="ds-mono">{[d.film.year, d.film.director[0]].filter(Boolean).join(' · ')}{d.film.in_catalog ? ' · já no catálogo' : ''}</span>
                </p>
              )}
            </>
          )}
        </Field>
        {!d.film && (
          <div className="ds-list" aria-label="Resultados da busca" aria-busy={searching}>
            {results.map((r) => (
              <button key={r.tmdb_id} type="button" className="ds-lrow ax-hit" onClick={() => choose(r)}>
                <Img src={r.poster_url} ratio="poster" className="ax-mini" fallback={<Icon name="movie" size={16} />} />
                <span className="ds-t"><b>{r.title}</b><span>{[r.year, r.director[0]].filter(Boolean).join(' · ')}{r.in_catalog ? ' · no catálogo' : ''}</span></span>
              </button>
            ))}
            {!searching && !searchFailed && query.trim().length >= 2 && results.length === 0 && <p className="ds-hint">Nenhum filme encontrado. Confira a grafia.</p>}
            {searchFailed && <p className="ds-hint">A busca não respondeu. Tente de novo em instantes.</p>}
          </div>
        )}

        <div className="ds-cols2">
          <Field label="Data" error={err('date')}>{(a) => <DatePicker {...a} value={d.date} onChange={(date) => set({ date })} />}</Field>
          <Field label="Nota">
            {() => (
              <div className="ds-inline">
                <RateInput value={d.rating ?? 0} onChange={(v) => set({ rating: v || null })} />
                <Chip on={d.liked} icon="heart" aria-pressed={d.liked} onClick={() => set({ liked: !d.liked })}>Curti</Chip>
              </div>
            )}
          </Field>
        </div>

        <Field label="Onde assisti" hint={issues?.place && !d.place ? `Não achei o local “@${issues.place}”. Cadastre como cinema ou streaming.` : undefined}>
          {(a) => (
            <PlacePicker
              id={a.id}
              value={d.place && 'id' in d.place ? d.place.id : null}
              onChange={(id) => set({ place: id ? { id } : null })}
              initialQuery={issues?.place && !initial.place ? issues.place : ''}
            />
          )}
        </Field>

        <Field label="Com quem" hint={issues?.people.length && d.people.length === 0 ? `Você escreveu ${issues.people.map((p) => `+${p}`).join(', ')}: escolha a pessoa para vincular.` : 'Opcional. Vem do cadastro da Komi.'}>
          {(a) => (
            <PersonPicker
              id={a.id}
              value={d.people as PersonOption[]}
              onChange={(people) => set({ people: people.map((p) => ({ id: p.id, name: p.name })) })}
              search={async (q) => (await komiApi.search(q)).matches.map((m) => ({ id: m.id, name: m.name, hint: m.relationship }))}
              onCreate={async (name) => ({ id: (await komiApi.create({ name })).id, name })}
            />
          )}
        </Field>
        <Field label="Etiquetas">{(a) => <TagInput id={a.id} value={d.tags} onChange={(tags) => set({ tags })} />}</Field>
        <Field label="Resenha">{(a) => <Textarea {...a} rows={3} value={d.review} placeholder="O que ficou na cabeça?" onChange={(e) => set({ review: e.target.value })} />}</Field>

        {error?.field === 'form' && <p className="ds-errmsg" role="alert">{error.message}</p>}
      </div>
    </Modal>
  )
}
