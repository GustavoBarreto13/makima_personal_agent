## Módulo: agents/journal

Gerencia o diário pessoal (Violet) em bullet journal. Acesso direto ao PostgreSQL via psycopg2 síncrono — mesmo padrão das tools da Nami e Frieren.

> **Sub-agente ADK completo** (spec 064): `agent.py` define `violet_agent` — personalidade Violet Evergarden, ligada em `coordinator/agent.py::create_makima` e exposta via `makima-mcp` em `/mcp/journal` (`mcp_servers/makima/registry.py`, que junta ao domínio as tools da Kurisu para a Violet). O pacote continua `agents/journal/`; o rename para `agents/violet/` (Parte A do `docs/planos/PLANO_VIOLET_EVERGARDEN.md`) segue **não executado**, decisão deliberada. As tabelas são criadas sob demanda por `_ensure_tables()` em `tools.py` e `_ensure_values_tables()` em `values.py` (não há `schema_pg.sql`). Modelo de IA: `agents/kurisu/models.py::VIOLET_MODEL` (env `VIOLET_GEMINI_MODEL`, padrão `gemini-3.8-flash`).
>
> **Spec 076 (Violet no Design System)** trouxe: leitura que não cria página, Arquivo só com dias escritos, marcação com tokens (`markup.py`), vínculo sincronizado com a Komi, referências a outros agentes (`references.py`), fonte por dia/carta, força da escrita (`strength.py`), Refletir (`reflect.py`), Insights no `StatsPayload` (`tools_stats.py`), padrões emocionais (`emotion_patterns.py`), Avaliação dos Valores (`values.py` + `values_diagnosis.py`) e tools de chat para o Hermes (`chat_tools.py`).

---

### Módulos

| Arquivo | O quê |
|---|---|
| `tools.py` | CRUD do diário: páginas, bullets, menções, emoções, cartas, favoritos, Arquivo, stats antigos |
| `markup.py` | **puro** — tokens `@[Nome](komi:id)`, `[Rótulo](agente:tipo:id)`, `@legado`, `#tag-com-hifen`; `plain_text`, `word_count`. Espelho no front: `webapp/frontend/src/pages/violet/lib/markup.ts` (as regras precisam bater) |
| `references.py` | registro dos provedores de "/" (kaguya `k`, akane, frieren, marin, mai, yato), `search(agent, q)` e `resolve_free_text` (texto livre do chat → tokens quando inequívoco) |
| `strength.py` | força da escrita: `habit_strength.summary` da Kaguya sobre os dias escritos (`get_writing_strength`) |
| `reflect.py` | seções do Refletir (pergunta, gema, ideia, foco, ontem, semana, fixados, um ano atrás, memory lane) com semente por data |
| `tools_stats.py` | Insights no contrato `StatsPayload` + blocos `strength` e `emotions` (só webapp) |
| `emotion_patterns.py` | análise emocional camada 1 — **puro** `analyze`/`summarize` + `get_emotion_patterns` (banco) |
| `values_diagnosis.py` | **puro** — roteiro da Avaliação dos Valores (12 áreas, 6 notas, textos), alertas, gap, evolução, check-ins |
| `values.py` | persistência da avaliação + `values_context_for_counsel()` (bloco que o Conselho e a Revisão semanal leem) |
| `chat_tools.py` | tools pensadas para o chat (`escrever_no_diario` resolve `@`/`/`, `buscar_referencias`, `sugerir_pessoas`…) |
| `calendar_provider.py`, `habit_provider.py` | fontes do Calendar Hub e do hábito automático da Kaguya |

A **IA** da Violet (Conselho do Dia, Revisão semanal, leitura emocional, distorções, Tutor) vive na Kurisu (`agents/kurisu/`), dona do RAG — `agents/journal` não importa a Kurisu.

---

### Schema PostgreSQL

Coluna a coluna em `docs/referencia/POSTGRES.md`. Resumo:

```
journal_types / journal_pages (+ dream, font NULL = padrão das preferências)
journal_bullets      (kind, favorite, search_vec GENERATED; UNIQUE page_id+position)
journal_mentions     (kind person|tag, value, person_id = id da Komi quando resolvida)
journal_refs         (bullet_id, agent, entity_type, entity_id, label) — spec 076, base dos backlinks
journal_emotions / journal_emotion_logs (+ distortions TEXT[] — rótulos de distorção cognitiva)
journal_letters      (+ font NOT NULL DEFAULT 'normal')
journal_values_assessments / _areas / _commitments / _checkins — Avaliação dos Valores
```

Tabelas da Kurisu sobre o diário: `journal_counsel` (+ `essay_md`, `sources_json`, `digest_json`), `journal_weekly_reviews`, `journal_emotion_analyses`, `journal_tutor_*`.

**"Dia com conteúdo"** = bullet não vazio, sonho não vazio, registro emocional ou carta (`_HAS_CONTENT_SQL`). Só esses dias entram no Arquivo e no número do dia (#N), que é estável (não muda com a busca).

**Registros emocionais e cartas são ortogonais aos bullets** — não contam palavras nem a força. Carta lacrada é imutável. `person_links` não tem FK para bullets/cartas: apagar remove os vínculos explicitamente.

---

### Regras críticas

**Ler não cria.** Para só ler um dia use `get_page` (dia vazio volta com `page.id = None`). `get_or_create_page`/`ensure_page` só no primeiro write — o shell antigo criava página a cada data visitada e o Arquivo enchia de dias vazios (limpeza: `scripts/cleanup_violet_empty_pages.py`).

**Upsert é por posição**, espaçamento ×1000 (intermediária = média). **Texto vazio apaga** o bullet da posição.

**Vínculo com a Komi é sincronizado por bullet** (`_sync_bullet_links_on_cursor`): a cada upsert os `person_links` do bullet passam a ser exatamente as pessoas citadas agora — tokens `@[..](komi:id)`, `person_ids` explícitos e `@Nome` legado **só com match exato e único** (`komi.find_people_exact`). A parte da Komi roda em SAVEPOINT (Komi ausente não derruba o bullet). Menções e referências: delete + insert.

**`@`/`/` no chat**: o Hermes usa `escrever_no_diario`, que resolve o inequívoco e devolve `ambiguous` para o agente perguntar. Nunca vincular pessoa sem certeza.

**Força ≠ ofensiva.** Não existe mais ofensiva: a força é a "caixa d'água" dos hábitos (consistência 0–100, tendência, recente), com meta semanal de dias.

**`_check_result` não se aplica** às tools que devolvem lista/dict sem `status` (`list_heatmap`, `list_mentions`, `get_bullets_by_mention`, `search_bullets`, `list_emotions`, `list_emotion_logs`, `get_emotion_stats`, `list_letters`, `list_all_*`, `list_refs`). `get_or_create_page` devolve `{"error"}` (não `status`).

---

### Tools (agent/MCP)

`toolset.py` expõe ao agente: `get_or_create_page`, `upsert_bullet`, `delete_bullet`, `list_heatmap`, `list_mentions`, `get_bullets_by_mention`, `search_bullets`, emoções (`list_emotions`, `create_emotion`, `list_emotion_logs`, `create/update/delete_emotion_log`, `get_emotion_stats`), favoritos, cartas (`list/create/update/seal/delete_letter`) e as de chat (`escrever_no_diario`, `buscar_referencias`, `sugerir_pessoas`, `definir_fonte_do_dia`, `forca_da_escrita`, `refletir`, `listar_cartas`, `ler_carta`, `listar_registros_emocionais`, `padroes_emocionais`, `resumo_dos_valores`, `checkin_de_valores`, `compromissos_de_valores`). O registry do MCP acrescenta as da Kurisu (`conselho_do_dia`, `gerar_conselho_do_dia`, `revisao_da_semana`, `gerar_revisao_da_semana`, `leitura_emocional`). Skill do Hermes: `hermes/skills/violet-diario/SKILL.md`.

---

### Provedores cross-agent

- `habit_provider.py` → hábito automático "escrever no diário" da Kaguya (`violet_diary`).
- `calendar_provider.py` → fonte "Violet · Diário" do Calendar Hub (deep link `/journal#dia/<data>`).
- Komi: `get_person_summary` traz `diario.trechos[{bullet_id, texto, deep_link}]` e `cartas.cartas[]` (contrato que a Komi DS vai consumir).

### O que NÃO fazer aqui

- Não inserir/atualizar `search_vec` (GENERATED) nem `journal_mentions`/`journal_refs` direto — sempre via `upsert_bullet`
- Não chamar `get_or_create_page` só para ler
- Não vincular pessoa por prefixo
- Não importar a Kurisu de dentro de `agents/journal`

### Endpoint de exposição (webapp)

`webapp/backend/routers/journal.py` — rotas em `webapp/docs/API.md`.
