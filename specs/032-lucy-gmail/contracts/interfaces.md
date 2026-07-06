# Interfaces / Contracts — Lucy (agente de Gmail)

Fase 1 do `/speckit-plan`. Esta fase **não expõe REST/HTTP** (sem frontend). As interfaces são:
(A) as tools do `lucy_agent` (contrato ADK), (B) o contrato do job agendado, (C) o JSON schema da
classificação Gemini. Todas as funções retornam `{"status": "ok", ...}` ou
`{"status": "error", "message": ...}` e **nunca levantam exceção** (padrão de tools do repo).

---

## A. Tools do `lucy_agent` (somente leitura)

### `fetch_recent_emails(limit: int = 10, unread_only: bool = False) -> dict`
Lista emails recentes/não lidos ao vivo (IMAP).
- **Args**: `limit` (máx de itens; default 10), `unread_only` (só não lidos).
- **OK**: `{"status":"ok","emails":[{ "uid": str, "from_name": str, "from_addr": str, "subject": str, "date": str }...]}`
- **Erro**: `{"status":"error","message": str}` (ex.: falha de conexão IMAP).
- **Garantia**: não altera a caixa.

### `search_emails(query: str, limit: int = 10) -> dict`
Busca por remetente, assunto ou palavra.
- **Args**: `query` (texto livre), `limit`.
- **OK**: mesmo formato de `emails` acima (podendo incluir `snippet`).
- **Erro**: idem.

### `get_email(uid: str) -> dict`
Conteúdo completo de um email pelo `uid` retornado nas listagens.
- **Args**: `uid` (IMAP UID como string).
- **OK**: `{"status":"ok","email":{ "from_name","from_addr","subject","date","body": str }}`
- **Erro**: `{"status":"error","message": "email não encontrado"}` quando o `uid` não existe.

> **Não existem** tools de envio/arquivo/deleção/marcação no `lucy_agent` (garantia estrutural de
> read-only — FR-005/SC-006). As capacidades de STORE vivem em `gmail_imap.py` mas não são registradas
> como tools.

---

## B. Contrato do job `send_lucy_digest`

**Entrada**: variáveis de ambiente — `GMAIL_USERNAME`, `GMAIL_APP_PASSWORD`, `GEMINI_API_KEY`,
`GEMINI_MODEL` (opc., default `gemini-2.5-flash`), `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALERT_CHAT_ID`,
`DATABASE_URL`.

**Efeitos (em ordem)**:
1. Busca emails de ontem (UTC-3) via IMAP, cap 50 (R4).
2. Classifica cada um (contrato C).
3. Para cada email: aplica a label da categoria; se `Junk`, arquiva (remove `\\Inbox`). Falha por item
   é logada e não interrompe o lote (FR-015).
4. Envia 1 mensagem HTML ao Telegram (chat de alerta) no layout do base (FR-010/FR-011).
5. Upsert em `lucy_emails` por `gmail_uid` (FR-013).

**Saída de processo**:
- Sucesso → `returncode 0`, imprime resumo em stdout (ex.: `[lucy-digest] 12 emails, 3 junk arquivados`).
- Falha estrutural (IMAP/Gemini/Telegram/DB) → `sys.exit(1)` / exceção → o wrapper `run_lucy_digest()`
  levanta `RuntimeError`, o `runner` grava `scheduler_runs.status='error'` e dispara alerta Telegram
  (FR-014).

**Registro no scheduler** (`scheduler/registry.py`):
```python
ScheduledJob(
    name="lucy_digest",
    func=run_lucy_digest,
    trigger=daily_at(8, 0),                       # 08:00 America/Sao_Paulo
    description="Digest diário de emails (Lucy) → Telegram",
)
```

---

## C. JSON schema da classificação (Gemini one-shot)

Entrada: lista de emails resumidos `[{uid, subject, from, snippet}]`. Saída: **array** de objetos, um
por email, validado por `response_schema` (`google-genai`, `response_mime_type="application/json"`):

```json
{
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "uid":      { "type": "string" },
      "category": { "type": "string",
                    "enum": ["Art / Hobbies","Finance","Knowledge","Shopping","Personal",
                             "Health","Security","Work","Junk","Other"] },
      "priority": { "type": "string", "enum": ["high","medium","low"] },
      "summary":  { "type": "string" },
      "action":   { "type": "string", "enum": ["arquivar","responder","ler","agir","ignorar"] }
    },
    "required": ["uid","category","priority","summary","action"]
  }
}
```

- `uid` ecoa o IMAP UID enviado (usado para casar a classificação de volta ao email para o STORE).
- System prompt + diretrizes das 10 categorias = **cópia verbatim do base** (SC-008).
- `response.usage_metadata` (prompt/candidates token count) alimenta o rodapé de tokens/custo do digest.
- Valores fora do enum são normalizados na lógica (`category`→`Other`, `priority`→`low`, `action`→`ler`).
