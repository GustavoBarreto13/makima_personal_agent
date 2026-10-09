"""Agenda do usuário (spec 075): expediente, almoço, acordar/dormir e exceções por dia.

É a base dos DOIS tempos livres (trabalho e geral — ver ``capacity.compute_free_time``) e do
digest matinal, que só fala de trabalho em dia de trabalho. Trabalho acontece nos dias úteis; uma
**exceção** pontual cobre o sábado trabalhado ("vou trabalhar neste sábado") ou a folga no meio da
semana. Dias da semana em ISO (1=segunda … 7=domingo).

Tabelas: ``kaguya_schedule_prefs`` (linha única) e ``kaguya_schedule_overrides``.
"""

from __future__ import annotations

from datetime import date, time
from typing import Optional

from agents.db import run_dml, run_select
from agents.kaguya import capacity
from agents.kaguya.tz import today_sp

_TIME_FIELDS = ("work_start", "work_end", "lunch_start", "lunch_end", "wake_time", "sleep_time")
_NULLABLE_TIME_FIELDS = ("lunch_start", "lunch_end")   # sem almoço = ambos None


def _fmt(t: Optional[time]) -> Optional[str]:
    """``time`` → ``"HH:MM"`` (ou ``None``)."""
    return None if t is None else t.strftime("%H:%M")


def _parse_time(value: str, field: str) -> time:
    """``"HH:MM"`` → ``time``; levanta ``ValueError`` com mensagem clara se inválido."""
    try:
        h, m = value.split(":")[:2]
        return time(int(h), int(m))
    except (ValueError, AttributeError):
        raise ValueError(f"Horário inválido em {field}: use HH:MM (ex.: 09:00).") from None


def _serialize_prefs(row: dict) -> dict:
    """Linha de ``kaguya_schedule_prefs`` → dicionário JSON-friendly."""
    return {
        "work_days": sorted(row["work_days"]),
        **{f: _fmt(row[f]) for f in _TIME_FIELDS},
        "lunch_is_free": bool(row["lunch_is_free"]),
    }


def _load_prefs_row() -> dict:
    """Lê a linha única de preferências (cria a padrão se, por algum motivo, não existir)."""
    rows = run_select("SELECT * FROM kaguya_schedule_prefs WHERE id = 1")
    if not rows:
        run_dml("INSERT INTO kaguya_schedule_prefs (id) VALUES (1) ON CONFLICT (id) DO NOTHING")
        rows = run_select("SELECT * FROM kaguya_schedule_prefs WHERE id = 1")
    return rows[0]


def get_schedule_prefs() -> dict:
    """Devolve a agenda padrão do usuário.

    Returns:
        ``{"work_days": [1..7], "work_start", "work_end", "lunch_start", "lunch_end",
        "wake_time", "sleep_time" (todos "HH:MM"), "lunch_is_free": bool}``.
    """
    return _serialize_prefs(_load_prefs_row())


def set_schedule_prefs(
    work_days: Optional[list[int]] = None,
    work_start: Optional[str] = None,
    work_end: Optional[str] = None,
    lunch_start: Optional[str] = None,
    lunch_end: Optional[str] = None,
    lunch_is_free: Optional[bool] = None,
    wake_time: Optional[str] = None,
    sleep_time: Optional[str] = None,
    clear_lunch: bool = False,
) -> dict:
    """Atualiza a agenda padrão (PATCH parcial: só o que foi informado muda).

    Args:
        work_days: Dias de trabalho em ISO (1=segunda … 7=domingo), ex.: ``[1,2,3,4,5]``.
        work_start / work_end: Expediente, ``"HH:MM"``.
        lunch_start / lunch_end: Almoço dentro do expediente, ``"HH:MM"``.
        lunch_is_free: ``True`` se o almoço conta como tempo livre utilizável.
        wake_time / sleep_time: Acordar e dormir, ``"HH:MM"`` (dormir menor que acordar = depois
            da meia-noite). Definem o tempo livre geral.
        clear_lunch: ``True`` para remover o almoço (sem pausa no expediente).

    Returns:
        ``{"status": "ok", "prefs": {...}}`` ou ``{"status": "error", "message": ...}``.
    """
    sets: dict = {}
    try:
        if work_days is not None:
            days = sorted({int(d) for d in work_days})
            if any(d < 1 or d > 7 for d in days):
                return {"status": "error", "message": "Dias de trabalho devem ir de 1 (segunda) a 7 (domingo)."}
            sets["work_days"] = days
        for field, value in (("work_start", work_start), ("work_end", work_end), ("lunch_start", lunch_start),
                             ("lunch_end", lunch_end), ("wake_time", wake_time), ("sleep_time", sleep_time)):
            if value is not None:
                sets[field] = _parse_time(value, field)
    except ValueError as exc:
        return {"status": "error", "message": str(exc)}
    if lunch_is_free is not None:
        sets["lunch_is_free"] = bool(lunch_is_free)
    if clear_lunch:
        sets["lunch_start"] = sets["lunch_end"] = None
    if not sets:
        return {"status": "error", "message": "Nada para atualizar."}

    current = _load_prefs_row()
    merged = {**{f: current[f] for f in _TIME_FIELDS}, **{k: v for k, v in sets.items() if k in _TIME_FIELDS}}
    if merged["work_end"] <= merged["work_start"]:
        return {"status": "error", "message": "O fim do expediente precisa ser depois do início."}
    l_ini, l_fim = merged["lunch_start"], merged["lunch_end"]
    if (l_ini is None) != (l_fim is None):
        return {"status": "error", "message": "Informe início e fim do almoço (ou remova-o)."}
    if l_ini is not None and l_fim <= l_ini:
        return {"status": "error", "message": "O fim do almoço precisa ser depois do início."}

    assignments = ", ".join(f"{k} = %({k})s" for k in sets)
    run_dml(f"UPDATE kaguya_schedule_prefs SET {assignments}, updated_at = now() WHERE id = 1", sets)
    return {"status": "ok", "prefs": get_schedule_prefs()}


# ── Exceções por dia ─────────────────────────────────────────────────────────

def _serialize_override(row: dict) -> dict:
    return {
        "day": row["day"].isoformat(),
        "works": bool(row["works"]),
        "work_start": _fmt(row["work_start"]),
        "work_end": _fmt(row["work_end"]),
        "note": row["note"],
    }


def list_schedule_overrides(from_date: Optional[str] = None, to_date: Optional[str] = None) -> list[dict]:
    """Lista as exceções de agenda num intervalo (padrão: de hoje em diante).

    Args:
        from_date: ``YYYY-MM-DD`` inicial (padrão: hoje no fuso de São Paulo).
        to_date: ``YYYY-MM-DD`` final inclusivo (padrão: sem limite).

    Returns:
        Lista de ``{"day", "works", "work_start", "work_end", "note"}`` ordenada por dia.
    """
    start = from_date or today_sp().isoformat()
    rows = run_select(
        "SELECT * FROM kaguya_schedule_overrides WHERE day >= %(a)s AND (%(b)s::date IS NULL OR day <= %(b)s) "
        "ORDER BY day",
        {"a": start, "b": to_date},
    )
    return [_serialize_override(r) for r in rows]


def set_schedule_override(
    day: str,
    works: bool,
    work_start: Optional[str] = None,
    work_end: Optional[str] = None,
    note: Optional[str] = None,
) -> dict:
    """Define (ou troca) a exceção de um dia: trabalhar num dia livre ou folgar num dia útil.

    Args:
        day: ``YYYY-MM-DD``.
        works: ``True`` = trabalha neste dia; ``False`` = folga.
        work_start / work_end: Horário só deste dia (ambos ou nenhum; padrão = expediente normal).
        note: Anotação livre (ex.: "plantão", "feriado").

    Returns:
        ``{"status": "ok", "override": {...}}`` ou erro.
    """
    try:
        d = date.fromisoformat(day)
        ini = _parse_time(work_start, "work_start") if work_start else None
        fim = _parse_time(work_end, "work_end") if work_end else None
    except ValueError as exc:
        return {"status": "error", "message": str(exc) if "Horário" in str(exc) else "Data inválida: use YYYY-MM-DD."}
    if (ini is None) != (fim is None):
        return {"status": "error", "message": "Informe início e fim do expediente do dia (ou nenhum dos dois)."}
    if ini is not None and fim <= ini:
        return {"status": "error", "message": "O fim do expediente precisa ser depois do início."}
    if not works:
        ini = fim = None   # folga não tem horário
    run_dml(
        """
        INSERT INTO kaguya_schedule_overrides (day, works, work_start, work_end, note)
        VALUES (%(d)s, %(w)s, %(i)s, %(f)s, %(n)s)
        ON CONFLICT (day) DO UPDATE
           SET works = EXCLUDED.works, work_start = EXCLUDED.work_start,
               work_end = EXCLUDED.work_end, note = EXCLUDED.note
        """,
        {"d": d, "w": bool(works), "i": ini, "f": fim, "n": note},
    )
    row = run_select("SELECT * FROM kaguya_schedule_overrides WHERE day = %(d)s", {"d": d})[0]
    return {"status": "ok", "override": _serialize_override(row)}


def clear_schedule_override(day: str) -> dict:
    """Remove a exceção de um dia (volta a valer a agenda padrão).

    Args:
        day: ``YYYY-MM-DD``.

    Returns:
        ``{"status": "ok"}`` ou erro se não havia exceção nesse dia.
    """
    try:
        d = date.fromisoformat(day)
    except ValueError:
        return {"status": "error", "message": "Data inválida: use YYYY-MM-DD."}
    removed = run_dml("DELETE FROM kaguya_schedule_overrides WHERE day = %(d)s", {"d": d})
    if not removed:
        return {"status": "error", "message": "Não há exceção nesse dia."}
    return {"status": "ok", "message": "Exceção removida."}


# ── Resolução para os consumidores (Meu Dia, digest, estatísticas) ───────────

def get_day_schedule(day: Optional[date] = None) -> dict:
    """Agenda resolvida de um dia (padrão + exceção), pronta para ``capacity.compute_free_time``.

    Args:
        day: O dia (padrão: hoje em São Paulo).

    Returns:
        Resultado de ``capacity.resolve_day_schedule`` (minutos desde a meia-noite).
    """
    day = day or today_sp()
    prefs = _load_prefs_row()
    override_rows = run_select("SELECT * FROM kaguya_schedule_overrides WHERE day = %(d)s", {"d": day})
    return capacity.resolve_day_schedule(prefs, day, override_rows[0] if override_rows else None)


def is_work_day(day: Optional[date] = None) -> bool:
    """Diz se há trabalho neste dia (dia útil, ou exceção que manda trabalhar; exceção de folga vence)."""
    return bool(get_day_schedule(day)["works"])
