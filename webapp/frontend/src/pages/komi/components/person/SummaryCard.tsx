// Resumo com IA: a Kurisu lê a memória da pessoa e devolve um resumo curto, pontos importantes e pendências, cada
// um citando de onde saiu (as citações são links para o item de origem). Só roda quando você pede; fica guardado e
// avisa quando a memória mudou depois ("desatualizado"). A IA também sugere anotações — elas caem na aba Anotações
// como sugestão e só valem se você aceitar.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, ErrorState, Icon, LoadingState, SegmentedControl, Tag } from '../../../../design'
import { toast } from '../../../../design/headless/toast'
import { fmtDate } from '../../../../design/core/format'
import { useKomi } from '../../context'
import { komiApi } from '../../komiApi'
import { useLoad } from '../../lib/useLoad'
import type { PersonRow, SummaryPoint } from '../../types'

type Scope = 'all' | 'personal' | 'work'

function Points({ title, points, open }: { title: string; points: SummaryPoint[]; open: (link: string) => void }) {
  if (!points.length) return null
  return (
    <div className="km-sum-block">
      <span className="km-label">{title}</span>
      <ul className="km-sum-list">
        {points.map((p, i) => (
          <li key={i}>
            {p.texto}{' '}
            {p.fontes.map((f, n) => (
              <button key={n} type="button" className="km-cite" title={f.title} aria-label={`Fonte: ${f.title}`} onClick={() => open(f.deep_link)}>{n + 1}</button>
            ))}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function SummaryCard({ person }: { person: PersonRow }) {
  const komi = useKomi()
  const navigate = useNavigate()
  const [scope, setScope] = useState<Scope>('all')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const { state, retry } = useLoad(() => komiApi.summary(person.id, scope), [person.id, scope, komi.rev])

  const open = (link: string) => { if (link) navigate(link) }

  const generate = async (force: boolean) => {
    setBusy(true)
    setFailure(null)
    try {
      const r = await komiApi.generateSummary(person.id, scope, force)
      if (r.empty) toast(r.message ?? 'Ainda não há nada na memória para resumir.')
      else if (r.suggestions_created) toast(`${r.suggestions_created} ${r.suggestions_created === 1 ? 'sugestão de anotação' : 'sugestões de anotação'} na aba Anotações`, { tone: 'success' })
      komi.reload()
    } catch (e) {
      setFailure(e instanceof Error ? e.message : 'A IA não respondeu.')
    }
    setBusy(false)
  }

  if (state.status === 'error') return <div className="ds-card km-sum"><ErrorState title="Não foi possível ler o resumo" onRetry={retry} /></div>
  const s = state.status === 'ok' ? state.data : null
  const summary = s?.summary ?? null

  return (
    <section className="ds-card km-sum" aria-label="Resumo com IA">
      <header className="km-sum-head">
        <span className="km-sum-title"><Icon name="sparkles" size={15} /> Resumo com IA</span>
        {person.context === 'both' && (
          <SegmentedControl<Scope>
            label="Espaço do resumo"
            value={scope}
            options={[{ value: 'all', label: 'Tudo' }, { value: 'personal', label: 'Pessoal' }, { value: 'work', label: 'Trabalho' }]}
            onChange={setScope}
          />
        )}
        <Button size="sm" icon={summary ? 'refresh' : 'sparkles'} disabled={busy} onClick={() => void generate(!!summary && s?.stale === false)}>
          {busy ? 'Lendo a memória…' : summary ? 'Atualizar' : 'Gerar resumo'}
        </Button>
      </header>

      {state.status === 'loading' && <LoadingState variant="row" count={2} />}
      {failure && <p className="ds-errmsg" role="alert">Não consegui gerar agora: {failure}</p>}
      {state.status === 'ok' && !summary && !failure && <p className="ds-hint">A Kurisu lê a memória e resume o que importa, citando de onde tirou cada ponto. Nada é inventado: ponto sem fonte é descartado.</p>}
      {summary && (
        <div className="ds-stack km-sum-body">
          {s?.stale && <p className="km-warn" role="status"><Tag>desatualizado</Tag> A memória mudou depois deste resumo. Atualize para incluir as novidades.</p>}
          <p className="km-sum-text">{summary.resumo}</p>
          <Points title="Pontos importantes" points={summary.pontos} open={open} />
          <Points title="Em aberto" points={summary.pendencias} open={open} />
          {s?.generated_at && <p className="ds-hint">Gerado em {fmtDate(s.generated_at.slice(0, 10))}.</p>}
        </div>
      )}
    </section>
  )
}
