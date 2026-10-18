"""Relacionamentos (família, amigos, trabalho...) como lista CONFIGURÁVEL — Komi, spec 077.

Cada pessoa tem uma ``category`` (o ``slug`` de um relacionamento). A lista vem semeada com
Família, Amigos, Trabalho e Outros, e o dono cria, renomeia, troca o ícone, reordena e
arquiva os seus. Arquivar nunca apaga: as pessoas são movidas para outro relacionamento.

O ``icon`` é um nome do registro de ícones do Design System (``webapp/frontend/src/design/ui/icons.ts``);
o backend só confere o formato — quem garante que o nome existe é a tela.

Usage:
    >>> from agents.komi.tools_categories import slug_from_label
    >>> slug_from_label("Colegas da Faculdade!")
    'colegas_da_faculdade'
"""

from __future__ import annotations

import re

from agents.komi import naming
from agents.komi.rows import valor
from agents.komi.tools import get_conn, run_select

_ICON_RE = re.compile(r"^[a-z][a-z0-9-]{0,30}$")


def slug_from_label(label: str) -> str:
    """Gerar o identificador (slug) de um relacionamento a partir do nome.

    Args:
        label: Nome digitado ("Colegas da Faculdade!").

    Returns:
        Minúsculas, sem acento, só letras/números/``_``, até 30 caracteres. Vazio se o nome
        não tiver nenhuma letra ou número.

    Example:
        >>> slug_from_label("Família próxima")
        'familia_proxima'
        >>> slug_from_label("!!!")
        ''
    """
    return re.sub(r"[^a-z0-9]+", "_", naming.norm(label)).strip("_")[:30]


def _nome_ja_existe(cur, label: str, ignorar_slug: str | None = None) -> bool:
    """Dizer se já existe um relacionamento ATIVO com este nome, ignorando caixa, acento e pontuação.

    "Família", "familia" e "Família!" contam como o mesmo nome — para a pessoa, são duplicatas.

    Args:
        cur: Cursor psycopg2 ativo.
        label: Nome pretendido.
        ignorar_slug: Relacionamento a desconsiderar (o próprio, ao renomear).

    Returns:
        ``True`` se o nome já está em uso.
    """
    cur.execute("SELECT slug, label FROM person_categories WHERE archived = FALSE")
    alvo = slug_from_label(label)
    return any(slug_from_label(valor(r, 1, "label")) == alvo and valor(r, 0, "slug") != ignorar_slug for r in cur.fetchall())


def list_categories(include_archived: bool = False) -> dict:
    """Listar os relacionamentos, na ordem escolhida, com quantas pessoas vivas há em cada um.

    Args:
        include_archived: Se ``True``, traz também os arquivados.

    Returns:
        ``{"status": "ok", "categories": [{slug, label, icon, position, archived, people_count}, ...]}``.
    """
    filtro = "" if include_archived else "WHERE c.archived = FALSE"
    try:
        linhas = run_select(
            f"""
            SELECT c.slug, c.label, c.icon, c.position, c.archived,
                   COUNT(p.id) FILTER (WHERE p.deleted = FALSE) AS people_count
            FROM person_categories c LEFT JOIN people p ON p.category = c.slug
            {filtro}
            GROUP BY c.id ORDER BY c.position, c.id
            """
        )
        return {"status": "ok", "categories": linhas}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}


def create_category(label: str, icon: str = "person", slug: str | None = None) -> dict:
    """Criar um relacionamento novo (vai para o fim da lista).

    Args:
        label: Nome exibido ("Colegas da faculdade").
        icon: Nome de um ícone do Design System.
        slug: Identificador (opcional; por padrão sai do nome e ganha ``_2``, ``_3``... se já existir).

    Returns:
        ``{"status": "ok", "slug": ..., "message": ...}`` ou ``{"status": "error", "message": ...}``.
    """
    nome = naming.clean(label)
    if not nome:
        return {"status": "error", "message": "O relacionamento precisa de um nome."}
    if not _ICON_RE.match(icon or ""):
        return {"status": "error", "message": "Ícone inválido."}
    base = slug_from_label(naming.clean(slug) or nome)
    if not base:
        return {"status": "error", "message": "Use ao menos uma letra ou número no nome."}
    try:
        with get_conn() as conn, conn.cursor() as cur:
            if _nome_ja_existe(cur, nome):
                return {"status": "error", "message": f"Já existe o relacionamento '{nome}'."}
            # Se o slug já existe (inclusive de um arquivado), acrescenta _2, _3... até achar um livre.
            escolhido, n = base, 1
            while True:
                cur.execute("SELECT 1 FROM person_categories WHERE slug = %s", (escolhido,))
                if not cur.fetchone():
                    break
                n += 1
                escolhido = f"{base[:26]}_{n}"
            cur.execute("SELECT COALESCE(MAX(position), -1) + 1 AS proxima FROM person_categories")
            posicao = valor(cur.fetchone(), 0, "proxima")
            cur.execute(
                "INSERT INTO person_categories (slug, label, icon, position) VALUES (%s, %s, %s, %s)",
                (escolhido, nome, icon, posicao),
            )
        return {"status": "ok", "slug": escolhido, "message": f"Relacionamento '{nome}' criado."}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}


def update_category(slug: str, label: str | None = None, icon: str | None = None) -> dict:
    """Renomear um relacionamento e/ou trocar o ícone (o ``slug`` não muda).

    Args:
        slug: Identificador do relacionamento.
        label: Novo nome (opcional).
        icon: Novo ícone (opcional).

    Returns:
        ``{"status": "ok", "message": "..."}`` ou ``{"status": "error", "message": ...}``.
    """
    sets: list[str] = []
    valores: list = []
    if label is not None:
        nome = naming.clean(label)
        if not nome:
            return {"status": "error", "message": "O relacionamento precisa de um nome."}
        sets.append("label = %s"); valores.append(nome)
    if icon is not None:
        if not _ICON_RE.match(icon):
            return {"status": "error", "message": "Ícone inválido."}
        sets.append("icon = %s"); valores.append(icon)
    if not sets:
        return {"status": "error", "message": "Nenhum campo para atualizar."}
    try:
        with get_conn() as conn, conn.cursor() as cur:
            if label is not None and _nome_ja_existe(cur, naming.clean(label), ignorar_slug=slug):
                return {"status": "error", "message": f"Já existe o relacionamento '{naming.clean(label)}'."}
            cur.execute(f"UPDATE person_categories SET {', '.join(sets)} WHERE slug = %s", [*valores, slug])
            if cur.rowcount == 0:
                return {"status": "error", "message": "Relacionamento não encontrado."}
        return {"status": "ok", "message": "Relacionamento atualizado."}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}


def reorder_categories(slugs: list[str]) -> dict:
    """Definir a ordem dos relacionamentos.

    Args:
        slugs: A lista de slugs na ordem desejada. Os que não aparecerem vão para o fim,
            mantendo a ordem em que estavam.

    Returns:
        ``{"status": "ok", "message": "..."}`` ou ``{"status": "error", "message": ...}``.
    """
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT slug FROM person_categories ORDER BY position, id")
            todos = [valor(r, 0, "slug") for r in cur.fetchall()]
            desconhecidos = [s for s in slugs if s not in todos]
            if desconhecidos:
                return {"status": "error", "message": f"Relacionamento inexistente: {', '.join(desconhecidos)}."}
            ordem = list(dict.fromkeys(slugs)) + [s for s in todos if s not in slugs]
            for posicao, slug in enumerate(ordem):
                cur.execute("UPDATE person_categories SET position = %s WHERE slug = %s", (posicao, slug))
        return {"status": "ok", "message": "Ordem atualizada."}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}


def archive_category(slug: str, move_to: str | None = None) -> dict:
    """Arquivar um relacionamento, movendo as pessoas dele para outro.

    Nada é apagado. Se há pessoas (inclusive as excluídas, para uma futura restauração não cair
    num relacionamento arquivado) e ``move_to`` não foi dado, devolve um erro dizendo quantas
    são — a tela usa isso para perguntar "para onde movo?".

    Args:
        slug: Relacionamento a arquivar.
        move_to: Slug (ativo) que receberá as pessoas.

    Returns:
        ``{"status": "ok", "moved": n, "message": ...}`` ou ``{"status": "error", "message": ...}``.
    """
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT archived FROM person_categories WHERE slug = %s", (slug,))
            atual = cur.fetchone()
            if not atual:
                return {"status": "error", "message": "Relacionamento não encontrado."}
            if valor(atual, 0, "archived"):
                return {"status": "error", "message": "Esse relacionamento já está arquivado."}
            cur.execute("SELECT COUNT(*) AS n FROM person_categories WHERE archived = FALSE AND slug <> %s", (slug,))
            if valor(cur.fetchone(), 0, "n") == 0:
                return {"status": "error", "message": "É preciso manter pelo menos um relacionamento ativo."}
            cur.execute("SELECT COUNT(*) AS n FROM people WHERE category = %s", (slug,))
            quantas = valor(cur.fetchone(), 0, "n")
            if quantas and not move_to:
                return {"status": "error", "needs_move_to": True, "people_count": quantas,
                        "message": f"{quantas} pessoa(s) usam esse relacionamento. Para onde movê-las?"}
            if quantas:
                cur.execute("SELECT 1 FROM person_categories WHERE slug = %s AND archived = FALSE AND slug <> %s", (move_to, slug))
                if not cur.fetchone():
                    return {"status": "error", "message": "O destino precisa ser outro relacionamento ativo."}
                cur.execute("UPDATE people SET category = %s, updated_at = NOW() WHERE category = %s", (move_to, slug))
            cur.execute("UPDATE person_categories SET archived = TRUE WHERE slug = %s", (slug,))
        return {"status": "ok", "moved": quantas, "message": "Relacionamento arquivado."}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}


def unarchive_category(slug: str) -> dict:
    """Trazer de volta um relacionamento arquivado (as pessoas movidas continuam onde estão).

    Args:
        slug: Relacionamento a reativar.

    Returns:
        ``{"status": "ok", "message": "..."}`` ou ``{"status": "error", "message": ...}``.
    """
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("UPDATE person_categories SET archived = FALSE WHERE slug = %s AND archived = TRUE", (slug,))
            if cur.rowcount == 0:
                return {"status": "error", "message": "Relacionamento não encontrado ou já ativo."}
        return {"status": "ok", "message": "Relacionamento reativado."}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}
