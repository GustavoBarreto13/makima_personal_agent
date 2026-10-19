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
> Postgres (diário, tarefas, finanças, mídia, pessoas) — **parcialmente implementada**:
> a fundação vive em `agents/kurisu/memory/` (`exporters.py`, `render.py`, `store.py`,
> `sync.py` — sync incremental via hash-manifest, rodado por `scripts/sync_kurisu_memory.py`)
> e o motor puro de recência em `agents/kurisu/recency.py` (`aplicar_recencia` — reordena
> trechos por `doc_date` após o rerank). 2 dos 8 exporters (diário, tarefas) prontos
> localmente; deploy no VPS e os 6 exporters restantes pendentes. A **031**
> (`specs/031-violet-tutor-idiomas/`) adiciona o **Tutor de Idiomas** — ver seção própria
> abaixo — persona Kurisu aplicada a um domínio novo (correção de escrita na Violet),
> **✅ implementada**. A **061** (`specs/061-violet-conselho-diario/`) adiciona o
> **Conselho do Dia** — ver seção própria abaixo — outra persona aplicada a um domínio
> novo da Violet (análise diária ancorada no RAG), **✅ implementada**.

---

## Tutor de Idiomas na Violet (spec 031) — `tutor_mastery.py` + `tutor.py`

Um botão discreto em cada bullet do diário (Violet) pede uma análise de escrita em
inglês. A Kurisu analisa via **Gemini one-shot** (`google-genai`, não ADK — o webapp
nunca instancia ADK) e devolve correção gramatical mínima, reescrita natural/idiomática,
erros por conceito gramatical (com explicação em PT-BR), um resumo na voz dela e uma
nota 0–100. O resultado alimenta um **toggle no próprio bullet** (original ↔ corrigido,
o original nunca é sobrescrito) e um **perfil de maestria por conceito** que evolui ao
longo do tempo, exibido numa tela de progresso própria (`/journal` → aba "Tutor").

### Por que aqui e não em `agents/journal/`

O tutor **é** a Kurisu (persona + gancho futuro com a memória unificada — spec 028).
Isso cria um acoplamento cross-domain aceito e documentado: as tabelas
`journal_tutor_*` têm FK para `journal_bullets(id)` (ON DELETE CASCADE), mas
`agents/journal/` continua **sem** nenhuma dependência da Kurisu — quem conhece os
dois ao mesmo tempo é só o **router do webapp** (`webapp/backend/routers/journal.py`),
que importa `agents.kurisu.tutor` e compõe o campo `tutor` no payload de `GET /page`.

### Motor puro — `tutor_mastery.py`

Espelha `agents/kaguya/habit_strength.py` (EMA, sem banco, testável isolado), mas com
sinal por **análise em que o conceito apareceu** (não por dia — sem escrita, sem sinal;
**não há decaimento por ausência**, diferente do modelo de hábitos):

- `mastery(signals, weight=0.3)` — EMA cronológica (0–1); peso maior que o dos hábitos
  (0.1) porque a escrita melhora mais rápido e há menos amostras.
- `trend(signals)` — 2 EMAs (rápida/lenta); `None` com <3 sinais ("poucos dados").
- `summarize(signals)` — `{mastery, mastery_pct, trend, samples, correct}`.
- `estimate_cefr(recent_scores)` — nível A1–C2 pela média das notas recentes;
  `preliminary=True` com <5 análises. Derivado na leitura, **sem** chamada extra ao Gemini.
- `pick_next_focus(skills, guide_targets)` — sugestão determinística de próximo foco:
  prioriza os alvos do guia de estudo ativo (menor maestria entre eles); sem guia (ou
  sem dados nos alvos), cai para o conceito de menor maestria com `samples >= 3`.

Gate: `tests/agents/test_kurisu_tutor_mastery.py`.

### Lógica + Gemini — `tutor.py`

- `CONCEPTS_EN` — vocabulário canônico (~27 slugs + rótulo PT-BR: `verb-to-be`,
  `articles`, `past-simple`, `prepositions`, `phrasal-verbs`, ...). Injetado no prompt
  para manter os slugs estáveis entre análises; qualquer slug fora da lista vira
  `"outros"` (`_normalize_slug`). Rótulos são sempre derivados server-side (nunca
  confiamos no rótulo que o modelo eventualmente devolvesse).
- `_ensure_tutor_tables()` — cria as 4 tabelas `journal_tutor_{analyses,events,skills,guides}`
  (idempotente, chamada na importação — mesmo padrão de `agents/journal/tools.py`).
- `_build_prompt` + `_call_gemini` — chamada one-shot (`genai.Client(...).models.generate_content`,
  `response_schema` força JSON estruturado); autentica com `GEMINI_API_KEY`. Quando há um
  guia de estudo ativo, o prompt ganha um bloco extra de ênfase nos conceitos-alvo.
- `analisar_escrita(bullet_id, language='en')` — a tool principal (US1): chamada ao
  Gemini acontece **fora** da transação de escrita; falha → `{status:'error'}` sem
  gravar nada (FR-010). Sucesso: insere 1 `analyses`, N `events` (1 por conceito tocado)
  e recomputa (`UPSERT`) a `skills` de cada conceito a partir do histórico completo de
  events daquele `(language, concept_slug)`.
- `get_bullet_analysis` / `get_bullets_tutor_meta` — leitura para o toggle (US2); a
  segunda é 1 query agregada (`DISTINCT ON`) para compor o campo `tutor` de vários
  bullets de uma vez (evita N+1 no `GET /page`).
- `list_skills` / `list_analyses` / `get_progress` — tela de progresso (US3): `get_progress`
  junta skills + `estimate_cefr` + `pick_next_focus` + guia ativo num único payload.
- `get_active_guide` / `set_active_guide` / `deactivate_guide` — guia de estudo (US4):
  no máximo um ativo por idioma (índice único parcial); trocar de guia desativa o
  anterior na mesma transação; editar/remover só afeta análises **futuras**.

### Tabelas (`journal_tutor_*`)

`analyses` (1 por análise pedida) → `events` (1 por conceito tocado, fonte da verdade
do progresso) → `skills` (cache materializado por conceito, recomputável dos events) +
`guides` (guia de estudo, no máx. 1 ativo por idioma). Coluna a coluna:
`docs/referencia/POSTGRES.md`.

---

## IA da Violet: Conselho do Dia, Revisão semanal e leitura emocional (specs 061 → 076)

A *voz* é da Violet (persona no prompt); o *conhecimento e a recuperação* são da Kurisu, dona do RAG.
`agents/journal/` continua sem depender da Kurisu: quem conhece os dois é `webapp/backend/routers/journal.py`
e, no MCP, `agents/kurisu/violet_tools.py` (juntado ao domínio `journal` em `mcp_servers/makima/registry.py`).
**Modelo único:** `models.py::VIOLET_MODEL` (env `VIOLET_GEMINI_MODEL`, padrão `gemini-3.8-flash`) — também
usado pelo Tutor e pelo `violet_agent`.

### Peças comuns

- `violet_ai.py` — Gemini (`gemini_json`, `gemini_web`), **RAG amplo** (`recuperar_amplo`: até 8 consultas,
  `buscar_na_wiki(q, top_n=8, top_k=15)`, no máx. 2 trechos por nota e 25 no total, intercalando as
  consultas; complementa com `buscar_na_base` se a wiki render < 4), `penalizar_repetidas` (notas citadas nos
  últimos dias vão para o fim da fila), `normalizar_citacoes` (os `[N]` do texto são validados contra os
  trechos recuperados e renumerados por nota; índice inválido some) e `TOM_VIOLET` (franca: confronta o que vai
  contra metas/valores/compromissos, dureza proporcional à evidência, nunca humilhação).
- `violet_context.py` — leitura pura: `dias` (texto sem a sintaxe dos tokens), `conselhos` (digest + desfecho
  das ações na Kaguya), `kaguya` (tarefas, hábitos, metas), `sinais` (força, emoção, foco: semana vs. anterior),
  `valores` (Avaliação dos Valores), `padroes_emocionais`, `compromissos_da_ultima_revisao`.

### Conselho do Dia — `counsel.py`

Antes (061): 2–4 cards presos a um trecho cada. Agora: **texto longo e denso (800–1.200 palavras)** que cruza
várias notas. Pipeline (tudo antes da escrita no banco — falha não grava nada):
temas (6–8 consultas) → RAG amplo → web só se a base vier quase vazia → **mapa de ideias** (JSON: espelho,
humor, observações, evolução, cobranças, princípios × trechos) → **conselho** (Markdown com as seções "O que eu
li no seu dia", "O que está acontecendo", "Como você evoluiu", "O que a sua base ensina sobre isso", "Como
aplicar amanhã" + ações) → citações validadas. O contexto inclui os conselhos dos **últimos 7 dias**
(`VIOLET_COUNSEL_HISTORY_DAYS`), os compromissos da última revisão semanal e os valores. Persistência em
`journal_counsel` (`essay_md`, `sources_json`, `digest_json`; o digest alimenta os conselhos seguintes).
Linhas antigas (só `toolkit_json`) continuam sendo exibidas no formato antigo.

### Conversa sobre o conselho — `counsel_chat.py`

O conselho vira conversa: o usuário responde e a Violet responde de volta, um fio por dia em
`journal_counsel_messages` (o payload do conselho traz `messages`; regerar mantém o fio com um `marker`).
`responder_conselho(date, message)` — tudo antes da escrita no banco (falha não grava nada, nem a mensagem dele):
conselho do dia + últimas 20 mensagens → 1–3 buscas curtas (JSON) → `recuperar_amplo` cortado em 10 trechos (notas já
citadas no conselho/conversa no fim da fila) → resposta de 80–300 palavras com `TOM_VIOLET` e o mesmo bloco de contexto do
conselho (`counsel._contexto`/`_bloco_contexto`) → `normalizar_citacoes` (fontes por mensagem) → INSERT das duas
mensagens numa transação. Sem trecho que sustente, a resposta diz que a base não tem e não cita. Só web por enquanto
(sem tool no MCP/Hermes). Peças puras: `validar_mensagem`, `bloco_historico`, `bloco_conselho`, `fontes_da_conversa`,
`montar_prompt_resposta`.

### Revisão semanal — `weekly_review.py`

`gerar_revisao_semanal(week)` lê a semana (segunda a domingo, America/Sao_Paulo): diário, conselhos com
desfecho, sinais, Kaguya, valores, padrões emocionais e a revisão anterior (cobra o que ela exigiu). Texto com
Veredito · Onde você foi bem · Onde você piorou · Comparado com a semana passada · Padrões · O que a sua base
diz · Para esta semana; `tone` = `tapa_na_cara` | `guia` pela evidência. Uma linha por semana em
`journal_weekly_reviews`. Envio: job `violet_weekly_review` (domingo 20:30, `VIOLET_WEEKLY_REVIEW_HOUR/MINUTE`)
→ `scripts/send_violet_weekly_review.py` (idempotente; `--dry-run`, `--week`, `--force`) → Hermes
(`scheduler/notify_channels.py`) com a versão curta e o link `WEBAPP_PUBLIC_URL/journal#refletir/semana/<data>`
(sem a env, deriva de `OAUTH_REDIRECT_URL`).

### Registro emocional — `emotion_analysis.py`

- `classificar_distorcoes(log_id)`: rótulos de distorção cognitiva do pensamento automático (catálogo fixo em
  `agents/journal/emotion_patterns.py::DISTORTIONS`), best-effort em segundo plano ao salvar o registro.
  Backfill: `scripts/backfill_violet_distortions.py`.
- `analisar_emocoes(since, until)`: a "leitura da Violet" (camada 2) sobre os achados determinísticos da
  camada 1 + registros + valores + RAG (TCC). Cache por período em `journal_emotion_analyses`.

### Endpoints (`webapp/backend/routers/journal.py`)

`POST/GET /counsel`, `POST /counsel/messages`, `GET /counsel/history`, `PATCH /counsel/actions`, `GET/POST /weekly-review`,
`GET /weekly-review/history`, `PATCH /weekly-review/actions`, `GET/POST /emotion-analysis`.

Testes: `tests/agents/test_kurisu_counsel.py` (peças puras do conselho), `tests/agents/test_kurisu_counsel_chat.py` (conversa) e `tests/agents/test_violet_076.py`
(citações, RAG amplo, semanas).

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
- **LLM:** `gemini-2.5-flash` (agente da Kurisu); a IA da Violet usa `VIOLET_MODEL` (ver acima).
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

> **`buscar_na_wiki(query)`** (spec 061): variante que consulta **só** o corpus da wiki
> (sem mesclar com a memória operacional). Mesmo formato de retorno. Existe porque a
> mescla de `buscar_na_base` reordena por recência e a memória operacional (sempre com
> `doc_date` recente) expulsa sistematicamente a wiki (`doc_date=None`) do corte — ver
> "Conselho do Dia" acima e `specs/061-violet-conselho-diario/research.md` R9.

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
> (556/556 páginas importadas — último sync incremental em 2026-08-15).

### Manter o corpus da wiki atualizado

A wiki **não sincroniza sozinha** — cada edição/página nova no vault Obsidian só entra
no corpus quando alguém roda `python -m scripts.sync_kurisu_wiki` (incremental, por
hash; não recria o corpus nem muda o ID). Isso é diferente da memória operacional
(spec 028), que já ressincroniza automaticamente todo dia às 04:00 via o job
`sync_kurisu` do scheduler — esse job **não toca na wiki**.

Causa raiz confirmada em 2026-08-15: uma pergunta sobre uma nota recém-criada na wiki
não achou nada via `buscar_na_base` porque 30 páginas novas + 24 editadas nunca tinham
sido sincronizadas. Rodar o sync manualmente (de dentro do container `makima-web`, que já
tem `GCP_CREDENTIALS_JSON`/`GCP_PROJECT_ID` no ambiente) resolveu:

```bash
docker exec -e KURISU_WIKI_DIR=<caminho do vault dentro do container> makima-web \
  sh -c "cd /app && python -m scripts.sync_kurisu_wiki"
```

Como o vault (`Obisidan-Knowledge-Base`, repo próprio no GitHub) não está montado no
VPS, isso exige copiar `wiki/` + `index.md` pro container antes (`docker cp`) — não é
algo pra rodar toda vez manualmente. Existe um rascunho de automação via GitHub Actions
(`.github/workflows/sync-kurisu-rag.yml` no repo do vault, dispara a cada push em
`wiki/**`/`index.md` e roda este mesmo script), mas ainda **não está ativado** —
faltam os secrets `GCP_CREDENTIALS_JSON`, `GCP_PROJECT_ID` e `MAKIMA_REPO_TOKEN`
(PAT read-only pro checkout deste repo, que é privado) cadastrados no repo do vault.
Até isso ser feito, repetir o sync manual periodicamente (ou sob demanda, quando uma
busca não achar algo que deveria estar na wiki).

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
