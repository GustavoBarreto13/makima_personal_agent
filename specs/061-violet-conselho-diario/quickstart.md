# Quickstart — Violet: Conselho do Dia

## Pré-requisitos

- `.env` local com `DATABASE_URL`, `GEMINI_API_KEY`, `GCP_CREDENTIALS_JSON`, `GCP_PROJECT_ID`,
  `VERTEX_RAG_CORPUS` (e opcionalmente `VERTEX_RAG_CORPUS_OPERACIONAL`) já configurados — os
  mesmos usados pela Kurisu e pelo Tutor de Idiomas.
- Banco PostgreSQL acessível com as tabelas do domínio Journal/Kaguya já existentes (rodar
  `python -m scripts.setup_schemas` se for um banco novo; a tabela `journal_counsel` desta
  feature nasce sozinha no primeiro import do módulo).
- Ter pelo menos um dia com bullets escritos na Violet, e idealmente algum tema que exista na
  wiki indexada da Kurisu (para validar citação real, não conselho genérico).

## Rodando localmente

```bash
uvicorn webapp.backend.main:app --reload --port 8000
```

```bash
cd webapp/frontend
npm run dev
```

Abrir `http://localhost:5173/journal` (proxy do Vite repassa `/api` para a porta 8000).

## Verificação de backend isolada (sem UI)

```bash
python -c "from agents.kurisu import counsel; import json; print(json.dumps(counsel.gerar_conselho('2026-07-26'), ensure_ascii=False, indent=2))"
```

No VPS (o hostname do Postgres não resolve fora do container):

```bash
docker exec makima-web sh -c "cd /app && python -c \"from agents.kurisu import counsel; print(counsel.gerar_conselho('2026-07-26'))\""
```

## Testes automatizados (partes puras, sem rede)

```bash
python -m pytest tests/agents/test_kurisu_counsel.py -v
```

## Cenários de validação end-to-end

1. **Conselho básico com citação real** — Escrever 2–3 bullets no dia de hoje sobre um tema
   que você sabe que tem material salvo na base (ex.: o vídeo sobre dias tristes, se o tema
   escrito for compatível). Clicar em "Pedir o conselho da Violet".
   **Esperado**: os 4 blocos aparecem; pelo menos um item do bloco "Da sua base" cita uma
   fonte real e reconhecível (não um conselho genérico); tempo total até 60s.

2. **Regeneração não duplica** — Com o conselho do passo 1 já gerado, clicar em "Regerar".
   **Esperado**: o conteúdo muda/atualiza; `SELECT count(*) FROM journal_counsel WHERE
   page_id = N` continua retornando `1`.

3. **Dia vazio** — Navegar para um dia sem nenhum bullet/carta/registro emocional e tentar
   pedir o conselho.
   **Esperado**: mensagem clara de que não há nada para analisar ainda; nenhuma linha é
   criada em `journal_counsel`.

4. **Honestidade quando a base não cobre** — Escrever um bullet sobre um tema claramente fora
   da base de conhecimento pessoal, pedir o conselho.
   **Esperado**: o texto declara explicitamente que não encontrou material na base antes de
   qualquer sugestão externa; se uma sugestão de busca web aparecer, ela está marcada
   (`origem: "web"`) e visualmente distinta das sugestões da base.

5. **Continuidade entre dias** — Gerar o conselho em dois dias seguidos sobre o mesmo tema
   recorrente.
   **Esperado**: o conselho do segundo dia reconhece a recorrência e referencia o que já foi
   sugerido no dia anterior, sem repetir a sugestão como se fosse inédita.

6. **Virar tarefa** — No conselho gerado, clicar em "virar tarefa" numa das ações sugeridas.
   **Esperado**: a tarefa aparece em `/tasks`; ao recarregar a tela do conselho, essa ação
   aparece marcada como já convertida (não oferece o botão de novo).

7. **Navegação por datas passadas** — Navegar para um dia passado com bullets e gerar o
   conselho daquele dia especificamente.
   **Esperado**: o conselho fica associado àquela data — voltar ao dia atual não mostra o
   conselho do dia passado, e voltar ao dia passado mostra o conselho correto.

8. **Falha controlada** — Invalidar temporariamente `GEMINI_API_KEY` (ou desconectar a rede)
   e tentar gerar o conselho.
   **Esperado**: banner de erro amigável em português; `SELECT count(*) FROM journal_counsel
   WHERE page_id = N` não aumenta — nenhum dado parcial foi gravado.

## Verificação de schema

```sql
\d journal_counsel
SELECT page_id, mirror, used_web, created_at, updated_at FROM journal_counsel ORDER BY created_at DESC LIMIT 5;
```
