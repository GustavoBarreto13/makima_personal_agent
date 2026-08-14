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
from scheduler.jobs import (
    run_backup, run_kurisu_sync, run_letterboxd, run_lucy_digest, run_weekly_review_reminder,
    run_recurring_charges, run_budget_alert, run_monthly_report, run_marin_mal_sync,
    run_kaguya_due_reminders,
)

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


def weekly_at(day_of_week: str, hour: int, minute: int = 0) -> CronTrigger:
    """Cria um gatilho que dispara uma vez por semana, num dia e horário fixos (fuso São Paulo).

    Args:
        day_of_week: Dia da semana no formato do APScheduler — "mon".."sun" (ex.: "sun").
        hour: Hora do dia (0–23).
        minute: Minuto da hora (0–59). Padrão 0.

    Returns:
        Um CronTrigger configurado para o dia/horário/fuso corretos.

    Example:
        >>> t = weekly_at("sun", 20, 0)  # todo domingo às 20:00 (fuso São Paulo)
    """
    # timezone=TZ garante que o horário seja o de São Paulo, não o do servidor.
    return CronTrigger(day_of_week=day_of_week, hour=hour, minute=minute, timezone=TZ)


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
    # Digest matinal de emails (Lucy) → Telegram + histórico em lucy_emails.
    # 08:00 (America/Sao_Paulo) — spec 032.
    ScheduledJob(
        name="lucy_digest",
        func=run_lucy_digest,
        trigger=daily_at(8, 0),
        description="Digest diário de emails (Lucy) → Telegram",
    ),
    # Lembrete da revisão semanal do GTD (Kaguya) — só dispara se a semana terminar sem
    # nenhuma revisão concluída (spec 035, US3). Domingo 20:00 (America/Sao_Paulo).
    ScheduledJob(
        name="weekly_review_reminder",
        func=run_weekly_review_reminder,
        trigger=weekly_at("sun", 20, 0),
        description="Lembrete de revisão semanal (Kaguya) → Telegram, se a semana ficou sem revisão",
    ),
    # Cobranças recorrentes (Nami) — avisa D-3, lança assinaturas/contas fixas automáticas
    # no vencimento (rola next_billing), avisa contas fixas manuais para confirmar o valor.
    # 08:30 (America/Sao_Paulo) — spec 048, US1+US2.
    ScheduledJob(
        name="recurring_charges",
        func=run_recurring_charges,
        trigger=daily_at(8, 30),
        description="Cobranças recorrentes (Nami): avisa D-3, lança automáticas, pede confirmação de contas fixas",
    ),
    # Alerta de orçamento (Nami) — categorias ≥90% do limite ou estouradas.
    # 09:00 (America/Sao_Paulo) — spec 048, US3.
    ScheduledJob(
        name="budget_alert",
        func=run_budget_alert,
        trigger=daily_at(9, 0),
        description="Alerta de orçamento (Nami) → Telegram, categorias ≥90% ou estouradas",
    ),
    # Relatório mensal do fechamento (Nami) — todo dia 1º, mês anterior.
    # 08:00 (America/Sao_Paulo) — spec 048, US4.
    ScheduledJob(
        name="monthly_report",
        func=run_monthly_report,
        trigger=CronTrigger(day=1, hour=8, minute=0, timezone=TZ),
        description="Relatório mensal do fechamento (Nami) → Telegram, todo dia 1º",
    ),
    # Sincronização delta com o MyAnimeList (Marin) — espelho bidirecional.
    # Mesmo intervalo do sync do Letterboxd (Akane) — a cada 6h — spec 053, US3.
    ScheduledJob(
        name="marin_mal_sync",
        func=run_marin_mal_sync,
        trigger=every(hours=6),
        description="Sync delta com o MyAnimeList (Marin): pull cria sessões de ajuste, coexiste com o push best-effort das mutações locais",
    ),
    # Lembrete periódico de tarefas com vencimento (Kaguya) — nunca existiu notificação
    # de tarefa nenhuma antes disso. A cada 4h; silencioso se não há nada vencido/hoje.
    # spec 064, User Story 5 (FR-012) — envia via scheduler/notify_channels.py.
    ScheduledJob(
        name="kaguya_due_reminders",
        func=run_kaguya_due_reminders,
        trigger=every(hours=4),
        description="Lembrete de tarefas vencidas/de hoje (Kaguya) → canais configurados, a cada 4h",
    ),
]
