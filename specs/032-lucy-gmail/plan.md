# Implementation Plan: Lucy — agente de Gmail (email)

**Branch**: `032-lucy-gmail` (diretório da spec; sem branch git — regra "não criar branch automaticamente") | **Date**: 2026-07-05 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/032-lucy-gmail/spec.md`

## Summary

Trazer a **Lucy** (domínio email/Gmail) para dentro do Makima como agente nativo, aposentando o
script externo do n8n (`n8n-python-scripts/lucy_email_agent`). Duas metades independentes:

1. **Agente interativo `lucy_agent`** (singleton ADK, padrão Nami/Akane) — **somente leitura** via
   IMAP: ver não lidos/recentes, buscar no inbox, abrir um email. Persona Lucy (Cyberpunk:
   Edgerunners), respostas em português/HTML começando com "Lucy:". Zero mutação da caixa.
2. **Script agendado `scripts/send_lucy_digest.py`** — porta fiel do `main.py` do n8n, registrado no
   `scheduler/` (fase 032), rodando diário às 08:00 (America/Sao_Paulo): busca os emails de ontem
   (cap 50) via IMAP, classifica cada um com o Gemini nas **mesmas 10 categorias** do base
   (JSON `{uid, category, priority, summary, action}`), aplica as labels + arquiva os "Junk" no
   Gmail, envia o digest no Telegram no formato antigo, e — **única novidade** — persiste cada email
   classificado na tabela nova `lucy_emails` (upsert idempotente por `gmail_uid`, sobrescrevendo em
   reexecução — Clarification 2026-07-05).

**Abordagem técnica** (segue os padrões do repo):
- **Camada IMAP pura** `agents/lucy/gmail_imap.py` — conectar/buscar/parsear/etiquetar (portada do
  base), reusada pelo agente e pelo script.
- **Lógica única** `agents/lucy/tools.py` — 3 tools read-only do agente + `classify_emails()`
  (Gemini one-shot com JSON schema, reusa `google-genai` como a spec 031) + `persist_classified()`
  (via `agents.db`) + DDL `_ensure_tables()` (padrão `agents/journal/tools.py`).
- **Agente** `agents/lucy/agent.py` — `lucy_agent` singleton (`gemini-2.5-flash`).
- **Job** `scripts/send_lucy_digest.py` + wrapper em `scheduler/jobs.py` + 1 linha em
  `scheduler/registry.py` (`daily_at(8, 0)`).
- **Coordinator** `coordinator/agent.py` — descomentar import, adicionar a `sub_agents`, bloco de
  roteamento. **Nenhuma dependência nova** (imaplib/email são stdlib; requests e google-genai já existem).

## Technical Context

**Language/Version**: Python 3.12 (agentes/scripts/scheduler)

**Primary Dependencies**: `imaplib`/`email` (stdlib — IMAP + parsing) · `google-genai` (classificação
Gemini one-shot com `response_schema`; já transitivo do `google-adk`, fixado explícito na 031) ·
`google-adk` (Agent singleton) · `psycopg2-binary` (PostgreSQL síncrono, via `agents.db`) · `requests`
(push Telegram)

**Storage**: PostgreSQL compartilhado (`DATABASE_URL`) — 1 tabela nova `lucy_emails`

**Testing**: `pytest` para as partes puras/determinísticas (parser de email + `build_telegram_digest`
+ agrupamento por categoria) em `tests/agents/test_lucy_*.py`; verificação manual end-to-end
(quickstart.md) para IMAP/Gemini/Telegram (efeitos externos, não testáveis unitariamente sem mocks)

**Target Platform**: containers Linux — `makima-web` (agente, no coordinator) e `makima-scheduler`
(digest). Ambos precisam de `GMAIL_USERNAME`/`GMAIL_APP_PASSWORD`.

**Project Type**: Multi-agente ADK + script batch agendado (sem frontend nesta fase)

**Performance Goals**: digest ≈ N chamadas Gemini (uma por lote/email, N ≤ 50) — segundos a poucos
minutos, dentro de SC-001 (≤ 5 min do horário agendado); leituras interativas = 1 conexão IMAP,
resposta ≤ 15 s (SC-005)

**Constraints**: modelo `gemini-2.5-flash` via `GEMINI_API_KEY` (constituição; o base usava 2.0-flash
— configurável por `GEMINI_MODEL`); datas em UTC-3 (`America/Sao_Paulo`); agente **somente leitura**
(nenhum STORE/APPEND/envio a partir do `lucy_agent`); as 10 labels precisam pré-existir no Gmail

**Scale/Scope**: usuário único; ≤ 50 emails/dia no digest; volume interativo baixo

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Agent Specialization (NON-NEGOTIABLE)** — ✅ Toda a lógica de email vive em `agents/lucy/`;
  Makima só delega (bloco de roteamento em `_MAKIMA_INSTRUCTION`). O script `send_lucy_digest.py`
  importa a lógica de `agents/lucy/` (não reimplementa). Sem tools cross-domain nesta fase.
- **II. Hybrid Batch + Agentic** — ✅ O digest permanece **batch Python** (não vira lógica ADK); só a
  camada interativa é um `Agent`. A migração é de **n8n → `scheduler/` do próprio repo** (padrão já
  estabelecido na fase 032 para backup/kurisu-sync/letterboxd), não para dentro do ADK. O espírito do
  princípio — não transformar automação de volume em agente — é preservado. Registrado em research.md.
- **III. Self-Contained Agents** — ✅ `agents/lucy/` é importável/testável isolado; cria a própria
  tabela via `_ensure_tables()` (padrão `agents/journal/`). Não depende de outro agente em runtime.
  IDs/critérios IMAP são copiados do base, não importados do `n8n-python-scripts`.
- **IV. Portuguese-First UX** — ✅ Respostas do agente e digest em português, persona Lucy; erros
  comunicados em PT-BR (o agente nunca expõe stacktrace). Formatação HTML (Telegram do digest usa
  HTML, como o base; nota abaixo sobre parse_mode).
- **V. Minimal Footprint** — ✅ Domínio genuinamente novo (email) já previsto na constituição
  (`lucy → email (Gmail)`). Zero dependências novas. Uma única tabela, justificada (histórico
  idempotente — habilita consulta/tela futura; `received_date` derivada em UTC-3).

**Architecture Constraints**: `gemini-2.5-flash` ✓; sem MCP novo ✓; PostgreSQL síncrono (`agents.db`)
✓; `python-telegram-bot` no coordinator ✓. **Desvios conscientes (registrados em research.md):**
(a) a classificação usa `google-genai` direto (one-shot, JSON estruturado) em vez de um `Agent` ADK —
coerente com o padrão de scripts batch e com a spec 031; (b) o **digest** envia ao Telegram em
`parse_mode=HTML` (o base usa HTML e a constituição cita Markdown para o bot conversacional) — HTML é
necessário para preservar o layout do digest herdado; o `lucy_agent` conversacional segue o padrão dos
outros agentes.

**Resultado do gate**: PASS (sem violações que exijam Complexity Tracking).

## Project Structure

### Documentation (this feature)

```text
specs/032-lucy-gmail/
├── plan.md              # Este arquivo
├── spec.md              # Especificação (com Clarifications)
├── research.md          # Fase 0 — decisões técnicas
├── data-model.md        # Fase 1 — tabela lucy_emails + entidades derivadas
├── quickstart.md        # Fase 1 — roteiro de verificação end-to-end
├── contracts/
│   └── interfaces.md    # Fase 1 — tools do agente + contrato do job + JSON schema da classificação
└── checklists/
    └── requirements.md  # Checklist de qualidade da spec (16/16)
```

### Source Code (repository root)

```text
agents/lucy/                 # NOVO pacote (padrão singleton Nami/Akane)
├── __init__.py              # docstring do pacote
├── gmail_imap.py            # NOVO — camada IMAP pura: connect/fetch/parse/label/archive (do base)
├── tools.py                 # NOVO — 3 tools read-only + classify_emails() + persist_classified() + DDL
├── agent.py                 # NOVO — lucy_agent (ADK singleton, gemini-2.5-flash)
├── schema_pg.sql            # NOVO — tabela lucy_emails
└── CLAUDE.md                # NOVO — tools, schema, personalidade, decisões locais

scripts/
└── send_lucy_digest.py      # NOVO — job diário: fetch → classifica → labela/arquiva → Telegram → Postgres

scheduler/
├── jobs.py                  # editar — + run_lucy_digest() (wrapper subprocess)
└── registry.py              # editar — + ScheduledJob("lucy_digest", daily_at(8,0))

coordinator/
└── agent.py                 # editar — import + sub_agents + bloco ROTEAMENTO PARA LUCY

scripts/setup_schemas.py     # editar — + "agents/lucy/schema_pg.sql" na lista SCHEMA_FILES

tests/agents/
├── test_lucy_parse.py       # NOVO — parser de email (decode headers, snippet, fallback HTML)
└── test_lucy_digest.py      # NOVO — build_telegram_digest + agrupamento/ocultação de Junk

# Docs (checklist de entrega — não são artefato do plano)
requirements.txt             # editar — nada novo (confirmar google-genai já fixado pela 031)
docs/referencia/POSTGRES.md · ROADMAP.md · CLAUDE.md (raiz) · coordinator/CLAUDE.md · scheduler/CLAUDE.md · README.md
```

**Structure Decision**: Multi-agente ADK. Cria um pacote de domínio novo `agents/lucy/` seguindo o
padrão singleton já estabelecido (Nami/Akane) + um script batch em `scripts/` registrado no
`scheduler/` existente. Nenhum diretório novo de topo, nenhum frontend nesta fase.

## Complexity Tracking

> Sem violações de constituição — seção não aplicável.
