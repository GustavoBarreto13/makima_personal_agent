# Phase 023: Makima Hub — Specification

**Created:** 2026-06-16
**Ambiguity score:** 0.187 (gate: ≤ 0.20) ✓
**Requirements:** 15 locked

## Goal

A rota `/` do app web passa a exibir o Hub da Makima — uma página em tela cheia (sem sidebar
global) com hero + 8 cards de agente fiéis ao handoff "Sala de Controle", cada card mostrando
2 stats reais provenientes de um endpoint agregador `/api/hub/summary`.

## Background

Hoje `/` renderiza o `<Dashboard>` de finanças legado dentro do `Layout` global com sidebar.
Não existe página central que apresente o projeto nem dê acesso direto a todos os domínios.
O handoff de design em `specs/023-makima-hub/design_handoff_makima_hub/` (protótipo Babel
hi-fi: `dirA.jsx`, `data.js`, `icons.jsx`) define a direção A "Sala de Controle" já aprovada.
O codebase usa o padrão Shell-por-domínio (React 19 + TS + Tailwind + Vite), com cada domínio
em `pages/<dom>/`. Os retratos de 8 personagens estão em `webapp/frontend/public/`, mas faltam
`makima.png` e `akane.png` (versão transparente). Nenhum endpoint de resumo centralizado existe.

## Requirements

### Visual / Frontend

1. **Hub Shell sem sidebar**: o componente `MakimaShell` renderiza em tela cheia sob `.mkA` sem
   usar o `Layout` global.
   - Current: `/` renderiza `<Dashboard>` dentro de `<Layout>` (com sidebar global)
   - Target: rota `<Route path="/" element={<MakimaShell/>}/>` adicionada em `App.tsx` antes
     do `/*` catch-all; `<Route path="/" element={<Dashboard/>}>` dentro do `Layout` removido;
     `Layout` continua servindo `/transactions`, `/accounts`, etc.
   - Acceptance: navegando para `/` o usuário vê o Hub (topbar + hero + cards) **sem** a sidebar
     de domínios; navegando para `/transactions` a sidebar global aparece normalmente

2. **CSS 100% escopado sob `.mkA`**: nenhuma regra do `makima.css` afeta elementos fora do Hub.
   - Current: não existe `makima.css`
   - Target: arquivo `pages/makima/makima.css` com todas as regras prefixadas `.mkA`; tokens
     OKLCH declarados em `.mkA{…}`, temas em `.mkA[data-theme=…]`
   - Acceptance: abrir `/series` (MaiShell) após visitar `/` não exibe alteração visual alguma
     causada por regras do `makima.css`; inspecionar DevTools confirma zero regras `.mkA` ativas
     fora do wrapper `.mkA`

3. **Hero fiel ao handoff**: seção hero do Hub renderiza todos os elementos especificados.
   - Current: não existe
   - Target: hero contém — kicker mono amarelo "CENTRO DE CONTROLE", h1 "Makima" serif 800
     104px com `<em>` no "i" em itálico vermelho (`oklch(0.66 0.205 25)`), role mono, saudação
     itálica "Bom te ver de volta.", manifesto, tagline com borda-esquerda vermelha, meta com
     "8 / 9 / 1", retrato `makima.png` com halo radial + anel amarelo sólido + anel vermelho
     tracejado
   - Acceptance: comparação visual lado a lado com `Makima - Hub.html` do handoff; h1 mede
     104px a ≥1041px viewport; anel amarelo e anel vermelho tracejado presentes ao redor do retrato

4. **Roster com 8 cards de agente**: grade de 8 cards seguindo a estrutura e acentos do handoff.
   - Current: não existe
   - Target: 2 colunas (grid), 8 cards na ordem Nami→Frieren→Komi→Violet→Kaguya→Mai→Marin→Akane;
     cada card: barra de acento vertical 3px (cor `--ac`), índice mono "01"…"08", nome serif
     30px, role mono com cor `--ac-t`, descrição, 2 stats, botão primário (fundo `--ac`),
     botão ghost opcional (Kaguya "Abrir agenda"), retrato flutuante à direita com máscara
     `mask-image: linear-gradient(90deg, transparent, #000 26%)` e glow radial na cor do acento,
     botão "abrir" ↗ círculo 30px; hover eleva 3px + borda colorida + sombra
   - Acceptance: 8 cards presentes; cada card tem a cor de acento exata da tabela do handoff;
     hover aplica `translateY(-3px)` mensurável no DevTools

5. **Acentos OKLCH exatos**: cada card usa os valores de `--ac` / `--ac-t` do handoff.
   - Current: não existe
   - Target: valores conforme tabela:
     Nami `oklch(0.74 0.168 57)` / `oklch(0.80 0.150 62)`;
     Frieren `oklch(0.77 0.118 184)` / `oklch(0.82 0.110 184)`;
     Komi `oklch(0.70 0.135 276)` / `oklch(0.78 0.125 276)`;
     Violet `oklch(0.70 0.088 253)` / `oklch(0.78 0.090 253)`;
     Kaguya `oklch(0.72 0.165 340)` / `oklch(0.80 0.150 340)`;
     Mai `oklch(0.70 0.120 292)` / `oklch(0.78 0.115 292)`;
     Marin `oklch(0.74 0.16 210)` / `oklch(0.84 0.14 208)`;
     Akane `oklch(0.66 0.115 196)` / `oklch(0.79 0.10 192)`
   - Acceptance: inspecionar `--ac` de cada card no DevTools e comparar com os valores acima;
     zero desvios

6. **Tema dark/light toggleável e persistido**: botão "Tema" na topbar alterna `.mkA[data-theme]`.
   - Current: não existe
   - Target: estado persiste em `localStorage` chave `makima-hub-theme`; default `dark`; ao
     clicar no botão "Tema" o atributo `data-theme` alterna entre `dark` e `light` aplicando
     o CSS correspondente; refresh da página mantém o último tema
   - Acceptance: definir tema claro → recarregar `/` → hub abre em tema claro; reverter para
     escuro → recarregar → hub abre escuro

7. **Responsividade**: 3 breakpoints do handoff implementados.
   - Current: não existe
   - Target: ≤1040px → padding 40px, h1 88px; ≤900px → hero 1 coluna (retrato acima), h1
     80px; ≤680px → padding 22px, h1 56px, roster 1 coluna
   - Acceptance: redimensionar viewport para 680px — roster fica em 1 coluna e h1 mede 56px;
     para 900px — hero fica em 1 coluna com retrato acima; para 1040px — h1 mede 88px

8. **Fontes adicionais no index.html**: pesos Playfair Display 800 e DM Sans 600/700 carregados.
   - Current: `index.html` carrega Playfair 400/600/700 (sem 800) e DM Sans 300/400/500 (sem 600/700)
   - Target: `<link>` do Google Fonts atualizado para incluir `Playfair+Display:ital,wght@0,400;0,600;0,700;0,800;1,400`
     e `DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400`
   - Acceptance: no DevTools → Network → Fonts, a requisição ao Google Fonts inclui `wght@0,800` para
     Playfair Display e `wght@0,600;0,700` para DM Sans; o h1 renderiza com font-weight 800 computado

9. **Assets dos retratos**: 9 PNGs transparentes presentes em `webapp/frontend/public/`.
   - Current: `public/` contém 7 arquivos (faltam `makima.png` e `akane.png` transparente;
     `nami.jpg` não é PNG transparente)
   - Target: copiar de `specs/023-makima-hub/design_handoff_makima_hub/assets/` todos os 9 arquivos
     (`makima.png`, `nami.png`, `frieren.png`, `komi.png`, `violet.png`, `kaguya.jpg`, `mai.png`,
     `marin.png`, `akane.png`) para `webapp/frontend/public/`; `makima.png` e `akane.png` presentes;
     retratos referenciados como `/makima.png`, `/nami.png`, etc.
   - Acceptance: `GET /makima.png` e `GET /akane.png` retornam 200 no app rodando; imagens renderizam
     como PNGs transparentes (sem fundo branco/cinza)

10. **Navegação SPA**: botões de ação e "abrir" usam `<Link to=…>` (sem reload).
    - Current: não existe
    - Target: botão primário de cada card (ex.: "Adicionar transação") e o ↗ navegam para a rota
      real do agente (ver mapa: Nami→`/nami`, Frieren→`/books`, Komi→`/people`, Violet→`/journal`,
      Kaguya→`/tasks`, Mai→`/series`, Marin→`/animes`, Akane→`/movies`); Kaguya tem botão ghost
      "Abrir agenda" → `/tasks`; todos usam `<Link>` do react-router, não `<a href>`
    - Acceptance: clicar em "Adicionar transação" navega para `/nami` sem reload de página (verificável
      pelo Network tab — zero request de documento HTML); URL muda para a rota correta

### Backend / Stats Reais

11. **Endpoint `/api/hub/summary`**: rota FastAPI que agrega stats dos 8 agentes.
    - Current: não existe nenhum endpoint de resumo centralizado
    - Target: `GET /api/hub/summary` em `webapp/backend/routers/hub.py`; requer autenticação
      (`Depends(require_user)`); retorna JSON com chave por agente (`nami`, `frieren`, `komi`,
      `violet`, `kaguya`, `mai`, `marin`, `akane`), cada um com `stat: {v, k}` e `stat2: {v, k}`,
      ou `null` se o agente falhou; registrado em `main.py`
    - Acceptance: `GET /api/hub/summary` sem cookie retorna 401; com cookie válido retorna 200 com
      8 chaves; simular falha em 1 agente (mocking) retorna null para aquele agente e 200 para os demais

12. **Nami stats reais**: saldo do mês + lançamentos na semana.
    - Current: `get_spending_summary(period="month")` existe mas não é chamado pelo hub
    - Target: `stat.v` = diferença `receitas − despesas` do mês corrente formatada como `+R$ X.XXX`
      ou `−R$ X.XXX`; `stat.k` = "saldo do mês"; `stat2.v` = count de transações nos últimos 7 dias;
      `stat2.k` = "lançamentos / semana"
    - Acceptance: criar 2 transações hoje e chamar o endpoint — `stat2.v` aumenta em 2

13. **Frieren stats reais**: livro lendo agora + livros lidos no ano.
    - Current: existe `_find_book_by_query` que prioriza status='lendo'; não há função de stats
    - Target: `stat.v` = título (até 14 chars truncado com "…") + " · " + percentual (`current_page ×
      100 / total_pages` arredondado, sem casas decimais), ex.: "Duna · 47%"; se nenhum livro com
      status='lendo' → `stat.v` = "—"; `stat.k` = "lendo agora";
      `stat2.v` = COUNT de livros com `status='lido'` e `updated_at` no ano corrente;
      `stat2.k` = "livros este ano"
    - Acceptance: registrar leitura de um livro na pág. 100/200 → stat.v = "Título · 50%"; sem
      livro lendo → stat.v = "—"

14. **Komi, Violet, Kaguya, Mai, Marin, Akane stats reais**: 6 agentes com fontes definidas.
    - Current: nenhum endpoint hub; cada tool existe mas não é chamado pelo hub
    - Target (Komi): `stat.v` = COUNT de pessoas ativas (deleted=FALSE); `stat.k` = "pessoas";
      `stat2.v` = COUNT de `person_dates` WHERE `lower(label) LIKE '%aniver%'` e `EXTRACT(MONTH FROM date) = EXTRACT(MONTH FROM CURRENT_DATE)` e pessoa não deletada; `stat2.k` = "aniversários este mês"
    - Target (Violet): `stat.v` = `days_written` do `get_stats(year=ano_corrente)` (dias com ≥1 bullet);
      `stat.k` = "dias escritos"; `stat2.v` = `freq_per_week` formatado como "X.X/sem";
      `stat2.k` = "por semana"
    - Target (Kaguya): `stat.v` = `len(list_tasks_today()["today"])`; `stat.k` = "tarefas hoje";
      `stat2.v` = `len(list_tasks_today()["overdue"])`; `stat2.k` = "atrasadas"
    - Target (Mai): `stat.v` = título da 1ª série de `get_currently_watching()` truncado a 14 chars +
      " · Ep " + `episodes_watched`; se nenhuma série assistindo → "—"; `stat.k` = "assistindo";
      `stat2.v` = COUNT total de séries (deleted=FALSE); `stat2.k` = "séries"
    - Target (Marin): `stat.v` = COUNT de animes com status='assistindo'; `stat.k` = "assistindo";
      `stat2.v` = COUNT de linhas em `watch_logs` WHERE `watched_date >= CURRENT_DATE - 7`;
      `stat2.k` = "episódios esta semana"
    - Target (Akane): `stat.v` = último `rating` não-nulo de `diary_entries` ORDER BY `watched_date DESC`
      formatado como "X.X★"; se nenhuma nota → "—"; `stat.k` = "última nota";
      `stat2.v` = COUNT de filmes com `status='watched'`; `stat2.k` = "filmes vistos"
    - Acceptance: cada stat reflete o banco; adicionar 1 pessoa → Komi stat.v aumenta; marcar 1
      episódio de anime hoje → Marin stat2 aumenta; sem série assistindo → Mai stat.v = "—"

15. **Fallback gracioso no frontend**: stat null não quebra o card.
    - Current: não existe
    - Target: se `summary[agente]` é `null` (agente falhou no backend), o card exibe "—" em ambos
      os stats mas renderiza normalmente sem erro de JS
    - Acceptance: servir `/api/hub/summary` com um agente retornando null — o card correspondente
      renderiza com "—" e os demais cards não são afetados; zero erros no console

## Boundaries

**In scope:**
- `webapp/frontend/src/pages/makima/` — Shell completo (MakimaShell, makima.css, data.ts, icons.tsx, makimaApi.ts, types.ts)
- `webapp/backend/routers/hub.py` — endpoint `/api/hub/summary` com stats dos 8 agentes
- `webapp/frontend/src/App.tsx` — rota `/` para MakimaShell; remoção da rota `/` do Layout
- `webapp/frontend/index.html` — pesos de fonte Playfair 800 + DM Sans 600/700
- `webapp/frontend/public/` — 9 retratos PNG transparentes copiados do handoff
- Toggle de tema dark/light com persistência em localStorage

**Out of scope:**
- `?novo=1` / auto-abrir modal de adicionar ao clicar na ação primária — fatia futura
- Tweaks de demonstração `data-red` e `data-cols` do handoff — não implementados nesta fase
- Stats em tempo real / WebSocket — stats buscados uma vez no mount, sem polling
- `agents/*` — nenhuma tool é modificada; hub.py só importa tools existentes
- `mcp_servers/`, `coordinator/`, `calendar_hub*` — fora do escopo (dono externo: ver memória `project-019-ownership`)
- Frontend da Komi (`/people`) — já existe, apenas o link do hub aponta para ela
- `agents/violet/` — não existe como agente separado; os stats do Violet vêm diretamente das tools do `agents/journal/`

## Constraints

- Cada agente no `hub.py` deve ser calculado em `try/except` isolado — falha de 1 não derruba os outros
- Nenhuma regra CSS do `makima.css` pode ser global (prefixo `.mkA` obrigatório em tudo) — ver memória `css-shell-leakage`
- Stats formatados como strings no backend (`v` = string pronta para exibir) — o frontend não faz formatação de números
- Componentes não fazem `fetch` diretamente — usar `makimaApi.getSummary()` via `lib/api`
- `Depends(require_user)` obrigatório em `/api/hub/summary` — sem exceção
- Imagens referenciadas como `/nami.png`, `/makima.png` etc. (sem prefixo de pasta) — servidas de `public/`
- `kaguya.jpg` mantém extensão `.jpg` e pode ter fundo (sem versão transparente disponível ainda)

## Acceptance Criteria

- [ ] Navegar para `/` pós-login exibe o Hub sem sidebar global; navegar para `/transactions` exibe o Layout com sidebar
- [ ] h1 "Makima" tem `<em>` vermelho no "i" e mede 104px a viewport ≥ 1041px
- [ ] 8 cards renderizam na ordem correta com os acentos OKLCH corretos (verificar DevTools)
- [ ] Cada card tem retrato flutuante à direita com máscara de fade e glow radial
- [ ] Botão "Tema" alterna dark/light; tema persiste após F5
- [ ] Viewport 680px → roster em 1 coluna, h1 = 56px; 900px → hero 1 coluna; 1040px → h1 = 88px
- [ ] `GET /api/hub/summary` sem autenticação retorna 401
- [ ] `GET /api/hub/summary` autenticado retorna 200 com 8 chaves de agente, cada uma com `{stat, stat2}`
- [ ] Falha isolada de 1 agente retorna null para aquela chave e não afeta os demais
- [ ] Clicar em botão primário de qualquer card navega para a rota correta sem reload de página
- [ ] Sem livro lendo → Frieren stat.v = "—"; sem série assistindo → Mai stat.v = "—"
- [ ] `npm run build` completa sem erros de TypeScript
- [ ] Nenhuma regra do `makima.css` é visível no DevTools ao inspecionar elementos fora do `.mkA`
- [ ] `GET /makima.png` e `GET /akane.png` retornam 200

## Ambiguity Report

| Dimension           | Score | Min  | Status | Notes                                                    |
|---------------------|-------|------|--------|----------------------------------------------------------|
| Goal Clarity        | 0.85  | 0.75 | ✓      | Hub em `/`, stats reais, sem sidebar, fidelidade hi-fi   |
| Boundary Clarity    | 0.75  | 0.70 | ✓      | ?novo=1, tweaks extras e agent tools explicitamente fora |
| Constraint Clarity  | 0.84  | 0.65 | ✓      | try/except isolado, CSS scoping, strings no backend      |
| Acceptance Criteria | 0.80  | 0.70 | ✓      | 14 pass/fail checkboxes                                  |
| **Ambiguity**       | 0.187 | ≤0.20| ✓      |                                                          |

## Interview Log

| Round | Perspectiva    | Questão resumida                          | Decisão travada                                                    |
|-------|----------------|-------------------------------------------|--------------------------------------------------------------------|
| 1     | Researcher     | Komi "para reconectar" — fonte no schema? | stat2 = pessoas com aniversário este mês (person_dates)            |
| 1     | Researcher     | Violet "sequência" — streak existe?       | stat2 = freq_per_week de get_stats (ex: "4.2/sem")                 |
| 1     | Researcher     | Marin "na temporada" — definição?         | stat1 = count(status='assistindo'); stat2 = logs esta semana       |
| 2     | Researcher     | Nami saldo = receitas-despesas ou contas? | Receitas menos despesas do mês corrente                            |
| 2     | Simplifier     | Mai formato T2E5 — como calcular?         | Só título + "· Ep X" (episodes_watched), sem cálculo de temporada |
| 2     | Researcher     | Frieren fallback sem livro lendo?         | Mostrar "—" (travessão vazio)                                      |
| 3     | Boundary Keeper| O que acontece com o Dashboard em "/"?   | Remover `<Route path="/" element={<Dashboard/>}>` do Layout        |

---

*Phase: 023-makima-hub*
*Spec created: 2026-06-16*
*Next step: implementar conforme plano aprovado — MakimaShell + hub.py*
