"""Camada de lógica — **Tiny Experiments** (spec 029).

Sétima peça da **camada de lógica única** da Kaguya (junto de ``tools_tasks``, ``tools_projects``,
``tools_tags``, ``tools_filters``, ``tools_kanban_views`` e ``tools_habits``). Aqui vive TODA a
regra de negócio dos experimentos; o webapp (router ``/api/tasks/experiments/*``) é uma fachada
fina sobre estas funções. **Webapp-first**: nesta fatia NENHUMA função é registrada no agente ADK
(research D6) — a fachada ``tools.py`` só re-exporta, deixando o ponto de extensão marcado.

O que é um "experimento": uma prática testável COM PRAZO ("Vou [ação] por [duração]"), com
check-ins periódicos (fez? / sensação 1–5 / nota) cuja **aderência perdoa falhas** (razão
simples, motor puro ``experiment_adherence``). Difere do hábito (contínuo, sem fim): tem
início/fim, pode ser **pausado/retomado** e encerra com uma **revisão** (veredicto +
aprendizado). Ver ``specs/029-tasks-tiny-experiments/``.

Convenções (iguais às outras tools):
    - Funções de **mutação** retornam ``{"status": "ok"|"error", ...}``.
    - Funções de **listagem/leitura** retornam o dado direto (lista/dict).
    - Acesso ao banco via ``agents.db`` (psycopg2 síncrono); "hoje" em **UTC-3**.
    - Exclusão é **hard delete** (D3) — o ``ON DELETE CASCADE`` apaga os check-ins junto.

Contrato REST: ``specs/029-tasks-tiny-experiments/contracts/api-experiments.md``.
Regras/estados: ``specs/029-tasks-tiny-experiments/data-model.md``.
"""

from datetime import date, datetime
from typing import Optional
from zoneinfo import ZoneInfo

from agents.db import get_conn, run_select
from agents.kaguya import experiment_adherence as ADH

# Fuso do usuário (UTC-3). Toda derivação de "hoje" passa por aqui — nunca date.today() cru
# nem CURRENT_DATE (que seriam a data UTC do container). Regra mandatória do projeto.
_SP_TZ = ZoneInfo("America/Sao_Paulo")

# Sentinela para distinguir "campo não enviado" de "enviado como None (limpar)" no update.
_UNSET = object()

# Conjuntos válidos — validamos aqui para devolver erro amigável (400) antes do CHECK do banco.
_VALID_CADENCES = {"daily", "weekly"}
_VALID_VERDICTS = {"persist", "pause", "pivot"}

# Colunas persistidas de tiny_experiments (ordem estável nas respostas).
_EXP_FIELDS = [
    "id", "title", "why", "hypothesis", "cadence", "start_date", "end_date",
    "status", "paused_at", "paused_period_days", "verdict", "review",
    "created_at", "updated_at",
]
_EXP_COLUMNS = ", ".join(_EXP_FIELDS)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers internos
# ─────────────────────────────────────────────────────────────────────────────
def _today() -> date:
    """Retorna a data de "hoje" no fuso do usuário (UTC-3), nunca a data UTC do container."""
    return datetime.now(_SP_TZ).date()


def _period_date(d: date, cadence: str) -> date:
    """Normaliza uma data para o início do período (segunda da semana p/ semanal). Ver motor puro."""
    return ADH.period_date_for(d, cadence)


def _serialize_experiment(row: dict, logs: Optional[list] = None, *, today: Optional[date] = None) -> dict:
    """Monta o dicionário de um experimento para a resposta: campos persistidos + derivados.

    Os campos derivados (aderência, ``logged_current``, ``days_remaining``, ``is_overdue``) vêm
    do motor puro :func:`experiment_adherence.summary`, calculados na leitura — nunca persistidos.
    Datas viram ``"YYYY-MM-DD"`` e timestamps ISO 8601 (contrato REST).

    Args:
        row: Linha de ``tiny_experiments`` (via ``run_select``).
        logs: Check-ins do experimento ``[{period_date, done, feeling, note}, ...]``. Quando
            fornecido, o campo ``logs`` (serializado) é anexado à resposta (usado no detalhe).
        today: Data de referência (padrão: hoje UTC-3).

    Returns:
        Dicionário do experimento pronto para o JSON da API.
    """
    ref = today or _today()
    # O motor só precisa de {period_date, done}; passamos os logs (ou lista vazia).
    log_rows = logs or []
    derived = ADH.summary(
        start_date=row["start_date"],
        end_date=row["end_date"],
        cadence=row["cadence"],
        status=row["status"],
        paused_at=row.get("paused_at"),
        paused_period_days=row.get("paused_period_days", 0),
        logs=[{"period_date": l["period_date"], "done": l["done"]} for l in log_rows],
        today=ref,
    )

    out = {
        "id": row["id"],
        "title": row["title"],
        "why": row.get("why"),
        "hypothesis": row.get("hypothesis"),
        "cadence": row["cadence"],
        "start_date": row["start_date"].isoformat(),
        "end_date": row["end_date"].isoformat(),
        "status": row["status"],
        "verdict": row.get("verdict"),
        "review": row.get("review"),
        # Derivados (não persistidos):
        "periods_done": derived["periods_done"],
        "periods_expected": derived["periods_expected"],
        "adherence_pct": derived["adherence_pct"],
        "logged_current": derived["logged_current"],
        "days_remaining": derived["days_remaining"],
        "is_overdue": derived["is_overdue"],
        "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
        "updated_at": row["updated_at"].isoformat() if row.get("updated_at") else None,
    }
    if logs is not None:
        # Detalhe: anexa os check-ins ordenados (o chamador já ordenou por period_date).
        out["logs"] = [_serialize_log(l) for l in log_rows]
    return out


def _serialize_log(row: dict) -> dict:
    """Serializa um check-in (``tiny_experiment_logs``) para o JSON (datas como texto)."""
    return {
        "id": row["id"],
        "period_date": row["period_date"].isoformat(),
        "done": row["done"],
        "feeling": row.get("feeling"),
        "note": row.get("note"),
    }


def _fetch_experiment(cur, experiment_id: int) -> Optional[dict]:
    """Carrega uma linha de ``tiny_experiments`` por id usando um cursor aberto (ou None)."""
    cur.execute(
        f"SELECT {_EXP_COLUMNS} FROM tiny_experiments WHERE id = %s", (experiment_id,)
    )
    row = cur.fetchone()
    if not row:
        return None
    # cursor comum devolve tupla → mapeia para dict pelos nomes das colunas.
    return dict(zip(_EXP_FIELDS, row))


# ─────────────────────────────────────────────────────────────────────────────
# CRUD de experimentos (US1)
# ─────────────────────────────────────────────────────────────────────────────
def create_experiment(
    title: str,
    start_date: str,
    end_date: str,
    why: Optional[str] = None,
    hypothesis: Optional[str] = None,
    cadence: str = "daily",
) -> dict:
    """Cria um experimento novo (US1).

    Valida a fórmula (``title`` não-vazio), a cadência e a regra ``end_date >= start_date``
    (edge case da spec) antes de bater no CHECK do banco, devolvendo erro amigável (400).

    Args:
        title: A fórmula "Vou [ação] por [duração]" (obrigatória).
        start_date: Início em ``"AAAA-MM-DD"``.
        end_date: Fim em ``"AAAA-MM-DD"`` (≥ ``start_date``).
        why: Porquê/motivação (opcional).
        hypothesis: "talvez se eu __, então __" (opcional).
        cadence: ``"daily"`` (padrão) ou ``"weekly"``.

    Returns:
        ``{"status": "ok", "id": <int>}`` ou ``{"status": "error", "message": ...}``.
    """
    titulo = (title or "").strip()
    if not titulo:
        return {"status": "error", "message": "A fórmula do experimento não pode ser vazia."}
    if cadence not in _VALID_CADENCES:
        return {"status": "error", "message": "Cadência inválida: use 'daily' ou 'weekly'."}
    try:
        sd = date.fromisoformat(start_date)
        ed = date.fromisoformat(end_date)
    except (TypeError, ValueError):
        return {"status": "error", "message": "Datas inválidas: use o formato AAAA-MM-DD."}
    if ed < sd:
        return {"status": "error", "message": "Data de fim antes do início."}

    rows = run_select(
        """
        INSERT INTO tiny_experiments (title, why, hypothesis, cadence, start_date, end_date)
        VALUES (%(title)s, %(why)s, %(hyp)s, %(cad)s, %(sd)s, %(ed)s)
        RETURNING id
        """,
        {"title": titulo, "why": why, "hyp": hypothesis, "cad": cadence,
         "sd": start_date, "ed": end_date},
    )
    return {"status": "ok", "id": rows[0]["id"], "message": f"Experimento '{titulo}' criado."}


def list_experiments(include_completed: bool = False) -> list:
    """Lista os experimentos, já com os campos derivados (aderência etc.) e "hoje" em UTC-3.

    Por padrão traz só os ativos/pausados (usa o índice parcial ``idx_tiny_experiments_open``);
    ``include_completed=True`` inclui os concluídos (para a seção de "concluídos", US2).

    Carrega TODOS os check-ins dos experimentos listados numa única query (evita N+1) e calcula
    as métricas em memória pelo motor puro.

    Args:
        include_completed: Se ``True``, inclui também os experimentos concluídos.

    Returns:
        Lista de dicionários de experimento (ver :func:`_serialize_experiment`). É uma **listagem**.
    """
    where = "" if include_completed else "WHERE status <> 'completed'"
    exps = run_select(
        f"""
        SELECT {_EXP_COLUMNS} FROM tiny_experiments
        {where}
        ORDER BY (status = 'completed'), start_date DESC, id DESC
        """
    )
    if not exps:
        return []

    # Puxa os check-ins de todos os experimentos de uma vez e agrupa por experimento.
    ids = [e["id"] for e in exps]
    logs = run_select(
        """
        SELECT id, experiment_id, period_date, done, feeling, note
        FROM tiny_experiment_logs
        WHERE experiment_id = ANY(%(ids)s)
        ORDER BY period_date
        """,
        {"ids": ids},
    )
    by_exp: dict[int, list] = {e["id"]: [] for e in exps}
    for l in logs:
        by_exp[l["experiment_id"]].append(l)

    hoje = _today()
    # Na listagem o payload é enxuto (sem o array `logs`): calculamos as métricas a partir dos
    # check-ins do experimento e removemos o array anexado por `_serialize_experiment`.
    out = []
    for e in exps:
        item = _serialize_experiment(e, by_exp[e["id"]], today=hoje)
        item.pop("logs", None)
        out.append(item)
    return out


def get_experiment(experiment_id: int) -> dict:
    """Busca um experimento específico com os campos derivados e os check-ins (``logs``).

    Args:
        experiment_id: Id do experimento.

    Returns:
        Dicionário do experimento (incluindo ``logs`` ordenados por ``period_date``), ou
        ``{"status": "error", ...}`` se não existir (o router converte em 400).
    """
    rows = run_select(
        f"SELECT {_EXP_COLUMNS} FROM tiny_experiments WHERE id = %(id)s", {"id": experiment_id}
    )
    if not rows:
        return {"status": "error", "message": "Experimento não encontrado."}
    logs = run_select(
        """
        SELECT id, experiment_id, period_date, done, feeling, note
        FROM tiny_experiment_logs
        WHERE experiment_id = %(id)s
        ORDER BY period_date
        """,
        {"id": experiment_id},
    )
    return _serialize_experiment(rows[0], logs)


def update_experiment(
    experiment_id: int,
    title=_UNSET,
    why=_UNSET,
    hypothesis=_UNSET,
    cadence=_UNSET,
    start_date=_UNSET,
    end_date=_UNSET,
) -> dict:
    """Edita um experimento (PATCH parcial — só os campos enviados são aplicados).

    Usa a sentinela :data:`_UNSET` para distinguir "não enviado" de "enviado como None"
    (``why``/``hypothesis`` podem ser limpos com ``None``). Datas e cadência, quando enviadas,
    são revalidadas considerando os valores finais (novos + atuais do banco).

    Args:
        experiment_id: Id do experimento.
        title: Nova fórmula (não pode ser vazia se enviada).
        why: Novo porquê (``None`` limpa).
        hypothesis: Nova hipótese (``None`` limpa).
        cadence: Nova cadência (``"daily"``/``"weekly"``).
        start_date: Novo início (``"AAAA-MM-DD"``).
        end_date: Novo fim (``"AAAA-MM-DD"``).

    Returns:
        Dicionário de status. Erro se nada mudar, algo for inválido ou o id não existir.
    """
    atual = run_select(
        "SELECT start_date, end_date, cadence FROM tiny_experiments WHERE id = %(id)s",
        {"id": experiment_id},
    )
    if not atual:
        return {"status": "error", "message": "Experimento não encontrado."}

    sets, params = [], {"id": experiment_id}

    if title is not _UNSET:
        t = (title or "").strip()
        if not t:
            return {"status": "error", "message": "A fórmula do experimento não pode ser vazia."}
        sets.append("title = %(title)s"); params["title"] = t
    if why is not _UNSET:
        sets.append("why = %(why)s"); params["why"] = why
    if hypothesis is not _UNSET:
        sets.append("hypothesis = %(hyp)s"); params["hyp"] = hypothesis
    if cadence is not _UNSET:
        if cadence not in _VALID_CADENCES:
            return {"status": "error", "message": "Cadência inválida: use 'daily' ou 'weekly'."}
        sets.append("cadence = %(cad)s"); params["cad"] = cadence

    # Datas: valida end >= start com a mistura de novo + existente.
    if start_date is not _UNSET or end_date is not _UNSET:
        try:
            sd = date.fromisoformat(start_date) if start_date is not _UNSET else atual[0]["start_date"]
            ed = date.fromisoformat(end_date) if end_date is not _UNSET else atual[0]["end_date"]
        except (TypeError, ValueError):
            return {"status": "error", "message": "Datas inválidas: use o formato AAAA-MM-DD."}
        if ed < sd:
            return {"status": "error", "message": "Data de fim antes do início."}
        if start_date is not _UNSET:
            sets.append("start_date = %(sd)s"); params["sd"] = start_date
        if end_date is not _UNSET:
            sets.append("end_date = %(ed)s"); params["ed"] = end_date

    if not sets:
        return {"status": "error", "message": "Nada para atualizar."}

    sets.append("updated_at = now()")
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE tiny_experiments SET {', '.join(sets)} WHERE id = %(id)s", params
            )
            if cur.rowcount == 0:
                return {"status": "error", "message": "Experimento não encontrado."}
    return {"status": "ok", "message": "Experimento atualizado."}


def delete_experiment(experiment_id: int) -> dict:
    """Exclui um experimento (**hard delete** — D3); o ``ON DELETE CASCADE`` apaga os check-ins.

    Args:
        experiment_id: Id do experimento.

    Returns:
        Dicionário de status (erro se não existir).
    """
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM tiny_experiments WHERE id = %s", (experiment_id,))
            if cur.rowcount == 0:
                return {"status": "error", "message": "Experimento não encontrado."}
    return {"status": "ok", "message": "Experimento excluído."}


# ─────────────────────────────────────────────────────────────────────────────
# Check-ins (o tracker) — US1
# ─────────────────────────────────────────────────────────────────────────────
def log_experiment(
    experiment_id: int,
    period_date: str,
    done: bool,
    feeling: Optional[int] = None,
    note: Optional[str] = None,
) -> dict:
    """Registra (ou atualiza) o check-in de um período — **upsert** por ``(experiment_id, period_date)``.

    Há **um único check-in por período** (FR-006): refazer o de hoje **atualiza** os campos em
    vez de duplicar. Backfill aceito (FR-005): ``period_date`` pode ser corrente ou passado,
    desde que dentro de ``[start_date, end_date]``. Na cadência semanal a data é normalizada
    para a **segunda-feira** da semana antes de gravar (D2).

    Args:
        experiment_id: Id do experimento.
        period_date: Dia do check-in em ``"AAAA-MM-DD"`` (dentro do intervalo do experimento).
        done: Fez? (obrigatório).
        feeling: Sensação 1–5 (opcional).
        note: Nota livre (opcional).

    Returns:
        ``{"status": "ok", ...}`` ou ``{"status": "error", "message": ...}``.
    """
    if feeling is not None and not (1 <= feeling <= 5):
        return {"status": "error", "message": "Sensação inválida: use um valor de 1 a 5."}
    try:
        d = date.fromisoformat(period_date)
    except (TypeError, ValueError):
        return {"status": "error", "message": "Data inválida: use o formato AAAA-MM-DD."}

    with get_conn() as conn:
        with conn.cursor() as cur:
            exp = _fetch_experiment(cur, experiment_id)
            if not exp:
                return {"status": "error", "message": "Experimento não encontrado."}
            # Backfill dentro do intervalo do experimento (FR-005).
            if d < exp["start_date"] or d > exp["end_date"]:
                return {"status": "error", "message": "Data fora do período do experimento."}
            # Normaliza para o início do período (segunda, na cadência semanal).
            pd = _period_date(d, exp["cadence"])
            cur.execute(
                """
                INSERT INTO tiny_experiment_logs (experiment_id, period_date, done, feeling, note)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (experiment_id, period_date)
                DO UPDATE SET done = EXCLUDED.done, feeling = EXCLUDED.feeling,
                              note = EXCLUDED.note, updated_at = now()
                """,
                (experiment_id, pd, done, feeling, note),
            )
    return {"status": "ok", "id": experiment_id, "message": "Check-in registrado."}


def remove_log(experiment_id: int, period_date: str) -> dict:
    """Remove o check-in de um período (desfaz o registro).

    Aceita a data corrente ou já normalizada; normaliza pela cadência antes de apagar (para
    casar o ``period_date`` armazenado nas semanais).

    Args:
        experiment_id: Id do experimento.
        period_date: Dia do check-in em ``"AAAA-MM-DD"``.

    Returns:
        Dicionário de status (erro se não havia check-in naquele período).
    """
    try:
        d = date.fromisoformat(period_date)
    except (TypeError, ValueError):
        return {"status": "error", "message": "Data inválida: use o formato AAAA-MM-DD."}
    with get_conn() as conn:
        with conn.cursor() as cur:
            exp = _fetch_experiment(cur, experiment_id)
            if not exp:
                return {"status": "error", "message": "Experimento não encontrado."}
            pd = _period_date(d, exp["cadence"])
            cur.execute(
                "DELETE FROM tiny_experiment_logs WHERE experiment_id = %s AND period_date = %s",
                (experiment_id, pd),
            )
            if cur.rowcount == 0:
                return {"status": "error", "message": "Não havia check-in nesse período."}
    return {"status": "ok", "id": experiment_id, "message": "Check-in removido."}


# ─────────────────────────────────────────────────────────────────────────────
# Pausar / retomar — US1 (D4)
# ─────────────────────────────────────────────────────────────────────────────
def pause_experiment(experiment_id: int) -> dict:
    """Pausa um experimento ativo (``active → paused``): grava ``paused_at = hoje`` (D4).

    Some do "Meu Dia" enquanto pausado (FR-014). Erro amigável se já estiver pausado ou concluído.

    Args:
        experiment_id: Id do experimento.

    Returns:
        Dicionário de status.
    """
    hoje = _today()
    with get_conn() as conn:
        with conn.cursor() as cur:
            exp = _fetch_experiment(cur, experiment_id)
            if not exp:
                return {"status": "error", "message": "Experimento não encontrado."}
            if exp["status"] != "active":
                return {"status": "error", "message": "Só é possível pausar um experimento ativo."}
            cur.execute(
                "UPDATE tiny_experiments SET status = 'paused', paused_at = %s, updated_at = now() "
                "WHERE id = %s",
                (hoje, experiment_id),
            )
    return {"status": "ok", "id": experiment_id, "message": "Experimento pausado."}


def resume_experiment(experiment_id: int) -> dict:
    """Retoma um experimento pausado (``paused → active``): acumula os dias pausados (D4).

    No resume: ``paused_period_days += (hoje - paused_at)`` e ``paused_at = NULL``. Esses dias
    saem do cálculo de aderência (FR-017). Erro amigável se não estiver pausado.

    Args:
        experiment_id: Id do experimento.

    Returns:
        Dicionário de status.
    """
    hoje = _today()
    with get_conn() as conn:
        with conn.cursor() as cur:
            exp = _fetch_experiment(cur, experiment_id)
            if not exp:
                return {"status": "error", "message": "Experimento não encontrado."}
            if exp["status"] != "paused":
                return {"status": "error", "message": "O experimento não está pausado."}
            # Acumula os dias da pausa que está sendo encerrada.
            dias = (hoje - exp["paused_at"]).days if exp["paused_at"] else 0
            cur.execute(
                "UPDATE tiny_experiments SET status = 'active', paused_at = NULL, "
                "paused_period_days = paused_period_days + %s, updated_at = now() WHERE id = %s",
                (max(0, dias), experiment_id),
            )
    return {"status": "ok", "id": experiment_id, "message": "Experimento retomado."}


# ─────────────────────────────────────────────────────────────────────────────
# Revisão / encerramento — US2
# ─────────────────────────────────────────────────────────────────────────────
def review_experiment(experiment_id: int, verdict: str, review: str) -> dict:
    """Encerra um experimento com a revisão: veredicto + aprendizado (US2, FR-010).

    Grava ``verdict`` e ``review`` e seta ``status = 'completed'`` (terminal). Permite
    encerramento antecipado (antes do ``end_date``). Se o experimento estiver **pausado** ao
    concluir, fecha o intervalo de pausa em aberto (acumula em ``paused_period_days``) **antes**
    de a aderência final ser calculada. Erro se já estiver concluído.

    Args:
        experiment_id: Id do experimento.
        verdict: ``"persist"`` | ``"pause"`` | ``"pivot"``.
        review: Texto do aprendizado registrado.

    Returns:
        Dicionário de status.
    """
    if verdict not in _VALID_VERDICTS:
        return {"status": "error", "message": "Veredicto inválido: use persist, pause ou pivot."}
    hoje = _today()
    with get_conn() as conn:
        with conn.cursor() as cur:
            exp = _fetch_experiment(cur, experiment_id)
            if not exp:
                return {"status": "error", "message": "Experimento não encontrado."}
            if exp["status"] == "completed":
                return {"status": "error", "message": "Este experimento já foi concluído."}
            # Se pausado, fecha o intervalo aberto antes de concluir (aderência final correta).
            extra_pausa = 0
            if exp["status"] == "paused" and exp["paused_at"]:
                extra_pausa = max(0, (hoje - exp["paused_at"]).days)
            cur.execute(
                """
                UPDATE tiny_experiments
                SET status = 'completed', verdict = %s, review = %s, paused_at = NULL,
                    paused_period_days = paused_period_days + %s, updated_at = now()
                WHERE id = %s
                """,
                (verdict, review, extra_pausa, experiment_id),
            )
    return {"status": "ok", "id": experiment_id, "message": "Experimento concluído."}


# ─────────────────────────────────────────────────────────────────────────────
# Lembrete no "Meu Dia" — US3
# ─────────────────────────────────────────────────────────────────────────────
def list_experiments_due_today() -> list:
    """Experimentos ativos cuja cadência cai hoje e ainda **sem** check-in no período (US3).

    Regras (FR-013/FR-014): só ``active``, dentro do intervalo ``[start, end]``, cadência
    caindo hoje (diária sempre; semanal quando ainda não há check-in nesta semana corrente) e
    sem check-in no período corrente. Payload mínimo (id, title, cadence). Pausados/concluídos/
    fora do intervalo **não** aparecem (o filtro por status + intervalo cuida disso).

    Returns:
        Lista mínima ``[{"id", "title", "cadence"}]``. É uma **listagem**.
    """
    hoje = _today()
    segunda = ADH.monday_of(hoje)
    # NOT EXISTS: sem check-in no período corrente. O período corrente depende da cadência —
    # diária = hoje; semanal = a segunda-feira desta semana (via CASE).
    rows = run_select(
        """
        SELECT e.id, e.title, e.cadence
        FROM tiny_experiments e
        WHERE e.status = 'active'
          AND e.start_date <= %(hoje)s AND e.end_date >= %(hoje)s
          AND NOT EXISTS (
            SELECT 1 FROM tiny_experiment_logs l
            WHERE l.experiment_id = e.id
              AND l.period_date = CASE WHEN e.cadence = 'weekly' THEN %(seg)s ELSE %(hoje)s END
          )
        ORDER BY e.start_date, e.id
        """,
        {"hoje": hoje, "seg": segunda},
    )
    return [{"id": r["id"], "title": r["title"], "cadence": r["cadence"]} for r in rows]
