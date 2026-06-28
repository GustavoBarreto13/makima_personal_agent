# Research: Kurisu — Memória Unificada (spec 028)

Decisões técnicas (Phase 0). Cada item: **Decisão / Rationale / Alternativas**.

---

## R1 — Mecanismo de agendamento do sync

**Decisão**: job agendado **containerizado**, seguindo o **mesmo padrão do `backup_postgres.py`**
(serviço com cron/schedule no Dokploy que roda `python -m scripts.sync_kurisu_memory`).

**Rationale**: Constituição II ("automações agendadas → script Python") + precedente direto no projeto
(o backup do Postgres já roda assim, com `DATABASE_URL` + `GCP_CREDENTIALS_JSON`). Não acopla o sync ao
runtime do bot, não exige endpoint HTTP, e roda onde o `DATABASE_URL` resolve.

**Alternativas**:
- *n8n → HTTP* (n8n agenda e chama um endpoint `/api/kurisu/sync` no makima-web): alinhado com o
  briefing matinal, mas adiciona endpoint + background task + timeout do n8n. Mais peças.
- *APScheduler / cron interno ao makima-web*: mistura batch com o processo do bot (contra Princ. II).

---

## R2 — Busca multi-corpus (a API só aceita 1 corpus por chamada)

**Decisão**: `buscar_na_base` faz **2 chamadas `retrieval_query`** (corpus da wiki + corpus
operacional), **mescla** os trechos e **reordena** por score do reranker + recência, retornando o top-N.

**Rationale**: **validado empiricamente** que `rag.retrieval_query` lança
`ValueError: Currently only support 1 RagResource` quando recebe 2 corpora. Logo, multi-corpus exige N
chamadas. Como a 028 **já precisa** aplicar recência pós-recuperação (R6), o merge no código é o lugar
natural para ambos. As 2 queries podem rodar concorrentemente.

**Alternativas**:
- *1 corpus único* (compartilhar wiki + operacional): rejeitado no clarify — o `--recreate` da 027
  destruiria os dados operacionais.
- *`ask_contexts` / outra API multi-corpus*: não confirmada como multi-corpus; mais superfície.

---

## R3 — Ingestão incremental no Vertex (Serverless)

**Decisão**: por domínio, manter **watermark** (maior `updated_at`/`created_at` já sincronizado) e
**`content_hash`** por documento. No ciclo: gerar documentos só de linhas novas/alteradas → subir ao GCS
(prefixo por domínio) → `rag.import_files`. Para **item editado**: `rag.delete_file` + reimport (o
Vertex de-dup por URI; só reimportar com mesmo nome **não** atualiza o chunk).

**Rationale**: a lição da 027 (de-dup por URI) vale aqui; sem `delete_file` o conteúdo editado não
atualiza. Watermark + hash evitam reprocessar tudo (custo de embedding).

**Alternativas**: *rebuild noturno completo* (como `--recreate`): simples, mas re-embeda tudo toda
noite — custo desnecessário num corpus que cresce devagar.

---

## R4 — Representação mista por domínio

**Decisão**:
- **Resumo datado** (1 documento por dia/semana): atividade (tarefas concluídas de Kaguya) e finanças
  (gastos do período — Nami). Unidade de recall temporal ("o que fiz na semana de X").
- **Documento individual**: bullet de diário (Violet), item de mídia (Frieren/Akane/Marin/Mai), pessoa
  (Komi) — cada um com `doc_date` e `source_ref` próprios.

**Rationale**: alinha com a decisão do clarify de 2026-06-26 (FR-003). Resumos datados dão recall
temporal denso; itens individuais preservam granularidade onde ela importa (diário, mídia).

**Alternativas**: *tudo individual* (cada tarefa um doc): explode o nº de documentos e fragmenta o
recall temporal. *Tudo resumo*: perde a granularidade do diário.

---

## R5 — Prune com trava anti-catástrofe (≤50%)

**Decisão**: por domínio, comparar os `source_ref` presentes no corpus operacional vs. os existentes na
origem; os ausentes na origem são candidatos a `delete_file`. **Se** os candidatos a remoção forem
**>50%** dos documentos daquele domínio num único passe → **abortar a remoção** do domínio e registrar
alerta (provável defeito de leitura, não remoção legítima).

**Rationale**: FR-007/SC-005. Um erro de conexão/leitura que retorne "0 linhas" não pode esvaziar a
memória. A trava trata remoção em massa como bug.

**Alternativas**: *soft-delete / tombstone*: mais estado a manter; YAGNI no v1.

---

## R6 — Recência pós-recuperação (o *wrinkle* da spec)

**Decisão**: aplicar recência **no código, após o retrieval** (`agents/kurisu/recency.py`, motor puro):
- Pergunta **temporal** com intervalo explícito ("semana de X", "em maio") → **filtrar** candidatos por
  `doc_date` dentro da janela (UTC-3).
- Pergunta com viés de recência sem intervalo ("recentemente", "ultimamente") → **reordenar** por um
  score combinado (relevância do reranker × decaimento por idade do `doc_date`).
- Pergunta atemporal (conceito/estudo) → não aplicar recência; só relevância.

**Rationale**: o Vertex RAG **não** decai por data nativamente (Restrição Técnica da spec). `doc_date`
está no metadado de cada documento. Espelha a lição do `recency_score` do Odysseus.

**Alternativas**: *confiar só no reranker*: ignora tempo, quebra "o que fiz esta semana". *janela fixa
sempre*: rígido demais para perguntas atemporais.

---

## R7 — Acoplamento de schema com 8 domínios (Constituição I/III)

**Decisão**: um **exporter por domínio** em `agents/kurisu/memory/exporters.py`, cada um lendo **apenas**
as tabelas do seu domínio (read-only) e renderizando para texto. Os schemas são **lidos**, não
importados dos pacotes dos agentes (cópia das queries, como já se faz com APIs externas — Princ. III).

**Rationale**: isola o acoplamento — uma mudança no schema da Nami quebra só o exporter da Nami. A
memória unificada é cross-domain por natureza; esta é a forma de menor acoplamento (a alternativa
exigiria cada agente "saber exportar para a Kurisu", mais invasivo).

**Alternativas**: *cada agente expõe um `export_for_memory()`*: espalha a responsabilidade e acopla os
agentes à Kurisu (pior para Princ. III). *View SQL unificada*: esconde a lógica de render em SQL.

---

## R8 — Citação da origem operacional (FR-011)

**Decisão**: cada documento carrega `domain` + `doc_date` + `source_ref` no metadado; a Kurisu cita de
forma legível por domínio: "tarefa concluída em DATA", "bullet de DATA", "filme visto em DATA, nota N".
A instrução da persona distingue citação operacional (com data) de citação da wiki (título da página).

**Rationale**: FR-011 + SC-001 (datas corretas em UTC-3). O `source_ref` permite rastrear a linha de
origem; o `doc_date` garante a data local correta.

**Alternativas**: *citar o `source_ref` cru* (id da linha): ilegível para o usuário.

---

## Resumo das decisões

| Item | Decisão |
|---|---|
| R1 Agendamento | Job containerizado (padrão `backup_postgres.py`) |
| R2 Multi-corpus | 2 queries + merge no código (API aceita só 1 corpus — validado) |
| R3 Incremental | Watermark + hash; `delete_file`+reimport p/ editados |
| R4 Representação | Mista: resumo datado (atividade/finanças) + individual (diário/mídia/pessoa) |
| R5 Prune | Comparar source_refs; trava ≤50% por domínio |
| R6 Recência | Pós-recuperação por `doc_date` (filtrar/reordenar) — motor puro |
| R7 Acoplamento | 1 exporter read-only por domínio; schema copiado, não importado |
| R8 Citação | `domain`+`doc_date`+`source_ref` no metadado; citação legível por domínio |
