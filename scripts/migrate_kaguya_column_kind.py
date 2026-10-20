"""Migrar as colunas do Kanban da Kaguya para o "tipo semântico" (`task_columns.kind`).

O que faz:
  1. Cria a coluna `task_columns.kind` (e o CHECK) se ainda não existir — idempotente.
  2. Preenche o tipo das colunas existentes pelo NOME, com a mesma regra do app
     (`agents/kaguya/task_state.py::infer_column_kind`): Homolog→review, Ideia/Backlog→backlog,
     Blocked→blocked, To Do→todo, Doing→doing, Done→done. Nomes desconhecidos ficam NULL
     (continuam cobráveis, como antes). Só mexe em colunas com `kind` vazio — o que já foi
     classificado (ou ajustado à mão) nunca é sobrescrito.

Dry-run por padrão: só mostra o que seria feito.

Usage:
    python -m scripts.migrate_kaguya_column_kind            # dry-run
    python -m scripts.migrate_kaguya_column_kind --apply    # grava

No VPS, rodar de dentro do container (o host do banco não resolve fora do Swarm):
    docker exec makima-web sh -c "cd /app && python -m scripts.migrate_kaguya_column_kind --apply"
"""

import argparse

from agents.db import get_conn, run_select
from agents.kaguya.task_state import infer_column_kind

# DDL idempotente (espelha o trecho de agents/kaguya/schema_tasks_pg.sql).
_DDL = """
ALTER TABLE task_columns ADD COLUMN IF NOT EXISTS kind TEXT;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'task_columns_kind_check') THEN
        ALTER TABLE task_columns ADD CONSTRAINT task_columns_kind_check
            CHECK (kind IS NULL OR kind IN ('backlog', 'blocked', 'todo', 'doing', 'review', 'done'));
    END IF;
END $$;
"""


def _has_kind_column() -> bool:
    """Dizer se `task_columns.kind` já existe no banco."""
    return bool(run_select(
        "SELECT 1 FROM information_schema.columns WHERE table_name = 'task_columns' AND column_name = 'kind'"
    ))


def _plan() -> list[dict]:
    """Planejar a classificação das colunas ainda sem tipo.

    Returns:
        Uma entrada por coluna sem `kind`: `{"id", "name", "project", "kind"}` (kind `None` = nome
        não reconhecido, fica como está).
    """
    rows = run_select(
        """
        SELECT c.id, c.name, c.is_done_column, p.name AS project
          FROM task_columns c JOIN task_projects p ON p.id = c.project_id
         WHERE c.kind IS NULL
         ORDER BY p.name, c.position, c.id
        """
    )
    return [
        {"id": r["id"], "name": r["name"], "project": r["project"],
         "kind": infer_column_kind(r["name"], r["is_done_column"])}
        for r in rows
    ]


def main(apply: bool = False) -> dict:
    """Rodar a migração.

    Args:
        apply: False = dry-run (só relata); True = grava.

    Returns:
        Resumo: `{"ddl_pending": bool, "classified": <int>, "unknown": <int>}`.
    """
    pending = not _has_kind_column()
    print("DDL pendente:", "task_columns.kind" if pending else "nenhum (já aplicado)")
    if apply and pending:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(_DDL)
        print("DDL aplicado.")
        pending = False

    if pending:
        print("(dry-run) classificação não calculada — aplique o DDL primeiro (--apply).")
        return {"ddl_pending": True, "classified": 0, "unknown": 0}

    plan = _plan()
    classified = [p for p in plan if p["kind"]]
    unknown = [p for p in plan if not p["kind"]]
    for p in classified:
        print(f"  {p['project']} / {p['name']!r} → {p['kind']}")
    for p in unknown:
        print(f"  {p['project']} / {p['name']!r} → (não reconhecida, fica cobrável)")
    print(f"Colunas a classificar: {len(classified)} · não reconhecidas: {len(unknown)}")

    if apply:
        with get_conn() as conn:
            with conn.cursor() as cur:
                for p in classified:
                    # AND kind IS NULL: nunca sobrescreve o que já foi classificado.
                    cur.execute("UPDATE task_columns SET kind = %s WHERE id = %s AND kind IS NULL",
                                (p["kind"], p["id"]))
        print("Classificação aplicada.")
    else:
        print("Dry-run: nada foi gravado. Use --apply para gravar.")
    return {"ddl_pending": False, "classified": len(classified), "unknown": len(unknown)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--apply", action="store_true", help="grava (padrão: dry-run)")
    main(apply=parser.parse_args().apply)
