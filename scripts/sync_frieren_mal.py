"""Sincronizar os mangás da Frieren com a lista de mangás do MyAnimeList (pull manual).

Serve para a PRIMEIRA importação e para corrigir inconsistências; no dia a dia o job
`frieren_mal_sync` do scheduler faz o delta a cada 6h. O envio Frieren → MyAnimeList é automático
a cada leitura/status/nota registrados e não passa por aqui.

Dry-run por padrão: lista quantos livros seriam criados/atualizados e os primeiros títulos novos,
sem gravar nada e sem avançar o ponto de corte do delta.

Usage:
    python -m scripts.sync_frieren_mal --full            # dry-run da lista inteira
    python -m scripts.sync_frieren_mal --full --apply    # importa de verdade
    python -m scripts.sync_frieren_mal --apply           # só o que mudou desde o último sync

No VPS, rodar de dentro do container (o host do banco não resolve fora do Swarm):
    docker exec makima-web sh -c "cd /app && python -m scripts.sync_frieren_mal --full"
"""

import argparse
import json

from agents.frieren.mal_sync import sync_manga_mal


def main(full: bool = False, apply: bool = False) -> dict:
    """Rodar o sync de mangás.

    Args:
        full: Processar a lista inteira (ignora o ponto de corte do delta).
        apply: False = dry-run (só relata); True = grava.

    Returns:
        O resumo devolvido por `sync_manga_mal`.
    """
    return sync_manga_mal(full=full, dry_run=not apply)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--full", action="store_true", help="processa a lista inteira (padrão: só o que mudou)")
    parser.add_argument("--apply", action="store_true", help="grava no banco (padrão: dry-run)")
    args = parser.parse_args()
    resumo = main(full=args.full, apply=args.apply)
    print(json.dumps(resumo, ensure_ascii=False, indent=2, default=str))
    if not args.apply:
        print("Dry-run: nada foi gravado. Rode com --apply para importar.")
