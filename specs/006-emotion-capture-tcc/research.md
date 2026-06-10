# Research — Registro Emocional (TCC)

**Feature**: 006-emotion-capture-tcc | **Date**: 2026-06-10

Resolução das decisões técnicas (NEEDS CLARIFICATION) antes do design. As 4 dúvidas de produto
já foram respondidas pelo usuário na fase de spec (registro TCC completo, lista predefinida +
custom, aba Emoções incluída, vermelho único — esta última pertence à spec 008). Aqui ficam só
as decisões de implementação.

---

## D1 — Vínculo do registro emocional: a `page_id` ou à `date`?

- **Decisão**: vincular `journal_emotion_logs.page_id → journal_pages(id)` com `ON DELETE CASCADE`.
- **Rationale**: é exatamente o padrão dos bullets. A página do dia já é criada sob demanda por
  `get_or_create_page` (o frontend chama `violetApi.page(date)` ao abrir a tela Write), então
  sempre haverá um `page_id` disponível antes de criar um registro. CASCADE garante que apagar a
  página apaga os registros — sem órfãos.
- **Alternativas rejeitadas**: guardar `date` direto no log duplicaria a lógica de resolução de
  página e perderia o CASCADE; exigiria join por data em vez de por FK.

## D2 — Escala de intensidade

- **Decisão**: inteiro `0–10`, validado por `CHECK (intensity BETWEEN 0 AND 10)` no banco e por
  Pydantic (`ge=0, le=10`) no router; controle de UI limitado ao intervalo.
- **Rationale**: convenção comum (SUDS reduzido) em instrumentos de TCC no Brasil; granularidade
  suficiente sem o atrito de 0–100.
- **Alternativas rejeitadas**: 0–100% (granularidade desnecessária), escala qualitativa
  (impede média e comparação temporal exigidas na US3).

## D3 — Reavaliação de intensidade (`reappraised_intensity`)

- **Decisão**: coluna separada nullable; só preenchível junto da `adaptive_response`. A regra
  "reavaliação exige resposta adaptativa" é aplicada na UI e validada no router
  (se `reappraised_intensity` vier preenchida, `adaptive_response` deve estar não-vazia).
- **Rationale**: a reavaliação mede o efeito da resposta adaptativa — sem ela, não tem
  significado clínico (edge case da spec).

## D4 — Vocabulário de emoções: dedupe e seed

- **Decisão**: tabela `journal_emotions(id, name, is_predefined BOOL)`. Unicidade por
  `CREATE UNIQUE INDEX ... ON journal_emotions (LOWER(name))`. Seed das 8 emoções base
  (alegria, tristeza, raiva, medo, ansiedade, culpa, vergonha, nojo) com `is_predefined=TRUE`,
  inserido apenas se a tabela estiver vazia (mesmo padrão do seed de `journal_types`).
- **Rationale**: dedupe case-insensitive atende FR-006 ("frustração" == "Frustração"); a flag
  distingue base de custom para a UI (FR-005) sem hardcode no frontend. `create_emotion`
  retorna a emoção existente em caso de colisão (idempotente).
- **Alternativas rejeitadas**: lista base hardcoded no frontend (impede dedupe contra custom e
  duplica a verdade); `UNIQUE(name)` sem `LOWER` (não pega variação de caixa).

## D5 — Onde calcular as agregações da aba Emoções

- **Decisão**: no backend, em `get_emotion_stats(year)` (SQL com `GROUP BY emotion`, `AVG`,
  `COUNT`, e distribuição mensal via `EXTRACT(MONTH ...)`).
- **Rationale**: o backend já concentra agregação em `get_stats` (padrão estabelecido). Mantém o
  frontend declarativo e a query única, evitando puxar todos os logs para o cliente.
- **Alternativas rejeitadas**: agregar no cliente (inconsistente com `get_stats`, transfere
  volume desnecessário).

## D6 — Integração com o filtro de ano (spec 005)

- **Decisão**: `get_emotion_stats(year)` recebe o ano; a aba Emoções usa a variável `year` já
  existente em `Insights.tsx`. Hoje `year` é fixo (`new Date().getFullYear()`); quando a spec
  005 tornar `year` um estado selecionável, a aba Emoções passa a respeitá-lo automaticamente.
- **Rationale**: parametrizar por ano desde já evita retrabalho e alinha com `get_stats`/
  `list_heatmap`, que já recebem `year`.

## D7 — Registros emocionais NÃO são bullets

- **Decisão**: tabelas separadas; nenhuma das queries de bullets, heatmap, coleções, stats ou
  busca toca em `journal_emotion_logs`.
- **Rationale**: assumption explícito da spec — registros não afetam contagem de palavras nem
  heatmap. Confirma a escolha de D1/Complexity Tracking.

## D8 — Edição progressiva e exclusão

- **Decisão**: `create_emotion_log` exige só `emotion_id` + `intensity`; demais campos opcionais.
  `update_emotion_log` aceita atualização parcial dos campos opcionais. `delete_emotion_log`
  remove o registro (e ele some das agregações por não existir mais).
- **Rationale**: atende US1 (preenchimento progressivo) e os acceptance scenarios 2/4/6.
