// PersonSearch — campo "Pessoas" do TaskModal (spec: reforma do modal de tarefa).
//
// Substitui o paredão de chips que listava TODOS os contatos da Komi de uma vez.
// Agora: chips só dos selecionados + um campo de busca que abre um popover rolável
// (selecionados fixados no topo, filtro case/acento-insensível) e, quando a busca
// não casa com ninguém, um rodapé "Criar «Fulano»" que cadastra na Komi e já vincula.
//
// O campo serve tanto para RESPONSÁVEIS de uma tarefa quanto para QUEM VAI COM VOCÊ
// num evento — daí o rótulo genérico "Pessoas". Por baixo é sempre person_ids (Komi).
//
// Controlado: o pai passa `selected` (ids) e recebe `onChange`.

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import type { Person } from '../types'
import { kaguyaApi } from '../kaguyaApi'
import { Icon } from '../ui/Icons'
import { Avatar } from './People'

interface PersonSearchProps {
  selected: string[]
  onChange: (ids: string[]) => void
  toast: (msg: string, kind?: 'ok' | 'err') => void
}

// Normaliza para busca: minúsculas sem acento.
const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export function PersonSearch({ selected, onChange, toast }: PersonSearchProps) {
  const [people, setPeople] = useState<Person[]>([])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Catálogo completo da Komi — carregado uma vez.
  useEffect(() => {
    kaguyaApi.listPeople().then(setPeople).catch(() => { /* silencioso: popover fica vazio */ })
  }, [])

  // Fecha ao clicar fora (padrão dos popovers do shell — mousedown + contains).
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const selectedSet = useMemo(() => new Set(selected), [selected])

  // Lista do popover: selecionados primeiro, depois alfabética; filtrada pela busca.
  const rows = useMemo(() => {
    const q = norm(query.trim())
    const sorted = [...people].sort((a, b) => {
      const sa = selectedSet.has(a.id) ? 0 : 1
      const sb = selectedSet.has(b.id) ? 0 : 1
      return sa - sb || a.name.localeCompare(b.name, 'pt-BR')
    })
    return q ? sorted.filter(p => norm(p.name).includes(q)) : sorted
  }, [people, query, selectedSet])

  const queryTrim = query.trim()
  const hasExact = people.some(p => norm(p.name) === norm(queryTrim))
  const canCreate = queryTrim.length > 0 && !hasExact

  const toggle = useCallback((id: string) => {
    onChange(selectedSet.has(id) ? selected.filter(x => x !== id) : [...selected, id])
  }, [selected, selectedSet, onChange])

  const openPop = () => {
    setOpen(true)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const create = async () => {
    if (!canCreate || creating) return
    setCreating(true)
    try {
      const person = await kaguyaApi.createPerson(queryTrim)
      setPeople(prev => [...prev, person])
      onChange([...selected, person.id])
      setQuery('')
      toast(`"${person.name}" criada na Komi e vinculada.`)
    } catch {
      toast('Não foi possível criar a pessoa.', 'err')
    } finally {
      setCreating(false)
    }
  }

  const selectedPeople = people.filter(p => selectedSet.has(p.id))

  return (
    <div className="kg-psearch" ref={boxRef}>
      {/* chips-resumo dos selecionados */}
      {selectedPeople.length > 0 && (
        <div className="kg-psearch-chips">
          {selectedPeople.map(p => (
            <span key={p.id} className="kg-psearch-chip">
              <Avatar name={p.name} avatarUrl={p.avatar_url} size={18} />
              {p.name}
              <button type="button" onClick={() => toggle(p.id)} aria-label={`Remover ${p.name}`}>×</button>
            </span>
          ))}
        </div>
      )}

      {/* campo de busca (abre o popover) */}
      <div className={`kg-psearch-anchor${open ? ' on' : ''}`} onClick={openPop}>
        <Icon name="search" size={14} />
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onKeyDown={e => {
            if (e.key === 'Enter' && canCreate) { e.preventDefault(); create() }
          }}
          placeholder={selected.length ? 'Adicionar mais…' : 'Buscar pessoa…'}
          autoComplete="off"
        />
      </div>

      {open && (
        <div className="kg-psearch-pop">
          <div className="kg-psearch-list">
            {rows.map(p => {
              const on = selectedSet.has(p.id)
              return (
                <div
                  key={p.id}
                  className={`kg-psearch-row${on ? ' on' : ''}`}
                  onClick={() => toggle(p.id)}
                >
                  <Avatar name={p.name} avatarUrl={p.avatar_url} size={20} />
                  <span className="nm">{p.name}</span>
                  {on && <span className="chk"><Icon name="check" size={13} /></span>}
                </div>
              )
            })}
            {rows.length === 0 && !canCreate && (
              <div className="kg-psearch-empty">
                {queryTrim ? 'Ninguém com esse nome.' : 'Nenhuma pessoa cadastrada.'}
              </div>
            )}
          </div>
          {canCreate && (
            <>
              <div className="kg-psearch-divide" />
              <div className="kg-psearch-create" onClick={create}>
                <Icon name="plus" size={14} />
                {creating ? 'Criando…' : `Criar "${queryTrim}"`}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
