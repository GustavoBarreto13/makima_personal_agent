/**
 * MobilityDossier.tsx — Yato · Viagens (fatia 066)
 *
 * ⭐ Componente-assinatura do shell — não existe nada parecido em nenhum outro
 * domínio do app. Renderiza os 7 passos do protocolo como coluna de carimbos.
 *
 * Regras inegociáveis (FR-009/010/011, design-guide.md §4):
 *  - nunca mostrar os 7 passos como formulário único — o wizard vai um a um;
 *  - ausência de dado é `inconclusivo`, nunca `ausente` (decidido no backend,
 *    aqui só renderiza);
 *  - nenhum texto afirma "tem X" sem o passo estar `confirmado`.
 */

import { useState } from 'react'
import type { DossierResponse, MobilityStrategyResponse, CheckKey } from '../types'
import { VERDICT_META, VerdictChip } from './VerdictChip'
import { ReadinessLine } from './ReadinessMeter'
import { Icon } from './Icon'
import { STEP_BY_KEY, STRATEGY_LABEL } from '../steps'
import { fmtBRfull, isoDateOnly } from '../dateUtils'

// Passos colapsados sob o resumo de escala pedonal (2 a 5, 0-indexed 1..4)
const PEDESTRIAN_COLLAPSED_RANGE = [1, 5]

interface MobilityDossierProps {
  data: DossierResponse | null
  strategy?: MobilityStrategyResponse | null
  onCheck: (key: CheckKey) => void
  onStart: () => void
}

export function MobilityDossier({ data, strategy, onCheck, onStart }: MobilityDossierProps) {
  const [openCollapsed, setOpenCollapsed] = useState(false)

  if (!data) {
    return (
      <div className="card dossier">
        <div className="dos-empty">
          <div className="eyebrow">dossiê de mobilidade</div>
          <div className="stat-macro">51%</div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600, maxWidth: '44ch', textWrap: 'pretty' }}>
            dos municípios brasileiros não têm nenhum ônibus urbano. Apps de corrida chegam a 26%.
          </div>
          <p className="dim" style={{ maxWidth: '46ch', fontSize: 13 }}>
            Ainda não checamos nada dessa cidade. Vamos por partes — sete passos, um por vez.
          </p>
          <button className="btn btn-primary" onClick={onStart}><Icon name="carimbo" /> Iniciar protocolo</button>
        </div>
      </div>
    )
  }

  const { dossier, checks } = data
  const ped = dossier.pedestrian_scale
  const shown = ped ? [checks[0], checks[5], checks[6]] : checks
  const collapsed = ped ? checks.slice(PEDESTRIAN_COLLAPSED_RANGE[0], PEDESTRIAN_COLLAPSED_RANGE[1]) : []
  const pending = strategy?.pending_checks?.length ?? checks.filter(c => c.verdict === 'pendente').length
  const strat = (strategy?.strategy && STRATEGY_LABEL[strategy.strategy]) || { txt: 'a definir', emoji: '•' }

  return (
    <div className="card dossier">
      <div className="dos-head">
        <div className="dos-head-top">
          <span className="dos-kicker">dossiê de mobilidade</span>
          <span className="dos-title">
            {dossier.city}<span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>/{dossier.state_uf}</span>
          </span>
          {dossier.last_checked_at && (
            <span className="dos-checked">checado em {fmtBRfull(isoDateOnly(dossier.last_checked_at))}</span>
          )}
        </div>
        <div className="dos-head-bot">
          {dossier.city_size && <span className="dos-size">cidade {dossier.city_size}</span>}
          {ped && <span className="vchip v-na">escala pedonal</span>}
          <div className="dos-meter"><ReadinessLine checks={checks} size="md" /></div>
        </div>
      </div>

      {dossier.stale && (
        <div className="dos-stale">
          <b>dossiê com mais de 6 meses</b> — revalidar antes de viajar. Cobertura de app muda sem aviso.
        </div>
      )}

      {ped && (
        <div className="dos-collapsed">
          <span style={{ color: 'var(--ink-4)' }}>—</span>
          <div style={{ flex: 1 }}>
            <div className="dos-step" style={{ marginBottom: 4 }}>Passos 2 a 5 · mobilidade motorizada</div>
            <div style={{ textWrap: 'pretty' }}>
              Vila sem circulação de veículos: app de corrida, táxi e ônibus urbano <b>não se aplicam</b> aqui.
              Não é ausência de serviço — é ausência de rua.
            </div>
            <button className="btn btn-sm" style={{ marginTop: 9 }} onClick={() => setOpenCollapsed(o => !o)}>
              {openCollapsed ? 'esconder passos' : 'ver os 4 passos'}
            </button>
          </div>
          <span className="vchip v-na">n/a</span>
        </div>
      )}
      {ped && openCollapsed && collapsed.map(c => (
        <div className="dos-row" key={c.check_key}>
          <div className="dos-sym" style={{ color: 'var(--ink-4)' }}>—</div>
          <div>
            <div className="dos-step"><span className="n">{STEP_BY_KEY[c.check_key]?.n} ·</span>{STEP_BY_KEY[c.check_key]?.name}</div>
            <div className="dos-ev">Não se aplica em escala pedonal.</div>
          </div>
          <div className="dos-stamp"><span className="vchip v-na md">— n/a</span></div>
          <div className="dos-src">—</div>
        </div>
      ))}

      {shown.map(c => {
        const step = STEP_BY_KEY[c.check_key]
        const isPending = c.verdict === 'pendente'
        const meta = VERDICT_META[c.verdict] || VERDICT_META.pendente
        return (
          <div className="dos-row" key={c.check_key}>
            <div className="dos-sym" style={{ color: isPending ? 'var(--verdict-pending)' : meta.cssVar }}>{meta.sym}</div>
            <div>
              <div className="dos-step"><span className="n">{step?.n} ·</span>{step?.name}</div>
              <div className={'dos-ev' + (isPending ? ' instr' : '')}>{isPending ? step?.instr : c.evidence}</div>
            </div>
            <div className="dos-stamp"><VerdictChip v={c.verdict} md /></div>
            <div className="dos-src">
              {isPending
                ? <button className="btn btn-sm" onClick={() => onCheck(c.check_key)}>Checar <Icon name="chevR" /></button>
                : <>{c.checked_at && fmtBRfull(isoDateOnly(c.checked_at))}<br />{c.source}</>}
            </div>
          </div>
        )
      })}

      <div className="dos-foot">
        <div className="dos-foot-strat">
          <span className="dos-foot-k">estratégia {pending > 0 ? 'provisória' : 'recomendada'}</span>
          <span className="strategy-emoji">{strat.emoji}</span>
          <span className="dos-foot-v">{strat.txt}</span>
        </div>
        <div className="dos-foot-note">
          {pending > 0
            ? <>Falta{pending > 1 ? 'm' : ''} <b>{pending}</b> passo{pending > 1 ? 's' : ''} — então isso aqui ainda não é veredito final. {strategy?.rationale || dossier.summary}</>
            : (strategy?.rationale || dossier.summary)}
        </div>
      </div>
    </div>
  )
}
