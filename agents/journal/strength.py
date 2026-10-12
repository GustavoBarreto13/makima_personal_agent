"""Força da escrita no diário (spec 076) — o MESMO motor dos hábitos da Kaguya.

A Violet não usa mais "ofensiva" (que zera num dia perdido e reinicia em 1º/jan). A força é a
"caixa d'água" de ``agents.kaguya.habit_strength``: escrever enche um pouco, não escrever vaza
um pouco, e a régua se ajusta à meta semanal (ex.: 5x/semana — os dias de folga não são falha).

Dois níveis:
    - ``strength_series`` / ``summarize``: puros (testáveis sem banco);
    - ``get_writing_strength``: lê do banco os dias com escrita e chama os puros.

"Dia escrito" = dia com ao menos uma palavra em bullet ou no sonho (America/Sao_Paulo).
Registros emocionais e cartas não contam como escrita do diário (são outras práticas).
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Iterable

from agents.kaguya import habit_strength as HS

DEFAULT_WEEKLY_TARGET = 5


def strength_series(done_dates: Iterable[date], weekly_target: float, today: date, days: int = 90) -> list[dict]:
    """Consistência (0–100) dia a dia nos últimos ``days`` dias — o gráfico da força.

    Returns:
        ``[{"date": "YYYY-MM-DD", "value": int, "done": bool}]`` do mais antigo a hoje.
    """
    feitas = set(done_dates)
    out = []
    for i in range(days - 1, -1, -1):
        d = today - timedelta(days=i)
        out.append({"date": d.isoformat(), "value": HS.summary(feitas, weekly_target, today=d)["consistency"],
                    "done": d in feitas})
    return out


def summarize(done_dates: Iterable[date], weekly_target: float, today: date, days: int = 90) -> dict:
    """Resumo da força: as três dimensões do motor de hábitos + série e recorde do período.

    Returns:
        ``{consistency, trend, recent_done, recent_total, ema, weekly_target, best, series,
        days_written_period}``.
    """
    feitas = set(done_dates)
    base = HS.summary(feitas, weekly_target, today=today)
    series = strength_series(feitas, weekly_target, today, days)
    return {
        **base,
        "weekly_target": weekly_target,
        "best": max((p["value"] for p in series), default=0),
        "series": series,
        "days_written_period": sum(1 for p in series if p["done"]),
    }


def written_dates(since: date, until: date, type_id: int = 1) -> set[date]:
    """Dias com palavras (bullet não vazio ou sonho) entre ``since`` e ``until``."""
    from agents.db import run_select  # noqa: PLC0415

    rows = run_select(
        """
        SELECT DISTINCT p.date
        FROM journal_pages p
        WHERE p.type_id = %(t)s AND p.date BETWEEN %(a)s AND %(b)s
          AND (NULLIF(btrim(p.dream), '') IS NOT NULL
               OR EXISTS (SELECT 1 FROM journal_bullets b WHERE b.page_id = p.id AND btrim(b.content) <> ''))
        """,
        {"t": type_id, "a": since, "b": until},
    )
    return {r["date"] for r in rows}


def get_writing_strength(weekly_target: float = DEFAULT_WEEKLY_TARGET, today: date | None = None, days: int = 90) -> dict:
    """Força da escrita hoje (ou em ``today``), com a série dos últimos ``days`` dias.

    Args:
        weekly_target: Meta de dias escritos por semana (1–7; vem das preferências).
        today: Data de referência (default: hoje em America/Sao_Paulo).
        days: Tamanho da série do gráfico.

    Returns:
        ``{"status": "ok", consistency, trend, recent_done, recent_total, weekly_target, best,
        series, days_written_period}``.
    """
    from agents.journal.tools import _today_sp  # noqa: PLC0415

    ref = today or _today_sp()
    target = max(1.0, min(float(weekly_target or DEFAULT_WEEKLY_TARGET), 7.0))
    # A EMA olha 60 dias para trás de cada ponto da série — busca a janela inteira de uma vez.
    feitas = written_dates(ref - timedelta(days=days + 61), ref)
    return {"status": "ok", **summarize(feitas, target, ref, days)}
