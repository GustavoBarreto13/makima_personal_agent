"""Relações entre pessoas e grupos livres — Komi, spec 077.

**Relações**: "a Bia é irmã do João", "a Ana é mãe do Pedro". Cada tipo de relação tem um inverso
(``pai_mae`` ↔ ``filho``; ``irmao`` é simétrica). Uma linha de ``person_relations`` diz
"A é <tipo> de B"; só a forma canônica é gravada, então o mesmo par nunca aparece duas vezes.

**Grupos**: conjuntos livres ("turma da faculdade"); uma pessoa pode estar em vários.

Usage:
    >>> from agents.komi.tools_relations import canonical_relation
    >>> canonical_relation("p1", "p2", "pai_mae", "filho")   # A é pai/mãe de B  ==  B é filho(a) de A
    ('p2', 'p1', 'filho')
"""

from __future__ import annotations

from agents.komi import naming
from agents.komi.rows import valor
from agents.komi.tools import get_conn, run_select


def canonical_relation(a: str, b: str, kind: str, inverse: str) -> tuple[str, str, str]:
    """Achar a forma canônica de "A é <kind> de B".

    "A é pai/mãe de B" e "B é filho(a) de A" dizem a mesma coisa; gravamos só uma. A regra:
    tipo simétrico → o par ordenado por ID; tipo com inverso → fica o tipo que vem primeiro
    em ordem alfabética (se precisar, troca A e B e usa o inverso).

    Args:
        a: ID de quem "é" o tipo.
        b: ID da outra pessoa.
        kind: Tipo da relação de A para B.
        inverse: Tipo inverso (igual a ``kind`` se a relação é simétrica).

    Returns:
        ``(pessoa_a, pessoa_b, tipo)`` canônicos.

    Example:
        >>> canonical_relation("p2", "p1", "irmao", "irmao")
        ('p1', 'p2', 'irmao')
        >>> canonical_relation("p1", "p2", "filho", "pai_mae")
        ('p1', 'p2', 'filho')
    """
    if kind == inverse:
        primeiro, segundo = sorted((a, b))
        return primeiro, segundo, kind
    if kind <= inverse:
        return a, b, kind
    return b, a, inverse


def list_relation_kinds() -> dict:
    """Listar os tipos de relação disponíveis (com o inverso de cada um).

    Returns:
        ``{"status": "ok", "kinds": [{slug, label, inverse_slug}, ...]}``.
    """
    try:
        return {"status": "ok", "kinds": run_select("SELECT slug, label, inverse_slug FROM person_relation_kinds ORDER BY position, slug")}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}


def relate_people(person_a: str, person_b: str, kind: str) -> dict:
    """Registrar que "A é <kind> de B" (ex.: A é ``irmao`` de B).

    Idempotente, e a relação inversa já está implícita: relacionar B como ``filho`` de A depois
    de A como ``pai_mae`` de B não cria uma segunda linha.

    Args:
        person_a: ID de quem "é" o tipo.
        person_b: ID da outra pessoa.
        kind: Slug do tipo (ver ``list_relation_kinds``).

    Returns:
        ``{"status": "ok", "created": bool, "message": ...}`` ou ``{"status": "error", "message": ...}``.
    """
    if person_a == person_b:
        return {"status": "error", "message": "Uma pessoa não pode ter relação com ela mesma."}
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT inverse_slug FROM person_relation_kinds WHERE slug = %s", (kind,))
            achado = cur.fetchone()
            if not achado:
                return {"status": "error", "message": f"Tipo de relação desconhecido: '{kind}'."}
            cur.execute("SELECT COUNT(*) AS n FROM people WHERE id = ANY(%s) AND deleted = FALSE", ([person_a, person_b],))
            if valor(cur.fetchone(), 0, "n") != 2:
                return {"status": "error", "message": "Pessoa não encontrada."}
            a, b, tipo = canonical_relation(person_a, person_b, kind, valor(achado, 0, "inverse_slug"))
            cur.execute(
                "INSERT INTO person_relations (person_a, person_b, kind) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
                (a, b, tipo),
            )
            criada = cur.rowcount == 1
        return {"status": "ok", "created": criada, "message": "Relação registrada." if criada else "Essa relação já existia."}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}


def unrelate_people(person_a: str, person_b: str, kind: str | None = None) -> dict:
    """Desfazer a relação entre duas pessoas (de um tipo, ou todas se ``kind`` for vazio).

    Args:
        person_a: ID de uma das pessoas.
        person_b: ID da outra.
        kind: Tipo a remover (qualquer direção); ``None`` remove todas as relações do par.

    Returns:
        ``{"status": "ok", "removed": n, "message": ...}`` ou ``{"status": "error", "message": ...}``.
    """
    try:
        with get_conn() as conn, conn.cursor() as cur:
            if kind is None:
                cur.execute(
                    "DELETE FROM person_relations WHERE (person_a = %s AND person_b = %s) OR (person_a = %s AND person_b = %s)",
                    (person_a, person_b, person_b, person_a),
                )
            else:
                cur.execute("SELECT inverse_slug FROM person_relation_kinds WHERE slug = %s", (kind,))
                achado = cur.fetchone()
                if not achado:
                    return {"status": "error", "message": f"Tipo de relação desconhecido: '{kind}'."}
                a, b, tipo = canonical_relation(person_a, person_b, kind, valor(achado, 0, "inverse_slug"))
                cur.execute("DELETE FROM person_relations WHERE person_a = %s AND person_b = %s AND kind = %s", (a, b, tipo))
            removidas = cur.rowcount
        if removidas == 0:
            return {"status": "error", "message": "Essa relação não existe."}
        return {"status": "ok", "removed": removidas, "message": "Relação removida."}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}


def list_relations(person_id: str) -> dict:
    """Listar as pessoas ligadas a uma pessoa, do ponto de vista dela.

    Para cada relação, ``kind``/``label`` dizem o que a OUTRA pessoa é para esta ("Pai/mãe: João").

    Args:
        person_id: ID da pessoa.

    Returns:
        ``{"status": "ok", "relations": [{relation_id, other_id, other_name, avatar_url, kind, label}, ...]}``.
    """
    try:
        linhas = run_select(
            """
            SELECT r.id AS relation_id, r.person_a, r.person_b, r.kind, k.label AS kind_label,
                   ki.slug AS inv_slug, ki.label AS inv_label,
                   o.id AS other_id, o.name AS other_name, o.avatar_url
            FROM person_relations r
            JOIN person_relation_kinds k  ON k.slug = r.kind
            JOIN person_relation_kinds ki ON ki.slug = k.inverse_slug
            JOIN people o ON o.id = CASE WHEN r.person_a = %(p)s THEN r.person_b ELSE r.person_a END AND o.deleted = FALSE
            WHERE r.person_a = %(p)s OR r.person_b = %(p)s
            ORDER BY o.name
            """,
            {"p": person_id},
        )
        relacoes = []
        for r in linhas:
            # "A é <kind> de B": do ponto de vista de A, B é o INVERSO; do de B, A é o próprio <kind>.
            e_a = r["person_a"] == person_id
            relacoes.append({
                "relation_id": r["relation_id"], "other_id": r["other_id"], "other_name": r["other_name"],
                "avatar_url": r["avatar_url"],
                "kind": r["inv_slug"] if e_a else r["kind"], "label": r["inv_label"] if e_a else r["kind_label"],
            })
        return {"status": "ok", "relations": relacoes}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}


# ── grupos ───────────────────────────────────────────────────────────────────

def create_group(name: str) -> dict:
    """Criar um grupo livre ("turma da faculdade").

    Args:
        name: Nome do grupo (único ignorando caixa/acento).

    Returns:
        ``{"status": "ok", "id": int, "message": ...}`` ou ``{"status": "error", "message": ...}``.
    """
    nome = naming.clean(name)
    if not nome:
        return {"status": "error", "message": "O grupo precisa de um nome."}
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT 1 FROM person_groups WHERE normalizado = %s", (naming.norm(nome),))
            if cur.fetchone():
                return {"status": "error", "message": f"Já existe o grupo '{nome}'."}
            cur.execute("INSERT INTO person_groups (name, normalizado) VALUES (%s, %s) RETURNING id", (nome, naming.norm(nome)))
            return {"status": "ok", "id": valor(cur.fetchone(), 0, "id"), "message": f"Grupo '{nome}' criado."}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}


def list_groups() -> dict:
    """Listar os grupos com a quantidade de pessoas vivas em cada um.

    Returns:
        ``{"status": "ok", "groups": [{id, name, member_count}, ...]}`` em ordem alfabética.
    """
    try:
        return {"status": "ok", "groups": run_select(
            """
            SELECT g.id, g.name, COUNT(p.id) AS member_count
            FROM person_groups g
            LEFT JOIN person_group_members m ON m.group_id = g.id
            LEFT JOIN people p ON p.id = m.person_id AND p.deleted = FALSE
            GROUP BY g.id ORDER BY lower(g.name)
            """
        )}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}


def rename_group(group_id: int, name: str) -> dict:
    """Renomear um grupo.

    Args:
        group_id: ID do grupo.
        name: Novo nome (único ignorando caixa/acento).

    Returns:
        ``{"status": "ok", "message": ...}`` ou ``{"status": "error", "message": ...}``.
    """
    nome = naming.clean(name)
    if not nome:
        return {"status": "error", "message": "O grupo precisa de um nome."}
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT 1 FROM person_groups WHERE normalizado = %s AND id <> %s", (naming.norm(nome), group_id))
            if cur.fetchone():
                return {"status": "error", "message": f"Já existe o grupo '{nome}'."}
            cur.execute("UPDATE person_groups SET name = %s, normalizado = %s WHERE id = %s", (nome, naming.norm(nome), group_id))
            if cur.rowcount == 0:
                return {"status": "error", "message": "Grupo não encontrado."}
        return {"status": "ok", "message": "Grupo renomeado."}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}


def delete_group(group_id: int) -> dict:
    """Apagar um grupo (as pessoas continuam existindo; só saem do grupo).

    Args:
        group_id: ID do grupo.

    Returns:
        ``{"status": "ok", "message": ...}`` ou ``{"status": "error", "message": ...}``.
    """
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM person_groups WHERE id = %s", (group_id,))
            if cur.rowcount == 0:
                return {"status": "error", "message": "Grupo não encontrado."}
        return {"status": "ok", "message": "Grupo apagado."}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}


def add_to_group(group_id: int, person_id: str) -> dict:
    """Colocar uma pessoa num grupo (idempotente).

    Args:
        group_id: ID do grupo.
        person_id: ID da pessoa.

    Returns:
        ``{"status": "ok", "message": ...}`` ou ``{"status": "error", "message": ...}``.
    """
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT 1 FROM person_groups WHERE id = %s", (group_id,))
            if not cur.fetchone():
                return {"status": "error", "message": "Grupo não encontrado."}
            cur.execute("SELECT 1 FROM people WHERE id = %s AND deleted = FALSE", (person_id,))
            if not cur.fetchone():
                return {"status": "error", "message": "Pessoa não encontrada."}
            cur.execute("INSERT INTO person_group_members (group_id, person_id) VALUES (%s, %s) ON CONFLICT DO NOTHING", (group_id, person_id))
        return {"status": "ok", "message": "Pessoa adicionada ao grupo."}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}


def remove_from_group(group_id: int, person_id: str) -> dict:
    """Tirar uma pessoa de um grupo.

    Args:
        group_id: ID do grupo.
        person_id: ID da pessoa.

    Returns:
        ``{"status": "ok", "message": ...}`` ou ``{"status": "error", "message": ...}``.
    """
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM person_group_members WHERE group_id = %s AND person_id = %s", (group_id, person_id))
            if cur.rowcount == 0:
                return {"status": "error", "message": "Essa pessoa não está no grupo."}
        return {"status": "ok", "message": "Pessoa removida do grupo."}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}


def list_person_groups(person_id: str) -> dict:
    """Listar os grupos em que uma pessoa está.

    Args:
        person_id: ID da pessoa.

    Returns:
        ``{"status": "ok", "groups": [{id, name}, ...]}``.
    """
    try:
        return {"status": "ok", "groups": run_select(
            "SELECT g.id, g.name FROM person_groups g JOIN person_group_members m ON m.group_id = g.id "
            "WHERE m.person_id = %(p)s ORDER BY lower(g.name)",
            {"p": person_id},
        )}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}
