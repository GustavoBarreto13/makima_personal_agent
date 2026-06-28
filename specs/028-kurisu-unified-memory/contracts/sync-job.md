# Contrato: Job de Sync da Memória

Orquestrador em `agents/kurisu/memory/sync.py`, disparado por `scripts/sync_kurisu_memory.py` (job
agendado — padrão `backup_postgres.py`). Mantém o corpus operacional fresco, incremental, com prune
seguro.

## Entrypoint

```bash
# Ciclo completo (todos os domínios):
python -m scripts.sync_kurisu_memory

# Só um domínio (debug):
python -m scripts.sync_kurisu_memory --domain diario

# Dry-run: lista o que faria (import/delete) sem tocar no Vertex:
python -m scripts.sync_kurisu_memory --dry-run
```

## Fluxo por domínio (normativo)

```
para cada domínio:
  1. ler watermark (last_synced_at, doc_count)
  2. export_<dominio>(cur, since=last_synced_at)         # read-only
  3. para cada MemoryDoc novo/alterado (content_hash):
       - se já existe com hash diferente → delete_file + reimport   (item editado)
       - se novo → import_files
  4. detectar removidos: source_refs no corpus ∉ origem
       - se removidos > 50% do doc_count do domínio → ABORTAR prune + alerta   (trava, FR-007)
       - senão → delete_file dos removidos
  5. atualizar watermark (last_synced_at, doc_count, last_run_at)
```

## Garantias verificáveis (C1..C6)

| # | Garantia | Requisito |
|---|---|---|
| C1 | Nenhuma escrita nas tabelas de origem (só SELECT) | FR-002 |
| C2 | Item novo na origem → consultável após 1 ciclo (≤24h) | FR-006/SC-002 |
| C3 | Item editado → versão nova servida (delete_file+reimport) | R3 |
| C4 | Item apagado → removido da memória no próximo ciclo | SC-003 |
| C5 | Remoção >50% dos docs de um domínio num passe → aborta + alerta | FR-007/SC-005 |
| C6 | Datas dos documentos em UTC-3 | FR-010/SC-001 |

## Idempotência & segurança

- **Idempotente**: rodar 2x seguidas sem mudança na origem → nenhuma alteração no corpus (hash igual).
- **Trava por domínio**: a trava ≤50% é **por domínio** (não global) — um domínio em pane não bloqueia
  os outros, mas também não é esvaziado.
- **Watermark só avança em sucesso**: se o domínio falhar no meio, o watermark não avança (reprocessa
  no próximo ciclo).
- **Escrita só no corpus operacional**: nunca toca no corpus da wiki (027) — corpora separados.

## Env / dependências

- `DATABASE_URL` (ler Postgres), `GCP_CREDENTIALS_JSON`, `GCP_PROJECT_ID`,
  `VERTEX_RAG_CORPUS_OPERACIONAL` (destino), bucket GCS (espelho).
- Roda onde o `DATABASE_URL` resolve (Docker Swarm) — como o `backup_postgres.py`.
