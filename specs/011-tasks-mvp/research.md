# Research — Tasks MVP (011)

Decisões técnicas do Phase 0. Nenhum NEEDS CLARIFICATION ficou em aberto: o repo já
contém os padrões para todas as escolhas; pesquisa externa não foi necessária.

## D1 — Onde vive a camada de lógica única (FR-002)

**Decision**: módulos `agents/kaguya/tools_tasks.py` e `tools_projects.py` (funções puras
sobre `agents/db.py`, retornando dicts com `"status"`). O router `webapp/backend/routers/tasks.py`
**importa e envelopa** essas funções; o agente as expõe ao Gemini.

**Rationale**: é o padrão consagrado do repo — `routers/finances.py` envelopa as tools da
Nami, `routers/journal.py` as do Journal. Paridade de canais sai de graça: os dois canais
chamam literalmente as mesmas funções.

**Alternatives considered**: (a) pacote `services/` separado — camada nova sem precedente
no repo, viola Minimal Footprint; (b) lógica no router com o agente chamando a API HTTP —
acopla o Telegram ao webapp, violando a independência de canais.

## D2 — Forma do agente Kaguya

**Decision**: continua **factory** (`create_kaguya_agent()`), agora com um único
`McpToolset` (Google Calendar) + tools Postgres importadas diretamente.

**Rationale**: o McpToolset do Calendar instancia processo filho por criação — a razão
original da factory permanece. Mudar para singleton quebraria o coordinator sem ganho.

**Alternatives considered**: singleton estilo Nami — só seria possível largando o MCP do
Calendar, que está fora do escopo (fica intacto por decisão da master).

## D3 — Atomicidade de `complete_payment_task` (FR-014)

**Decision**: a tool abre **uma** conexão/transação (`get_conn()`), completa a tarefa e
lança a despesa, com commit único. Para a despesa, a Nami ganha um helper interno
`create_transaction_on_cursor(cur, ...)` — mesma lógica/validações da tool pública, mas
operando no cursor recebido. A tool pública da Nami passa a delegar para ele.

**Rationale**: a Nami continua dona do SQL das tabelas dela (Principle III — acesso
cross-domain explícito e documentado); a atomicidade exige cursor compartilhado, que a
tool pública (que abre a própria conexão) não oferece.

**Alternatives considered**: (a) Kaguya escrever direto em `transactions` — duplica
regras financeiras fora da Nami; (b) saga/compensação como hoje (status `partial`) —
desnecessário agora que é tudo um banco; o spec exige tudo-ou-nada.

## D4 — Ordenação manual (FR-008)

**Decision**: `position BIGINT` esparsa ×1000 (novo item = max+1000; inserir entre A e B
= média inteira). Quando a média colide (diferença < 1), re-espaçar todas as posições do
escopo (projeto ou coluna) numa transação.

**Rationale**: padrão já validado no Journal (`journal_bullets`); BIGINT dá folga
praticamente infinita para um usuário.

**Alternatives considered**: fractional indexing em texto (LexoRank) — mais robusto para
multiusuário, complexidade injustificada para single-user.

## D5 — Captura NLP no Telegram (FR-012)

**Decision**: o parsing fica no **modelo** (Gemini), guiado pela instrução da Kaguya: o
agente extrai título/projeto/prioridade/data e chama `create_task(...)` com campos
estruturados; a resposta sempre ecoa a interpretação. Tools são determinísticas e burras.

**Rationale**: é como Nami/Frieren já operam (o LLM é o parser; as tools validam).
Nenhum parser pt-BR novo para manter. A confirmação na resposta cobre o risco de
interpretação errada (cenário US2.2).

**Alternatives considered**: parser determinístico compartilhado backend/frontend —
útil na Fase 2 para datas no quick-add web; no Telegram o LLM já está pago na chamada.

## D6 — Quick-add do webapp (FR-011)

**Decision**: parsing determinístico **no frontend** (`lib/parseTask.ts`, regex):
`@palavra` → lista/projeto (match case-insensitive por prefixo contra a sidebar carregada),
`!alta|!media|!baixa` → prioridade. Tokens reconhecidos viram chips/segments destacados ao
vivo (componente `ParseMirror`, classes `tok-proj`/`tok-prio-*`); não reconhecidos ficam no
título. `#` fica **reservado a tags** (Fase 2) — nunca para lista, alinhado ao guia canônico
(`frontend-design-guide.md` §6). O POST envia campos já estruturados.

**Rationale**: master/FR-012 da 010 exige quick-add sem LLM; manter no front dá feedback
visual imediato (highlight estilo Todoist) e zero latência.

**Alternatives considered**: parsear no backend — perderia o highlight em tempo real;
a Fase 2 reavalia compartilhamento quando datas entrarem.

## D7 — Aposentadoria do TickTick (FR-003)

**Decision**: remover `mcp_servers/ticktick/` do repo (git preserva histórico), remover o
`McpToolset` correspondente da factory, remover as menções na `_MAKIMA_INSTRUCTION` e nos
CLAUDE.md. Variáveis `TICKTICK_*` ausentes não são lidas por ninguém (remoção do Dokploy
vira nota de deploy no quickstart).

**Rationale**: constitution V e instrução global do usuário — código morto se deleta, o
git guarda. Manter o diretório "por via das dúvidas" convida regressão.

**Alternatives considered**: manter o server desativado até a Fase 5 — sem caso de uso:
nenhuma fase futura volta a falar com o TickTick.

## D8 — Contrato de retorno das tools e do router

**Decision**: mutações retornam `{"status": "ok"|"error", ...}`; listagens retornam
dado direto (lista/dict sem `status`). O router usa `_check_result` **apenas** nas
mutações.

**Rationale**: convenção documentada do repo (journal.py aprendeu isso na prática — está
no CLAUDE.md do backend). Consistência evita o bug conhecido de aplicar `_check_result`
em listagem.

## D9 — Testes

**Decision**: pytest no padrão `tests/` existente: `tests/agents/test_kaguya_tasks.py`
(camada de lógica — posições/renormalização, cascata de subtarefas, regras do Inbox,
atomicidade do pagamento com falha simulada) e `tests/test_tasks_router.py` (TestClient,
padrão `test_finances_router.py`). Validação E2E manual pelo `quickstart.md`.

**Rationale**: SC-005 e SC-006 exigem teste automatizado (falha parcial e 100+
reordenações); o restante do repo valida E2E manualmente — manter o costume.

## D10 — Tela Hoje (FR-011)

**Decision**: uma query: tarefas abertas com `due_date <= hoje`, separadas em "vencidas"
(`< hoje`, destacadas) e "hoje", agrupadas por projeto. Sem campo novo, sem smart list
persistida (as smart lists de verdade são da Fase 2).

**Rationale**: espelha o comportamento `list_tasks_today` que o usuário já conhece do
MCP antigo (hoje + atrasadas juntas — regra de comportamento documentada no CLAUDE.md
da Kaguya).
