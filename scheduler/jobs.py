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
