# Quickstart — Validação E2E do Registro Emocional (TCC)

**Feature**: 006-emotion-capture-tcc | **Date**: 2026-06-10

Roteiro para validar a feature ponta a ponta após a implementação. Sem suíte automatizada no
projeto — validação manual.

---

## Pré-requisitos

- `DATABASE_URL` apontando para o PostgreSQL (local ou VPS).
- Backend rodando: `uvicorn webapp.backend.main:app --reload --port 8080` (na raiz do repo).
- Frontend: `cd webapp/frontend && npm run dev` (dev em `localhost:5173`), ou build
  (`npm run build`) servido pelo FastAPI.
- Login feito (cookie `makima_session`).

## Setup do schema

As tabelas `journal_emotions` e `journal_emotion_logs` são criadas automaticamente na importação
de `agents.journal.tools` (`_ensure_tables()`). Para forçar/conferir:

```bash
# Local
python -c "import agents.journal.tools"

# No VPS (hostname do PG só resolve dentro do container):
docker exec makima-web sh -c "cd /app && python -c 'import agents.journal.tools'"
```

Conferir que o seed criou as 8 emoções base:

```bash
# espera 8 linhas com is_predefined = t
docker exec makima-web sh -c "cd /app && python -c \"from agents.journal.tools import list_emotions; print(list_emotions())\""
```

---

## Cenário 1 — Registrar emoção do dia (US1, P1)

1. Abrir o diário (`/journal`), tela **Escrever** no dia de hoje.
2. Confirmar a seção de registro emocional abaixo do prompt de sonho, com convite quando vazia.
3. Criar registro: escolher **ansiedade**, intensidade **7**, preencher a situação. Salvar.
4. **Esperado**: o cartão aparece com emoção + intensidade + horário; persiste após `F5`.
5. Tentar salvar um novo registro **sem** escolher emoção → bloqueado, campo sinalizado.
6. Criar um segundo registro no mesmo dia → ambos coexistem, ordenados por horário.

## Cenário 2 — Completar e reavaliar (US1)

1. Editar o registro de ansiedade; preencher pensamento automático e resposta adaptativa.
2. **Esperado**: o campo de reavaliação de intensidade só habilita após a resposta adaptativa ter
   texto. Definir reavaliação **3** e salvar.
3. Recarregar → todos os campos persistem; o cartão mostra "intensidade após resposta: 3".
4. Excluir o segundo registro → some do dia.

## Cenário 3 — Emoções predefinidas + custom (US2)

1. Em um novo registro, abrir o seletor de emoção → ver as 8 base + custom existentes,
   distinguíveis.
2. Adicionar a emoção custom **"frustração"**, usar no registro.
3. Em outro registro, confirmar que **"frustração"** aparece na lista.
4. Tentar adicionar **"Frustração"** (com maiúscula) → reutiliza a existente, sem duplicar
   (validar via `list_emotions`).

## Cenário 4 — Aba Emoções nos Insights (US3)

1. Garantir registros de emoções variadas em meses diferentes (criar em datas distintas se
   necessário — navegar para dias anteriores na tela Escrever).
2. Abrir **Insights → aba Emoções**.
3. **Esperado**: total de registros, emoção mais frequente, intensidade média; lista por emoção
   (contagem + média, ordenada por frequência); gráfico de distribuição mensal.
4. Selecionar (quando a spec 005 estiver ativa) um ano sem registros → estado vazio convidativo,
   sem erro. Sem a 005, validar o ano corrente.

## Verificação por API (opcional)

```bash
BASE=http://localhost:8080/api/journal
# usar o cookie de sessão do browser (-b "makima_session=...")
curl -s "$BASE/emotions" -b "$COOKIE"
curl -s "$BASE/emotion-logs?page_id=<ID>" -b "$COOKIE"
curl -s "$BASE/emotion-stats?year=2026" -b "$COOKIE"
```

## Critérios de aceite (mapeados à spec)

- [ ] SC-001: registrar emoção + intensidade em < 15s a partir da página do dia.
- [ ] SC-002: 100% dos registros íntegros após reload e ao navegar entre dias.
- [ ] SC-003: campos opcionais completáveis depois, sem perda dos já preenchidos.
- [ ] SC-004: emoção mais frequente e intensidade média visíveis em < 5s na aba Emoções.
- [ ] Registros emocionais **não** alteram contagem de palavras, heatmap nem coleções
      (conferir que os números da aba Diário/Palavras não mudam ao criar registros).
