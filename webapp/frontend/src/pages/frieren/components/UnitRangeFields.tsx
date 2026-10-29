// Os três campos da faixa de um livro contado em capítulos ou volumes: inicial, último e quantidade.
// Mangás costumam numerar os capítulos de forma contínua entre volumes (o Vol. 2 vai do cap. 24 ao 36),
// então o usuário pode informar "24 até 36" ou "começa no 24 e tem 13": os campos andam juntos.
// O servidor guarda só o inicial (`first_unit`) e o último (`total_pages`); a quantidade é sempre derivada.

import { Field, NumberInput } from '../../../design'
import { rangeCountText, rangeFieldLabels, rangeWithCount, type ProgressUnit, type RangeText } from '../lib/units'

interface Props {
  unit: ProgressUnit
  value: RangeText
  onChange: (next: RangeText) => void
  errors?: { first?: string; last?: string }
  /** Marca o total como opcional (cadastro rápido); na edição ele é sempre exibido. */
  optionalLast?: boolean
}

export function UnitRangeFields({ unit, value, onChange, errors = {}, optionalLast }: Props) {
  const labels = rangeFieldLabels(unit)
  return (
    <>
      <Field label={labels.first} error={errors.first} hint="Mangá com numeração contínua: o Vol. 2 pode começar no cap. 24.">
        {(a) => <NumberInput {...a} min={1} value={value.first} onChange={(e) => onChange({ ...value, first: e.target.value })} />}
      </Field>
      <Field label={optionalLast ? `${labels.last} (opcional)` : labels.last} error={errors.last}
        hint={optionalLast ? 'Com o último, o app mostra a porcentagem lida. Dá para preencher depois.' : undefined}>
        {(a) => <NumberInput {...a} min={1} value={value.last} onChange={(e) => onChange({ ...value, last: e.target.value })} />}
      </Field>
      <Field label={labels.count} hint="Calculada sozinha; mexer aqui ajusta o último.">
        {(a) => <NumberInput {...a} min={1} value={rangeCountText(value, unit)} onChange={(e) => onChange(rangeWithCount(value, e.target.value, unit))} />}
      </Field>
    </>
  )
}
