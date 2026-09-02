"""Reconcilia o espelho Calendar Hub → Google Calendar (spec 069).

Cada fonte do `calendar_hub` (Nami, Frieren, Violet, Akane, Marin, Mai, Komi) tem
um calendário Google dedicado (nomes em `agents/kaguya/gcal.py::MIRRORED_SOURCES`).
Este script varre a janela cheia (hoje−365 → hoje+365) e faz o diff
insert/patch/delete de cada fonte contra o Google.

É a **rede de segurança** do gatilho `gcal_mirror.mark_dirty` (que roda numa
janela estreita a cada mutação de agente): pega o que o gatilho perdeu — evento
apagado à mão no Google, mutação durante queda da API, item que entrou/saiu da
janela pela passagem do tempo — e faz o backfill inicial.

Agendado de hora em hora pelo `makima-scheduler` (job `gcal_mirror`); também
serve para rodar à mão o primeiro backfill:

    docker exec makima-web sh -c "cd /app && python -m scripts.sync_gcal_mirror"

`reconcile_all` é best-effort e nunca levanta — este script transforma
"pelo menos uma fonte falhou" em `sys.exit(1)` para o runner do scheduler
registrar 'error' e alertar.

Usage:
    python -m scripts.sync_gcal_mirror
"""

import logging
import sys

from agents.kaguya import gcal_mirror

log = logging.getLogger("gcal-mirror")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(message)s")


def run() -> dict:
    """Reconcilia todas as fontes espelhadas na janela cheia. Nunca levanta.

    Returns:
        Dict `{results: [...], errors: [source_id, ...]}` — `errors` lista as
        fontes cujo resultado veio com a chave `error`.
    """
    start, end = gcal_mirror.full_window()
    log.info("gcal_mirror: reconciliando %s .. %s", start, end)
    results = gcal_mirror.reconcile_all(start, end)

    errors = [r["source"] for r in results if r.get("error")]
    for r in results:
        if r.get("error"):
            log.warning("  %-8s ERRO: %s", r["source"], r["error"])
        else:
            log.info(
                "  %-8s +%d ~%d -%d%s",
                r["source"], r["inserted"], r["updated"], r["deleted"],
                " (truncado)" if r.get("truncated") else "",
            )
    return {"results": results, "errors": errors}


def main() -> int:
    """0 se todas as fontes reconciliaram; 1 se ao menos uma falhou."""
    outcome = run()
    if outcome["errors"]:
        log.error("gcal_mirror: %d fonte(s) com erro: %s",
                  len(outcome["errors"]), ", ".join(outcome["errors"]))
        return 1
    print(f"[gcal-mirror] {len(outcome['results'])} fonte(s) reconciliada(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
