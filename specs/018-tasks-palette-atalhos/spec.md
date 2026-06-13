# Feature Specification: Command Palette ⌘K + Atalhos + Recorrência no Quick-add (fatia 018)

**Feature Branch**: `018-tasks-palette-atalhos`

**Created**: 2026-06-13

**Status**: Planejada — não implementada. Reúne três peças de **UX de entrada keyboard-first** que o
handoff descreve mas o webapp ainda não tem. Fonte de design:
`docs/claude_design/design_handoff_kaguya_tarefas/README.md` (§6.7, §7, §11) + protótipo
`docs/claude_design/design_handoff_kaguya_tarefas/kaguya/components.jsx` (`CommandPalette`,
`NAV_COMMANDS`).

**Spec master**: [`specs/010-kaguya-tasks-app/`](../010-kaguya-tasks-app/spec.md) — recorta parte da
**Fase 5 (polish)**: o Command Palette e a navegação por teclado da **User Story 5** (ver **SC-002**
"⌘K → Enter cria em <5s" e **SC-008** "todas as views navegáveis sem mouse"), mais o reforço do
**quick-add determinístico** (**FR-012**) com o token de **recorrência** (**FR-014**). Constrói sobre
as Fases 1–4. O frontend segue o **guia canônico**
[`frontend-design-guide.md`](../010-kaguya-tasks-app/frontend-design-guide.md) + o
[`design-guide.md`](design-guide.md) desta fatia.

**Input**: "Command Palette ⌘K (cria/busca/navega, parsing pt-BR ao vivo, navegação ↑↓↵esc) +
atalhos globais (C nova, Enter edita, Space/X completa) + completar o parser do quick-add com o token
de **recorrência** (`todo dia 10`, `toda sexta`, `a cada 2 dias`, `todo mês`), que hoje falta — a
recorrência só é configurável pelo TaskModal. Sem lembretes proativos e sem responsividade mobile
(ficam para outra fatia da Fase 5)."

---

## Escopo da fatia

**Entra na 018**:

- **Command Palette (⌘K)** — um overlay com campo único que **cria, busca e navega**:
  - digitar texto → opção **"Criar 'título'"** (com o parsing pt-BR ao vivo: lista/data/prioridade/
    tags/recorrência espelhados, igual ao quick-add);
  - **buscar** tarefas abertas (por título) e listas (por nome);
  - **navegar** para as views (Meu Dia, Lista, Kanban, Calendário, Eisenhower, Hábitos);
  - navegação por teclado: **↑↓** move, **↵** executa, **esc** fecha; resultados agrupados
    (Criar / Tarefas / Projetos / Navegar).
- **Atalhos globais de teclado** — **⌘K**/**Ctrl+K** abre a palette; **C** abre "Nova tarefa";
  **Enter** edita a tarefa em foco (na Lista); **Space** ou **X** completa/reabre a tarefa em foco;
  respeitando campos de texto (não disparar atalho enquanto digita num input).
- **Recorrência no quick-add (parser determinístico)** — estender
  `webapp/.../lib/parseTask.ts` para reconhecer o **token de recorrência** em frases pt-BR e devolver
  `recur {mode, rule, label}` (RRULE), pintando o trecho no mirror (`tok-recur`); o `QuickAdd` (e a
  palette) passam `recurrence` ao criar. O motor de recorrência já existe no backend (`set_recurrence`
  + `recurrence.build_rrule`/`describe_rrule`).

**Fica para depois (outras fatias da Fase 5)**: **lembretes proativos via Telegram** (scheduler no
coordinator — FR-023/SC-007); **responsividade mobile completa** e **animações de polish** (FR
SC-008 parte visual). Esta fatia entrega a base keyboard-first do desktop, não o pacote inteiro da
Fase 5.

**Sem migração de schema**: nada de banco novo. O Command Palette e os atalhos são frontend; a
recorrência no quick-add reusa a recorrência já existente (Fase 2 / 012).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Criar, buscar e navegar pelo Command Palette (Priority: P1)

Tecla **⌘K** em qualquer view e abro um campo único. Se digito "ligar pro dentista amanhã !alta" e
aperto **↵**, a tarefa nasce com data de amanhã e prioridade alta — sem tocar no mouse. Se digito o
nome de uma tarefa existente, ela aparece nos resultados e ↵ a abre. Se digito "kanban", navego para o
Kanban. ↑↓ percorrem os resultados, **esc** fecha.

**Why this priority**: é o núcleo da fatia e o gesto keyboard-first central (Linear/Todoist). Sozinho
já entrega o "criar em segundos" (SC-002) e o "navegar sem mouse" (SC-008).

**Independent Test**: abrir a palette por ⌘K; digitar uma captura e confirmar que ↵ cria a tarefa com
a interpretação correta; buscar uma tarefa existente e abri-la; navegar para uma view por nome; em
todos, usar só o teclado.

**Acceptance Scenarios**:

1. **Given** qualquer view, **When** tecla ⌘K (ou Ctrl+K), **Then** abre a palette com o campo focado e a lista de "Navegar" por padrão.
2. **Given** a palette aberta, **When** digito "comprar café amanhã !alta" e aperto ↵, **Then** a tarefa é criada com `due_date=amanhã` e `priority=3`, a palette fecha e a view recarrega — sem usar o mouse (SC-002).
3. **Given** a palette com texto que casa uma tarefa aberta, **When** seleciono o resultado da tarefa e aperto ↵, **Then** o TaskModal dela abre.
4. **Given** a palette, **When** digito o nome de uma lista e seleciono o resultado "Projeto", **Then** navego para a Lista daquele projeto.
5. **Given** a palette, **When** digito "eisenhower" e ↵, **Then** navego para a view Eisenhower.
6. **Given** a palette aberta, **When** uso ↑↓ para mover e esc para fechar, **Then** a seleção muda e a palette fecha — tudo por teclado.

---

### User Story 2 - Atalhos globais de teclado (Priority: P2)

No desktop, opero o app sem o mouse: **C** abre "Nova tarefa"; na Lista, **Enter** edita o título da
tarefa em foco e **Space** (ou **X**) completa/reabre. Os atalhos não disparam enquanto eu digito num
campo de texto.

**Why this priority**: completa o keyboard-first além da palette (SC-008). Depende de uma noção de
"tarefa em foco" na Lista.

**Independent Test**: com a Lista aberta, focar uma tarefa, completar com Space e reabrir; abrir Nova
tarefa com C; confirmar que digitar "C" dentro de um input **não** abre o modal.

**Acceptance Scenarios**:

1. **Given** qualquer view (fora de um input), **When** tecla **C**, **Then** abre o TaskModal de criação.
2. **Given** a Lista com uma tarefa em foco, **When** tecla **Space** ou **X**, **Then** a tarefa é completada (ou reaberta se já concluída).
3. **Given** a Lista com uma tarefa em foco, **When** tecla **Enter**, **Then** entra na edição inline do título.
4. **Given** o cursor dentro de um input/textarea, **When** digito "c" ou "x", **Then** o caractere é digitado normalmente e **nenhum** atalho dispara.

---

### User Story 3 - Recorrência direto no quick-add (Priority: P3)

Capturo "pagar aluguel todo dia 10 @Finanças !alta" no quick-add (ou na palette) e a tarefa nasce
**recorrente** (todo dia 10), sem eu abrir o TaskModal para configurar a repetição. O trecho de
recorrência é destacado ao vivo no mirror, como os outros tokens.

**Why this priority**: fecha a paridade do quick-add determinístico com o handoff (§7) e remove uma
fricção real. Depende da recorrência da Fase 2 (já no backend) e do parser existente.

**Independent Test**: digitar capturas com cada padrão de recorrência e confirmar o RRULE/modo
resultante e o destaque no mirror; criar pela palette/quick-add e ver a recorrência ativa na tarefa.

**Acceptance Scenarios**:

1. **Given** o quick-add, **When** digito "pagar aluguel todo dia 10", **Then** a tarefa nasce com recorrência mensal no dia 10 (modo `fixed`) e o trecho "todo dia 10" é pintado como recorrência no mirror.
2. **Given** o quick-add, **When** digito "treinar a cada 2 dias", **Then** a recorrência é "a cada 2 dias" (intervalo 2) e o título limpo é "treinar".
3. **Given** o quick-add, **When** digito "reunião toda sexta 9h", **Then** nasce recorrente semanal na sexta, com hora 09:00, título "reunião".
4. **Given** um texto **sem** padrão de recorrência, **When** crio a tarefa, **Then** nenhuma recorrência é anexada (comportamento atual preservado).
5. **Given** a recorrência criada pelo quick-add, **When** abro a tarefa no TaskModal, **Then** o controle de repetição reflete a mesma regra (é o mesmo dado).

---

### Edge Cases

- **Atalho dentro de input**: ⌘K funciona em qualquer lugar, mas **C/X/Space/Enter** **não** disparam
  quando o foco está num `input`/`textarea`/`contenteditable` (senão quebra a digitação).
- **Palette sem texto**: mostra as opções de **Navegar** (default), sem "Criar".
- **"Criar" com parsing**: a opção Criar usa o **mesmo** `parseTask` do quick-add — lista/data/
  prioridade/tags/recorrência aplicadas na criação; lista `@x` inexistente cai no Inbox (com aviso),
  igual ao quick-add.
- **Recorrência exige data-âncora**: o backend só anexa recorrência a uma tarefa com `due_date`
  (regra da 012). Quando o padrão de recorrência implica uma data (ex.: "todo dia 10" → próximo dia
  10; "toda sexta" → próxima sexta), o parser MUST derivar a `due_date` âncora coerente; se não der
  para inferir, a tarefa nasce sem recorrência e a UI sinaliza (não quebra).
- **Recorrência é frase multi-token**: diferente de `@x`/`#x`/`!x` (um token), os padrões de
  recorrência são **sequências de palavras** ("a cada 2 dias", "todo dia 10"). O parser precisa casar
  por frase (regex sobre o texto/janela de tokens), consumindo todos os tokens da frase para o título
  limpo e para o mirror.
- **Conflito data × recorrência**: se o usuário digita uma data **e** uma recorrência, a recorrência
  manda na âncora; a data solta é tratada como a primeira ocorrência (decisão registrada em
  Assumptions).
- **Foco e overlay**: abrir a palette tira o foco da view; fechar (esc/clique no scrim) devolve o
  controle. ⌘K não deve conflitar com atalhos do navegador (usar o handler do app, `preventDefault`).

## Requirements *(mandatory)*

### Functional Requirements

**Command Palette**

- **FR-001** (≡ master SC-002/SC-008, US5): O webapp MUST oferecer um **Command Palette** aberto por
  **⌘K/Ctrl+K** que **cria, busca e navega** num campo único, navegável só por teclado (↑↓ move, ↵
  executa, esc fecha).
- **FR-002**: A opção **Criar** MUST usar o **mesmo parser determinístico** do quick-add (`parseTask`),
  aplicando lista/data/prioridade/tags/recorrência na criação e espelhando a interpretação ao vivo.
- **FR-003**: A palette MUST **buscar** tarefas abertas (por título, reusando `search_tasks`/
  `GET /api/tasks/search`) e listas (por nome), e **navegar** para as views (Meu Dia, Lista, Kanban,
  Calendário, Eisenhower, Hábitos); selecionar uma tarefa abre o TaskModal; selecionar uma lista abre
  a Lista do projeto.

**Atalhos**

- **FR-004** (≡ master SC-008): O webapp MUST oferecer atalhos globais — **C** (nova tarefa),
  **Enter** (editar a tarefa em foco na Lista), **Space**/**X** (completar/reabrir a tarefa em foco) —
  **sem** disparar quando o foco está num campo de texto.

**Recorrência no quick-add**

- **FR-005** (≡ master FR-012 + FR-014): O parser do quick-add (`parseTask.ts`) MUST reconhecer o
  **token de recorrência** em pt-BR de forma **determinística** (sem LLM) — pelo menos os padrões
  `todo dia N`, `toda <dia-da-semana>`, `a cada N dias`, `todo mês`, `todo ano`/aniversário — e
  devolver `recur {mode, rule(RRULE), label}` + segmentos com classe `tok-recur`.
- **FR-006**: O `QuickAdd` (e a opção Criar da palette) MUST **passar a recorrência** ao criar a
  tarefa, reusando o motor de recorrência do backend (`set_recurrence` / `recurrence.build_rrule`);
  quando a recorrência implica uma data-âncora, o parser MUST derivá-la (a 012 exige `due_date`).
- **FR-007** (paridade): A recorrência criada pelo quick-add MUST ser a **mesma** entidade que a do
  TaskModal e do Telegram (mesma tabela `task_recurrences`, mesmo motor) — visível e editável em
  qualquer canal.

### Key Entities

Nenhuma entidade nova. O Command Palette e os atalhos são **frontend** (estado de UI). A recorrência
no quick-add reusa a **Recorrência** (`task_recurrences`) já definida na master e implementada na 012.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001** (≡ master SC-002): Criar uma tarefa via ⌘K → digitar → ↵ leva **< 5s** e aplica a
  interpretação correta (data/prioridade/tags/recorrência) — verificável manualmente + teste do parser.
- **SC-002** (≡ master SC-008): Todas as views são alcançáveis pela palette e os atalhos C/Space/X/
  Enter funcionam na Lista **sem mouse** — auditável por checklist.
- **SC-003**: Os atalhos de letra (C/X) **não** disparam dentro de inputs/textarea — teste de
  comportamento.
- **SC-004**: Para cada padrão de recorrência suportado (FR-005), `parseTask` devolve o RRULE/modo/
  label e a âncora corretos — coberto por **teste automatizado do parser** (puro, em
  `webapp/.../lib`), análogo aos testes determinísticos de data.
- **SC-005**: Uma recorrência criada pelo quick-add aparece idêntica no TaskModal e no Telegram
  (mesmo dado) — teste de integração.

## Assumptions

- O parser de recorrência é **determinístico** (sem LLM) no webapp; a interpretação livre em
  linguagem natural continua no Telegram (Gemini), como nas outras fatias.
- Padrões suportados nesta fatia: `todo dia N` (mensal, dia N), `toda <seg..dom>` (semanal),
  `a cada N dias` (intervalo diário), `todo mês`, `todo ano`/aniversário. Padrões mais exóticos
  ("toda primeira segunda do mês") ficam para extensão futura.
- Quando há data **e** recorrência juntas, a recorrência define a âncora e a data solta é a primeira
  ocorrência; sem recorrência, a data é só o vencimento (comportamento atual).
- A "tarefa em foco" para os atalhos da Lista é uma noção de UI local da `ListScreen` (sem estado
  global novo, conforme `pages/CLAUDE.md`).
- Lembretes proativos e responsividade mobile **não** entram nesta fatia (outra(s) fatia(s) da Fase 5).
- O Command Palette e os atalhos são **webapp-only** por natureza (o Telegram já é "linha de comando"
  natural); não há requisito de paridade para a *interface* da palette — só para o **dado** que ela
  cria (recorrência, FR-007).
