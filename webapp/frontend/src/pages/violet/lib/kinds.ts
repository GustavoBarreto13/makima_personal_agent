// Os 6 tipos de bullet e as 3 fontes de escrita da Violet.

import type { IconName } from '../../../design'
import type { BulletKind, Font } from '../types'

export const KINDS: { kind: BulletKind; label: string; icon: IconName; plural: string }[] = [
  { kind: 'bullet', label: 'Momento', icon: 'journal', plural: 'Momentos' },
  { kind: 'highlight', label: 'Destaque', icon: 'highlight', plural: 'Destaques' },
  { kind: 'dream', label: 'Sonho', icon: 'dream', plural: 'Sonhos' },
  { kind: 'idea', label: 'Ideia', icon: 'idea', plural: 'Ideias' },
  { kind: 'wisdom', label: 'Sabedoria', icon: 'wisdom', plural: 'Sabedoria' },
  { kind: 'note', label: 'Nota', icon: 'pin', plural: 'Notas' },
]
export const kindMeta = (k: BulletKind) => KINDS.find((x) => x.kind === k) ?? KINDS[0]

export const FONTS: { value: Font; label: string; hint: string }[] = [
  { value: 'normal', label: 'Normal', hint: 'Limpa, para o dia a dia' },
  { value: 'roteiro', label: 'Roteiro', hint: 'Máquina de escrever' },
  { value: 'cursiva', label: 'Cursiva', hint: 'À mão, como uma carta' },
]
export const fontLabel = (f: Font) => FONTS.find((x) => x.value === f)?.label ?? 'Normal'

/** Classe que aplica a fonte num bloco de escrita. */
export const fontClass = (f: Font | null | undefined) => `vl-font-${f ?? 'normal'}`
