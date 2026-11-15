// Tela "Hoje": saudação, o que está acontecendo agora, o que pede ação e os números escolhidos.
// Cada bloco vem isolado do backend; um bloco vazio some, nunca derruba a tela.

import { useMemo } from 'react'
import { EmptyState, ErrorState, Icon, LoadingState, Page, SectionHeader, type IconName } from '../../../design'
import { getAgent, type AgentId } from '../../../design/core/agents'
import { UniversalCapture } from '../components/UniversalCapture'
import { makimaApi } from '../makimaApi'
import { attentionText, greeting, longDate, remaining, useLoad, visibleWidgets, type HomePrefs } from '../lib'
import type { AttentionItem, AttentionTone, TodayPayload } from '../types'

const TONE_ICON: Record<AttentionTone, IconName> = { danger: 'warning', warn: 'clock', info: 'cake' }

export function Today({ prefs, go }: { prefs: HomePrefs; go: (href: string) => void }) {
  const { state, retry, refresh } = useLoad(() => makimaApi.today())
  const now = useMemo(() => new Date(), [])

  // A captura fica sempre no MESMO lugar da árvore (nunca remonta quando o painel termina de carregar):
  // assim o que o usuário já digitou não se perde, e ela segue disponível se o painel falhar.
  return (
    <Page>
      <div className="mk-stack">
        <header className="mk-head">
          <div>
            <h2>{greeting(now.getHours())}</h2>
            <p>{longDate(now)}{state.status === 'ok' ? ` · ${attentionText(state.data.attention.length)}` : ''}</p>
          </div>
        </header>

        <UniversalCapture onSaved={refresh} />

        {state.status === 'loading' && <LoadingState variant="row" count={5} label="Carregando seu dia…" />}
        {state.status === 'error' && <ErrorState onRetry={retry} />}
        {state.status === 'ok' && <TodayBody data={state.data} prefs={prefs} go={go} />}
      </div>
    </Page>
  )
}

function TodayBody({ data, prefs, go }: { data: TodayPayload; prefs: HomePrefs; go: (href: string) => void }) {
  const { now: agora, attention, numbers } = data
  const widgets = visibleWidgets(prefs).filter((w) => numbers[w.id])
  const nothing = !agora.focus && !agora.next && attention.length === 0 && widgets.length === 0

  return (
    <>
        {nothing && <EmptyState icon="sun" title="Seu dia está livre" hint="Quando houver foco, compromissos, contas ou aniversários, eles aparecem aqui." />}

        {(agora.focus || agora.next || attention.length > 0) && (
          <div className="mk-two">
            <section aria-labelledby="mk-agora">
              <p className="mk-label" id="mk-agora">Agora</p>
              <div className="mk-list">
                {agora.focus && (
                  <button type="button" className="mk-row" onClick={() => go(agora.focus!.href)}>
                    <span className="mk-ic" data-tone="focus"><Icon name="focus" size={18} /></span>
                    <span className="mk-row-t">
                      <strong>{agora.focus.phase === 'pausa' ? 'Pausa' : 'Foco'} · {remaining(agora.focus.remaining_sec)} restantes</strong>
                      <span>{agora.focus.title}</span>
                    </span>
                    <span className="mk-row-a">Abrir</span>
                  </button>
                )}
                {agora.next && (
                  <button type="button" className="mk-row" onClick={() => go(agora.next!.href)}>
                    <span className="mk-ic"><Icon name="calendar" size={18} /></span>
                    <span className="mk-row-t"><strong>{agora.next.title}</strong><span>Próximo compromisso · {agora.next.time}</span></span>
                  </button>
                )}
                {!agora.focus && !agora.next && <p className="mk-agent-k">Sem foco ativo nem compromissos pela frente hoje.</p>}
              </div>
            </section>

            <section aria-labelledby="mk-precisa">
              <p className="mk-label" id="mk-precisa">Precisa de você</p>
              {attention.length === 0
                ? <p className="mk-agent-k">Tudo em dia por aqui.</p>
                : <div className="mk-list">{attention.map((a) => <AttentionRow key={a.id} item={a} go={go} />)}</div>}
            </section>
          </div>
        )}

        {widgets.length > 0 && (
          <section aria-labelledby="mk-nums">
            <SectionHeader title="Seus números" id="mk-nums" />
            <div className="mk-nums">
              {widgets.map((w) => {
                const s = numbers[w.id]!
                const agent = getAgent(w.agent as AgentId)
                return (
                  <button key={w.id} type="button" className="mk-num" data-agent={agent.id} onClick={() => go(s.href ?? agent.route)}>
                    <span className="mk-label" style={{ margin: 0 }}>{agent.name}</span>
                    <b>{s.v}</b>
                    <span>{s.k}</span>
                  </button>
                )
              })}
            </div>
          </section>
        )}
    </>
  )
}

function AttentionRow({ item, go }: { item: AttentionItem; go: (href: string) => void }) {
  return (
    <button type="button" className="mk-row" onClick={() => go(item.href)}>
      <span className="mk-ic" data-tone={item.tone}><Icon name={TONE_ICON[item.tone]} size={18} /></span>
      <span className="mk-row-t"><strong>{item.label}</strong></span>
      <span className="mk-row-a">{item.action}</span>
    </button>
  )
}
