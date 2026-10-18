// Vocabulário das interações, anotações e espaços: rótulo e ícone de cada um, num lugar só.

import type { IconName } from '../../../design'
import type { InteractionKind, NoteKind, RecordSpace, Space } from '../types'

export const INTERACTION: Record<InteractionKind, { label: string; icon: IconName }> = {
  mensagem: { label: 'Mensagem', icon: 'journal' },
  ligacao: { label: 'Ligação', icon: 'phone' },
  encontro: { label: 'Encontro', icon: 'people' },
  video: { label: 'Chamada de vídeo', icon: 'video' },
  outro: { label: 'Outro contato', icon: 'person' },
}
export const INTERACTION_ORDER: InteractionKind[] = ['encontro', 'mensagem', 'ligacao', 'video', 'outro']

export const NOTE: Record<NoteKind, { label: string; plural: string; icon: IconName; hint: string }> = {
  presente: { label: 'Ideia de presente', plural: 'Presentes', icon: 'gift', hint: 'Algo que ela ia gostar de ganhar' },
  gosta: { label: 'Gosta de', plural: 'Gosta de', icon: 'heart', hint: 'Coisas, comidas, hobbies…' },
  nao_gosta: { label: 'Não gosta de', plural: 'Não gosta de', icon: 'drop', hint: 'O que evitar' },
  nota: { label: 'Nota', plural: 'Notas', icon: 'page', hint: 'Qualquer coisa que valha lembrar' },
}
export const NOTE_ORDER: NoteKind[] = ['presente', 'gosta', 'nao_gosta', 'nota']

export const SPACE: Record<Space, { label: string; icon: IconName }> = {
  personal: { label: 'Pessoal', icon: 'personal' },
  work: { label: 'Trabalho', icon: 'work' },
  both: { label: 'Pessoal e trabalho', icon: 'people' },
}

export const RECORD_SPACE: Record<RecordSpace, string> = { personal: 'Pessoal', work: 'Trabalho' }

/** Ícones que o dono pode escolher para um relacionamento (todos do registro do Design System). */
export const CATEGORY_ICONS: IconName[] = ['heart', 'people', 'work', 'person', 'star', 'home', 'school', 'pet', 'book', 'trip', 'game', 'laptop']
