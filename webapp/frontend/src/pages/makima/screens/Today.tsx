// Tela "Hoje": o que está acontecendo agora, o que pede ação e os números escolhidos.
// Cada bloco vem isolado do backend; um bloco vazio some, nunca derruba a tela. Os dados se renovam sozinhos
// (ao voltar ao app e a cada minuto) e a contagem do foco anda sem recarregar.
// O título ("Boa noite") e a data ficam na barra do topo (AppShell), não repetidos aqui.

import { useState } from 'react'
import { Button, EmptyState, ErrorState, Icon, LoadingState, Modal, Page, SectionHeader, type IconName } from '../../../design'
import { getAgent, type AgentId } from '../../../design/core/agents'
import { UniversalCapture } from '../components/UniversalCapture'
import { WidgetRows } from '../components/WidgetRows'
import { useAutoRefresh, useFocusCountdown } from '../hooks'
import { makimaApi } from '../makimaApi'
import { remaining, useLoad, visibleWidgets, type HomePrefs } from '../lib'
import type { AttentionItem, FocusNow, TodayPayload } from '../types'

const ITEM_ICON: Record<NonNullable<AttentionItem['icon']>, IconName> = { task: 'task', money: 'money', cake: 'cake' }
const TONE_FALLBACK: Record<AttentionItem['tone'], IconName> = { danger: 'warning', warn: 'clock', info: 'info' }

export function Today({ prefs, setPrefs, go }: { prefs: HomePrefs; setPrefs: (p: Partial<HomePrefs>) => void; go: (href: string) => void }) {
  const { state, retry, refresh } = useLoad(() => makimaApi.today())
  useAutoRefresh(refresh)

  // A captura fica sempre no MESMO lugar da árvore (nunca remonta quando o painel termina de carregar):
  // assim o que o usuário já digitou não se perde, e ela segue disponível se o painel falhar.
  return (
    <Page>
      <div className="mk-stack">
        <UniversalCapture onSaved={refresh} />
        {state.status === 'loading' && <LoadingState variant="row" count={4} label="Carregando seu dia…" />}
        {state.status === 'error' && <ErrorState onRetry={retry} />}
        {state.status === 'ok' && <TodayBody data={state.data} loadedAt={state.at} prefs={prefs} setPrefs={setPrefs} go={go} refresh={refresh} />}
      </div>
    </Page>
  )
}

function TodayBody({ data, loadedAt, prefs, setPrefs, go, refresh }: {
  data: TodayPayload; loadedAt: number; prefs: HomePrefs; setPrefs: (p: Partial<HomePrefs>) => void; go: (href: string) => void; refresh: () => void
}) {
  const [editing, setEditing] = useState(false)
  const { now: agora, attention, numbers } = data
  const widgets = visibleWidgets(prefs).filter((w) => numbers[w.id])
  const nothing = !agora.focus && !agora.next && attention.length === 0 && widgets.length === 0

  return (
    <>
      {nothing && <EmptyState icon="sun" title="Seu dia está livre" hint="Quando houver foco, compromissos, contas ou aniversários, eles aparecem aqui. Para começar, registre algo no campo acima." />}

      {(agora.focus || agora.next || attention.length > 0) && (
        <div className="mk-two">
          <section aria-labelledby="mk-agora">
            <p className="mk-label" id="mk-agora">Agora</p>
            <div className="mk-list">
              {agora.focus && <FocusRow focus={agora.focus} loadedAt={loadedAt} go={go} onZero={refresh} />}
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
            <p className="mk-label" id="mk-precisa">
              Precisa de você
              {attention.length > 0 && <span className="mk-badge" aria-label={`${attention.length} ${attention.length === 1 ? 'item' : 'itens'}`}>{attention.length}</span>}
            </p>
            {attention.length === 0
              ? <p className="mk-agent-k">Tudo em dia por aqui.</p>
              : <div className="mk-list">{attention.map((a) => <AttentionRow key={a.id} item={a} go={go} />)}</div>}
          </section>
        </div>
      )}

      {widgets.length > 0 && (
        <section aria-labelledby="mk-nums">
          <SectionHeader title="Seus números" id="mk-nums" action={<Button variant="ghost" size="sm" icon="prefs" onClick={() => setEditing(true)}>Editar</Button>} />
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

      {editing && (
        <Modal title="Seus números" size="sm" onClose={() => setEditing(false)} footer={<Button variant="primary" onClick={() => setEditing(false)}>Pronto</Button>}>
          <p className="mk-agent-k" style={{ marginTop: 0 }}>Escolha o que aparece na tela Hoje e a ordem.</p>
          <WidgetRows prefs={prefs} setPrefs={setPrefs} />
        </Modal>
      )}
    </>
  )
}

function FocusRow({ focus, loadedAt, go, onZero }: { focus: FocusNow; loadedAt: number; go: (href: string) => void; onZero: () => void }) {
  const left = useFocusCountdown(focus.remaining_sec, loadedAt, onZero)
  const what = focus.phase === 'pausa' ? 'Pausa' : 'Foco'
  const time = left === null ? '' : left === 0 ? ' · terminando…' : ` · ${remaining(left)} restantes`
  return (
    <button type="button" className="mk-row" onClick={() => go(focus.href)}>
      <span className="mk-ic" data-tone="focus"><Icon name="focus" size={18} /></span>
      <span className="mk-row-t">
        <strong>{what}{time}</strong>
        <span>{focus.title}</span>
      </span>
      <span className="mk-row-a">Abrir</span>
    </button>
  )
}

function AttentionRow({ item, go }: { item: AttentionItem; go: (href: string) => void }) {
  return (
    <button type="button" className="mk-row" onClick={() => go(item.href)}>
      <span className="mk-ic" data-tone={item.tone}><Icon name={item.icon ? ITEM_ICON[item.icon] : TONE_FALLBACK[item.tone]} size={18} /></span>
      <span className="mk-row-t"><strong>{item.label}</strong></span>
      <span className="mk-row-a">{item.action}</span>
    </button>
  )
}
