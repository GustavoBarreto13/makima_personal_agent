"""Fachada de tools do Yato — viagens, roteiro, checklist, conforto e orçamento.

Este módulo é a fachada fina que o agente ADK registra (via ``toolset.py``) e que o
router REST (``webapp/backend/routers/travel.py``) consome diretamente — mesma
convenção dos demais agentes (Mai/Akane): tools puras sobre PostgreSQL, sem MCP
próprio, todas devolvendo ``{"status": "ok"|"error", ...}``.

Módulos do domínio:
    tools.py            — este arquivo: trips, roteiro, checklist, orçamento +
                           cross-agent Nami + re-exports de tools_mobility.py.
    tools_mobility.py    — dossiê de mobilidade, protocolo de 7 passos, estratégia
                           consolidada e sugestão de apps regionais (FR-007 a FR-016).
    comfort_matrix.py    — motor PURO (sem banco) da matriz economia × conforto.

Cross-agent: `log_trip_expense` é o único ponto do domínio que escreve fora das
próprias tabelas — lança a despesa na Nami na mesma transação PostgreSQL do
incremento do orçamento (padrão `complete_payment_task`, Kaguya↔Nami).
"""

import uuid
from datetime import date, datetime
from typing import Optional
from zoneinfo import ZoneInfo

from agents.db import get_conn, run_select, run_dml

# ── Re-exporta a camada de lógica do dossiê de mobilidade (o agente registra
# estes nomes também) — nenhuma lógica duplicada aqui, só o registro.
from agents.yato.tools_mobility import (  # noqa: F401
    get_or_create_mobility_dossier,
    record_mobility_check,
    get_mobility_strategy,
    suggest_mobility_apps,
)
from agents.yato import tools_mobility
from agents.yato.comfort_matrix import recommend as _recommend_comfort

# ─── Fuso horário — America/Sao_Paulo (regra global do repo, FR-029) ────────

_TZ = ZoneInfo("America/Sao_Paulo")


def _today() -> str:
    """Data de hoje em America/Sao_Paulo, formato AAAA-MM-DD."""
    return datetime.now(_TZ).date().isoformat()


# ─── Helpers de resposta ─────────────────────────────────────────────────────

def _ok(**kwargs) -> dict:
    return {"status": "ok", **kwargs}


def _err(message: str) -> dict:
    return {"status": "error", "message": message}


# ─── Constantes de validação (enums do data-model.md) ───────────────────────

_VALID_PROFILES = {"economia", "equilibrado", "conforto"}
_VALID_STATUSES = {"planejando", "confirmada", "em_curso", "concluida", "cancelada"}
_VALID_PERIODS = {"manha", "tarde", "noite"}
_VALID_TRANSPORT_MODES = {
    "a_pe", "transporte_publico", "app_corrida", "taxi", "mototaxi", "transfer", "outro",
}
_VALID_BUDGET_CATEGORIES = {
    "transporte_ida", "transporte_volta", "hospedagem", "alimentacao",
    "mobilidade_local", "passeios", "outros",
}
_MAX_TRIP_DAYS = 60

# Mapa fixo de categoria Yato → Nami ao lançar gasto (plan.md D6) — preserva
# granularidade real nos relatórios financeiros da Nami.
_YATO_TO_NAMI_CATEGORY = {
    "alimentacao": "Alimentacao",
    "transporte_ida": "Transporte",
    "transporte_volta": "Transporte",
    "mobilidade_local": "Transporte",
    "hospedagem": "Viagem",
    "passeios": "Viagem",
    "outros": "Viagem",
}


def _validate_date_range(start_date: str, end_date: str) -> Optional[str]:
    """Valida `end_date >= start_date` e intervalo <= 60 dias (FR-002)."""
    try:
        sd = date.fromisoformat(start_date)
        ed = date.fromisoformat(end_date)
    except ValueError:
        return "Datas inválidas — use o formato AAAA-MM-DD."
    if ed < sd:
        return f"Data de volta ({end_date}) não pode ser anterior à data de ida ({start_date})."
    if (ed - sd).days > _MAX_TRIP_DAYS:
        return f"Intervalo de {(ed - sd).days} dias excede o máximo de {_MAX_TRIP_DAYS} dias."
    return None


def _serialize_trip(row: dict) -> dict:
    out = dict(row)
    for f in ("start_date", "end_date"):
        if out.get(f) is not None:
            out[f] = str(out[f])
    for f in ("created_at", "updated_at"):
        if out.get(f) is not None:
            out[f] = out[f].isoformat()
    return out


def _serialize_item(row: dict) -> dict:
    out = dict(row)
    if out.get("day_date") is not None:
        out["day_date"] = str(out["day_date"])
    if out.get("start_time") is not None:
        out["start_time"] = str(out["start_time"])
    if out.get("cost_estimate") is not None:
        out["cost_estimate"] = float(out["cost_estimate"])
    for f in ("created_at", "updated_at"):
        if out.get(f) is not None:
            out[f] = out[f].isoformat()
    return out


def _serialize_checklist_item(row: dict) -> dict:
    out = dict(row)
    if out.get("created_at") is not None:
        out["created_at"] = out["created_at"].isoformat()
    return out


# ═════════════════════════════════════════════════════════════════════════════
# Viagens (US1)
# ═════════════════════════════════════════════════════════════════════════════

def create_trip(
    city: str,
    state_uf: str,
    start_date: str,
    end_date: str,
    profile: str = "equilibrado",
    title: Optional[str] = None,
    notes: Optional[str] = None,
) -> dict:
    """Cria uma viagem. Uma cidade por viagem — roteiro itinerante encadeia viagens.

    Valida `end_date >= start_date` e intervalo <= 60 dias (FR-002) antes de
    qualquer escrita. Status inicial sempre `planejando` (FR-001).

    Args:
        city: Cidade de destino.
        state_uf: UF (2 letras).
        start_date: Data de ida (AAAA-MM-DD).
        end_date: Data de volta (AAAA-MM-DD).
        profile: economia | equilibrado | conforto. Default `equilibrado`.
        title: Título livre; se vazio, a UI monta "Cidade/UF".
        notes: Notas livres.

    Returns:
        dict com status='ok' e 'trip'.
    """
    if not city or not city.strip():
        return _err("Informe a cidade de destino.")
    if not state_uf or len(state_uf.strip()) != 2:
        return _err(f"Informe a UF (2 letras) do destino. Recebido: '{state_uf}'")
    if profile not in _VALID_PROFILES:
        return _err(f"Perfil inválido: '{profile}'. Use: {', '.join(sorted(_VALID_PROFILES))}")

    err = _validate_date_range(start_date, end_date)
    if err:
        return _err(err)

    trip_id = str(uuid.uuid4())
    run_dml(
        """
        INSERT INTO trips (id, title, city, state_uf, start_date, end_date, profile, notes)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (trip_id, title, city.strip(), state_uf.strip().upper(), start_date, end_date, profile, notes),
    )
    trip = run_select("SELECT * FROM trips WHERE id = %s", (trip_id,))[0]
    return _ok(trip=_serialize_trip(trip))


def list_trips(status: Optional[str] = None, sort: str = "recent", limit: int = 100) -> dict:
    """Lista viagens com filtro por status (aceita lista separada por vírgula) e ordenação.

    Args:
        status: Filtro por status, ex.: "confirmada,em_curso". None = todos.
        sort: recent (padrão, updated_at desc) | upcoming (start_date asc) | title.
        limit: Máximo de resultados (capado em 500).

    Returns:
        dict com status='ok', 'trips' e 'total'.
    """
    conditions = ["deleted = FALSE"]
    params: list = []

    if status:
        statuses = [s.strip() for s in status.split(",") if s.strip()]
        if statuses:
            conditions.append("status = ANY(%s)")
            params.append(statuses)

    order = {
        "recent": "updated_at DESC",
        "upcoming": "start_date ASC",
        "title": "title ASC NULLS LAST",
    }.get(sort, "updated_at DESC")

    where = " AND ".join(conditions)
    params.append(min(limit, 500))

    rows = run_select(
        f"SELECT * FROM trips WHERE {where} ORDER BY {order} LIMIT %s", params
    )
    trips = [_serialize_trip(r) for r in rows]
    return _ok(trips=trips, total=len(trips))


def get_trip(trip_id: str) -> dict:
    """Detalhe de uma viagem."""
    rows = run_select("SELECT * FROM trips WHERE id = %s AND deleted = FALSE", (trip_id,))
    if not rows:
        return _err(f"Viagem '{trip_id}' não encontrada.")
    return _ok(trip=_serialize_trip(rows[0]))


def update_trip(
    trip_id: str,
    title: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    profile: Optional[str] = None,
    status: Optional[str] = None,
    notes: Optional[str] = None,
) -> dict:
    """Atualiza campos de uma viagem — todos opcionais.

    Regra de órfãos (FR-005): se `start_date`/`end_date` mudar e existirem
    `trip_items` fora do novo intervalo, NENHUMA mudança é aplicada — devolve
    `{"status": "orphans_pending", ...}` e exige decisão explícita via
    `resolve_trip_orphans` antes de tentar de novo.

    Gatilho do snapshot (FR-013a): ao setar `status='confirmada'` pela primeira
    vez (transição para confirmada), congela o estado corrente dos 7 checks do
    dossiê da cidade em `trip_mobility_snapshots`, na mesma transação.

    Returns:
        dict com status='ok' e 'trip', ou o estado intermediário
        `{"status": "orphans_pending", "orphan_count", "orphan_item_ids", "message"}`.
    """
    rows = run_select("SELECT * FROM trips WHERE id = %s AND deleted = FALSE", (trip_id,))
    if not rows:
        return _err(f"Viagem '{trip_id}' não encontrada.")
    trip = rows[0]

    if profile is not None and profile not in _VALID_PROFILES:
        return _err(f"Perfil inválido: '{profile}'. Use: {', '.join(sorted(_VALID_PROFILES))}")
    if status is not None and status not in _VALID_STATUSES:
        return _err(f"Status inválido: '{status}'. Use: {', '.join(sorted(_VALID_STATUSES))}")

    if start_date is not None or end_date is not None:
        new_start = start_date or str(trip["start_date"])
        new_end = end_date or str(trip["end_date"])
        err = _validate_date_range(new_start, new_end)
        if err:
            return _err(err)

        orphans = run_select(
            "SELECT id FROM trip_items WHERE trip_id = %s AND (day_date < %s OR day_date > %s)",
            (trip_id, new_start, new_end),
        )
        if orphans:
            orphan_ids = [o["id"] for o in orphans]
            return {
                "status": "orphans_pending",
                "orphan_count": len(orphan_ids),
                "orphan_item_ids": orphan_ids,
                "message": (
                    f"{len(orphan_ids)} itens ficaram fora do novo intervalo. "
                    "Decida: mover ou remover (resolve_trip_orphans) antes de aplicar as novas datas."
                ),
            }

    fields = []
    params: list = []
    for col, val in (
        ("title", title), ("start_date", start_date), ("end_date", end_date),
        ("profile", profile), ("status", status), ("notes", notes),
    ):
        if val is not None:
            fields.append(f"{col} = %s")
            params.append(val)

    if not fields:
        return _ok(trip=_serialize_trip(trip))

    fields.append("updated_at = NOW()")
    set_clause = ", ".join(fields)
    entering_confirmada = status == "confirmada" and trip["status"] != "confirmada"

    if entering_confirmada:
        # Transação única: aplica o update E congela o snapshot de mobilidade
        # (FR-013a) — se o dossiê da cidade não existir ainda, não há nada
        # para congelar (nenhuma checagem foi feita), e o snapshot é pulado.
        import json  # local — usado só neste caminho, evita import morto no topo

        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(f"UPDATE trips SET {set_clause} WHERE id = %s", (*params, trip_id))

                cur.execute(
                    "SELECT id FROM mobility_dossiers WHERE city = %s AND state_uf = %s",
                    (trip["city"], trip["state_uf"]),
                )
                dossier_row = cur.fetchone()
                if dossier_row:
                    dossier_id = dossier_row[0]
                    cur.execute(
                        "SELECT check_key, verdict, source, evidence, checked_at "
                        "FROM mobility_checks WHERE dossier_id = %s",
                        (dossier_id,),
                    )
                    checks_payload = [
                        {
                            "check_key": r[0], "verdict": r[1], "source": r[2],
                            "evidence": r[3], "checked_at": r[4].isoformat() if r[4] else None,
                        }
                        for r in cur.fetchall()
                    ]
                    cur.execute(
                        "INSERT INTO trip_mobility_snapshots (id, trip_id, dossier_id, checks_payload) "
                        "VALUES (%s, %s, %s, %s::jsonb)",
                        (str(uuid.uuid4()), trip_id, dossier_id, json.dumps(checks_payload)),
                    )
    else:
        run_dml(f"UPDATE trips SET {set_clause} WHERE id = %s", (*params, trip_id))

    updated = run_select("SELECT * FROM trips WHERE id = %s", (trip_id,))[0]
    return _ok(trip=_serialize_trip(updated))


def resolve_trip_orphans(
    trip_id: str,
    action: str,
    item_ids: list[str],
    new_day_date: Optional[str] = None,
) -> dict:
    """Aplica a decisão do usuário sobre itens órfãos (FR-005): mover ou remover.

    Args:
        trip_id: UUID da viagem.
        action: "move" (exige `new_day_date`) ou "remove".
        item_ids: IDs dos itens de roteiro afetados.
        new_day_date: Nova data (AAAA-MM-DD), obrigatória quando `action="move"`.

    Returns:
        dict com status='ok', 'action' e 'affected' (quantidade de itens).
    """
    if action not in ("move", "remove"):
        return _err("action deve ser 'move' ou 'remove'.")
    if not item_ids:
        return _err("Informe ao menos um item_id.")

    if action == "move":
        if not new_day_date:
            return _err("new_day_date é obrigatório quando action='move'.")
        run_dml(
            "UPDATE trip_items SET day_date = %s, updated_at = NOW() WHERE trip_id = %s AND id = ANY(%s)",
            (new_day_date, trip_id, item_ids),
        )
    else:
        run_dml(
            "DELETE FROM trip_items WHERE trip_id = %s AND id = ANY(%s)",
            (trip_id, item_ids),
        )

    return _ok(action=action, affected=len(item_ids))


# ═════════════════════════════════════════════════════════════════════════════
# Roteiro (US1)
# ═════════════════════════════════════════════════════════════════════════════

def add_itinerary_item(
    trip_id: str,
    day_date: str,
    period: str,
    title: str,
    start_time: Optional[str] = None,
    address: Optional[str] = None,
    transport_mode: Optional[str] = None,
    cost_estimate: Optional[float] = None,
    notes: Optional[str] = None,
) -> dict:
    """Adiciona um item de roteiro. Recusa `day_date` fora do intervalo da viagem (FR-004)."""
    trip_rows = run_select("SELECT * FROM trips WHERE id = %s AND deleted = FALSE", (trip_id,))
    if not trip_rows:
        return _err(f"Viagem '{trip_id}' não encontrada.")
    trip = trip_rows[0]

    if period not in _VALID_PERIODS:
        return _err(f"Período inválido: '{period}'. Use: manha, tarde ou noite.")
    if transport_mode is not None and transport_mode not in _VALID_TRANSPORT_MODES:
        return _err(
            f"Modal de deslocamento inválido: '{transport_mode}'. "
            f"Use: {', '.join(sorted(_VALID_TRANSPORT_MODES))}"
        )
    if not title or not title.strip():
        return _err("Informe o título do item.")

    try:
        day = date.fromisoformat(day_date)
    except ValueError:
        return _err(f"day_date inválido: '{day_date}'. Use o formato AAAA-MM-DD.")

    if not (trip["start_date"] <= day <= trip["end_date"]):
        return _err(
            f"Data fora do intervalo da viagem ({trip['start_date']} a {trip['end_date']})."
        )

    pos_rows = run_select(
        "SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM trip_items "
        "WHERE trip_id = %s AND day_date = %s AND period = %s",
        (trip_id, day_date, period),
    )
    position = int(pos_rows[0]["next_pos"])

    item_id = str(uuid.uuid4())
    run_dml(
        """
        INSERT INTO trip_items (
            id, trip_id, day_date, period, start_time, title, address,
            transport_mode, cost_estimate, notes, position
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            item_id, trip_id, day_date, period, start_time, title.strip(), address,
            transport_mode, cost_estimate, notes, position,
        ),
    )
    item = run_select("SELECT * FROM trip_items WHERE id = %s", (item_id,))[0]
    return _ok(item=_serialize_item(item))


def list_itinerary(trip_id: str) -> dict:
    """Roteiro agrupado por dia, ordenado manhã→tarde→noite→posição (FR-006)."""
    trip_rows = run_select("SELECT id FROM trips WHERE id = %s AND deleted = FALSE", (trip_id,))
    if not trip_rows:
        return _err(f"Viagem '{trip_id}' não encontrada.")

    rows = run_select(
        """
        SELECT * FROM trip_items WHERE trip_id = %s
        ORDER BY day_date,
                 CASE period WHEN 'manha' THEN 0 WHEN 'tarde' THEN 1 WHEN 'noite' THEN 2 ELSE 3 END,
                 position
        """,
        (trip_id,),
    )

    days_map: dict[str, list] = {}
    order: list[str] = []
    for r in rows:
        item = _serialize_item(r)
        d = item["day_date"]
        if d not in days_map:
            days_map[d] = []
            order.append(d)
        days_map[d].append(item)

    days = [{"day_date": d, "items": days_map[d]} for d in order]
    return _ok(days=days)


def update_itinerary_item(
    item_id: str,
    day_date: Optional[str] = None,
    period: Optional[str] = None,
    start_time: Optional[str] = None,
    title: Optional[str] = None,
    address: Optional[str] = None,
    transport_mode: Optional[str] = None,
    cost_estimate: Optional[float] = None,
    notes: Optional[str] = None,
    position: Optional[int] = None,
) -> dict:
    """Atualiza campos de um item de roteiro — todos opcionais."""
    rows = run_select("SELECT * FROM trip_items WHERE id = %s", (item_id,))
    if not rows:
        return _err(f"Item de roteiro '{item_id}' não encontrado.")
    item = rows[0]

    if period is not None and period not in _VALID_PERIODS:
        return _err(f"Período inválido: '{period}'. Use: manha, tarde ou noite.")
    if transport_mode is not None and transport_mode not in _VALID_TRANSPORT_MODES:
        return _err(f"Modal de deslocamento inválido: '{transport_mode}'.")

    if day_date is not None:
        trip_rows = run_select(
            "SELECT start_date, end_date FROM trips WHERE id = %s", (item["trip_id"],)
        )
        trip = trip_rows[0]
        try:
            day = date.fromisoformat(day_date)
        except ValueError:
            return _err(f"day_date inválido: '{day_date}'. Use o formato AAAA-MM-DD.")
        if not (trip["start_date"] <= day <= trip["end_date"]):
            return _err(
                f"Data fora do intervalo da viagem ({trip['start_date']} a {trip['end_date']})."
            )

    fields = []
    params: list = []
    for col, val in (
        ("day_date", day_date), ("period", period), ("start_time", start_time),
        ("title", title), ("address", address), ("transport_mode", transport_mode),
        ("cost_estimate", cost_estimate), ("notes", notes), ("position", position),
    ):
        if val is not None:
            fields.append(f"{col} = %s")
            params.append(val)

    if not fields:
        return _ok(item=_serialize_item(item))

    fields.append("updated_at = NOW()")
    params.append(item_id)
    run_dml(f"UPDATE trip_items SET {', '.join(fields)} WHERE id = %s", params)

    updated = run_select("SELECT * FROM trip_items WHERE id = %s", (item_id,))[0]
    return _ok(item=_serialize_item(updated))


def delete_itinerary_item(item_id: str) -> dict:
    """Remove um item de roteiro."""
    rows = run_select("SELECT id FROM trip_items WHERE id = %s", (item_id,))
    if not rows:
        return _err(f"Item de roteiro '{item_id}' não encontrado.")
    run_dml("DELETE FROM trip_items WHERE id = %s", (item_id,))
    return _ok(item_id=item_id)


# ═════════════════════════════════════════════════════════════════════════════
# Checklist pré-viagem (US3)
# ═════════════════════════════════════════════════════════════════════════════

def list_checklist(trip_id: str, done: Optional[bool] = None) -> dict:
    """Lista o checklist de uma viagem, opcionalmente filtrado por `done`."""
    conditions = ["trip_id = %s"]
    params: list = [trip_id]
    if done is not None:
        conditions.append("done = %s")
        params.append(done)

    rows = run_select(
        f"SELECT * FROM trip_checklist_items WHERE {' AND '.join(conditions)} ORDER BY position",
        params,
    )
    return _ok(items=[_serialize_checklist_item(r) for r in rows])


def add_checklist_item(trip_id: str, label: str, category: Optional[str] = None) -> dict:
    """Adiciona um item manual ao checklist (`origin='manual'`)."""
    if not label or not label.strip():
        return _err("Informe o texto do item do checklist.")

    pos_rows = run_select(
        "SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM trip_checklist_items WHERE trip_id = %s",
        (trip_id,),
    )
    position = int(pos_rows[0]["next_pos"])

    item_id = str(uuid.uuid4())
    run_dml(
        "INSERT INTO trip_checklist_items (id, trip_id, label, category, position, origin) "
        "VALUES (%s, %s, %s, %s, %s, 'manual')",
        (item_id, trip_id, label.strip(), category, position),
    )
    item = run_select("SELECT * FROM trip_checklist_items WHERE id = %s", (item_id,))[0]
    return _ok(item=_serialize_checklist_item(item))


def set_checklist_item_done(item_id: str, done: bool) -> dict:
    """Marca/desmarca um item do checklist — progresso persiste entre sessões."""
    rows = run_select("SELECT id FROM trip_checklist_items WHERE id = %s", (item_id,))
    if not rows:
        return _err(f"Item de checklist '{item_id}' não encontrado.")
    run_dml("UPDATE trip_checklist_items SET done = %s WHERE id = %s", (bool(done), item_id))
    return _ok(item_id=item_id, done=bool(done))


def update_checklist_item(
    item_id: str, done: Optional[bool] = None, label: Optional[str] = None
) -> dict:
    """Atualiza `done` e/ou `label` de um item do checklist (usado pelo webapp)."""
    rows = run_select("SELECT * FROM trip_checklist_items WHERE id = %s", (item_id,))
    if not rows:
        return _err(f"Item de checklist '{item_id}' não encontrado.")

    fields = []
    params: list = []
    if done is not None:
        fields.append("done = %s")
        params.append(bool(done))
    if label is not None:
        if not label.strip():
            return _err("O texto do item não pode ficar vazio.")
        fields.append("label = %s")
        params.append(label.strip())

    if fields:
        params.append(item_id)
        run_dml(f"UPDATE trip_checklist_items SET {', '.join(fields)} WHERE id = %s", params)

    item = run_select("SELECT * FROM trip_checklist_items WHERE id = %s", (item_id,))[0]
    return _ok(item=_serialize_checklist_item(item))


def regenerate_checklist_from_dossier(trip_id: str) -> dict:
    """Gera itens de checklist a partir dos vereditos do dossiê da cidade (FR-016).

    Nunca duplica um `label` já existente na viagem, e nunca inclui item
    contraditório com um veredito `ausente`/`inconclusivo` (SC-008) — só sugere
    "instalar app X" quando o app está `confirmado`.

    Returns:
        dict com status='ok', 'added' e 'skipped_existing'.
    """
    trip_rows = run_select("SELECT city, state_uf FROM trips WHERE id = %s AND deleted = FALSE", (trip_id,))
    if not trip_rows:
        return _err(f"Viagem '{trip_id}' não encontrada.")
    trip = trip_rows[0]

    dossier_result = tools_mobility.get_or_create_mobility_dossier(trip["city"], trip["state_uf"])
    if dossier_result.get("status") != "ok":
        return dossier_result
    checks = {c["check_key"]: c for c in dossier_result["checks"]}

    candidates: list[tuple[str, Optional[str]]] = []
    if checks["uber"]["verdict"] == "confirmado":
        candidates.append(("Instalar o app Uber", "app"))
    if checks["99"]["verdict"] == "confirmado":
        candidates.append(("Instalar o app 99", "app"))
    if checks["indrive"]["verdict"] == "confirmado":
        candidates.append(("Instalar o app InDrive", "app"))
    if checks["transporte_publico"]["verdict"] == "confirmado":
        candidates.append(("Instalar o Moovit ou Cittamobi para o transporte público local", "app"))
    if checks["hospedagem_transfer"]["verdict"] == "confirmado":
        candidates.append(("Combinar o transfer com a pousada/hotel", "contato"))

    # Itens seguros por padrão — não contradizem nenhum veredito.
    candidates.append(("Salvar o telefone da cooperativa de táxi/mototáxi local", "contato"))
    candidates.append(("Baixar o mapa offline da região (Google Maps)", "app"))
    candidates.append(("Compartilhar o roteiro com alguém de confiança", "seguranca"))

    existing_rows = run_select(
        "SELECT label FROM trip_checklist_items WHERE trip_id = %s", (trip_id,)
    )
    existing_labels = {r["label"].strip().lower() for r in existing_rows}

    pos_rows = run_select(
        "SELECT COALESCE(MAX(position), -1) AS max_pos FROM trip_checklist_items WHERE trip_id = %s",
        (trip_id,),
    )
    next_pos = int(pos_rows[0]["max_pos"]) + 1

    added = 0
    skipped = 0
    for label, category in candidates:
        if label.strip().lower() in existing_labels:
            skipped += 1
            continue
        run_dml(
            "INSERT INTO trip_checklist_items (id, trip_id, label, category, position, origin) "
            "VALUES (%s, %s, %s, %s, %s, 'dossie')",
            (str(uuid.uuid4()), trip_id, label, category, next_pos),
        )
        existing_labels.add(label.strip().lower())
        next_pos += 1
        added += 1

    return _ok(added=added, skipped_existing=skipped)


# ═════════════════════════════════════════════════════════════════════════════
# Matriz economia × conforto (US4) — fachada sobre o motor puro
# ═════════════════════════════════════════════════════════════════════════════

def recommend_comfort_class(
    hours: float,
    night: bool = False,
    profile: str = "equilibrado",
    has_ride_app: bool = False,
) -> dict:
    """Recomenda a categoria rodoviária ANTT e a fila de ROI de upgrades (FR-017 a FR-019).

    Fachada fina sobre `agents.yato.comfort_matrix.recommend` — motor puro, sem
    banco. Ver `comfort_matrix.py` para a heurística de custo de exaustão.
    """
    result = _recommend_comfort(hours, night=night, profile=profile, has_ride_app=has_ride_app)
    return _ok(**result)


# ═════════════════════════════════════════════════════════════════════════════
# Orçamento e cross-agent Nami (US5)
# ═════════════════════════════════════════════════════════════════════════════

def set_trip_budget(trip_id: str, items: list[dict]) -> dict:
    """Define/atualiza o `estimated` de uma ou mais categorias (upsert).

    Args:
        trip_id: UUID da viagem.
        items: Lista de `{"category": ..., "estimated": ...}`.

    Returns:
        O mesmo formato de `get_trip_budget` após aplicar os upserts.
    """
    trip_rows = run_select("SELECT id FROM trips WHERE id = %s AND deleted = FALSE", (trip_id,))
    if not trip_rows:
        return _err(f"Viagem '{trip_id}' não encontrada.")

    for item in items:
        category = item.get("category")
        if category not in _VALID_BUDGET_CATEGORIES:
            return _err(
                f"Categoria de orçamento inválida: '{category}'. "
                f"Use: {', '.join(sorted(_VALID_BUDGET_CATEGORIES))}"
            )

    for item in items:
        run_dml(
            """
            INSERT INTO trip_budget_items (id, trip_id, category, estimated)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (trip_id, category) DO UPDATE SET
                estimated = EXCLUDED.estimated, updated_at = NOW()
            """,
            (str(uuid.uuid4()), trip_id, item["category"], item["estimated"]),
        )

    return get_trip_budget(trip_id)


def get_trip_budget(trip_id: str) -> dict:
    """Estimado, realizado e saldo por categoria + total (FR-022)."""
    trip_rows = run_select("SELECT id FROM trips WHERE id = %s AND deleted = FALSE", (trip_id,))
    if not trip_rows:
        return _err(f"Viagem '{trip_id}' não encontrada.")

    rows = run_select(
        "SELECT category, estimated, actual FROM trip_budget_items WHERE trip_id = %s ORDER BY category",
        (trip_id,),
    )

    items = []
    total_estimated = 0.0
    total_actual = 0.0
    for r in rows:
        estimated = float(r["estimated"])
        actual = float(r["actual"])
        items.append({
            "category": r["category"],
            "estimated": estimated,
            "actual": actual,
            "balance": estimated - actual,
            "over_budget": actual > estimated,
        })
        total_estimated += estimated
        total_actual += actual

    return _ok(
        items=items,
        total_estimated=total_estimated,
        total_actual=total_actual,
        total_balance=total_estimated - total_actual,
    )


def list_trip_expenses(trip_id: str) -> dict:
    """Lista os gastos já lançados na viagem, lendo as transações da Nami.

    Leitura direta (read-only) da tabela `transactions` da Nami pelos IDs
    acumulados em `trip_budget_items.nami_transaction_ids` — mesmo padrão de
    leitura cross-domain do `webapp/backend/routers/hub.py` (consulta direto a
    tabela de outro domínio, sem duplicar a lógica de escrita).

    Returns:
        dict com status='ok' e 'expenses', mais recentes primeiro.
    """
    trip_rows = run_select("SELECT id FROM trips WHERE id = %s AND deleted = FALSE", (trip_id,))
    if not trip_rows:
        return _err(f"Viagem '{trip_id}' não encontrada.")

    budget_rows = run_select(
        "SELECT category, nami_transaction_ids FROM trip_budget_items WHERE trip_id = %s",
        (trip_id,),
    )

    expenses = []
    for row in budget_rows:
        tx_ids = row.get("nami_transaction_ids") or []
        if not tx_ids:
            continue
        tx_rows = run_select(
            "SELECT id, name, valor, data FROM transactions WHERE id = ANY(%s)",
            (tx_ids,),
        )
        for tx in tx_rows:
            expenses.append({
                "category": row["category"],
                "nami_transaction_id": tx["id"],
                "description": tx["name"],
                "amount": float(tx["valor"]),
                "date": str(tx["data"]),
            })

    expenses.sort(key=lambda e: e["date"], reverse=True)
    return _ok(expenses=expenses)


def log_trip_expense(
    trip_id: str,
    category: str,
    amount: float,
    description: str,
    date: Optional[str] = None,
) -> dict:
    """Registra um gasto realizado E lança a despesa na Nami, atomicamente (FR-021).

    A tool cross-domain do Yato — o único ponto do domínio que escreve fora de
    suas próprias tabelas. Mesmo padrão de `complete_payment_task`
    (Kaguya↔Nami): um cursor psycopg2 compartilhado, commit único ao sair sem
    exceção. Se qualquer lado falhar, `conn.rollback()` — nada é gravado dos
    dois lados (SC-006).

    Args:
        trip_id: UUID da viagem.
        category: transporte_ida | transporte_volta | hospedagem | alimentacao |
            mobilidade_local | passeios | outros.
        amount: Valor do gasto (> 0).
        description: Descrição do gasto — vira o nome da transação na Nami.
        date: Data do gasto (AAAA-MM-DD). Default: hoje em America/Sao_Paulo.

    Returns:
        dict com status='ok', 'budget_item' e 'nami_transaction_id', ou
        status='error' se qualquer lado falhar (nada gravado).
    """
    if category not in _VALID_BUDGET_CATEGORIES:
        return _err(
            f"Categoria de orçamento inválida: '{category}'. "
            f"Use: {', '.join(sorted(_VALID_BUDGET_CATEGORIES))}"
        )
    if amount is None or amount <= 0:
        return _err("O valor do gasto deve ser maior que zero.")

    trip_rows = run_select("SELECT id FROM trips WHERE id = %s AND deleted = FALSE", (trip_id,))
    if not trip_rows:
        return _err(f"Viagem '{trip_id}' não encontrada.")

    date_val = date or _today()
    nami_category = _YATO_TO_NAMI_CATEGORY[category]

    # Import local evita acoplar a inicialização do Yato às dependências da Nami
    # (mesmo padrão de agents/kaguya/tools.py::complete_payment_task).
    from agents.nami.tools import create_transaction_on_cursor

    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                tx = create_transaction_on_cursor(
                    cur, name=description, valor=amount, tipo="Despesa",
                    categoria=nami_category, data=date_val, source="yato",
                )
                if tx.get("status") != "ok":
                    conn.rollback()
                    return {
                        "status": "error",
                        "message": tx.get("message", "Não foi possível lançar a despesa na Nami."),
                    }

                tx_id = tx["id"]
                cur.execute(
                    """
                    INSERT INTO trip_budget_items (id, trip_id, category, estimated, actual, nami_transaction_ids)
                    VALUES (%s, %s, %s, 0, %s, ARRAY[%s])
                    ON CONFLICT (trip_id, category) DO UPDATE SET
                        actual = trip_budget_items.actual + EXCLUDED.actual,
                        nami_transaction_ids = array_append(
                            COALESCE(trip_budget_items.nami_transaction_ids, ARRAY[]::TEXT[]), %s
                        ),
                        updated_at = NOW()
                    """,
                    (str(uuid.uuid4()), trip_id, category, amount, tx_id, tx_id),
                )
    except Exception as exc:
        return {"status": "error", "message": f"Erro ao registrar o gasto: {exc}"}

    budget_row = run_select(
        "SELECT actual FROM trip_budget_items WHERE trip_id = %s AND category = %s",
        (trip_id, category),
    )[0]

    return _ok(
        budget_item={"category": category, "actual": float(budget_row["actual"])},
        nami_transaction_id=tx_id,
    )


def get_trip_readiness(trip_id: str) -> dict:
    """Combina checklist + dossiê + orçamento definido num resumo único (tela Início)."""
    trip_rows = run_select("SELECT city, state_uf FROM trips WHERE id = %s AND deleted = FALSE", (trip_id,))
    if not trip_rows:
        return _err(f"Viagem '{trip_id}' não encontrada.")
    trip = trip_rows[0]

    checklist_rows = run_select(
        "SELECT done FROM trip_checklist_items WHERE trip_id = %s", (trip_id,)
    )
    checklist_total = len(checklist_rows)
    checklist_done = sum(1 for r in checklist_rows if r["done"])

    dossier_result = tools_mobility.get_or_create_mobility_dossier(trip["city"], trip["state_uf"])
    dossier_pending = 0
    if dossier_result.get("status") == "ok":
        dossier_pending = sum(1 for c in dossier_result["checks"] if c["verdict"] == "pendente")

    budget_rows = run_select(
        "SELECT COUNT(*) AS n FROM trip_budget_items WHERE trip_id = %s", (trip_id,)
    )
    budget_defined = int(budget_rows[0]["n"]) > 0

    dims = []
    if checklist_total > 0:
        dims.append(checklist_done / checklist_total)
    dims.append(1.0 if dossier_pending == 0 else max(0.0, 1 - dossier_pending / 7))
    dims.append(1.0 if budget_defined else 0.0)
    readiness_pct = round(sum(dims) / len(dims) * 100) if dims else 0

    return _ok(
        readiness_pct=readiness_pct,
        checklist_done=checklist_done,
        checklist_total=checklist_total,
        dossier_pending=dossier_pending,
        budget_defined=budget_defined,
    )
