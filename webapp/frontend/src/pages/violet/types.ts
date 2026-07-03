// Tipos TypeScript para o módulo Violet · Diário.
// Espelham exatamente o shape retornado pelos endpoints do backend.

// ── Bullet ────────────────────────────────────────────────────────────────

// Os 6 tipos de bullet do diário, com marcadores e cores distintos
export type BulletKind = 'bullet' | 'highlight' | 'dream' | 'idea' | 'wisdom' | 'note'

// Um bullet já salvo no banco (retornado pelo backend)
export interface Bullet {
  id: number
  page_id: number
  kind: BulletKind
  content: string
  position: number
  created_at: string  // ISO timestamp
  // Feature 007: estado de favorito — false por default (bullets antigos recebem false do banco)
  favorite: boolean
  // Tutor de Idiomas (spec 031): metadado leve composto pelo router — null se nunca analisado
  tutor?: BulletTutorMeta | null
}

// ── Entry (página do diário) ──────────────────────────────────────────────

// Uma entry representa um dia no diário
export interface Entry {
  id: number
  type_id: number
  date: string       // YYYY-MM-DD
  dream: string | null  // sonho do dia (campo da page, diferente do bullet kind='dream')
  num: number        // número sequencial da entrada (#1, #2, ...) — derivado no banco
  created_at: string
  updated_at: string
}

// Resposta do endpoint GET /api/journal/page
export interface PageResponse {
  page: Entry
  bullets: Bullet[]
}

// ── Coleções derivadas ────────────────────────────────────────────────────

// Um item de coleção de bullet (highlight, idea, wisdom, note, dream-bullet)
export interface CollectionItem {
  id: number
  kind: BulletKind
  content: string
  created_at: string
  date: string       // data da entry de origem
  entry_num: number  // número sequencial da entry de origem
}

// Um sonho registrado no campo dream da page (diferente de bullet kind='dream')
export interface DreamItem {
  page_id: number
  date: string
  entry_num: number
  dream: string
}

// Contagem de uma @pessoa ou #tag
export interface MentionCount {
  value: string
  count: number
}

// ── Heatmap e Estatísticas ────────────────────────────────────────────────

// Um dia no heatmap com contagem de palavras escritas
export interface HeatmapData {
  [date: string]: number  // {"2026-06-09": 145, ...}
}

// Estatísticas agregadas do ano (retornadas por GET /api/journal/stats)
export interface Stats {
  entries: number          // entradas com pelo menos 1 bullet
  bullets: number          // total de bullets do ano
  days_written: number     // dias com pelo menos 1 palavra escrita
  total_words: number      // soma de palavras em todos os bullets
  per_day: number          // média de palavras por dia escrito
  highlights: number       // bullets com kind='highlight'
  tags: number             // tags distintas
  mentions: number         // pessoas distintas
  dreams: number           // entries com dream não nulo
  highlight_rate: number   // % de entries com pelo menos 1 highlight
  freq_per_week: number    // dias escritos / semanas do ano até hoje
  words_by_month: number[] // 12 valores (Jan=0 ... Dez=11)
  daytime: number[]        // 12 buckets bihourly (0h=0 ... 22h=11)
  // calculados no cliente a partir do heatmap:
  longestStreak?: number
  currentStreak?: number
}

// ── Emoções (Feature 006 — Registro Emocional TCC) ─────────────────────────

// Uma emoção do vocabulário (predefinida da TCC ou criada pelo usuário)
export interface Emotion {
  id: number
  name: string
  is_predefined: boolean  // true = uma das 8 emoções base da TCC
}

// Um registro emocional — o "Registro de Pensamentos" da TCC, ancorado num dia.
// Só emotion + intensity são obrigatórios; os demais campos são preenchidos
// progressivamente conforme o exercício avança.
export interface EmotionLog {
  id: number
  page_id: number
  emotion_id: number
  emotion_name: string                  // nome da emoção (vem do JOIN no backend)
  intensity: number                     // intensidade inicial, 0–10
  situation: string | null              // situação/gatilho
  automatic_thought: string | null      // pensamento automático
  adaptive_response: string | null      // resposta adaptativa (reavaliação racional)
  reappraised_intensity: number | null  // intensidade após a resposta, 0–10
  created_at: string                    // ISO timestamp
}

// ── Cartas ─────────────────────────────────────────────────────────────────

// Uma pessoa (Komi) vinculada a uma carta — só id + nome, o suficiente para o chip
export interface LetterPerson {
  id: string
  name: string
}

// Uma carta: um texto expressivo livre escrito para alguém, algo ou qualquer
// coisa, ancorado num dia. status 'draft' = rascunho editável; 'sealed' = lacrada
// (registro imutável). Pode estar vinculada a pessoas cadastradas na Komi.
export interface Letter {
  id: number
  page_id: number
  recipient: string                 // "para quem/o quê" (texto livre)
  title: string | null             // título opcional
  body: string                      // corpo da carta
  status: 'draft' | 'sealed'        // rascunho ou lacrada
  sealed_at: string | null          // ISO timestamp de quando foi lacrada (null se rascunho)
  created_at: string                // ISO timestamp
  updated_at: string | null         // ISO timestamp da última edição
  people: LetterPerson[]            // pessoas (Komi) vinculadas
}

// Estatísticas agregadas de emoções de um ano (aba "Emoções" dos Insights)
export interface EmotionStats {
  total: number                         // total de registros do ano
  avg_intensity: number                 // intensidade média geral (inicial)
  top_emotion: string | null            // emoção mais frequente
  by_emotion: { name: string; count: number; avg_intensity: number }[]  // count DESC
  by_month: number[]                    // 12 posições (Jan=0 ... Dez=11), contagem de registros
}

// ── Reflect ───────────────────────────────────────────────────────────────

// Uma pergunta de reflexão assinada pela Violet
export interface ReflectPrompt {
  q: string    // pergunta
  by: string   // assinatura ("Violet")
}

// ── Tweaks (preferências de UI) ───────────────────────────────────────────

// Preferências de personalização do Violet, persistidas em localStorage
export interface VioletPrefs {
  theme: 'light' | 'dark'                            // padrão: 'light'
  accent: 'sapphire' | 'gold' | 'emerald' | 'garnet' // padrão: 'sapphire'
  mode: 'normal' | 'wide' | 'focus'                  // padrão: 'normal'
  typography: 'classic' | 'technical'                // padrão: 'classic'
}

// Valores padrão das preferências — usados na primeira visita (sem localStorage)
export const DEFAULT_PREFS: VioletPrefs = {
  theme: 'light',
  accent: 'sapphire',
  mode: 'normal',
  typography: 'classic',
}

// ── Roteamento interno do shell ───────────────────────────────────────────

// Rota interna do VioletShell — view identifica a tela, param é parâmetro opcional
// (ex.: param = "2026-06-09" para abrir a tela Write em uma data específica)
export interface VioletRoute {
  view: string
  param: string | null
}

// ── Entrada de arquivo (journal listing) ─────────────────────────────────

// Uma entry resumida para a listagem do arquivo (Journal screen)
export interface EntryListItem {
  date: string
  num: number
  excerpt: string        // primeiro bullet, max 150 chars
  bullet_count: number
  has_highlight: boolean
  has_dream: boolean
}

// ── Tutor de Idiomas (spec 031 — persona Kurisu) ──────────────────────────

// Metadado leve de análise composto pelo router em cada bullet de GET /page
export interface BulletTutorMeta {
  analysis_id: number
  has_correction: boolean
  error_count: number
  // Só no cliente: marcado quando o bullet é editado após a análise — a correção
  // salva não corresponde mais ao texto atual, então oferecemos re-analisar.
  stale?: boolean
}

// Um erro apontado pela análise — conceito + explicação em PT-BR
export interface TutorError {
  concept_slug: string
  concept_label: string
  wrong: string
  right: string
  explanation: string
  severity: 'low' | 'medium' | 'high'
}

// Resultado completo de uma análise de escrita (POST/GET .../tutor)
export interface TutorAnalysis {
  id: number
  bullet_id: number
  language: string
  original_text: string
  corrected_text: string
  natural_rewrite: string
  errors: TutorError[]
  concepts_used_correctly: string[]
  summary: string
  score: number
  created_at: string
}

// Item do histórico de análises (GET /tutor/analyses) — versão resumida
export interface TutorAnalysisSummary {
  id: number
  bullet_id: number
  score: number
  error_count: number
  summary: string
  created_at: string
}

// Um conceito gramatical da lista canônica (GET /tutor/concepts)
export interface TutorConcept {
  slug: string
  label: string
}

// Skill (maestria por conceito) — item da lista da tela de progresso
export interface TutorSkill {
  concept_slug: string
  concept_label: string
  mastery_pct: number
  trend: 'up' | 'down' | 'flat' | null   // null = poucos dados (<3 amostras)
  samples: number
  correct: number
  enough_data: boolean
  is_target: boolean                     // true se está entre os alvos do guia ativo
  last_seen: string | null
}

// Nível CEFR estimado (derivado na leitura, sem chamada extra ao Gemini)
export interface TutorLevel {
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | null
  preliminary: boolean
}

// Sugestão determinística de próximo foco de estudo
export interface TutorNextFocus {
  concept_slug: string
  concept_label: string
  reason: string
}

// Guia de estudo ativo (US4)
export interface TutorGuide {
  id: number
  language: string
  description: string
  target_concepts: string[]
  created_at: string
  updated_at: string
}

// Payload completo da tela de progresso (GET /tutor/progress)
export interface TutorProgress {
  language: string
  level: TutorLevel
  next_focus: TutorNextFocus | null
  active_guide: TutorGuide | null
  skills: TutorSkill[]
}
