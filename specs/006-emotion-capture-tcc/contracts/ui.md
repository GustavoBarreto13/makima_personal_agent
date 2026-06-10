# UI Contract — Registro Emocional (TCC)

**Feature**: 006-emotion-capture-tcc | **Shell**: `pages/violet/` | **Design**: tokens OKLCH do `violet.css`

Duas superfícies de UI: (A) seção de captura na tela **Write**, (B) aba **Emoções** nos Insights.
Reaproveita tokens existentes (`--ink-*`, `--garnet`, `--accent`, `--gold`, `--serif`) e o
padrão visual do prompt de sonho (`.w-prompt`).

---

## A) Seção de captura — `screens/Write.tsx` + `components/EmotionLog.tsx`

Posição: na página do dia, logo abaixo do prompt de sonho (`.w-prompt`) e acima da lista de
bullets. Não interfere nos bullets nem na contagem de palavras.

**Estado vazio (dia sem registros)**: convite discreto, estilo do prompt de sonho —
ícone + texto itálico em `--ink-4` ("Como você se sentiu? Registrar emoção"). Clicar abre o
formulário de novo registro.

**Lista de registros do dia**: cada registro é um cartão (`EmotionLog`) mostrando:
- nome da emoção + intensidade (badge `0–10`), horário (`created_at`) em mono;
- situação/pensamento/resposta como linhas resumidas, expansíveis (texto longo não domina);
- se houver `reappraised_intensity`: mostrar "intensidade após resposta: N";
- ações: editar e excluir.
- Múltiplos registros coexistem, ordenados por horário (US1 cenário 5).

**Formulário (criar/editar)** — campos na ordem do Registro de Pensamentos da TCC:
1. **Situação** (textarea opcional) — "O que aconteceu?"
2. **Emoção** (obrigatória) — seletor com as emoções (`is_predefined` distinguíveis das custom)
   + opção "adicionar emoção" (campo de texto → `POST /emotions`).
3. **Intensidade** (obrigatória) — controle 0–10 (slider ou stepper limitado ao intervalo).
4. **Pensamento automático** (textarea opcional).
5. **Resposta adaptativa** (textarea opcional).
6. **Reavaliação de intensidade** (0–10) — **desabilitada** até a resposta adaptativa ter texto
   (regra D3 / edge case da spec).

- Salvar com só emoção + intensidade é permitido (acceptance 2). Tentar salvar sem emoção:
  bloquear e sinalizar o campo (acceptance 3).
- Editar reabre o formulário preenchido; campos opcionais podem ser completados depois
  (acceptance 4).

**Cor**: usar `--garnet` para o acento emocional do cartão (mesma família do destaque/favorito),
mantendo coerência visual com o restante do Violet. Não obrigatório, mas recomendado.

---

## B) Aba "Emoções" — `screens/Insights.tsx`

Adicionar `'Emoções'` ao array `TABS`. A aba consome `violetApi.emotionStats(year)`, onde `year`
é a variável já existente na tela (integra com o filtro de ano da spec 005 quando este existir).

**Conteúdo (quando há registros)**:
- **Big numbers** (reusar `.ins-bignums`/`.ins-bignum`): total de registros, intensidade média,
  emoção mais frequente.
- **Lista por emoção** (reusar `.ins-bars` ou lista simples): cada emoção com contagem e
  intensidade média, ordenada por frequência (US3 cenário 2).
- **Distribuição mensal** (reusar `<AreaChart data={by_month} />`): registros ao longo do ano
  (US3 cenário 3).

**Estado vazio (ano sem registros)**: mensagem convidando a registrar — sem erro
(US3 cenário 4), no estilo dos estados vazios atuais (`color: var(--ink-3)`).

---

## Tipos TypeScript (`pages/violet/types.ts`)

```ts
export interface Emotion {
  id: number
  name: string
  is_predefined: boolean
}

export interface EmotionLog {
  id: number
  page_id: number
  emotion_id: number
  emotion_name: string
  intensity: number                 // 0–10
  situation: string | null
  automatic_thought: string | null
  adaptive_response: string | null
  reappraised_intensity: number | null
  created_at: string                // ISO
}

export interface EmotionStats {
  total: number
  avg_intensity: number
  top_emotion: string | null
  by_emotion: { name: string; count: number; avg_intensity: number }[]
  by_month: number[]                // 12 posições
}
```

## `violetApi` (em `lib/api.ts`)

```ts
listEmotions:    () => api.get<Emotion[]>('/api/journal/emotions'),
createEmotion:   (name: string) => api.post('/api/journal/emotions', { name }),
emotionLogs:     (pageId: number) => api.get<EmotionLog[]>(`/api/journal/emotion-logs?page_id=${pageId}`),
createEmotionLog:(body) => api.post('/api/journal/emotion-logs', body),
updateEmotionLog:(id, body) => api.patch(`/api/journal/emotion-logs/${id}`, body),
deleteEmotionLog:(id) => api.del(`/api/journal/emotion-logs/${id}`),
emotionStats:    (year: number) => api.get<EmotionStats>(`/api/journal/emotion-stats?year=${year}`),
```
