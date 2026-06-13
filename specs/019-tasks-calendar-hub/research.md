# Research / Decisões — Calendar Hub (fatia 019)

Decisões que sustentam a [`spec.md`](spec.md).

## D1 — Espelho de saída, não bidirecional (por ora)
**Decisão**: Postgres é a fonte da verdade; tarefas datadas viram eventos no Google; editar o evento
espelho no Google **não** volta para a tarefa.
**Porquê**: o 2-way verdadeiro exige pull (polling/webhooks) + resolução de conflito, muito mais
complexo. O espelho de saída entrega 90% do valor ("ver minhas tarefas no Google") com risco baixo.
Bidirecional fica como evolução. *(Escolha confirmada pelo usuário.)*

## D2 — Cliente compartilhado `gcal.py`, não o MCP, no webapp
**Decisão**: criar um módulo Python puro reusando as credenciais OAuth, para o webapp e o sync.
**Porquê**: o MCP roda como **processo-filho do agente** (stdio); o webapp chama tools Python puras e
não tem como falar MCP. Duplicar a lógica de auth num módulo compartilhado (que o MCP pode até passar a
importar) é a forma limpa. Sem isso, o webapp não conseguiria ler/escrever no Google.

## D3 — `google_event_id` na tarefa (única migração)
**Decisão**: uma coluna `TEXT` mapeando tarefa → evento espelho.
**Porquê**: necessária para upsert/remoção (saber qual evento corresponde à tarefa). O id do calendário
é global (resolvido por nome), não precisa de coluna.

## D4 — Sync best-effort + flag, gatilho na camada de lógica
**Decisão**: push embrulhado em try/except, desligável por `GCAL_SYNC_ENABLED`, disparado de
`tools_tasks.py` (não dos routers).
**Porquê**: (a) um problema no Google **nunca** pode quebrar o CRUD de tarefas; (b) a camada de lógica
é o **ponto único** que Telegram e webapp usam — colocar o gatilho ali garante paridade automática (o
Telegram herda o espelho sem código novo).

## D5 — Recorrente espelha só a ocorrência viva
**Decisão**: não criar evento recorrente RRULE no Google; espelhar a linha viva da série.
**Porquê**: o modelo "completar-e-gerar" da 012 mantém **uma** ocorrência viva por vez; um evento RRULE
no Google divergiria desse modelo (e das ocorrências virtuais do calendário). Cada nova ocorrência
ganha seu evento quando nasce.

## D6 — Anti-duplicação: esconder o calendário espelho do overlay
**Decisão**: o overlay de eventos do Google exclui "Kaguya — Tarefas" (e "TickTick", já excluído).
**Porquê**: as tarefas já aparecem **como tarefas** no calendário; mostrá-las também como eventos
espelho seria duplicação visual. Reusa a ideia do `_BLOCKED_CALENDARS` do MCP.

## D7 — Escrita só no calendário principal (webapp e MCP)
**Decisão**: criar/editar/apagar eventos pela UI só no calendário principal.
**Porquê**: mantém a política de segurança que o MCP já adota; escrever em calendários arbitrários
(compartilhados, externos) abre risco e casos de permissão — fica como extensão futura.

## D8 — Cross-agent via protocolo de provider + agregador (não acoplar schemas)
**Decisão**: cada agente expõe `list_calendar_events(start, end) → CalendarItem[]` no seu pacote; a
Kaguya só agrega via `calendar_hub`.
**Porquê**: a Kaguya não pode (nem deve) conhecer o schema de Nami/Frieren/Akane/Violet. Um shape
normalizado + um registro de providers desacopla, deixa cada domínio dono da sua regra de "o que é
datado", e torna trivial ligar novas camadas. Respeita o isolamento do CLAUDE.md (o provider vive no
pacote do agente, não no webapp).

## D9 — Camadas cross-agent são read-only + deep-link
**Decisão**: itens de outras camadas não se editam pela Kaguya; clicar abre no domínio de origem.
**Porquê**: editar um log de leitura ou uma conta a partir do calendário misturaria
responsabilidades. O calendário é uma **lente** agregada; a edição vive no domínio. Mirror dessas
camadas pro Google = futuro.

## D10 — Degradação graciosa na agregação
**Decisão**: `aggregate` é fan-out best-effort; provider que falha entra em `errors` e não derruba os
demais.
**Porquê**: o calendário não pode depender de todos os domínios estarem saudáveis ao mesmo tempo.

## D11 — Deploy: env vars no container do webapp
**Decisão**: o container `makima-web` recebe as `GOOGLE_CALENDAR_*` (hoje no coordinator/agente).
**Porquê**: o `gcal.py` roda dentro do webapp e do sync; precisa das credenciais. Refresh on-demand
(só o `refresh_token` é durável) — nada novo a persistir.

---

## Decisões adicionadas pelo handoff do calendário (`design_handoff_kaguya_calendario/`)

## D12 — Calendário completo (Dia/Semana/Mês), não a view simples da 013
**Decisão**: substituir o calendário mês/semana da 013 por um app completo (TimeGrid + MonthGrid,
all-day band, now-line, mini-mês, navegação, 3 variantes).
**Porquê**: o handoff é alta-fidelidade e define o produto pretendido (estilo Notion/Google Calendar).
A 013 entregou o mínimo; esta fatia entrega o calendário "de verdade".

## D13 — Reconciliar "tudo editável" do protótipo com editabilidade por fonte
**Decisão**: o protótipo trata todo evento como mutável (mock); em produção, **só** a base Kaguya
(tarefas) e a Agenda pessoal (Google principal) são editáveis no grid. Bases cross-agent e integrações
são **read-only** (clique deep-linka / mostra info).
**Porquê**: mover/excluir um vencimento da Nami ou um episódio de anime pelo calendário não faz sentido
(o dado é de outro domínio/feed). Mantém a fonte da verdade em cada domínio. Escrita de volta nas bases
= evolução futura.

## D14 — Eventos da base Kaguya = tarefas (sem entidade "evento" própria)
**Decisão**: criar/mover/redimensionar na base Kaguya mapeia para operações de **tarefa**
(`create_task` + time-block, `set_time_block`, `update_task`, `delete_task`), reusando a fatia 016.
**Porquê**: evita um tipo "evento" paralelo; mantém uma fonte da verdade (tarefas). "Evento" vs "tarefa"
no grid é só o `kind` visual (tarefa = borda tracejada).

## D15 — Calendários conectados via contas (modelo Notion) + prefs persistidas
**Decisão**: modelar contas → calendários; visibilidade e cor por calendário **persistem** (tabela
`calendar_prefs` recomendada).
**Porquê**: o handoff mostra a coluna lateral agrupada por conta com toggle/recolor; persistir é
esperado (o usuário não quer reconfigurar a cada sessão). Single-user → tabela simples.

## D16 — Integrações externas como conectores read-only (fonte a definir)
**Decisão**: Animes/Futebol/Feriados são conectores read-only sob o mesmo protocolo `CalendarItem`;
a fonte concreta (API/feed) fica para a implementação (sugestões: BrasilAPI p/ feriados, API esportiva
p/ futebol, AniList / futuro agente `media` p/ animes).
**Porquê**: enriquecem a agenda sem acoplar; cada conector é isolado e o agregador degrada se um falhar.
Faseável (P3).

## D17 — 3 variantes visuais + tema via Tweaks
**Decisão**: `agora`/`helvetico`/`editorial` + claro/escuro como preferência do shell (TweaksPanel),
não um app separado.
**Porquê**: o handoff define as 3 variantes como troca de estilo sobre a mesma engine; encaixa no padrão
de Tweaks já existente nos outros shells.
