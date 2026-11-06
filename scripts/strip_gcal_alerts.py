"""Tira os alertas do Google dos eventos que a Makima já espelhou (tarefas e hábitos).

Contexto: o app passou a avisar tudo por push (job `app_reminders`). Os eventos NOVOS do espelho já saem sem
alerta (`gcal.alerts_enabled()` é falso por padrão), mas os que já existiam no Google continuam com o popup
antigo e fariam o celular tocar duas vezes. Os espelhos do hub (Komi etc.) se corrigem sozinhos na reconciliação
horária (`gcal_mirror` compara os alertas); aqui ficam as TAREFAS ("Kaguya — Tarefas") e os HÁBITOS
("Kaguya — Hábitos"), que só se atualizam quando o item muda.

Seguro e repetível: só mexe no campo `reminders` (nada de título, data, recorrência). Eventos de tarefas já
concluídas há mais de 1 dia ou sem data futura são ignorados.

Uso (dentro do container `makima-web`):
    python -m scripts.strip_gcal_alerts            # simulação: só conta o que mudaria
    python -m scripts.strip_gcal_alerts --apply    # grava no Google
"""

from __future__ import annotations

import argparse
import logging
import time

from agents.db import run_select
from agents.kaguya import gcal

log = logging.getLogger("strip-gcal-alerts")

# Pausa entre chamadas para não estourar a cota da API do Google.
_PAUSE_S = 0.15


def _task_events() -> list[str]:
    """Ids dos eventos-espelho de tarefas ainda relevantes (abertas ou de hoje em diante)."""
    rows = run_select(
        """
        SELECT google_event_id FROM tasks
        WHERE google_event_id IS NOT NULL
          AND deleted_at IS NULL
          AND (
                completed_at IS NULL
             OR due_date >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::date - 1
          )
        """
    )
    return [r["google_event_id"] for r in rows]


def _habit_events() -> list[str]:
    """Ids dos eventos recorrentes de alerta de hábito (um por dia da semana de cada hábito ativo)."""
    rows = run_select(
        """
        SELECT hs.google_event_id
        FROM habit_schedules hs JOIN habits h ON h.id = hs.habit_id
        WHERE hs.google_event_id IS NOT NULL AND h.archived_at IS NULL
        """
    )
    return [r["google_event_id"] for r in rows]


def _strip(calendar_id: str, event_ids: list[str], apply: bool) -> tuple[int, int]:
    """Aplica `NO_ALERTS` em cada evento. Returns ``(ok, falhas)``."""
    ok = falhas = 0
    for event_id in event_ids:
        try:
            if apply:
                gcal.update_event(calendar_id=calendar_id, event_id=event_id, reminders=dict(gcal.NO_ALERTS))
                time.sleep(_PAUSE_S)
            ok += 1
        except Exception as exc:  # noqa: BLE001 — evento apagado no Google etc.: segue com os outros
            falhas += 1
            log.warning("Não consegui limpar o evento %s: %s", event_id, exc)
    return ok, falhas


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="grava no Google (sem isso é só simulação)")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(message)s")

    tarefas = _task_events()
    habitos = _habit_events()
    modo = "APLICANDO" if args.apply else "SIMULAÇÃO (use --apply para gravar)"
    print(f"{modo}: {len(tarefas)} evento(s) de tarefas, {len(habitos)} de hábitos.")

    ok_t, falha_t = _strip(gcal.ensure_kaguya_calendar(), tarefas, args.apply)
    ok_h, falha_h = _strip(gcal.ensure_habits_calendar(), habitos, args.apply)
    if args.apply:
        gcal.invalidate_events_cache()
    print(f"Tarefas: {ok_t} ok, {falha_t} falha(s). Hábitos: {ok_h} ok, {falha_h} falha(s).")
    return 1 if (falha_t or falha_h) else 0


if __name__ == "__main__":
    raise SystemExit(main())
