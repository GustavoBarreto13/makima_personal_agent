"""Camada de lógica única do agente Komi — identidade canônica de pessoas.

Toda a lógica de negócio de pessoas vive aqui: CRUD, resolução smart-match,
vínculos polimórficos e hub de agregação. O agente Telegram (komi_agent) e o
router FastAPI (/api/pessoas/*) são fachadas finas sobre estas funções.

Princípio de paridade de canais (FR-015): a *página visual* de cards é webapp-only;
o equivalente Telegram é o resumo conversacional de get_person_summary.

Usage:
    from agents.komi.tools import create_person, find_people, get_person_summary
"""

import unicodedata  # Para remover acentos na normalização (smart-match)
import uuid         # Para gerar IDs únicos de pessoas (UUID v4)
from datetime import date as _date  # Para datas importantes

import psycopg2.extras  # RealDictCursor — retorna linhas como dicts

from agents.db import get_conn, run_select  # Helpers PostgreSQL compartilhados


# ─────────────────────────────────────────────────────────────────────────────
# Helper de normalização (núcleo do smart-match)
# ─────────────────────────────────────────────────────────────────────────────

def _norm(s: str) -> str:
    """Normalizar string para resolução case/acento-insensitive.

    Converte para minúsculas e remove acentos via decomposição NFD.
    Usado para comparar nomes e apelidos sem depender de caixa ou acento.

    Ex.: "Ana", "ANA", "Aná" → todos resultam em "ana".

    Args:
        s: String original (pode ter acentos, maiúsculas, espaços extras).

    Returns:
        String normalizada (minúscula, sem acentos).
    """
    # strip() remove espaços nas bordas; lower() deixa tudo minúsculo
    s = s.strip().lower()
    # NFD decompõe caracteres acentuados em letra base + acento separado
    nfd = unicodedata.normalize("NFD", s)
    # Mantém apenas os caracteres que NÃO são marcas combinantes (acentos)
    return "".join(c for c in nfd if unicodedata.category(c) != "Mn")


# ─────────────────────────────────────────────────────────────────────────────
# CRUD de identidade — Onda 1 / US1
# ─────────────────────────────────────────────────────────────────────────────

def create_person(
    name: str,
    relationship: str = "",
    category: str = "outros",
    phone: str = "",
    email: str = "",
    instagram: str = "",
    telegram: str = "",
    city: str = "",
    avatar_url: str = "",
    notes: str = "",
) -> dict:
    """Criar uma nova pessoa no cadastro canônico.

    Gera um UUID único, calcula o campo `normalizado` e insere na tabela `people`.
    Retorna erro se já existir uma pessoa viva com o mesmo nome normalizado.

    Args:
        name: Nome de exibição (obrigatório, não-vazio).
        relationship: Tipo de relação — "amigo/amiga", "família", "trabalho"... (livre).
        category: Categoria canônica — "familia", "amigos", "trabalho" ou "outros".
                  Dirige os filtros e as cores do frontend.
        phone: Telefone de contato.
        email: E-mail de contato.
        instagram: Handle do Instagram (sem normalizar).
        telegram: Handle do Telegram.
        city: Cidade.
        avatar_url: URL do avatar; a UI usa iniciais quando ausente.
        notes: Observações livres.

    Returns:
        {"status": "ok", "id": <uuid>, "message": "..."} ou {"status": "error", "message": ...}.
    """
    if not name or not name.strip():
        return {"status": "error", "message": "O nome não pode ser vazio."}

    # Valida a categoria; cai em "outros" se inválida
    categorias_validas = {"familia", "amigos", "trabalho", "outros"}
    if category not in categorias_validas:
        category = "outros"

    # O campo normalizado é a chave de resolução — gerado aqui, nunca pelo banco
    normalizado = _norm(name)
    person_id = str(uuid.uuid4())

    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO people
                        (id, name, normalizado, relationship, category, phone, email,
                         instagram, telegram, city, avatar_url, notes)
                    VALUES
                        (%(id)s, %(name)s, %(normalizado)s, %(relationship)s, %(category)s,
                         %(phone)s, %(email)s, %(instagram)s, %(telegram)s, %(city)s,
                         %(avatar_url)s, %(notes)s)
                    """,
                    {
                        "id": person_id,
                        "name": name.strip(),
                        "normalizado": normalizado,
                        "relationship": relationship or None,
                        "category": category,
                        "phone": phone or None,
                        "email": email or None,
                        "instagram": instagram or None,
                        "telegram": telegram or None,
                        "city": city or None,
                        "avatar_url": avatar_url or None,
                        "notes": notes or None,
                    },
                )
        return {"status": "ok", "id": person_id, "message": f"{name} cadastrada com sucesso."}
    except Exception as e:
        msg = str(e)
        # Índice único parcial disparado: pessoa viva com mesmo nome normalizado já existe
        if "idx_people_normalizado_vivo" in msg or "unique" in msg.lower():
            return {"status": "error", "message": f"Já existe uma pessoa viva com o nome '{name}' (ou variação sem acento/caixa)."}
        return {"status": "error", "message": msg}


def create_person_on_cursor(
    cur,
    name: str,
    relationship: str = "",
    category: str = "outros",
    phone: str = "",
    email: str = "",
    instagram: str = "",
    telegram: str = "",
    city: str = "",
    avatar_url: str = "",
    notes: str = "",
) -> dict:
    """Inserir pessoa usando um cursor já aberto (sem abrir conexão própria).

    Versão transacional de create_person — opera no cursor do chamador sem commitar.
    Permite criar uma pessoa e vinculá-la a um item na mesma transação (tudo-ou-nada).

    Args:
        cur: Cursor psycopg2 ativo (dentro de uma transação do chamador).
        category: Categoria canônica — "familia", "amigos", "trabalho" ou "outros".
        Demais parâmetros: idênticos a create_person.

    Returns:
        {"status": "ok", "id": <uuid>} ou {"status": "error", "message": ...}.
        Em caso de erro o chamador deve abortar a transação.
    """
    if not name or not name.strip():
        return {"status": "error", "message": "O nome não pode ser vazio."}

    # Valida categoria
    categorias_validas = {"familia", "amigos", "trabalho", "outros"}
    if category not in categorias_validas:
        category = "outros"

    normalizado = _norm(name)
    person_id = str(uuid.uuid4())

    try:
        cur.execute(
            """
            INSERT INTO people
                (id, name, normalizado, relationship, category, phone, email,
                 instagram, telegram, city, avatar_url, notes)
            VALUES
                (%(id)s, %(name)s, %(normalizado)s, %(relationship)s, %(category)s,
                 %(phone)s, %(email)s, %(instagram)s, %(telegram)s, %(city)s,
                 %(avatar_url)s, %(notes)s)
            """,
            {
                "id": person_id,
                "name": name.strip(),
                "normalizado": normalizado,
                "relationship": relationship or None,
                "category": category,
                "phone": phone or None,
                "email": email or None,
                "instagram": instagram or None,
                "telegram": telegram or None,
                "city": city or None,
                "avatar_url": avatar_url or None,
                "notes": notes or None,
            },
        )
        return {"status": "ok", "id": person_id}
    except Exception as e:
        msg = str(e)
        if "idx_people_normalizado_vivo" in msg or "unique" in msg.lower():
            return {"status": "error", "message": f"Já existe uma pessoa viva com o nome '{name}'."}
        return {"status": "error", "message": msg}


def update_person(person_id: str, **campos) -> dict:
    """Atualizar campos do perfil de uma pessoa existente.

    Só altera os campos passados (atualização parcial). Recalcula `normalizado`
    automaticamente quando `name` é alterado. Toca `updated_at` sempre.

    Args:
        person_id: UUID da pessoa a editar.
        **campos: Campos a atualizar — name, relationship, phone, email,
                  instagram, telegram, city, avatar_url, notes.

    Returns:
        {"status": "ok", "message": "..."} ou {"status": "error", "message": ...}.
    """
    if not campos:
        return {"status": "error", "message": "Nenhum campo fornecido para atualizar."}

    # Se o nome mudou, recalcula o campo normalizado
    if "name" in campos:
        campos["normalizado"] = _norm(campos["name"])

    # Monta o SET dinâmico com apenas os campos fornecidos
    # updated_at entra uma única vez, no literal do SQL — não via campos (evita coluna duplicada)
    updates = ", ".join(f"{k} = %({k})s" for k in campos)

    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"UPDATE people SET {updates}, updated_at = NOW() WHERE id = %(person_id)s AND deleted = FALSE",
                    {**campos, "person_id": person_id},
                )
                if cur.rowcount == 0:
                    return {"status": "error", "message": "Pessoa não encontrada ou já excluída."}
        return {"status": "ok", "message": "Perfil atualizado com sucesso."}
    except Exception as e:
        msg = str(e)
        if "idx_people_normalizado_vivo" in msg or "unique" in msg.lower():
            return {"status": "error", "message": "Já existe outra pessoa viva com esse nome."}
        return {"status": "error", "message": msg}


def delete_person(person_id: str) -> dict:
    """Excluir uma pessoa por soft delete (deleted = TRUE).

    Os vínculos (person_links), apelidos (person_aliases) e datas (person_dates)
    permanecem no banco para preservar histórico. A pessoa some das buscas e do grid.

    Args:
        person_id: UUID da pessoa a excluir.

    Returns:
        {"status": "ok", "message": "..."} ou {"status": "error", "message": ...}.
    """
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE people SET deleted = TRUE, updated_at = NOW() WHERE id = %s AND deleted = FALSE",
                    (person_id,),
                )
                if cur.rowcount == 0:
                    return {"status": "error", "message": "Pessoa não encontrada ou já excluída."}
        return {"status": "ok", "message": "Pessoa removida do cadastro (histórico preservado)."}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def add_alias(person_id: str, alias: str) -> dict:
    """Adicionar um apelido a uma pessoa.

    O apelido normalizado deve ser único globalmente — um apelido aponta para
    no máximo uma pessoa. Retorna erro claro se o apelido já pertencer a outra pessoa.

    Args:
        person_id: UUID da pessoa que receberá o apelido.
        alias: Apelido a adicionar (ex.: "Aninha", "nana").

    Returns:
        {"status": "ok", "message": "..."} ou {"status": "error", "message": ...}.
    """
    if not alias or not alias.strip():
        return {"status": "error", "message": "O apelido não pode ser vazio."}

    normalizado = _norm(alias)

    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                # Verifica se a pessoa existe e está viva
                cur.execute("SELECT 1 FROM people WHERE id = %s AND deleted = FALSE", (person_id,))
                if not cur.fetchone():
                    return {"status": "error", "message": "Pessoa não encontrada."}

                cur.execute(
                    "INSERT INTO person_aliases (person_id, alias, normalizado) VALUES (%s, %s, %s)",
                    (person_id, alias.strip(), normalizado),
                )
        return {"status": "ok", "message": f"Apelido '{alias}' adicionado com sucesso."}
    except Exception as e:
        msg = str(e)
        if "idx_alias_normalizado" in msg or "unique" in msg.lower():
            # Descobre a qual pessoa o apelido pertence para dar uma mensagem clara
            rows = run_select(
                "SELECT p.name FROM person_aliases a JOIN people p ON p.id = a.person_id WHERE a.normalizado = %(n)s LIMIT 1",
                {"n": normalizado},
            )
            dono = rows[0]["name"] if rows else "outra pessoa"
            return {"status": "error", "message": f"O apelido '{alias}' já pertence a {dono}."}
        return {"status": "error", "message": msg}


def add_important_date(
    person_id: str,
    label: str,
    date: str,
    recurring: bool = True,
) -> dict:
    """Adicionar uma data importante a uma pessoa.

    A partir da fase 026, o INSERT usa RETURNING id para que o hook de sync
    Komi→Kaguya saiba qual person_date_id foi gerado sem precisar de query adicional.

    Args:
        person_id: UUID da pessoa.
        label: Descrição da data (ex.: "aniversário", "formatura").
        date: Data no formato YYYY-MM-DD.
        recurring: Se True, a data repete todo ano (útil para aniversários).

    Returns:
        {"status": "ok", "id": int, "message": "..."} ou {"status": "error", "message": ...}.
        O campo "id" contém o ID gerado do person_date — necessário para gravar birthday_sync_links.
    """
    if not label or not label.strip():
        return {"status": "error", "message": "O label não pode ser vazio."}
    if not date:
        return {"status": "error", "message": "A data é obrigatória no formato YYYY-MM-DD."}

    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1 FROM people WHERE id = %s AND deleted = FALSE", (person_id,))
                if not cur.fetchone():
                    return {"status": "error", "message": "Pessoa não encontrada."}

                # RETURNING id: permite ao hook de sync saber o id criado sem query extra
                cur.execute(
                    "INSERT INTO person_dates (person_id, label, date, recurring) "
                    "VALUES (%s, %s, %s, %s) RETURNING id",
                    (person_id, label.strip(), date, recurring),
                )
                date_id = cur.fetchone()[0]  # id do registro recém-criado

        # Hook best-effort Komi→Kaguya: propaga aniversário para a Kaguya como tarefa type=birthday.
        # Fica FORA do bloco with get_conn() para não abortar o CRUD principal se o sync falhar.
        # O date_id foi obtido pelo RETURNING id acima — disponível aqui.
        try:
            from agents.kaguya import komi_sync as _ks
            _ks.push_person_date(date_id)
        except Exception:
            pass

        return {"status": "ok", "id": date_id, "message": f"Data '{label}' ({date}) adicionada com sucesso."}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def update_important_date(
    date_id: int,
    *,
    date: str | None = None,
    label: str | None = None,
    recurring: bool | None = None,
) -> dict:
    """Atualizar campos de uma data importante por ID (UPDATE parcial).

    Só altera os campos keyword-only passados. Permite editar label, data ou
    flag de recorrência de forma independente, sem sobrescrever os demais.
    Após a atualização, o hook Komi→Kaguya propaga a mudança para a tarefa
    correspondente (se existir link em birthday_sync_links).

    Args:
        date_id: ID numérico da person_date a atualizar.
        date: Nova data no formato YYYY-MM-DD (opcional).
        label: Novo label/descrição da data (opcional).
        recurring: Novo valor do flag de recorrência anual (opcional).

    Returns:
        {"status": "ok", "message": "Data atualizada."} ou {"status": "error", "message": ...}.

    Example:
        >>> update_important_date(42, date="2026-07-10")
        {"status": "ok", "message": "Data atualizada."}
        >>> update_important_date(42, label="aniversário de namoro", recurring=True)
        {"status": "ok", "message": "Data atualizada."}
    """
    # Exige pelo menos um campo — sem payload = erro claro (não UPDATE sem SET)
    if date is None and label is None and recurring is None:
        return {"status": "error", "message": "Nenhum campo para atualizar."}

    # Monta UPDATE parcial dinamicamente — apenas os campos passados entram no SET
    sets = []
    values: list = []
    if date is not None:
        sets.append("date = %s")
        values.append(date)
    if label is not None:
        sets.append("label = %s")
        values.append(label)
    if recurring is not None:
        sets.append("recurring = %s")
        values.append(recurring)

    # date_id no final dos parâmetros (para o WHERE id = %s)
    values.append(date_id)

    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"UPDATE person_dates SET {', '.join(sets)} WHERE id = %s",
                    values,
                )
                if cur.rowcount == 0:
                    # Nenhuma linha afetada = date_id não existe
                    return {"status": "error", "message": "Data não encontrada."}

        # Hook best-effort Komi→Kaguya: propaga a mudança para a tarefa correspondente.
        # O komi_sync.push_person_date compara o valor atual com o salvo — no-op se idêntico (anti-loop).
        try:
            from agents.kaguya import komi_sync as _ks
            _ks.push_person_date(date_id)
        except Exception:
            pass

        return {"status": "ok", "message": "Data atualizada."}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def delete_important_date(date_id: int) -> dict:
    """Remover uma data importante por ID (DELETE físico).

    Remove a linha de person_dates permanentemente. O banco apaga o link em
    birthday_sync_links automaticamente via ON DELETE CASCADE (sem DELETE explícito aqui).

    O task_id é lido ANTES do DELETE porque o CASCADE remove o link junto com a
    person_date — após o commit, o link já não existe e não seria possível lê-lo.

    Args:
        date_id: ID numérico da person_date a remover.

    Returns:
        {"status": "ok", "message": "Data removida."} ou {"status": "error", "message": ...}.
    """
    from agents.db import run_select  # importado aqui para não duplicar no topo

    # Lê o task_id do link ANTES do DELETE (o CASCADE vai apagá-lo junto)
    # Caso não haja link (data sem aniversário), linked_task_id fica None
    link_rows = run_select(
        "SELECT task_id FROM birthday_sync_links WHERE person_date_id = %s", (date_id,)
    )
    linked_task_id = link_rows[0]["task_id"] if link_rows else None

    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM person_dates WHERE id = %s", (date_id,))
                if cur.rowcount == 0:
                    return {"status": "error", "message": "Data não encontrada."}
                # Nota: birthday_sync_links com person_date_id = date_id é removido
                # automaticamente pelo ON DELETE CASCADE definido na tabela.

        # Hook best-effort Komi→Kaguya: soft-deleta a tarefa correspondente (scope='series').
        # remove_person_date recebe task_id (não date_id) para poder chamar delete_task.
        # O task_id foi lido ANTES do DELETE porque o CASCADE apaga o link junto com a date.
        if linked_task_id:
            try:
                from agents.kaguya import komi_sync as _ks
                _ks.remove_person_date(linked_task_id)
            except Exception:
                pass

        return {"status": "ok", "message": "Data removida."}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def list_people() -> dict:
    """Listar todas as pessoas vivas com a contagem de vínculos.

    Retorna dados para o grid: avatar/iniciais, nome, relacionamento e
    número de itens vinculados (link_count) em todos os domínios.

    Returns:
        {"status": "ok", "people": [{"id", "name", "relationship", "avatar_url", "link_count"}, ...]}.
    """
    try:
        rows = run_select(
            """
            SELECT
                p.id,
                p.name,
                p.relationship,
                p.category,
                p.avatar_url,
                COUNT(pl.id) AS link_count
            FROM people p
            LEFT JOIN person_links pl ON pl.person_id = p.id
            WHERE p.deleted = FALSE
            GROUP BY p.id, p.name, p.relationship, p.category, p.avatar_url
            ORDER BY p.name
            """
        )
        return {"status": "ok", "people": rows}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def find_people(query: str) -> dict:
    """Buscar pessoas por nome ou apelido (smart-match case/acento-insensitive).

    Casa o `query` normalizado contra `people.normalizado` E `person_aliases.normalizado`
    (UNION). Só retorna pessoas vivas (deleted = FALSE).

    A cardinalidade dirige o comportamento do agente (FR-007):
      - 0 matches → agente oferece criar a pessoa
      - 1 match  → agente usa direto (sem perguntar)
      - 2+ matches → agente pergunta qual antes de qualquer vínculo

    Args:
        query: Nome ou apelido digitado pelo usuário.

    Returns:
        {"status": "ok", "matches": [{"id", "name", "relationship"}, ...]}.
    """
    if not query or not query.strip():
        return {"status": "ok", "matches": []}

    norm_q = _norm(query)

    try:
        rows = run_select(
            """
            SELECT DISTINCT p.id, p.name, p.relationship
            FROM people p
            WHERE p.deleted = FALSE AND p.normalizado LIKE %(pattern)s

            UNION

            SELECT DISTINCT p.id, p.name, p.relationship
            FROM people p
            JOIN person_aliases a ON a.person_id = p.id
            WHERE p.deleted = FALSE AND a.normalizado LIKE %(pattern)s

            ORDER BY name
            """,
            {"pattern": f"{norm_q}%"},
        )
        return {"status": "ok", "matches": rows}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def get_person(person_id: str) -> dict:
    """Obter perfil completo de uma pessoa (sem vínculos cross-agent).

    Retorna o perfil + todos os apelidos + próximas datas importantes.
    É a base do resumo conversacional da US1 (sem depender de vínculos).

    Args:
        person_id: UUID da pessoa.

    Returns:
        {"status": "ok", "perfil": {...}, "aliases": [...], "datas": [...]}.
    """
    try:
        rows = run_select(
            "SELECT * FROM people WHERE id = %(id)s AND deleted = FALSE",
            {"id": person_id},
        )
        if not rows:
            return {"status": "error", "message": "Pessoa não encontrada."}

        perfil = rows[0]
        # Converte timestamps para string ISO para serialização JSON
        for f in ("created_at", "updated_at"):
            if perfil.get(f) and hasattr(perfil[f], "isoformat"):
                perfil[f] = perfil[f].isoformat()

        aliases = run_select(
            "SELECT alias, normalizado FROM person_aliases WHERE person_id = %(id)s ORDER BY alias",
            {"id": person_id},
        )

        # Próximas datas: ordena pela diferença em relação a hoje (ano ignorado nos recorrentes).
        # fase 026: inclui id (para PATCH/DELETE) e is_synced (True = tem tarefa Kaguya correspondente).
        # LEFT JOIN birthday_sync_links: se o link existir, is_synced = TRUE; senão = FALSE.
        datas = run_select(
            """
            SELECT
                pd.id,
                pd.label,
                pd.date::text,
                pd.recurring,
                CASE WHEN bsl.person_date_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_synced
            FROM person_dates pd
            LEFT JOIN birthday_sync_links bsl ON bsl.person_date_id = pd.id
            WHERE pd.person_id = %(id)s
            ORDER BY pd.date
            """,
            {"id": person_id},
        )

        return {"status": "ok", "perfil": perfil, "aliases": aliases, "datas": datas}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ─────────────────────────────────────────────────────────────────────────────
# Helper transacional — consumido pelos outros agentes (Onda 2 / US2)
# ─────────────────────────────────────────────────────────────────────────────

def link_person_on_cursor(
    cur,
    person_id: str,
    entity_type: str,
    entity_id: str | int,
) -> None:
    """Inserir vínculo pessoa↔item usando o cursor do chamador (sem commitar).

    Idempotente via ON CONFLICT DO NOTHING — citar a mesma pessoa duas vezes
    no mesmo item não cria linha duplicada.

    Deve ser chamado dentro de uma transação já aberta pelo agente dono do item
    (Nami/Kaguya/Frieren/Journal). O commit ou rollback é responsabilidade do chamador.

    Args:
        cur: Cursor psycopg2 ativo (dentro de uma transação do chamador).
        person_id: UUID da pessoa a vincular.
        entity_type: Tipo do item — "transaction", "task", "book" ou "journal_bullet".
        entity_id: ID do item (UUID como str ou SERIAL int — coagido para str).

    Example:
        >>> with get_conn() as conn:
        ...     with conn.cursor() as cur:
        ...         result = create_transaction_on_cursor(cur, ...)
        ...         link_person_on_cursor(cur, "uuid...", "transaction", result["id"])
    """
    # entity_id é sempre armazenado como TEXT (absorve UUID e int SERIAL)
    cur.execute(
        """
        INSERT INTO person_links (person_id, entity_type, entity_id)
        VALUES (%s, %s, %s)
        ON CONFLICT (person_id, entity_type, entity_id) DO NOTHING
        """,
        (person_id, entity_type, str(entity_id)),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Helper transacional — remover todos os vínculos de uma entidade (fatia 025)
# ─────────────────────────────────────────────────────────────────────────────

def unlink_people_on_cursor(
    cur,
    entity_type: str,
    entity_id: str | int,
) -> None:
    """Remove todos os vínculos pessoa↔item de um dado item usando o cursor do chamador.

    Usado pela semântica de substituição em ``update_task(person_ids=[...])`` — antes
    de inserir os novos vínculos, apaga os existentes para garantir que o conjunto final
    seja exatamente o enviado (não uma adição ao anterior).

    Idempotente: não falha se não houver vínculos. O commit/rollback é do chamador.

    Args:
        cur: Cursor psycopg2 ativo (dentro de uma transação do chamador).
        entity_type: Tipo do item — ``"task"``, ``"transaction"``, ``"book"`` etc.
        entity_id: ID do item (UUID como str ou SERIAL int — coagido para str).

    Example:
        >>> # Dentro de uma transação de update_task
        >>> unlink_people_on_cursor(cur, "task", task_id)
        >>> for pid in new_person_ids:
        ...     link_person_on_cursor(cur, pid, "task", task_id)
    """
    # entity_id é sempre TEXT na tabela (absorve UUID e int SERIAL)
    cur.execute(
        "DELETE FROM person_links WHERE entity_type = %s AND entity_id = %s",
        (entity_type, str(entity_id)),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Hub de agregação — Onda 3 / US3 (T014)
# ─────────────────────────────────────────────────────────────────────────────

def get_person_summary(person_id: str) -> dict:
    """Retornar resumo completo de uma pessoa com vínculos de todos os domínios.

    Agrega em 5 blocos: perfil (people + aliases + datas), financas (transações),
    tarefas, diario (bullets) e livros. Uma query por domínio (sem N+1).
    Cada bloco retorna vazio sem erro quando não há vínculos (SC-005).

    Args:
        person_id: UUID da pessoa.

    Returns:
        {
            "status": "ok",
            "perfil": {..., "aliases": [...], "datas": [...]},
            "financas": {"saldo": float, "transacoes": [...]},
            "tarefas": {"abertas": [...], "concluidas": [...]},
            "diario": {"contagem": int, "trechos": [...]},
            "livros": {"livros": [...]},
        }
        ou {"status": "error", "message": ...}.
    """
    # Verifica se a pessoa existe (viva ou não — o resumo pode ser pedido de excluídas via UI)
    rows = run_select("SELECT * FROM people WHERE id = %(id)s", {"id": person_id})
    if not rows:
        return {"status": "error", "message": "Pessoa não encontrada."}

    perfil = rows[0]
    for f in ("created_at", "updated_at"):
        if perfil.get(f) and hasattr(perfil[f], "isoformat"):
            perfil[f] = perfil[f].isoformat()

    aliases = run_select(
        "SELECT alias FROM person_aliases WHERE person_id = %(id)s ORDER BY alias",
        {"id": person_id},
    )
    datas = run_select(
        "SELECT label, date::text, recurring FROM person_dates WHERE person_id = %(id)s ORDER BY date",
        {"id": person_id},
    )
    perfil["aliases"] = [r["alias"] for r in aliases]
    perfil["datas"] = datas

    # ── Bloco: Finanças (transações vinculadas via person_links) ──────────────
    try:
        tx_rows = run_select(
            """
            SELECT t.id, t.name, t.valor, t.tipo, t.categoria, t.data::text
            FROM person_links pl
            JOIN transactions t ON t.id = pl.entity_id AND t.deleted = FALSE
            WHERE pl.person_id = %(pid)s AND pl.entity_type = 'transaction'
            ORDER BY t.data DESC
            LIMIT 10
            """,
            {"pid": person_id},
        )
        # Saldo = soma de receitas − soma de despesas das transações vinculadas
        saldo_rows = run_select(
            """
            SELECT COALESCE(SUM(CASE WHEN t.tipo = 'Receita' THEN t.valor ELSE -t.valor END), 0) AS saldo
            FROM person_links pl
            JOIN transactions t ON t.id = pl.entity_id AND t.deleted = FALSE
            WHERE pl.person_id = %(pid)s AND pl.entity_type = 'transaction'
            """,
            {"pid": person_id},
        )
        saldo = float(saldo_rows[0]["saldo"]) if saldo_rows else 0.0
        financas = {"saldo": saldo, "transacoes": tx_rows}
    except Exception:
        financas = {"saldo": 0.0, "transacoes": []}

    # ── Bloco: Tarefas (tasks vinculadas — entity_id é SERIAL int → cast) ────
    try:
        tarefas_abertas = run_select(
            """
            SELECT t.id, t.title, t.due_date::text, t.priority
            FROM person_links pl
            JOIN tasks t ON t.id = pl.entity_id::int AND t.deleted_at IS NULL AND t.completed_at IS NULL
            WHERE pl.person_id = %(pid)s AND pl.entity_type = 'task'
            ORDER BY t.due_date NULLS LAST, t.created_at
            """,
            {"pid": person_id},
        )
        tarefas_concluidas = run_select(
            """
            SELECT t.id, t.title, t.completed_at::text
            FROM person_links pl
            JOIN tasks t ON t.id = pl.entity_id::int AND t.completed_at IS NOT NULL
            WHERE pl.person_id = %(pid)s AND pl.entity_type = 'task'
            ORDER BY t.completed_at DESC
            LIMIT 5
            """,
            {"pid": person_id},
        )
        tarefas = {"abertas": tarefas_abertas, "concluidas": tarefas_concluidas}
    except Exception:
        tarefas = {"abertas": [], "concluidas": []}

    # ── Bloco: Diário (journal_bullets vinculados — entity_id é SERIAL int) ──
    try:
        bullet_rows = run_select(
            """
            SELECT b.id, b.content, jp.date::text AS date
            FROM person_links pl
            JOIN journal_bullets b ON b.id = pl.entity_id::int
            JOIN journal_pages jp ON jp.id = b.page_id
            WHERE pl.person_id = %(pid)s AND pl.entity_type = 'journal_bullet'
            ORDER BY jp.date DESC, b.position
            LIMIT 10
            """,
            {"pid": person_id},
        )
        diario = {"contagem": len(bullet_rows), "trechos": bullet_rows}
    except Exception:
        diario = {"contagem": 0, "trechos": []}

    # ── Bloco: Livros (books vinculados — entity_id é UUID TEXT) ─────────────
    try:
        livro_rows = run_select(
            """
            SELECT bk.id, bk.title, bk.author, bk.status, bk.rating
            FROM person_links pl
            JOIN books bk ON bk.id = pl.entity_id AND bk.deleted = FALSE
            WHERE pl.person_id = %(pid)s AND pl.entity_type = 'book'
            ORDER BY bk.title
            """,
            {"pid": person_id},
        )
        livros = {"livros": livro_rows}
    except Exception:
        livros = {"livros": []}

    return {
        "status": "ok",
        "perfil": perfil,
        "financas": financas,
        "tarefas": tarefas,
        "diario": diario,
        "livros": livros,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Agregação para a Home — uma passada cross-pessoa
# ─────────────────────────────────────────────────────────────────────────────

def get_people_overview() -> dict:
    """Retornar visão agregada de todas as pessoas vivas para a Home do frontend.

    Faz uma única passada por todas as pessoas vivas, retornando para cada uma:
    - dados de perfil (id, name, relationship, category, avatar_url)
    - datas importantes (para calcular próximas datas no frontend)
    - saldo financeiro (finance_net) — positivo = te devem, negativo = você deve
    - última interação conhecida (last_interaction) — max entre diário, finanças e tarefas

    O frontend usa este endpoint para montar a Home (hero, reconectar, próximas
    datas, a-acertar) sem precisar chamar get_person_summary uma vez por pessoa.

    Cada bloco cross-agent tem seu próprio try/except — degrada silenciosamente
    se a tabela não existir (ex.: ambiente de testes sem Nami/Kaguya/Journal).

    Returns:
        {
          "status": "ok",
          "people": [
            {
              "id": str,
              "name": str,
              "relationship": str | None,
              "category": str,
              "avatar_url": str | None,
              "dates": [{"label": str, "date": str, "recurring": bool}],
              "finance_net": float,          # 0.0 se sem vínculos financeiros
              "last_interaction": {          # None se sem qualquer interação
                "date": str,               # YYYY-MM-DD
                "kind": str,               # "diário" | "finanças" | "tarefa"
                "text": str
              } | None,
            },
            ...
          ]
        }
        ou {"status": "error", "message": ...}.
    """
    try:
        # ── 1. Busca todas as pessoas vivas ───────────────────────────────────
        pessoas = run_select(
            """
            SELECT id, name, relationship, category, avatar_url
            FROM people
            WHERE deleted = FALSE
            ORDER BY name
            """
        )
    except Exception as e:
        return {"status": "error", "message": str(e)}

    if not pessoas:
        return {"status": "ok", "people": []}

    # Monta dict {person_id → dados} para enriquecimento incremental
    ids = [p["id"] for p in pessoas]
    data = {p["id"]: dict(p, dates=[], finance_net=0.0, last_interaction=None) for p in pessoas}

    # ── 2. Datas importantes (person_dates) ───────────────────────────────────
    # Busca todas de uma vez só — mais eficiente que N queries individuais
    try:
        datas = run_select(
            """
            SELECT person_id, label, date::text AS date, recurring
            FROM person_dates
            WHERE person_id = ANY(%(ids)s)
            ORDER BY date
            """,
            {"ids": ids},
        )
        for d in datas:
            pid = d["person_id"]
            if pid in data:
                # Adiciona cada data ao array da pessoa correspondente
                data[pid]["dates"].append({
                    "label": d["label"],
                    "date": d["date"],
                    "recurring": d["recurring"],
                })
    except Exception:
        # Se a tabela não existir, ignora — datas ficam vazias
        pass

    # ── 3. Saldo financeiro (transactions via person_links) ───────────────────
    # Soma Receita (positivo) − Despesa (negativo) por pessoa em uma query GROUP BY
    try:
        saldos = run_select(
            """
            SELECT
                pl.person_id,
                COALESCE(SUM(
                    CASE WHEN t.tipo = 'Receita' THEN t.valor ELSE -t.valor END
                ), 0) AS finance_net
            FROM person_links pl
            JOIN transactions t ON t.id = pl.entity_id AND t.deleted = FALSE
            WHERE pl.entity_type = 'transaction'
              AND pl.person_id = ANY(%(ids)s)
            GROUP BY pl.person_id
            """,
            {"ids": ids},
        )
        for row in saldos:
            pid = row["person_id"]
            if pid in data:
                data[pid]["finance_net"] = float(row["finance_net"])
    except Exception:
        # Nami não disponível — todos os saldos ficam em 0.0
        pass

    # ── 4. Última interação — 3 fontes (diário, finanças, tarefas concluídas) ─
    # Cada fonte em try/except separado para degradar parcialmente

    # Dicionário temporário: {person_id → lista de candidatos de interação}
    # Cada candidato é {"date": "YYYY-MM-DD", "kind": str, "text": str}
    interacoes: dict = {pid: [] for pid in ids}

    # 4a. Menções no diário (journal_bullets → journal_pages para a data)
    try:
        diario_rows = run_select(
            """
            SELECT pl.person_id, jp.date::text AS date, b.content AS text
            FROM person_links pl
            JOIN journal_bullets b ON b.id = pl.entity_id::int
            JOIN journal_pages jp ON jp.id = b.page_id
            WHERE pl.entity_type = 'journal_bullet'
              AND pl.person_id = ANY(%(ids)s)
            ORDER BY jp.date DESC
            """,
            {"ids": ids},
        )
        for row in diario_rows:
            pid = row["person_id"]
            if pid in interacoes:
                interacoes[pid].append({
                    "date": row["date"],
                    "kind": "diário",
                    "text": row["text"] or "",
                })
    except Exception:
        # Journal não disponível — ignora
        pass

    # 4b. Transações financeiras (usa a data da transação)
    try:
        fin_rows = run_select(
            """
            SELECT pl.person_id, t.data::text AS date, t.name AS text
            FROM person_links pl
            JOIN transactions t ON t.id = pl.entity_id AND t.deleted = FALSE
            WHERE pl.entity_type = 'transaction'
              AND pl.person_id = ANY(%(ids)s)
            ORDER BY t.data DESC
            """,
            {"ids": ids},
        )
        for row in fin_rows:
            pid = row["person_id"]
            if pid in interacoes:
                interacoes[pid].append({
                    "date": row["date"],
                    "kind": "finanças",
                    "text": row["text"] or "",
                })
    except Exception:
        # Nami não disponível — ignora
        pass

    # 4c. Tarefas concluídas (usa completed_at)
    try:
        task_rows = run_select(
            """
            SELECT pl.person_id, t.completed_at::date::text AS date, t.title AS text
            FROM person_links pl
            JOIN tasks t ON t.id = pl.entity_id::int AND t.completed_at IS NOT NULL
            WHERE pl.entity_type = 'task'
              AND pl.person_id = ANY(%(ids)s)
            ORDER BY t.completed_at DESC
            """,
            {"ids": ids},
        )
        for row in task_rows:
            pid = row["person_id"]
            if pid in interacoes:
                interacoes[pid].append({
                    "date": row["date"],
                    "kind": "tarefa",
                    "text": row["text"] or "",
                })
    except Exception:
        # Kaguya não disponível — ignora
        pass

    # Para cada pessoa, escolhe a interação mais recente (max por date lexicográfica)
    for pid, candidatos in interacoes.items():
        if candidatos and pid in data:
            # Datas YYYY-MM-DD ordenam lexicograficamente — descendente
            candidatos.sort(key=lambda x: x["date"], reverse=True)
            data[pid]["last_interaction"] = candidatos[0]

    # ── 5. Monta resposta final ───────────────────────────────────────────────
    return {"status": "ok", "people": list(data.values())}
