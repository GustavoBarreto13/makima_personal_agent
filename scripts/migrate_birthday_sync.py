"""migrate_birthday_sync.py — Migração retroativa de aniversários Komi → Kaguya.

Itera todos os person_dates existentes com label ILIKE '%anivers%' que ainda
não têm link em birthday_sync_links e chama komi_sync.push_person_date para
criar as tarefas type=birthday correspondentes na Kaguya.

Idempotente: pode ser executado múltiplas vezes sem efeito duplicado.
  - push_person_date verifica se o link já existe antes de criar.
  - ON CONFLICT DO UPDATE no INSERT do link garante atomicidade.

Pré-requisitos:
  - Schema atualizado com a tabela birthday_sync_links (026-PLAN-01).
  - Variáveis de ambiente DATABASE_URL e demais configs da Kaguya/Komi.
  - KOMI_SYNC_ENABLED não deve ser "false" (verifica antes de rodar).

Execução (DENTRO do container makima-web — o hostname do PostgreSQL só
resolve de dentro do Docker Swarm):

    docker exec makima-web sh -c "cd /app && python -m scripts.migrate_birthday_sync"

Ou com log detalhado:

    docker exec makima-web sh -c "cd /app && python -m scripts.migrate_birthday_sync --verbose"

Usage:
    $ python -m scripts.migrate_birthday_sync
    [migrate_birthday_sync] Iniciando migração retroativa de aniversários Komi → Kaguya
    [migrate_birthday_sync] Encontrados 12 aniversários sem link
    [migrate_birthday_sync] 12/12 processados — 11 criados, 1 erros
    [migrate_birthday_sync] Concluído.
"""

import argparse
import logging
import os
import sys

# Configuração de logging — saída para stdout para ficar visível no docker exec
logging.basicConfig(
    level=logging.DEBUG if "--verbose" in sys.argv else logging.INFO,
    format="[migrate_birthday_sync] %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)


def main() -> None:
    # Argparse para o flag --verbose
    parser = argparse.ArgumentParser(description="Migração retroativa de aniversários Komi → Kaguya")
    parser.add_argument("--verbose", action="store_true", help="Log detalhado por person_date")
    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # Verifica se o sync está habilitado — não faz sentido migrar com KOMI_SYNC_ENABLED=false
    if os.environ.get("KOMI_SYNC_ENABLED", "true").lower() == "false":
        logger.error(
            "KOMI_SYNC_ENABLED=false — migração abortada. "
            "Habilite o sync antes de rodar este script."
        )
        sys.exit(1)

    logger.info("Iniciando migração retroativa de aniversários Komi → Kaguya")

    # Importa após verificar o env para não travar imports desnecessariamente
    from agents.db import run_select
    from agents.kaguya import komi_sync

    # Busca todos os person_dates com label ILIKE '%anivers%' que ainda não têm link.
    # LEFT JOIN birthday_sync_links + WHERE bsl.person_date_id IS NULL:
    #   - inclui person_dates sem linha correspondente no birthday_sync_links
    #   - exclui os que já têm link (idempotência)
    # Filtra people.deleted = FALSE para não migrar aniversários de pessoas excluídas.
    rows = run_select(
        """
        SELECT pd.id, pd.label, pd.date::text, pd.person_id, p.name
        FROM person_dates pd
        JOIN people p ON p.id = pd.person_id AND p.deleted = FALSE
        LEFT JOIN birthday_sync_links bsl ON bsl.person_date_id = pd.id
        WHERE pd.label ILIKE '%anivers%'
          AND bsl.person_date_id IS NULL
        ORDER BY pd.id
        """,
        {},
    )

    total = len(rows)
    logger.info("Encontrados %d aniversários sem link", total)

    if total == 0:
        logger.info("Nada a migrar — todos os aniversários já estão sincronizados.")
        return

    criados = 0
    erros = 0

    for i, row in enumerate(rows, 1):
        date_id = row["id"]
        person_name = row["name"]
        label = row["label"]
        date_str = row["date"]

        logger.debug(
            "[%d/%d] person_date_id=%d | %s (%s) | %s",
            i, total, date_id, person_name, label, date_str,
        )

        try:
            # push_person_date é idempotente: verifica se o link já existe antes de criar
            # (caso a migração seja interrompida e re-executada, não duplica)
            komi_sync.push_person_date(date_id)

            # Verifica se o link foi de fato criado (idempotência — pode estar no banco já)
            from agents.db import run_select as _rs
            link_check = _rs(
                "SELECT task_id FROM birthday_sync_links WHERE person_date_id = %s",
                (date_id,),
            )
            if link_check:
                criados += 1
                logger.debug(
                    "  ✓ Criado task_id=%d para person_date_id=%d",
                    link_check[0]["task_id"], date_id,
                )
            else:
                # push_person_date silenciou um erro interno (best-effort)
                erros += 1
                logger.warning(
                    "  ⚠ person_date_id=%d | Sem link após push — verifique os logs",
                    date_id,
                )

        except Exception as exc:
            erros += 1
            logger.error(
                "  ✗ person_date_id=%d | %s: %s",
                date_id, type(exc).__name__, exc,
            )

    logger.info(
        "%d/%d processados — %d criados, %d erros",
        total, total, criados, erros,
    )

    if erros > 0:
        logger.warning(
            "Concluído com %d erros. Execute novamente para tentar re-processar os que falharam.",
            erros,
        )
        sys.exit(1)
    else:
        logger.info("Concluído com sucesso.")


if __name__ == "__main__":
    main()
