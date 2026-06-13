# Design Guide — Command Palette + Atalhos + Recorrência no Quick-add (fatia 018)

Complementa [`010/frontend-design-guide.md`](../010-kaguya-tasks-app/frontend-design-guide.md).
**Fonte de fidelidade**: `docs/claude_design/design_handoff_kaguya_tarefas/kaguya/components.jsx`
(`CommandPalette`, `NAV_COMMANDS`) + classes `cmdk*` em `kaguya/styles.css`. Reimplementar no shell
`pages/kaguya/` (novo `components/CommandPalette.tsx`), reusando tokens `--kg*`/`--ink-*`.

---

## Command Palette (`cmdk`)

Overlay centrado sobre um scrim (`cmdk-scrim`; clique fora fecha). Estrutura:

```
┌──────────────── cmdk ────────────────────────────────────────┐
│ 🔎  [ Criar, buscar ou navegar…              ]          esc   │  ← cmdk-input-wrap (+ mirror)
├───────────────────────────────────────────────────────────────┤
│ CRIAR                                                          │
│  ➕ Criar "ligar pro dentista"   Inbox · amanhã · Alta    ↵    │
│ TAREFAS                                                        │
│  ▦ revisar relatório            Trabalho · sexta              │
│ PROJETOS                                                       │
│  ▦ Casa                         3 abertas                      │
│ NAVEGAR                                                        │
│  ☀ Ir para Meu Dia                                            │
├───────────────────────────────────────────────────────────────┤
│ ↑↓ navegar   ↵ selecionar   esc fechar              (cmdk-foot)│
└───────────────────────────────────────────────────────────────┘
```

- **Input com mirror** (`cmdk-mirror`): mesma técnica do QuickAdd — espelha os tokens reconhecidos
  pelo `parseTask` (lista/data/prioridade/tag/**recorrência**) coloridos. Scroll sincronizado.
- **Resultados agrupados** (`cmdk-group-label`): **Criar** (só quando há texto) → **Tarefas** →
  **Projetos** → **Navegar**. Com texto vazio, mostra só **Navegar** (default).
- **Item Criar** (`cmdk-create`): título interpretado + sub com lista/data/prioridade; `↵` o executa
  via `taskFromParse(parsed)` → `createTask` (mesmo caminho do QuickAdd, incl. recorrência).
- **Busca**: tarefas abertas por título (`GET /api/tasks/search?q=`), listas por nome (da sidebar já
  carregada). Selecionar tarefa → TaskModal; lista → `navigate('list', projectId)`.
- **Navegar** (`NAV_COMMANDS`): Meu Dia (`today`/`sun`), Lista (`list`), Kanban (`board`), Calendário
  (`calendar`), Eisenhower (`eisenhower`/`grid2x2`), Hábitos (`habits`/`loop`). Ajustar os nomes de
  view ao enum real `KaguyaView` (`today|list|kanban|calendar|eisenhower|habits`).

### Teclado
- **⌘K/Ctrl+K**: abre (handler global, `preventDefault` para não colidir com o navegador).
- **↑/↓**: move `active` (clamp 0..n-1). **Enter**: executa o item ativo. **Esc**: fecha.
- Ao abrir: limpa o texto, foca o input, `active=0`. `active` reseta a cada mudança de texto.

---

## Atalhos globais (handler no `KaguyaShell`)

| Tecla | Ação | Guarda |
|---|---|---|
| ⌘K / Ctrl+K | abre Command Palette | sempre |
| C | abre TaskModal de criação | só fora de input/textarea/contenteditable |
| Enter | edita inline a tarefa em foco (Lista) | só na ListScreen, fora de input |
| Space / X | completa/reabre a tarefa em foco (Lista) | só na ListScreen, fora de input |

Guarda obrigatória: ignorar quando `document.activeElement` é `input`/`textarea`/`[contenteditable]`
(senão quebra a digitação — SC-003). "Tarefa em foco" é estado local da `ListScreen` (navegável por
↑↓), sem estado global (regra de `pages/CLAUDE.md`).

---

## Recorrência no parser (`lib/parseTask.ts`)

Estender a interface e o tokenizador (hoje reconhece `@lista`, `#tag`, `!prioridade`, datas):

```ts
export interface ParsedTask {
  // … campos atuais …
  recur: { mode: 'fixed' | 'after_completion'; rule: string /* RRULE */; label: string } | null
}
```

- **Detecção por frase** (multi-token): casar, sobre o texto, padrões como
  `todo dia (\d{1,2})`, `toda (segunda|terça|…|domingo|seg|ter|…)`, `a cada (\d+) dias?`, `todo mês`,
  `todo ano`. Diferente de `@/#/!` (um token), a recorrência consome **vários** tokens — removê-los do
  título e pintá-los com `cls: 'tok-recur'` no `segments` (adicionar a cor no `kaguya.css`).
- **Mapa para RRULE**: reusar a aritmética do backend (`agents/kaguya/recurrence.py:build_rrule`) como
  referência da régua; no front, montar a RRULE equivalente (`FREQ=MONTHLY;BYMONTHDAY=10`,
  `FREQ=WEEKLY;BYDAY=FR`, `FREQ=DAILY;INTERVAL=2`, etc.) + a `label` pt-BR (`describe_rrule`).
- **Âncora**: derivar a `due_date` coerente (próximo dia 10, próxima sexta…) — a 012 exige data para
  anexar recorrência. Se não der para inferir, devolver `recur=null` (não quebra).
- **Consumo no `QuickAdd`/palette**: passar `recurrence: { rrule, mode }` ao `createTask` quando
  `parsed.recur` existir (o backend `set_recurrence` faz o resto). Preview chip de recorrência no
  `kg-qa-preview`, como os demais tokens.

> **Teste**: criar `webapp/.../lib/parseTask.recur.test.ts` (ou estender o teste do parser) cobrindo
> cada padrão de FR-005 → RRULE/modo/label/âncora corretos (SC-004), no espírito dos testes
> determinísticos de `parseDate`.
