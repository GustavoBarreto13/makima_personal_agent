"""Entrypoint do agendador — o processo que roda no container `makima-scheduler`.

Modos de uso:
    # Modo normal (fica ligado agendando os jobs nos horários definidos):
    python -m scheduler.main

    # Modo manual (roda UM job na hora e sai — útil para testar ou disparar à mão):
    python -m scheduler.main --run backup_postgres
    python -m scheduler.main --list          # só lista os jobs e sai

Variáveis de ambiente necessárias:
    DATABASE_URL           — PostgreSQL (para a tabela scheduler_runs e os jobs).
    + as variáveis de cada job (GCP_*, VERTEX_RAG_CORPUS_OPERACIONAL,
      LETTERBOXD_USERNAME, etc.) e TELEGRAM_ALERT_CHAT_ID para os alertas.
"""

import argparse
import logging
import os
import sys

# BlockingScheduler: um agendador que "bloqueia" o processo — ideal para um
# container dedicado que não faz mais nada além de agendar.
from apscheduler.schedulers.blocking import BlockingScheduler

from agents.db import get_conn
from scheduler.registry import JOBS, TZ
from scheduler.runner import execute_with_logging

# Logger deste módulo.
log = logging.getLogger("scheduler.main")


def _garantir_schema() -> None:
    """Cria a tabela scheduler_runs se ela ainda não existir.

    Lê o arquivo scheduler/schema_pg.sql (que usa CREATE TABLE IF NOT EXISTS,
    então é seguro rodar toda vez que o container sobe) e o executa.
    """
    # Caminho do schema relativo a este arquivo (funciona em qualquer diretório).
    caminho_sql = os.path.join(os.path.dirname(__file__), "schema_pg.sql")
    with open(caminho_sql, "r", encoding="utf-8") as f:
        sql = f.read()

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
    log.info("Tabela scheduler_runs garantida (criada se não existia).")


def _listar_jobs() -> None:
    """Imprime a lista de jobs registrados e seus gatilhos."""
    print("Jobs registrados:")
    for job in JOBS:
        print(f"  • {job.name:20s} {job.description}")
        print(f"    {' ' * 20} quando: {job.trigger}")


def _rodar_um_job(nome: str) -> int:
    """Roda um único job imediatamente (modo --run) e retorna o código de saída.

    Args:
        nome: Nome do job a executar (deve existir na lista JOBS).

    Returns:
        0 se o job foi encontrado e executado, 1 se o nome não existe.
    """
    # Procura o job pelo nome na lista de registrados.
    job = next((j for j in JOBS if j.name == nome), None)
    if job is None:
        nomes = ", ".join(j.name for j in JOBS)
        print(f"ERRO: job '{nome}' não existe. Disponíveis: {nomes}", file=sys.stderr)
        return 1

    # Executa passando pela mesma casca de log/alerta do modo agendado.
    execute_with_logging(job)
    return 0


def main() -> int:
    """Faz o parse dos argumentos e inicia o agendador (ou roda um job à mão).

    Returns:
        Código de saída do processo (0 = ok).
    """
    # Garante que a saída seja UTF-8. O console do Windows usa cp1252 por padrão,
    # que quebra ao imprimir símbolos como "•" e "→" (no container Linux já é UTF-8).
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
        except (AttributeError, ValueError):
            # Streams que não suportam reconfigure (ex.: redirecionados) — ignora.
            pass

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s %(message)s",
    )

    parser = argparse.ArgumentParser(
        description="Agendador de jobs recorrentes da Makima."
    )
    parser.add_argument(
        "--run",
        metavar="JOB",
        help="Roda um job imediatamente e sai (ex.: --run backup_postgres).",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="Lista os jobs registrados e sai.",
    )
    args = parser.parse_args()

    # Modo --list: só mostra os jobs e sai, sem tocar no banco.
    if args.list:
        _listar_jobs()
        return 0

    # Garante que a tabela de log existe antes de qualquer execução.
    _garantir_schema()

    # Modo --run: roda um job na hora e sai.
    if args.run:
        return _rodar_um_job(args.run)

    # Modo normal: monta o agendador e fica ligado.
    scheduler = BlockingScheduler(timezone=TZ)
    for job in JOBS:
        # add_job registra o job no agendador. Opções importantes:
        #   coalesce=True       → se perdeu vários disparos (ex.: container caiu),
        #                         roda só UMA vez ao voltar, não N vezes.
        #   max_instances=1     → nunca roda duas cópias do mesmo job ao mesmo tempo.
        #   misfire_grace_time  → tolera até 1h de atraso antes de "desistir" de
        #                         um disparo perdido.
        scheduler.add_job(
            execute_with_logging,
            trigger=job.trigger,
            args=[job],
            id=job.name,
            name=job.name,
            coalesce=True,
            max_instances=1,
            misfire_grace_time=3600,
        )

    # Loga um resumo com o próximo horário de cada job, para conferência no boot.
    log.info("Agendador iniciado com %d job(s):", len(JOBS))
    for job in scheduler.get_jobs():
        log.info("  • %-20s próximo disparo: %s", job.id, job.next_run_time)

    try:
        # .start() bloqueia o processo aqui e passa a disparar os jobs nos horários.
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        # Encerramento limpo ao receber Ctrl+C ou sinal de parada do container.
        log.info("Agendador encerrado.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
