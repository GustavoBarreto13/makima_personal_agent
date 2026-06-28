# Quickstart / Validação: Kurisu — Memória Unificada (028)

Guia para provar a feature ponta a ponta. Sem código de implementação — pré-requisitos, comandos e
resultados esperados. Detalhes: [data-model.md](./data-model.md), [contracts/](./contracts/).

## Pré-requisitos

- **027 deployada e estável**: corpus da wiki + `buscar_na_base` em produção.
- Service account GCP (`roles/aiplatform.user`, `roles/storage.admin`, `roles/serviceusage.serviceUsageAdmin`).
- `DATABASE_URL` acessível de onde o sync roda; `GCP_CREDENTIALS_JSON`, `GCP_PROJECT_ID`.
- `pip install -r requirements.txt`.

## Passo 1 — Criar o corpus operacional

O sync cria o corpus operacional separado na 1ª execução (Serverless mode, embedding multilíngue) e
imprime o `corpus resource name`. Configurar:

```bash
VERTEX_RAG_CORPUS_OPERACIONAL=projects/{PROJECT_ID}/locations/us-central1/ragCorpora/{ID}
```

> É **distinto** do `VERTEX_RAG_CORPUS` da wiki (027). Os dois coexistem.

## Passo 2 — Primeiro sync (carga inicial)

```bash
# Conferir o que seria enviado (sem tocar no Vertex):
python -m scripts.sync_kurisu_memory --dry-run

# Sync real:
python -m scripts.sync_kurisu_memory
```

**Esperado**: imprime, por domínio, quantos documentos importou; nenhuma escrita nas tabelas de origem.

## Passo 3 — Cenários de validação (via Telegram)

| # | Enviar | Esperado | Cobre |
|---|---|---|---|
| V1 | "o que eu fiz esta semana?" | Atividade real da semana (tarefas/bullets/mídia), datas em UTC-3 | US1, SC-001 |
| V2 | "o que escrevi no diário sobre carreira?" | Bullets reais do tema, citando datas | US2 |
| V3 | "que filmes eu vi em maio?" | Itens reais de maio, com nota/data | US3 |
| V4 | "o que eu sei sobre BM25?" (tema da wiki) | Responde da **wiki** normalmente (busca unânime não atrapalha) | FR-009 |
| V5 | "o que eu tenho sobre <tema ausente em tudo>?" | "não encontrei" (honestidade da 027) | US2 |
| V6 | pergunta com 2 itens de datas diferentes igualmente relevantes | Mais recente tende a vir primeiro | FR-005/SC-006 |

## Passo 4 — Ciclo de frescor (sync incremental)

```bash
# 1. Criar uma tarefa/bullet novo (via Telegram ou webapp).
# 2. Rodar o sync:
python -m scripts.sync_kurisu_memory
# 3. Perguntar pelo item → deve aparecer (SC-002).
# 4. Apagar o item na origem; rodar o sync de novo.
# 5. Perguntar de novo → não deve mais aparecer (SC-003).
```

## Passo 5 — Trava anti-catástrofe

```bash
# Simular leitura que retornaria remoção em massa (ex.: domínio com falha de query):
python -m scripts.sync_kurisu_memory --domain <dominio>
```

**Esperado**: se o passe tentaria remover **>50%** dos documentos do domínio, o sync **aborta a
remoção** daquele domínio e registra alerta — nada é apagado (SC-005).

## Passo 6 — Eval set temporal

| Critério | Meta |
|---|---|
| SC-001 — "o que fiz na semana de X" reflete itens reais, datas UTC-3 | ≥90% |
| SC-002 — item novo consultável em ≤1 ciclo | 100% (≤24h) |
| SC-003 — item apagado some após sync | 100% |
| SC-005 — trava ≤50% dispara quando ultrapassa | 100% |
| SC-006 — mais recente antes em empate de relevância | ≥90% |

## Definition of Done (v1)

- [ ] Corpus operacional criado; `VERTEX_RAG_CORPUS_OPERACIONAL` configurado (`.env` + Dokploy).
- [ ] Sync inicial popula os 8 domínios; 0 escritas na origem (C1).
- [ ] V1–V6 passam no Telegram; busca unânime não quebra perguntas de wiki (V4).
- [ ] Ciclo criar→sync→consultar→apagar→sync→sumir validado (SC-002/SC-003).
- [ ] Trava ≤50% validada (SC-005).
- [ ] Job agendado configurado (padrão `backup_postgres.py`).
