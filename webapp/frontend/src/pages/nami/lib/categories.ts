// Aparência das categorias de gasto: um ícone do vocabulário do Design System e um matiz estável.
// As categorias em si (id, nome, tipo) vêm do backend (GET /api/finances/categories).

import { hueFromName } from '../../../design/ui/primitives'
import type { IconName } from '../../../design/ui/icons'

const ICON: Record<string, IconName> = {
  Alimentacao: 'food', 'Comer Fora': 'dining', Saude: 'pulse', Lazer: 'game', Transporte: 'car', Moradia: 'home',
  Roupas: 'shirt', Educacao: 'school', Assinaturas: 'recurring', Viagem: 'trip', Presente: 'gift', Beleza: 'sparkles',
  Academia: 'workout', Farmacia: 'pill', Supermercado: 'cart', Eletronicos: 'laptop', Pet: 'pet', Investimento: 'savings',
  Receita: 'income', Inbox: 'inbox', Transferencia: 'transfer',
}

export const categoryIcon = (id: string): IconName => ICON[id] ?? 'tag'
export const categoryHue = (id: string): number => hueFromName(id)
