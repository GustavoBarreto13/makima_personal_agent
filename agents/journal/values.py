"""Avaliação dos Valores — persistência (spec 076).

O roteiro e as contas estão em ``values_diagnosis`` (puro). Aqui ficam as tabelas:

    journal_values_assessments  — uma avaliação (rascunho ou concluída); refazer cria outra
    journal_values_areas        — as 12 áreas de uma avaliação (texto, narrativa, 6 notas)
    journal_values_commitments  — ações compromissadas (podem virar tarefa na Kaguya)
    journal_values_checkins     — check-in semanal leve de ação/satisfação por área

E o bloco de contexto que o Conselho e a Revisão semanal recebem (``values_context_for_counsel``).
"""

from __future__ import annotations

import logging
from datetime import date, timedelta

import psycopg2.errors
import psycopg2.extras

from agents.journal import values_diagnosis as VD

logger = logging.getLogger(__name__)

_AREA_FIELDS = ("description", "narrative", "skipped", *VD.SCORE_FIELDS)


def _conn():
    from agents.journal.tools import _get_conn  # noqa: PLC0415
    return _get_conn()


def _ensure_values_tables() -> None:
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS journal_values_assessments (
                    id           SERIAL PRIMARY KEY,
                    status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','complete')),
                    started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    completed_at TIMESTAMPTZ,
                    summary_md   TEXT
                )
            """)
            # No máximo um rascunho por vez.
            cur.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS uq_values_assessment_draft
                ON journal_values_assessments ((true)) WHERE status = 'draft'
            """)
            score_cols = ",\n".join(
                f"{f} SMALLINT CHECK ({f} BETWEEN 1 AND 10)" for f in VD.SCORE_FIELDS
            )
            cur.execute(f"""
                CREATE TABLE IF NOT EXISTS journal_values_areas (
                    assessment_id INT NOT NULL REFERENCES journal_values_assessments(id) ON DELETE CASCADE,
                    domain_key    TEXT NOT NULL,
                    description   TEXT,
                    narrative     TEXT,
                    skipped       BOOLEAN NOT NULL DEFAULT FALSE,
                    {score_cols},
                    PRIMARY KEY (assessment_id, domain_key)
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS journal_values_commitments (
                    id            SERIAL PRIMARY KEY,
                    assessment_id INT NOT NULL REFERENCES journal_values_assessments(id) ON DELETE CASCADE,
                    domain_key    TEXT NOT NULL,
                    text          TEXT NOT NULL,
                    task_id       INT,
                    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS journal_values_checkins (
                    id           SERIAL PRIMARY KEY,
                    week_start   DATE NOT NULL,
                    domain_key   TEXT NOT NULL,
                    action       SMALLINT CHECK (action BETWEEN 1 AND 10),
                    satisfaction SMALLINT CHECK (satisfaction BETWEEN 1 AND 10),
                    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE (week_start, domain_key)
                )
            """)
        conn.commit()
    finally:
        conn.close()


def _serialize_assessment(row: dict) -> dict:
    a = dict(row)
    for f in ("started_at", "completed_at"):
        if a.get(f):
            a[f] = a[f].isoformat()
    return a


def _load(cur, assessment_id: int) -> dict | None:
    cur.execute("SELECT * FROM journal_values_assessments WHERE id = %s", (assessment_id,))
    row = cur.fetchone()
    if row is None:
        return None
    a = _serialize_assessment(row)
    cur.execute("SELECT * FROM journal_values_areas WHERE assessment_id = %s", (assessment_id,))
    by_key = {r["domain_key"]: dict(r) for r in cur.fetchall()}
    areas = []
    for d in VD.DOMAINS:
        r = by_key.get(d["key"]) or {"domain_key": d["key"], "skipped": False}
        r.pop("assessment_id", None)
        r["hints"] = VD.text_hints(d["key"], r.get("description") or "")
        areas.append(r)
    a["areas"] = areas
    cur.execute(
        "SELECT id, domain_key, text, task_id, created_at FROM journal_values_commitments WHERE assessment_id = %s ORDER BY id",
        (assessment_id,),
    )
    a["commitments"] = [{**dict(r), "created_at": r["created_at"].isoformat()} for r in cur.fetchall()]
    a["diagnosis"] = VD.diagnose(areas)
    return a


def get_domains() -> dict:
    """O roteiro completo (introdução, 12 áreas com perguntas-guia, as 6 notas e a pergunta-chave)."""
    return {"intro": list(VD.INTRO), "domains": [{**d, "questions": list(d["questions"])} for d in VD.DOMAINS],
            "scores": list(VD.SCORES), "key_question": VD.KEY_QUESTION}


def get_current() -> dict:
    """A avaliação em andamento (rascunho) ou, se não houver, a última concluída.

    Returns:
        ``{"status": "ok", "assessment": {...}|None, "draft": bool}``.
    """
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT id FROM journal_values_assessments
                ORDER BY (status = 'draft') DESC, completed_at DESC NULLS LAST, id DESC LIMIT 1
            """)
            row = cur.fetchone()
            a = _load(cur, row["id"]) if row else None
        return {"status": "ok", "assessment": a, "draft": bool(a and a["status"] == "draft")}
    finally:
        conn.close()


def start_assessment() -> dict:
    """Começar (ou retomar) uma avaliação. Refazer parte da última concluída, pré-preenchida.

    Returns:
        ``{"status": "ok", "assessment": {...}}``.
    """
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT id FROM journal_values_assessments WHERE status = 'draft'")
            draft = cur.fetchone()
            if draft:
                return {"status": "ok", "assessment": _load(cur, draft["id"])}
            cur.execute("INSERT INTO journal_values_assessments DEFAULT VALUES RETURNING id")
            new_id = cur.fetchone()["id"]
            cur.execute("""
                SELECT id FROM journal_values_assessments
                WHERE status = 'complete' ORDER BY completed_at DESC LIMIT 1
            """)
            prev = cur.fetchone()
            if prev:
                cols = ", ".join(_AREA_FIELDS)
                cur.execute(f"""
                    INSERT INTO journal_values_areas (assessment_id, domain_key, {cols})
                    SELECT %s, domain_key, {cols} FROM journal_values_areas WHERE assessment_id = %s
                """, (new_id, prev["id"]))
            a = _load(cur, new_id)
        conn.commit()
        return {"status": "ok", "assessment": a}
    finally:
        conn.close()


def update_area(assessment_id: int, domain_key: str, **fields) -> dict:
    """Salvar (parcial) uma área do rascunho: texto, narrativa, pular e as notas 1–10.

    Returns:
        ``{"status": "ok", "area": {...}, "diagnosis": {...}}`` ou erro.
    """
    if domain_key not in VD.DOMAIN_KEYS:
        return {"status": "error", "message": "área desconhecida"}
    updates = {k: v for k, v in fields.items() if k in _AREA_FIELDS}
    for f in VD.SCORE_FIELDS:
        if updates.get(f) is not None and not (1 <= int(updates[f]) <= 10):
            return {"status": "error", "message": f"{f} deve ficar entre 1 e 10"}
    if not updates:
        return {"status": "error", "message": "nada para salvar"}
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT status FROM journal_values_assessments WHERE id = %s", (assessment_id,))
            row = cur.fetchone()
            if row is None:
                return {"status": "error", "message": "avaliação não encontrada"}
            if row["status"] != "draft":
                return {"status": "error", "message": "avaliação concluída — refaça para editar"}
            cols = list(updates)
            cur.execute(f"""
                INSERT INTO journal_values_areas (assessment_id, domain_key, {", ".join(cols)})
                VALUES (%s, %s, {", ".join(["%s"] * len(cols))})
                ON CONFLICT (assessment_id, domain_key) DO UPDATE SET
                    {", ".join(f"{c} = EXCLUDED.{c}" for c in cols)}
            """, (assessment_id, domain_key, *updates.values()))
            a = _load(cur, assessment_id)
        conn.commit()
        area = next(x for x in a["areas"] if x["domain_key"] == domain_key)
        return {"status": "ok", "area": area, "diagnosis": a["diagnosis"]}
    finally:
        conn.close()


def build_summary(a: dict) -> str:
    """Resumo em Markdown (determinístico) — o que vira contexto da Violet."""
    labels = {d["key"]: d["label"] for d in VD.DOMAINS}
    diag = a["diagnosis"]
    lines = ["## Meus valores"]
    for r in diag["ranked"]:
        area = next(x for x in a["areas"] if x["domain_key"] == r["domain_key"])
        frase = (area.get("narrative") or area.get("description") or "").strip()
        if frase:
            lines.append(f"- **{labels[r['domain_key']]}** (importância {r['importance']}, satisfação {r['satisfaction']}): {frase}")
    if diag["alerts"]:
        lines.append("\n## Áreas de alerta")
        lines += [f"- {labels[k]}" for k in diag["alerts"]]
    if a.get("commitments"):
        lines.append("\n## Ações compromissadas")
        lines += [f"- {labels.get(c['domain_key'], c['domain_key'])}: {c['text']}" for c in a["commitments"]]
    return "\n".join(lines)


def complete_assessment(assessment_id: int) -> dict:
    """Concluir o rascunho e gravar o resumo. Returns ``{"status": "ok", "assessment"}``."""
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            a = _load(cur, assessment_id)
            if a is None:
                return {"status": "error", "message": "avaliação não encontrada"}
            if a["status"] != "draft":
                return {"status": "ok", "assessment": a}
            cur.execute("""
                UPDATE journal_values_assessments
                SET status = 'complete', completed_at = NOW(), summary_md = %s
                WHERE id = %s
            """, (build_summary(a), assessment_id))
            a = _load(cur, assessment_id)
        conn.commit()
        return {"status": "ok", "assessment": a}
    finally:
        conn.close()


def discard_draft() -> dict:
    """Descartar o rascunho atual (não mexe nas concluídas)."""
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM journal_values_assessments WHERE status = 'draft'")
        conn.commit()
        return {"status": "ok"}
    finally:
        conn.close()


def list_history() -> dict:
    """Avaliações concluídas (mais nova primeiro) + evolução por área."""
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT id FROM journal_values_assessments WHERE status = 'complete' ORDER BY completed_at")
            versions = [_load(cur, r["id"]) for r in cur.fetchall()]
        return {"status": "ok", "versions": list(reversed(versions)), "evolution": VD.evolution(versions)}
    finally:
        conn.close()


def add_commitment(assessment_id: int, domain_key: str, text: str, task_id: int | None = None) -> dict:
    if domain_key not in VD.DOMAIN_KEYS or not (text or "").strip():
        return {"status": "error", "message": "área ou texto inválido"}
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                INSERT INTO journal_values_commitments (assessment_id, domain_key, text, task_id)
                VALUES (%s, %s, %s, %s) RETURNING id, domain_key, text, task_id, created_at
            """, (assessment_id, domain_key, text.strip(), task_id))
            row = dict(cur.fetchone())
        conn.commit()
        row["created_at"] = row["created_at"].isoformat()
        return {"status": "ok", "commitment": row}
    except psycopg2.errors.ForeignKeyViolation:
        conn.rollback()
        return {"status": "error", "message": "avaliação não encontrada"}
    finally:
        conn.close()


def update_commitment(commitment_id: int, text: str | None = None, task_id: int | None = None) -> dict:
    sets, vals = [], []
    if text is not None:
        sets.append("text = %s")
        vals.append(text.strip())
    if task_id is not None:
        sets.append("task_id = %s")
        vals.append(task_id)
    if not sets:
        return {"status": "error", "message": "nada para salvar"}
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute(f"UPDATE journal_values_commitments SET {', '.join(sets)} WHERE id = %s", (*vals, commitment_id))
            if cur.rowcount == 0:
                return {"status": "error", "message": "compromisso não encontrado"}
        conn.commit()
        return {"status": "ok"}
    finally:
        conn.close()


def delete_commitment(commitment_id: int) -> dict:
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM journal_values_commitments WHERE id = %s", (commitment_id,))
        conn.commit()
        return {"status": "ok"}
    finally:
        conn.close()


def _week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


def checkin(domain_key: str, action: int | None = None, satisfaction: int | None = None,
            week_start: str | None = None) -> dict:
    """Check-in semanal de uma área (sobre a semana que passou). Idempotente por semana+área."""
    from agents.journal.tools import _today_sp  # noqa: PLC0415

    if domain_key not in VD.DOMAIN_KEYS:
        return {"status": "error", "message": "área desconhecida"}
    for v in (action, satisfaction):
        if v is not None and not (1 <= int(v) <= 10):
            return {"status": "error", "message": "notas entre 1 e 10"}
    # A semana avaliada é a que terminou: segunda passada → domingo.
    ws = date.fromisoformat(week_start) if week_start else _week_start(_today_sp() - timedelta(days=1))
    conn = _conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO journal_values_checkins (week_start, domain_key, action, satisfaction)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (week_start, domain_key) DO UPDATE SET
                    action = COALESCE(EXCLUDED.action, journal_values_checkins.action),
                    satisfaction = COALESCE(EXCLUDED.satisfaction, journal_values_checkins.satisfaction)
            """, (ws, domain_key, action, satisfaction))
        conn.commit()
        return {"status": "ok", "week_start": ws.isoformat()}
    finally:
        conn.close()


def list_checkins(weeks: int = 8) -> list[dict]:
    from agents.db import run_select  # noqa: PLC0415
    rows = run_select(
        """SELECT week_start::text AS week_start, domain_key, action, satisfaction
           FROM journal_values_checkins
           WHERE week_start >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::date - %(d)s
           ORDER BY week_start""",
        {"d": weeks * 7},
    )
    return rows


def _task_status(task_ids: list[int]) -> dict[int, str]:
    if not task_ids:
        return {}
    try:
        from agents.db import run_select  # noqa: PLC0415
        rows = run_select(
            """SELECT id, CASE WHEN completed_at IS NOT NULL THEN 'concluída'
                              WHEN deleted_at IS NOT NULL THEN 'apagada'
                              WHEN due_date < (NOW() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'atrasada'
                              ELSE 'pendente' END AS st
               FROM tasks WHERE id = ANY(%(ids)s)""",
            {"ids": task_ids},
        )
        return {r["id"]: r["st"] for r in rows}
    except Exception:  # noqa: BLE001
        return {}


def values_context_for_counsel() -> str:
    """Bloco compacto com os valores para os prompts do Conselho e da Revisão semanal.

    Traz as narrativas das áreas que importam (importância 7+), as áreas de alerta, os
    compromissos com o status da tarefa na Kaguya e os últimos check-ins. Vazio se a pessoa
    nunca fez a avaliação.
    """
    try:
        cur = get_current()
    except Exception as exc:  # noqa: BLE001
        logger.warning("values: contexto indisponível: %s", exc)
        return ""
    a = cur.get("assessment")
    if not a:
        return ""
    labels = {d["key"]: d["label"] for d in VD.DOMAINS}
    lines = [f"(avaliação {'em andamento' if a['status'] == 'draft' else 'concluída em ' + (a.get('completed_at') or '')[:10]})"]
    for r in a["diagnosis"]["ranked"]:
        if (r["importance"] or 0) < 7:
            continue
        area = next(x for x in a["areas"] if x["domain_key"] == r["domain_key"])
        frase = (area.get("narrative") or area.get("description") or "").strip()
        lines.append(f"- {labels[r['domain_key']]}: importância {r['importance']}, ação {r['action']}, "
                     f"satisfação {r['satisfaction']}, preocupação {r['concern']}"
                     + (" [ALERTA]" if r["alert"] else "") + (f" — \"{frase[:200]}\"" if frase else ""))
    status = _task_status([c["task_id"] for c in a.get("commitments", []) if c.get("task_id")])
    if a.get("commitments"):
        lines.append("Compromissos assumidos:")
        for c in a["commitments"]:
            st = status.get(c["task_id"], "sem tarefa") if c.get("task_id") else "não virou tarefa"
            lines.append(f"- {labels.get(c['domain_key'], c['domain_key'])}: {c['text']} ({st})")
    try:
        trend = VD.checkin_trend(list_checkins(6))
        if trend:
            lines.append("Check-ins semanais (satisfação da última semana vs. média anterior):")
            for k, t in trend.items():
                lines.append(f"- {labels.get(k, k)}: {t['last'].get('satisfaction')} (antes {t['prev_avg_satisfaction']}, {t['trend']})")
    except Exception:  # noqa: BLE001
        pass
    return "\n".join(lines)


try:
    _ensure_values_tables()
except Exception as exc:  # noqa: BLE001
    logger.warning("journal/values: não foi possível criar as tabelas ao importar: %s", exc)
