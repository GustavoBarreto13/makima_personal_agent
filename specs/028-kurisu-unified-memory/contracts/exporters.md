# Contrato: Domain Exporter

Um exporter por domínio, em `agents/kurisu/memory/exporters.py`. Lê as tabelas do domínio (read-only) e
produz documentos de memória + metadados. Isola o acoplamento de schema (R7 / Constituição I/III).

## Interface

```python
def export_<dominio>(cur, since: datetime | None) -> list[MemoryDoc]:
    """Lê as tabelas do domínio (read-only) e renderiza documentos de memória.

    Args:
        cur: cursor psycopg2 (síncrono) — SOMENTE SELECT.
        since: watermark do último sync (None = full export inicial).

    Returns:
        Lista de MemoryDoc (texto + metadados). Vazia se nada novo/alterado.
    """
```

### `MemoryDoc` (forma do retorno)

```jsonc
{
  "texto": "string — conteúdo legível em PT",
  "domain": "string",
  "doc_date": "date (UTC-3)",
  "source_ref": "string — identidade da origem",
  "source_type": "resumo | individual",
  "content_hash": "string"
}
```

## Regras (normativas)

- **SOMENTE SELECT** — nenhum INSERT/UPDATE/DELETE nas tabelas de origem (FR-002). Validável: o exporter
  recebe um cursor e só executa SELECT.
- **UTC-3**: toda data derivada via `AT TIME ZONE 'America/Sao_Paulo'`; `doc_date` é a data local
  (FR-010). Nunca `CURRENT_DATE`/`NOW()::date`.
- **Incremental**: respeita `since` (filtra por `updated_at`/`created_at` > since). `None` = full.
- **Representação** (R4): atividade/finanças → `resumo` (datado); diário/mídia/pessoas → `individual`.
- **`content_hash`**: hash estável do `texto` renderizado — base da detecção de edição.
- **Isolamento**: um exporter lê só as tabelas do seu domínio. Schema copiado, não importado do pacote
  do agente de origem (Princ. III).

## Domínios e suas saídas

| `export_*` | Lê | `source_type` | `doc_date` |
|---|---|---|---|
| `export_tarefas` | tarefas concluídas (Kaguya) | resumo (por período) | data de conclusão |
| `export_financas` | transações (Nami) | resumo (por período) | data da transação |
| `export_diario` | bullets (Violet) | individual | data do bullet |
| `export_pessoas` | pessoas (Komi) | individual (1/pessoa) | data de cadastro/atualização |
| `export_livros/filmes/animes/series` | logs (Frieren/Akane/Marin/Mai) | individual | data do consumo |

## Falhas

- Erro de leitura de um domínio → o exporter levanta; o orquestrador (sync) **pula aquele domínio** no
  ciclo (não derruba os outros) e registra alerta. O watermark do domínio **não** avança.
