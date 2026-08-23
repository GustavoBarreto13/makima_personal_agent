"""Camada de lógica — **hábitos** e seus check-ins (Fase 4 / fatia 014).

Quinta peça da **camada de lógica única** (junto de ``tools_tasks``, ``tools_projects``,
``tools_tags`` e ``tools_filters``). Aqui vive TODA a regra de negócio de hábitos; o canal
Telegram (``tools.py`` → agente) e o canal webapp (router ``/api/tasks/habits/*``) são
fachadas finas e paritárias sobre estas funções (princípio de paridade de canais — FR-001).

O que é um "hábito": uma rotina que o usuário quer manter (ex.: "meditar", "ler 20 páginas")
com uma **frequência alvo** (ex.: 5x por semana = ``freq_num=5``, ``freq_den=7``). A cada dia
o usuário faz um **check-in** — opcionalmente com um valor medido (páginas, minutos) em
hábitos mensuráveis. A **força** do hábito (métrica anti-streak do Loop Habit Tracker) é
**calculada na leitura** pelo motor puro ``habit_strength`` — nunca persistida.

Convenções (iguais às outras tools):
    - Funções de **mutação** retornam ``{"status": "ok"|"error", ...}``.
    - Funções de **listagem/leitura** retornam o dado direto (lista/dict, sem "status").
    - Acesso ao banco via ``agents.db`` (psycopg2 síncrono).
    - Soft delete: "excluir" um hábito é arquivá-lo (``archived_at``), preservando o histórico.

Dependência só de ``agents.db`` e do motor puro ``habit_strength`` (sem banco). Sem import
circular: nenhum outro módulo de tools importa deste.
"""

import re
from datetime import date, datetime, timedelta
from typing import Optional
from zoneinfo import ZoneInfo

from agents.db import get_conn, run_select, run_dml
from agents.kaguya import habit_strength as HS
from agents.kaguya import habit_source_providers as HSP

# Margem sobre a janela de 60 dias do motor de força (habit_strength._DEFAULT_WINDOW) — usada
# para buscar a atividade automática só do período que o score realmente enxerga (spec 036).
_ACTIVITY_WINDOW_DAYS = 70

# Códigos iCal de dia da semana aceitos em habit_schedules (spec 067) — mesmo conjunto do
# CHECK do schema e de recurrence._WEEKDAY_CODES.
_VALID_WEEKDAYS = {"MO", "TU", "WE", "TH", "FR", "SA", "SU"}
_TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def _today_sp() -> date:
    """Retorna a data de hoje no fuso America/Sao_Paulo (mesmo helper local de digest.py/tools_tasks.py)."""
    return datetime.now(ZoneInfo("America/Sao_Paulo")).date()


# ─────────────────────────────────────────────────────────────────────────────
# Helpers internos
# ─────────────────────────────────────────────────────────────────────────────
def _done_map(checkins: list, target_value: Optional[float]) -> dict:
    """Converte os check-ins do banco no mapa ``data -> cumpriu`` que o motor de força usa.

    Cada dia com check-in vira ``True``/``False`` conforme a meta: hábito sim/não sempre conta
    como cumprido; hábito mensurável só conta se ``value >= target_value`` (via
    :func:`habit_strength.met_target`).

    Args:
        checkins: Linhas de check-in ``[{date, value}, ...]`` (``date`` é ``datetime.date``).
        target_value: Meta numérica do hábito, ou ``None`` se for sim/não.

    Returns:
        Mapa ``{datetime.date: bool}``.
    """
    return {
        c["date"]: HS.met_target(c.get("value"), target_value)
        for c in checkins
    }


def _weekly_target(freq_num: int, freq_den: int) -> float:
    """Converte a frequência (freq_num a cada freq_den dias) em "vezes por semana".

    O motor de score (``habit_strength``) raciocina em meta semanal; o banco guarda a
    frequência como uma fração (ex.: 5/7). Esta conversão é a ponte: 5/7 → 5x/semana,
    1/1 → 7x/semana, 1/2 → 3.5x/semana.

    Args:
        freq_num: Numerador da frequência (quantas vezes).
        freq_den: Denominador (a cada quantos dias).

    Returns:
        A meta semanal (vezes por semana), como float.
    """
    if freq_den <= 0:
        return 7.0
    return freq_num / freq_den * 7.0


def _auto_done_map(source_provider_id: Optional[str], target_value: Optional[float], ref: date) -> dict:
    """Consulta a fonte automática do hábito (se houver) e converte em mapa ``data -> cumpriu``.

    Busca só a janela que o motor de força realmente enxerga (:data:`_ACTIVITY_WINDOW_DAYS`) —
    nada é persistido, a fonte é consultada ao vivo a cada chamada (spec 036, R4).

    Args:
        source_provider_id: Chave do provedor (``habit_source_providers``), ou ``None``/vazio
            se o hábito não tem fonte automática.
        target_value: Meta numérica do hábito (``None`` = sim/não).
        ref: Data de referência (fim da janela).

    Returns:
        Mapa ``{datetime.date: bool}`` — vazio se não há fonte configurada.
    """
    if not source_provider_id:
        return {}
    start = (ref - timedelta(days=_ACTIVITY_WINDOW_DAYS)).isoformat()
    activity = HSP.get_activity(source_provider_id, start, ref.isoformat())
    return {
        date.fromisoformat(d): HS.met_target(v, target_value)
        for d, v in activity.items()
    }


def _serialize_habit(
    row: dict, checkins: list, *, today: Optional[date] = None, schedules: Optional[list] = None
) -> dict:
    """Monta o dicionário de um hábito para a resposta, com o score "caixa d'água" e o estado de hoje.

    O score vem do motor puro :func:`habit_strength.summary` em **três dimensões**:
    consistência (0–100), tendência (subindo/caindo/estável) e recente (cumpridos nas últimas
    2 semanas). Tudo calculado na leitura — nada persistido.

    Quando o hábito tem ``source_provider_id`` (spec 036), a atividade automática é mesclada ao
    mapa de check-ins manuais ANTES de chamar o motor de força — um dia cumprido por qualquer uma
    das duas fontes conta uma vez (união dos conjuntos, FR-007). Nada da fonte automática é
    persistido em ``habit_checkins``.

    Os alertas do Google Calendar (``schedules``, spec 067) são **independentes** do score — não
    entram em ``HS.summary`` de forma alguma, só são ecoados na resposta.

    Args:
        row: Linha da tabela ``habits``.
        checkins: Lista de check-ins desse hábito (``[{date, value}, ...]``).
        today: Dia de referência (padrão: hoje). Usado para ``done_today``/``in_my_day`` e como
            fim do cálculo do score.
        schedules: Linhas de ``habit_schedules`` desse hábito (``[{weekday, time_of_day}, ...]``),
            ou ``None`` se ainda não foram carregadas (vira lista vazia na resposta).

    Returns:
        Dicionário do hábito com ``consistency`` (0–100), ``trend`` (up/down/flat),
        ``recent_done``/``recent_total``, ``done_today``, ``done_today_source``
        (``"manual"|"auto"|"both"|None``), ``schedules``, ``reminder_lead_min``,
        ``duration_min`` e ``in_my_day``.
    """
    ref = today or _today_sp()
    target = row.get("target_value")
    source_id = row.get("source_provider_id")
    manual_done = _done_map(checkins, target)
    auto_done = _auto_done_map(source_id, target, ref)

    # União dos dois conjuntos — um dia cumprido por qualquer uma das fontes conta uma vez.
    done = dict(manual_done)
    for dia, ok in auto_done.items():
        done[dia] = done.get(dia, False) or ok

    # O motor trabalha com o CONJUNTO de datas cumpridas (não o mapa) e a meta SEMANAL.
    datas_feitas = {dia for dia, ok in done.items() if ok}
    meta_semanal = _weekly_target(row["freq_num"], row["freq_den"])
    score = HS.summary(datas_feitas, meta_semanal, today=ref)

    done_today = done.get(ref, False)
    done_today_source = None
    if done_today:
        m, a = manual_done.get(ref, False), auto_done.get(ref, False)
        done_today_source = "both" if (m and a) else ("auto" if a else "manual")

    # Alertas do Google Calendar (spec 067) — puramente informativos aqui, não entram no score.
    # time_of_day vem do psycopg2 como datetime.time (TIME do Postgres); None = dia inteiro.
    schedules_out = [
        {
            "weekday": s["weekday"],
            "time": s["time_of_day"].strftime("%H:%M") if s.get("time_of_day") else None,
        }
        for s in (schedules or [])
    ]
    my_day_date = row.get("my_day_date")

    return {
        "id": row["id"],
        "name": row["name"],
        "icon": row.get("icon"),
        "color": row.get("color"),
        "freq_num": row["freq_num"],
        "freq_den": row["freq_den"],
        "target_value": target,
        "unit": row.get("unit"),
        "source_provider_id": source_id,
        # Métricas derivadas (não persistidas) — modelo caixa d'água:
        "consistency": score["consistency"],     # 0–100: a "nota" do hábito (nível da caixa)
        "trend": score["trend"],                  # "up" | "down" | "flat"
        "recent_done": score["recent_done"],      # cumpridos nos últimos 14 dias
        "recent_total": score["recent_total"],    # quanto a meta esperava em 2 semanas
        "done_today": done_today,                 # se o hábito já foi cumprido hoje
        "done_today_source": done_today_source,   # "manual" | "auto" | "both" | None
        # Alertas no Google Calendar (spec 067) — independentes do score:
        "schedules": schedules_out,               # [{"weekday": "MO", "time": "07:00"|None}, ...]
        "reminder_lead_min": row.get("reminder_lead_min", 0),
        "duration_min": row.get("duration_min"),
        "in_my_day": my_day_date == ref,           # selecionado para o Meu Dia de HOJE
    }


# ─────────────────────────────────────────────────────────────────────────────
# CRUD de hábitos
# ─────────────────────────────────────────────────────────────────────────────
def list_habits() -> list:
    """Lista os hábitos ativos (não arquivados), já com força, aderência e estado de hoje.

    Carrega TODOS os check-ins dos hábitos ativos numa única query (evita N+1 — uma query por
    hábito) e calcula as métricas em memória pelo motor puro.

    Returns:
        Lista de dicionários de hábito (ver :func:`_serialize_habit`). É uma **listagem**.
    """
    # Hábitos ativos, em ordem de criação (os mais antigos primeiro — rotina estabelecida no topo).
    habits = run_select(
        """
        SELECT id, name, icon, color, freq_num, freq_den, target_value, unit, source_provider_id,
               reminder_lead_min, duration_min, my_day_date
        FROM habits
        WHERE archived_at IS NULL
        ORDER BY created_at, id
        """
    )
    if not habits:
        return []

    # Puxa os check-ins de todos os hábitos de uma vez e agrupa por hábito.
    ids = [h["id"] for h in habits]
    rows = run_select(
        """
        SELECT habit_id, date, value
        FROM habit_checkins
        WHERE habit_id = ANY(%(ids)s)
        ORDER BY date
        """,
        {"ids": ids},
    )
    by_habit: dict[int, list] = {h["id"]: [] for h in habits}
    for r in rows:
        by_habit[r["habit_id"]].append({"date": r["date"], "value": r.get("value")})

    # Idem para as linhas de habit_schedules (spec 067) — mesma técnica anti-N+1.
    sched_rows = run_select(
        """
        SELECT habit_id, weekday, time_of_day
        FROM habit_schedules
        WHERE habit_id = ANY(%(ids)s)
        ORDER BY id
        """,
        {"ids": ids},
    )
    schedules_by_habit: dict[int, list] = {h["id"]: [] for h in habits}
    for r in sched_rows:
        schedules_by_habit[r["habit_id"]].append({"weekday": r["weekday"], "time_of_day": r.get("time_of_day")})

    # Serializa cada hábito com seus próprios check-ins e alertas.
    return [
        _serialize_habit(h, by_habit[h["id"]], schedules=schedules_by_habit[h["id"]])
        for h in habits
    ]


def get_habit(habit_id: int) -> dict:
    """Busca um hábito específico (ativo ou arquivado) com força e aderência.

    Args:
        habit_id: Id do hábito.

    Returns:
        Dicionário do hábito, ou ``{"status": "error", ...}`` se não existir. É uma **leitura**
        (mas devolve erro no formato de status quando não encontra, para o router converter em 404/400).
    """
    rows = run_select(
        """
        SELECT id, name, icon, color, freq_num, freq_den, target_value, unit, source_provider_id,
               reminder_lead_min, duration_min, my_day_date
        FROM habits WHERE id = %(id)s
        """,
        {"id": habit_id},
    )
    if not rows:
        return {"status": "error", "message": "Hábito não encontrado."}
    checkins = run_select(
        "SELECT date, value FROM habit_checkins WHERE habit_id = %(id)s ORDER BY date",
        {"id": habit_id},
    )
    schedules = run_select(
        "SELECT weekday, time_of_day FROM habit_schedules WHERE habit_id = %(id)s ORDER BY id",
        {"id": habit_id},
    )
    return _serialize_habit(
        rows[0],
        [{"date": c["date"], "value": c.get("value")} for c in checkins],
        schedules=schedules,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Alertas de hábito no Google Calendar (spec 067)
# ─────────────────────────────────────────────────────────────────────────────
def _validate_schedules(schedules: list) -> Optional[str]:
    """Valida uma lista de horários de alerta antes de gravar em ``habit_schedules``.

    Cada item deve ser ``{"weekday": "MO".."SU", "time": "HH:MM"|None|""}``. ``time``
    ausente/vazio é **válido** — marca o dia como evento de dia inteiro no Google
    Calendar (sem push, decisão de produto da spec 067). No máximo um item por dia da
    semana; validado em Python para devolver erro amigável (400), nunca um
    ``IntegrityError`` cru do ``CHECK``/``UNIQUE`` do schema.

    Args:
        schedules: Lista de horários a validar (já normalizada em dicts).

    Returns:
        Mensagem de erro em pt-BR, ou ``None`` se tudo válido.
    """
    seen = set()
    for item in schedules:
        wd_raw = item.get("weekday") if isinstance(item, dict) else None
        wd = (wd_raw or "").strip().upper()
        if wd not in _VALID_WEEKDAYS:
            return f"Dia da semana inválido: {wd_raw!r} (use MO..SU)."
        if wd in seen:
            return f"Dia repetido: {wd} (no máximo um horário por dia da semana)."
        seen.add(wd)
        hora = item.get("time") if isinstance(item, dict) else None
        if hora and not _TIME_RE.match(hora):
            return f"Horário inválido: {hora!r} (use HH:MM)."
    return None


def _replace_schedules_on_cursor(cur, habit_id: int, schedules: list) -> list[str]:
    """Substitui o conjunto de ``habit_schedules`` de um hábito por **diff**, não por
    apagar-e-recriar tudo.

    Preserva o ``google_event_id`` dos dias que permanecem no conjunto desejado — só a
    coluna ``time_of_day`` é atualizada, então `push_habit` faz um ``PATCH`` no evento
    existente em vez de recriá-lo (evita duplicar eventos no Google a cada edição). Só
    os dias que SAEM do conjunto são de fato apagados; o ``google_event_id`` deles é
    devolvido para o chamador excluir o evento correspondente no Google
    (``gcal_sync.remove_schedule_events``).

    Args:
        cur: Cursor psycopg2 já aberto na transação corrente (``schedules`` já validado
            por :func:`_validate_schedules`).
        habit_id: Id do hábito.
        schedules: Lista desejada ``[{"weekday": ..., "time": "HH:MM"|None}, ...]``.

    Returns:
        Lista de ``google_event_id`` dos dias removidos, ficaram órfãos no Google.
    """
    desired = {item["weekday"].strip().upper(): (item.get("time") or None) for item in schedules}

    cur.execute(
        "SELECT weekday, google_event_id FROM habit_schedules WHERE habit_id = %s", (habit_id,)
    )
    current = {row[0]: row[1] for row in cur.fetchall()}

    # Dias que saem do conjunto: apaga a linha e guarda o evento para excluir no Google.
    removed_event_ids = [eid for wd, eid in current.items() if wd not in desired and eid]
    for wd in current:
        if wd not in desired:
            cur.execute(
                "DELETE FROM habit_schedules WHERE habit_id = %s AND weekday = %s", (habit_id, wd)
            )

    # Dias que ficam: só atualiza o horário (preserva google_event_id). Dias novos: insere.
    for wd, hora in desired.items():
        if wd in current:
            cur.execute(
                "UPDATE habit_schedules SET time_of_day = %s WHERE habit_id = %s AND weekday = %s",
                (hora, habit_id, wd),
            )
        else:
            cur.execute(
                "INSERT INTO habit_schedules (habit_id, weekday, time_of_day) VALUES (%s, %s, %s)",
                (habit_id, wd, hora),
            )

    return removed_event_ids


def set_habit_schedule(habit_id: int, schedules: Optional[list] = None) -> dict:
    """Substitui o conjunto de alertas semanais de um hábito (semântica de **set**).

    Espelha ``_set_task_tags`` (tools_tags.py): o conjunto enviado vira o conjunto final,
    substituindo o anterior por inteiro. Internamente faz um diff (:func:`_replace_schedules_on_cursor`)
    em vez de apagar tudo — dias mantidos não recriam o evento no Google.

    Args:
        habit_id: Id do hábito.
        schedules: Lista de horários ``[{"weekday": "MO".."SU", "time": "HH:MM"|None}, ...]``.
            ``None``/``[]`` remove todos os alertas do hábito.

    Returns:
        Dicionário de status; erro (400) se algum item for inválido ou o hábito não existir.
    """
    schedules = schedules or []
    erro = _validate_schedules(schedules)
    if erro:
        return {"status": "error", "message": erro}

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM habits WHERE id = %s", (habit_id,))
            if not cur.fetchone():
                return {"status": "error", "message": "Hábito não encontrado."}
            removed_event_ids = _replace_schedules_on_cursor(cur, habit_id, schedules)

    try:
        from agents.kaguya import gcal_sync as _gs
        if removed_event_ids:
            _gs.remove_schedule_events(removed_event_ids)
        _gs.push_habit(habit_id)
    except Exception:
        pass

    return {"status": "ok", "message": "Alertas do hábito atualizados."}


# ─────────────────────────────────────────────────────────────────────────────
# CRUD de hábitos
# ─────────────────────────────────────────────────────────────────────────────
def create_habit(
    name: str,
    freq_num: int = 1,
    freq_den: int = 1,
    target_value: Optional[float] = None,
    unit: Optional[str] = None,
    icon: Optional[str] = None,
    color: Optional[str] = None,
    source_provider_id: Optional[str] = None,
    schedules: Optional[list] = None,
    reminder_lead_min: int = 0,
    duration_min: Optional[int] = None,
) -> dict:
    """Cria um hábito novo.

    Valida a frequência alvo com a MESMA regra da CHECK do schema
    (``1 <= freq_num <= freq_den``): não dá para querer "8x a cada 7 dias".

    Args:
        name: Nome do hábito (ex.: "Meditar").
        freq_num: Quantas vezes (numerador). Ex.: 5 em "5x por semana".
        freq_den: A cada quantos dias (denominador). Ex.: 7 em "5x por semana".
        target_value: Meta numérica por check-in (hábito mensurável); ``None`` = sim/não.
        unit: Unidade da meta (ex.: "páginas", "min"), só faz sentido com ``target_value``.
        icon: Emoji/ícone de exibição (opcional).
        color: Cor de destaque (opcional).
        source_provider_id: Chave de uma fonte automática de check-in (ex.: ``"violet_diary"``,
            ``"frieren_reading"`` — spec 036), ou ``None`` para hábito manual (padrão).
        schedules: Alertas semanais no Google Calendar (spec 067) —
            ``[{"weekday": "MO".."SU", "time": "HH:MM"|None}, ...]``. ``time`` ausente/vazio =
            evento de dia inteiro (sem push). ``None``/``[]`` = sem alertas (padrão).
        reminder_lead_min: Antecedência do popup, em minutos, para os alertas COM hora
            (0 = na hora marcada). Ignorado nos dias sem hora.
        duration_min: Duração do bloco no calendário, em minutos, para os alertas COM
            hora. ``None`` = usa o padrão de 30 min só no evento (não altera a capacidade
            do Meu Dia, que só soma quando o hábito é selecionado — ver `add_habit_to_my_day`).

    Returns:
        ``{"status": "ok", "id": <int>}`` ou ``{"status": "error", "message": ...}``.
    """
    nome = (name or "").strip()
    if not nome:
        return {"status": "error", "message": "O nome do hábito não pode ser vazio."}
    # Mesma invariante da CHECK do banco — validamos aqui para devolver erro amigável (400),
    # não um IntegrityError cru (500).
    if not (freq_num >= 1 and freq_den >= 1 and freq_num <= freq_den):
        return {"status": "error", "message": "Frequência inválida: use freq_num entre 1 e freq_den."}
    schedules = schedules or []
    erro = _validate_schedules(schedules)
    if erro:
        return {"status": "error", "message": erro}

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO habits (name, icon, color, freq_num, freq_den, target_value, unit,
                                     source_provider_id, reminder_lead_min, duration_min)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    nome, icon, color, freq_num, freq_den, target_value, unit,
                    source_provider_id, reminder_lead_min, duration_min,
                ),
            )
            habit_id = cur.fetchone()[0]
            for item in schedules:
                wd = item["weekday"].strip().upper()
                hora = item.get("time") or None
                cur.execute(
                    "INSERT INTO habit_schedules (habit_id, weekday, time_of_day) VALUES (%s, %s, %s)",
                    (habit_id, wd, hora),
                )

    if schedules:
        try:
            from agents.kaguya import gcal_sync as _gs
            _gs.push_habit(habit_id)
        except Exception:
            pass

    return {"status": "ok", "id": habit_id, "message": f"Hábito '{nome}' criado."}


def update_habit(
    habit_id: int,
    name: Optional[str] = None,
    freq_num: Optional[int] = None,
    freq_den: Optional[int] = None,
    target_value: Optional[float] = None,
    unit: Optional[str] = None,
    icon: Optional[str] = None,
    color: Optional[str] = None,
    clear_target: bool = False,
    source_provider_id: Optional[str] = None,
    clear_source: bool = False,
    schedules: Optional[list] = None,
    reminder_lead_min: Optional[int] = None,
    duration_min: Optional[int] = None,
    clear_duration: bool = False,
) -> dict:
    """Edita um hábito (PATCH parcial — só os campos enviados são aplicados).

    A frequência, quando alterada, é revalidada (``1 <= freq_num <= freq_den``) considerando os
    valores finais (os novos ou os atuais do banco). ``clear_target=True`` zera a meta
    (transforma um mensurável de volta em sim/não).

    Args:
        habit_id: Id do hábito.
        name: Novo nome (opcional).
        freq_num: Novo numerador da frequência (opcional).
        freq_den: Novo denominador da frequência (opcional).
        target_value: Nova meta numérica (opcional).
        unit: Nova unidade (opcional).
        icon: Novo ícone (opcional).
        color: Nova cor (opcional).
        clear_target: Se ``True``, remove a meta (volta a ser sim/não) e ignora ``target_value``.
        source_provider_id: Nova fonte automática de check-in (spec 036) — ``None`` (padrão)
            significa "não enviado", não "remover"; use ``clear_source=True`` para remover.
        clear_source: Se ``True``, remove a fonte automática (hábito volta a ser 100% manual).
        schedules: Novo conjunto de alertas semanais (spec 067) — ``None`` (padrão) significa
            "não enviado" (schedules atuais preservados); enviar uma lista **substitui** o
            conjunto inteiro (semântica de set, ver :func:`set_habit_schedule`); ``[]`` remove
            todos os alertas.
        reminder_lead_min: Nova antecedência do popup, em minutos, para alertas COM hora.
        duration_min: Nova duração do bloco no calendário, em minutos.
        clear_duration: Se ``True``, remove a duração declarada (volta ao padrão de 30 min só
            no evento) e ignora ``duration_min``.

    Returns:
        Dicionário de status. Erro se nada mudar, a frequência for inválida, algum item de
        ``schedules`` for inválido ou o hábito não existir.
    """
    # Busca os valores atuais para validar a frequência final (mistura de novo + existente).
    atual = run_select(
        "SELECT freq_num, freq_den FROM habits WHERE id = %(id)s", {"id": habit_id}
    )
    if not atual:
        return {"status": "error", "message": "Hábito não encontrado."}

    fn = freq_num if freq_num is not None else atual[0]["freq_num"]
    fd = freq_den if freq_den is not None else atual[0]["freq_den"]
    if (freq_num is not None or freq_den is not None) and not (fn >= 1 and fd >= 1 and fn <= fd):
        return {"status": "error", "message": "Frequência inválida: use freq_num entre 1 e freq_den."}

    if schedules is not None:
        erro = _validate_schedules(schedules)
        if erro:
            return {"status": "error", "message": erro}

    # Monta dinamicamente só os campos enviados (não sobrescreve com NULL o que não veio).
    sets, params = [], {"id": habit_id}
    if name is not None:
        nome = name.strip()
        if not nome:
            return {"status": "error", "message": "O nome do hábito não pode ser vazio."}
        sets.append("name = %(name)s"); params["name"] = nome
    if freq_num is not None:
        sets.append("freq_num = %(fn)s"); params["fn"] = freq_num
    if freq_den is not None:
        sets.append("freq_den = %(fd)s"); params["fd"] = freq_den
    if clear_target:
        # Zerar a meta também limpa a unidade (uma unidade sem meta não faz sentido).
        sets.append("target_value = NULL"); sets.append("unit = NULL")
    elif target_value is not None:
        sets.append("target_value = %(tv)s"); params["tv"] = target_value
    if unit is not None and not clear_target:
        sets.append("unit = %(unit)s"); params["unit"] = unit
    if icon is not None:
        sets.append("icon = %(icon)s"); params["icon"] = icon
    if color is not None:
        sets.append("color = %(color)s"); params["color"] = color
    if clear_source:
        sets.append("source_provider_id = NULL")
    elif source_provider_id is not None:
        sets.append("source_provider_id = %(src)s"); params["src"] = source_provider_id
    if reminder_lead_min is not None:
        sets.append("reminder_lead_min = %(rlm)s"); params["rlm"] = reminder_lead_min
    if clear_duration:
        sets.append("duration_min = NULL")
    elif duration_min is not None:
        sets.append("duration_min = %(dur)s"); params["dur"] = duration_min

    if not sets and schedules is None:
        return {"status": "error", "message": "Nada para atualizar."}

    if sets:
        affected = run_dml(f"UPDATE habits SET {', '.join(sets)} WHERE id = %(id)s", params)
        if affected == 0:
            return {"status": "error", "message": "Hábito não encontrado."}

    # Alertas do Google Calendar (spec 067) — set_habit_schedule já dispara o push_habit
    # reconciliando com os campos recém-atualizados (reminder_lead_min/duration_min/name/icon).
    if schedules is not None:
        resultado_schedules = set_habit_schedule(habit_id, schedules)
        if resultado_schedules.get("status") == "error":
            return resultado_schedules
    elif sets:
        # Só campos simples mudaram (ex.: reminder_lead_min/duration_min/icon/name) — ainda
        # assim podem afetar o payload dos eventos já existentes.
        try:
            from agents.kaguya import gcal_sync as _gs
            _gs.push_habit(habit_id)
        except Exception:
            pass

    return {"status": "ok", "message": "Hábito atualizado."}


def archive_habit(habit_id: int) -> dict:
    """Arquiva um hábito (soft delete): some das listas, mas o histórico é preservado.

    Não apagamos a linha — marcamos ``archived_at``. Assim os check-ins ficam guardados e o
    hábito pode ser reativado depois (:func:`unarchive_habit`).

    Args:
        habit_id: Id do hábito.

    Returns:
        Dicionário de status.
    """
    affected = run_dml(
        "UPDATE habits SET archived_at = now() WHERE id = %(id)s AND archived_at IS NULL",
        {"id": habit_id},
    )
    if affected == 0:
        return {"status": "error", "message": "Hábito não encontrado ou já arquivado."}
    # Alertas do Google Calendar (spec 067) não fazem mais sentido para um hábito arquivado —
    # o histórico de check-ins é preservado (é só um soft delete), mas os eventos somem.
    try:
        from agents.kaguya import gcal_sync as _gs
        _gs.remove_habit_events(habit_id)
    except Exception:
        pass
    return {"status": "ok", "message": "Hábito arquivado."}


def unarchive_habit(habit_id: int) -> dict:
    """Reativa um hábito arquivado (limpa o ``archived_at``).

    Args:
        habit_id: Id do hábito.

    Returns:
        Dicionário de status.
    """
    affected = run_dml(
        "UPDATE habits SET archived_at = NULL WHERE id = %(id)s AND archived_at IS NOT NULL",
        {"id": habit_id},
    )
    if affected == 0:
        return {"status": "error", "message": "Hábito não encontrado ou já está ativo."}
    # Recria os alertas no Google Calendar (spec 067) se o hábito tinha schedules configuradas —
    # push_habit é no-op se não houver linhas em habit_schedules.
    try:
        from agents.kaguya import gcal_sync as _gs
        _gs.push_habit(habit_id)
    except Exception:
        pass
    return {"status": "ok", "message": "Hábito reativado."}


# ─────────────────────────────────────────────────────────────────────────────
# Check-ins (o registro diário)
# ─────────────────────────────────────────────────────────────────────────────
def _check_in_on_cursor(cur, habit_id: int, date_iso: str, value: Optional[float] = None) -> bool:
    """Registra/atualiza o check-in usando um cursor já aberto (mesma transação de outro agente).

    Espelha :func:`check_in` mas sem abrir ``get_conn()`` própria — extraído para que
    ``tools_focus.finish_session`` possa fazer o check-in do hábito vinculado à sessão na
    MESMA transação da conclusão do foco (spec 062, "focar NO hábito X"), mesmo padrão de
    ``tools_tasks._complete_task_on_cursor``. Best-effort: hábito arquivado ou inexistente
    simplesmente não gera check-in (não é erro fatal para quem chamou).

    Args:
        cur: Cursor psycopg2 já aberto na transação corrente.
        habit_id: Id do hábito.
        date_iso: Dia do check-in em ``AAAA-MM-DD``.
        value: Valor medido (hábito mensurável); ``None`` em hábito sim/não.

    Returns:
        ``True`` se o hábito existia e estava ativo (check-in gravado/atualizado);
        ``False`` caso contrário.
    """
    cur.execute("SELECT 1 FROM habits WHERE id = %s AND archived_at IS NULL", (habit_id,))
    if not cur.fetchone():
        return False
    # Upsert: cria o check-in; se já existir para o dia, atualiza o valor (idempotente —
    # concluir a mesma sessão duas vezes, ou já ter feito check-in manual hoje, não duplica).
    cur.execute(
        """
        INSERT INTO habit_checkins (habit_id, date, value)
        VALUES (%s, %s, %s)
        ON CONFLICT (habit_id, date) DO UPDATE SET value = EXCLUDED.value
        """,
        (habit_id, date_iso, value),
    )
    return True


def check_in(habit_id: int, date_iso: Optional[str] = None, value: Optional[float] = None) -> dict:
    """Registra (ou atualiza) o check-in de um hábito num dia.

    Há **um único check-in por dia por hábito** (constraint ``UNIQUE (habit_id, date)``).
    Refazer o check-in do mesmo dia **atualiza** o valor (``ON CONFLICT ... DO UPDATE``) em vez
    de estourar — útil para corrigir o valor medido (ex.: "na verdade li 30 páginas").

    Args:
        habit_id: Id do hábito.
        date_iso: Dia do check-in em ``AAAA-MM-DD``. ``None`` = hoje (fuso do sistema).
        value: Valor medido (hábito mensurável). ``None`` em hábito sim/não.

    Returns:
        ``{"status": "ok", "consistency": <0–100>, "trend": ..., "done_today": bool, ...}`` —
        já devolve o score recalculado para o canal ecoar; ou erro se o hábito não existir.
    """
    dia = date_iso or date.today().isoformat()
    with get_conn() as conn:
        with conn.cursor() as cur:
            if not _check_in_on_cursor(cur, habit_id, dia, value):
                return {"status": "error", "message": "Hábito não encontrado ou arquivado."}
    # Recalcula o score para o canal ecoar ("consistência agora: 78/100, subindo").
    h = get_habit(habit_id)
    return {
        "status": "ok",
        "message": "Check-in registrado.",
        "consistency": h.get("consistency"),
        "trend": h.get("trend"),
        "recent_done": h.get("recent_done"),
        "recent_total": h.get("recent_total"),
        "done_today": h.get("done_today"),
    }


def remove_check_in(habit_id: int, date_iso: Optional[str] = None) -> dict:
    """Remove o check-in de um hábito num dia (desfaz o "cumpri hoje").

    Args:
        habit_id: Id do hábito.
        date_iso: Dia em ``AAAA-MM-DD``. ``None`` = hoje.

    Returns:
        Dicionário de status (erro se não havia check-in naquele dia).
    """
    dia = date_iso or date.today().isoformat()
    affected = run_dml(
        "DELETE FROM habit_checkins WHERE habit_id = %(id)s AND date = %(d)s",
        {"id": habit_id, "d": dia},
    )
    if affected == 0:
        return {"status": "error", "message": "Não havia check-in nesse dia."}
    return {"status": "ok", "message": "Check-in removido."}


# ─────────────────────────────────────────────────────────────────────────────
# Meu Dia (spec 067) — hábito selecionado entra no plano/capacidade do dia
# ─────────────────────────────────────────────────────────────────────────────
# Espelha add_to_my_day/remove_from_my_day de tools_tasks.py (mesma coluna, mesma
# semântica) — mas para habits.my_day_date. Diferente de tarefa, aqui não há gatilho de
# sync com o Google (a duração só afeta a capacidade do Meu Dia, nunca o calendário).
def add_habit_to_my_day(habit_id: int, date_str: Optional[str] = None) -> dict:
    """Marca um hábito como parte do Meu Dia de uma data (padrão: hoje).

    Hábito **não** selecionado é invisível no Meu Dia — esta é a única forma de um
    hábito entrar no plano/capacidade do dia (spec 067). Independente de ``schedules``:
    um hábito sem nenhum alerta configurado pode ser selecionado do mesmo jeito.

    Args:
        habit_id: Id do hábito.
        date_str: Data no formato "YYYY-MM-DD". ``None`` = hoje (fuso America/Sao_Paulo).

    Returns:
        Dicionário de status.
    """
    target = date_str if date_str else _today_sp().isoformat()
    affected = run_dml(
        "UPDATE habits SET my_day_date = %(d)s WHERE id = %(id)s AND archived_at IS NULL",
        {"d": target, "id": habit_id},
    )
    if affected == 0:
        return {"status": "error", "message": "Hábito não encontrado ou arquivado."}
    return {"status": "ok", "message": f"Adicionado ao Meu Dia de {target}."}


def remove_habit_from_my_day(habit_id: int) -> dict:
    """Tira um hábito do Meu Dia (``my_day_date = NULL``), sem arquivá-lo.

    Args:
        habit_id: Id do hábito.

    Returns:
        Dicionário de status.
    """
    affected = run_dml(
        "UPDATE habits SET my_day_date = NULL WHERE id = %(id)s", {"id": habit_id}
    )
    if affected == 0:
        return {"status": "error", "message": "Hábito não encontrado."}
    return {"status": "ok", "message": "Removido do Meu Dia."}


# ─────────────────────────────────────────────────────────────────────────────
# Histórico (para o heatmap anual)
# ─────────────────────────────────────────────────────────────────────────────
def resolve_habit_id_by_name(name: str) -> Optional[int]:
    """Resolve o id de um hábito **ativo** pelo nome (case-insensitive, por prefixo).

    Espelha ``resolve_project_id_by_name`` das listas: o Telegram fala por nome ("meditar"),
    então a fachada usa isto para achar o id. Primeiro tenta casamento exato (ignorando caixa);
    se não houver, tenta por prefixo. Devolve ``None`` se nada casar ou se for ambíguo demais.

    Args:
        name: Nome (ou começo do nome) do hábito.

    Returns:
        O id do hábito casado, ou ``None`` se nenhum/ambíguo.
    """
    nome = (name or "").strip()
    if not nome:
        return None
    # 1) Exato ignorando caixa.
    rows = run_select(
        "SELECT id FROM habits WHERE archived_at IS NULL AND LOWER(name) = LOWER(%(n)s)",
        {"n": nome},
    )
    if len(rows) == 1:
        return rows[0]["id"]
    # 2) Por prefixo (ex.: "medit" → "Meditar"); só resolve se for o único candidato.
    rows = run_select(
        "SELECT id FROM habits WHERE archived_at IS NULL AND LOWER(name) LIKE LOWER(%(n)s)",
        {"n": f"{nome}%"},
    )
    return rows[0]["id"] if len(rows) == 1 else None


def get_habit_history(habit_id: int, year: int) -> list:
    """Lista os check-ins de um hábito num ano, já com o flag de cumprimento (para o heatmap).

    Devolve um array **esparso** (só os dias com check-in manual e/ou atividade automática); o
    frontend densifica para desenhar a grade anual contínua (mesmo padrão do heatmap de leitura
    da Frieren). Quando o hábito tem ``source_provider_id`` (spec 036), mescla a atividade da
    fonte automática no mesmo ano — cada dia ganha ``source`` (``"manual"|"auto"|"both"``).

    Args:
        habit_id: Id do hábito.
        year: Ano (ex.: 2026).

    Returns:
        Lista ``[{date: "AAAA-MM-DD", value: float|None, done: bool, source: str}]`` ordenada
        por data. É uma **listagem**.
    """
    # Busca a meta e a fonte do hábito uma vez para resolver `done`/mesclagem.
    meta = run_select(
        "SELECT target_value, source_provider_id FROM habits WHERE id = %(id)s", {"id": habit_id}
    )
    if not meta:
        return []
    target = meta[0].get("target_value")
    source_id = meta[0].get("source_provider_id")
    start, end = f"{year}-01-01", f"{year + 1}-01-01"

    # Filtra os check-ins do ano pedido (intervalo fechado no início, aberto no próximo ano).
    rows = run_select(
        """
        SELECT date, value
        FROM habit_checkins
        WHERE habit_id = %(id)s
          AND date >= %(start)s AND date < %(end)s
        ORDER BY date
        """,
        {"id": habit_id, "start": start, "end": end},
    )
    manual_by_date = {r["date"]: r.get("value") for r in rows}

    # Atividade automática do mesmo ano (vazio se o hábito não tem fonte — R8 degrada sozinho).
    auto_activity = HSP.get_activity(source_id, start, (date(year, 12, 31)).isoformat()) if source_id else {}
    auto_by_date = {date.fromisoformat(d): v for d, v in auto_activity.items()}

    all_dates = set(manual_by_date) | set(auto_by_date)
    out = []
    for dia in sorted(all_dates):
        has_manual = dia in manual_by_date
        has_auto = dia in auto_by_date
        source = "both" if (has_manual and has_auto) else ("auto" if has_auto else "manual")
        # Em dias com as duas fontes, o valor manual prevalece na exibição (é o que o usuário
        # digitou); só automático usa o valor da fonte.
        value = manual_by_date.get(dia) if has_manual else auto_by_date.get(dia)
        out.append({
            "date": dia.isoformat(),
            "value": value,
            "done": HS.met_target(value, target),
            "source": source,
        })
    return out


def list_habit_source_providers() -> list:
    """Lista as fontes automáticas de hábito registradas (ex.: diário da Violet — spec 036).

    Returns:
        Lista ``[{"id", "name"}, ...]``. É uma **listagem**.
    """
    return HSP.list_providers()
