# Quickstart: Revisão semanal guiada (Kaguya)

Pré-requisitos: backend (`python -m coordinator.main` não é necessário para estes cenários —
são todos webapp + scheduler), webapp backend + frontend rodando localmente
(`CLAUDE.md` § "Como rodar localmente"), migração da spec 035 aplicada
(`scripts/setup_schemas.py`, cria `task_weekly_reviews` + `task_projects.last_reviewed_at`).

## Cenário 1 — Revisão completa do zero (US1, SC-001, SC-004)

1. Garanta pelo menos 1 item em cada foco: 1 tarefa no Inbox sem status GTD, 1 com
   `gtd_status='next_action'`, 1 com `gtd_status='waiting'`, 1 lista qualquer, 1 evento na
   semana (Calendar Hub), 1 com `gtd_status='someday'`.
2. No painel, inicie a revisão (`POST /api/tasks/reviews/start` → `resumed: false`).
3. Percorra os 6 passos, executando pelo menos uma ação em cada:
   - Passo 1: processe o item do inbox (qualquer decisão).
   - Passo 2: conclua a próxima ação.
   - Passo 3: confirme que aparece com `waiting_since`/`days_waiting`; edite a `waiting_note`.
   - Passo 4: marque a lista como revisada (`POST /projects/{id}/mark-reviewed`).
   - Passo 5: confirme que vê eventos/tarefas da semana passada e da próxima.
   - Passo 6: promova o item "algum dia" para próxima ação.
4. Escreva a nota final e conclua (`POST /reviews/{id}/complete`).
5. **Esperado**: resposta `{"status": "ok", "completed_at": ...}`; `GET /reviews/last` agora
   devolve essa revisão; `GET /reviews/history` a lista; tempo total < 15 min (SC-001).

## Cenário 2 — Passo vazio celebra o estado limpo (US1, Acceptance Scenario 6)

1. Com o Inbox vazio, abra o passo 1.
2. **Esperado**: `list_inbox_queue()` devolve `[]`; a UI mostra estado "zerado" e permite
   avançar direto (sem bloquear).

## Cenário 3 — Retomar revisão abandonada (US2, SC-002)

1. Inicie uma revisão, marque os passos 1 e 2 como vistos (`PATCH /reviews/{id}/step` duas
   vezes), e pare (não conclua).
2. Em uma nova sessão, chame `POST /reviews/start` de novo.
3. **Esperado**: `resumed: true`, mesmo `id`, `steps_seen` ainda contém `["inbox",
   "next_actions"]` — nenhuma segunda linha foi criada (confirme via
   `SELECT count(*) FROM task_weekly_reviews WHERE completed_at IS NULL` → 1).

## Cenário 4 — Lembrete de domingo (US3, SC-003)

1. Sem nenhuma revisão concluída nos últimos 7 dias, rode o job manualmente:
   `docker exec makima-web sh -c "cd /app && python -m scripts.send_weekly_review_reminder"`
   (ou localmente: `python -m scripts.send_weekly_review_reminder`).
2. **Esperado**: mensagem chega no Telegram (`TELEGRAM_ALERT_CHAT_ID`) com a contagem do inbox e
   dos itens "aguardando" antigos.
3. Conclua uma revisão (Cenário 1) e rode o job de novo.
4. **Esperado**: nenhuma mensagem é enviada (script termina silenciosamente, log confirma
   `should_send=False`).
5. Confirme o registro em `scheduler_runs` para as duas execuções (sucesso em ambas, mesmo na
   execução que não envia nada — "não enviar" não é falha).

## Cenário 5 — Indicador "última revisão há N dias" (US4, SC-005)

1. Conclua uma revisão agora. `GET /api/tasks/reviews/last` → `completed_at` = agora.
2. No painel, confirme que o indicador mostra "hoje" (ou "há 0 dias").
3. Ajuste manualmente `completed_at` no banco para 5 dias atrás (só para teste local) e
   recarregue o painel — confirme "há 5 dias".
4. Clique no indicador — confirme que abre o wizard (`POST /reviews/start` → como não há
   revisão aberta, cria uma nova).

## Verificação cruzada com Success Criteria

| Cenário | Success Criteria |
|---|---|
| 1 | SC-001 (tempo), SC-004 (histórico preserva datas/passos/nota) |
| 2 | (implícito em SC-001 — passo vazio não trava o fluxo) |
| 3 | SC-002 (retomada correta, sem duplicata) |
| 4 | SC-003 (lembrete se-e-somente-se) |
| 5 | SC-005 (indicador reflete a realidade, fuso local) |
