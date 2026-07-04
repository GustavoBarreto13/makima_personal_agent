"""Registro declarativo dos jobs agendados.

Este é o coração do padrão: a lista `JOBS` diz QUAIS scripts rodam e QUANDO.
Para adicionar um job novo, basta acrescentar UMA linha na lista `JOBS` no fim
deste arquivo (depois de criar o wrapper correspondente em `jobs.py`).

Cada job tem:
    - um nome curto e único (usado no log e na tabela scheduler_runs);
    - uma função que faz o trabalho (definida em jobs.py);
    - um "trigger" que diz quando rodar — use os helpers `daily_at()` (todo dia
      num horário) ou `every()` (de X em X tempo);
    - uma descrição de uma linha (aparece no log de startup).
"""

from dataclasses import dataclass, field
from typing import Callable
from zoneinfo import ZoneInfo

# Os "triggers" (gatilhos) do APScheduler dizem em que momentos o job dispara.
# CronTrigger = horário fixo do relógio (ex.: todo dia 03:00).
# IntervalTrigger = intervalo fixo (ex.: a cada 6 horas).
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

# Importa as funções que fazem o trabalho de cada job.
from scheduler.jobs import run_backup, run_kurisu_sync, run_letterboxd

# Fuso horário do usuário. Todos os horários dos jobs são interpretados nele —
# "03:00" quer dizer 03:00 em São Paulo, não 03:00 UTC (regra do CLAUDE.md).
TZ = ZoneInfo("America/Sao_Paulo")


@dataclass(frozen=True)
class ScheduledJob:
    """Descreve um job agendado: o que rodar e quando.

    Attributes:
        name: Identificador curto e único (ex.: "backup_postgres"). Vai para o
            log e para a coluna job_name da tabela scheduler_runs.
        func: Função sem argumentos que executa o trabalho. Deve LEVANTAR uma
            exceção se falhar — o runner captura, registra 'error' e alerta.
        trigger: Gatilho do APScheduler (use daily_at() ou every()).
        description: Frase curta explicando o job (aparece no log de startup).
    """

    name: str
    func: Callable[[], None]
    # O tipo real é um trigger do APScheduler; usamos `object` para não amarrar.
    trigger: object
    description: str = field(default="")


def daily_at(hour: int, minute: int = 0) -> CronTrigger:
    """Cria um gatilho que dispara todo dia num horário fixo (fuso São Paulo).

    Args:
        hour: Hora do dia (0–23) em que o job deve rodar.
        minute: Minuto da hora (0–59). Padrão 0.

    Returns:
        Um CronTrigger configurado para o horário e fuso corretos.

    Example:
        >>> t = daily_at(3, 30)  # todo dia às 03:30 (BRT)
    """
    # timezone=TZ garante que o horário seja o de São Paulo, não o do servidor.
    return CronTrigger(hour=hour, minute=minute, timezone=TZ)


def every(hours: int = 0, minutes: int = 0) -> IntervalTrigger:
    """Cria um gatilho que dispara de X em X tempo.

    Args:
        hours: Quantidade de horas entre execuções.
        minutes: Quantidade de minutos entre execuções (soma com `hours`).

    Returns:
        Um IntervalTrigger com o intervalo pedido.

    Example:
        >>> t = every(hours=6)      # a cada 6 horas
        >>> t = every(minutes=30)   # a cada 30 minutos
    """
    # timezone=TZ mantém a contagem de intervalo ancorada no fuso local.
    return IntervalTrigger(hours=hours, minutes=minutes, timezone=TZ)


# ─────────────────────────────────────────────────────────────────────────────
# LISTA DE JOBS — edite AQUI para adicionar/remover jobs agendados.
# ─────────────────────────────────────────────────────────────────────────────
JOBS: list[ScheduledJob] = [
    # Backup do PostgreSQL (pg_dump → Google Cloud Storage). Todo dia às 03:00.
    ScheduledJob(
        name="backup_postgres",
        func=run_backup,
        trigger=daily_at(3, 0),
        description="pg_dump do PostgreSQL → Google Cloud Storage",
    ),
    # Sync da memória unificada da Kurisu (Postgres → corpus Vertex AI RAG).
    # Roda 1h depois do backup para não competirem por recursos ao mesmo tempo.
    ScheduledJob(
        name="sync_kurisu",
        func=run_kurisu_sync,
        trigger=daily_at(4, 0),
        description="Sync da memória da Kurisu (Postgres → Vertex RAG)",
    ),
    # Sync do diário do Letterboxd (RSS → catálogo de filmes da Akane).
    # Exemplo de gatilho por INTERVALO: roda a cada 6 horas.
    ScheduledJob(
        name="sync_letterboxd",
        func=run_letterboxd,
        trigger=every(hours=6),
        description="Sync do Letterboxd (RSS → catálogo da Akane)",
    ),
]
