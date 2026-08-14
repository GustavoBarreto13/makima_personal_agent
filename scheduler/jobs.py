"""Funções que executam cada job — cada uma embrulha um script existente.

Regra de ouro: cada função aqui deve **levantar uma exceção** se o trabalho
falhar. O runner (`runner.py`) captura essa exceção, marca a execução como
'error' na tabela scheduler_runs e dispara o alerta no Telegram. Se a função
retornar sem levantar, o runner considera 'success'.

Não colocamos lógica de negócio aqui — só a "cola" que chama o código que já
existe em `scripts/` e `agents/`.
"""

import subprocess
import sys


def run_backup() -> None:
    """Executa o backup do PostgreSQL (pg_dump → Google Cloud Storage).

    Roda o script `scripts/backup_postgres.py` num subprocesso separado.
    Fazemos isso (em vez de importar a função) porque o script chama
    `sys.exit(1)` quando o pg_dump falha; rodar como subprocesso transforma essa
    saída de erro num código de retorno ≠ 0, que o `check=True` converte numa
    exceção — exatamente o que o runner precisa para detectar a falha.

    Raises:
        RuntimeError: Se o backup falhar (código de saída ≠ 0). A mensagem
            inclui o stderr do processo para facilitar o diagnóstico e o alerta.
    """
    # sys.executable = o mesmo Python que está rodando este processo.
    # "-m scripts.backup_postgres" executa o script como módulo (imports certos).
    resultado = subprocess.run(
        [sys.executable, "-m", "scripts.backup_postgres"],
        capture_output=True,  # captura stdout e stderr para logar/alertar
        text=True,            # decodifica a saída como texto (str), não bytes
    )

    # Mostra a saída do backup no log do scheduler (útil para acompanhar).
    if resultado.stdout:
        print(resultado.stdout, end="")

    # Código de saída ≠ 0 significa que o backup falhou — levanta com o stderr.
    if resultado.returncode != 0:
        raise RuntimeError(
            f"backup_postgres saiu com código {resultado.returncode}.\n"
            f"stderr:\n{resultado.stderr}"
        )


def run_kurisu_sync() -> None:
    """Executa o sync da memória unificada da Kurisu (Postgres → Vertex RAG).

    Chama diretamente a função `run_sync()` do módulo de sync da Kurisu — ela já
    é importável e levanta exceção se algo der errado, então não precisamos de
    subprocesso aqui.

    Raises:
        Exception: Qualquer erro levantado por `run_sync()` (ex.: falha de
            conexão com o Vertex AI ou com o banco).
    """
    # Import feito dentro da função (lazy) para não carregar as dependências
    # pesadas do Vertex AI quando o scheduler só está listando os jobs.
    from agents.kurisu.memory.sync import run_sync

    # Sincroniza todos os domínios registrados (domains=None) de verdade
    # (dry_run=False). run_sync retorna uma lista de resumos que apenas logamos.
    resumos = run_sync(domains=None, dry_run=False)
    for resumo in resumos:
        print(f"[kurisu-sync] {resumo}")


def run_letterboxd() -> None:
    """Executa o sync do diário do Letterboxd (RSS → catálogo da Akane).

    Chama `run_sync()` do script do Letterboxd. Atenção: esse script NÃO levanta
    exceção em caso de erro — ele retorna um dicionário com um contador
    `errors`. Por isso, checamos esse contador aqui e levantamos se for > 0, para
    que o runner registre a falha e alerte.

    Raises:
        RuntimeError: Se o sync reportar uma ou mais entradas com erro.
    """
    # Import lazy — só carrega o código da Akane quando este job realmente roda.
    from scripts.sync_letterboxd import run_sync

    # enrich_tmdb=True busca metadados extras no TMDB (com fallback gracioso).
    resultado = run_sync(enrich_tmdb=True)
    print(
        f"[letterboxd] criados: {resultado['created']}, "
        f"atualizados: {resultado['updated']}, pulados: {resultado['skipped']}, "
        f"erros: {resultado['errors']}"
    )

    # O script conta erros em vez de levantar; convertemos num erro de verdade
    # para que o scheduler saiba que algo deu errado.
    if resultado["errors"] > 0:
        raise RuntimeError(
            f"sync_letterboxd terminou com {resultado['errors']} erro(s) — "
            f"ver o log acima para detalhes."
        )


def run_weekly_review_reminder() -> None:
    """Executa o lembrete de domingo da revisão semanal do GTD (Kaguya) → Telegram.

    Roda `scripts/send_weekly_review_reminder.py` num subprocesso separado (mesmo motivo do
    backup/digest: o script usa `sys.exit(1)` em falha estrutural, e rodar como subprocesso
    transforma essa saída de erro num código de retorno que o runner detecta). Não enviar
    (revisão já concluída na semana) é sucesso, não falha — o script sai com 0 nesse caso.

    Raises:
        RuntimeError: Se o job falhar (código de saída ≠ 0). A mensagem inclui o stderr do
            processo para facilitar o diagnóstico e o alerta.
    """
    resultado = subprocess.run(
        [sys.executable, "-m", "scripts.send_weekly_review_reminder"],
        capture_output=True,
        text=True,
    )

    if resultado.stdout:
        print(resultado.stdout, end="")

    if resultado.returncode != 0:
        raise RuntimeError(
            f"send_weekly_review_reminder saiu com código {resultado.returncode}.\n"
            f"stderr:\n{resultado.stderr}"
        )


def run_recurring_charges() -> None:
    """Executa o job diário de cobranças recorrentes (Nami) — spec 048, US1+US2.

    Roda `scripts/process_recurring_charges.py` num subprocesso separado (mesmo
    motivo dos demais: o script usa `sys.exit(1)` em falha, e rodar como
    subprocesso transforma isso num código de retorno que o runner detecta).

    Raises:
        RuntimeError: Se o job falhar (código de saída ≠ 0 — inclui erros de
            lançamento individuais, que o script já conta e propaga).
    """
    resultado = subprocess.run(
        [sys.executable, "-m", "scripts.process_recurring_charges"],
        capture_output=True,
        text=True,
    )

    if resultado.stdout:
        print(resultado.stdout, end="")

    if resultado.returncode != 0:
        raise RuntimeError(
            f"process_recurring_charges saiu com código {resultado.returncode}.\n"
            f"stderr:\n{resultado.stderr}"
        )


def run_budget_alert() -> None:
    """Executa o alerta diário de orçamento (Nami) — spec 048, US3.

    Roda `scripts/send_budget_alert.py` num subprocesso separado. Não enviar
    (tudo dentro do limite) é sucesso, não falha — o script sai com 0 nesse caso.

    Raises:
        RuntimeError: Se o job falhar (código de saída ≠ 0).
    """
    resultado = subprocess.run(
        [sys.executable, "-m", "scripts.send_budget_alert"],
        capture_output=True,
        text=True,
    )

    if resultado.stdout:
        print(resultado.stdout, end="")

    if resultado.returncode != 0:
        raise RuntimeError(
            f"send_budget_alert saiu com código {resultado.returncode}.\n"
            f"stderr:\n{resultado.stderr}"
        )


def run_monthly_report() -> None:
    """Executa o relatório mensal do fechamento (Nami) — spec 048, US4.

    Roda `scripts/send_monthly_report.py` num subprocesso separado.

    Raises:
        RuntimeError: Se o job falhar (código de saída ≠ 0).
    """
    resultado = subprocess.run(
        [sys.executable, "-m", "scripts.send_monthly_report"],
        capture_output=True,
        text=True,
    )

    if resultado.stdout:
        print(resultado.stdout, end="")

    if resultado.returncode != 0:
        raise RuntimeError(
            f"send_monthly_report saiu com código {resultado.returncode}.\n"
            f"stderr:\n{resultado.stderr}"
        )


def run_marin_mal_sync() -> None:
    """Executa a sincronização delta com o MyAnimeList (Marin) — spec 053, US3.

    Chama `sync_mal()` diretamente (já é uma função Python pura, sem
    necessidade de subprocesso). Mesmo motivo do `run_letterboxd`: o retorno
    conta erros em `errors` em vez de levantar — convertemos aqui para que o
    runner detecte a falha e alerte no Telegram.

    Raises:
        RuntimeError: Se o sync reportar uma ou mais entradas com erro.
    """
    # Import lazy — só carrega o código da Marin quando este job realmente roda.
    from agents.marin.mal_sync import sync_mal

    resultado = sync_mal(full=False)
    print(
        f"[marin-mal-sync] buscados: {resultado['mal_entries_fetched']}, "
        f"criados: {resultado['created']}, atualizados: {resultado['updated']}, "
        f"pulados: {resultado['skipped']}, erros: {len(resultado['errors'])}"
    )

    if resultado["errors"]:
        raise RuntimeError(
            f"sync_mal (Marin) terminou com {len(resultado['errors'])} erro(s) — "
            f"ver o log acima para detalhes."
        )


def run_kaguya_due_reminders() -> None:
    """Executa o lembrete periódico de tarefas com vencimento (Kaguya) — spec 064 US5.

    Roda `scripts/send_kaguya_due_reminders.py` num subprocesso separado (mesmo motivo dos
    demais: o script usa `sys.exit(1)` em falha, e rodar como subprocesso transforma isso
    num código de retorno que o runner detecta). Não enviar (nada vencido nem para hoje) é
    sucesso, não falha — o script sai com 0 nesse caso.

    Raises:
        RuntimeError: Se o job falhar (código de saída ≠ 0). A mensagem inclui o stderr do
            processo para facilitar o diagnóstico e o alerta.
    """
    resultado = subprocess.run(
        [sys.executable, "-m", "scripts.send_kaguya_due_reminders"],
        capture_output=True,
        text=True,
    )

    if resultado.stdout:
        print(resultado.stdout, end="")

    if resultado.returncode != 0:
        raise RuntimeError(
            f"send_kaguya_due_reminders saiu com código {resultado.returncode}.\n"
            f"stderr:\n{resultado.stderr}"
        )


def run_lucy_digest() -> None:
    """Executa o digest diário de emails (Lucy) → Telegram + histórico.

    Roda `scripts/send_lucy_digest.py` num subprocesso separado (mesmo motivo do
    backup: o script usa `sys.exit(1)` em falha estrutural, e rodar como
    subprocesso transforma isso num código de retorno que o runner detecta).

    Raises:
        RuntimeError: Se o digest falhar (código de saída ≠ 0). A mensagem
            inclui o stderr do processo para facilitar o diagnóstico e o alerta.
    """
    resultado = subprocess.run(
        [sys.executable, "-m", "scripts.send_lucy_digest"],
        capture_output=True,
        text=True,
    )

    if resultado.stdout:
        print(resultado.stdout, end="")

    if resultado.returncode != 0:
        raise RuntimeError(
            f"send_lucy_digest saiu com código {resultado.returncode}.\n"
            f"stderr:\n{resultado.stderr}"
        )
