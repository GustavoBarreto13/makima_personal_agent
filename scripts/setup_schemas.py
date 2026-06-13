"""Aplica os schemas PostgreSQL de Nami e Frieren no banco.

Executa os arquivos schema_pg.sql de cada agente.
Usar antes de rodar a migração de dados.

Usage:
    python scripts/setup_schemas.py
"""

import os
import sys

# Adiciona o root do projeto ao path para importar agents/db.py
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agents.db import get_conn  # noqa: E402

# Caminhos dos arquivos SQL a aplicar, em ordem
SCHEMA_FILES = [
    "agents/nami/schema_pg.sql",
    "agents/frieren/schema_pg.sql",
    # Sistema de tarefas próprio da Kaguya (spec 011). Inclui o seed do Inbox
    # (INSERT ... ON CONFLICT DO NOTHING protegido pelo índice uq_task_projects_inbox).
    "agents/kaguya/schema_tasks_pg.sql",
    # Catálogo de filmes da Akane (spec 015). 7 tabelas: movies, diary_entries,
    # movie_lists, movie_list_items, movie_vault_items, movie_people, movie_favorites.
    "agents/akane/schema_pg.sql",
]


def apply_schema(schema_path: str) -> None:
    """Lê e executa um arquivo SQL no banco PostgreSQL.

    Args:
        schema_path: Caminho relativo ao root do projeto.
    """
    full_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        schema_path,
    )
    print(f"Aplicando schema: {schema_path}")
    with open(full_path, "r", encoding="utf-8") as f:
        sql = f.read()

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
    print(f"  ✓ {schema_path} aplicado com sucesso")


if __name__ == "__main__":
    for schema_file in SCHEMA_FILES:
        apply_schema(schema_file)
    print("\nTodos os schemas aplicados!")
