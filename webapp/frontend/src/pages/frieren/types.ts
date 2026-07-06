// Interfaces TypeScript que espelham o modelo de dados do protótipo e do backend.

// Status possíveis de um livro na biblioteca
export type BookStatus = 'reading' | 'read' | 'owned' | 'wishlist'

// Paletas de cor disponíveis para capas tipográficas
export type CoverKey =
  | 'sand' | 'teal' | 'slate' | 'sage' | 'rose'
  | 'plum' | 'indigo' | 'clay' | 'fog' | 'forest' | 'ink' | 'amber'

// Livro completo — campos opcionais refletem o que o backend pode ou não ter
export interface Book {
  id: string
  title: string
  author: string
  year: number | null
  pages: number | null
  genre: string | null
  status: BookStatus
  progress: number | null      // 0–1, só quando reading
  page: number | null          // página atual
  started: string | null       // ISO date YYYY-MM-DD
  finished: string | null      // ISO date YYYY-MM-DD
  rating: number | null        // 0–5 em passos de 0.5
  review: string | null
  shelves: string[]            // ids das estantes
  storeLink: string | null     // URL da loja (wishlist)
  coverUrl: string | null      // URL da capa real (Google Books)
  coverKey: CoverKey           // chave da paleta tipográfica (derivada do ID)
}

// ── Marcações coloridas ───────────────────────────────────────────────────────

// Cores válidas de uma marcação (espelha o CHECK do banco)
export type BulletColor = 'rosa' | 'amarelo' | 'verde' | 'azul' | 'laranja'

// Marcação colorida de um livro (espelha ApiBookBullet do backend)
export interface BookBullet {
  id: string
  content: string
  color: BulletColor
  page: number | null          // page_number do backend
  position: number
}

// Ordem e rótulos pt-BR das cores — usados no seletor de cores do BookDetail.
// A cor visual em si vem das CSS vars --mk-<cor> definidas em frieren.css.
export const BULLET_COLOR_META: { key: BulletColor; label: string }[] = [
  { key: 'rosa',    label: 'Rosa' },
  { key: 'amarelo', label: 'Amarelo' },
  { key: 'verde',   label: 'Verde' },
  { key: 'azul',    label: 'Azul' },
  { key: 'laranja', label: 'Laranja' },
]

// Estante de livros
export interface Shelf {
  id: string
  name: string
  desc: string
  accent: string               // cor oklch da estante
}

// Entrada do diário de leitura
export interface ActivityEntry {
  id: string
  date: string                 // YYYY-MM-DD
  bookId: string
  type: 'progress' | 'finished' | 'started' | 'review'
  pages: number | null
  page: number | null
  note: string | null
  rating: number | null
}

// Dado de um dia no heatmap
export interface HeatmapDay {
  date: string                 // YYYY-MM-DD
  pages: number
}

// Estado das preferências persistidas no localStorage
export interface Tweaks {
  tema: 'Claro' | 'Escuro'
  layoutInicio: 'Cinemático' | 'Editorial' | 'Galeria'
  densidade: 'Grande' | 'Médio' | 'Compacto'
  ordenacao: 'Recentes' | 'Avaliação' | 'Título' | 'Autor' | 'Progresso'
}
