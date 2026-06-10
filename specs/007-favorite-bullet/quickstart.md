# Quickstart: Validação E2E — Favoritar Bullet pelo Próprio Ícone

**Feature**: 007-favorite-bullet | **Branch**: `007-favorite-bullet` | **Date**: 2026-06-10

---

## Pré-requisitos

- PostgreSQL rodando com `DATABASE_URL` configurado
- Variáveis de ambiente do webapp configuradas (ver `webapp/CLAUDE.md` → Variáveis)
- Sessão Google OAuth ativa (`/auth/login`) para poder chamar endpoints `/api/*`

---

## Cenário 0 — Schema (idempotência)

**Objetivo**: confirmar que a coluna `favorite` foi criada em `journal_bullets` sem erro.

**Via Python (local ou dentro do container):**
```bash
python -c "from agents.journal.tools import _ensure_tables; _ensure_tables(); print('OK')"
```

**Esperado**: imprime `OK` sem exceção.

**Verificar no banco** (dentro do container `makima-web`):
```bash
docker exec makima-web sh -c "cd /app && python -c \"
from agents.journal.tools import _get_conn
conn = _get_conn()
with conn.cursor() as cur:
    cur.execute(\\\"SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name='journal_bullets' AND column_name='favorite'\\\")
    print(cur.fetchone())
conn.close()
\""
```

**Esperado**: uma linha com `('favorite', 'boolean', 'false')`.

**Re-execução**: rodar o mesmo comando duas vezes — não deve dar erro (idempotência do
`ADD COLUMN IF NOT EXISTS`).

---

## Cenário 1 — Favoritar bullet (US1 / AC-1)

**Objetivo**: clicar no marcador de um bullet não-favorito e ver o marcador virar garnet.

**Passos:**
1. Subir o backend: `uvicorn webapp.backend.main:app --reload --port 8080`
2. Subir o frontend: `cd webapp/frontend && npm run dev`
3. Abrir `http://localhost:5173/journal` e navegar para hoje
4. Garantir que existe ao menos um bullet na página (criá-lo se necessário)
5. Clicar uma vez no marcador (ícone/ponto) de um bullet

**Esperado:**
- O marcador se torna um **coração garnet** imediatamente (< 200ms, sem esperar rede — SC-01)
- O bullet inteiro ganha uma **faixa de fundo garnet em degradê** — visualmente idêntico a um bullet de Destaque (FR-003)
- O cursor ao passar sobre o marcador é `pointer` (FR-004)
- O `title` do marcador é "Favoritar" antes do clique e "Desfavoritar" depois (FR-004)

---

## Cenário 2 — Persistência (US1 / AC-3)

**Objetivo**: confirmar que o favorito sobrevive a reload de página.

**Passos:**
1. Favoritar um bullet (Cenário 1)
2. Recarregar a página (`F5` ou Ctrl+R)
3. Navegar de volta para o mesmo dia

**Esperado:**
- O bullet continua exibindo o marcador garnet (SC-002)
- O `title` ainda é "Desfavoritar"

---

## Cenário 3 — Desfavoritar (US1 / AC-2)

**Objetivo**: confirmar que um segundo clique desfavorita.

**Passos:**
1. Com um bullet favorito visível, clicar no marcador garnet

**Esperado:**
- O marcador volta ao ícone original do tipo do bullet imediatamente (ex.: ponto, lâmpada, lua…)
- A faixa de fundo garnet desaparece
- Reload da página confirma que não é mais favorito

---

## Cenário 4 — Favorito preservado em edição (US1 / AC-5)

**Objetivo**: confirmar FR-005 — editar texto ou tipo não resets o favorito.

**Passos:**
1. Favoritar um bullet de qualquer tipo
2. Dar duplo clique no texto → editar o conteúdo → pressionar Enter para salvar
3. Verificar o marcador após salvar
4. (Opcional) Trocar o tipo do bullet pelo chip de tipo na barra inferior

**Esperado:**
- O marcador continua garnet após edição de texto (SC-003)
- O marcador continua garnet após troca de tipo

---

## Cenário 5 — Excluir bullet favorito (US1 / AC-6)

**Objetivo**: confirmar FR-006 — excluir remove o favorito junto.

**Passos:**
1. Favoritar um bullet e anotar seu ID via DevTools (Network → GET /api/journal/page)
2. Excluir o bullet
3. Consultar o banco:
   ```bash
   docker exec makima-web sh -c "cd /app && python -c \"
   from agents.journal.tools import _get_conn
   conn = _get_conn()
   with conn.cursor() as cur:
       cur.execute('SELECT * FROM journal_bullets WHERE id = <ID_ANOTADO>')
       print(cur.fetchone())
   conn.close()
   \""
   ```

**Esperado**: retorna `None` (bullet deletado; favorito não existe mais).

---

## Cenário 6 — Rollback em falha de rede (FR-008)

**Objetivo**: confirmar que o marcador reverte se a API falhar.

**Passos:**
1. Abrir DevTools → Network → ativar "Offline" ou bloquear as requisições para `/api/journal/bullets`
2. Clicar no marcador de um bullet não-favorito

**Esperado:**
- O marcador muda para garnet imediatamente (optimistic update)
- Após timeout da requisição, o marcador reverte para a cor original (rollback)
- Reload da página confirma que o bullet **não** está favoritado no banco

---

## Cenário 7 — Endpoint de dias favoritos (FR-007)

**Objetivo**: confirmar `GET /api/journal/favorite-days?year=2026`.

**Via curl (com cookie de sessão):**
```bash
# Obter cookie primeiro via browser (F12 → Application → Cookies → makima_session)
curl -s "http://localhost:8080/api/journal/favorite-days?year=2026" \
     -H "Cookie: makima_session=<seu-cookie>" | python -m json.tool
```

**Esperado:**
- Lista de strings `["YYYY-MM-DD", ...]` com as datas em que há bullet favorito
- A data de hoje deve estar na lista se o Cenário 2 foi executado com sucesso

---

## Não-regressão

- **Clique simples no texto** de um bullet: não dispara nenhuma ação (SC-003)
- **Duplo clique no texto**: entra em modo de edição normalmente
- **Bullets sem id** (estado de adição em andamento): o clique no marcador não faz nada
- **Scroll / navegação entre dias**: bullets de outros dias carregam com o estado correto de favorito
