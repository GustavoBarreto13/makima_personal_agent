# Implementation Plan: Nami · Finanças

**Branch**: `002-nami-financas` | **Date**: 2026-06-09 | **Spec**: `specs/002-nami-financas/spec.md`

**Input**: `specs/002-nami-financas/spec.md` (10 User Stories, 39 FRs, fiel ao design handoff
`docs/claude_design/design_handoff_nami_financas/README.md`)

---

## Summary

Implementar a sub-app **Nami · Finanças** no Makima Web App — uma interface visual de gestão
financeira pessoal, completa e fiel ao design handoff do Claude Design (tangerina + azul-maré,
tipografia Bricolage/DM Sans/DM Mono, paleta OKLch, estética "caderno de bordo").

A implementação:
- Segue o **padrão estrutural do `frieren/`** (NamiShell, TweaksPanel, Toast, CSS tokens, namiApi)
- **Estende o backend existente** `/api/finances/*` com novos campos, novos endpoints de stats/categorias/upload, e duas novas tabelas (`personal_loans`, `financings`)
- **Não toca** na tabela `loans` existente (usada pelo bot Telegram, modelo PRICE/SAC incompatível)
- Entrega 8 telas: Dashboard, Transações, Contas, Cartões, Assinaturas, Orçamentos, Empréstimos, Financiamentos

**MVP**: US1 (lançamento rápido) + US2 (dashboard do mês) — as demais telas são P2/P3.

---

## Technical Context

**Language/Version**: Python 3.12 (backend) · TypeScript / Node 20 (frontend)

**Primary Dependencies**:
- Backend: FastAPI + uvicorn, psycopg2-binary (síncrono — requisito constitution §arc), Pydantic v2, itsdangerous (cookies), python-multipart (upload de arquivo)
- Frontend: React 19, TypeScript, Vite 6, Tailwind CSS 3, react-router-dom 7

**Storage**: PostgreSQL (compartilhado com o bot Telegram e demais agentes). Driver síncrono `psycopg2-binary` — não async. Conexão via `DATABASE_URL`.

**Testing**: Sem framework de testes formal. Validação manual conforme `specs/002-nami-financas/quickstart.md`. Regressão do bot Telegram verificada manualmente após migração.

**Target Platform**: Linux x86-64 (container Docker `makima-web`, VPS). Dev local: macOS/Windows com `.venv`.

**Project Type**: Web application — FastAPI backend + React SPA, mesmo origem em produção (FastAPI serve o `dist/`).

**Performance Goals**: App pessoal (1 usuário). Sem metas de throughput. Dashboard deve carregar em < 1 s em LAN. Toast + atualização reativa devem ser imediatos (estado React local, sem round-trip extra).

**Constraints**:
- `psycopg2-binary` síncrono (não `asyncpg`) — requisito da constitution
- Cookie `makima_session` em **todas** as rotas `/api/*` via `Depends(require_user)` — sem exceção
- Não usar `git add .` — `webapp/frontend/dist/` está no `.gitignore`
- Não alterar a tabela `loans` existente (compatibilidade com o bot Telegram)
- Ícones: filesystem local `webapp/uploads/icons/` + `StaticFiles` — não GCS

**Scale/Scope**: 1 usuário · 8 telas · ~10 entidades · ~20 novos endpoints/extensões

---

## Constitution Check

*GATE: Verificado antes de Phase 0 (pesquisa já concluída). Re-verificado após Phase 1 (design).*

| Princípio | Status | Evidência |
|---|---|---|
| **I. Agent Specialization** | ✅ PASS | Webapp chama tools de `agents/nami/tools*.py` diretamente — não instancia ADK nem duplica lógica de domínio. Makima não implementa nada de finanças. |
| **II. Hybrid Batch+Agentic** | ✅ PASS | Esta feature adiciona camada interativa (SPA). Nenhuma automação batch do n8n é migrada ou removida. |
| **III. Self-Contained** | ✅ PASS | Tabelas novas (`personal_loans`, `financings`) são isoladas — não dependem de outros agentes em runtime. IDs/schemas copiados, não importados. |
| **IV. Portuguese-First** | ✅ PASS | Spec, comentários e toda a UI estão em português. Respostas de erro ao usuário em PT. `Intl.NumberFormat('pt-BR')` para valores monetários. |
| **V. Minimal Footprint** | ✅ PASS | Apenas 2 novas tabelas (justificadas em Complexity Tracking). Ícones em filesystem local (sem novo SDK de storage). Padrão frieren/ reutilizado sem duplicação. |

**Resultado: todas as gates PASS.** Implementação pode prosseguir.

---

## Project Structure

### Documentação (esta feature)

```text
specs/002-nami-financas/
├── plan.md              # Este arquivo (/speckit-plan)
├── spec.md              # 10 User Stories, 39 FRs, Key Entities, SC, Assumptions
├── research.md          # Decisões técnicas: tabelas novas, upload local, stats, categorias
├── data-model.md        # Entidades + extensões + migration script
├── quickstart.md        # Guia de validação end-to-end (US1–US10)
├── contracts/
│   └── api.md           # Novos endpoints + extensões de campos
└── tasks.md             # (a ser gerado por /speckit-tasks)
```

### Source Code

```text
# Backend (estender o existente)
webapp/
└── backend/
    ├── main.py                 # Adicionar mount de StaticFiles /uploads/*
    └── routers/
        └── finances.py         # Estender: novos Pydantic models, novos endpoints

# Script de migração (one-time, executa dentro do container)
scripts/
└── migrate_nami_webapp.py      # ALTER TABLE accounts/cards/subscriptions
                                # CREATE TABLE personal_loans + financings

# Frontend (espelha a estrutura do frieren/)
webapp/
└── frontend/src/pages/nami/
    ├── NamiShell.tsx           # Shell principal: state global, sidebar, topbar, SummBar
    ├── nami.css                # CSS tokens do handoff §2 (OKLch, tipografia, dark theme)
    ├── types.ts                # Types TS: Transaction, Account, Card, Loan, etc.
    ├── namiApi.ts              # Wrapper tipado sobre lib/api.ts para /api/finances/*
    ├── Toast.tsx               # Toast pill (ou reusar frieren/Toast)
    ├── TweaksPanel.tsx         # Tema, acento, densidade, privacidade
    ├── modals/
    │   ├── AddModal.tsx        # Modal completo de nova transação (atalho A/+)
    │   ├── FormModal.tsx       # Modal genérico de CRUD
    │   └── IconField.tsx       # Upload + URL + preview circular + fallback sigla
    ├── components/
    │   ├── QuickAdd.tsx        # Barra inline de lançamento rápido
    │   ├── TxRow.tsx           # Linha de transação (CatBadge + valor + excluir)
    │   ├── DonutChart.tsx      # SVG donut "Para onde foi"
    │   ├── CashflowChart.tsx   # Barras duplas mensais
    │   └── LoanCard.tsx        # Card de empréstimo/financiamento com dots de parcelas
    └── screens/
        ├── Dashboard.tsx
        ├── Transactions.tsx
        ├── Accounts.tsx
        ├── Cards.tsx
        ├── Budgets.tsx
        ├── Subscriptions.tsx
        ├── Loans.tsx
        └── Financings.tsx

# Rota nova no App.tsx (frontend)
webapp/frontend/src/App.tsx     # Adicionar: <Route path="/nami/*" element={<NamiShell />} />

# Uploads (criado em runtime, não commitado)
webapp/uploads/icons/           # Ícones enviados via POST /api/finances/uploads/icon
```

**Structure Decision**: Web app, dois módulos (backend Python + frontend TypeScript). Padrão idêntico ao que o `frieren/` usa — `FrierenShell.tsx` é o blueprint de referência.

---

## Complexity Tracking

> **Preenchido porque envolve novas tabelas PostgreSQL — justificativa necessária para constitution §V (Minimal Footprint).**

| Violação potencial | Por que é necessária | Alternativa mais simples rejeitada |
|---|---|---|
| Nova tabela `personal_loans` | Empréstimos pessoa-a-pessoa têm campos específicos (`direction`, `person_name`) incompatíveis com o modelo PRICE/SAC da tabela `loans` existente (usada pelo bot) | Discriminador na tabela `loans`: misturaria dois modelos — campos PRICE/SAC ficariam NULL para personal e vice-versa; alteraria tabela em produção usada pelo bot (risco de quebra) |
| Nova tabela `financings` | Financiamentos estruturados têm campos próprios (`description`, `lender`, `interest_rate`) e são semanticamente distintos de empréstimos informais — o handoff §6.8 trata como entidade separada | Adicionar `kind = 'personal'\|'financing'` à tabela `loans`: engessar numa única tabela três modelos distintos; todo query exigiria filtro discriminador; violaria §6.8 do design |
| `python-multipart` (nova dep) | Upload de ícone requer `multipart/form-data` no FastAPI | Receber base64 no JSON: blobs grandes degradam performance de queries comuns no PostgreSQL (campo `icon_url TEXT` guardaria blobs) |
