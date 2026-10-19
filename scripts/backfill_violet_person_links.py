"""Vincular retroativamente as @menções antigas do diário às pessoas da Komi.

Até a spec 076 o ``@Carla`` do diário era texto puro: só os bullets escritos depois do vínculo
sincronizado têm ``person_id`` em ``journal_mentions`` e linha em ``person_links``. Este script
passa por TODOS os bullets com menção de pessoa ainda sem ``person_id`` e, quando o nome casa com
UMA só pessoa viva da Komi (Nome, Apelido, Nome completo ou outra forma — ``find_people_exact``):

  - grava o ``person_id`` na menção; e
  - cria o vínculo ``journal_bullet`` em ``person_links`` (só acrescenta, nunca remove).

Nome que não casa com ninguém, ou casa com mais de uma pessoa, NÃO é mexido: sai no relatório
(o dono cadastra a pessoa ou escolhe quem é, e roda de novo — é idempotente).

Dry-run por padrão. No VPS, de dentro do container:
    docker exec makima-web sh -c "cd /app && python -m scripts.backfill_violet_person_links"
    docker exec makima-web sh -c "cd /app && python -m scripts.backfill_violet_person_links --apply"
"""

from __future__ import annotations

import argparse
from collections import Counter

from agents.db import get_conn
from agents.komi.integration import link_people
from agents.komi.tools import find_people_exact


def run(apply: bool) -> int:
    """Montar o plano (e gravar, se ``apply``) e imprimir o relatório.

    Args:
        apply: ``True`` grava; ``False`` só mostra o que seria feito.

    Returns:
        Quantidade de menções resolvidas (ou que seriam).
    """
    # get_conn() é um context manager: confirma ao sair sem erro (no dry-run nada é escrito).
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT id, bullet_id, value FROM journal_mentions WHERE kind = 'person' AND person_id IS NULL")
        pendentes = [(l["id"], l["bullet_id"], l["value"]) if hasattr(l, "keys") else tuple(l[:3]) for l in cur.fetchall()]

        resolvido: dict[str, str | None] = {}   # nome citado → person_id (None = não resolve)
        motivo: dict[str, str] = {}
        for _mid, _bid, nome in pendentes:
            if nome in resolvido:
                continue
            achados = find_people_exact(nome)
            resolvido[nome] = str(achados[0]["id"]) if len(achados) == 1 else None
            if len(achados) != 1:
                motivo[nome] = "nenhuma pessoa com esse nome" if not achados else f"{len(achados)} pessoas com esse nome"

        plano = [(mid, bid, resolvido[nome]) for mid, bid, nome in pendentes if resolvido[nome]]
        contagem = Counter(nome for _m, _b, nome in pendentes)
        print(f"{len(pendentes)} menções sem pessoa; {len(plano)} resolvíveis em {len({b for _m, b, _p in plano})} bullets.")
        for nome, pid in sorted(resolvido.items()):
            if pid:
                print(f"  ✔ @{nome} → {pid[:8]}… ({contagem[nome]} menções)")
        for nome, porque in sorted(motivo.items()):
            print(f"  ! @{nome}: {contagem[nome]} menção(ões) ficam como estão ({porque})")

        if apply:
            for mid, bullet_id, pid in plano:
                cur.execute("UPDATE journal_mentions SET person_id = %s WHERE id = %s", (pid, mid))
                link_people(cur, "journal_bullet", bullet_id, [pid])
            print("Gravado.")
        else:
            print("Dry-run: nada foi alterado. Rode com --apply para gravar.")
        return len(plano)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--apply", action="store_true", help="grava (padrão: só mostra)")
    run(ap.parse_args().apply)
