"""Migrar os DADOS da Komi para a spec 077 (Komi no Design System).

O schema novo (colunas e tabelas) é criado sozinho por ``agents.komi.schema.ensure_schema``
— este script converte os dados ANTIGOS para o modelo novo, em etapas, cada uma
registrada em ``komi_migrations`` para nunca rodar duas vezes (senão desfaria uma
escolha que o dono fez depois).

Etapas:
  1. ``context_from_category``  — pessoas da categoria "trabalho" passam a ter espaço ``work``.
  2. ``nickname_from_alias``    — o 1º apelido de cada pessoa vira o campo Apelido; os demais
                                  continuam em ``person_aliases`` ("outras formas de chamar").
  3. ``birthday_from_dates``    — o aniversário (``person_dates`` com o rótulo "aniversário")
                                  vira o campo da pessoa; as tarefas "Aniversário" que o sync antigo
                                  criou na Kaguya vão para a lixeira (o calendário passa a mostrar o
                                  aniversário direto da Komi, com lembrete). Aniversários em conflito
                                  (duas datas diferentes para a mesma pessoa) NÃO são mexidos: ficam
                                  listados no relatório.
  4. ``notes_to_person_notes``  — o texto livre de ``people.notes`` vira uma anotação da pessoa
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


def planejar_aniversarios(datas: list[dict], aniversarios_atuais: dict[str, tuple[int, int]]) -> dict:
    """Decidir o que fazer com cada data de "aniversário" antiga de ``person_dates``.

    Regras: a 1ª data de uma pessoa vira o campo (a menos que ela já tenha um); uma data
    repetida com o MESMO dia/mês é duplicata e é removida; com dia/mês DIFERENTE é conflito
    e fica como está, para o dono decidir. O ano 2000 era a âncora das datas sem ano
    (``MM-DD``): vira "sem ano de nascimento".

    Args:
        datas: Uma linha por data de aniversário, na ordem de criação:
            ``{date_id, person_id, name, date (AAAA-MM-DD), task_id (ou None)}``.
        aniversarios_atuais: ``{person_id: (dia, mes)}`` de quem já tem o campo preenchido.

    Returns:
        ``{"migrar": [...], "duplicadas": [...], "conflitos": [...]}``. Cada item de
        ``migrar`` traz ``person_id, name, date_id, day, month, year, task_ids`` (e as de
        ``duplicadas`` e ``conflitos`` trazem ``date_id`` e ``task_ids``).

    Example:
        >>> r = planejar_aniversarios([{"date_id": 1, "person_id": "p", "name": "Bia", "date": "2000-05-15", "task_id": 9}], {})
        >>> (r["migrar"][0]["day"], r["migrar"][0]["month"], r["migrar"][0]["year"], r["migrar"][0]["task_ids"])
        (15, 5, None, [9])
    """
    resultado: dict = {"migrar": [], "duplicadas": [], "conflitos": []}
    alvo_da_pessoa: dict[str, tuple[int, int]] = dict(aniversarios_atuais)
    for d in datas:
        ano, mes, dia = (int(x) for x in d["date"].split("-"))
        tarefas = [d["task_id"]] if d.get("task_id") else []
        base = {"person_id": d["person_id"], "name": d["name"], "date_id": d["date_id"], "task_ids": tarefas}
        atual = alvo_da_pessoa.get(d["person_id"])
        if atual is None:
            alvo_da_pessoa[d["person_id"]] = (dia, mes)
            resultado["migrar"].append({**base, "day": dia, "month": mes, "year": None if ano == naming.LEGACY_SENTINEL_YEAR else ano})
        elif atual == (dia, mes):
            resultado["duplicadas"].append(base)
        else:
            resultado["conflitos"].append({**base, "day": dia, "month": mes})
    return resultado


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


def _planejar_aniversarios(cur) -> list[dict]:
    """Montar o plano de "aniversário de person_dates vira campo da pessoa".

    Imprime os conflitos (não são migrados) e as tarefas de aniversário soltas (sem pessoa
    ligada: ficam como tarefas comuns).

    Returns:
        Os itens a migrar, mais as duplicatas a remover (marcadas com ``duplicada=True``).
    """
    tem_ponte = _tabela_existe(cur, "birthday_sync_links")
    juncao = "LEFT JOIN birthday_sync_links bsl ON bsl.person_date_id = pd.id" if tem_ponte else ""
    coluna_tarefa = "bsl.task_id" if tem_ponte else "NULL::int"
    cur.execute(
        f"""
        SELECT pd.id, pd.person_id, p.name, pd.date::text, pd.label, {coluna_tarefa}
        FROM person_dates pd JOIN people p ON p.id = pd.person_id AND p.deleted = FALSE
        {juncao}
        WHERE pd.recurring = TRUE AND pd.label ILIKE '%anivers%'
        ORDER BY pd.person_id, pd.id
        """
    )
    datas = [
        {"date_id": r[0], "person_id": r[1], "name": r[2], "date": r[3], "task_id": r[5]}
        for r in cur.fetchall()
        if naming.norm(r[4]) == "aniversario"          # "aniversário de namoro" etc. seguem como datas comuns
    ]
    atuais: dict[str, tuple[int, int]] = {}
    if _coluna_existe(cur, "people", "birth_day"):
        cur.execute("SELECT id, birth_day, birth_month FROM people WHERE birth_day IS NOT NULL AND deleted = FALSE")
        atuais = {r[0]: (r[1], r[2]) for r in cur.fetchall()}

    plano = planejar_aniversarios(datas, atuais)
    for c in plano["conflitos"]:
        print(f"  ! {c['name']}: já tem outro aniversário — a data {c['day']:02d}/{c['month']:02d} NÃO foi mexida (decida você).")

    # Tarefas "Aniversário" sem pessoa ligada ficam como tarefas comuns: só avisamos.
    if _tabela_existe(cur, "tasks"):
        ponte = "AND t.id NOT IN (SELECT task_id FROM birthday_sync_links)" if tem_ponte else ""
        cur.execute(f"SELECT t.title FROM tasks t WHERE t.type = 'birthday' AND t.deleted_at IS NULL {ponte} ORDER BY t.title")
        soltas = [r[0] for r in cur.fetchall()]
        if soltas:
            print(f"  ! {len(soltas)} tarefa(s) de aniversário sem pessoa na Komi continuam como tarefas comuns: {', '.join(soltas[:5])}")
    return plano["migrar"] + [{**d, "duplicada": True} for d in plano["duplicadas"]]


def _aplicar_aniversarios(cur, itens: list[dict]) -> int:
    """Gravar o aniversário no campo da pessoa e limpar as datas e tarefas antigas.

    Ordem pensada para ser segura se a migração for interrompida e rodada de novo:
    primeiro as tarefas da Kaguya vão para a lixeira (em transações próprias da Kaguya),
    depois o banco da Komi é alterado. Se parar no meio, o plano seguinte ainda encontra
    as datas antigas e refaz o resto (apagar uma tarefa já apagada não faz mal).

    Args:
        cur: Cursor psycopg2 ativo.
        itens: Saída de ``_planejar_aniversarios``.

    Returns:
        Quantas pessoas ganharam o campo de aniversário.
    """
    tarefas = sorted({t for i in itens for t in i["task_ids"]})
    if tarefas:
        from agents.kaguya.tools_tasks import delete_task  # noqa: PLC0415 — a Kaguya é dona de apagar tarefa
        for tid in tarefas:
            resposta = delete_task(tid, scope="series")
            if resposta.get("status") != "ok":
                print(f"  ! tarefa {tid} não foi para a lixeira: {resposta.get('message')}")

    migradas = 0
    for item in itens:
        if item.get("duplicada"):
            continue
        cur.execute(
            "UPDATE people SET birth_day = %s, birth_month = %s, birth_year = %s, updated_at = NOW() "
            "WHERE id = %s AND birth_day IS NULL",
            (item["day"], item["month"], item["year"], item["person_id"]),
        )
        migradas += cur.rowcount
    cur.execute("DELETE FROM person_dates WHERE id = ANY(%s)", ([i["date_id"] for i in itens],))
    return migradas


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


# Ordem importa: o espaço (1) vem antes das notas (4), que dependem dele.
ETAPAS: list[tuple[str, Callable, Callable, str]] = [
    ("context_from_category", _planejar_contexto, _aplicar_contexto, "pessoas da categoria Trabalho → espaço Trabalho"),
    ("nickname_from_alias", _planejar_apelidos, _aplicar_apelidos, "1º apelido vira o campo Apelido"),
    ("birthday_from_dates", _planejar_aniversarios, _aplicar_aniversarios, "aniversários de datas viram o campo da pessoa"),
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
