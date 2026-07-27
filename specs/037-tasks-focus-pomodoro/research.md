# Phase 0 Research: Foco / Pomodoro (spec 037)

## R1 — Autoridade do tempo: servidor, nunca o cliente

**Decision**: `focus_sessions.started_at` (TIMESTAMPTZ, `now()`) é a única fonte de verdade.
Tempo restante = `duration_planned_min * 60 - (now() - started_at).total_seconds()`, sempre
recalculado — nunca armazenado, nunca contado por um `setInterval` que "confia" no que já
passou.

**Rationale**: FR-007 exige sobreviver a reload; SC-002 exige <2s de divergência. A única
forma de garantir isso sem sincronizar relógios é nunca ter um cronômetro de tela que começa
do zero — o cliente sempre deriva de um timestamp absoluto do servidor.

**Alternatives considered**: WebSocket/SSE para push de tick — rejeitado (YAGNI, Princípio V;
usuário único, polling de 1x/segundo no cliente já é suficiente e mais simples).

---

## R2 — Fechamento de sessão abandonada: calculado na leitura, sem cron

**Decision**: Uma sessão é "vencida" quando `now() > started_at + (duration_planned_min +
break_planned_min) * interval '1 minute'` e ainda está aberta (`ended_at IS NULL`). Qualquer
leitura que toque a sessão ativa (`GET /focus/active`, ou qualquer outra rota da Kaguya que
chame o helper) primeiro checa essa condição e, se vencida, fecha automaticamente
(`ended_at = started_at + duration_planned_min` — creditando **no máximo o tempo planejado de
foco**, nunca a pausa nem o tempo real decorrido) marcando `completed = false`.

**Rationale**: espelha a "nada persistido derivado calculado na leitura" da spec 036
(`goal_progress`/`habit_strength` computados ao vivo) — sem precisar de um job agendado
(`scheduler/`) só para isso, que seria overkill para um caso raro (navegador fechado).
Resolve FR-008 e SC-004 sem infraestrutura nova.

**Alternatives considered**: Job no `scheduler/` varrendo sessões vencidas periodicamente —
rejeitado: mais uma peça móvel (Princípio V) para um caso que a própria leitura já resolve
deterministicamente assim que o usuário volta ao painel.

---

## R3 — Uma sessão ativa por vez: índice único parcial

**Decision**: `CREATE UNIQUE INDEX ... ON focus_sessions ((true)) WHERE ended_at IS NULL` —
mesmo padrão de `uq_task_weekly_reviews_open` (spec 035). Iniciar uma nova sessão com outra
aberta primeiro fecha a anterior (parâmetro explícito de confirmação vindo do frontend, não
uma race condition no banco).

**Rationale**: garante a invariante no schema, não só na aplicação (FR-003) — consistente com
o precedente já estabelecido no próprio Kaguya.

---

## R4 — Onde mora a preferência de duração (presets/custom)

**Decision**: Uma tabela de 1 linha `focus_prefs` (id fixo, sempre `id=1`) guardando
`focus_min`, `break_min` — atualizada a cada início de sessão com os valores escolhidos.
Servidor, não `localStorage`.

**Rationale**: o spec deixou em aberto ("decisão do plan.md"). Servidor foi escolhido porque
mantém o padrão de fonte única de verdade do resto da Kaguya (`calendar_prefs` já existe com
o mesmo formato de 1-linha, fatia 019) e evita duplicar estado entre abas/dispositivos —
consistente mesmo sendo usuário único.

**Alternatives considered**: `localStorage` — mais simples, mas quebra se o usuário limpa o
navegador ou usa outro device; rejeitado por não custar mais uma tabela trivial.

---

## R5 — Estatísticas: motor puro (`focus_stats.py`), não view SQL

**Decision**: `focus_stats.py` recebe uma lista de sessões já carregadas (dicts com
`duration_focused_min`, `date_local`) e devolve `{total_min, sessoes}` por dia — mesmo padrão
de `capacity.py`/`experiment_adherence.py`/`goal_progress.py`: função pura, sem banco, testável
isoladamente.

**Rationale**: Princípio V + consistência arquitetural — todo cálculo agregado da Kaguya já
segue esse padrão de "motor puro recebe dados prontos".

---

## R6 — Fuso local nas agregações (FR-012)

**Decision**: A "data local" de uma sessão é
`(COALESCE(ended_at, started_at) AT TIME ZONE 'America/Sao_Paulo')::date` — segue a regra
global do `CLAUDE.md` raiz (nunca `CURRENT_DATE`/`NOW()::date` puro). Sessão em andamento conta
no dia local de agora; sessão concluída conta no dia local do fim (não do início) — cobre o
edge case de sessão que atravessa a meia-noite (rarefeito, mas sem regra especial extra:
o "fim" já resolve isso naturalmente).

---

## R7 — Widget flutuante: montado uma vez em `KaguyaShell.tsx`

**Decision**: `<FocusWidget />` é renderizado em `KaguyaShell.tsx`, fora do `switch`/render
condicional das views internas — mesmo nível que `<Toast />`/`<TweaksPanel />`. Faz
`GET /focus/active` no mount e a cada início de sessão; entre polls, deriva o countdown
localmente com `setInterval(1000)` a partir do `started_at` recebido (R1).

**Rationale**: `KaguyaShell` já é o componente-raiz persistente entre todas as telas internas
(navegação por estado `{view, param}`, sem React Router) — é o único lugar que garante FR-006
("todas as telas do painel") sem duplicar montagem por tela.

**Alternatives considered**: montar o widget em cada `screens/*.tsx` — rejeitado, geraria
remount (e piscar) a cada troca de view.

---

## R8 — Tarefa excluída durante o foco (edge case do spec.md)

**Decision**: `focus_sessions.task_id` é `INTEGER REFERENCES tasks(id) ON DELETE SET NULL` —
a sessão sobrevive como avulsa automaticamente, sem lógica extra na aplicação.

**Rationale**: resolve o edge case "Tarefa excluída durante o foco" (spec.md) inteiramente no
schema — mais simples e à prova de esquecimento do que checar no código toda vez que uma
tarefa é apagada.

---

## R9 — Webapp-only, sem tool ADK

**Decision**: Nenhuma tool nova registrada no `kaguya_agent`/coordinator — `tools.py` só
re-exporta `tools_focus.py` para o router REST consumir, igual às specs 024/029/030/035/036.

**Rationale**: Assumptions do spec.md já descartam iniciar/parar por Telegram na v1; não há
justificativa para expor no ADK algo que não será chamado por lá.

---

## R10 — Nota opcional da sessão

**Decision**: `focus_sessions.note` (TEXT nullable) — preenchida opcionalmente ao concluir
(campo simples no modal de "concluir", pode ficar vazio). Não há UI dedicada de edição
posterior na v1 (FR-011 já descarta exclusão individual; edição de nota fica de fora por
YAGNI — não pedido em nenhuma User Story).
