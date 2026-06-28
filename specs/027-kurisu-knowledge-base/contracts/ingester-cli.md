# Contrato: CLI de ingestão `scripts/setup_kurisu_rag.py`

Sobe a camada `wiki/` da Knowledge Base Karpathy para o corpus do Vertex AI RAG. **Já existe** — este
contrato documenta o comportamento esperado (sem mudança funcional no v1).

## Invocação

```bash
python -m scripts.setup_kurisu_rag [--wiki-dir DIR] [--bucket NAME] [--prefix P]
                                   [--display-name NAME] [--location LOC]
                                   [--embedding-model M] [--chunk-size N] [--chunk-overlap N]
                                   [--recreate] [--dry-run]
```

## Flags principais

| Flag | Default | Efeito |
|---|---|---|
| `--wiki-dir` | `G:\Meu Drive\...\Knowledge Base Karpathy` (ou `$KURISU_WIKI_DIR`) | Raiz da wiki local |
| `--recreate` | off | Apaga o corpus e recria (rebuild limpo) — **gera novo id** |
| `--dry-run` | off | Lista o que seria enviado; não toca em GCS/Vertex |
| `--embedding-model` | `text-multilingual-embedding-002` | Modelo multilíngue (FR-012) |

## Pré-condições (env vars)

| Var | Uso |
|---|---|
| `GCP_CREDENTIALS_JSON` | Conteúdo JSON da service account (`roles/aiplatform.user` + `roles/storage.admin`) |
| `GCP_PROJECT_ID` | Projeto GCP |
| `KURISU_WIKI_DIR` / `KURISU_RAG_BUCKET` | Opcionais (override de caminho/bucket) |

## Comportamento (contrato verificável)

| # | Dado | Quando | Então |
|---|---|---|---|
| C1 | Wiki com N páginas elegíveis | ingestão roda | as N páginas (camada `wiki/` + `index.md`) ficam no corpus; **0** arquivos de `raw/` (FR-011, SC-006) |
| C2 | Corpus já existe + página editada | roda com `--recreate` | consulta sobre a página retorna conteúdo novo (FR-013, SC-007) |
| C3 | Ingestão termina | — | a wiki de origem (`raw/` e `wiki/`) permanece inalterada (FR-014, SC-005) |
| C4 | — | `--dry-run` | imprime amostra + destino; nenhuma escrita na nuvem |
| C5 | Sucesso | fim | imprime o `corpus resource name` para configurar `VERTEX_RAG_CORPUS` (FR-015) |

## Saída

`stdout` termina com:

```
✅ Ingestão concluída.
   Corpus resource name:
   projects/{PROJECT_ID}/locations/us-central1/ragCorpora/{ID}
   VERTEX_RAG_CORPUS=projects/.../ragCorpora/{ID}
```

> Após `--recreate`, **atualizar** `VERTEX_RAG_CORPUS` (env do container `makima-web`) com o novo id e
> redeployar — senão a Kurisu segue lendo o corpus antigo (apagado) e cai em `indisponivel`.

## Requisitos cobertos

FR-011, FR-012, FR-013, FR-014, FR-015, FR-019; SC-005, SC-006, SC-007.
