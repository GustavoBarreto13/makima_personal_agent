// Refletir — um stream de seções para uns 5 minutos por dia (modelo do Journalistic, spec 076):
// revisão da semana · pergunta do dia (responder vira uma nota de hoje) · gema e ideia do dia · foco (metas da
// Kaguya) · ontem · esta semana · fixados (30 dias) · um ano atrás · memory lane (com o dado).
// As escolhas "aleatórias" mudam a cada dia e não mudam ao recarregar; o dado sorteia de novo. A engrenagem
// liga/desliga seções e fixa tags e pessoas. A revisão semanal (domingo à noite) também abre aqui, inteira.

import { useMemo, useState } from 'react'
import {
  Button, EmptyState, ErrorState, Hero, Icon, IconButton, LoadingState, Page, ProgressBar, SectionHeader, Select, Sheet, Textarea, Toggle, toast,
} from '../../../design'
import { fmtDate, fmtDateLong, fmtRange, fmtRelative, pluralize } from '../../../design/core/format'
import { kaguyaApi } from '../../kaguya/api'
import { Essay } from '../components/Essay'
import { RichText } from '../components/RichText'
import { REFLECT_SECTIONS, useViolet, type ReflectSection } from '../context'
import { fontClass, kindMeta } from '../lib/kinds'
import { AGENT_META, refIcon } from '../lib/refs'
import { useLoad } from '../lib/useLoad'
import { violetApi } from '../violetApi'
import type { DayEntry, MentionCount, ReflectPayload, WeeklyReview } from '../types'

export function Reflect() {
  const v = useViolet()
  if (v.route.week) return <WeeklyReviewView week={v.route.week} />
  if (v.route.weeks) return <WeeklyReviewList />
  return <ReflectStream />
}

function ReflectStream() {
  const v = useViolet()
  const [reroll, setReroll] = useState({ prompt: 0, gem: 0, idea: 0, memory: 0 })
  const { state, retry } = useLoad(() => violetApi.reflect(v.today, v.prefs.pins, reroll), [v.today, v.prefs.pins.join(','), reroll, v.rev])
  const [settings, setSettings] = useState(false)
  const [answer, setAnswer] = useState('')
  const [answering, setAnswering] = useState(false)
  const show = (s: ReflectSection) => !v.prefs.hiddenSections.includes(s)
  const bump = (k: keyof typeof reroll) => setReroll((r) => ({ ...r, [k]: r[k] + 1 }))

  if (state.status === 'loading') return <Page><LoadingState variant="card" count={4} label="Separando o que reler…" /></Page>
  if (state.status === 'error') return <Page><ErrorState onRetry={retry} /></Page>
  const r = state.data

  async function saveAnswer() {
    const text = answer.trim()
    if (!text) return
    setAnswering(true)
    try {
      const page = await violetApi.ensurePage(v.today)
      const last = page.bullets.reduce((m, b) => Math.max(m, b.position), 0)
      await violetApi.upsertBullet({ page_id: page.page.id as number, position: last + 1000, content: `“${r.prompt.text}” — ${text}`, kind: 'note' })
      setAnswer('')
      v.reload()
      toast('Resposta guardada no dia de hoje.', { tone: 'success' })
    } catch { toast('Não consegui guardar a resposta.', { tone: 'error' }) }
    setAnswering(false)
  }

  const weekly = r.weekly_review
  const showWeekly = show('weekly') && weekly && (Date.parse(`${v.today}T12:00:00`) - Date.parse(`${weekly.week_end}T12:00:00`)) / 86400000 <= 2

  return (
    <Page>
      <Hero
        compact
        eyebrow="Refletir"
        eyebrowIcon="insight"
        title="Uns minutos para olhar para trás"
        meta={r.stats.days_written ? `${pluralize(r.stats.days_written, 'dia escrito', 'dias escritos')} desde ${r.stats.first_date ? fmtDate(r.stats.first_date) : '—'}` : 'Comece escrevendo — o Refletir cresce com o diário.'}
        actions={<Button variant="ghost" icon="prefs" onClick={() => setSettings(true)}>Seções</Button>}
      />

      {showWeekly && weekly && (
        <section className={`vl-card vl-weekly vl-tone-${weekly.tone ?? 'guia'}`}>
          <header className="vl-card-head"><Icon name="weekly-review" size={16} /><h3>Revisão da semana</h3><span className="vl-muted ds-mono">{fmtRange(weekly.week_start, weekly.week_end)}</span></header>
          {weekly.verdict && <p className="vl-verdict">{weekly.verdict}</p>}
          <div className="vl-row"><Button variant="primary" icon="journal" onClick={() => v.goto({ view: 'reflect', week: weekly.week_start })}>Ler a revisão</Button></div>
        </section>
      )}

      {show('prompt') && (
        <section className="vl-card vl-prompt">
          <header className="vl-card-head"><Icon name="quote" size={16} /><h3>Pergunta do dia</h3><span className="vl-spacer" />
            <IconButton icon="refresh" label="Outra pergunta" size={16} onClick={() => bump('prompt')} /></header>
          <p className="vl-prompt-q">{r.prompt.text}</p>
          <Textarea rows={2} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Responder… (vira uma nota de hoje)" aria-label="Resposta" />
          <div className="vl-row vl-row-end"><Button disabled={!answer.trim() || answering} icon="check" onClick={() => void saveAnswer()}>Guardar resposta</Button></div>
        </section>
      )}

      {(show('gem') || show('idea')) && (
        <div className="vl-twocol">
          {show('gem') && <Pick title="Gema do dia" icon="wisdom" item={r.gem} empty="Marque um momento como Sabedoria e ele pode aparecer aqui." onRoll={() => bump('gem')} />}
          {show('idea') && <Pick title="Ideia do dia" icon="idea" item={r.idea} empty="Ideias que você registrar voltam aqui de vez em quando." onRoll={() => bump('idea')} />}
        </div>
      )}

      {show('focus') && r.focus.length > 0 && (
        <section className="vl-card">
          <header className="vl-card-head"><Icon name="goal" size={16} /><h3>Foco</h3><span className="vl-muted">metas da Kaguya</span></header>
          {r.focus.map((g) => (
            <button key={g.id} type="button" className="vl-goal" onClick={() => v.openLink(g.deep_link)}>
              <span className="vl-goal-top"><b>{g.title}</b><span className="vl-muted ds-mono">{g.is_overdue ? 'atrasada' : g.days_remaining != null ? `${g.days_remaining} dias` : ''}</span></span>
              <ProgressBar value={g.progress_pct ?? 0} label={`${g.progress_pct ?? 0}% de ${g.title}`} />
              {g.why && <small className="vl-muted">{g.why}</small>}
            </button>
          ))}
        </section>
      )}

      {show('yesterday') && (
        <section className="vl-card">
          <header className="vl-card-head"><Icon name="days" size={16} /><h3>Ontem</h3><span className="vl-muted ds-mono">{fmtDate(r.yesterday.date)}</span></header>
          {r.yesterday.entry ? <DayPreview entry={r.yesterday.entry} /> : (
            <div className="vl-row"><p className="vl-muted">Você não escreveu ontem.</p><Button icon="edit" onClick={() => v.goto({ view: 'write', date: r.yesterday.date })}>Escrever sobre ontem</Button></div>
          )}
        </section>
      )}

      {show('week') && r.week && <WeekCard week={r.week} />}

      {show('pins') && (
        <section className="vl-card">
          <header className="vl-card-head"><Icon name="pin" size={16} /><h3>Fixados · 30 dias</h3><span className="vl-spacer" /><Button size="sm" variant="ghost" icon="add" onClick={() => setSettings(true)}>Fixar</Button></header>
          {r.pins.length === 0 && <p className="vl-muted">Fixe uma tag (#treino) ou uma pessoa para ver a frequência dela no último mês.</p>}
          {r.pins.map((p) => (
            <div key={p.pin} className="vl-pin">
              <button type="button" className="vl-linklike" onClick={() => v.goto(p.kind === 'tag' ? { view: 'tags', tag: p.value } : { view: 'people', person: p.value })}>
                {p.kind === 'tag' ? `#${p.label}` : `@${p.label}`}
              </button>
              <span className="vl-pinstrip" role="img" aria-label={`${p.total} vezes em 30 dias`}>
                {p.days.map((d) => <span key={d.date} className={d.count ? 'vl-on' : undefined} title={`${fmtDate(d.date)}: ${d.count}`} />)}
              </span>
              <span className="ds-mono vl-muted">{p.total}</span>
            </div>
          ))}
        </section>
      )}

      {show('yearAgo') && r.year_ago && (
        <section className="vl-card">
          <header className="vl-card-head"><Icon name="history" size={16} /><h3>Um ano atrás</h3><span className="vl-muted ds-mono">{fmtDateLong(r.year_ago.date)}</span></header>
          {r.year_ago.entry ? <DayPreview entry={r.year_ago.entry} /> : <p className="vl-muted">Nesse dia, há um ano, você não escreveu.</p>}
        </section>
      )}

      {show('memory') && (
        <section className="vl-card">
          <header className="vl-card-head"><Icon name="dice" size={16} /><h3>Memory lane</h3><span className="vl-spacer" />
            {r.memory_lane && <IconButton icon="dice" label="Sortear outro dia" size={16} onClick={() => bump('memory')} />}</header>
          {r.memory_lane?.entry ? (
            <><p className="vl-muted ds-mono">{fmtDateLong(r.memory_lane.date)} · há {pluralize(r.memory_lane.days_ago, 'dia', 'dias')}</p><DayPreview entry={r.memory_lane.entry} /></>
          ) : <p className="vl-muted">Com 10 dias escritos, a Violet começa a trazer lembranças daqui.</p>}
        </section>
      )}

      <div className="vl-row vl-row-center"><Button variant="ghost" icon="weekly-review" onClick={() => v.goto({ view: 'reflect', weeks: true })}>Revisões semanais</Button></div>

      {settings && <ReflectSettings onClose={() => setSettings(false)} />}
    </Page>
  )
}

function Pick({ title, icon, item, empty, onRoll }: { title: string; icon: 'wisdom' | 'idea'; item: { id: number; content: string; date: string; font: DayEntry['font'] } | null; empty: string; onRoll: () => void }) {
  const v = useViolet()
  return (
    <section className="vl-card vl-pick">
      <header className="vl-card-head"><Icon name={icon} size={16} /><h3>{title}</h3><span className="vl-spacer" />
        {item && <IconButton icon="refresh" label={`Outra ${title.toLowerCase()}`} size={16} onClick={onRoll} />}</header>
      {item ? (
        <>
          <blockquote className={`vl-pick-text ${fontClass(item.font)}`}><RichText text={item.content} /></blockquote>
          <button type="button" className="vl-linklike vl-small" onClick={() => v.goto({ view: 'write', date: item.date })}>{fmtDateLong(item.date)}</button>
        </>
      ) : <p className="vl-muted">{empty}</p>}
    </section>
  )
}

export function DayPreview({ entry }: { entry: DayEntry }) {
  const v = useViolet()
  return (
    <div className={`vl-daypreview ${fontClass(entry.font)}`}>
      {entry.dream && <p className="vl-daypreview-dream"><Icon name="dream" size={13} /> {entry.dream}</p>}
      <ul>
        {entry.bullets.map((b) => (
          <li key={b.id} data-kind={b.kind}><Icon name={b.favorite ? 'heart' : kindMeta(b.kind).icon} size={12} /><span><RichText text={b.content} /></span></li>
        ))}
      </ul>
      <div className="vl-row vl-small">
        {entry.emotions.map((e, i) => <span key={i} className="vl-pill">{e.name} {e.intensity}</span>)}
        {entry.bullet_count > entry.bullets.length && <span className="vl-muted">+{entry.bullet_count - entry.bullets.length} momentos</span>}
        <span className="vl-spacer" />
        <button type="button" className="vl-linklike" onClick={() => v.goto({ view: 'write', date: entry.date })}>Abrir o dia</button>
      </div>
    </div>
  )
}

function WeekCard({ week }: { week: NonNullable<ReflectPayload['week']> }) {
  const v = useViolet()
  const list = (title: string, items: { id: number; content: string; date: string }[], icon: 'highlight' | 'wisdom' | 'idea' | 'heart') => items.length > 0 && (
    <div className="vl-weekgroup">
      <h4><Icon name={icon} size={13} />{title}</h4>
      {items.slice(0, 5).map((b) => (
        <button key={b.id} type="button" className="vl-weekline" onClick={() => v.goto({ view: 'write', date: b.date })}>
          <span className="ds-mono vl-muted">{fmtRelative(b.date, v.today)}</span><span><RichText text={b.content} interactive={false} /></span>
        </button>
      ))}
    </div>
  )
  const empty = !week.highlights.length && !week.wisdom.length && !week.ideas.length && !week.favorites.length && !week.new_people.length && !week.new_tags.length && !week.refs.length
  return (
    <section className="vl-card">
      <header className="vl-card-head"><Icon name="weekly-review" size={16} /><h3>Esta semana</h3><span className="vl-muted ds-mono">{fmtRange(week.since, week.until)}</span></header>
      {empty && <p className="vl-muted">Nada marcado nesta semana ainda — destaques, ideias e sabedoria aparecem aqui.</p>}
      {list('Destaques', week.highlights, 'highlight')}
      {list('Favoritos', week.favorites, 'heart')}
      {list('Sabedoria', week.wisdom, 'wisdom')}
      {list('Ideias', week.ideas, 'idea')}
      {(week.new_people.length > 0 || week.new_tags.length > 0) && (
        <div className="vl-weekgroup">
          <h4><Icon name="sparkles" size={13} />Novos no diário</h4>
          <div className="vl-row vl-wrap">
            {week.new_people.map((p) => <button key={p.person_id ?? p.value} type="button" className="vl-chip vl-chip-person" onClick={() => v.goto({ view: 'people', person: p.person_id ?? `nome:${p.value}` })}>@{p.value}</button>)}
            {week.new_tags.map((t) => <button key={t.value} type="button" className="vl-chip vl-chip-tag" onClick={() => v.goto({ view: 'tags', tag: t.value })}>#{t.value}</button>)}
          </div>
        </div>
      )}
      {week.refs.length > 0 && (
        <div className="vl-weekgroup">
          <h4><Icon name="link" size={13} />O que entrou no diário</h4>
          <div className="vl-row vl-wrap">
            {week.refs.map((x) => (
              <button key={`${x.agent}:${x.entity_type}:${x.entity_id}`} type="button" className="vl-chip vl-chip-ref" data-agent={x.agent}
                onClick={() => v.goto({ view: 'collection', ref: { agent: x.agent, entityType: x.entity_type, entityId: x.entity_id } })}>
                <Icon name={refIcon(x.agent, x.entity_type)} size={12} />{x.label}<small>{AGENT_META[x.agent]?.label}</small>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function ReflectSettings({ onClose }: { onClose: () => void }) {
  const v = useViolet()
  const tags = useLoad(() => violetApi.mentions('tag'), [])
  const people = useLoad(() => violetApi.mentions('person'), [])
  const [pick, setPick] = useState('')
  const options = useMemo(() => {
    const t = tags.state.status === 'ok' ? tags.state.data : []
    const p = people.state.status === 'ok' ? people.state.data.filter((x: MentionCount) => x.person_id) : []
    return [...t.slice(0, 30).map((x) => ({ value: `tag:${x.value}`, label: `#${x.value}` })), ...p.slice(0, 30).map((x) => ({ value: `person:${x.person_id}`, label: `@${x.value}` }))]
      .filter((o) => !v.prefs.pins.includes(o.value))
  }, [tags.state, people.state, v.prefs.pins])
  const label = (pin: string) => {
    const [k, val] = [pin.slice(0, pin.indexOf(':')), pin.slice(pin.indexOf(':') + 1)]
    if (k === 'tag') return `#${val}`
    const p = people.state.status === 'ok' ? people.state.data.find((x) => x.person_id === val) : null
    return `@${p?.value ?? 'pessoa'}`
  }
  return (
    <Sheet title="Seções do Refletir" onClose={onClose}>
      {REFLECT_SECTIONS.map((s) => (
        <div key={s.id} className="vl-row vl-settingrow">
          <span>{s.label}</span><span className="vl-spacer" />
          <Toggle label={s.label} checked={!v.prefs.hiddenSections.includes(s.id)}
            onChange={(on) => v.setPrefs({ hiddenSections: on ? v.prefs.hiddenSections.filter((x) => x !== s.id) : [...v.prefs.hiddenSections, s.id] })} />
        </div>
      ))}
      <h4 className="vl-card-title">Fixados</h4>
      {v.prefs.pins.map((p) => (
        <div key={p} className="vl-row vl-settingrow"><span>{label(p)}</span><span className="vl-spacer" />
          <IconButton icon="close" label={`Desafixar ${label(p)}`} size={16} onClick={() => v.setPrefs({ pins: v.prefs.pins.filter((x) => x !== p) })} /></div>
      ))}
      <div className="vl-row">
        <Select aria-label="Tag ou pessoa para fixar" value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">Escolher tag ou pessoa…</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <Button icon="pin" disabled={!pick || v.prefs.pins.length >= 6} onClick={() => { v.setPrefs({ pins: [...v.prefs.pins, pick] }); setPick('') }}>Fixar</Button>
      </div>
    </Sheet>
  )
}

// ── Revisão semanal ─────────────────────────────────────────────────────────

function WeeklyReviewView({ week }: { week: string }) {
  const v = useViolet()
  const { state, retry } = useLoad(() => violetApi.weeklyReview(week), [week])
  const [review, setReview] = useState<WeeklyReview | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  if (state.status === 'loading') return <Page><LoadingState variant="card" count={2} /></Page>
  if (state.status === 'error') return <Page><ErrorState onRetry={retry} /></Page>
  const r = review !== undefined ? review : state.data.review

  async function generate() {
    setBusy(true)
    try { setReview((await violetApi.generateWeeklyReview(week)).review) }
    catch (e) { toast(e instanceof Error ? e.message : 'Não consegui gerar a revisão.', { tone: 'error' }) }
    setBusy(false)
  }
  async function toTask(i: number) {
    if (!r) return
    try {
      const t = await kaguyaApi.createTask({ title: r.actions[i].texto, description: `Da revisão da semana (${fmtRange(r.week_start, r.week_end)}): ${r.actions[i].motivo}` })
      if (!t.id) throw new Error()
      setReview((await violetApi.markWeeklyActionAsTask(r.week_start, i, t.id)).review)
      toast('Virou tarefa na Kaguya.', { tone: 'success' })
    } catch { toast('Não consegui criar a tarefa.', { tone: 'error' }) }
  }

  return (
    <Page>
      <button type="button" className="ds-back-l" onClick={() => v.goto({ view: 'reflect', weeks: true })}><Icon name="left" size={16} /> Revisões</button>
      {!r ? (
        <EmptyState icon="weekly-review" title="Ainda não há revisão desta semana"
          hint={busy ? 'A Violet está lendo a semana inteira — leva um ou dois minutos.' : 'Ela sai sozinha no domingo à noite pelo Hermes; você também pode pedir agora.'}
          action={<Button variant="primary" icon="sparkles" disabled={busy} onClick={() => void generate()}>{busy ? 'Escrevendo…' : 'Gerar a revisão'}</Button>} />
      ) : (
        <article className={`vl-card vl-weekly vl-tone-${r.tone ?? 'guia'}`}>
          <header className="vl-card-head"><Icon name="weekly-review" size={16} /><h3>Revisão da semana</h3><span className="vl-muted ds-mono">{fmtRange(r.week_start, r.week_end)}</span></header>
          <div className="vl-kpis">
            {r.metrics.forca != null && <div className="vl-kpi"><b>{r.metrics.forca}%</b><span>força {r.metrics.forca_antes != null && `(antes ${r.metrics.forca_antes}%)`}</span></div>}
            {r.metrics.dias_escritos != null && <div className="vl-kpi"><b>{r.metrics.dias_escritos}</b><span>dias escritos</span></div>}
            {r.metrics.emocao_media != null && <div className="vl-kpi"><b>{r.metrics.emocao_media}</b><span>intensidade emocional</span></div>}
            {r.metrics.foco_min != null && <div className="vl-kpi"><b>{r.metrics.foco_min}</b><span>min de foco</span></div>}
          </div>
          <Essay markdown={r.essay_md} sources={r.sources} />
          {r.actions.length > 0 && (
            <div className="vl-actions">
              <h4>Compromissos</h4>
              {r.actions.map((a, i) => (
                <div key={i} className="vl-action">
                  <div><b>{a.texto}</b><small>{a.motivo}</small></div>
                  {a.task_id ? <span className="vl-pill vl-pill-ok"><Icon name="check" size={12} />Na Kaguya</span> : <Button size="sm" icon="task" onClick={() => void toTask(i)}>Virar tarefa</Button>}
                </div>
              ))}
            </div>
          )}
          <footer className="vl-card-foot"><Button size="sm" variant="ghost" icon="refresh" disabled={busy} onClick={() => void generate()}>{busy ? 'Reescrevendo…' : 'Regerar'}</Button>
            {r.sent_at && <span className="vl-muted ds-mono vl-small">enviada pelo Hermes</span>}</footer>
        </article>
      )}
    </Page>
  )
}

function WeeklyReviewList() {
  const v = useViolet()
  const { state, retry } = useLoad(() => violetApi.weeklyReviews(26), [v.rev])
  return (
    <Page>
      <button type="button" className="ds-back-l" onClick={() => v.goto('reflect')}><Icon name="left" size={16} /> Refletir</button>
      <SectionHeader title="Revisões semanais" action={<Button size="sm" icon="sparkles" onClick={() => v.goto({ view: 'reflect', week: v.today })}>Desta semana</Button>} />
      {state.status === 'loading' && <LoadingState count={4} />}
      {state.status === 'error' && <ErrorState onRetry={retry} />}
      {state.status === 'ok' && state.data.items.length === 0 && (
        <EmptyState icon="weekly-review" title="Nenhuma revisão ainda" hint="Todo domingo à noite a Violet manda pelo Hermes um balanço franco da semana." />
      )}
      {state.status === 'ok' && state.data.items.map((it) => (
        <button key={it.id} type="button" className="vl-weekitem" onClick={() => v.goto({ view: 'reflect', week: it.week_start })}>
          <span className="ds-mono">{fmtDate(it.week_start)}</span>
          <span className={`vl-pill${it.tone === 'tapa_na_cara' ? ' vl-pill-warn' : ' vl-pill-ok'}`}>{it.tone === 'tapa_na_cara' ? 'tapa na cara' : 'guia'}</span>
          <span className="vl-weekitem-v">{it.verdict}</span>
          <Icon name="right" size={14} />
        </button>
      ))}
    </Page>
  )
}
