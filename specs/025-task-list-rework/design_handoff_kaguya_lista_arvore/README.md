# Handoff: Lista de Tarefas como Árvore + Subtarefas globais (Kaguya · Tarefas)

## Overview
Reformulação da **visão de Lista** do app de tarefas "Kaguya" para uma **árvore hierárquica** onde
**toda subtarefa é uma tarefa de primeira classe** — uma tarefa normal que apenas aponta para uma
tarefa-mãe (`parent`). O objetivo é permitir aninhamento em qualquer profundidade, arrastar para
reordenar/re-parentear, adicionar inline, promover uma subtarefa a tarefa independente, atribuir
pessoas (do diretório "Komi") e descrições em qualquer nível.

## About the Design Files
Os arquivos deste pacote são **referências de design feitas em HTML/React (via Babel no browser)** —
protótipos que mostram aparência e comportamento pretendidos, **não** código de produção para copiar
diretamente. A tarefa é **recriar este design no ambiente do codebase de destino** (React, Vue,
SwiftUI, etc.) usando os padrões e bibliotecas já estabelecidos lá. Se ainda não houver ambiente,
escolha o framework mais apropriado e implemente o design nele.

O protótipo roda abrindo `Kaguya - Tarefas.html`. A lógica relevante a esta feature está em
`kaguya/tasktree.jsx` (componente de árvore), `kaguya/data.js` (modelo + helpers), `kaguya/app.jsx`
(mutações), `kaguya/screens-list.jsx` (tela), `kaguya/modals.jsx` (editor) e `kaguya/styles.css`.

## Fidelity
**High-fidelity (hifi).** Cores, tipografia, espaçamento e interações são finais. Recrie a UI
fielmente usando as bibliotecas/padrões do codebase. Os valores exatos estão em "Design Tokens".

---

## Modelo de Dados (o coração da mudança)

Antes: cada tarefa guardava um array `subtasks: [{id,title,done,prio,notes}]` (objetos leves, 1 nível).

Agora: **estrutura plana global**. Toda tarefa (raiz ou subtarefa) é o mesmo objeto e a hierarquia é
expressa por `parent`:

```ts
type Task = {
  id: string;
  title: string;
  parent: string | null;     // ← NOVO. null = tarefa de topo. Caso contrário, id da mãe.
  assignees: string[];       // ← NOVO. ids de pessoas (ver "Pessoas / Komi")
  project: string;           // id do projeto/lista
  col: 'todo'|'week'|'doing'|'done';
  prio: 0|1|2|3;             // 0 sem prioridade … 3 alta
  due: string | null;        // ISO 'YYYY-MM-DD'
  time: string | null;       // 'HH:MM'
  est: number | null;        // minutos
  type: 'task'|'event'|'birthday';
  tags: string[];
  notes: string;             // descrição (qualquer nível)
  recur: object | null;
  done: boolean;
  today: boolean;
  pos: number;               // ordem entre IRMÃOS (só comparado dentro do mesmo parent)
};
```

**Regras / invariantes:**
- Uma subtarefa é uma `Task` com `parent != null`. Não há nenhum array `subtasks` embutido.
- `pos` ordena **irmãos** (mesmo `parent`). É um número fracionável: ao inserir entre dois irmãos,
  usa-se o ponto médio `(lo+hi)/2` (sem reindexar o resto).
- Ao re-parentear para dentro de uma mãe, a subtarefa **herda o `project`** da mãe (mantém o grupo
  visual coeso). Ao promover para o topo, mantém o próprio `project`.
- **Proibido criar ciclo**: nunca soltar uma tarefa dentro de um descendente dela mesma
  (`isDescendant` valida).
- Excluir uma tarefa **exclui recursivamente** todos os descendentes.
- Concluir uma tarefa recorrente **clona a subárvore inteira** (reset de `done`) para a próxima data.

**Helpers de árvore** (em `data.js`, recrie equivalentes no backend/seletor):
- `childrenOf(id)` → filhos diretos.
- `rootTasks(list)` → tarefas com `parent == null`.
- `descendantsOf(id)` → todos os descendentes (DFS).
- `parentOf(task)`, `taskDepth(task)` (profundidade, cap 12).
- `subProgress(id)` → `{done, total}` dos filhos **diretos** (usado no anel do Kanban e no contador `done/total`).
- `isDescendant(maybeChildId, ancestorId)` → guarda anti-ciclo.

---

## Screens / Views

### 1. Lista (visão principal desta feature) — `screens-list.jsx`
**Purpose:** ver e gerenciar a hierarquia completa de tarefas de um projeto ou smart list.

**Layout (top→bottom):**
1. **Cabeçalho** (`.page-head`): ícone do projeto (chip 30×30, raio 9px, fundo = cor do projeto a 16% alpha) + nome (título). Sublinha: `"{N} abertas · arraste para aninhar ou reordenar"`.
2. **QuickAdd** (`.quick-add`): input com parser inline pt-BR (cria tarefa de topo). Já existente; reutilizar.
3. **Toolbar** (`.toolbar`, flex, gap 9px, wrap):
   - Chips de filtro de prioridade: `Tudo`, `Alta+`, `Média+`, `Baixa+` (pílulas, raio 999px).
   - À direita: chip `Concluídas` (toggle mostrar feitas), botão `Agrupar: {Projeto|Prioridade|Nenhum}`, botão `{Manual|Inteligente|Vencimento|Prioridade}` (ordenação).
4. **Lista** (`.task-list`): uma ou mais **seções/grupos**. Cada grupo (`.task-group`):
   - Cabeçalho colapsável (`.task-group-head`): caret + ponto colorido + nome + contador de abertas.
   - Corpo (`.task-group-body`): a **árvore** (`TaskTree`) + linha "Adicionar tarefa" (`.tree-addroot`).
   - Quando o escopo é um único projeto, não há cabeçalho de grupo (uma seção só).

**Agrupamento (`groupBy`):** `project` (padrão; agrupa raízes por projeto), `prio` (grupos Alta/Média/Baixa/Sem), `none` (uma seção). Quando o escopo já é um projeto, força `none`.

**Ordenação (`sort`) entre irmãos:** `manual` (= `pos`, padrão — habilita arrasto-para-reordenar), `smart`, `due`, `prio`. Aplicada recursivamente em cada nível de irmãos.

**Filtro de filhos:** o toggle "Concluídas" esconde subtarefas feitas (`childFilter = t => showDone || !t.done`). As raízes já são filtradas antes.

### 2. Editor de tarefa (modal) — `modals.jsx` › `TaskModal`
**Purpose:** editar todos os campos de uma tarefa, gerenciar suas subtarefas reais e atribuir pessoas.

Campos (ordem): **Banner de mãe** (se `parent != null`) → Título → Tipo → Prioridade → Projeto/Estimativa → Vencimento/Horário → Repetir → **Pessoas (Komi)** → Tags → **Subtarefas** → Notas.

- **Banner de mãe** (`.parent-banner`): `"Subtarefa de «título da mãe»"` + botão `Tornar independente` (chama `promote`). Clicar no nome da mãe abre a mãe.
- **Pessoas** (`.people-pick`): chips toggláveis com avatar de iniciais para cada pessoa do diretório.
- **Subtarefas** (`.subtask-list`):
  - Tarefa **existente**: lista os **filhos reais** (`childrenOf`). Cada linha: checkbox (toggle done), título (clique abre a subtarefa como tarefa), avatares dos responsáveis, botão de prioridade (cicla 0→3), botão "abrir", excluir. Campo "Adicionar subtarefa e Enter…" cria um filho real imediatamente.
  - Tarefa **nova** (ainda não salva): lista local `pendingSubs`; ao salvar, viram filhos reais com `parent = id da nova tarefa`.

### 3. Onde o modelo global também aparece
- **Kanban** (`screens-board.jsx`): os cards mostram **apenas tarefas de topo** (`!t.parent`). O anel de progresso usa `subProgress(task.id)`. Avatares dos responsáveis aparecem no card.
- **Meu Dia / Eisenhower**: consomem o mesmo modelo (sem mudança visual; subtarefas com `due`/`today` próprios podem aparecer porque são tarefas normais).

---

## Componente: TaskTree / TreeRow (`tasktree.jsx`)

`TaskTree` renderiza `roots` recursivamente; mantém estado local de `collapsed`, `dragId`, `drop`.
`TreeRow` é uma linha. Da esquerda p/ direita:

`[guias de indentação] [espaçador = depth×22px] [alça de arraste] [caret/colapso] [checkbox 17px] [ponto de prioridade] [corpo: título + nota] [meta: avatares · 1 tag · data · flag] [ações ao hover]`

**Guias de indentação** (`.tree-guides i`): linhas verticais 1px em `left = 13 + i*22` para `i` em `0..depth-1`.

**Profundidade:** indentação = `depth * 22px` via espaçador. Caret só quando há filhos; senão um placeholder "fantasma" do mesmo tamanho mantém alinhamento.

**Contador** (`.tree-count`): pílula mono `done/total` (de `subProgress`), clicável p/ colapsar.

**Ações ao hover** (`.tree-actions`, posicionadas absolutas à direita, aparecem no hover sobre a meta):
- "Marcar pessoa" (abre popover `AssigneePicker`),
- "Adicionar subtarefa" (+),
- "Tornar tarefa independente" (↗, só se `parent`),
- "Abrir" (lápis).

### Interações principais (recriar a lógica em `app.jsx › treeApi`)
- **Concluir:** checkbox → `onComplete(task, done)`. Há um "pop" de 160ms antes de marcar.
- **Editar título inline:** clicar no título entra em edição (`editingId`). Teclas no input:
  - **Enter** → commit + cria **irmã** abaixo e foca nela (`addSibling`).
  - **Tab** → commit + **indenta** (vira filha do irmão imediatamente acima, por `pos`).
  - **Shift+Tab** → commit + **desindenta** (sobe um nível, posicionada logo após a antiga mãe).
  - **Esc** → cancela (e remove a linha se era nova e vazia).
  - **Blur com título vazio numa linha recém-criada** → remove a linha.
- **Adicionar:** `+` cria filho (e expande a mãe, foca p/ editar). "Adicionar tarefa" no rodapé do grupo cria uma raiz.
- **Promover:** `promote(task)` → `parent = null`, vai para o fim das raízes. Toast "Agora é uma tarefa independente".
- **Drag & drop (re-parentear/reordenar):** arrasta pela alça (`.tree-grip`, `draggable`). Ao passar sobre uma linha-alvo, a **zona** é calculada pela posição vertical do mouse:
  - `y < 28%` → **before** (irmã antes do alvo) — linha-guia 2px no topo.
  - `y > 72%` → **after** (irmã depois) — linha-guia 2px na base.
  - meio → **child** (vira filha do alvo) — caixa destacada (ring + tint).
  - `move(dragId, targetId, zone)` aplica: ver regras de `pos`/`project`/anti-ciclo no Modelo de Dados.

---

## Pessoas / Komi
Diretório de pessoas (mock em `data.js › PEOPLE`): `{ id, name }`. Avatares são **iniciais** geradas do
nome, com **cor determinística** por hash do nome (`avatarColor`, paleta `AV_PALETTE` em oklch).
No codebase real, ligar ao diretório de pessoas existente; `assignees` guarda ids.

- `Avatar({id, size})` — círculo com iniciais, `box-shadow: 0 0 0 1.5px var(--card)` (anel separador).
- `AvatarStack({ids, max=3})` — sobreposição com `margin-left: -6px`; excedente vira chip `+N`.
- `AssigneePicker` — popover (244px) com busca + lista de pessoas toggláveis; fecha por scrim fixo.

---

## Design Tokens
Tokens escopados em `.kg-app` (ver `styles.css`). Tema claro "marfim rosado"; suporta tema escuro e
4 acentos via tweaks. Valores principais (tema claro, acento azul padrão):

**Superfícies / tinta / linhas (oklch):**
- `--paper oklch(0.991 0.005 350)`, `--paper-2 0.974 0.008 350`, `--card oklch(1 0.001 350)`, `--card-2 0.978 0.007 350`
- `--ink 0.275 0.020 348`, `--ink-2 0.452`, `--ink-3 0.595`, `--ink-4 0.715` (mesmo C/H)
- `--line 0.905 0.011 348`, `--line-2 0.944 0.008 348`

**Acento (azul padrão) / prioridade / done:**
- `--kg 0.56 0.13 252`, `--kg-deep 0.47 0.13 254`, `--kg-bright 0.69 0.12 250`, `--kg-tint = --kg /0.12`, `--kg-tint-2 /0.20`
- `--p-high 0.575 0.195 22` (alta/vencida), `--p-med 0.735 0.135 78` (média), `--p-low 0.585 0.085 250` (baixa), `--done 0.615 0.115 158`. Cada um tem variante `-t` (tint) com alpha ~0.13–0.16.
- Outros acentos selecionáveis: rosa `#EC4899`, violeta `#8B5CF6`, dourado `#C9A227` (mapeados em `app.jsx › PALETTE_MAP`).

**Tipografia:**
- `--display 'Hanken Grotesk'` (títulos), `--sans 'DM Sans'` (corpo), `--mono 'DM Mono'` (datas/contadores/atalhos), `--serif 'Playfair Display'` (só a marca lateral).
- Título de tarefa: 13.5px (14px no modo "Confortável"). Contadores/datas em mono ~10–11px.

**Raio / sombra / densidade:**
- `--kg-r-sm 7px`, `--kg-r-md 12px`, `--kg-r-lg 18px`.
- Densidade: `compacta` → `--row-pad 7px; --row-gap 0`; `confortavel` → `--row-pad 12px; --row-gap 3px`.

**Específico da árvore:**
- Passo de indentação: **22px** por nível. Guias: linha 1px `var(--line)`.
- Barra de prioridade à esquerda da linha (`::before`): 3px de largura, cor = `--p-*` da prioridade (escondida nos modos de marca "dot"/"fill").
- Linha-guia de drop: 2px `var(--kg)`. Drop "child": `box-shadow: inset 0 0 0 1.5px var(--kg); background: var(--kg-tint)`.
- Avatar: círculo, fonte ~42% do tamanho, peso 700, cor `oklch(0.99 0.01 90)`.

## Assets
- `kaguya/kaguya.jpg` — foto usada no brand mark da sidebar e no hero do "Meu Dia". (No app real, usar o asset de marca existente.)
- Ícones: SVGs de traço (`stroke`) definidos inline em `kaguya/ui.jsx › ICONS` (incl. `grip`, `arrowUpRight`, `chevDown`, `flag`, `users`, etc.). Recriar com a biblioteca de ícones do codebase.
- Nenhuma imagem externa além das acima.

## Files
Protótipo completo (abra o `.html`):
- `Kaguya - Tarefas.html` — entry point (carrega os scripts abaixo).
- `kaguya/data.js` — modelo, `PEOPLE`, helpers de árvore, migração, parser pt-BR.
- `kaguya/ui.jsx` — ícones, checkbox, chips, primitivos.
- `kaguya/tasktree.jsx` — **TaskTree, TreeRow, Avatar, AvatarStack, AssigneePicker** (núcleo da feature).
- `kaguya/screens-list.jsx` — tela de Lista (grupos, sort, groupBy).
- `kaguya/components.jsx` — QuickAdd, TaskCard (Kanban, com anel `subProgress`), CommandPalette.
- `kaguya/modals.jsx` — TaskModal (subtarefas reais, pessoas, banner de mãe), ProjectModal, FilterModal.
- `kaguya/app.jsx` — shell + `treeApi` (rename, create, addRoot, addChild, addSibling, indent, outdent, promote, move, setDone, remove) + onComplete/delete recursivos.
- `kaguya/screens-board.jsx`, `screens-today.jsx`, `screens-cal.jsx`, `screens-habits.jsx` — outras views (root-only no Kanban).
- `kaguya/styles.css` — sistema visual completo (tokens + estilos da árvore no fim do arquivo).
- `tweaks-panel.jsx` — painel de tweaks (tema/acento/densidade) usado pelo shell.
