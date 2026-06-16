// UpcomingDates.tsx — Lista completa de próximas datas importantes.
// Exibe aniversários e eventos cadastrados para todas as pessoas,
// ordenados por proximidade (mais próximos primeiro).
// Datas passadas são excluídas; datas recorrentes são re-calculadas para o próximo ano.

import { useMemo } from 'react'
import { Icon } from '../icons'
import { Avatar } from '../icons'
import { daysUntil, fmtDayMonth } from '../lib'
import type { OverviewPerson } from '../types'

interface UpcomingDatesProps {
  /** Lista de pessoas com suas datas (vem do overview()). */
  people: OverviewPerson[]
  /** Abre o perfil de uma pessoa ao clicar no date-card. */
  onOpen: (id: string) => void
}

/**
 * Tela de próximas datas.
 * Coleta todas as datas de todas as pessoas e exibe em lista cronológica.
 * Datas recorrentes (recurring=true) usam o próximo MM-DD a partir de hoje.
 * Ao clicar num item, abre o perfil da pessoa correspondente.
 */
export function UpcomingDates({ people, onOpen }: UpcomingDatesProps) {
  // Coleta e ordena todas as datas futuras de todas as pessoas
  const items = useMemo(() => {
    const out: Array<{
      person: OverviewPerson
      label: string
      date: string      // "MM-DD" ou "YYYY-MM-DD"
      recurring: boolean
      days: number      // dias até a próxima ocorrência (0 = hoje)
    }> = []

    // Percorre todas as pessoas e suas datas cadastradas
    people.forEach(p => (p.dates || []).forEach(d => {
      const days = daysUntil(d.date, d.recurring)
      // Exclui datas passadas (days < 0) — recorrentes nunca ficam negativas
      if (days >= 0) {
        out.push({ person: p, label: d.label, date: d.date, recurring: d.recurring, days })
      }
    }))

    // Ordena por proximidade: mais próximas primeiro
    return out.sort((a, b) => a.days - b.days)
  }, [people])

  return (
    <div className="page">
      {/* Cabeçalho da página */}
      <div className="page-head">
        <div>
          <div className="page-title">Próximas datas</div>
          <div className="page-sub">Aniversários e datas importantes de todas as pessoas</div>
        </div>
      </div>

      {/* Lista de datas ou estado vazio */}
      {items.length === 0 ? (
        // Estado vazio: quando nenhuma pessoa tem datas cadastradas
        <div className="empty-state">
          <div className="es-icon"><Icon name="cake" /></div>
          <div className="es-title">Nenhuma data cadastrada</div>
          <div className="es-sub">Adicione datas importantes ao editar uma pessoa.</div>
        </div>
      ) : (
        <div className="dates-list">
          {items.map((item, k) => (
            // Ao clicar, abre o perfil da pessoa dona desta data
            <div className="date-card" key={k} onClick={() => onOpen(item.person.id)}>
              {/* Badge de contagem regressiva — destaque à esquerda */}
              <div className="dc-when">
                {/* "hoje" quando days=0; número de dias caso contrário */}
                <div className="dcw-big">
                  {item.days === 0 ? 'hoje' : item.days}
                </div>
                {item.days !== 0 && (
                  <div className="dcw-unit">
                    {item.days === 1 ? 'dia' : 'dias'}
                  </div>
                )}
              </div>

              {/* Avatar da pessoa */}
              <Avatar person={item.person} size={40} />

              {/* Nome da pessoa + descrição da data */}
              <div className="dc-body">
                <div className="dc-name">{item.person.name}</div>
                <div className="dc-label">
                  {item.label}
                  {/* Indica se é recorrente anual (ex.: aniversário) */}
                  {item.recurring ? ' · recorrente' : ''}
                </div>
              </div>

              {/* Data formatada no canto direito (ex.: "15 jun") */}
              <div className="dc-date">{fmtDayMonth(item.date)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
