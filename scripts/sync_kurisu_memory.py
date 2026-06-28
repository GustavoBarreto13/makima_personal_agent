"""Entrypoint do job de sync da memória unificada da Kurisu (spec 028).

Job agendado (padrão do `backup_postgres.py`) que chama
`agents.kurisu.memory.sync.run_sync`. Roda **onde o `DATABASE_URL` resolve** — dentro do
container `makima-web` / Docker Swarm (não na shell do host).

Uso:
    python -m scripts.sync_kurisu_memory                  # todos os domínios registrados
    python -m scripts.sync_kurisu_memory --domain diario  # só um domínio
    python -m scripts.sync_kurisu_memory --dry-run        # só relata o que faria

Variáveis de ambiente necessárias:
    DATABASE_URL, GCP_CREDENTIALS_JSON, GCP_PROJECT_ID, VERTEX_RAG_CORPUS_OPERACIONAL
    (este último é criado/garantido automaticamente na 1ª execução).
"""

import argparse
import logging
import sys

from agents.kurisu.memory.sync import EXPORTERS, run_sync


def main() -> int:
    """Faz o parse dos argumentos e dispara o ciclo de sync.

    Returns:
        Código de saída do processo (0 = sucesso).
    """
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(
        description="Sincroniza a memória operacional da Kurisu (Postgres → corpus Vertex)."
    )
    parser.add_argument("--domain", help="Sincroniza só este domínio (default: todos).")
    parser.add_argument(
        "--dry-run", action="store_true", help="Só relata o que faria, sem escrever."
    )
    args = parser.parse_args()

    # Valida o domínio cedo (mensagem clara em vez de pular silenciosamente).
    if args.domain and args.domain not in EXPORTERS:
        print(
            f"ERRO: domínio desconhecido '{args.domain}'. "
            f"Conhecidos: {list(EXPORTERS)}",
            file=sys.stderr,
        )
        return 1

    domains = [args.domain] if args.domain else None
    resumos = run_sync(domains=domains, dry_run=args.dry_run)

    print("\nResumo do sync:")
    for r in resumos:
        print(f"  {r}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
