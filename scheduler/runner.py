"""Executa um job com observabilidade: cronometra, grava no banco e alerta.

Este módulo é a "casca" em volta de cada job. Ele:
    1. grava uma linha em scheduler_runs marcando o início (status 'running');
    2. roda a função do job;
    3. atualiza a linha com o resultado ('success' ou 'error'), a duração e,
       se deu erro, o traceback;
    4. dispara um alerta no Telegram quando o job falha.

Assim, todo job passa pelo mesmo caminho — ganham log e alerta "de graça",
sem cada script precisar se preocupar com isso.
"""

import logging
import time
import traceback

# Reutiliza a camada de conexão PostgreSQL compartilhada do projeto.
from agents.db import get_conn
from scheduler.notify import send_telegram_alert

# Import só para tipagem/legibilidade (evita import circular: registry importa
# jobs, não runner). Usamos a anotação como string para não exigir o import.
log = logging.getLogger("scheduler.runner")


def _registrar_inicio(job_name: str) -> int:
    """Insere a linha inicial da execução e devolve o id gerado.

    Args:
        job_name: Nome do job que está começando.

    Returns:
        O id (chave primária) da linha criada em scheduler_runs, usado depois
        para atualizar o resultado.
    """
    # get_conn faz commit automático ao sair do bloco `with` sem erro.
    with get_conn() as conn:
        with conn.cursor() as cur:
            # status usa o DEFAULT 'running' e started_at usa o DEFAULT NOW().
            # RETURNING id devolve o id recém-criado sem uma segunda query.
            cur.execute(
                "INSERT INTO scheduler_runs (job_name) VALUES (%(n)s) RETURNING id",
                {"n": job_name},
            )
            return cur.fetchone()[0]


def _registrar_fim(run_id: int, status: str, error: str | None, duration_ms: int) -> None:
    """Atualiza a linha da execução com o resultado final.

    Args:
        run_id: id da linha em scheduler_runs (retornado por _registrar_inicio).
        status: 'success' ou 'error'.
        error: Traceback do erro (quando status='error') ou None.
        duration_ms: Duração da execução em milissegundos.
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            # finished_at = NOW() marca o instante do término (fuso absoluto).
            cur.execute(
                """
                UPDATE scheduler_runs
                   SET finished_at = NOW(),
                       status      = %(status)s,
                       error       = %(error)s,
                       duration_ms = %(dur)s
                 WHERE id = %(id)s
                """,
                {"status": status, "error": error, "dur": duration_ms, "id": run_id},
            )


# Jobs "quiet_success" (a cada minuto): último alerta enviado por job, para limitar o spam.
_ULTIMO_ALERTA: dict[str, float] = {}
_INTERVALO_ALERTA_QUIET_S = 30 * 60


def _registrar_erro_direto(job_name: str, error: str, duration_ms: int) -> None:
    """Grava de uma vez só a linha de uma execução QUE FALHOU (jobs quiet_success não gravam o início)."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO scheduler_runs (job_name, finished_at, status, error, duration_ms)
                VALUES (%(n)s, NOW(), 'error', %(e)s, %(d)s)
                """,
                {"n": job_name, "e": error, "d": duration_ms},
            )


def _pode_alertar_quiet(job_name: str) -> bool:
    """Um job quiet_success alerta no máximo a cada 30 min (falha repetida = um aviso, não 1 por minuto)."""
    agora = time.monotonic()
    ultimo = _ULTIMO_ALERTA.get(job_name)
    if ultimo is not None and agora - ultimo < _INTERVALO_ALERTA_QUIET_S:
        return False
    _ULTIMO_ALERTA[job_name] = agora
    return True


def execute_with_logging(job) -> None:
    """Roda um ScheduledJob registrando início/fim e alertando em falha.

    É esta função que o APScheduler chama no horário de cada job. Ela nunca
    deixa uma exceção "vazar" para o agendador — captura tudo, registra e
    (se for erro) alerta —, para que uma falha num job não afete os outros.

    Args:
        job: Um ScheduledJob (de registry.py) com .name e .func.
    """
    quiet = getattr(job, "quiet_success", False)
    (log.debug if quiet else log.info)(f"▶ Iniciando job '{job.name}'")

    # Tenta registrar o início no banco. Se o próprio banco estiver fora, ainda
    # assim rodamos o job (com run_id=None) para não perder a execução.
    run_id = None
    if not quiet:  # jobs quiet_success só gravam quando falham (ver abaixo)
        try:
            run_id = _registrar_inicio(job.name)
        except Exception:
            log.exception(f"Não consegui gravar o início do job '{job.name}' no banco.")

    # Marca o tempo de início com um relógio monotônico (imune a ajustes de hora).
    inicio = time.monotonic()
    status = "success"
    erro_texto: str | None = None

    try:
        # AQUI o trabalho de fato acontece.
        job.func()
    except BaseException as exc:  # noqa: BLE001 - queremos capturar até SystemExit
        # BaseException (e não só Exception) para pegar também SystemExit, caso
        # algum job chame sys.exit. Registramos como erro e seguimos.
        status = "error"
        erro_texto = traceback.format_exc()
        log.error(f"✖ Job '{job.name}' falhou:\n{erro_texto}")

    # Calcula quanto tempo levou, em milissegundos.
    duration_ms = int((time.monotonic() - inicio) * 1000)

    # Atualiza a linha no banco com o resultado (se conseguimos criá-la).
    if run_id is not None:
        try:
            _registrar_fim(run_id, status, erro_texto, duration_ms)
        except Exception:
            log.exception(f"Não consegui gravar o fim do job '{job.name}' no banco.")

    if quiet and status == "error":
        try:
            _registrar_erro_direto(job.name, erro_texto or "(sem detalhes)", duration_ms)
        except Exception:
            log.exception(f"Não consegui gravar a falha do job '{job.name}' no banco.")

    # Em caso de erro, avisa no Telegram (melhor esforço — nunca levanta).
    if status == "error" and (not quiet or _pode_alertar_quiet(job.name)):
        send_telegram_alert(job.name, erro_texto or "(sem detalhes)")

    (log.debug if quiet and status == "success" else log.info)(
        f"■ Job '{job.name}' terminou: {status} em {duration_ms} ms"
    )
