# Design Guide — Meu Dia + Time-blocking (fatia 016)

Complementa o guia canônico [`010/frontend-design-guide.md`](../010-kaguya-tasks-app/frontend-design-guide.md).
**Fonte de fidelidade pixel-a-pixel**: o protótipo
`docs/claude_design/design_handoff_kaguya_tarefas/kaguya/screens-today.jsx` (+ as classes
`day-hero`, `capacity`, `daycol`, `plan-card`, `review-card` em `kaguya/styles.css`). Reimplementar no
stack real (React/TS no shell `pages/kaguya/`), **não** copiar o JSX. Reusar os tokens `--kg*` / `--p-*`
já escopados em `.kg-app`.

A `TodayScreen.tsx` atual (versão MVP) é **substituída** por esta tela rica de Meu Dia.

---

## Layout — duas colunas (`day-grid`)

```
┌───────────────────────────────────────── day-hero ─────────────────────────────────────────┐
│ Meu Dia · {saudação}                                                          ┌───────────┐ │
│ Quarta, 13 de junho                                                           │ kaguya.jpg│ │
│ Seu plano soma 3h com 4h de agenda. Há 2 de ontem esperando decisão.          └───────────┘ │
│ [ 3 no plano ] · [ 3h estimado ] · [ 1h de folga / +30min acima ]                            │
└──────────────────────────────────────────────────────────────────────────────────────────┘
┌───────────────── coluna esquerda (plano) ─────────────────┐ ┌──── coluna direita (sticky) ────┐
│ ▸ Pendências de ontem (review-cards: Hoje/Amanhã/Depois)  │ │  CapacityBar ("Cabe no seu dia?")│
│ ▸ QuickAdd ("Adicionar ao dia…")                          │ │  DayTimeline 07h–23h            │
│ ▸ No plano de hoje (plan-cards, draggable →)              │ │   (arraste plan-card p/ a hora) │
│ ▸ Sugestões (vence em breve · botão "+ Puxar")            │ │                                 │
└───────────────────────────────────────────────────────────┘ └─────────────────────────────────┘
```

`< 860px`: vira 1 coluna; a coluna direita (capacity + timeline) desce abaixo do plano (a
responsividade plena é Fase 5).

---

## Componentes

### Hero (`day-hero`)
- Eyebrow `Meu Dia · {greet()}` (DM Mono), título por extenso (Hanken 800), sub com totais.
- **3 stats** (`dhm`): **no plano** (contagem), **estimado** (`fmtEst(totalEst)`), **folga/acima**
  (verde quando há folga; vermelho-lacre `--p-high` com prefixo `+` quando excede). Mapeiam direto ao
  objeto `capacity` do `GET /api/tasks/my-day`.
- Retrato `kaguya.jpg` (já servido em `frontend/public/kaguya.jpg`) emoldurado à direita; some em
  telas estreitas.

### Pendências de ontem (`review-card`)
- Só renderiza se houver. Cabeçalho `review-head` (ícone `reschedule` + "Pendências de ontem" +
  contagem). Cada card: check para concluir + título + meta ("venceu … · Lista") + 3 botões
  `review-actions`: **Hoje** (primary), **Amanhã**, **Depois**.
- Ações chamam `POST /api/tasks/{id}/reschedule {when}` (today/tomorrow/later). **Depois** = `later`
  (`my_day_date=NULL`), nunca apaga a tarefa.

### Plano de hoje (`plan-card`, draggable)
- Cartão com traço de prioridade (`--pr-color`), check, glyph de tipo (event/birthday), título, chips
  (hora do bloco quando houver, lista) e estimativa (`pc-est`) à direita.
- `draggable`: `onDragStart` põe o id no `dataTransfer`; soltar na timeline grava o bloco.
- Clique abre o TaskModal.

### Sugestões
- `plan-card` sem drag, com `DateChip` da data de vencimento + botão **"+ Puxar"** →
  `POST /api/tasks/{id}/my-day` (entra no plano). Régua: vence nos próximos ≤7 dias (FR-004).

### CapacityBar (`capacity`)
- Título "Cabe no seu dia?"; números "Xh de tarefas + Yh de agenda · livre Z / passou W".
- Track segmentado: **agenda** (eventos do Calendar), **tarefas** (`--kg`), **excedeu**
  (`--p-high`) quando o total passa a janela livre. Marcador no 100% = limite do dia (janela 8h–22h).
- Alimentada pelo objeto `capacity` do endpoint (não recalcular no front além do layout das larguras).
  Quando `calendar_ok: false`, mostrar nota "agenda indisponível" e tratar `agenda_min=0`.

### DayTimeline (`daycol` / `timeline`)
- Régua horária **07h–23h** (`DAY_START=7`, `DAY_END=23`). Cada hora é uma dropzone (`tl-hour`,
  `drop-ok` no hover de drag).
- Eventos do Calendar (`tl-slot event`) e tarefas com bloco (`tl-slot task`) posicionados por
  `top`/`height` proporcionais ao minuto/duração. Soltar uma tarefa numa hora →
  `POST /api/tasks/{id}/time-block { start_at }` (a estimativa vira a altura/duração; sem estimativa,
  bloco padrão 30min).
- Clique num bloco de tarefa abre o TaskModal.

---

## Constantes (do protótipo — manter)

- `DAY_START = 7`, `DAY_END = 23` (timeline).
- Janela livre da capacity: **8h–22h** = 840 min (`FREE_WINDOW`).
- Duração padrão de bloco sem estimativa: **30 min**.
- Tudo no fuso `America/Sao_Paulo`.

---

## Notas de paridade

A timeline e a CapacityBar são **webapp-only** (visuais). No Telegram, a Kaguya relata o plano + o
capacity em texto (FR-010): "Plano de hoje: 5 tarefas · ~3h estimadas · 4h de agenda · folga de 1h."
