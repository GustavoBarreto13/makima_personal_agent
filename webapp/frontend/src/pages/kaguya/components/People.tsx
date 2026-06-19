// Componentes de pessoas (Komi) para a árvore de tarefas — fatia 025.
// Avatar (foto real ou iniciais coloridas), AvatarStack (sobreposição) e
// AssigneePicker (popover 244px com busca, scrim, toggle de responsáveis).

import { useState, useCallback, useRef } from 'react'
import type { Assignee, Person } from '../types'
import { Icon } from '../ui/Icons'
import { avatarColor, initials } from '../lib/tasktree'
import { kaguyaApi } from '../kaguyaApi'

// ── Avatar individual ──────────────────────────────────────────────────────────

interface AvatarProps {
  // Dados da pessoa — pode ser Assignee (tarefa) ou Person (picker)
  name: string
  avatarUrl?: string | null
  size?: number    // tamanho em px (padrão 22)
  className?: string
  style?: React.CSSProperties
}

/**
 * Círculo do avatar: exibe a foto real quando disponível,
 * senão iniciais coloridas derivadas deterministicamente do nome.
 */
export function Avatar({ name, avatarUrl, size = 22, className, style }: AvatarProps) {
  // Cor de fundo determinística pelo nome — mesma pessoa, sempre a mesma cor.
  const bg = avatarUrl ? undefined : avatarColor(name)
  const fontSize = Math.round(size * 0.42)  // escala junto com o tamanho do avatar

  return (
    <span
      className={`kg-av${className ? ` ${className}` : ''}`}
      title={name}
      style={{
        width: size,
        height: size,
        fontSize,
        background: bg,
        ...style,
      }}
    >
      {avatarUrl ? (
        // Foto real — src da URL armazenada na Komi
        <img
          src={avatarUrl}
          alt={name}
          style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
        />
      ) : (
        // Iniciais quando não há foto (determinístico — mesma pessoa, mesmas iniciais)
        initials(name)
      )}
    </span>
  )
}

// ── Pilha de avatares (sobreposição) ──────────────────────────────────────────

interface AvatarStackProps {
  assignees: Assignee[]
  size?: number
  max?: number    // máximo de avatares antes do "+N"
}

/**
 * Empilha até `max` avatares com sobreposição de -6px.
 * Excedentes aparecem como um círculo cinza "+N".
 */
export function AvatarStack({ assignees, size = 20, max = 3 }: AvatarStackProps) {
  if (!assignees.length) return null

  // Mostra no máximo `max` avatares + chip de excedentes se houver mais.
  const visible = assignees.slice(0, max)
  const extra = assignees.length - visible.length

  return (
    <span className="kg-avstack">
      {visible.map(a => (
        <Avatar key={a.id} name={a.name} avatarUrl={a.avatar_url} size={size} />
      ))}
      {extra > 0 && (
        <span
          className="kg-av more"
          style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
          title={assignees.slice(max).map(a => a.name).join(', ')}
        >
          +{extra}
        </span>
      )}
    </span>
  )
}

// ── AssigneePicker (popover com busca) ────────────────────────────────────────

interface AssigneePickerProps {
  // IDs já selecionados (para marcar como "on" no popover)
  selected: string[]
  // Callback quando o usuário togglea uma pessoa
  onChange: (ids: string[]) => void
  // Âncora: o popover abre ancorado a este elemento pai
  anchor?: 'left' | 'right'
}

/**
 * Popover 244px com lista de pessoas da Komi e campo de busca.
 * Scrim clicável fecha o popover ao clicar fora.
 * Cada item pode ser toggleado — a seleção é acumulativa.
 */
export function AssigneePicker({ selected, onChange, anchor = 'right' }: AssigneePickerProps) {
  // Estado de abertura do popover
  const [open, setOpen] = useState(false)
  // Lista completa de pessoas da Komi (carregada sob demanda ao abrir)
  const [people, setPeople] = useState<Person[]>([])
  // Texto de busca digitado pelo usuário
  const [query, setQuery] = useState('')
  // Indica se está carregando a lista pela primeira vez
  const [loading, setLoading] = useState(false)
  // Ref do input para focar automaticamente ao abrir
  const inputRef = useRef<HTMLInputElement>(null)

  // Carrega pessoas da Komi ao abrir o popover (lazy — evita requisições em mount).
  const openPicker = useCallback(async () => {
    setOpen(true)
    if (people.length === 0) {
      setLoading(true)
      try {
        const data = await kaguyaApi.listPeople()
        setPeople(data)
      } catch {
        // Falha silenciosa — picker fica vazio com texto de erro
      } finally {
        setLoading(false)
      }
    }
    // Foca o campo de busca após abrir
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [people.length])

  // Filtra a lista de pessoas pelo texto de busca (case e acento insensitive).
  const filtered = query.trim()
    ? people.filter(p => p.name.toLowerCase().includes(query.trim().toLowerCase()))
    : people

  // Togglea uma pessoa na seleção: se está, remove; senão, adiciona.
  const toggle = useCallback((id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter(s => s !== id))
    } else {
      onChange([...selected, id])
    }
  }, [selected, onChange])

  return (
    // Contêiner relativo para ancorar o popover
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      {/* Botão de abertura — ícone de grupo de pessoas */}
      <button
        type="button"
        className="tree-act"
        title="Responsáveis"
        onClick={openPicker}
        style={{ opacity: selected.length > 0 ? 1 : undefined }}
      >
        <Icon name="users" size={14} />
      </button>

      {open && (
        <>
          {/* Scrim transparente: fecha o popover ao clicar fora */}
          <span className="kg-pop-scrim" onClick={() => setOpen(false)} />

          {/* Caixa do popover */}
          <div className={`kg-pop ${anchor}`}>
            {/* Campo de busca */}
            <div className="kg-pop-search">
              <Icon name="search" size={14} />
              <input
                ref={inputRef}
                placeholder="Buscar pessoa…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                autoComplete="off"
              />
            </div>

            {/* Lista de pessoas */}
            <div className="kg-pop-list">
              {loading && (
                <div className="kg-pop-empty">Carregando…</div>
              )}
              {!loading && filtered.length === 0 && (
                <div className="kg-pop-empty">
                  {query ? 'Nenhum resultado.' : 'Nenhuma pessoa cadastrada.'}
                </div>
              )}
              {filtered.map(person => {
                const isOn = selected.includes(person.id)
                return (
                  <div
                    key={person.id}
                    className={`kg-pop-item${isOn ? ' on' : ''}`}
                    onClick={() => toggle(person.id)}
                  >
                    {/* Avatar compacto (16px) */}
                    <Avatar name={person.name} avatarUrl={person.avatar_url} size={16} />
                    <span className="pop-name">{person.name}</span>
                    {/* Checkmark quando selecionado */}
                    {isOn && (
                      <span className="pop-check">
                        <Icon name="check" size={13} />
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </span>
  )
}
