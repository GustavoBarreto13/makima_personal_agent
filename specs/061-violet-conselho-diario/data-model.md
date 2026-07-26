# Data Model — Violet: Conselho do Dia

## Tabela nova: `journal_counsel`

Criada sob demanda por `_ensure_counsel_tables()` dentro de `agents/kurisu/counsel.py`,
chamada no import do módulo — mesmo mecanismo idempotente de `agents/journal/tools.py` e
`agents/kurisu/tutor.py` (`CREATE TABLE IF NOT EXISTS`). **Não** entra em
`scripts/setup_schemas.py` (que não lista o domínio journal/violet).

```sql
CREATE TABLE IF NOT EXISTS journal_counsel (
    id            SERIAL PRIMARY KEY,
    page_id       INT NOT NULL UNIQUE REFERENCES journal_pages(id) ON DELETE CASCADE,
    mirror        TEXT NOT NULL,
    toolkit_json  JSONB NOT NULL DEFAULT '[]',
    question      TEXT,
    actions_json  JSONB NOT NULL DEFAULT '[]',
    signals_json  JSONB NOT NULL DEFAULT '{}',
    used_web      BOOLEAN NOT NULL DEFAULT FALSE,
    model         TEXT,
    tokens_in     INT,
    tokens_out    INT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_counsel_created ON journal_counsel (created_at DESC);
```

### Colunas

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | SERIAL PK | Identificador interno. |
| `page_id` | INT, `UNIQUE`, FK → `journal_pages(id)` `ON DELETE CASCADE` | Ancora o conselho a um dia. A unicidade **é** a regra "uma análise por dia" (FR-002) — a gravação sempre passa por `INSERT ... ON CONFLICT (page_id) DO UPDATE`. |
| `mirror` | TEXT | Bloco 1 — "Espelho do dia": resumo empático do que foi lido. |
| `toolkit_json` | JSONB | Bloco 2 — lista de sugestões da base: `[{"titulo", "porque", "como", "fonte", "uri", "origem"}]`. `origem ∈ {"base", "web"}` (FR-011). |
| `question` | TEXT | Bloco 3 — pergunta(s) de reflexão (1–2, texto livre). |
| `actions_json` | JSONB | Bloco 4 — ações sugeridas: `[{"texto", "motivo", "task_id"}]`. `task_id` começa `null`; é preenchido quando o usuário converte a ação em tarefa (FR-014). |
| `signals_json` | JSONB | Snapshot leve do que foi lido na coleta (contagem de bullets, presença de registro emocional/carta, tarefas/hábitos considerados) — auditoria e depuração, não exibido cru na UI. |
| `used_web` | BOOLEAN | `TRUE` se qualquer item do `toolkit_json` tem `origem: "web"` — atalho para o frontend decidir se mostra o aviso de busca externa sem iterar o JSON. |
| `model` | TEXT | Nome do modelo usado na síntese (auditoria/depuração; ex. `gemini-2.5-flash`). |
| `tokens_in` / `tokens_out` | INT | Uso de tokens da chamada de síntese, quando disponível via `usage_metadata` (mesmo padrão de `agents/lucy/tools.py::classify_emails`). |
| `created_at` | TIMESTAMPTZ | Quando o conselho foi gerado pela primeira vez. |
| `updated_at` | TIMESTAMPTZ | Atualizado a cada regeneração (`ON CONFLICT ... SET updated_at = NOW()`). |

### Relacionamentos

```
journal_pages (1) ──── (0..1) journal_counsel
                              (via page_id UNIQUE)

journal_counsel  ── lê, mas NÃO referencia por FK ──> journal_bullets
                                                    └─> journal_emotion_logs
                                                    └─> journal_letters
                                                    └─> tasks (Kaguya, leitura via tool)
                                                    └─> habits (Kaguya, leitura via tool)
                                                    └─> journal_counsel (auto-referência lógica:
                                                        lê os 3 anteriores por created_at DESC,
                                                        sem FK — mesma tabela)
```

Não há FK para `tasks`/`habits` (Kaguya) nem para os 3 conselhos anteriores — são lidos por
consulta simples (`ORDER BY created_at DESC LIMIT 3`), não por relação declarada no schema.
`actions_json[].task_id` guarda o `id` da tarefa criada na Kaguya, mas **sem FK** — é um
identificador solto (mesmo espírito de baixo acoplamento do Princípio III: Kaguya não sabe da
existência do conselho, então não pode ser referenciada por FK sem criar dependência inversa).

### Regras de transição / validação

- Criação: só ocorre depois que a resposta da IA já foi validada contra o schema esperado
  (mesmo padrão de `agents/kurisu/tutor.py::analisar_escrita` — nunca grava parcial).
- Regeneração: `ON CONFLICT (page_id) DO UPDATE` substitui **todas** as colunas de conteúdo
  (`mirror`, `toolkit_json`, `question`, `actions_json`, `signals_json`, `used_web`, `model`,
  `tokens_in`, `tokens_out`, `updated_at`) — exceto `id` e `created_at`, que preservam a
  primeira geração.
  - **Cuidado ao regenerar**: se uma ação anterior já tinha `task_id` preenchido (o usuário já
    converteu em tarefa), a regeneração **não deve apagar esse vínculo às cegas** — a
    implementação precisa casar ações novas com antigas por texto/posição e preservar
    `task_id` quando a ação equivalente ainda existir, ou aceitar explicitamente que o vínculo
    se perde na regeneração (decisão de implementação, não de dado; registrar no `tasks.md`).
- Exclusão: em cascata via `ON DELETE CASCADE` quando a `journal_pages` é removida (não há
  fluxo de exclusão direta de página hoje, mas a garantia evita órfãos).

### Payload de leitura (dia analisado, montado em memória — não persistido)

Usado só durante a geração, nunca gravado como está:

```python
{
  "dia": {
    "date": "2026-07-26",
    "bullets": [{"kind", "content", "favorite"}],
    "dream": str | None,
    "emotion_logs": [{"emotion", "intensity", "situation", "automatic_thought",
                       "adaptive_response", "reappraised_intensity"}],
    "letters": [{"recipient", "body", "status"}],
  },
  "janela_7d": [{"date", "bullets_resumo": str, "emotions_resumo": str}],
  "kaguya": {"tasks_today": [...], "habits": [...]},
  "conselhos_anteriores": [{"mirror", "question", "actions": [str]}],  # até 3
}
```
