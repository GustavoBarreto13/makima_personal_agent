"""Camada de lógica — etiquetas (tags) das tarefas da Kaguya.

Terceira peça da **camada de lógica única** (junto de ``tools_tasks.py`` e
``tools_projects.py``). Aqui vive TODA a regra de negócio de tags; o canal Telegram
(``tools.py`` → agente) e o canal webapp (router ``/api/tasks/*``) são fachadas finas e
paritárias sobre estas funções (princípio de paridade de canais — FR-005/FR-006 da fatia 013).

O que é uma "tag": uma etiqueta leve de contexto/energia/tempo (ex.: ``mercado``, ``5min``,
``alta-energia``). Uma tarefa pode ter várias tags e uma tag pode estar em várias tarefas —
relação **N:N** (muitos-para-muitos) feita pela tabela de ligação ``task_tag_links``.

Convenções (iguais às outras tools):
    - Funções de **mutação** retornam ``{"status": "ok"|"error", ...}``.
    - Funções de **listagem** retornam o dado direto (lista/dict, sem "status").
    - Acesso ao banco via ``agents.db`` (psycopg2 síncrono).

Nome único ignorando caixa: o índice ``uq_task_tags_name`` (``LOWER(name)``) garante que
``Mercado`` e ``mercado`` são a MESMA tag — nunca duplicamos (SC-002 da fatia 013).

Dependência só de ``agents.db`` (sentido único: ``tools_tasks`` importa daqui, nunca o
contrário no topo do módulo — para evitar import circular). As poucas funções que precisam
de helpers de ``tools_tasks`` fazem o import **dentro** da função (lazy).
"""

from typing import Optional

from agents.db import get_conn, run_select, run_dml


# ─────────────────────────────────────────────────────────────────────────────
# Helpers internos transacionais (recebem um cursor já aberto)
# ─────────────────────────────────────────────────────────────────────────────
# Estes helpers NÃO abrem conexão própria: recebem o ``cur`` da transação em
# andamento. Assim, criar/editar uma tarefa e gravar suas tags acontece tudo na
# MESMA transação (ou tudo persiste, ou nada — atomicidade).
def _normalize_tag_name(name: str) -> str:
    """Limpa o nome de uma tag: tira espaços e um eventual ``#`` colado na frente.

    O quick-add manda os nomes já sem o ``#`` (o parser remove), mas o agente/Telegram
    pode mandar com o ``#``; normalizamos aqui para não criar a tag "#mercado" por engano.

    Args:
        name: Nome cru da tag (ex.: "#Mercado ", "  5min").

    Returns:
        O nome limpo (ex.: "Mercado", "5min"); string vazia se não sobrar nada.
    """
    # ``lstrip("#")`` remove só os ``#`` do começo; ``strip()`` tira espaços das pontas.
    return name.strip().lstrip("#").strip() if name else ""


def _resolve_or_create_tag(cur, name: str) -> Optional[int]:
    """Devolve o id de uma tag pelo nome, criando-a se ainda não existir (case-insensitive).

    É a peça que garante o reuso: pedir a tag "mercado" quando já existe "Mercado" devolve
    o id da existente — nunca cria uma segunda (SC-002). Usa ``ON CONFLICT`` sobre o índice
    funcional ``LOWER(name)`` para fazer isso numa só ida ao banco no caminho feliz.

    Args:
        cur: Cursor psycopg2 ativo (dentro de uma transação).
        name: Nome da tag (será normalizado).

    Returns:
        O id da tag (existente ou recém-criada), ou ``None`` se o nome ficar vazio após
        normalizar (nesse caso o chamador deve ignorar — não é uma tag válida).
    """
    nome = _normalize_tag_name(name)
    if not nome:
        return None  # "#" solto ou só espaços → não é tag

    # Tenta inserir. Se já existir (colisão no índice LOWER(name)), ON CONFLICT DO NOTHING
    # não insere nada e o RETURNING não devolve linha — então caímos no SELECT abaixo.
    # DO NOTHING (em vez de DO UPDATE) preserva a CAIXA original da primeira vez que a tag
    # foi criada (não viramos "Mercado" em "mercado" só porque alguém digitou minúsculo).
    cur.execute(
        "INSERT INTO task_tags (name) VALUES (%s) "
        "ON CONFLICT (LOWER(name)) DO NOTHING RETURNING id",
        (nome,),
    )
    row = cur.fetchone()
    if row:
        return row[0]  # caminho feliz: tag nova criada

    # Já existia: busca o id da tag existente ignorando a caixa.
    cur.execute("SELECT id FROM task_tags WHERE LOWER(name) = LOWER(%s)", (nome,))
    existing = cur.fetchone()
    return existing[0] if existing else None


def _set_task_tags(cur, task_id: int, names: list) -> None:
    """Define o conjunto EXATO de tags de uma tarefa (semântica "set": substitui tudo).

    Apaga os vínculos atuais e recria a partir da lista informada. Usado por
    ``create_task``/``update_task``: o webapp manda a lista completa de tags da tarefa, e
    aqui ela vira a verdade. Lista vazia = tarefa sem nenhuma tag.

    Args:
        cur: Cursor psycopg2 ativo.
        task_id: Id da tarefa.
        names: Lista de nomes de tag (podem ter ``#`` e caixa variada; normalizamos).
    """
    # Zera os vínculos atuais — depois reconstruímos a partir da lista nova.
    cur.execute("DELETE FROM task_tag_links WHERE task_id = %s", (task_id,))

    # ``seen`` evita vincular a mesma tag duas vezes quando a lista traz "mercado" e
    # "Mercado" (resolvem para o mesmo id).
    seen: set[int] = set()
    for raw in names or []:
        tag_id = _resolve_or_create_tag(cur, raw)
        if tag_id is None or tag_id in seen:
            continue
        seen.add(tag_id)
        # ON CONFLICT DO NOTHING: a PK composta (task_id, tag_id) já impede duplicar,
        # mas deixamos explícito para não estourar se algo escorregar.
        cur.execute(
            "INSERT INTO task_tag_links (task_id, tag_id) VALUES (%s, %s) "
            "ON CONFLICT DO NOTHING",
            (task_id, tag_id),
        )


def _attach_tags(parents: list) -> list:
    """Anexa as tags a cada tarefa de uma lista, sob a chave ``tags``.

    Faz UMA query para todas as tarefas de uma vez (evita N+1 — uma query por listagem),
    exatamente como ``_attach_subtasks``/``_attach_recurrence`` fazem em ``tools_tasks.py``.
    Define sempre a chave ``tags`` (lista, possivelmente vazia) para um shape de resposta
    consistente que o frontend pode confiar.

    Args:
        parents: Lista de tarefas já serializadas (cada uma com ``id``).

    Returns:
        A mesma lista, com ``tags`` = ``[{id, name, color}, ...]`` em cada item.
    """
    # Inicializa a chave em todos (mesmo os sem tag) para o shape ser estável.
    for p in parents:
        p["tags"] = []
    ids = [p["id"] for p in parents]
    if not ids:
        return parents

    # JOIN da ligação com a tabela de tags; ``ANY(%(ids)s)`` casa todos os task_id de uma vez.
    rows = run_select(
        """
        SELECT l.task_id, t.id, t.name, t.color
        FROM task_tag_links l
        JOIN task_tags t ON t.id = l.tag_id
        WHERE l.task_id = ANY(%(ids)s)
        ORDER BY LOWER(t.name)
        """,
        {"ids": ids},
    )
    # Indexa as tarefas por id para distribuir as tags em O(n).
    by_id = {p["id"]: p for p in parents}
    for r in rows:
        parent = by_id.get(r["task_id"])
        if parent is not None:
            parent["tags"].append({"id": r["id"], "name": r["name"], "color": r["color"]})
    return parents


# ─────────────────────────────────────────────────────────────────────────────
# CRUD de tags (gestão direta do vocabulário de etiquetas)
# ─────────────────────────────────────────────────────────────────────────────
def list_tags() -> list:
    """Lista todas as tags cadastradas, em ordem alfabética (ignorando caixa).

    Returns:
        Lista de dicionários ``{id, name, color}``. É uma **listagem** (sem "status").
    """
    return run_select("SELECT id, name, color FROM task_tags ORDER BY LOWER(name)")


def create_tag(name: str, color: Optional[str] = None) -> dict:
    """Cria uma tag nova (ou avisa se já existe uma com o mesmo nome ignorando caixa).

    Args:
        name: Nome da tag (ex.: "mercado").
        color: Cor de exibição do chip (hex/oklch, opcional).

    Returns:
        ``{"status": "ok", "id": <int>}`` ou ``{"status": "error", "message": ...}``.
    """
    nome = _normalize_tag_name(name)
    if not nome:
        return {"status": "error", "message": "O nome da tag não pode ser vazio."}
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Insere; se colidir no índice LOWER(name), não cria e devolvemos um erro amigável.
            cur.execute(
                "INSERT INTO task_tags (name, color) VALUES (%s, %s) "
                "ON CONFLICT (LOWER(name)) DO NOTHING RETURNING id",
                (nome, color),
            )
            row = cur.fetchone()
            if not row:
                return {"status": "error", "message": f"Já existe uma tag '{nome}'."}
            new_id = row[0]
    return {"status": "ok", "id": new_id, "message": f"Tag '{nome}' criada."}


def update_tag(tag_id: int, name: Optional[str] = None, color: Optional[str] = None) -> dict:
    """Renomeia e/ou recolore uma tag.

    Renomear para um nome que já é de outra tag (ignorando caixa) é rejeitado com mensagem
    clara (o índice único impediria de qualquer jeito).

    Args:
        tag_id: Id da tag.
        name: Novo nome (opcional).
        color: Nova cor (opcional).

    Returns:
        Dicionário de status. Erro se nada for informado ou a tag não existir.
    """
    # Monta dinamicamente só os campos enviados (PATCH parcial — não sobrescreve com NULL).
    sets, params = [], {"id": tag_id}
    if name is not None:
        nome = _normalize_tag_name(name)
        if not nome:
            return {"status": "error", "message": "O nome da tag não pode ser vazio."}
        sets.append("name = %(name)s")
        params["name"] = nome
    if color is not None:
        sets.append("color = %(color)s")
        params["color"] = color
    if not sets:
        return {"status": "error", "message": "Nada para atualizar."}

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Se está renomeando, garante que o novo nome não colide com OUTRA tag.
            if name is not None:
                cur.execute(
                    "SELECT 1 FROM task_tags WHERE LOWER(name) = LOWER(%s) AND id <> %s",
                    (params["name"], tag_id),
                )
                if cur.fetchone():
                    return {"status": "error", "message": f"Já existe uma tag '{params['name']}'."}
            cur.execute(f"UPDATE task_tags SET {', '.join(sets)} WHERE id = %(id)s", params)
            if cur.rowcount == 0:
                return {"status": "error", "message": "Tag não encontrada."}
    return {"status": "ok", "message": "Tag atualizada."}


def delete_tag(tag_id: int) -> dict:
    """Exclui uma tag; os vínculos com tarefas somem (cascade), as tarefas permanecem.

    A FK ``task_tag_links.tag_id`` usa ``ON DELETE CASCADE`` — o próprio banco apaga os
    vínculos. Nenhuma tarefa é apagada: ela só perde aquela etiqueta.

    Args:
        tag_id: Id da tag a excluir.

    Returns:
        Dicionário de status.
    """
    affected = run_dml("DELETE FROM task_tags WHERE id = %(id)s", {"id": tag_id})
    if affected == 0:
        return {"status": "error", "message": "Tag não encontrada."}
    return {"status": "ok", "message": "Tag excluída."}


# ─────────────────────────────────────────────────────────────────────────────
# Aplicar / remover tags de uma tarefa específica (uso incremental — agente)
# ─────────────────────────────────────────────────────────────────────────────
def add_task_tag(task_id: int, tag: str) -> dict:
    """Adiciona UMA tag a uma tarefa (cria a tag se não existir), sem mexer nas demais.

    Diferente de ``_set_task_tags`` (que substitui tudo): esta soma uma tag ao conjunto
    atual. É o que a Kaguya usa quando o usuário diz "põe a tag mercado nessa tarefa".

    Args:
        task_id: Id da tarefa.
        tag: Nome da tag a adicionar.

    Returns:
        Dicionário de status.
    """
    nome = _normalize_tag_name(tag)
    if not nome:
        return {"status": "error", "message": "O nome da tag não pode ser vazio."}
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Confirma que a tarefa existe e está viva (não na lixeira).
            cur.execute("SELECT 1 FROM tasks WHERE id = %s AND deleted_at IS NULL", (task_id,))
            if not cur.fetchone():
                return {"status": "error", "message": "Tarefa não encontrada."}
            tag_id = _resolve_or_create_tag(cur, nome)
            cur.execute(
                "INSERT INTO task_tag_links (task_id, tag_id) VALUES (%s, %s) "
                "ON CONFLICT DO NOTHING",
                (task_id, tag_id),
            )
    return {"status": "ok", "message": f"Tag '{nome}' adicionada."}


def remove_task_tag(task_id: int, tag: str) -> dict:
    """Remove UMA tag de uma tarefa (a tag em si continua existindo no vocabulário).

    Args:
        task_id: Id da tarefa.
        tag: Nome da tag a remover.

    Returns:
        Dicionário de status.
    """
    nome = _normalize_tag_name(tag)
    if not nome:
        return {"status": "error", "message": "O nome da tag não pode ser vazio."}
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Apaga só o vínculo desta tarefa com a tag de nome informado (ignorando caixa).
            cur.execute(
                """
                DELETE FROM task_tag_links
                WHERE task_id = %s
                  AND tag_id = (SELECT id FROM task_tags WHERE LOWER(name) = LOWER(%s))
                """,
                (task_id, nome),
            )
            if cur.rowcount == 0:
                return {"status": "error", "message": f"A tarefa não tinha a tag '{nome}'."}
    return {"status": "ok", "message": f"Tag '{nome}' removida."}


# ─────────────────────────────────────────────────────────────────────────────
# Listagem por tag
# ─────────────────────────────────────────────────────────────────────────────
def list_tasks_by_tag(name: str) -> list:
    """Lista as tarefas-pai **abertas** que têm uma determinada tag.

    Resolve a tag por nome (ignorando caixa) e traz as tarefas vivas, não-concluídas, com o
    nome da lista em cada uma (igual a ``search_tasks``) e as tags anexadas. Idêntico nos
    dois canais (paridade — FR-005).

    Args:
        name: Nome da tag (com ou sem ``#``).

    Returns:
        Lista de tarefas serializadas (vazia se a tag não existir ou não tiver tarefas).
        É uma **listagem**.
    """
    # Import lazy: ``tools_tasks`` importa deste módulo, então não podemos importá-lo no
    # topo (seria circular). Dentro da função o Python já resolveu os dois módulos.
    from agents.kaguya.tools_tasks import _qualified, _serialize_task

    nome = _normalize_tag_name(name)
    if not nome:
        return []
    rows = run_select(
        f"""
        SELECT {_qualified("t")}, p.name AS project_name
        FROM tasks t
        JOIN task_tag_links l ON l.task_id = t.id
        JOIN task_tags g       ON g.id = l.tag_id
        JOIN task_projects p   ON p.id = t.project_id
        WHERE LOWER(g.name) = LOWER(%(name)s)
          AND t.parent_id IS NULL
          AND t.deleted_at IS NULL
          AND t.completed_at IS NULL
        ORDER BY t.due_date NULLS LAST, t.priority DESC, t.position
        """,
        {"name": nome},
    )
    out = []
    for r in rows:
        item = _serialize_task(r)
        item["project_name"] = r["project_name"]
        out.append(item)
    # Anexa TODAS as tags de cada tarefa (não só a filtrada) para os chips ficarem completos.
    return _attach_tags(out)
