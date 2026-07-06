# Data Model — Lucy (agente de Gmail)

Fase 1 do `/speckit-plan`. Uma tabela nova (`lucy_emails`) + entidades derivadas em memória (não
persistidas). Storage: PostgreSQL compartilhado (`DATABASE_URL`), acesso via `agents.db`.

---

## Tabela `lucy_emails` (persistida)

Histórico de cada email processado pelo digest e sua classificação. É a **única novidade** de storage
em relação ao script base (que era stateless).

| Coluna | Tipo | Regras / Notas |
|---|---|---|
| `id` | `TEXT PRIMARY KEY` | `str(uuid.uuid4())` gerado em Python (convenção `agents/komi`) |
| `gmail_uid` | `TEXT UNIQUE NOT NULL` | **chave natural do upsert** = `X-GM-MSGID` do Gmail (R2), imutável |
| `from_name` | `TEXT` | nome do remetente (header `From` decodificado RFC2047; pode ser vazio) |
| `from_addr` | `TEXT` | endereço do remetente |
| `subject` | `TEXT` | assunto decodificado |
| `category` | `TEXT NOT NULL` | uma das 10 categorias fixas (ver enum abaixo) |
| `priority` | `TEXT` | `high` \| `medium` \| `low` |
| `summary` | `TEXT` | resumo de 1 linha gerado pela IA |
| `action` | `TEXT` | `arquivar` \| `responder` \| `ler` \| `agir` \| `ignorar` |
| `received_date` | `DATE` | **data local** de recebimento (derivada em `America/Sao_Paulo`) |
| `classified_at` | `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | momento da classificação; atualizado no upsert |

**Índice**: `idx_lucy_emails_cat_date ON lucy_emails (category, received_date DESC)` — suporta consulta
por categoria/período (base para tela futura).

**Upsert (idempotência — FR-013 / Clarification 2026-07-05)**:
```sql
INSERT INTO lucy_emails (id, gmail_uid, from_name, from_addr, subject,
                         category, priority, summary, action, received_date, classified_at)
VALUES (%(id)s, %(gmail_uid)s, %(from_name)s, %(from_addr)s, %(subject)s,
        %(category)s, %(priority)s, %(summary)s, %(action)s, %(received_date)s, NOW())
ON CONFLICT (gmail_uid) DO UPDATE SET
    from_name     = EXCLUDED.from_name,
    from_addr     = EXCLUDED.from_addr,
    subject       = EXCLUDED.subject,
    category      = EXCLUDED.category,
    priority      = EXCLUDED.priority,
    summary       = EXCLUDED.summary,
    action        = EXCLUDED.action,
    received_date = EXCLUDED.received_date,
    classified_at = NOW();
```
Reexecução para o mesmo dia → mesma contagem de linhas, registro reflete a última classificação
(SC-004). O `id` do `INSERT` é ignorado em caso de conflito (a linha existente mantém seu `id`).

**Regras de validação** (aplicadas na lógica antes do write):
- `category` ∈ enum das 10; se a IA devolver algo fora, cai em `Other`.
- `priority`/`action` normalizados para os valores válidos; valor inesperado → `low` / `ler`.
- `received_date` = `data do email AT TIME ZONE 'America/Sao_Paulo'`; na prática, a data local de "ontem"
  usada no critério de busca.

---

## Enum de Categorias (fixo — copiado do base, SC-008)

Não é uma tabela; é uma constante no código (`agents/lucy/tools.py`). Define **tanto** a label aplicada
no Gmail **quanto** o agrupamento/emoji no digest.

| Categoria | Emoji | Tratamento no digest |
|---|---|---|
| `Art / Hobbies` | 🎭 | grupo normal |
| `Finance` | 💵 | grupo normal |
| `Knowledge` | 🎓 | grupo normal + alimenta o INTEL BRIEFING |
| `Shopping` | 🛒 | grupo normal |
| `Personal` | 👤 | grupo normal |
| `Health` | ⚕️ | grupo normal |
| `Security` | 🔒 | grupo normal (candidato a AÇÃO IMEDIATA) |
| `Work` | 💼 | grupo normal |
| `Junk` | 🗑️ | **oculto** no digest; recebe label e é **arquivado** (fora da inbox) |
| `Other` | 🗂️ | grupo normal; fallback de categoria inválida |

Pré-requisito operacional: as 10 labels precisam existir na conta Gmail.

---

## Entidades derivadas (em memória — NÃO persistidas)

### Email classificado (transiente)
Objeto montado durante uma execução do digest, antes do upsert. Campos:
`{ imap_uid, gmail_msgid, from_name, from_addr, subject, snippet, category, priority, summary, action }`.
- `imap_uid` — usado só para `STORE` (label/arquivo); descartado após a execução.
- `gmail_msgid` — vira `gmail_uid` na tabela.
- `snippet` — corpo limpo (~500 chars; texto puro, com fallback para HTML com tags removidas); usado só
  como entrada da classificação; não persistido.

### Digest diário (transiente)
A mensagem HTML enviada ao Telegram. Derivada dos emails classificados do dia; **não** é uma entidade
persistida. Estrutura (layout do base, FR-010):
1. Cabeçalho + **overview** (1 linha, voz Lucy).
2. **INTEL BRIEFING** — consolidado dos emails `Knowledge`/newsletters.
3. **AÇÃO IMEDIATA** — itens críticos (ex.: `Security`, contas vencendo, prioridade `high` com ação
   `agir`/`responder`).
4. Grupos por categoria (Junk oculto), cada email com prioridade sinalizada por cor (🔴 high / 🟡 medium
   / 🟢 low).
5. Rodapé: `Tokens: X in | Y out · Custo ~$Z · HH:MM`.

Caso sem emails (FR-011): overview indicando caixa limpa, sem grupos, sem erro.

---

## Relação com dados existentes

- **Sem FKs**: `lucy_emails` é autocontida (não referencia outras tabelas do repo). Coerente com o
  Princípio III (self-contained) — nenhum acoplamento cross-domain nesta fase.
- **Gmail** é a fonte externa (labels/arquivo) — não é modelado como tabela; o estado da caixa é o
  próprio Gmail. `lucy_emails` é um **espelho de leitura** do que o digest classificou, não a fonte da
  verdade da caixa.
