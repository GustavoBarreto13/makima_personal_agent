/**
 * ListStats — widget "Meu acervo" com barra empilhada de status + tabela de totais.
 *
 * Renderiza:
 *  1. `.ps-bar` — barra proporcional empilhada com cor por status
 *  2. `.ps-cols` — duas colunas:
 *     - Esquerda: linhas de contagem por status (assistindo, concluída…)
 *     - Direita ("totals"): total de séries, episódios vistos e sessões
 *
 * Props recebem os dados já calculados pelo HomeScreen a partir de
 * `stats.by_status` e `stats.total_*`.
 */

import type { MaiStatus } from '../types'

/** Mapeamento de status para variável CSS de cor. */
const STATUS_COLOR: Record<MaiStatus, string> = {
  assistindo:     'var(--st-assistindo)',
  concluida:      'var(--st-concluida)',
  quero_assistir: 'var(--st-quero_assistir)',
  pausada:        'var(--st-pausada)',
  abandonada:     'var(--st-abandonada)',
}

/** Rótulos em pt-BR para cada status. */
const STATUS_LABEL: Record<MaiStatus, string> = {
  assistindo:     'Assistindo',
  concluida:      'Concluída',
  quero_assistir: 'Quero assistir',
  pausada:        'Pausada',
  abandonada:     'Abandonada',
}

/** Ordem de exibição das linhas de status. */
const STATUS_ORDER: MaiStatus[] = [
  'assistindo', 'concluida', 'quero_assistir', 'pausada', 'abandonada',
]

interface Props {
  /** Contagem por status — chaves são MaiStatus. */
  byStatus: Record<MaiStatus, number>
  /** Total de episódios assistidos no ano/geral. */
  totalEpisodes: number
  /** Total de séries no catálogo (todas, incluindo deletadas? — não: da api list). */
  totalSeries: number
  /** Total de sessões registradas (watch_logs). */
  totalSessions?: number
}

/**
 * ListStats — distribuição por status em barra empilhada + tabela de totais.
 *
 * Args:
 *   byStatus: Record MaiStatus → contagem.
 *   totalEpisodes: Total de episódios vistos (stat global).
 *   totalSeries: Total de séries no acervo.
 *   totalSessions: Número de sessões registradas (opcional).
 *
 * Returns:
 *   Widget `.profile-stats` com barra e colunas de resumo.
 */
export function ListStats({ byStatus, totalEpisodes, totalSeries, totalSessions }: Props) {
  // Linhas de status com contagem
  const rows = STATUS_ORDER.map(s => ({ status: s, label: STATUS_LABEL[s], n: byStatus[s] ?? 0 }))

  // Denominador para calcular proporção das barras (evita divisão por zero)
  const sum = rows.reduce((acc, r) => acc + r.n, 0) || 1

  // Formata número em pt-BR (ex.: 1234 → "1.234")
  const fmt = (n: number) => n.toLocaleString('pt-BR')

  return (
    <div className="profile-stats">
      {/* ── Barra empilhada proporcional ────────────────────────────── */}
      <div className="ps-bar">
        {rows.map(r => r.n > 0 && (
          <span
            key={r.status}
            title={`${r.label} · ${r.n}`}
            style={{
              width: `${(r.n / sum) * 100}%`,
              background: STATUS_COLOR[r.status],
            }}
          />
        ))}
      </div>

      {/* ── Duas colunas: por status (esq.) + totais (dir.) ─────────── */}
      <div className="ps-cols">
        {/* Coluna esquerda: uma linha por status */}
        <div className="ps-col">
          {rows.map(r => (
            <div key={r.status} className="ps-row">
              {/* Ponto de cor do status */}
              <span className="ps-dot" style={{ background: STATUS_COLOR[r.status] }} />
              <span className="ps-label">{r.label}</span>
              <span className="ps-n">{fmt(r.n)}</span>
            </div>
          ))}
        </div>

        {/* Coluna direita: totais gerais */}
        <div className="ps-col totals">
          <div className="ps-row">
            <span className="ps-label">Total de séries</span>
            <span className="ps-n">{fmt(totalSeries)}</span>
          </div>
          <div className="ps-row">
            <span className="ps-label">Episódios vistos</span>
            <span className="ps-n">{fmt(totalEpisodes)}</span>
          </div>
          {totalSessions !== undefined && (
            <div className="ps-row">
              <span className="ps-label">Sessões</span>
              <span className="ps-n">{fmt(totalSessions)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
