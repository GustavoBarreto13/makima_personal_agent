"""Provedor de **fonte automática de hábito** — Foco/Pomodoro (spec 062).

Publica o contrato exigido pelo próprio registry da Kaguya
(``agents.kaguya.habit_source_providers``) — o mesmo mecanismo que já traz o diário da
Violet e a leitura da Frieren. Aqui o "outro agente" é o próprio domínio de foco: um
hábito como "focar todo dia" ou "focar 60min por dia" (mensurável, ``unit="min"``) marca
o check-in sozinho, sem exigir que o usuário confirme duas vezes o mesmo esforço.

Complementa (não substitui) o vínculo direto ``focus_sessions.habit_id`` — esse aqui
responde "foquei hoje, em qualquer coisa"; o vínculo direto responde "essa sessão foi
para o hábito X" (ver ``tools_habits._check_in_on_cursor`` chamado por
``tools_focus.finish_session``). Os dois convivem sem conflito: o UNIQUE
``(habit_id, date)`` de ``habit_checkins`` faz a união silenciosa se os dois caminhos
tentarem marcar o mesmo dia.

Usage:
    >>> from agents.kaguya.focus_habit_provider import get_activity
    >>> get_activity("2026-07-01", "2026-07-31")
    {'2026-07-05': 125.0}
"""

from agents.db import run_select


def get_activity(start_date: str, end_date: str) -> dict[str, float]:
    """Soma os minutos efetivamente focados por dia num intervalo (só sessões concluídas).

    Args:
        start_date: Início do intervalo, ``"AAAA-MM-DD"`` (inclusivo, dia local).
        end_date: Fim do intervalo, ``"AAAA-MM-DD"`` (inclusivo, dia local).

    Returns:
        Mapa esparso ``{"AAAA-MM-DD": total_minutos}`` — dias sem sessão concluída
        ficam ausentes (equivalente a "nenhuma atividade detectada").
    """
    rows = run_select(
        """
        SELECT
            (fs.ended_at AT TIME ZONE 'America/Sao_Paulo')::date AS date_local,
            SUM(LEAST(fs.duration_planned_min,
                GREATEST(0, EXTRACT(EPOCH FROM (fs.ended_at - fs.started_at)) / 60)
            )) AS total_min
        FROM focus_sessions fs
        WHERE fs.outcome = 'completed'
          AND (fs.ended_at AT TIME ZONE 'America/Sao_Paulo')::date
              BETWEEN %(start)s AND %(end)s
        GROUP BY date_local
        """,
        {"start": start_date, "end": end_date},
    )
    return {r["date_local"].isoformat(): float(r["total_min"]) for r in rows}
