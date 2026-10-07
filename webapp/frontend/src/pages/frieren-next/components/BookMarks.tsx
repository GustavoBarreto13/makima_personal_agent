// Marcações coloridas de um livro (trechos e notas soltas), cada uma com uma de 5 cores e, opcionalmente, a página.
// Adicionar (Ctrl+Enter), editar na própria linha e excluir com "Desfazer". Falhas agora avisam (antes eram
// ignoradas em silêncio).

import { useState } from 'react'
import { Button, EmptyState, ErrorState, Field, IconButton, LoadingState, NumberInput, Textarea } from '../../../design'
import { toast } from '../../../design/headless/toast'
import { cx } from '../../../design/ui/primitives'
import { frierenApi } from '../frierenApi'
import { useLoad } from '../lib/useLoad'
import type { Bullet, BulletColor } from '../types'

export const BULLET_COLORS: { value: BulletColor; label: string }[] = [
  { value: 'rosa', label: 'Rosa' },
  { value: 'amarelo', label: 'Amarelo' },
  { value: 'verde', label: 'Verde' },
  { value: 'azul', label: 'Azul' },
  { value: 'laranja', label: 'Laranja' },
]

/** Bolinhas de cor (a cor vem de um token do DS em frieren.css: .fr-mk-<cor>). */
function ColorPick({ value, onChange }: { value: BulletColor; onChange: (c: BulletColor) => void }) {
  return (
    <div className="ds-inline fr-swatches" role="radiogroup" aria-label="Cor da marcação">
      {BULLET_COLORS.map((c) => (
        <button
          key={c.value}
          type="button"
          role="radio"
          aria-checked={value === c.value}
          aria-label={c.label}
          title={c.label}
          className={cx('fr-swatch', `fr-mk-${c.value}`, value === c.value && 'fr-swatch-on')}
          onClick={() => onChange(c.value)}
        />
      ))}
    </div>
  )
}

/** Página como texto do campo → número ou null (vazio = sem página). */
const toPage = (s: string): number | null => (s.trim() ? Math.max(1, Math.round(Number(s))) : null)

function MarkRow({ mark, onChanged }: { mark: Bullet; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [content, setContent] = useState(mark.content)
  const [color, setColor] = useState<BulletColor>(mark.color)
  const [page, setPage] = useState(mark.page_number != null ? String(mark.page_number) : '')

  const save = async () => {
    if (!content.trim()) { toast('A marcação não pode ficar vazia.', { tone: 'error' }); return }
    try {
      await frierenApi.updateBullet(mark.id, { content: content.trim(), color, page_number: toPage(page) })
      setEditing(false)
      onChanged()
    } catch { toast('Não foi possível salvar a marcação.', { tone: 'error' }) }
  }

  const remove = async () => {
    try {
      await frierenApi.deleteBullet(mark.id)
      onChanged()
      // Desfazer recria a marcação com o mesmo texto, cor e página.
      toast('Marcação excluída', {
        undo: () => {
          frierenApi.createBullet(mark.book_id, { content: mark.content, color: mark.color, page_number: mark.page_number })
            .then(onChanged)
            .catch(() => toast('Não foi possível desfazer.', { tone: 'error' }))
        },
      })
    } catch { toast('Não foi possível excluir a marcação.', { tone: 'error' }) }
  }

  if (editing) {
    return (
      <div className={cx('fr-mark fr-mark-edit', `fr-mk-${color}`)} onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void save() }
        if (e.key === 'Escape') { e.preventDefault(); setEditing(false) }
      }}>
        <Textarea aria-label="Texto da marcação" rows={2} value={content} autoFocus onChange={(e) => setContent(e.target.value)} />
        <div className="ds-inline fr-wrap">
          <ColorPick value={color} onChange={setColor} />
          <NumberInput aria-label="Página" min={1} placeholder="pág." className="fr-pagebox" value={page} onChange={(e) => setPage(e.target.value)} />
          <Button size="sm" variant="primary" icon="check" onClick={() => void save()}>Salvar</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
        </div>
      </div>
    )
  }
  return (
    <div className={cx('fr-mark', `fr-mk-${mark.color}`)}>
      <p className="fr-mark-t"><span className="fr-mark-hl">{mark.content}</span></p>
      <div className="fr-mark-side">
        {mark.page_number != null && <span className="ds-mono">p. {mark.page_number}</span>}
        <IconButton icon="edit" label="Editar marcação" size={15} onClick={() => setEditing(true)} />
        <IconButton icon="delete" label="Excluir marcação" size={15} onClick={() => void remove()} />
      </div>
    </div>
  )
}

export function BookMarks({ bookId }: { bookId: string }) {
  const [tick, setTick] = useState(0)
  const { state, retry } = useLoad(() => frierenApi.bullets(bookId), [bookId, tick])
  const [content, setContent] = useState('')
  const [color, setColor] = useState<BulletColor>('amarelo')
  const [page, setPage] = useState('')
  const [saving, setSaving] = useState(false)
  const reload = () => setTick((n) => n + 1)

  const add = async () => {
    if (!content.trim()) return
    setSaving(true)
    try {
      await frierenApi.createBullet(bookId, { content: content.trim(), color, page_number: toPage(page) })
      setContent(''); setPage('')
      reload()
    } catch { toast('Não foi possível adicionar a marcação.', { tone: 'error' }) }
    setSaving(false)
  }

  return (
    <div className="ds-stack">
      <div className="ds-card fr-pad ds-stack" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void add() } }}>
        <Field label="Nova marcação" hint="Um trecho, uma ideia, uma página para voltar. Ctrl+Enter adiciona.">
          {(a) => <Textarea {...a} rows={2} value={content} placeholder="O que vale guardar?" onChange={(e) => setContent(e.target.value)} />}
        </Field>
        <div className="ds-inline fr-wrap">
          <ColorPick value={color} onChange={setColor} />
          <NumberInput aria-label="Página (opcional)" min={1} placeholder="pág." className="fr-pagebox" value={page} onChange={(e) => setPage(e.target.value)} />
          <Button variant="primary" size="sm" icon="add" kbd="Ctrl+↵" disabled={saving || !content.trim()} onClick={() => void add()}>Adicionar</Button>
        </div>
      </div>
      {state.status === 'loading' && <LoadingState variant="row" count={3} />}
      {state.status === 'error' && <ErrorState onRetry={retry} />}
      {state.status === 'ok' && state.data.length === 0 && (
        <EmptyState icon="highlight" title="Nenhuma marcação ainda" hint="Marque trechos e ideias enquanto lê; cada uma ganha uma cor e a página." />
      )}
      {state.status === 'ok' && state.data.length > 0 && (
        <div className="fr-marks-list">{state.data.map((m) => <MarkRow key={m.id} mark={m} onChanged={reload} />)}</div>
      )}
    </div>
  )
}
