// Mesclar duas pessoas que são a mesma: mostra a prévia do que muda e só então confirma. Quem fica absorve os
// vínculos, interações, anotações, datas, relações e os nomes da outra (que viram "outras formas" de chamar).
// A mescla NÃO tem desfazer — a tela diz isso antes de confirmar.

import { useState } from 'react'
import { Avatar, Button, ErrorState, LoadingState, Modal } from '../../../design'
import { toast } from '../../../design/headless/toast'
import { useKomi } from '../context'
import { komiApi } from '../komiApi'
import { useLoad } from '../lib/useLoad'
import type { MergePreview } from '../types'

function movesText(m: MergePreview['moves']): string[] {
  const links = Object.values(m.links).reduce((a, n) => a + n, 0)
  const out: string[] = []
  if (links) out.push(`${links} ${links === 1 ? 'vínculo com outros agentes' : 'vínculos com outros agentes'}`)
  if (m.interactions) out.push(`${m.interactions} ${m.interactions === 1 ? 'contato' : 'contatos'}`)
  if (m.notes) out.push(`${m.notes} ${m.notes === 1 ? 'anotação' : 'anotações'}`)
  if (m.dates) out.push(`${m.dates} ${m.dates === 1 ? 'data importante' : 'datas importantes'}`)
  if (m.relations) out.push(`${m.relations} ${m.relations === 1 ? 'relação com outra pessoa' : 'relações com outras pessoas'}`)
  if (m.groups) out.push(`${m.groups} ${m.groups === 1 ? 'grupo' : 'grupos'}`)
  return out
}

export function MergeDialog({ firstId, secondId, onClose }: { firstId: string; secondId: string; onClose: () => void }) {
  const komi = useKomi()
  // Quem fica: começa pela primeira, mas dá para trocar.
  const [keepId, setKeepId] = useState(firstId)
  const dropId = keepId === firstId ? secondId : firstId
  const { state, retry } = useLoad(() => komiApi.mergePreview(keepId, dropId), [keepId, dropId])
  const [saving, setSaving] = useState(false)

  const confirm = async () => {
    setSaving(true)
    try {
      const r = await komiApi.merge(keepId, dropId)
      komi.reload()
      toast(r.message || 'Pessoas mescladas', { tone: 'success' })
      onClose()
      komi.goto({ view: 'people', personId: keepId })
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Não foi possível mesclar.', { tone: 'error' })
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Mesclar duas pessoas"
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button variant="danger" icon="merge" disabled={saving || state.status !== 'ok'} onClick={() => void confirm()}>Mesclar</Button>
        </>
      }
    >
      {state.status === 'loading' && <LoadingState variant="row" count={3} />}
      {state.status === 'error' && <ErrorState onRetry={retry} />}
      {state.status === 'ok' && (
        <div className="ds-stack">
          <div className="km-merge">
            <div className="km-merge-who">
              <Avatar name={state.data.keep.name} size={44} />
              <span><b>{state.data.keep.name}</b><small>fica</small></span>
            </div>
            <Button size="sm" variant="ghost" icon="transfer" aria-label="Trocar quem fica" onClick={() => setKeepId(dropId)}>Trocar</Button>
            <div className="km-merge-who">
              <Avatar name={state.data.drop.name} size={44} />
              <span><b>{state.data.drop.name}</b><small>vai para a lixeira</small></span>
            </div>
          </div>
          {movesText(state.data.moves).length > 0
            ? <p>Passam para <b>{state.data.keep.name}</b>: {movesText(state.data.moves).join(', ')}.</p>
            : <p>{state.data.drop.name} não tem vínculos nem registros para passar.</p>}
          {state.data.aliases.length > 0 && <p>Os nomes {state.data.aliases.map((a) => `“${a}”`).join(', ')} viram outras formas de chamar {state.data.keep.name}.</p>}
          <p className="ds-hint"><b>Atenção:</b> não dá para desfazer a mescla. Confira antes de confirmar.</p>
        </div>
      )}
    </Modal>
  )
}
