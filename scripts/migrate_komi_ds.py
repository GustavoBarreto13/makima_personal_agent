"""Migrar os DADOS da Komi para a spec 077 (Komi no Design System).

O schema novo (colunas e tabelas) é criado sozinho por ``agents.komi.schema.ensure_schema``
— este script converte os dados ANTIGOS para o modelo novo, em etapas, cada uma
registrada em ``komi_migrations`` para nunca rodar duas vezes (senão desfaria uma
escolha que o dono fez depois).

Etapas:
  1. ``context_from_category``  — pessoas da categoria "trabalho" passam a ter espaço ``work``.
  2. ``nickname_from_alias``    — o 1º apelido de cada pessoa vira o campo Apelido; os demais
                                  continuam em ``person_aliases`` ("outras formas de chamar").
  3. ``notes_to_person_notes``  — o texto livre de ``people.notes`` vira uma anotação da pessoa
                                  (a coluna antiga fica intacta, como backup).

Dry-run por padrão: monta o plano e imprime o que seria feito, sem gravar nada (nem o
schema novo). Com ``--apply``, aplica o schema e executa as etapas numa só transação.

Usage:
    python -m scripts.migrate_komi_ds            # dry-run
    python -m scripts.migrate_komi_ds --apply    # grava

No VPS, rodar de dentro do container (o host do banco não resolve fora do Swarm):
    docker exec makima-web sh -c "cd /app && python -m scripts.migrate_komi_ds"
    docker exec makima-web sh -c "cd /app && python -m scripts.migrate_komi_ds --apply"
"""

from __future__ import annotations

import argparse
import sys
from typing import Callable

from agents.db import get_conn
from agents.komi import naming
from agents.komi.schema import ensure_schema

# Quantos exemplos mostrar por etapa no relatório (o plano completo fica no retorno).
_AMOSTRA = 8


def _tabela_existe(cur, nome: str) -> bool:
    """Dizer se uma tabela existe no banco.

    Args:
        cur: Cursor psycopg2 ativo.
        nome: Nome da tabela (schema ``public``).

    Returns:
        ``True`` se a tabela existe.
    """
    cur.execute("SELECT to_regclass(%s) IS NOT NULL", (f"public.{nome}",))
    return bool(cur.fetchone()[0])


def _coluna_existe(cur, tabela: str, coluna: str) -> bool:
    """Dizer se uma coluna existe numa tabela.

    Args:
        cur: Cursor psycopg2 ativo.
        tabela: Nome da tabela.
        coluna: Nome da coluna.

    Returns:
        ``True`` se a coluna existe.
    """
    cur.execute(
        "SELECT 1 FROM information_schema.columns WHERE table_name = %s AND column_name = %s",
        (tabela, coluna),
    )
    return cur.fetchone() is not None


def _ja_aplicada(cur, etapa: str) -> bool:
    """Dizer se uma etapa já foi aplicada (consulta ``komi_migrations``).

    Antes do schema novo a tabela de marcação nem existe — então nada foi aplicado.

    Args:
        cur: Cursor psycopg2 ativo.
        etapa: Nome da etapa.

    Returns:
        ``True`` se a etapa já foi registrada como aplicada.
    """
    if not _tabela_existe(cur, "komi_migrations"):
        return False
    cur.execute("SELECT 1 FROM komi_migrations WHERE name = %s", (etapa,))
    return cur.fetchone() is not None


# ─────────────────────────────────────────────────────────────────────────────
# Planejadores PUROS (recebem linhas, devolvem decisões) — testáveis sem banco
# ─────────────────────────────────────────────────────────────────────────────

def planejar_apelidos(linhas: list[dict]) -> list[dict]:
    """Decidir qual apelido antigo vira o campo Apelido de cada pessoa.

    Args:
        linhas: Uma linha por pessoa viva SEM apelido ainda, já com o primeiro apelido
            dela: ``{person_id, name, alias_id, alias}``.

    Returns:
        Os itens a migrar: ``{person_id, name, alias_id, alias}``. Fica de fora quem tem
        o apelido igual ao próprio nome (não acrescentaria nada).

    Example:
        >>> planejar_apelidos([{"person_id": "1", "name": "Bia", "alias_id": 5, "alias": "bia"}])
        []
        >>> planejar_apelidos([{"person_id": "2", "name": "Beatriz", "alias_id": 6, "alias": "Bia"}])[0]["alias"]
        'Bia'
    """
    plano = []
    for linha in linhas:
        # Apelido igual ao nome (ignorando caixa/acento) não vira campo próprio.
        if naming.norm(linha["alias"]) == naming.norm(linha["name"]):
            continue
        plano.append(linha)
    return plano


# ─────────────────────────────────────────────────────────────────────────────
# Etapas: cada uma tem planejar(cur) -> itens e aplicar(cur, itens) -> quantos mudaram
# ─────────────────────────────────────────────────────────────────────────────

def _planejar_contexto(cur) -> list[dict]:
    """Listar as pessoas da categoria "trabalho" que ainda não têm espaço de trabalho.

    Returns:
        ``[{id, name}]`` das pessoas a mover para ``context = 'work'``.
    """
    # Antes do schema novo a coluna context não existe: todas ainda estão por migrar.
    filtro = "AND context = 'personal'" if _coluna_existe(cur, "people", "context") else ""
    cur.execute(f"SELECT id, name FROM people WHERE category = 'trabalho' AND deleted = FALSE {filtro} ORDER BY name")
    return [{"id": r[0], "name": r[1]} for r in cur.fetchall()]


def _aplicar_contexto(cur, itens: list[dict]) -> int:
    """Marcar as pessoas de trabalho com o espaço ``work``.

    Args:
        cur: Cursor psycopg2 ativo.
        itens: Saída de ``_planejar_contexto``.

    Returns:
        Quantas pessoas mudaram.
    """
    if not itens:
        return 0
    cur.execute(
        "UPDATE people SET context = 'work', updated_at = NOW() WHERE id = ANY(%s) AND context = 'personal'",
        ([i["id"] for i in itens],),
    )
    return cur.rowcount


def _planejar_apelidos(cur) -> list[dict]:
    """Montar o plano de "1º apelido vira Apelido".

    Returns:
        ``[{person_id, name, alias_id, alias}]`` já filtrado por ``planejar_apelidos``.
    """
    # Se a coluna nickname já existe, só olha quem ainda não tem apelido.
    filtro = "AND p.nickname IS NULL" if _coluna_existe(cur, "people", "nickname") else ""
    cur.execute(
        f"""
        SELECT DISTINCT ON (a.person_id) a.person_id, p.name, a.id, a.alias
        FROM person_aliases a JOIN people p ON p.id = a.person_id
        WHERE p.deleted = FALSE {filtro}
        ORDER BY a.person_id, a.id
        """
    )
    linhas = [{"person_id": r[0], "name": r[1], "alias_id": r[2], "alias": r[3]} for r in cur.fetchall()]
    return planejar_apelidos(linhas)


def _aplicar_apelidos(cur, itens: list[dict]) -> int:
    """Gravar o Apelido e tirar a linha correspondente de ``person_aliases``.

    Cada item roda dentro de um SAVEPOINT: se um deles colidir com algo, só ele é
    ignorado e o resto da migração segue.

    Args:
        cur: Cursor psycopg2 ativo.
        itens: Saída de ``_planejar_apelidos``.

    Returns:
        Quantas pessoas ganharam Apelido.
    """
    feitos = 0
    for item in itens:
        cur.execute("SAVEPOINT apelido")
        try:
            cur.execute("DELETE FROM person_aliases WHERE id = %s", (item["alias_id"],))
            cur.execute(
                "UPDATE people SET nickname = %s, nickname_norm = %s, updated_at = NOW() "
                "WHERE id = %s AND nickname IS NULL",
                (item["alias"], naming.norm(item["alias"]), item["person_id"]),
            )
            # Guarda o rowcount do UPDATE ANTES de liberar o savepoint: o RELEASE é o último
            # comando e deixaria cur.rowcount em -1.
            atualizadas = cur.rowcount
            cur.execute("RELEASE SAVEPOINT apelido")
            feitos += atualizadas
        except Exception:  # noqa: BLE001 — colisão rara: desfaz só este item
            cur.execute("ROLLBACK TO SAVEPOINT apelido")
            print(f"  ! apelido '{item['alias']}' de {item['name']} não migrado (colisão); segue em 'outras formas'.")
    return feitos


def _planejar_notas(cur) -> list[dict]:
    """Listar as pessoas com texto em ``people.notes``.

    Returns:
        ``[{id, name, notes}]`` das pessoas cuja observação antiga vai virar anotação.
    """
    cur.execute("SELECT id, name, notes FROM people WHERE notes IS NOT NULL AND btrim(notes) <> '' ORDER BY name")
    return [{"id": r[0], "name": r[1], "notes": r[2]} for r in cur.fetchall()]


def _aplicar_notas(cur, itens: list[dict]) -> int:
    """Criar uma anotação ``nota`` para cada observação antiga.

    A coluna ``people.notes`` NÃO é apagada (fica como backup). Pessoas de trabalho
    recebem a anotação no espaço trabalho.

    Args:
        cur: Cursor psycopg2 ativo.
        itens: Saída de ``_planejar_notas``.

    Returns:
        Quantas anotações foram criadas.
    """
    for item in itens:
        texto = item["notes"].strip()
        cur.execute(
            """
            INSERT INTO person_notes (person_id, kind, context, text, text_norm, source, status)
            SELECT p.id, 'nota', CASE WHEN p.context = 'work' THEN 'work' ELSE 'personal' END, %s, %s, 'manual', 'ativa'
            FROM people p WHERE p.id = %s
            """,
            (texto, naming.norm(texto), item["id"]),
        )
    return len(itens)


# Ordem importa: o espaço (1) vem antes das notas (3), que dependem dele.
ETAPAS: list[tuple[str, Callable, Callable, str]] = [
    ("context_from_category", _planejar_contexto, _aplicar_contexto, "pessoas da categoria Trabalho → espaço Trabalho"),
    ("nickname_from_alias", _planejar_apelidos, _aplicar_apelidos, "1º apelido vira o campo Apelido"),
    ("notes_to_person_notes", _planejar_notas, _aplicar_notas, "observações antigas viram anotações"),
]


def main(apply: bool = False) -> dict:
    """Planejar (e, com ``apply``, executar) a migração dos dados da Komi.

    Args:
        apply: ``False`` (padrão) = dry-run; ``True`` = aplica o schema e as etapas.

    Returns:
        Um relatório ``{etapa: {"planejadas": n, "aplicadas": n, "ja_feita": bool}}``.
    """
    if apply:
        # O schema precisa existir antes de qualquer UPDATE nas colunas novas.
        if not ensure_schema(force=True):
            raise SystemExit("Não foi possível aplicar o schema da Komi; nada foi migrado.")

    relatorio: dict = {}
    with get_conn() as conn:
        with conn.cursor() as cur:
            for nome, planejar, aplicar, descricao in ETAPAS:
                if _ja_aplicada(cur, nome):
                    relatorio[nome] = {"planejadas": 0, "aplicadas": 0, "ja_feita": True}
                    print(f"[{nome}] já aplicada — nada a fazer.")
                    continue
                itens = planejar(cur)
                aplicadas = 0
                if apply:
                    aplicadas = aplicar(cur, itens)
                    cur.execute("INSERT INTO komi_migrations (name) VALUES (%s) ON CONFLICT DO NOTHING", (nome,))
                relatorio[nome] = {"planejadas": len(itens), "aplicadas": aplicadas, "ja_feita": False}
                print(f"[{nome}] {descricao}: {len(itens)} item(ns){' → ' + str(aplicadas) + ' gravado(s)' if apply else ''}")
                for item in itens[:_AMOSTRA]:
                    print("    ·", {k: v for k, v in item.items() if k != "notes"})
            if not apply:
                # Dry-run: garante que nada, nem por engano, seja gravado.
                conn.rollback()
    return relatorio


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--apply", action="store_true", help="grava no banco (padrão: dry-run)")
    args = parser.parse_args()
    main(apply=args.apply)
    if not args.apply:
        print("Dry-run: nada foi alterado. Rode com --apply para gravar.")
    sys.exit(0)
