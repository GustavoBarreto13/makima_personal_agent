// Tipos da Violet · Diário — espelham o que a API /api/journal/* devolve (spec 076).

export type BulletKind = 'bullet' | 'highlight' | 'dream' | 'idea' | 'wisdom' | 'note'
export type Font = 'normal' | 'roteiro' | 'cursiva'

export interface BulletTutorMeta {
  analysis_id: number
  has_correction: boolean
  error_count: number
  /** Só no cliente: o texto mudou depois da análise. */
  stale?: boolean
}

export interface Bullet {
  id: number
  page_id: number
  kind: BulletKind
  content: string
  position: number
  created_at: string | null
  favorite: boolean
  tutor?: BulletTutorMeta | null
}

/** O dia. Sem conteúdo ainda, `id` é null (ler não cria página). */
export interface Page {
  id: number | null
  date: string
  type_id: number
  dream: string | null
  font: Font | null
  num: number
  created_at: string | null
  updated_at: string | null
}

export interface PageResponse { page: Page; bullets: Bullet[] }

export interface EntryListItem {
  date: string
  num: number
  font: Font | null
  excerpt: string
  excerpt_kind: 'bullet' | 'dream' | 'letter' | null
  bullet_count: number
  word_count: number
  emotion_count: number
  letter_count: number
  has_highlight: boolean
  has_dream: boolean
  has_favorite: boolean
  has_counsel: boolean
}

export interface CollectionItem {
  id: number
  kind: BulletKind
  content: string
  favorite: boolean
  created_at: string | null
  date: string
  font: Font | null
  entry_num: number | null
}

export interface DreamItem { page_id: number; date: string; font: Font | null; entry_num: number; dream: string }

export interface MentionCount { value: string; person_id: string | null; count: number; last_date: string }

/** Bullets agrupados por dia (filtro por pessoa/tag/referência e busca). */
export interface DayBullets { date: string; bullets: { id: number; content: string; kind?: BulletKind; favorite?: boolean }[] }

// ── Pessoas e referências ───────────────────────────────────────────────────

export interface PersonSuggestion { id: string; name: string; relationship: string | null; avatar_url: string | null; alias: string | null }

export interface RefProvider { key: string; aliases: string[]; label: string; hint: string }

export interface RefResult {
  agent: string
  entity_type: string
  entity_id: string
  label: string
  sublabel: string | null
  cover_url: string | null
  deep_link: string | null
  token: string
}

export interface RefCount { agent: string; entity_type: string; entity_id: string; label: string; count: number; last_date: string }

// ── Emoções ─────────────────────────────────────────────────────────────────

export interface Emotion { id: number; name: string; is_predefined: boolean }

export interface EmotionLog {
  id: number
  page_id: number
  date?: string
  emotion_id: number
  emotion_name: string
  intensity: number
  situation: string | null
  automatic_thought: string | null
  adaptive_response: string | null
  reappraised_intensity: number | null
  distortions: string[] | null
  created_at: string
}

export interface EmotionFinding {
  id: string
  kind: 'trigger' | 'when' | 'trend' | 'reappraisal' | 'distortion' | 'life' | 'change'
  title: string
  detail: string
  severity: 'alta' | 'media' | 'baixa'
  evidence: number[]
}

export interface EmotionPatterns {
  since: string
  until: string
  summary: {
    total: number
    avg_intensity: number
    avg_relief: number | null
    reappraised: number
    top_emotion: string | null
    by_emotion: { name: string; count: number; avg_intensity: number }[]
    series: { date: string; value: number | null; count: number }[]
    by_hour: { bucket: string; count: number }[]
  }
  findings: EmotionFinding[]
}

export interface Source { n: number; fonte: string; uri: string; titulo: string }

export interface EmotionAnalysis {
  since: string
  until: string
  essay_md: string
  experiments: { titulo: string; como: string; porque: string }[]
  sources: Source[]
  log_count: number
  created_at: string | null
}

// ── Cartas ──────────────────────────────────────────────────────────────────

export interface LetterPerson { id: string; name: string; avatar_url?: string | null }

export interface Letter {
  id: number
  page_id: number
  date?: string
  recipient: string
  title: string | null
  body: string
  font: Font
  status: 'draft' | 'sealed'
  sealed_at: string | null
  created_at: string
  updated_at: string | null
  people: LetterPerson[]
}

// ── Conselho, revisão semanal ───────────────────────────────────────────────

export interface CounselAction { texto: string; motivo: string; task_id: number | null }

export interface CounselToolkitItem {
  titulo: string; porque: string; como: string; exemplo_hoje: string; lembrete: string; fonte: string; uri: string; origem: 'base' | 'web'
}

export interface Counsel {
  page_id: number
  date: string
  mirror: string
  essay_md: string | null
  sources: Source[]
  digest: { humor?: string; principios?: string[]; observacoes?: string[] }
  /** Formato antigo (spec 061) — conselhos gerados antes da 076. */
  toolkit: CounselToolkitItem[]
  actions: CounselAction[]
  used_web: boolean
  tokens_in: number | null
  tokens_out: number | null
  created_at: string | null
  updated_at: string | null
}

export interface CounselHistoryItem { page_id: number; date: string; mirror: string; humor: string | null; principios: string[] }

export interface WeeklyReview {
  id: number
  week_start: string
  week_end: string
  verdict: string | null
  tone: 'tapa_na_cara' | 'guia' | null
  essay_md: string
  digest: { foi_bem?: string[]; piorou?: string[]; padroes?: string[] }
  sources: Source[]
  actions: CounselAction[]
  metrics: { forca?: number; forca_antes?: number; dias_escritos?: number; emocao_media?: number; foco_min?: number }
  sent_at: string | null
  created_at: string | null
}

export interface WeeklyReviewItem { id: number; week_start: string; verdict: string | null; tone: string | null; sent: boolean }

// ── Força, Refletir, Insights ───────────────────────────────────────────────

export interface Strength {
  consistency: number
  trend: 'up' | 'down' | 'flat'
  recent_done: number
  recent_total: number
  weekly_target: number
  best: number
  series: { date: string; value: number; done?: boolean }[]
}

export interface DayEntry {
  date: string
  font: Font | null
  dream: string | null
  bullets: { id: number; kind: BulletKind; content: string; favorite: boolean }[]
  bullet_count: number
  words: number
  emotions: { name: string; intensity: number }[]
  letter_count: number
}

export interface ReflectPayload {
  date: string
  prompt: { index: number; text: string }
  gem: { id: number; content: string; date: string; font: Font | null } | null
  idea: { id: number; content: string; date: string; font: Font | null } | null
  focus: { id: number; title: string; why: string | null; life_area: string | null; progress_pct: number | null; days_remaining: number | null; is_overdue: boolean; deep_link: string }[]
  yesterday: { date: string; entry: DayEntry | null }
  week: {
    since: string; until: string
    highlights: { id: number; content: string; date: string }[]
    wisdom: { id: number; content: string; date: string }[]
    ideas: { id: number; content: string; date: string }[]
    favorites: { id: number; content: string; date: string }[]
    new_people: { value: string; person_id: string | null; first_date: string }[]
    new_tags: { value: string; first_date: string }[]
    refs: { agent: string; entity_type: string; entity_id: string; label: string; count: number }[]
  } | null
  pins: { pin: string; kind: 'tag' | 'person'; value: string; label: string; days: { date: string; count: number }[]; total: number }[]
  year_ago: { date: string; entry: DayEntry | null } | null
  memory_lane: { date: string; entry: DayEntry | null; days_ago: number } | null
  stats: { days_written: number; first_date: string | null }
  weekly_review: WeeklyReview | null
}

// ── Valores ─────────────────────────────────────────────────────────────────

export type ScoreKey = 'possibility' | 'importance_now' | 'importance_general' | 'action' | 'satisfaction' | 'concern'

export interface ValuesDomain { key: string; label: string; about: string; questions: string[] }

export interface ValuesGuide {
  intro: { title: string; body: string }[]
  domains: ValuesDomain[]
  scores: { key: ScoreKey; label: string; help: string }[]
  key_question: string
}

export interface ValuesArea extends Partial<Record<ScoreKey, number | null>> {
  domain_key: string
  description?: string | null
  narrative?: string | null
  skipped: boolean
  hints: string[]
}

export interface ValuesRanked {
  domain_key: string; label: string; importance: number | null; satisfaction: number | null; action: number | null
  concern: number | null; gap: number | null; alert: boolean
}

export interface ValuesAssessment {
  id: number
  status: 'draft' | 'complete'
  started_at: string
  completed_at: string | null
  summary_md: string | null
  areas: ValuesArea[]
  commitments: { id: number; domain_key: string; text: string; task_id: number | null; created_at: string }[]
  diagnosis: { alerts: string[]; ranked: ValuesRanked[]; complete: boolean; avg_satisfaction: number | null; avg_action: number | null }
}

// ── Tutor de Idiomas (spec 031) ─────────────────────────────────────────────

export interface TutorError {
  concept_slug: string; concept_label: string; wrong: string; right: string; explanation: string; severity: 'low' | 'medium' | 'high'
}

export interface TutorAnalysis {
  id: number; bullet_id: number; language: string; original_text: string; corrected_text: string; natural_rewrite: string
  errors: TutorError[]; concepts_used_correctly: string[]; summary: string; score: number; created_at: string
}

export interface TutorAnalysisSummary { id: number; bullet_id: number; score: number; error_count: number; summary: string; created_at: string }
export interface TutorConcept { slug: string; label: string }
export interface TutorSkill {
  concept_slug: string; concept_label: string; mastery_pct: number; trend: 'up' | 'down' | 'flat' | null; samples: number
  correct: number; enough_data: boolean; is_target: boolean; last_seen: string | null
}
export interface TutorGuide { id: number; language: string; description: string; target_concepts: string[]; created_at: string; updated_at: string }
export interface TutorProgress {
  language: string
  level: { level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | null; preliminary: boolean }
  next_focus: { concept_slug: string; concept_label: string; reason: string } | null
  active_guide: TutorGuide | null
  skills: TutorSkill[]
}
