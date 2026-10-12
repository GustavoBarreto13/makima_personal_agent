"""Classifica as distorções cognitivas dos registros emocionais antigos (Violet) — spec 076.

Registros novos são classificados em segundo plano ao salvar. Este script faz o mesmo para os
que já existiam (``automatic_thought`` preenchido e ``distortions`` ainda NULL), um por vez,
com o Gemini (``VIOLET_GEMINI_MODEL``). Best-effort: falha de um registro não para os outros.

Dry-run por padrão. Rodar dentro do container ``makima-web``:

    docker exec makima-web sh -c "cd /app && python -m scripts.backfill_violet_distortions"
    docker exec makima-web sh -c "cd /app && python -m scripts.backfill_violet_distortions --apply --limit 200"
"""

import argparse
import sys

from agents.db import run_select


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Classifica distorções dos registros emocionais antigos.")
    parser.add_argument("--apply", action="store_true", help="Classifica de verdade (chama o Gemini)")
    parser.add_argument("--limit", type=int, default=500, help="Máximo de registros nesta rodada")
    args = parser.parse_args(argv)

    rows = run_select(
        """SELECT id FROM journal_emotion_logs
           WHERE distortions IS NULL AND NULLIF(btrim(automatic_thought), '') IS NOT NULL
           ORDER BY id LIMIT %(n)s""",
        {"n": args.limit},
    )
    print(f"Registros a classificar: {len(rows)}")
    if not args.apply:
        print("Dry-run: nada foi alterado. Rode com --apply para classificar.")
        return 0

    from agents.kurisu.emotion_analysis import classificar_distorcoes

    ok = 0
    for r in rows:
        res = classificar_distorcoes(r["id"])
        ok += res.get("status") == "ok"
        print(f"  {r['id']}: {res.get('distortions', res.get('message'))}")
    print(f"\nClassificados: {ok}/{len(rows)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
