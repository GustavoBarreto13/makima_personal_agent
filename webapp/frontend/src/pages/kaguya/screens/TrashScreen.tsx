// TrashScreen — lixeira (soft delete). Lista tarefas excluídas e permite restaurar.

import { useEffect, useState, useCallback } from 'react'
import type { Task } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { Icon } from '../ui/Icons'

interface TrashScreenProps {
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

export function TrashScreen({ toast }: TrashScreenProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try { setTasks(await kaguyaApi.trash()) }
    catch { toast('Falha ao carregar a lixeira.', 'err') }
    finally { setLoading(false) }
  }, [toast])

  useEffect(() => { load() }, [load])

  const restore = async (id: number) => {
    try { await kaguyaApi.restore(id); toast('Tarefa restaurada.'); await load() }
    catch { toast('Falha ao restaurar.', 'err') }
  }

  return (
    <div className="kg-page">
      <h1 className="kg-page-title"><Icon name="trash" size={22} /> Lixeira</h1>
      <div className="kg-page-sub">{tasks.length} item(ns)</div>

      {loading ? (
        <div className="kg-empty">Carregando…</div>
      ) : tasks.length === 0 ? (
        <div className="kg-empty"><div className="kg-empty-title">Lixeira vazia</div>Nada para restaurar.</div>
      ) : (
        <div className="kg-list">
          {tasks.map((t) => (
            <div key={t.id} className="kg-row">
              <div className="kg-row-main">
                <div className="kg-row-titleline">
                  <span className="kg-row-title" style={{ color: 'var(--ink-3)' }}>{t.title}</span>
                  <button className="kg-btn" style={{ marginLeft: 'auto', padding: '4px 10px' }} onClick={() => restore(t.id)}>
                    <Icon name="loop" size={13} style={{ verticalAlign: 'middle', marginRight: 5 }} />Restaurar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
