# Implementation Plan: Violet — Conselho do Dia

**Branch**: `master` (repo convention: no auto-branching — ver `CLAUDE.md`) | **Date**: 2026-07-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/061-violet-conselho-diario/spec.md`

## Summary

Uma seção nova no topo da tela "Escrever" da Violet: sob demanda (um clique), lê os bullets,
registros emocionais, cartas e o estado de tarefas/hábitos do dia (+ um resumo dos 7 dias
anteriores e os 3 conselhos mais recentes, para continuidade), consulta a base de
conhecimento pessoal via RAG (Kurisu) e devolve quatro blocos fixos — espelho do dia,
ferramentas da base (com citação), pergunta de reflexão, ações sugeridas. Busca na web entra
só como complemento, quando o RAG não cobre. Uma linha por dia (`journal_counsel`, `UNIQUE
page_id`); "Regerar" sobrescreve.

**Abordagem técnica**: reuso quase integral do precedente já implementado na spec 031 (Tutor
de Idiomas) — chamada Gemini one-shot via `google-genai` a partir do webapp (nunca ADK),
tabela criada sob demanda (`_ensure_*_tables()` no import do módulo), e o router
`webapp/backend/routers/journal.py` compondo Journal + Kurisu, sem acoplar `agents/journal/`
à Kurisu. A lógica nova mora em `agents/kurisu/counsel.py` (a Kurisu é dona do RAG —
Princípio I da Constitution) e reusa `buscar_na_base()` (já é uma função Python pura,
chamável direto do webapp) e as leituras já existentes da Kaguya
(`tools_tasks.list_tasks_today`, `tools_habits.list_habits`). Nenhum agente novo, nenhuma
dependência nova de storage.

## Technical Context

**Language/Version**: Python 3.11 (backend/agents) + TypeScript/React (frontend, Vite)

**Primary Dependencies**: FastAPI (`webapp/backend`), `psycopg2-binary` (síncrono),
`google-genai` (chamada Gemini one-shot, já em uso pelo Tutor de Idiomas e pela Lucy),
`vertexai`/`vertexai.rag` (via `agents.kurisu.tools.buscar_na_base`, já existente) — nenhuma
dependência nova de bibliotecas Python. Frontend: React + `violetApi` (`lib/api.ts`),
componentes existentes de `pages/violet/`.

**Storage**: PostgreSQL (mesmo banco de Nami/Kaguya/Journal/Kurisu) — 1 tabela nova,
`journal_counsel`, criada sob demanda (mesmo mecanismo de `agents/journal/tools.py` e
`agents/kurisu/tutor.py`).

**Testing**: `pytest` para as partes puras e sem rede (seleção de consultas ao RAG, gate do
disparo da busca web, montagem do payload de coleta, serialização) — `tests/agents/
test_kurisu_counsel.py`, mesmo padrão de `tests/agents/test_kurisu_tutor_mastery.py`.

**Target Platform**: Linux server (VPS, container `makima-web`) + navegador (webapp). Sem
canal Telegram nesta feature (é exclusiva do webapp, como o Tutor de Idiomas).

**Project Type**: Web application (backend FastAPI + frontend React) — extensão pura,
nenhum projeto/serviço novo.

**Performance Goals**: SC-007 — o conselho completo (4 blocos) pronto em até 60s em ≥95% das
solicitações. Orçamento interno: 1 chamada Gemini para extrair temas + até 4 consultas a
`buscar_na_base` + (condicional) 1 chamada de busca web + 1 chamada Gemini de síntese —
tudo síncrono e bloqueante dentro da mesma request (o webapp não tem background job).

**Constraints**: chamada ao Gemini/RAG acontece **fora** da transação de escrita — falha em
qualquer etapa não grava nada (mesmo padrão FR-010 da spec 031); `UNIQUE(page_id)` +
`INSERT ... ON CONFLICT DO UPDATE` garante uma análise por dia; `google_search` e
`response_schema` são mutuamente exclusivos numa mesma chamada Gemini (restrição real da
API) — a etapa de busca web precisa ser uma chamada separada, sem schema.

**Scale/Scope**: usuário único (mesma premissa de todo o projeto).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Princípio | Avaliação |
|---|---|
| I. Agent Specialization | ✅ A lógica nova (`counsel.py`) fica em `agents/kurisu/` — a Kurisu já é a dona do domínio RAG/base de conhecimento; a Violet contribui só a persona (prompt) e a UI. Mesma decisão já tomada e documentada para o Tutor de Idiomas (spec 031): "o tutor **é** a Kurisu"; aqui, "o conselho **usa** a Kurisu". `agents/journal/` continua sem depender da Kurisu — quem compõe os dois é só o router do webapp. |
| II. Hybrid Batch + Agentic | ✅ Interação sob demanda via botão no webapp — não é automação agendada; não entra no `scheduler/`. |
| III. Self-Contained Agents | ✅ `agents/kurisu/counsel.py` importa `agents.kaguya.tools_tasks`/`tools_habits` (leitura) — mesmo padrão de import lazy cross-domain já usado por `agents/journal/tools.py` (import lazy de `agents.komi.tools`). Nenhuma dependência circular; Kaguya não sabe da existência do conselho. |
| IV. Portuguese-First UX | ✅ Persona Violet (prompt), respostas e mensagens de erro em português; sem HTML/Markdown do Telegram envolvido (feature é webapp-only). |
| V. Minimal Footprint | ✅ Uma tabela nova (não seis); reusa `buscar_na_base` existente em vez de criar um cliente RAG paralelo; reusa `list_tasks_today`/`list_habits` em vez de duplicar leitura de estado; busca web só entra condicionalmente, sem infra de busca nova além de 1 chamada Gemini com `google_search` habilitado. |

Nenhuma violação — sem necessidade de `Complexity Tracking`.

## Project Structure

### Documentation (this feature)

```text
specs/061-violet-conselho-diario/
├── plan.md              # este arquivo
├── research.md          # decisões técnicas (R1–R8)
├── data-model.md        # schema da tabela journal_counsel + regras
├── contracts/
│   └── rest-api.md      # 4 rotas novas em /api/journal/counsel*
├── quickstart.md        # cenários de validação end-to-end
└── tasks.md             # gerado por /speckit-tasks (não criado aqui)
```

### Source Code (repository root)

Aplicação web existente (backend FastAPI + frontend React) — sem opção de estrutura nova,
extensão dos módulos já mapeados em `agents/kurisu/CLAUDE.md` e `webapp/CLAUDE.md`:

```text
agents/kurisu/
├── counsel.py            # NOVO — pipeline completo: coleta (Journal+Kaguya, leitura) →
│                          #   temas (Gemini) → buscar_na_base (RAG) → web (condicional) →
│                          #   síntese (Gemini) → persistência (UPSERT journal_counsel)
│                          #   funções públicas: gerar_conselho, get_conselho, list_conselhos,
│                          #   marcar_acao_como_tarefa
└── CLAUDE.md              # + seção "Conselho do Dia (spec 061)", espelhando a seção do Tutor

webapp/backend/routers/journal.py   # + 4 rotas (POST/GET counsel, GET history, PATCH actions)
                                     #   + Pydantic bodies novos

webapp/frontend/src/lib/api.ts      # + métodos em violetApi: generateCounsel, getCounsel,
                                     #   counselHistory, markActionAsTask
webapp/frontend/src/pages/violet/
├── types.ts                        # + tipos Counsel/CounselAction/CounselToolkitItem
├── violet.css                      # + bloco .cs-* (prefixo exclusivo, fim do arquivo)
├── components/CounselSection.tsx   # NOVO — mesma posição de EmotionSection/LetterSection
│                                    #   em Write.tsx: estados vazio/carregando/pronto/erro
└── screens/Write.tsx                # + <CounselSection pageId={page?.id ?? null} date={...} />
                                      #   logo após .w-prompt, antes de <EmotionSection>

tests/agents/test_kurisu_counsel.py  # NOVO — partes puras: seleção de consultas, gate do web
                                      #   search, dedup de trechos, serialização (sem rede)

docs/referencia/POSTGRES.md          # + tabela journal_counsel (coluna a coluna)
```

**Structure Decision**: extensão pura da aplicação web já existente — nenhum novo
projeto/pacote/serviço/agente. Um módulo de lógica novo (`agents/kurisu/counsel.py`) segue
exatamente a convenção já usada por `agents/kurisu/tutor.py` (persona de um agente aplicada a
um domínio novo da Violet, tabela `_ensure_*` sob demanda, router como único ponto de
composição cross-agent).

## Complexity Tracking

*Sem violações da Constitution Check — seção não aplicável.*
