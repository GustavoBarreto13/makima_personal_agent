# Quickstart: validando o Yato ponta a ponta

Guia de validação — não é o roteiro de implementação (esse é o `tasks.md`, gerado depois por
`/speckit-tasks`). Assume que `agents/yato/`, `webapp/backend/routers/travel.py` e
`webapp/frontend/src/pages/yato/` já foram implementados conforme `plan.md` / `data-model.md` /
`contracts/`.

## Pré-requisitos

- `.venv` do repo ativa, `DATABASE_URL` apontando para o PostgreSQL do projeto (local ou VPS).
- `agents/yato/schema_pg.sql` registrado em `scripts/setup_schemas.py` (`SCHEMA_FILES`).
- Nenhuma variável de ambiente nova é necessária (FR-030) — se algum passo abaixo pedir uma, é sinal
  de que a implementação saiu do escopo da fatia.

## 1. Schema

```bash
python -m scripts.setup_schemas
```

Conferir as 8 tabelas:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_name IN (
  'trips', 'trip_items', 'mobility_dossiers', 'mobility_checks',
  'trip_mobility_snapshots', 'mobility_apps', 'trip_checklist_items', 'trip_budget_items'
);
-- esperado: 8 linhas
```

## 2. Semear a base de apps regionais

```bash
python -m scripts.seed_mobility_apps
```

```sql
SELECT count(*) FROM mobility_apps;
-- esperado: 12 (Garupa, Urbano Norte, Ubiz Car, BibiMob, Bora94, Chofer 46, Urban66, Rota Pop,
-- V1, InDrive, Uber, 99) + Cittamobi, Moovit se contados à parte — conferir contra research.md
```

## 3. US1 — criar viagem e montar roteiro (bot)

No Telegram/canal do Hermes (ou `python -m coordinator.main` local):

1. "Yato, quero ir pra Tiradentes de 12 a 15 de setembro, modo economia."
   → esperado: viagem criada, `status='planejando'`, 4 dias derivados.
2. "No dia 13 de manhã, Igreja São Francisco de Assis."
   → esperado: item no dia 13, período `manha`, última posição.
3. Repetir para mais 4 itens em pelo menos 3 dias diferentes; pedir o roteiro completo.
   → esperado: itens agrupados por dia, ordenados manhã→tarde→noite→posição (FR-006).
4. Tentar um item numa data fora do intervalo (ex.: dia 20).
   → esperado: recusa explícita, citando o intervalo válido (FR-004).
5. Tentar criar uma viagem com `end_date` antes de `start_date`, e outra com mais de 60 dias.
   → esperado: ambas recusadas com mensagem clara (FR-002).

Repetir os passos 1–4 no webapp (`/travel` → Nova Viagem → detalhe com dias em colunas) e conferir
paridade visual/funcional com o bot.

## 4. US2 — protocolo de mobilidade (bot + webapp)

1. "Yato, como eu me viro em Tiradentes sem carro?"
   → esperado: dossiê criado (ou retomado), passo 1 apresentado (porte da cidade + expectativa
   estatística) — nunca o veredito direto (FR-007).
2. Responder "a 99 mostrou carros na simulação."
   → esperado: `check_key='99'`, `verdict='confirmado'`, `source='simulacao_in_app'`,
   `checked_at=hoje`.
3. Responder que o Google Maps não mostra rotas de ônibus.
   → esperado: `verdict='inconclusivo'` (nunca `'ausente'`), com a explicação de que só ~150
   cidades brasileiras estão no Moovit (FR-010).
4. Com os passos de app/transporte público em `ausente`/`inconclusivo`, pedir a recomendação.
   → esperado: `transfer_hospedagem` ou `taxi_mototaxi`, sinalizando que apps não são confiáveis
   ali (FR-012).
5. Simular `last_checked_at` com mais de 180 dias (`UPDATE mobility_dossiers SET last_checked_at =
   NOW() - INTERVAL '200 days' WHERE ...`) e reabrir a viagem.
   → esperado: dossiê marcado `stale`, sugestão de revalidar (FR-013).
6. No webapp, abrir o painel do dossiê e conferir os 7 passos coloridos, com símbolo + rótulo (não
   só cor) para cada veredito.

## 5. US3 — apps e checklist (bot + webapp)

1. Com destino em MG, pedir apps de mobilidade.
   → esperado: apps cuja `coverage_values` cobre MG, cada um com o selo "cobertura declarada —
   confirmar in-app" (FR-015) — inclusive Uber e 99.
2. Com "Uber ausente" e "transfer da pousada confirmado" no dossiê, gerar o checklist.
   → esperado: inclui "combinar transfer com a pousada", **não** inclui "instalar Uber" (SC-008).
3. Marcar um item como concluído no webapp, recarregar a página.
   → esperado: progresso persiste (FR-016).

## 6. US4 — matriz de conforto (offline, sem banco)

```bash
pytest tests/agents/test_yato_comfort.py -v
```

Casos mínimos a cobrir (contra a tabela ANTT do `research.md`, SC-005):
- 11h noturno → `semi_leito` ou superior, com justificativa de exaustão (cenário 1).
- 3h diurno → `convencional` aceitável, sem empurrar upgrade (cenário 2).
- 13h noturno → compara `leito_cama` com diária de hotel (cenário 3).
- Perfil `economia`, folga de orçamento, sem app de corrida confirmado → `transfer_privativo` no
  topo da fila de ROI (cenário 4).

Também validar via API sem UI:
```bash
curl -s "http://localhost:8000/api/travel/comfort?hours=11&night=true&profile=economia" \
  -H "Cookie: makima_session=<sessão válida>"
```

## 7. US5 — orçamento atômico com a Nami

1. Definir R$ 600 de hospedagem e R$ 400 de transporte na viagem.
   → esperado: orçamento total estimado R$ 1.000 (cenário 1).
2. Registrar um gasto de R$ 45 em `alimentacao`, descrição "Almoço".
   → esperado: `actual` da categoria sobe para R$ 45 **e** existe uma transação na Nami com o
   mesmo valor/data, categoria `Alimentacao` (mapa D6 do `plan.md`).
   ```sql
   SELECT * FROM transactions WHERE source = 'yato' ORDER BY created_at DESC LIMIT 1;
   ```
3. **Teste de falha**: forçar uma categoria Nami inválida (ex.: temporariamente quebrar o mapa de
   categoria no código, ou testar com uma conta que não existe) e registrar um gasto.
   → esperado: **nada** gravado nem em `trip_budget_items.actual` nem em `transactions` — conferir
   as duas tabelas antes/depois e comparar contagens (FR-021, SC-006).
4. Pedir o resumo do orçamento.
   → esperado: estimado, realizado e saldo por categoria e total, com categorias estouradas
   destacadas (FR-022).

## 8. Front-end — checagem visual

```bash
cd webapp/frontend && npm run dev
```

Abrir `/travel` e percorrer as 6 telas (Home, Viagens, Detalhe, Dossiê, Orçamento, Checklist),
conferindo contra `design_handoff_yato_viagens/design-guide.md` §10 (regras "não violar") e
`README.md`:
- Nenhum `fetch` direto fora de `yatoApi.ts`.
- CSS isolado em `.yato-shell` — nenhum vazamento visual em outros shells.
- Rota `/travel/*` registrada antes do catch-all `/*` em `App.tsx`.
- Cores de veredito fixas (não mudam com `[data-accent]`); `inconclusivo` nunca em vermelho.
- Veredito sempre com símbolo + rótulo textual, nunca só cor.
- Todo `AppSuggestionCard` — incluindo Uber e 99 — carrega o selo "confirmar in-app".
- Datas via `todayLocalISO()` (cópia local em `pages/yato/dateUtils.ts`) — nunca
  `toISOString().slice(0,10)`.
- Item de roteiro sem `start_time` não renderiza nenhum horário (não "00:00").
- Mudança de datas com itens órfãos mostra banner âmbar com mover/remover — nunca apaga em
  silêncio.
- Textos preservados literalmente: frase da sidebar, estados vazios (viagens/dossiê), selo dos
  apps, aviso do `LogExpenseModal`, nota do wizard sobre inconclusivo.

## 9. Hub da Makima

Abrir `/` (hub) e conferir o card do Yato em `pages/makima/data.ts` com os 2 stats vindos de
`GET /api/hub/summary` (ex.: próxima viagem, prontidão do dossiê) — cada stat deve degradar para
`"—"` se a query falhar, nunca 500 (padrão do arquivo).

## 10. Paridade bot ↔ webapp ↔ MCP

Confirmar que `agents/yato/toolset.py` está registrado em `DOMAINS["yato"]`
(`mcp_servers/makima/registry.py`) e acessível em `/mcp/yato` pelo Hermes, e que
`hermes/skills/yato-viagens/SKILL.md` existe e roteia corretamente (testar uma mensagem no canal
real do Hermes, não só no coordinator legado).

## Critério de "pronto"

Todos os 10 passos acima passam sem exigir nenhuma variável de ambiente nova, nenhuma dependência
nova, e nenhuma chamada a API externa paga (FR-030, SC-009) — se qualquer passo exigir isso, a
implementação saiu do escopo da fatia 066.
