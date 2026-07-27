// ArchivedProjectsScreen — listas arquivadas (spec 039). Mostra nome, data de
// arquivamento e contagem de tarefas; permite restaurar (volta íntegra à
// navegação) ou abrir a edição (de lá dá para excluir definitivamente, fluxo
// já existente no ProjectModal).

import { useEffect, useState, useCallback } from 'react'
import type { ArchivedProject } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { Icon } from '../ui/Icons'

interface ArchivedProjectsScreenProps {
  onEditProject: (project: ArchivedProject) => void  // abre o ProjectModal (edição/exclusão definitiva)
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

// Formata a data de arquivamento em pt-BR curto (ex.: "1 jul 2026").
function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function ArchivedProjectsScreen({ onEditProject, toast }: ArchivedProjectsScreenProps) {
  const [projects, setProjects] = useState<ArchivedProject[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try { setProjects(await kaguyaApi.listArchivedProjects()) }
    catch { toast('Falha ao carregar as listas arquivadas.', 'err') }
    finally { setLoading(false) }
  }, [toast])

  useEffect(() => { load() }, [load])

  const restore = async (p: ArchivedProject) => {
    try {
      await kaguyaApi.restoreProject(p.id)
      toast(`Lista "${p.name}" restaurada.`)
      await load()
    } catch { toast('Falha ao restaurar.', 'err') }
  }

  return (
    <div className="kg-page">
      <h1 className="kg-page-title"><Icon name="archive" size={22} /> Arquivadas</h1>
      <div className="kg-page-sub">{projects.length} lista(s)</div>

      {loading ? (
        <div className="kg-empty">Carregando…</div>
      ) : projects.length === 0 ? (
        <div className="kg-empty"><div className="kg-empty-title">Nenhuma lista arquivada</div>Listas encerradas ficam aqui, restauráveis a qualquer momento.</div>
      ) : (
        <div className="kg-list">
          {projects.map((p) => (
            <div key={p.id} className="kg-row">
              <div className="kg-row-main">
                <div className="kg-row-titleline">
                  <span className="kg-nav-emoji">{p.icon ?? '📦'}</span>
                  <span className="kg-row-title">{p.name}</span>
                  <span className="kg-muted" style={{ fontSize: 12, marginLeft: 8 }}>
                    {p.task_count} tarefa(s) · arquivada em {fmtDate(p.archived_at)}
                  </span>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    <button className="kg-btn" style={{ padding: '4px 10px' }} onClick={() => onEditProject(p)}>
                      <Icon name="settings" size={13} style={{ verticalAlign: 'middle', marginRight: 5 }} />Editar
                    </button>
                    <button className="kg-btn kg-btn-primary" style={{ padding: '4px 10px' }} onClick={() => restore(p)}>
                      <Icon name="loop" size={13} style={{ verticalAlign: 'middle', marginRight: 5 }} />Restaurar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
