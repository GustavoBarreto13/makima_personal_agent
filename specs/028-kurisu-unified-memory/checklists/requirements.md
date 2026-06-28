# Specification Quality Checklist: Kurisu — Memória Unificada sobre o Postgres

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-06-26
**Feature**: [spec.md](../spec.md)

## Content Quality

- [ ] No implementation details (languages, frameworks, APIs) — **intencionalmente relaxado** (ver Notes)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [ ] No implementation details leak into specification — **intencionalmente relaxado** (ver Notes)

## Notes

- As cinco decisões de escopo (fonte = todos os domínios; Vertex AI RAG; sync agendado;
  representação mista; somente leitura) foram confirmadas com o usuário — nenhum marcador de
  clarificação restou.
- **Revisão de privacidade (2026-06-28):** o backend mudou de **pgvector local → Vertex AI RAG**. O
  usuário aceita indexar os dados sensíveis (diário/finanças) na nuvem do Google; a contrapartida é
  o corpus privado ao projeto GCP (FR-008/SC-004, antes "tudo local"). Os FR/SC comportamentais
  foram preservados.
- **Itens "no implementation details" desmarcados de propósito:** como na 027, as decisões técnicas
  já fechadas (corpus Vertex operacional **separado**, embeddings gerenciados, exporters por domínio,
  job de sync no container, trava ≤50%, fuso UTC-3, recência pós-recuperação) estão na seção
  *Restrições Técnicas*. O corpo de FR/US/SC permanece focado em capacidade.
- **Alinhamento com a 027 implementada (clarify 2026-06-28):** a 027 ficou em **Serverless mode** e
  trocou a `VertexAiRagRetrieval` pela FunctionTool **`buscar_na_base`** (com reranker). Decidido: a
  028 usa um **corpus operacional separado** (a 027 recria a wiki via `--recreate`, o que apagaria
  dados se o corpus fosse compartilhado) e `buscar_na_base` é **estendida para buscar nos dois
  corpora**. FR-009, Restrições, Key Entities, Dependencies e Assumptions atualizados.
- **Dependência dura:** a 028 depende da fundação da 027 (corpus serverless + ingester +
  tool `buscar_na_base`). Não planejar/implementar a 028 antes da 027.
- Os critérios de sucesso (SC-001..006) são mensuráveis e comportamentais (atividade real por
  período, frescor ≤24h, prune correto, corpus privado ao projeto, trava ≤50%, ordenação por
  recência).
