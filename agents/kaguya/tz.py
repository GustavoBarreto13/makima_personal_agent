"""Fuso do usuário (America/Sao_Paulo) — única fonte de "hoje" e "agora" da Kaguya.

O container roda em UTC; ``date.today()``, ``datetime.now()`` e ``CURRENT_DATE`` devolvem a data do
servidor e viram "amanhã" depois das 21h locais. Todo código da Kaguya que precise de "hoje" importa
daqui (módulo sem dependências, seguro de importar de qualquer lugar).
"""

from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

SP_TZ = ZoneInfo("America/Sao_Paulo")

# Fragmento SQL equivalente a today_sp() — para queries que comparam com a data local.
SP_TODAY_SQL = "(NOW() AT TIME ZONE 'America/Sao_Paulo')::date"


def now_sp() -> datetime:
    """Instante atual com tzinfo de São Paulo."""
    return datetime.now(SP_TZ)


def today_sp() -> date:
    """Data local de hoje (America/Sao_Paulo)."""
    return now_sp().date()
