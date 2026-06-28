# Quickstart / Validação: Kurisu — Base de Conhecimento

Guia para provar que a feature funciona ponta a ponta. **Não** contém código de implementação — só
pré-requisitos, comandos e resultados esperados. Detalhes de entidades/contratos: ver
[data-model.md](./data-model.md) e [contracts/](./contracts/).

## Pré-requisitos

- Service account GCP com `roles/aiplatform.user` + `roles/storage.admin`, exportada em
  `GCP_CREDENTIALS_JSON`; `GCP_PROJECT_ID` setado.
- Wiki sincronizada localmente (Google Drive, `G:\...\Knowledge Base Karpathy`).
- `pip install -r requirements.txt` (inclui `google-cloud-aiplatform>=1.71`).

## Passo 1 — Ingestão (popular o corpus)

```bash
# Conferir o que seria enviado (sem tocar na nuvem):
python -m scripts.setup_kurisu_rag --dry-run

# Ingestão real:
python -m scripts.setup_kurisu_rag
```

**Esperado**: imprime `N arquivo(s) selecionado(s)` (camada `wiki/` + `index.md`) e, ao fim, o
`corpus resource name`. **Validar SC-006**: a amostra do `--dry-run` não contém nenhum caminho `raw/`.

Configurar a env e (no deploy) redeployar o `makima-web`:

```bash
VERTEX_RAG_CORPUS=projects/{PROJECT_ID}/locations/us-central1/ragCorpora/{ID}
```

## Passo 2 — Subir o coordinator localmente

```bash
python -m coordinator.main
```

## Passo 3 — Cenários de validação (via Telegram)

| # | Enviar | Esperado | Cobre |
|---|---|---|---|
| V1 | "O que eu sei sobre BM25?" (tema na base) | Resposta sintetizada + **cita** ≥1 página real; nada inventado | US1, FR-002/003, SC-001 |
| V2 | "O que eu tenho sobre termodinâmica quântica?" (ausente) | Diz **explicitamente** "não encontrei na base" antes de qualquer conhecimento geral | US2, FR-004, SC-002 |
| V3 | "O que eu tenho sobre arquitetura de software?" (amplo) | Conecta **múltiplas** páginas numa resposta coerente, citando as fontes | US3, FR-007 |
| V4 | "Me faz um quiz sobre minhas notas de Python" | Perguntas derivadas só do conteúdo da base | US4, FR-008 |
| V5 | "Me faz um quiz sobre <tema ausente>" | Recusa: não há material suficiente | US4, FR-008 |
| V6 | "me fala sobre aquilo" (vago) | Pede reformulação curta em vez de adivinhar | FR-010 |
| V7 | Termo literal raro presente numa página (ex.: "Present Perfect") | Traz a página que contém o termo | FR-017*, SC-008* |
| V8 | "salva isso na minha base" | Explica que só consulta (somente leitura) | FR-005, SC-005 |
| V9 | Com `VERTEX_RAG_CORPUS` vazio, perguntar algo | "a base ainda não está disponível" (sem travar/alucinar) | FR-009 |

> \* V7 é **parcial no v1** (densa+reranker, alvo SC-008 ≥80%). Casos de termo literal que falharem
> caem em V2 (fallback honesto). Falhas recorrentes aqui são o **gatilho da fase 2** (Weaviate).

## Passo 4 — Refresh (página editada)

```bash
# Editar uma página da wiki, depois:
python -m scripts.setup_kurisu_rag --recreate
# Atualizar VERTEX_RAG_CORPUS com o NOVO id e reiniciar o coordinator.
```

**Esperado**: perguntar sobre a página editada retorna o conteúdo **novo** (SC-007).

## Passo 5 — Eval set (critérios de sucesso mensuráveis)

Montar um conjunto pequeno de perguntas-gold rotuladas (na-base / fora-da-base / termo-exato) e medir:

| Critério | Meta v1 |
|---|---|
| SC-001 — cita página real quando o tema está na base | 100% |
| SC-002 — sinaliza ausência quando fora da base | ≥95% |
| SC-003 — roteamento Makima→Kurisu | ≥90% |
| SC-004 — resposta sem follow-up | ≥80% |
| SC-008 — recall de termo exato | **≥80%** (≥95% só na fase 2) |
| SC-009 — citações resolvem para arquivo real | 100% |

## Critério de pronto (Definition of Done do v1)

- [ ] V1–V9 passam manualmente no Telegram.
- [ ] `--dry-run` confirma 0 arquivos `raw/` (SC-006).
- [ ] Refresh via `--recreate` reflete edição (SC-007).
- [ ] Eval set rodado; metas v1 atingidas (ou desvios anotados).
- [ ] `VERTEX_RAG_CORPUS` configurado no `makima-web` (deploy).
