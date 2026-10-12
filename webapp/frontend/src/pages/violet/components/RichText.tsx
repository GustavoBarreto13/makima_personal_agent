// Texto do diário desenhado: pessoas (Komi), referências a outros agentes e tags viram chips tocáveis.
// A pessoa abre a página dela no diário; a referência abre os bullets que a citam (com o link para o agente);
// a tag abre o filtro da tag. O texto em si é puro — nada de HTML vindo do usuário.

import { Fragment, type MouseEvent } from 'react'
import { Icon } from '../../../design'
import { useViolet } from '../context'
import { segments } from '../lib/markup'
import { refIcon } from '../lib/refs'

export function RichText({ text, interactive = true }: { text: string; interactive?: boolean }) {
  const { goto } = useViolet()
  const stop = (fn: () => void) => (e: MouseEvent) => { e.stopPropagation(); fn() }
  return (
    <>
      {segments(text).map((s, i) => {
        if (s.type === 'text') return <Fragment key={i}>{s.text}</Fragment>
        if (s.type === 'person') {
          const person = s.personId ?? `nome:${s.name}`
          const label = <><Icon name="mention" size={12} />{s.name}</>
          return interactive
            ? <button key={i} type="button" className="vl-chip vl-chip-person" onClick={stop(() => goto({ view: 'people', person }))}>{label}</button>
            : <span key={i} className="vl-chip vl-chip-person">{label}</span>
        }
        if (s.type === 'ref') {
          const label = <><Icon name={refIcon(s.agent, s.entityType)} size={12} />{s.label}</>
          return interactive
            ? <button key={i} type="button" className="vl-chip vl-chip-ref" data-agent={s.agent}
                onClick={stop(() => goto({ view: 'collection', ref: { agent: s.agent, entityType: s.entityType, entityId: s.entityId } }))}>{label}</button>
            : <span key={i} className="vl-chip vl-chip-ref" data-agent={s.agent}>{label}</span>
        }
        return interactive
          ? <button key={i} type="button" className="vl-chip vl-chip-tag" onClick={stop(() => goto({ view: 'tags', tag: s.tag }))}>#{s.tag}</button>
          : <span key={i} className="vl-chip vl-chip-tag">#{s.tag}</span>
      })}
    </>
  )
}
