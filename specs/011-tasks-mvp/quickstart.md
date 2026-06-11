# Quickstart — Validação do Tasks MVP (011)

Guia de validação end-to-end. Prova os critérios de sucesso da spec (SC-001 a SC-006)
sem duplicar contratos — referências: [contracts/](./contracts/),
[data-model.md](./data-model.md).

## Pré-requisitos

- PostgreSQL acessível (`DATABASE_URL`) — local ou VPS.
- Env vars do bot (`TELEGRAM_BOT_TOKEN`, `GEMINI_API_KEY`) e do Calendar
  (`GOOGLE_CALENDAR_*`) — ver `coordinator/CLAUDE.md`. **Nenhuma `TICKTICK_*` necessária.**
- Frontend: Node 20+ para `npm run dev`.

## Setup

```bash
# 1. Aplicar o schema (no VPS: de dentro do container makima-web — ver CLAUDE.md raiz)
python -m scripts.setup_schemas        # cria tabelas task_* e seed Inbox (idempotente)

# 2. Testes automatizados
python -m pytest tests/agents/test_kaguya_tasks.py tests/test_tasks_router.py -v

# 3. Backend do webapp (dev)
uvicorn webapp.backend.main:app --reload --port 8000

# 4. Frontend (dev)
cd webapp/frontend && npm run dev      # http://localhost:5173/tasks

# 5. Bot Telegram (canal 2)
python -m coordinator.main
```

## Cenários de validação

### V1 — Webapp sozinho (US1, SC-002: bot desligado)

1. Com o bot **parado**, abrir `/tasks`: sidebar mostra Inbox; lista vazia com empty state.
2. Criar projeto "Casa" e grupo "Pessoal"; mover Casa para o grupo.
3. Criar tarefa pelo TaskModal sem projeto → cai no Inbox. Criar outra em Casa com
   prioridade alta e subtarefa.
4. Drag-and-drop: reordenar 3 tarefas, recarregar a página → ordem persiste (SC-006).
5. Completar a tarefa pai → modal de confirmação de cascata → subtarefa completa junto.
6. Excluir tarefa → conferir na lixeira → restaurar.
7. Excluir projeto Casa com tarefas → escolher "mover para Inbox" → tarefas no Inbox.
8. Tentar excluir o Inbox → ação indisponível/erro amigável.

### V2 — Telegram sozinho (US2, SC-002: webapp desligado)

Com o backend do webapp **parado**, conversar com a Kaguya:

1. "cria tarefa comprar café no projeto Casa com prioridade média" → resposta confirma
   interpretação; conferir no banco (`SELECT title, priority, project_id FROM tasks`).
2. "o que tenho pra hoje?" → tarefas de hoje + vencidas por projeto + eventos do Calendar.
3. "completa a tarefa do café" → concluída.
4. "apaga a tarefa X" → Kaguya **pede confirmação** antes; confirmar → soft delete.
5. Captura ambígua ("me lembra do dentista sexta") → resposta explicita qual sexta;
   corrigir ("não, a outra") → data ajustada.

### V3 — Paridade e consistência (SC-004)

1. Criar tarefa pelo Telegram → aparece no webapp na próxima carga (sem sync — mesma base).
2. Completar pelo webapp → "o que tenho pra hoje?" no Telegram não a lista mais.
3. Kanban: criar colunas "A fazer / Fazendo / Feito" (Feito = done) no projeto;
   arrastar card para Feito → tarefa concluída também na view lista e no Telegram.

### V4 — Tela Hoje + quick-add (US4)

1. Tarefas com vencimento ontem/hoje/amanhã → Hoje mostra vencidas destacadas + hoje;
   amanhã não aparece.
2. Quick-add: `ligar pro banco @Casa !alta` → chips/segments destacados ao vivo (ParseMirror);
   salvar → lista Casa, prioridade 3, título limpo.
3. `algo @NãoExiste` → vai para o Inbox com aviso de lista não encontrada (`#` não vira lista —
   reservado a tags na Fase 2).

### V5 — Pagamento atômico (US5, SC-005)

1. Caminho feliz: "paguei a conta de luz, 180 no Nubank, categoria contas" → Kaguya
   confirma os 3 dados → tarefa completa **e** despesa lançada (conferir via Nami:
   "quanto gastei hoje?").
2. Falha simulada (teste automatizado em `test_kaguya_tasks.py`): conta financeira
   inexistente → **nenhum** efeito persiste (tarefa segue aberta, zero despesa).

### V6 — TickTick aposentado (FR-003)

```bash
grep -ri ticktick coordinator/ agents/ webapp/backend/ mcp_servers/ --include="*.py" \
  && echo "FALHOU: resíduo encontrado" || echo "OK: zero referência no runtime"
```

Bot e webapp sobem **sem** nenhuma variável `TICKTICK_*` no ambiente.

## Critério final (SC-001)

Uma semana de uso real sem abrir o TickTick. Nota de deploy: remover as variáveis
`TICKTICK_*` do Dokploy após a validação.
