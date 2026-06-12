"""Camada de lógica — calendário (consulta por intervalo de datas) da Kaguya.

Quinta peça da **camada de lógica única**. Aqui vive a regra que alimenta a view de
calendário do webapp (P3 da fatia 013) e a consulta "o que tenho essa semana" do Telegram
(FR-017): dada uma janela de datas, devolve as tarefas **datadas** posicionadas nos dias
certos, **mais** as próximas ocorrências **virtuais** das tarefas recorrentes da 012.

Princípio crítico (SC-005): as ocorrências futuras das recorrentes são **calculadas**, nunca
materializadas — não criamos linhas futuras em ``tasks``. O motor puro
``recurrence.project_occurrences`` faz a aritmética; aqui só lemos o banco e montamos a
resposta. A projeção é sempre limitada à janela visível (FR-015).

Convenção: é uma **listagem** (retorna a lista direto, sem "status"). Cada item ganha
``is_virtual`` (``False`` = linha real; ``True`` = ocorrência projetada) e, nas virtuais,
``series_task_id`` apontando para a tarefa viva da série (e ``id = None``).
"""

from typing import Optional

from agents.db import run_select
from agents.kaguya import recurrence as rec_engine


def list_tasks_in_range(start_date: str, end_date: str, project_id: Optional[int] = None) -> list:
    """Lista as tarefas (reais + ocorrências virtuais) com data dentro de ``[start, end]``.

    Combina duas fontes:
        1. **Tarefas reais**: linhas vivas (não na lixeira), tarefas-pai, com ``due_date``
           dentro da janela. Entram abertas e concluídas (o calendário mostra o que está/foi
           agendado); tarefas sem ``due_date`` ficam de fora do grid.
        2. **Ocorrências virtuais**: para cada recorrência ativa cuja tarefa viva tem data,
           projeta as próximas ocorrências na janela (via ``project_occurrences``), **sem
           gravar nada** — preservando o invariante "uma ocorrência viva por série" (SC-005).

    Args:
        start_date: Início da janela, ISO "AAAA-MM-DD" (inclusive).
        end_date: Fim da janela, ISO "AAAA-MM-DD" (inclusive).
        project_id: Se informado, restringe a uma lista específica.

    Returns:
        Lista de tarefas serializadas. Reais com ``is_virtual=False``; virtuais com
        ``is_virtual=True``, ``series_task_id`` e ``id=None``. **Listagem**.
    """
    # Import lazy: ``tools_tasks`` importa indiretamente deste domínio; evitamos ciclo.
    from agents.kaguya.tools_tasks import _qualified, _serialize_task
    from agents.kaguya.tools_tags import _attach_tags

    # Filtro opcional por lista, sempre parametrizado.
    proj_clause = "AND t.project_id = %(pid)s" if project_id is not None else ""
    params = {"start": start_date, "end": end_date, "pid": project_id}

    # ── 1) Tarefas reais datadas na janela ──
    real_rows = run_select(
        f"""
        SELECT {_qualified("t")}, p.name AS project_name
        FROM tasks t
        JOIN task_projects p ON p.id = t.project_id
        WHERE t.deleted_at IS NULL
          AND t.parent_id IS NULL
          AND t.due_date BETWEEN %(start)s AND %(end)s
          {proj_clause}
        ORDER BY t.due_date, t.due_time NULLS LAST, t.priority DESC, t.position
        """,
        params,
    )
    reais = []
    for r in real_rows:
        item = _serialize_task(r)
        item["project_name"] = r["project_name"]
        item["is_virtual"] = False  # linha real
        reais.append(item)
    reais = _attach_tags(reais)

    # ── 2) Ocorrências virtuais das recorrentes ativas ──
    # Lemos a regra (rrule/mode/anchor) junto com a tarefa viva da série. As datas cruas
    # (``due_date``/``anchor_date``) ainda são objetos ``date`` aqui (antes de serializar),
    # exatamente o que o motor de projeção espera.
    rec_rows = run_select(
        f"""
        SELECT {_qualified("t")}, p.name AS project_name,
               r.rrule AS _rrule, r.mode AS _mode, r.anchor_date AS _anchor
        FROM task_recurrences r
        JOIN tasks t ON t.id = r.task_id
        JOIN task_projects p ON p.id = t.project_id
        WHERE r.active
          AND t.deleted_at IS NULL
          AND t.due_date IS NOT NULL
          {proj_clause}
        """,
        params,
    )

    # Anexa as tags às tarefas vivas (as virtuais herdam as mesmas etiquetas da série).
    live_serialized = []
    for r in rec_rows:
        live = _serialize_task(r)
        live["project_name"] = r["project_name"]
        live_serialized.append(live)
    live_serialized = _attach_tags(live_serialized)
    tags_por_id = {t["id"]: t.get("tags", []) for t in live_serialized}

    from datetime import date as _date

    virtuais = []
    janela_ini = _date.fromisoformat(start_date)
    janela_fim = _date.fromisoformat(end_date)
    for r in rec_rows:
        # Projeta as próximas datas da série dentro da janela (puro, sem banco).
        datas = rec_engine.project_occurrences(
            r["_rrule"], r["_anchor"], r["_mode"],
            live_due=r["due_date"],            # ``date`` cru da linha viva
            window_start=janela_ini,
            window_end=janela_fim,
        )
        if not datas:
            continue
        base = _serialize_task(r)              # campos de exibição da série (título, prioridade…)
        for d in datas:
            # Clona o "cartão" da série para a data projetada; marca como virtual.
            ocorrencia = dict(base)
            ocorrencia["id"] = None                       # virtual não tem linha própria
            ocorrencia["series_task_id"] = r["id"]        # aponta para a tarefa viva da série
            ocorrencia["is_virtual"] = True
            ocorrencia["due_date"] = d.isoformat()
            ocorrencia["completed_at"] = None             # projeção futura está sempre aberta
            ocorrencia["project_name"] = r["project_name"]
            ocorrencia["tags"] = tags_por_id.get(r["id"], [])
            virtuais.append(ocorrencia)

    # Reais + virtuais, ordenadas por data (string ISO ordena cronologicamente).
    todas = reais + virtuais
    todas.sort(key=lambda t: (t.get("due_date") or "", t.get("due_time") or ""))
    return todas
