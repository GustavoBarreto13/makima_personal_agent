"""CRUD sobre a tabela calendar_prefs (visibilidade e cor por calendário).

Mantém as preferências de exibição de cada calendário agregado (Google Calendar, Nami,
Frieren, etc.). Usado por `calendar_hub.py` para ler as prefs ao agregar provedores,
e pelo webapp router para permitir customização via UI.

Estados persistidos:
    - visible: bool — calendário aparece na agregação (padrão: True)
    - color: str|None — cor de exibição (padrão: None, usar cor padrão do provider)
    - position: int — ordem de exibição na sidebar (padrão: 0, esparso)

Usadas por:
    - `calendar_hub.py` — lê prefs ao renderizar calendários no Meu Dia
    - webapp router `/api/calendars/*` — permite editar prefs via UI
"""

from agents.db import get_conn, run_select, run_dml


def get_calendar_prefs() -> list[dict]:
    """Obtém as preferências de todos os calendários registrados.

    Retorna uma lista de dicionários com as colunas da tabela calendar_prefs,
    ou lista vazia se nenhuma preferência foi registrada ainda.

    Returns:
        Lista de dicionários com chaves: calendar_id, visible, color, position.
        Lista vazia se nenhuma linha existe na tabela.

    Example:
        >>> get_calendar_prefs()
        [
            {"calendar_id": "gcal_main", "visible": True, "color": "#FF5733", "position": 0},
            {"calendar_id": "nami_expenses", "visible": True, "color": None, "position": 1},
        ]
    """
    # Consulta todos os registros da tabela calendar_prefs, mantendo a ordem de posição
    sql = """
    SELECT calendar_id, visible, color, position
    FROM calendar_prefs
    ORDER BY position, calendar_id
    """
    # run_select já retorna lista de dicts, ou lista vazia se não houver resultados
    return run_select(sql)


def set_calendar_pref(
    calendar_id: str,
    visible: bool | None = None,
    color: str | None = None,
    position: int | None = None,
) -> dict:
    """Atualiza ou insere preferências de um calendário (upsert parcial).

    Implementa um upsert (INSERT ... ON CONFLICT DO UPDATE) que permite atualização
    seletiva: apenas as colunas cujo argumento não é None são atualizadas. Colunas
    com valor None preservam seu estado anterior (ou usam o padrão ao inserir).

    Args:
        calendar_id: Identificador único do calendário (ex: "gcal_main", "nami_expenses").
        visible: Booleano para controlar exibição. Se None, não altera (preserva ou usa padrão True).
        color: String de cor (ex: "#FF5733"). Se None, não altera (preserva ou usa padrão None).
        position: Inteiro para ordenação na sidebar. Se None, não altera (preserva ou usa padrão 0).

    Returns:
        Dicionário de status: {"status": "ok"} em sucesso,
        ou {"status": "error", "message": "..."} se algo falhar.

    Example:
        >>> set_calendar_pref("gcal_main", visible=True, position=0)
        {"status": "ok"}
        >>> set_calendar_pref("nami_expenses", color="#FF5733")  # só atualiza cor
        {"status": "ok"}
    """
    try:
        # Monta dinamicamente as colunas a atualizar (apenas as que não são None)
        # Isso permite upsert seletivo: colunas omitidas preservam seu valor ou usam padrão
        updates = {}
        if visible is not None:
            updates["visible"] = visible
        if color is not None:
            updates["color"] = color
        if position is not None:
            updates["position"] = position

        # Constrói a lista de SET dinamicamente (UPDATE SET visible=..., color=..., etc.)
        # Se nenhum campo for atualizado, o SQL será INSERT sem UPDATE (preserva valores atuais na linha)
        set_clauses = ", ".join(f"{col} = %s" for col in updates.keys())

        # Valores para o INSERT (iniciais) e para o UPDATE (só dos campos em updates)
        # No INSERT, usa os valores fornecidos ou deixa o padrão do banco agir
        params = {
            "calendar_id": calendar_id,
            "visible": visible if visible is not None else True,  # padrão no INSERT
            "color": color,  # padrão no INSERT (NULL)
            "position": position if position is not None else 0,  # padrão no INSERT
        }

        # Monta os valores para a parte SET do UPDATE (apenas as colunas mudáveis)
        update_values = [params[col] for col in updates.keys()]

        if set_clauses:
            # Há campos a atualizar — usa INSERT ... ON CONFLICT DO UPDATE
            sql = f"""
            INSERT INTO calendar_prefs (calendar_id, visible, color, position)
            VALUES (%(calendar_id)s, %(visible)s, %(color)s, %(position)s)
            ON CONFLICT (calendar_id) DO UPDATE SET {set_clauses}
            """
            # Prepara os parâmetros na ordem correta: INSERT + UPDATE
            full_params = params.copy()
            for i, col in enumerate(updates.keys()):
                # Adiciona os valores do UPDATE com nomes únicos para evitar conflito
                full_params[f"upd_{col}"] = update_values[i]
            # Ajusta os placeholders do SET para usar os nomes únicos
            set_clauses_fixed = ", ".join(f"{col} = %(upd_{col})s" for col in updates.keys())
            sql = f"""
            INSERT INTO calendar_prefs (calendar_id, visible, color, position)
            VALUES (%(calendar_id)s, %(visible)s, %(color)s, %(position)s)
            ON CONFLICT (calendar_id) DO UPDATE SET {set_clauses_fixed}
            """
            run_dml(sql, full_params)
        else:
            # Nenhum campo para atualizar — insert puro (linha nova, ou nada faz na linha existente)
            # Usa a sintaxe simples INSERT ... ON CONFLICT DO NOTHING
            sql = """
            INSERT INTO calendar_prefs (calendar_id, visible, color, position)
            VALUES (%(calendar_id)s, %(visible)s, %(color)s, %(position)s)
            ON CONFLICT (calendar_id) DO NOTHING
            """
            run_dml(sql, params)

        return {"status": "ok"}

    except Exception as e:
        # Captura qualquer erro (violação de constraint, conexão, etc.) e retorna de forma segura
        # sem quebrar o fluxo do agente
        return {"status": "error", "message": str(e)}
