// Escrever sem internet: quando o dia não carrega por falta de rede, dá para guardar um momento novo.
// O texto fica neste aparelho (fila de escritas offline, lib/offlineWrites.ts) e vai para o diário — no fim
// da página deste dia — quando a conexão voltar. Só momentos novos: o diário não fica salvo para leitura offline.

import { useEffect, useState } from 'react'
import { Button, EmptyState, Textarea, toast } from '../../../design'
import { onOfflineSynced, writeOrQueue } from '../../../lib/offlineWrites'

interface Props {
  /** Dia da página (AAAA-MM-DD): o momento vai para ele quando for enviado. */
  date: string
  /** Chamado quando o envio foi direto (a internet voltou enquanto escrevia): a tela recarrega o dia. */
  onSent: () => void
}

export function OfflineNote({ date, onSent }: Props) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  // A fila enviou o que estava guardado (internet voltou): recarrega o dia para mostrá-lo.
  useEffect(() => onOfflineSynced(onSent), [onSent])

  const save = async () => {
    const content = text.trim()
    if (!content || busy) return
    setBusy(true)
    try {
      const w = await writeOrQueue('POST', '/api/journal/bullets', { date, content, kind: 'bullet' })
      setText('')
      if (!w.queued) {
        toast('Momento registrado.', { tone: 'success' })
        onSent()
      }
    } catch (e) {
      toast(e instanceof Error && !/^HTTP \d+$/.test(e.message) ? e.message : 'Não foi possível guardar o momento.', { tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--ds-space-4)' }}>
      <EmptyState
        icon="warning"
        title="Sem internet"
        hint="O diário só abre com conexão. Se quiser, escreva um momento agora: ele fica neste aparelho e entra no dia quando a internet voltar."
      />
      <Textarea
        aria-label="Momento para guardar no aparelho"
        placeholder="O que aconteceu?"
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div>
        <Button onClick={() => void save()} disabled={!text.trim() || busy}>Guardar no aparelho</Button>
      </div>
    </div>
  )
}
