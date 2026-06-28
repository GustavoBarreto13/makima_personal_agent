# Kurisu — Assistente da Base de Conhecimento

## O que é

**Kurisu Makise** (de Steins;Gate) é a especialista de **conhecimento/estudo** da Makima.
Ela consulta a base de conhecimento curada do usuário — a wiki pessoal **"Knowledge Base
Karpathy"** (mantida via skill `obsidian-wiki`) — e responde perguntas ancoradas nela.

Persona **única** no v1: direta, rigorosa, levemente sarcástica, mas dedicada ao
crescimento intelectual do usuário. Opera em **modo somente leitura** — recupera e
responde, nunca cria nem edita notas.

> A spec completa é a **027** (`specs/027-kurisu-knowledge-base/spec.md`). A **028**
> (`specs/028-kurisu-unified-memory/`) estende a memória da Kurisu para os dados do
> Postgres (diário, tarefas, finanças, mídia, pessoas) — **ainda não implementada**.

---

## Arquitetura

```
Usuário → Makima → kurisu_agent
                      └── buscar_na_base (FunctionTool — agents/kurisu/tools.py)
                              └── rag.retrieval_query + reranker (RankService)
                                      └── Corpus Vertex AI RAG (Serverless mode):
                                          camada wiki/ da Knowledge Base Karpathy
```

- **Backend de recuperação:** Vertex AI RAG Engine (Google Cloud) em **Serverless mode**.
  Reusa a service account e o projeto GCP já usados pelo resto do projeto (BigQuery/backup).
- **Modo do RAG Engine:** **Serverless** (não Spanner). Projetos novos do GCP estão bloqueados
  do Spanner mode em `us-central1` por capacidade; o ingester troca o engine para Serverless
  automaticamente. Em Serverless o vector DB é o `RagManagedVertexVectorSearch` gerenciado.
- **APIs necessárias (além de aiplatform/storage):** `vectorsearch.googleapis.com` (vector DB
  do serverless) e `discoveryengine.googleapis.com` (reranker RankService). O ingester habilita
  a Vector Search API; a Discovery Engine API foi habilitada na ativação.
- **Embeddings:** modelo multilíngue gerenciado do Vertex (`text-multilingual-embedding-002`),
  porque a wiki é PT/EN/JA.
- **LLM:** `gemini-2.5-flash`.
- **Singleton:** Kurisu não usa McpToolset (sem processo filho). A tool `buscar_na_base` é uma
  FunctionTool comum; o `vertexai.init` é lazy-singleton dentro de `tools.py`.

### Por que Kurisu encapsula o RAG (e não a Makima diretamente)

- Pode pré-processar a query (clarificar) e pós-processar o resultado com seu estilo.
- Mantém a separação de domínios: cada especialista é dono do seu. A Makima fica enxuta.

---

## A tool: `buscar_na_base`

FunctionTool em [tools.py](tools.py) — substitui a `VertexAiRagRetrieval` nativa do ADK
(que não expõe o reranker). Chama `rag.retrieval_query` direto com `RagRetrievalConfig`.
Implementa o padrão **retrieve-wide → rerank-narrow** (FR-016).

- Lê o corpus de `VERTEX_RAG_CORPUS` (vazio ⇒ `status: "indisponivel"`, estado válido — FR-009).
- `top_k` largo (`KURISU_TOP_K_WIDE`, default 10): candidatos da busca vetorial densa.
- Reranker `RankService("semantic-ranker-default-004")` reordena por relevância.
- `top_n` final (`KURISU_TOP_N_NARROW`, default 5): trechos retornados ao agente.
- Limiar `KURISU_RELEVANCE_THRESHOLD` (default 0.0): trechos abaixo viram `status: "vazio"`.

Retorna `dict` `{status, trechos, mensagem}` — ver [contrato](../../specs/027-kurisu-knowledge-base/contracts/buscar_na_base.md).
Cada trecho tem `texto`, `fonte`, `uri`, `score`.

> **Citação (`fonte`):** em Serverless mode o `source_display_name` vem **vazio** no retorno
> do retrieval. A tool deriva a `fonte` do `source_uri` (basename do arquivo, ex.: `ansiedade.md`)
> via `_derivar_fonte()` — assim a citação resolve para o arquivo real (SC-009).

### Limitação conhecida — termo exato (spec 027: FR-017/018, SC-008)

A busca é **densa + reranker** (não hybrid). Recall de **termo literal raro** (ex.: "BM25",
"Present Perfect") pode falhar — a busca semântica retorna páginas tematicamente próximas, não
a que contém o token exato. É o esperado no v1 (SC-008 alvo ≥80%). **Fase 2** (sob gatilho de
uso): backend Weaviate para hybrid search real (denso + esparso/BM25) → SC-008 ≥95%.

---

## Comportamento (regras da persona)

| Situação | Comportamento (spec) |
|---|---|
| Base tem material | Sintetiza e **cita** ≥1 página real da wiki por título; menciona a fonte `raw/` quando ajuda a rastrear (FR-002/FR-003) |
| Base não tem | Diz **explicitamente** "não encontrei na base" antes de qualquer conhecimento geral; nunca passa conhecimento geral como se fosse da base (FR-004) |
| Tema espalhado | Cruza e conecta **múltiplas páginas** numa resposta coerente (FR-007) |
| Pedido de quiz | Gera perguntas só do conteúdo da base; recusa se não há material suficiente (FR-008) |
| Pergunta vaga | Pede reformulação curta em vez de adivinhar (FR-010) |
| Base indisponível | Avisa que a base não está pronta, sem travar nem alucinar (FR-009) |
| Pedido de escrita | Explica que só consulta — somente leitura (FR-005) |

**Formatação:** HTML do Telegram (`<b>`, `<i>`, `<code>`, `<pre>`), **nunca** markdown —
o Telegram do projeto renderiza HTML (ver `coordinator/CLAUDE.md`). Sempre em português.

---

## Ingestão da base: `scripts/setup_kurisu_rag.py`

Sobe a camada `wiki/` (≈386 páginas sintetizadas) + `index.md` para o corpus do Vertex.
O `raw/` (fontes brutas) **não** é indexado — cada página já guarda `source_path: raw/...`
no frontmatter, então o raw é citável sem ser embeddado (FR-011).

```bash
# 1ª vez — cria o corpus e importa tudo:
python -m scripts.setup_kurisu_rag

# Rebuild limpo (recria o corpus — gera NOVO id, atualize VERTEX_RAG_CORPUS):
python -m scripts.setup_kurisu_rag --recreate

# Só listar o que seria enviado:
python -m scripts.setup_kurisu_rag --dry-run
```

> **Refresh:** o Vertex RAG de-duplica por URI da fonte — re-importar um arquivo cujo
> conteúdo mudou (mesmo nome) **não** atualiza o chunk antigo sozinho. Para refletir edições
> da wiki (FR-013/SC-007), use `--recreate` (rebuild limpo) ou re-import por arquivo
> (delete-file + import). O ingester atual usa `--recreate`.
>
> **Onde roda:** a ingestão lê arquivos locais (Google Drive, `G:\...`) e fala direto com
> Vertex/GCS pela internet — não depende do Postgres do VPS.
>
> **Anti-truncamento:** o `import_files` por prefixo **trunca** numa operação grande (a 1ª
> ingestão pegou só 356/410 — a cauda alfabética de `sources/` ficou de fora). Por isso o
> ingester faz uma **verificação pós-import**: compara o corpus com a lista esperada e completa
> os faltantes em **lotes de ≤25 URIs** (`import_files` aceita no máx. 25 URIs por chamada),
> repetindo até ficar completo. Idempotente — se já está 410/410, não faz nada.

---

## Setup (uma vez)

1. Service account com `roles/aiplatform.user` + `roles/storage.admin` +
   `roles/serviceusage.serviceUsageAdmin` (habilitar APIs do Serverless mode).
2. APIs habilitadas no projeto: `aiplatform`, `storage`, **`vectorsearch.googleapis.com`**
   (vector DB do serverless) e **`discoveryengine.googleapis.com`** (reranker). O ingester
   habilita a Vector Search API e troca o engine para Serverless mode automaticamente; a
   Discovery Engine API foi habilitada na ativação (reranker).
3. Rodar `python -m scripts.setup_kurisu_rag` — ao final ele imprime o `corpus resource name`.
4. Configurar a env var (e redeploy no Dokploy):
   `VERTEX_RAG_CORPUS=projects/{PROJECT_ID}/locations/us-central1/ragCorpora/{ID}`

Env vars já usadas pelo resto do projeto: `GCP_CREDENTIALS_JSON`, `GCP_PROJECT_ID`.

> **Corpus atual (ativação 2026-06-28):**
> `projects/191286448915/locations/us-central1/ragCorpora/6199890982331219968`
> (345 de 410 páginas importadas).

---

## Roteamento pela Makima

A Makima envia para a Kurisu quando o assunto é **conhecimento, estudo, conceitos ou
memória das notas** ("o que eu sei/anotei sobre X?"). Perguntas fora desse domínio
(ex.: "lança uma despesa") vão para outro agente (Nami) — a Kurisu só atua quando recebe.

---

## Escopo v1 (o que **não** faz)

- Sem os modos Tutora/Amiga (cortados — persona única no v1).
- Sem escrita de qualquer tipo (somente leitura).
- Sem indexar o vault Obsidian geral nem a camada `raw/` — só a `wiki/` curada.
- Sem os dados do Postgres (diário/finanças/mídia) — isso é a **spec 028**.
- Cross-agent com a Kaguya (sugerir tarefa de estudo ao detectar gap) — gancho futuro.
