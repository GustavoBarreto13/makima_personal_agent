"""Mesclar pessoas duplicadas — Komi, spec 077.

Quando a mesma pessoa foi cadastrada duas vezes ("Ana" e "Ana Lima"), mesclar junta tudo numa só:
vínculos de todos os agentes, interações, anotações, datas, relações e grupos. O Nome, o Apelido,
o Nome completo e as outras formas da pessoa absorvida viram "outras formas de chamar" da que
fica — então ``@Ana`` continua resolvendo certo em qualquer agente.

Ordem de segurança (pensada para uma falha no meio nunca deixar a pessoa "meio mesclada"):
    1. Os agentes reapontam o ID da pessoa absorvida que guardam FORA de ``person_links``
       (tokens ``@[Nome](komi:id)`` em textos, "aguardando" da Kaguya...) pelo gancho ``on_merge``
       do provedor. É idempotente e cada agente usa a própria transação.
    2. Só então a Komi muda o próprio banco, numa transação única (tudo-ou-nada).

A pessoa absorvida vai para a lixeira com ``merged_into`` apontando para quem ficou. Mesclar NÃO
tem "Desfazer": a prévia (``preview_merge``) existe para o dono conferir antes.

Usage:
    >>> from agents.komi.tools_merge import preview_merge, merge_people
    >>> preview_merge("id-da-ana-lima", "id-da-ana")      # doctest: +SKIP
    {'status': 'ok', 'keep': {...}, 'drop': {...}, 'moves': {...}}
"""

from __future__ import annotations

import logging

from agents.komi import duplicates, naming
from agents.komi.rows import valor
from agents.komi.tools import get_conn, run_select

logger = logging.getLogger(__name__)

# Campos de contato que a pessoa que FICA herda da absorvida quando estão vazios nela.
_CAMPOS_HERDADOS = ("phone", "email", "instagram", "telegram", "city", "avatar_url", "relationship", "full_name")
_COLUNAS = (
    "id, name, nickname, full_name, phone, email, instagram, telegram, city, avatar_url, relationship, "
    "context, category, birth_day, birth_month, birth_year, birthday_remind_days, deleted"
)


def _carregar(cur, person_id: str) -> dict | None:
    """Ler uma pessoa (viva ou não) como dicionário.

    Args:
        cur: Cursor psycopg2 ativo.
        person_id: ID da pessoa.

    Returns:
        O dicionário com as colunas de ``_COLUNAS``, ou ``None`` se não existe.
    """
    cur.execute(f"SELECT {_COLUNAS} FROM people WHERE id = %s", (person_id,))
    linha = cur.fetchone()
    if linha is None:
        return None
    return {c.name: v for c, v in zip(cur.description, linha)} if not isinstance(linha, dict) else dict(linha)


def _formas(cur, pessoa: dict) -> list[tuple[str, str]]:
    """Listar (texto, chave) de todas as formas de chamar uma pessoa: Nome, Apelido, Nome completo e outras.

    Args:
        cur: Cursor psycopg2 ativo.
        pessoa: A pessoa (dicionário de ``_carregar``).

    Returns:
        Pares ``(texto como escrito, chave normalizada)`` sem repetir chave.
    """
    brutos = [pessoa["name"], pessoa["nickname"], pessoa["full_name"]]
    cur.execute("SELECT alias FROM person_aliases WHERE person_id = %s ORDER BY id", (pessoa["id"],))
    brutos += [valor(r, 0, "alias") for r in cur.fetchall()]
    vistas: dict[str, str] = {}
    for texto in brutos:
        chave = naming.norm(texto)
        if chave and chave not in vistas:
            vistas[chave] = texto
    return [(texto, chave) for chave, texto in vistas.items()]


def _planejar(cur, keep: dict, drop: dict) -> dict:
    """Decidir o que muda ao mesclar (usado pela prévia E pela mescla, para nunca divergirem).

    Args:
        cur: Cursor psycopg2 ativo.
        keep: A pessoa que fica.
        drop: A pessoa absorvida.

    Returns:
        ``{"fill": {campo: valor}, "aliases": [texto...], "context": str, "birthday": bool, "adopt_nickname": str|None}``.
    """
    chaves_keep = {chave for _, chave in _formas(cur, keep)}
    novas = [texto for texto, chave in _formas(cur, drop) if chave not in chaves_keep]

    preencher = {c: drop[c] for c in _CAMPOS_HERDADOS if not keep[c] and drop[c]}
    if "full_name" in preencher:  # o Nome completo adotado não precisa virar "outra forma" também
        novas = [t for t in novas if naming.norm(t) != naming.norm(preencher["full_name"])]
    # Sem apelido, a que fica adota o da absorvida (em vez de só guardá-lo como "outra forma").
    adotar = None
    if not keep["nickname"] and drop["nickname"] and naming.norm(drop["nickname"]) != naming.norm(keep["name"]):
        adotar = drop["nickname"]
        novas = [t for t in novas if naming.norm(t) != naming.norm(adotar)]

    return {
        "fill": preencher,
        "aliases": novas,
        "adopt_nickname": adotar,
        "context": keep["context"] if keep["context"] == drop["context"] else "both",
        "birthday": keep["birth_day"] is None and drop["birth_day"] is not None,
    }


def _validar(cur, keep_id: str, drop_id: str) -> tuple[dict | None, dict | None, dict | None]:
    """Conferir os dois lados de uma mescla.

    Args:
        cur: Cursor psycopg2 ativo.
        keep_id: Quem fica.
        drop_id: Quem é absorvida.

    Returns:
        ``(keep, drop, erro)``; ``erro`` é um dicionário ``status: error`` ou ``None``.
    """
    if keep_id == drop_id:
        return None, None, {"status": "error", "message": "Escolha duas pessoas diferentes."}
    keep, drop = _carregar(cur, keep_id), _carregar(cur, drop_id)
    if not keep or keep["deleted"] or not drop or drop["deleted"]:
        return None, None, {"status": "error", "message": "Pessoa não encontrada."}
    return keep, drop, None


def find_duplicates(limit: int = 20) -> dict:
    """Sugerir pares de pessoas que podem ser a mesma (para o dono revisar e mesclar).

    Args:
        limit: Máximo de pares devolvidos.

    Returns:
        ``{"status": "ok", "pairs": [{a, b, reasons, score}, ...]}`` — veja ``duplicates.candidate_pairs``.
    """
    try:
        pessoas = run_select(
            """
            SELECT p.id, p.name, p.nickname, p.full_name, p.phone, p.email, p.instagram, p.telegram,
                   COALESCE((SELECT array_agg(a.alias) FROM person_aliases a WHERE a.person_id = p.id), '{}') AS aliases
            FROM people p WHERE p.deleted = FALSE
            """
        )
        return {"status": "ok", "pairs": duplicates.candidate_pairs(pessoas)[: max(1, int(limit))]}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}


def preview_merge(keep_id: str, drop_id: str) -> dict:
    """Mostrar o que acontece se ``drop_id`` for mesclada em ``keep_id`` — sem mudar nada.

    Args:
        keep_id: Quem fica.
        drop_id: Quem é absorvida.

    Returns:
        ``{"status": "ok", "keep": {...}, "drop": {...}, "moves": {...}, "fill": {...}, "aliases": [...],
        "context": str}`` com a contagem do que será movido por tipo, ou ``{"status": "error", ...}``.
    """
    try:
        with get_conn() as conn, conn.cursor() as cur:
            keep, drop, erro = _validar(cur, keep_id, drop_id)
            if erro:
                return erro
            plano = _planejar(cur, keep, drop)
            cur.execute("SELECT entity_type, COUNT(*) AS n FROM person_links WHERE person_id = %s GROUP BY entity_type", (drop_id,))
            vinculos = {valor(r, 0, "entity_type"): valor(r, 1, "n") for r in cur.fetchall()}

            def contar(tabela: str, extra: str = "") -> int:
                cur.execute(f"SELECT COUNT(*) AS n FROM {tabela} WHERE person_id = %s {extra}", (drop_id,))
                return valor(cur.fetchone(), 0, "n")

            cur.execute("SELECT COUNT(*) AS n FROM person_relations WHERE person_a = %s OR person_b = %s", (drop_id, drop_id))
            relacoes = valor(cur.fetchone(), 0, "n")
            moves = {
                "links": vinculos, "interactions": contar("person_interactions", "AND deleted = FALSE"),
                "notes": contar("person_notes", "AND deleted = FALSE"), "dates": contar("person_dates"),
                "relations": relacoes, "groups": contar("person_group_members"),
            }
        resumo = lambda p: {"id": p["id"], "name": p["name"], "nickname": p["nickname"]}  # noqa: E731
        return {"status": "ok", "keep": resumo(keep), "drop": resumo(drop), "moves": moves, "fill": plano["fill"],
                "aliases": plano["aliases"], "context": plano["context"], "birthday": plano["birthday"]}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}


def merge_people(keep_id: str, drop_id: str) -> dict:
    """Mesclar ``drop_id`` em ``keep_id``: tudo da absorvida passa para quem fica.

    ATENÇÃO — AÇÃO SEM DESFAZER. Só chame depois de (1) rodar ``preview_merge``, (2) mostrar ao
    usuário quem fica, quem é absorvida e o que será movido, e (3) ele confirmar EXPLICITAMENTE.
    Nunca mescle por conta própria nem por palpite de "parecem a mesma pessoa" (use
    ``find_duplicates`` só para sugerir). A absorvida vai para a lixeira (``merged_into`` aponta
    para quem ficou) e não pode ser restaurada.

    Args:
        keep_id: Quem fica.
        drop_id: Quem é absorvida.

    Returns:
        ``{"status": "ok", "message": ..., "moved": {...}, "warnings": [...]}`` ou ``{"status": "error", ...}``.
        ``warnings`` lista agentes cujo gancho ``on_merge`` falhou (o resto foi mesclado).
    """
    from agents.komi import integration  # noqa: PLC0415 — import lazy: integration importa tools

    try:
        # Validação sem escrever nada ainda (mesmas regras da prévia).
        with get_conn() as conn, conn.cursor() as cur:
            keep, drop, erro = _validar(cur, keep_id, drop_id)
            if erro:
                return erro
            nome_final = keep["name"]

        # 1) Agentes reapontam o que guardam fora de person_links (idempotente; transações próprias).
        reapontados, avisos = integration.run_merge_hooks(drop_id, keep_id, nome_final)

        # 2) A Komi muda o próprio banco, tudo-ou-nada.
        with get_conn() as conn, conn.cursor() as cur:
            keep, drop, erro = _validar(cur, keep_id, drop_id)    # revalida: pode ter mudado entre as duas etapas
            if erro:
                return erro
            plano = _planejar(cur, keep, drop)
            movido: dict[str, int] = {}

            # A absorvida sai de cena PRIMEIRO: os índices únicos de nome/apelido só valem entre vivas,
            # então a que fica pode adotar o apelido dela sem colisão.
            cur.execute("UPDATE people SET deleted = TRUE, merged_into = %s, updated_at = NOW() WHERE id = %s", (keep_id, drop_id))

            # Vínculos de TODOS os agentes
            cur.execute(
                "INSERT INTO person_links (person_id, entity_type, entity_id) "
                "SELECT %s, entity_type, entity_id FROM person_links WHERE person_id = %s ON CONFLICT DO NOTHING",
                (keep_id, drop_id),
            )
            movido["links"] = cur.rowcount
            cur.execute("DELETE FROM person_links WHERE person_id = %s", (drop_id,))

            cur.execute("UPDATE person_interactions SET person_id = %s WHERE person_id = %s", (keep_id, drop_id))
            movido["interactions"] = cur.rowcount

            # Anotações: as que a pessoa que fica já tem (mesmo texto) não duplicam
            cur.execute(
                "UPDATE person_notes SET person_id = %s WHERE person_id = %s AND deleted = FALSE AND text_norm NOT IN "
                "(SELECT text_norm FROM person_notes WHERE person_id = %s AND deleted = FALSE)",
                (keep_id, drop_id, keep_id),
            )
            movido["notes"] = cur.rowcount
            cur.execute("UPDATE person_notes SET deleted = TRUE WHERE person_id = %s", (drop_id,))

            # Datas importantes: a mesma data (rótulo + dia) não duplica
            ja_tem = {(naming.norm(r[0]), r[1]) for r in _linhas(cur, "SELECT label, date FROM person_dates WHERE person_id = %s", (keep_id,))}
            movido["dates"] = 0
            for d in _linhas(cur, "SELECT id, label, date FROM person_dates WHERE person_id = %s", (drop_id,)):
                if (naming.norm(d[1]), d[2]) in ja_tem:
                    cur.execute("DELETE FROM person_dates WHERE id = %s", (d[0],))
                else:
                    cur.execute("UPDATE person_dates SET person_id = %s WHERE id = %s", (keep_id, d[0]))
                    movido["dates"] += 1

            # Formas de chamar: as "outras formas" da absorvida passam adiante (índice único global),
            # e o Nome/Apelido/Nome completo dela viram "outras formas" da que fica.
            cur.execute("UPDATE person_aliases SET person_id = %s WHERE person_id = %s", (keep_id, drop_id))
            for texto in plano["aliases"]:
                cur.execute(
                    "INSERT INTO person_aliases (person_id, alias, normalizado) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
                    (keep_id, texto, naming.norm(texto)),
                )
            movido["aliases"] = len(plano["aliases"])

            # Campos vazios de quem fica recebem os da absorvida; espaço vira "ambos" se eram diferentes
            sets = {c: v for c, v in plano["fill"].items()}
            sets["context"] = plano["context"]
            if plano["adopt_nickname"]:
                sets["nickname"], sets["nickname_norm"] = plano["adopt_nickname"], naming.norm(plano["adopt_nickname"])
            if "full_name" in sets:
                sets["full_name_norm"] = naming.norm(sets["full_name"])
            if plano["birthday"]:
                sets.update(birth_day=drop["birth_day"], birth_month=drop["birth_month"], birth_year=drop["birth_year"],
                            birthday_remind_days=drop["birthday_remind_days"])
            atribuicoes = ", ".join(f"{col} = %({col})s" for col in sets)
            cur.execute(f"UPDATE people SET {atribuicoes}, updated_at = NOW() WHERE id = %(id)s", {**sets, "id": keep_id})

            # Relações: reescreve para quem fica (sem auto-relação nem duplicata)
            movido["relations"] = _mesclar_relacoes(cur, keep_id, drop_id)

            cur.execute(
                "INSERT INTO person_group_members (group_id, person_id) "
                "SELECT group_id, %s FROM person_group_members WHERE person_id = %s ON CONFLICT DO NOTHING",
                (keep_id, drop_id),
            )
            movido["groups"] = cur.rowcount
            cur.execute("DELETE FROM person_group_members WHERE person_id = %s", (drop_id,))

            # O resumo de IA de ambas fica velho: apaga os dois
            cur.execute("DELETE FROM person_memory_summaries WHERE person_id = ANY(%s)", ([keep_id, drop_id],))

        from agents.komi.tools import _marcar_calendario_sujo  # noqa: PLC0415
        _marcar_calendario_sujo(True)
        return {"status": "ok", "message": f"{drop['name']} foi mesclada em {nome_final}.", "moved": {**movido, "agents": reapontados},
                "warnings": avisos}
    except Exception as e:  # noqa: BLE001
        logger.warning("Komi: mescla falhou.", exc_info=True)
        return {"status": "error", "message": str(e)}


def _linhas(cur, sql: str, params: tuple) -> list[tuple]:
    """Executar um SELECT e devolver as linhas como tuplas (independente do tipo de cursor).

    Args:
        cur: Cursor psycopg2 ativo.
        sql: Consulta.
        params: Parâmetros.

    Returns:
        Lista de tuplas.
    """
    cur.execute(sql, params)
    return [tuple(r.values()) if isinstance(r, dict) else tuple(r) for r in cur.fetchall()]


def _mesclar_relacoes(cur, keep_id: str, drop_id: str) -> int:
    """Reescrever as relações da pessoa absorvida para a que fica.

    Relações entre as DUAS pessoas (viram "A é X de A") são descartadas; as demais são regravadas
    na forma canônica, sem duplicar o que quem fica já tinha.

    Args:
        cur: Cursor psycopg2 ativo (dentro da transação da mescla).
        keep_id: Quem fica.
        drop_id: Quem é absorvida.

    Returns:
        Quantas relações foram reaproveitadas.
    """
    from agents.komi.tools_relations import canonical_relation  # noqa: PLC0415

    cur.execute("SELECT slug, inverse_slug FROM person_relation_kinds")
    inversos = {valor(r, 0, "slug"): valor(r, 1, "inverse_slug") for r in cur.fetchall()}
    linhas = _linhas(cur, "SELECT id, person_a, person_b, kind FROM person_relations WHERE person_a = %s OR person_b = %s", (drop_id, drop_id))
    aproveitadas = 0
    for rid, a, b, kind in linhas:
        cur.execute("DELETE FROM person_relations WHERE id = %s", (rid,))
        novo_a, novo_b = (keep_id if a == drop_id else a), (keep_id if b == drop_id else b)
        if novo_a == novo_b:
            continue
        ca, cb, ck = canonical_relation(novo_a, novo_b, kind, inversos[kind])
        cur.execute("INSERT INTO person_relations (person_a, person_b, kind) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING", (ca, cb, ck))
        aproveitadas += cur.rowcount
    return aproveitadas
