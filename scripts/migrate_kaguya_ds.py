"""Migrar o banco da Kaguya para a spec 075 (Design System + app de tarefas completo).

O que faz:
  1. Aplica o bloco `-- BEGIN SPEC 075 … -- END SPEC 075` de `agents/kaguya/schema_tasks_pg.sql`
     (fonte única do DDL): contexto nos grupos, `deleted_at`/cadência/sequencial nas listas,
     `start_date`/`waiting_person_id`/`follow_up_date`/`series_id` nas tarefas e as tabelas
     `kaguya_schedule_prefs`, `kaguya_schedule_overrides`, `task_dependencies`, `task_templates`
     e `task_activity`. Tudo idempotente: rodar duas vezes não muda nada.
  2. Preenche `series_id` das recorrentes que JÁ existem: cada regra ativa batiza a tarefa viva e
     as ocorrências concluídas da mesma lista com o mesmo título (melhor estimativa disponível — não
     havia vínculo entre as linhas de uma série).
  3. Herda o espaço dos grupos: grupo cujas listas são TODAS de trabalho passa a ser de trabalho.

Dry-run por padrão: só conta o que seria feito, sem tocar no banco.

Usage:
    python -m scripts.migrate_kaguya_ds            # dry-run
    python -m scripts.migrate_kaguya_ds --apply    # grava

No VPS, rodar de dentro do container (o host do banco não resolve fora do Swarm):
    docker exec makima-web sh -c "cd /app && python -m scripts.migrate_kaguya_ds --apply"
"""

import argparse
import os
import re
import uuid

from agents.db import get_conn, run_select

_SCHEMA_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "agents", "kaguya", "schema_tasks_pg.sql",
)

# Colunas novas que denunciam se o DDL já foi aplicado: (tabela, coluna).
_NEW_COLUMNS = (
    ("task_project_groups", "context"),
    ("task_projects", "deleted_at"),
    ("task_projects", "review_interval_days"),
    ("task_projects", "sequential"),
    ("tasks", "start_date"),
    ("tasks", "waiting_person_id"),
    ("tasks", "follow_up_date"),
    ("tasks", "series_id"),
)
_NEW_TABLES = (
    "kaguya_schedule_prefs", "kaguya_schedule_overrides", "task_dependencies",
    "task_templates", "task_activity",
)


def _ddl_block() -> str:
    """Extrair do schema o bloco da spec 075.

    Returns:
        O SQL entre os marcadores `BEGIN SPEC 075` e `END SPEC 075`.

    Raises:
        RuntimeError: Se os marcadores não forem encontrados.
    """
    with open(_SCHEMA_PATH, encoding="utf-8") as f:
        text = f.read()
    m = re.search(r"-- BEGIN SPEC 075\n(.*?)-- END SPEC 075", text, re.S)
    if not m:
        raise RuntimeError("Marcadores BEGIN/END SPEC 075 não encontrados em schema_tasks_pg.sql.")
    return m.group(1)


def _pending_ddl() -> list[str]:
    """Listar o que do DDL ainda falta no banco.

    Returns:
        Descrições das colunas/tabelas ausentes (lista vazia = DDL já aplicado).
    """
    missing = []
    for table, column in _NEW_COLUMNS:
        # information_schema é o "catálogo" do PostgreSQL: diz quais colunas cada tabela tem.
        row = run_select(
            "SELECT 1 FROM information_schema.columns WHERE table_name = %(t)s AND column_name = %(c)s",
            {"t": table, "c": column},
        )
        if not row:
            missing.append(f"coluna {table}.{column}")
    for table in _NEW_TABLES:
        # to_regclass devolve NULL quando o nome não corresponde a nenhuma tabela.
        if not run_select("SELECT to_regclass(%(n)s) IS NOT NULL AS ok", {"n": f"public.{table}"})[0]["ok"]:
            missing.append(f"tabela {table}")
    return missing


def _series_plan() -> list[dict]:
    """Planejar o backfill de `series_id` a partir das regras de recorrência ativas.

    Returns:
        Uma entrada por regra ativa cuja tarefa viva ainda não tem `series_id`:
        `{"task_id", "title", "project_id", "past": <nº de ocorrências concluídas a vincular>}`.
        Exige a coluna `series_id` (só chamar depois do DDL, ou em dry-run com o DDL já aplicado).
    """
    return run_select(
        """
        SELECT t.id AS task_id, t.title, t.project_id,
               (SELECT COUNT(*) FROM tasks p
                 WHERE p.project_id = t.project_id AND p.title = t.title AND p.parent_id IS NULL
                   AND p.completed_at IS NOT NULL AND p.deleted_at IS NULL
                   AND p.series_id IS NULL AND p.id < t.id) AS past
          FROM task_recurrences r JOIN tasks t ON t.id = r.task_id
         WHERE r.active AND t.deleted_at IS NULL AND t.series_id IS NULL
        """
    )


def _group_plan() -> list[dict]:
    """Planejar a herança de espaço: grupos com listas e TODAS de trabalho (e ainda marcados pessoais).

    Returns:
        `{"id", "name"}` dos grupos a promover para `work`.
    """
    return run_select(
        """
        SELECT g.id, g.name
          FROM task_project_groups g
         WHERE g.context = 'personal'
           AND EXISTS (SELECT 1 FROM task_projects p WHERE p.group_id = g.id AND p.archived_at IS NULL)
           AND NOT EXISTS (SELECT 1 FROM task_projects p
                            WHERE p.group_id = g.id AND p.archived_at IS NULL AND p.context <> 'work')
        """
    )


def main(apply: bool = False) -> dict:
    """Rodar a migração.

    Args:
        apply: False = dry-run (só relata); True = grava.

    Returns:
        Resumo: `{"ddl_pending": [...], "series": <int>, "series_past": <int>, "groups": <int>}`.
    """
    pending = _pending_ddl()
    print("DDL pendente:", ", ".join(pending) if pending else "nenhum (já aplicado)")

    if apply and pending:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(_ddl_block())
        print("DDL aplicado.")
        pending = _pending_ddl()

    if pending:
        # Dry-run num banco ainda sem as colunas: os backfills dependem delas.
        print("(dry-run) backfills não calculados — aplique o DDL primeiro.")
        return {"ddl_pending": pending, "series": 0, "series_past": 0, "groups": 0}

    series = _series_plan()
    groups = _group_plan()
    past = sum(int(s["past"]) for s in series)
    print(f"Séries a batizar: {len(series)} (com {past} ocorrência(s) concluída(s) a vincular)")
    print(f"Grupos a promover para 'work': {len(groups)}" + (f" ({', '.join(g['name'] for g in groups)})" if groups else ""))

    if apply:
        with get_conn() as conn:
            with conn.cursor() as cur:
                for s in series:
                    sid = str(uuid.uuid4())
                    cur.execute("UPDATE tasks SET series_id = %s WHERE id = %s", (sid, s["task_id"]))
                    cur.execute(
                        "UPDATE tasks SET series_id = %s "
                        "WHERE project_id = %s AND title = %s AND parent_id IS NULL "
                        "AND completed_at IS NOT NULL AND deleted_at IS NULL "
                        "AND series_id IS NULL AND id < %s",
                        (sid, s["project_id"], s["title"], s["task_id"]),
                    )
                for g in groups:
                    cur.execute("UPDATE task_project_groups SET context = 'work' WHERE id = %s", (g["id"],))
        print("Backfills aplicados.")
    else:
        print("Dry-run: nada foi gravado. Use --apply para gravar.")

    return {"ddl_pending": pending, "series": len(series), "series_past": past, "groups": len(groups)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--apply", action="store_true", help="grava (padrão: dry-run)")
    args = parser.parse_args()
    main(apply=args.apply)
