# Contrato REST — Violet: Conselho do Dia

Todas as rotas ficam em `webapp/backend/routers/journal.py`, sob o prefixo já registrado
`/api/journal` (`webapp/backend/main.py`). Todas exigem `Depends(require_user)`. Padrão de
erro do projeto: 400 para `{"status": "error"}` das tools (via `_check_result`), 422 para
corpo inválido (Pydantic), 404 quando o recurso referenciado não existe.

## `POST /api/journal/counsel`

Gera (ou regenera, se já existir) o conselho de uma data.

**Body** (`GenerateCounselBody`):

```json
{ "date": "2026-07-26", "type_id": 1 }
```

- `date`: obrigatório, formato `YYYY-MM-DD` (mesma validação regex já usada em `GET /page`).
- `type_id`: opcional, default `1` (mesmo default de `get_or_create_page`).

**Resposta 200** — objeto `Counsel` completo (ver forma abaixo).

**Resposta 400** — `{"detail": "..."}` quando:
- a data não tem nenhum bullet/carta/registro emocional (nada para analisar — FR do "dia
  vazio" da User Story 1);
- a chamada à IA falhar em qualquer etapa (nada é persistido).

**Latência esperada**: até 60s (SC-007) — o chamador deve tratar como uma requisição longa,
não uma leitura instantânea.

## `GET /api/journal/counsel?date=YYYY-MM-DD&type_id=1`

Devolve o conselho já gerado daquela data, ou `null` se ainda não existe (não gera nada —
leitura pura, rápida).

**Resposta 200**:

```json
{ "counsel": { ...Counsel... } }
```

ou

```json
{ "counsel": null }
```

## `GET /api/journal/counsel/history?limit=20`

Lista os conselhos mais recentes (qualquer data), mais novos primeiro — usado para a
continuidade (R6) e, potencialmente, uma futura tela de histórico (fora do escopo desta spec,
mas o endpoint já serve ambos os usos sem mudança).

**Resposta 200**:

```json
{ "items": [ { "page_id", "date", "mirror", "used_web", "created_at" }, ... ] }
```

Forma resumida (sem `toolkit_json`/`actions_json` completos) — mesma lógica de
`list_analyses` do Tutor de Idiomas (`agents/kurisu/tutor.py`), que já retorna um resumo leve
em vez do objeto inteiro por item.

## `PATCH /api/journal/counsel/actions`

Marca uma ação sugerida como já convertida em tarefa — grava o `task_id` no item
correspondente de `actions_json`.

**Body** (`MarkCounselActionBody`):

```json
{ "page_id": 123, "action_index": 0, "task_id": 456 }
```

**Resposta 200** — `Counsel` atualizado.

**Resposta 404** — `page_id` sem conselho, ou `action_index` fora do range de `actions_json`.

> Este endpoint **não cria** a tarefa — o frontend chama o endpoint de criação de tarefas já
> existente da Kaguya (`kaguyaApi`) primeiro, e só depois usa este PATCH para registrar que
> aquela ação específica já foi convertida (evita duplicar o botão "virar tarefa" se o
> usuário reabrir o conselho).

## Forma do objeto `Counsel` (compartilhada pelas respostas acima)

```json
{
  "page_id": 123,
  "date": "2026-07-26",
  "mirror": "texto do espelho do dia",
  "toolkit": [
    {
      "titulo": "Técnica X",
      "porque": "por que isso se aplica ao que foi escrito",
      "como": "como aplicar, na prática",
      "fonte": "nome-do-arquivo-na-wiki.md",
      "uri": "gs://.../wiki/nome-do-arquivo-na-wiki.md",
      "origem": "base"
    }
  ],
  "question": "pergunta(s) de reflexão",
  "actions": [
    { "texto": "ação sugerida", "motivo": "por que essa ação", "task_id": null }
  ],
  "used_web": false,
  "created_at": "2026-07-26T10:00:00-03:00",
  "updated_at": "2026-07-26T10:00:00-03:00"
}
```

`origem` em cada item do `toolkit` é sempre `"base"` ou `"web"` — o frontend usa esse campo
(não uma inferência de texto) para aplicar o estilo visual de "vindo de fora" (FR-011).
