/**
 * FavoriteSeries — bloco de 4 séries favoritas editáveis.
 *
 * Os IDs das séries favoritas são persistidos em `localStorage` sob a
 * chave `mai.favorites` (array de strings). O componente recebe o catálogo
 * completo via props para resolver os IDs em objetos `Series`.
 *
 * Modos:
 *  - Normal: pôsteres clicáveis (navega para detalhe)
 *  - Edição: botão ✕ em cada slot + botão "Adicionar" quando < 4 favoritas
 *
 * Sub-componente `SeriesPicker` (inline): modal de busca no acervo local
 * para escolher qual série adicionar ao slot vazio.
 */

import { useState, useMemo } from 'react'
import type { Series } from '../types'
import { PosterCard } from './PosterCard'
import { IconX, IconPlus, IconSearch } from './MaiIcons'

// Chave usada no localStorage para persistir os IDs favoritos
const STORAGE_KEY = 'mai.favorites'

/** Lê os favoritos do localStorage (array de IDs de série). */
function loadFavorites(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed as string[]
  } catch {
    // Ignora erros de parse — localStorage pode estar corrompido
  }
  return []
}

/** Salva os favoritos no localStorage. */
function saveFavorites(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    // Ignora — localStorage pode estar bloqueado (modo privado, etc.)
  }
}

// ── SeriesPicker ───────────────────────────────────────────────────────────

interface PickerProps {
  /** Catálogo completo de séries para filtrar. */
  catalog: Series[]
  /** IDs já adicionados como favoritos (para ocultar opções já escolhidas). */
  excludeIds: string[]
  /** Callback chamado quando o usuário escolhe uma série. */
  onPick: (id: string) => void
  /** Fecha o picker sem escolher. */
  onClose: () => void
}

/**
 * SeriesPicker — mini-modal de seleção de série favorita.
 * Filtra o catálogo por texto digitado e exibe grade de pôsteres.
 *
 * Args:
 *   catalog: Todas as séries do acervo.
 *   excludeIds: IDs que já são favoritos (não mostra).
 *   onPick: Chamado com o ID da série escolhida.
 *   onClose: Fecha o modal.
 */
function SeriesPicker({ catalog, excludeIds, onPick, onClose }: PickerProps) {
  const [query, setQuery] = useState('')

  // Filtra séries: remove os já favoritos e aplica busca por título
  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return catalog.filter(s =>
      !s.deleted &&
      !excludeIds.includes(s.id) &&
      (q === '' || s.title.toLowerCase().includes(q) || (s.title_original ?? '').toLowerCase().includes(q))
    )
  }, [catalog, excludeIds, query])

  return (
    // Backdrop escuro semi-transparente (clique fora fecha)
    <div
      className="modal-backdrop"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="modal" style={{ maxWidth: 520 }}>
        {/* Cabeçalho do picker */}
        <div className="modal-head">
          <span className="modal-title">Escolher série favorita</span>
          <button className="modal-close" onClick={onClose}>
            <IconX style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {/* Campo de busca */}
        <div className="modal-body" style={{ paddingBottom: 4 }}>
          <div className="search-row" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
            <IconSearch style={{ width: 16, height: 16, color: 'var(--ink-4)', flexShrink: 0 }} />
            <input
              className="mai-input"
              placeholder="Buscar no acervo…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
              style={{ flex: 1, background: 'var(--paper-2)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 12px', fontSize: 14, color: 'var(--ink)' }}
            />
          </div>

          {/* Grade de pôsteres clicáveis */}
          {filtered.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px 0' }}>
              Nenhuma série encontrada.
            </div>
          ) : (
            <div className="fav-pick-grid">
              {filtered.map(s => (
                <div
                  key={s.id}
                  className="poster-link"
                  onClick={() => onPick(s.id)}
                >
                  <PosterCard series={s} />
                  <div className="pm-title">{s.title}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── FavoriteSeries ─────────────────────────────────────────────────────────

interface Props {
  /** Catálogo completo — usado para resolver IDs e para o SeriesPicker. */
  catalog: Series[]
  /** Navega para a tela de detalhe de uma série. */
  onNav: (view: string, param?: string) => void
}

/**
 * FavoriteSeries — bloco de 4 favoritas editáveis com persistência local.
 *
 * Args:
 *   catalog: Lista de Series do acervo (para resolver IDs e busca no picker).
 *   onNav: Callback de navegação para DetailScreen.
 *
 * Returns:
 *   Seção com grade de 4 pôsteres e controles de edição.
 */
export function FavoriteSeries({ catalog, onNav }: Props) {
  // Estado de IDs favoritos — inicia do localStorage
  const [favIds, setFavIds] = useState<string[]>(loadFavorites)
  // Modo de edição (mostrar botões ✕ e "Adicionar")
  const [editing, setEditing] = useState(false)
  // Mostra o SeriesPicker?
  const [picking, setPicking] = useState(false)

  // Mapa ID → Series para resolver rapidamente
  const catalogMap = useMemo(
    () => new Map(catalog.map(s => [s.id, s])),
    [catalog]
  )

  // Resolve os IDs em objetos Series (filtra IDs inválidos que podem ter ficado no localStorage)
  const favSeries = favIds
    .map(id => catalogMap.get(id))
    .filter((s): s is Series => s !== undefined)
    .slice(0, 4)

  /** Remove um ID da lista de favoritos e salva. */
  const removeFav = (id: string) => {
    const updated = favIds.filter(x => x !== id)
    setFavIds(updated)
    saveFavorites(updated)
  }

  /** Adiciona um ID à lista de favoritos (máx. 4) e salva. */
  const addFav = (id: string) => {
    if (favIds.includes(id) || favIds.length >= 4) return
    const updated = [...favIds, id]
    setFavIds(updated)
    saveFavorites(updated)
    setPicking(false)  // fecha o picker após escolha
  }

  return (
    <div className="mai-sec">
      {/* Cabeçalho da seção: título + botão Editar/Concluir */}
      <div className="mai-sec-head">
        <span className="t">💗 Favoritas</span>
        <span className="rule" />
        <span
          className="lnk"
          onClick={() => setEditing(v => !v)}
        >
          {editing ? 'Concluir' : 'Editar'}
        </span>
      </div>

      {/* Grade de 4 slots (até 4 favoritas + slot "Adicionar" no modo edição) */}
      <div className="fav-grid">
        {favSeries.map(s => (
          <div key={s.id} className="fav-slot" style={{ position: 'relative' }}>
            {editing ? (
              // Modo edição: pôster estático + botão ✕
              <>
                <div className="poster-static">
                  <PosterCard series={s} />
                </div>
                <button
                  className="fav-remove"
                  title="Remover dos favoritos"
                  onClick={() => removeFav(s.id)}
                >
                  <IconX style={{ width: 13, height: 13 }} />
                </button>
              </>
            ) : (
              // Modo normal: pôster clicável → detalhe da série
              <div
                className="poster-link"
                onClick={() => onNav('detail', s.id)}
              >
                <PosterCard series={s} />
              </div>
            )}
          </div>
        ))}

        {/* Slot "Adicionar" — só aparece no modo edição quando há menos de 4 */}
        {editing && favSeries.length < 4 && (
          <button
            className="fav-add"
            onClick={() => setPicking(true)}
          >
            <IconPlus style={{ width: 20, height: 20 }} />
            <span>Adicionar</span>
          </button>
        )}
      </div>

      {/* Estado vazio (sem favoritas e não em modo edição) */}
      {!editing && favSeries.length === 0 && (
        <div className="empty-state" style={{ padding: '20px 0', fontSize: 13 }}>
          Nenhuma série favorita ainda.{' '}
          <span
            style={{ color: 'var(--mai-deep)', cursor: 'pointer', textDecoration: 'underline' }}
            onClick={() => setEditing(true)}
          >
            Editar
          </span>
        </div>
      )}

      {/* Modal SeriesPicker — abre quando o usuário clica em "Adicionar" */}
      {picking && (
        <SeriesPicker
          catalog={catalog}
          excludeIds={favIds}
          onPick={addFav}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  )
}
