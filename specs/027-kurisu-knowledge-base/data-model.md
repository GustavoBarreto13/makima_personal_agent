# Data Model: Kurisu — Base de Conhecimento

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

Não há banco relacional nesta feature — o "modelo de dados" é a forma dos objetos do **Vertex AI RAG
Engine** e dos arquivos da wiki. Abaixo, as entidades e suas relações, com regras de validação
derivadas dos requisitos.

---

## Entidades

### 1. Página da wiki (arquivo-fonte)

Arquivo `.md` da camada `wiki/` da Knowledge Base Karpathy. Unidade primária de citação.

| Campo (frontmatter) | Tipo | Origem | Uso |
|---|---|---|---|
| `title` | string | frontmatter | Título citado nas respostas (FR-003) |
| `type` | enum: concept/entity/source/overview | frontmatter | Contexto da citação |
| `topic`, `tags`, `related` | string/list | frontmatter | Navegação (não embeddado como filtro no v1) |
| `source_path` | string `raw/...` | frontmatter | Aponta a fonte bruta subjacente (FR-003, menção opcional) |
| *(corpo)* | markdown | conteúdo | Texto chunkado e embeddado |

**Regras**:
- Só entram arquivos sob `wiki/` + o `index.md` da raiz (FR-011). `raw/` **nunca** é indexado.
- Caminho relativo POSIX (`wiki/concepts/bm25-ranking.md`) é preservado como identidade da fonte.

### 2. Corpus Vertex AI RAG

O índice consultável. Construído pela ingestão; espelha a wiki (não é a fonte de verdade).

| Atributo | Valor (v1) |
|---|---|
| `display_name` | `kurisu-karpathy-wiki` |
| `location` | `us-central1` |
| `backend` | `RagManagedDb` (default) |
| `embedding_model` | `text-multilingual-embedding-002` |
| `resource_name` | `projects/{PROJECT_ID}/locations/us-central1/ragCorpora/{ID}` → env `VERTEX_RAG_CORPUS` |

**Regras**:
- Um corpus único compartilhado com a 028 (futura). No v1 só contém documentos da wiki.
- Edições da wiki refletidas via rebuild (`--recreate`) → gera **novo** `{ID}` (atualizar a env).

### 3. RagFile (arquivo importado no corpus)

Cada página da wiki vira um RagFile após `import_files`. Chunkado (≈512 tokens / 100 overlap).

| Atributo | Origem |
|---|---|
| `source_uri` | `gs://{bucket}/kurisu-wiki/wiki/concepts/bm25-ranking.md` |
| `source_display_name` | basename ou caminho relativo do arquivo |
| `file_id` | gerado pelo Vertex (necessário só para delete-file incremental — não usado no v1) |

### 4. Trecho recuperado (retrieved context)

O que `rag.retrieval_query()` devolve por candidato. Insumo da resposta da Kurisu.

| Campo | Tipo | Uso |
|---|---|---|
| `text` | string | Conteúdo sintetizado na resposta (FR-002) |
| `source_uri` | string | Resolve para arquivo real (SC-009) |
| `source_display_name` | string | Citação por título/nome (FR-003) |
| `score` | float | Relevância pós-recuperação; reranker reordena (FR-016) e define a fronteira (R7) |

**Regras**:
- `top_k` de recuperação **maior** que o nº final usado; reranker reduz para o top-N (FR-016).
- Se nenhum candidato passa o limiar de relevância → resultado **vazio** → caminho honesto US2 (FR-004).

### 5. Resposta ancorada (saída da Kurisu)

Texto final ao usuário. Não é persistido — é a renderização da síntese.

**Regras**:
- Cita ≥1 `source_display_name` real quando há material (SC-001/SC-009).
- Demarca explicitamente "veio da base" vs. "conhecimento geral" (FR-004).
- HTML do Telegram, português (FR-006 + convenção real do projeto).

---

## Relações

```
Página da wiki (.md) ──(ingestão: espelha p/ GCS + import_files)──► RagFile no Corpus
                                                                        │
Pergunta do usuário ──(buscar_na_base: retrieval_query + rerank)──► Trecho recuperado (N)
                                                                        │
                                                              ──(síntese + citação)──► Resposta ancorada
```

- **Página ↔ RagFile**: 1:1 por arquivo (um `.md` → um RagFile, múltiplos chunks).
- **Pergunta ↔ Trecho**: 1:N (uma query → vários candidatos, reordenados, top-N usados).
- **Trecho ↔ Página**: N:1 via `source_uri` (vários chunks da mesma página).

## Estados / ciclo de vida do corpus

```
(inexistente) ──setup_kurisu_rag──► (populado) ──wiki muda──► (defasado) ──--recreate──► (repopulado, novo id)
      │                                                                                          │
      └──► Kurisu consulta: env VERTEX_RAG_CORPUS vazia/ausente ⇒ "base indisponível" (FR-009) ◄──┘
```
