"""Garantia do schema da Komi: aplica ``schema_pg.sql`` no primeiro acesso do processo.

Por que existe: o schema da Komi cresceu (spec 077) e o deploy do código acontece
ANTES de alguém rodar a migração manual no VPS. Sem esta garantia, o primeiro acesso
após o deploy falharia com "coluna não existe". O arquivo SQL é 100% idempotente
(``IF NOT EXISTS`` / ``ON CONFLICT DO NOTHING``), então reaplicá-lo é seguro.

A conversão dos DADOS antigos (aniversários → campo, notas → anotações...) NÃO é
feita aqui — isso é a migração explícita ``scripts/migrate_komi_ds.py``, que o dono
roda e confere antes de aplicar.

Usage:
    >>> from agents.komi.schema import ensure_schema
    >>> ensure_schema()   # idempotente; só consulta o banco na primeira vez do processo
    True
"""

from __future__ import annotations

import logging
import threading
import time
from pathlib import Path

from agents.db import get_conn

logger = logging.getLogger(__name__)

# O arquivo mora ao lado deste módulo.
_SCHEMA_PATH = Path(__file__).with_name("schema_pg.sql")

# Chave do "advisory lock" do PostgreSQL: serializa dois processos (web, mcp, scheduler)
# que tentem aplicar o schema ao mesmo tempo, evitando deadlock entre os ALTER TABLE.
_ADVISORY_KEY = 770_001

# Quanto esperar antes de tentar de novo depois de uma falha (ex.: banco fora do ar),
# para não repetir a tentativa a cada chamada de tool.
_RETRY_SECONDS = 30.0

_trava = threading.Lock()
_aplicado = False
_ultima_falha = 0.0


def ensure_schema(force: bool = False) -> bool:
    """Aplicar o schema da Komi se ainda não foi aplicado neste processo.

    Args:
        force: Reaplica mesmo que já tenha sido aplicado (usado por testes e pelo
            script de migração).

    Returns:
        ``True`` se o schema está aplicado; ``False`` se não deu para aplicar agora
        (falha registrada no log — as tools seguem e erram do jeito normal).
    """
    global _aplicado, _ultima_falha

    # Caminho rápido: já aplicado → nenhuma ida ao banco.
    if _aplicado and not force:
        return True

    with _trava:
        if _aplicado and not force:
            return True
        # Depois de uma falha recente, não insiste (o banco pode estar fora do ar).
        if not force and _ultima_falha and (time.monotonic() - _ultima_falha) < _RETRY_SECONDS:
            return False
        try:
            sql = _SCHEMA_PATH.read_text(encoding="utf-8")
            with get_conn() as conn:
                with conn.cursor() as cur:
                    # Se um ALTER TABLE esperar por um lock de outra transação (por exemplo, a de
                    # quem nos chamou no meio de uma gravação), desiste em 5s em vez de travar
                    # para sempre: a falha é registrada e a próxima tentativa vem depois.
                    cur.execute("SET LOCAL lock_timeout = '5s'")
                    # O lock vale até o fim desta transação (xact) e é liberado sozinho.
                    cur.execute("SELECT pg_advisory_xact_lock(%s)", (_ADVISORY_KEY,))
                    # Sem parâmetros: o psycopg2 não mexe nos "%" do script.
                    cur.execute(sql)
            _aplicado = True
            return True
        except Exception:  # noqa: BLE001 — qualquer falha aqui não pode derrubar a tool
            _ultima_falha = time.monotonic()
            logger.warning("Komi: não foi possível aplicar o schema agora.", exc_info=True)
            return False


def reset_for_tests() -> None:
    """Esquecer que o schema foi aplicado (testes que recriam o banco entre casos)."""
    global _aplicado, _ultima_falha
    _aplicado = False
    _ultima_falha = 0.0
