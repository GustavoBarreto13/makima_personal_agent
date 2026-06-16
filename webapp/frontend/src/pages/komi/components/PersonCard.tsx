// PersonCard.tsx — Card de pessoa no grid do diretório da Komi.
// Exibe avatar, nome, relacionamento, categoria, aniversário e datas.
// Recebe OverviewPerson (do endpoint /overview) que já tem as datas cadastradas.

import { Icon } from '../icons'
import { Avatar } from '../icons'
import { REL_CATS, fmtDayMonth, daysUntil } from '../lib'
import type { OverviewPerson } from '../types'

interface PersonCardProps {
  p: OverviewPerson   // dados da pessoa vindos do overview (tem dates para aniversário)
  onOpen: (id: string) => void  // callback ao clicar no card
}

/**
 * Card de pessoa no diretório (grid).
 * Clique abre o perfil completo (PersonPage) via onOpen(id).
 * A cor do dot de categoria vem de REL_CATS via variável CSS --rel-color.
 */
export function PersonCard({ p, onOpen }: PersonCardProps) {
  // Metadados da categoria: cor e tint para o dot colorido
  const cat = REL_CATS[p.category] || REL_CATS.outros

  // Busca o aniversário nas datas (label contém "anivers", sem distinção de case)
  // O overview já traz todas as datas cadastradas para a pessoa
  const bday = (p.dates || []).find(d => /anivers/i.test(d.label))

  // Próxima data que está chegando (< 60 dias) além do aniversário
  const nextDate = (p.dates || [])
    .map(d => ({ ...d, days: daysUntil(d.date, d.recurring) }))
    .filter(d => d.days >= 0 && d.days <= 60 && !(/anivers/i.test(d.label)))
    .sort((a, b) => a.days - b.days)[0]

  // Indica se há saldo financeiro pendente (te devem ou você deve)
  const hasFinance = p.finance_net !== 0

  // Variável CSS da cor da categoria — usada pelo .pc-rel .rd (dot colorido)
  const style = { '--rel-color': cat.color } as React.CSSProperties

  return (
    // Clique no card inteiro abre o perfil
    <div className="ppl-card" style={style} onClick={() => onOpen(p.id)}>
      {/* Linha superior: avatar + nome + relacionamento com dot de categoria */}
      <div className="pc-top">
        <Avatar person={p} size={48} />
        <div style={{ minWidth: 0 }}>
          <div className="pc-name">{p.name}</div>
          {/* .rd é o dot colorido — a cor vem da variável CSS --rel-color */}
          <div className="pc-rel"><span className="rd" />{p.relationship}</div>
        </div>
      </div>

      {/* Meta: aniversário (se cadastrado) */}
      {bday && (
        <div className="pc-meta">
          <span className="pc-birth">
            <Icon name="cake" />{fmtDayMonth(bday.date)}
          </span>
          {/* Alerta de data chegando (< 30 dias) */}
          {(() => {
            const days = daysUntil(bday.date, bday.recurring)
            return days >= 0 && days <= 30
              ? <span style={{ color: 'var(--ink-4)', fontSize: 10 }}>· em {days}d</span>
              : null
          })()}
        </div>
      )}

      {/* Indicadores de vínculos */}
      <div className="pc-links">
        {/* Indicador financeiro: verde se tem saldo, muted se não */}
        <span className={'pc-linkdot fin' + (hasFinance ? '' : ' muted')} title="Finanças">
          <Icon name="wallet" />
          {hasFinance ? '1' : '0'}
        </span>
        {/* Tarefas, diário e livros: overview não tem contagem individual
            (esses dados só vêm do summary(), carregado no PersonPage) */}
        <span className="pc-linkdot task muted" title="Tarefas"><Icon name="checks" />–</span>
        <span className="pc-linkdot diary muted" title="Diário"><Icon name="feather" />–</span>
        <span className="pc-linkdot book muted" title="Livros"><Icon name="book" />–</span>
        <span className="pc-links-spacer" />
        {/* Total de datas cadastradas como indicador de "riqueza" do perfil */}
        {(p.dates?.length ?? 0) > 0 && (
          <span className="pc-total">
            {p.dates.length} {p.dates.length === 1 ? 'data' : 'datas'}
          </span>
        )}
      </div>
    </div>
  )
}
