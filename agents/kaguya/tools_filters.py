"""Camada de lógica — smart-lists (filtros salvos) das tarefas da Kaguya.

Quarta peça da **camada de lógica única** (junto de ``tools_tasks.py``,
``tools_projects.py`` e ``tools_tags.py``). Aqui vive TODA a regra de negócio das
smart-lists; o canal Telegram (``tools.py`` → agente) e o canal webapp (router
``/api/tasks/*``) são fachadas finas e paritárias sobre estas funções (princípio de
paridade de canais — FR-012/FR-018 da fatia 013).

O que é uma "smart-list": um **filtro salvo** como objeto de primeira classe
(tabela ``task_filters``). Em vez de remontar o filtro toda vez, o usuário salva uma
combinação de regras (ex.: "prioridade alta E vence em 7 dias") e abre quando quiser —
no webapp pela sidebar, no Telegram pelo nome.

A DSL de regras (definida na master, ``data-model.md``) é um objeto com um **combinador**
(``and``/``or``) e uma lista de **condições** ``{field, op, value}`` sobre os campos
``project_id``, ``priority``, ``due_date``, ``tag``, ``state`` e ``text``. A tradução
regra→SQL é **sempre parametrizada** (``%(chave)s``): valores da DSL NUNCA são
interpolados direto no SQL — entrada hostil vira dado, não injeção (SC-003).

Convenções (iguais às outras tools):
    - Funções de **mutação** retornam ``{"status": "ok"|"error", ...}``.
    - Funções de **listagem** retornam o dado direto (lista/dict, sem "status").
    - Acesso ao banco via ``agents.db`` (psycopg2 síncrono).
"""

from datetime import date, timedelta
from typing import Optional

# ``Json`` adapta um dict Python para o tipo JSONB do Postgres ao gravar ``rules``.
from psycopg2.extras import Json

from agents.db import get_conn, run_select, run_dml

# Incremento padrão entre posições manuais na sidebar (mesma constante semântica das listas).
_POSITION_STEP = 1000

# Combinadores válidos (espelha a DSL da master). Default "and".
_VALID_COMBINATORS = {"and", "or"}

# Campos e operadores que a DSL aceita (data-model.md §"DSL de regras"). Serve de validação
# amigável antes de montar o SQL — um campo/op desconhecido é ignorado com sinalização.
_FIELD_OPS = {
    "project_id": {"in", "not_in"},
    "priority": {"eq", "gte", "lte"},
    "due_date": {"eq", "before", "after", "within", "overdue", "none"},
    "tag": {"has", "not_has"},
    "state": {"eq"},
    "text": {"contains"},
}


def _today() -> date:
    """Devolve a data de hoje (mesma convenção de ``list_tasks_today``: ``date.today()``).

    Centralizado numa função para os testes importarem o MESMO "hoje" usado na tradução
    dos atalhos relativos (``"today"``, ``"7d"``) — evita divergência de um dia em bordas.

    Returns:
        A data civil de hoje.
    """
    return date.today()


def _resolve_relative_date(value) -> Optional[date]:
    """Traduz um valor de data da DSL (ISO, atalho relativo ou nulo) numa ``date``.

    Aceita três formas:
        - ``"AAAA-MM-DD"`` → a própria data;
        - ``"today"`` → hoje;
        - ``"Nd"`` (ex.: ``"7d"``) → hoje + N dias;
        - ``None`` → ``None`` (usado pelo operador ``none``).

    Args:
        value: O valor cru vindo da condição (``condition["value"]``).

    Returns:
        A data resolvida, ou ``None`` se o valor for nulo/irreconhecível.
    """
    if value is None:
        return None
    texto = str(value).strip().lower()
    if texto == "today":
        return _today()
    # Atalho "Nd" (N dias a partir de hoje): tira o "d" do fim e soma os dias.
    if texto.endswith("d") and texto[:-1].isdigit():
        return _today() + timedelta(days=int(texto[:-1]))
    # Caso geral: tenta interpretar como data ISO "AAAA-MM-DD".
    try:
        return date.fromisoformat(texto)
    except ValueError:
        return None


def _tag_exists(name: str) -> bool:
    """Diz se existe uma tag com aquele nome (ignorando caixa) — base da detecção de órfã.

    Args:
        name: Nome da tag referenciado por uma condição.

    Returns:
        ``True`` se a tag existe no vocabulário, ``False`` caso contrário.
    """
    rows = run_select("SELECT 1 FROM task_tags WHERE LOWER(name) = LOWER(%(n)s)", {"n": name})
    return len(rows) > 0


def _existing_project_ids(ids: list) -> set:
    """Devolve, dentre os ids informados, quais realmente existem em ``task_projects``.

    Usado para detectar referência órfã quando uma condição ``project_id in [...]`` aponta
    para uma lista que foi excluída.

    Args:
        ids: Lista de ids de projeto referenciados pela condição.

    Returns:
        Conjunto dos ids que existem (subconjunto de ``ids``).
    """
    if not ids:
        return set()
    rows = run_select(
        "SELECT id FROM task_projects WHERE id = ANY(%(ids)s)",
        {"ids": list(ids)},
    )
    return {r["id"] for r in rows}


# ─────────────────────────────────────────────────────────────────────────────
# Tradução da DSL → WHERE parametrizado (o coração — SC-003)
# ─────────────────────────────────────────────────────────────────────────────
def _build_where_from_rules(rules: dict, default_open: bool = True):
    """Traduz a DSL de regras num fragmento ``WHERE`` parametrizado + lista de órfãs.

    Monta um fragmento SQL por condição usando placeholders ``%(cN)s`` (N crescente) e
    devolve os valores num dict separado — assim o psycopg2 escapa tudo e **nenhum valor
    da DSL toca o SQL como texto** (SC-003). Detecta condições com referência quebrada
    (tag/projeto inexistente) e as devolve em ``orphans`` para a UI sinalizar (FR-011).

    Sempre aplica a base ``deleted_at IS NULL AND parent_id IS NULL`` (tarefas-pai vivas).

    Args:
        rules: O objeto da DSL ``{"combinator": "and"|"or", "conditions": [...]}``.
        default_open: Quando ``True`` (smart-lists), filtra só **abertas** se nenhuma
            condição mexer em ``state``. Quando ``False`` (board do Kanban — spec 024), a
            base NÃO força "só abertas": quem decide open/done é o consumidor (o board já
            restringe via ``list_tasks``), não o filtro.

    Returns:
        Tupla ``(where_sql, params, orphans)`` — ``where_sql`` já inclui a base e as
        condições combinadas; ``params`` é o dict de valores; ``orphans`` é a lista de
        condições órfãs ``[{"field", "op", "value"}, ...]``.
    """
    conditions = (rules or {}).get("conditions") or []
    combinator = (rules or {}).get("combinator", "and")
    # Junta com AND/OR conforme o combinador; qualquer coisa fora do esperado vira AND.
    joiner = " OR " if combinator == "or" else " AND "

    fragments: list[str] = []          # pedaços de SQL (um por condição)
    params: dict = {}                  # valores, sempre por placeholder
    orphans: list[dict] = []           # condições com referência quebrada
    has_state = False                  # alguma condição mexeu em "state"?

    for i, cond in enumerate(conditions):
        field = cond.get("field")
        op = cond.get("op")
        value = cond.get("value")
        key = f"c{i}"                  # placeholder único desta condição

        # Ignora condições com campo/operador desconhecido (defensivo — não quebra).
        if field not in _FIELD_OPS or op not in _FIELD_OPS[field]:
            continue

        if field == "project_id":
            ids = value if isinstance(value, list) else [value]
            params[key] = ids
            # in = pertence à lista; not_in = não pertence (via ALL para tratar bem o vazio).
            if op == "in":
                fragments.append(f"t.project_id = ANY(%({key})s)")
            else:  # not_in
                fragments.append(f"(t.project_id <> ALL(%({key})s))")
            # Órfã: nenhum dos ids referenciados existe mais.
            if ids and not _existing_project_ids(ids):
                orphans.append({"field": field, "op": op, "value": value})

        elif field == "priority":
            params[key] = int(value)
            sql_op = {"eq": "=", "gte": ">=", "lte": "<="}[op]
            fragments.append(f"t.priority {sql_op} %({key})s")

        elif field == "due_date":
            if op == "none":
                fragments.append("t.due_date IS NULL")  # sem valor → sem placeholder
            elif op == "overdue":
                # Vencida = data no passado (CURRENT_DATE é palavra SQL, não entrada do usuário).
                fragments.append("t.due_date < CURRENT_DATE")
            elif op == "within":
                # Janela [hoje, hoje+N]: resolve o atalho em Python e parametriza as duas pontas.
                hi = _resolve_relative_date(value) or _today()
                params[f"{key}_lo"] = _today()
                params[f"{key}_hi"] = hi
                fragments.append(f"t.due_date BETWEEN %({key}_lo)s AND %({key}_hi)s")
            else:  # eq | before | after
                params[key] = _resolve_relative_date(value)
                sql_op = {"eq": "=", "before": "<", "after": ">"}[op]
                fragments.append(f"t.due_date {sql_op} %({key})s")

        elif field == "tag":
            params[key] = value
            exists_sql = (
                "EXISTS (SELECT 1 FROM task_tag_links l JOIN task_tags g ON g.id = l.tag_id "
                f"WHERE l.task_id = t.id AND LOWER(g.name) = LOWER(%({key})s))"
            )
            fragments.append(exists_sql if op == "has" else f"NOT {exists_sql}")
            # Órfã: a tag referenciada não existe (some do vocabulário).
            if not _tag_exists(str(value)):
                orphans.append({"field": field, "op": op, "value": value})

        elif field == "state":
            has_state = True
            fragments.append(
                "t.completed_at IS NULL" if value == "open" else "t.completed_at IS NOT NULL"
            )

        elif field == "text":
            params[key] = f"%{value}%"
            fragments.append(f"(t.title ILIKE %({key})s OR t.description ILIKE %({key})s)")

    # Base: tarefas-pai vivas. Default "só abertas" quando o usuário não filtrou por state
    # — desligável (default_open=False) para o board do Kanban, que gere open/done por coluna.
    base = "t.deleted_at IS NULL AND t.parent_id IS NULL"
    if default_open and not has_state:
        base += " AND t.completed_at IS NULL"

    if fragments:
        where_sql = f"{base} AND ({joiner.join(fragments)})"
    else:
        # Sem condições válidas: só a base (não deveria acontecer — create_filter exige ≥1).
        where_sql = base
    return where_sql, params, orphans


def _run_filter_rules(rules: dict) -> dict:
    """Executa uma regra da DSL e devolve as tarefas que casam + as referências órfãs.

    Mesmo shape de resposta de ``list_tasks_by_tag`` (``project_name`` + tags anexadas),
    para o front e o agente consumirem igual.

    Args:
        rules: O objeto da DSL ``{"combinator", "conditions"}``.

    Returns:
        ``{"tasks": [...], "orphans": [...]}`` — ``tasks`` é a lista serializada (vazia se
        nada casar); ``orphans`` sinaliza condições quebradas (FR-011). **Listagem**.
    """
    # Import lazy (mesmo motivo de ``tools_tags``): evita ciclo com ``tools_tasks``.
    from agents.kaguya.tools_tasks import _qualified, _serialize_task
    from agents.kaguya.tools_tags import _attach_tags

    where_sql, params, orphans = _build_where_from_rules(rules)
    rows = run_select(
        f"""
        SELECT {_qualified("t")}, p.name AS project_name
        FROM tasks t
        JOIN task_projects p ON p.id = t.project_id
        WHERE {where_sql}
        ORDER BY t.due_date NULLS LAST, t.priority DESC, t.position
        """,
        params,
    )
    out = []
    for r in rows:
        item = _serialize_task(r)
        item["project_name"] = r["project_name"]
        out.append(item)
    return {"tasks": _attach_tags(out), "orphans": orphans}


# ─────────────────────────────────────────────────────────────────────────────
# Built-in "Hoje + Vencidas" (filtro fixo do código, NÃO persistido — FR-010)
# ─────────────────────────────────────────────────────────────────────────────
def list_today_overdue() -> list:
    """Lista as tarefas abertas com ``due_date <= hoje`` (a smart-list built-in).

    É um filtro fixo do código (não há linha em ``task_filters``): a "Hoje + Vencidas"
    aparece sempre na sidebar. Reusa a tradução da DSL para garantir a MESMA semântica das
    smart-lists salvas (paridade interna).

    Returns:
        Lista de tarefas serializadas (vazia se não houver nenhuma). **Listagem**.
    """
    rules = {"combinator": "and", "conditions": [
        {"field": "due_date", "op": "before", "value": (_today() + timedelta(days=1)).isoformat()},
    ]}
    # ``before amanhã`` = ``<= hoje`` (datas civis): pega hoje e tudo que está vencido.
    return _run_filter_rules(rules)["tasks"]


# ─────────────────────────────────────────────────────────────────────────────
# Built-ins GTD adicionais (filtros fixos do código, NÃO persistidos) — fatia 013
# ─────────────────────────────────────────────────────────────────────────────
# Aplicação do Getting Things Done: além de "Hoje + Vencidas" (hard landscape), o usuário
# encontra prontas as listas de **estado** (Próximas Ações / Aguardando / Algum dia) e os
# critérios de **engajar** (Rápidas / Alta energia). Mapeamento: Listas = Áreas de Foco ·
# Tags = Contextos · Smart-lists = listas de ação. Detalhe em specs/013…/P2-CONTEXT.md.
#
# As listas de estado usam tags RESERVADAS: marcar uma tarefa com #aguardando ou #algum-dia
# a tira das "Próximas Ações" e a põe na lista correspondente — sem schema novo.
RESERVED_TAGS = {"aguardando", "algum-dia"}

# Cada built-in é identificado por uma CHAVE string estável. A mesma DSL das smart-lists
# salvas é reusada (paridade interna de semântica). Ordem = ordem na sidebar.
BUILTIN_FILTERS: dict[str, dict] = {
    "next-actions": {
        "name": "Próximas Ações",
        "icon": "zap",
        # O "fazer agora": aberto e NÃO adiado para aguardando/algum-dia.
        "rules": {"combinator": "and", "conditions": [
            {"field": "state", "op": "eq", "value": "open"},
            {"field": "tag", "op": "not_has", "value": "aguardando"},
            {"field": "tag", "op": "not_has", "value": "algum-dia"},
        ]},
    },
    "waiting": {
        "name": "Aguardando",
        "icon": "clock",
        # Delegado/bloqueado: aberto e marcado com #aguardando.
        "rules": {"combinator": "and", "conditions": [
            {"field": "state", "op": "eq", "value": "open"},
            {"field": "tag", "op": "has", "value": "aguardando"},
        ]},
    },
    "someday": {
        "name": "Algum dia",
        "icon": "inbox",
        # Incubar: aberto e marcado com #algum-dia (revisar depois).
        "rules": {"combinator": "and", "conditions": [
            {"field": "state", "op": "eq", "value": "open"},
            {"field": "tag", "op": "has", "value": "algum-dia"},
        ]},
    },
    "quick": {
        "name": "Rápidas (5 min)",
        "icon": "timer",
        # Critério de tempo: aberto e marcado com #5min.
        "rules": {"combinator": "and", "conditions": [
            {"field": "state", "op": "eq", "value": "open"},
            {"field": "tag", "op": "has", "value": "5min"},
        ]},
    },
    "energy": {
        "name": "Alta energia",
        "icon": "flame",
        # Critério de energia: aberto e marcado com #alta-energia.
        "rules": {"combinator": "and", "conditions": [
            {"field": "state", "op": "eq", "value": "open"},
            {"field": "tag", "op": "has", "value": "alta-energia"},
        ]},
    },
}


def list_builtin_filters() -> list:
    """Lista os built-ins GTD adicionais (metadados para a sidebar e o agente).

    Não inclui "Hoje + Vencidas" (essa tem o endpoint próprio ``list_today_overdue``).

    Returns:
        Lista de ``{key, name, icon}`` na ordem de exibição. **Listagem**.
    """
    return [
        {"key": key, "name": meta["name"], "icon": meta["icon"]}
        for key, meta in BUILTIN_FILTERS.items()
    ]


def list_tasks_by_builtin(key: str) -> list:
    """Abre um built-in GTD pela chave e devolve as tarefas que casam.

    As referências de tag reservada (``#aguardando``/``#algum-dia``) são intencionais — não
    sinalizamos órfã aqui (diferente das smart-lists do usuário): a built-in só devolve a
    lista de tarefas, como ``list_today_overdue``.

    Args:
        key: Chave do built-in (ex.: ``"next-actions"``, ``"waiting"``).

    Returns:
        Lista de tarefas serializadas (vazia se a chave não existir ou nada casar). **Listagem**.
    """
    meta = BUILTIN_FILTERS.get(key)
    if not meta:
        return []
    return _run_filter_rules(meta["rules"])["tasks"]


# ─────────────────────────────────────────────────────────────────────────────
# CRUD de smart-lists (gestão dos filtros salvos)
# ─────────────────────────────────────────────────────────────────────────────
def _validate_rules(rules) -> Optional[str]:
    """Valida o shape mínimo da DSL; devolve uma mensagem de erro ou ``None`` se ok.

    Uma smart-list **precisa de ao menos uma condição** (Assumption da spec): uma lista
    sem regra é uma lista comum, não uma smart-list.

    Args:
        rules: O objeto da DSL a validar.

    Returns:
        Mensagem de erro (str) se inválido, ou ``None`` se as regras estão ok.
    """
    if not isinstance(rules, dict):
        return "As regras da smart-list precisam ser um objeto com 'conditions'."
    if (rules.get("combinator", "and")) not in _VALID_COMBINATORS:
        return "Combinador inválido (use 'and' ou 'or')."
    conditions = rules.get("conditions")
    if not isinstance(conditions, list) or len(conditions) == 0:
        return "Uma smart-list precisa de ao menos uma condição."
    return None


def list_filters() -> list:
    """Lista as smart-lists salvas, na ordem da sidebar (``position``).

    Returns:
        Lista de dicionários ``{id, name, icon, rules, default_view, position}``.
        ``rules`` volta como dict (JSONB). **Listagem**.
    """
    return run_select(
        "SELECT id, name, icon, rules, default_view, position "
        "FROM task_filters ORDER BY position, id"
    )


def create_filter(name: str, rules: dict, default_view: str = "list", icon: Optional[str] = None) -> dict:
    """Cria uma smart-list (filtro salvo) com regras na DSL da master.

    Args:
        name: Nome exibido na sidebar (ex.: "Urgentes da semana").
        rules: Objeto da DSL ``{"combinator", "conditions": [...]}`` (≥1 condição).
        default_view: View padrão ao abrir (``list``/``kanban``/``calendar``/``eisenhower``).
        icon: Ícone opcional (emoji) exibido na sidebar.

    Returns:
        ``{"status": "ok", "id": <int>}`` ou ``{"status": "error", "message": ...}``.
    """
    if not name or not name.strip():
        return {"status": "error", "message": "O nome da smart-list não pode ser vazio."}
    erro = _validate_rules(rules)
    if erro:
        return {"status": "error", "message": erro}
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Posição esparsa: última + 1000 (mesmo padrão das listas/colunas).
            cur.execute("SELECT COALESCE(MAX(position), 0) + %s FROM task_filters", (_POSITION_STEP,))
            position = cur.fetchone()[0]
            # ``Json(rules)`` grava o dict como JSONB; os VALORES das regras só rodam no
            # SELECT de leitura, sempre parametrizados — aqui guardamos a regra crua.
            cur.execute(
                "INSERT INTO task_filters (name, icon, rules, default_view, position) "
                "VALUES (%s, %s, %s, %s, %s) RETURNING id",
                (name.strip(), icon, Json(rules), default_view, position),
            )
            new_id = cur.fetchone()[0]
    return {"status": "ok", "id": new_id, "message": f"Smart-list '{name.strip()}' criada."}


def update_filter(
    filter_id: int,
    name: Optional[str] = None,
    rules: Optional[dict] = None,
    default_view: Optional[str] = None,
    icon: Optional[str] = None,
    position: Optional[int] = None,
) -> dict:
    """Edita uma smart-list (PATCH parcial — só os campos enviados).

    Args:
        filter_id: Id da smart-list.
        name: Novo nome (opcional).
        rules: Novas regras (opcional; se enviado, precisa de ≥1 condição).
        default_view: Nova view padrão (opcional).
        icon: Novo ícone (opcional).
        position: Nova posição na sidebar (opcional).

    Returns:
        Dicionário de status. Erro se nada for enviado ou a smart-list não existir.
    """
    sets, params = [], {"id": filter_id}
    if name is not None:
        if not name.strip():
            return {"status": "error", "message": "O nome da smart-list não pode ser vazio."}
        sets.append("name = %(name)s")
        params["name"] = name.strip()
    if rules is not None:
        erro = _validate_rules(rules)
        if erro:
            return {"status": "error", "message": erro}
        sets.append("rules = %(rules)s")
        params["rules"] = Json(rules)
    if default_view is not None:
        sets.append("default_view = %(default_view)s")
        params["default_view"] = default_view
    if icon is not None:
        sets.append("icon = %(icon)s")
        params["icon"] = icon
    if position is not None:
        sets.append("position = %(position)s")
        params["position"] = position
    if not sets:
        return {"status": "error", "message": "Nada para atualizar."}

    affected = run_dml(f"UPDATE task_filters SET {', '.join(sets)} WHERE id = %(id)s", params)
    if affected == 0:
        return {"status": "error", "message": "Smart-list não encontrada."}
    return {"status": "ok", "message": "Smart-list atualizada."}


def delete_filter(filter_id: int) -> dict:
    """Exclui uma smart-list; **nenhuma tarefa é afetada** (o filtro não possui tarefas).

    Args:
        filter_id: Id da smart-list a excluir.

    Returns:
        Dicionário de status.
    """
    affected = run_dml("DELETE FROM task_filters WHERE id = %(id)s", {"id": filter_id})
    if affected == 0:
        return {"status": "error", "message": "Smart-list não encontrada."}
    return {"status": "ok", "message": "Smart-list excluída."}


# ─────────────────────────────────────────────────────────────────────────────
# Abrir uma smart-list (executar suas regras) — webapp por id, Telegram por nome
# ─────────────────────────────────────────────────────────────────────────────
def list_tasks_by_filter(filter_id: int) -> dict:
    """Abre uma smart-list salva e devolve as tarefas que casam (+ referências órfãs).

    Args:
        filter_id: Id da smart-list.

    Returns:
        ``{"tasks": [...], "orphans": [...]}``. Se a smart-list não existir, devolve
        ``{"tasks": [], "orphans": [], "missing": True}`` (sem erro). **Listagem**.
    """
    rows = run_select("SELECT rules FROM task_filters WHERE id = %(id)s", {"id": filter_id})
    if not rows:
        return {"tasks": [], "orphans": [], "missing": True}
    return _run_filter_rules(rows[0]["rules"])


def list_tasks_by_filter_name(name: str) -> dict:
    """Abre uma smart-list pelo nome (uso do Telegram) — paridade com o webapp (FR-012).

    Resolve o nome de forma tolerante: casa exato ignorando caixa primeiro, depois por
    prefixo (ex.: "urgentes" acha "Urgentes da semana").

    Args:
        name: Nome (ou começo do nome) da smart-list.

    Returns:
        Mesmo shape de ``list_tasks_by_filter``; ``missing`` se nenhuma casar. **Listagem**.
    """
    if not name or not name.strip():
        return {"tasks": [], "orphans": [], "missing": True}
    termo = name.strip()

    # 1) Built-ins fixos (GTD + Hoje + Vencidas): casam por nome antes dos salvos, para o
    #    Telegram ter paridade com a sidebar do webapp ("me mostra as Próximas Ações").
    termo_low = termo.lower()
    if termo_low in ("hoje + vencidas", "hoje e vencidas", "hoje", "vencidas"):
        return {"tasks": list_today_overdue(), "orphans": []}
    for key, meta in BUILTIN_FILTERS.items():
        nome = meta["name"].lower()
        if nome == termo_low or nome.startswith(termo_low):
            return {"tasks": list_tasks_by_builtin(key), "orphans": []}

    # 2) Smart-lists salvas: nome exato (ignorando caixa); se não achar, por prefixo.
    rows = run_select(
        "SELECT rules FROM task_filters WHERE LOWER(name) = LOWER(%(n)s) "
        "OR LOWER(name) LIKE LOWER(%(pref)s) ORDER BY position, id LIMIT 1",
        {"n": termo, "pref": f"{termo}%"},
    )
    if not rows:
        return {"tasks": [], "orphans": [], "missing": True}
    return _run_filter_rules(rows[0]["rules"])
