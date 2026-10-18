"""Estatísticas da Komi no contrato ``StatsPayload`` do Design System (spec 077).

Alimenta a tela "Estatísticas": interações por mês e por dia (mapa de calor), quem está sem contato
há mais tempo, aniversários do período e as menções cruzadas (em quais agentes as pessoas aparecem).
Segue as regras de correção do padrão (webapp/docs/DESIGN_SYSTEM.md):

  - datas SEMPRE no fuso America/Sao_Paulo — nunca ``CURRENT_DATE`` nem ``date.today()``;
  - pessoas e interações apagadas (soft delete) ficam fora da conta;
  - o ano em andamento compara com o MESMO trecho do ano anterior, não com o ano fechado;
  - sequências em dias corridos; a atual vale até ontem;
  - contagens de pessoas são de pessoas DISTINTAS, nunca de interações.

Usage:
    from agents.komi.tools_stats import get_stats_payload
    get_stats_payload(2026)        # ano; get_stats_payload(2026, 10) fecha o foco em outubro
"""

from __future__ import annotations

from calendar import monthrange
from datetime import date, timedelta

from agents.komi import naming
from agents.komi.tools import run_select

MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto",
         "Setembro", "Outubro", "Novembro", "Dezembro"]

_ROTULO_TIPO = {"mensagem": "Mensagem", "ligacao": "Ligação", "encontro": "Encontro", "video": "Vídeo", "outro": "Outro"}

# Sem contato há mais que isso conta como "precisa de atenção".
DIAS_SEM_CONTATO = 30


def period_bounds(year: int, month: int | None, today: date) -> tuple[date, date, date, date]:
    """(início, fim, início_anterior, fim_anterior) do período e do mesmo trecho do ano anterior.

    Mês: o mês inteiro. Ano corrente sem mês: de 1º/jan até hoje (o anterior vai até o mesmo
    dia/mês); ano passado: o ano todo. Se hoje é 29/fev e o ano anterior não é bissexto, o corte
    vira 28/fev.

    Args:
        year: Ano.
        month: Mês 1–12 ou ``None``.
        today: Hoje no fuso local.

    Returns:
        As quatro datas.

    Example:
        >>> period_bounds(2026, 10, date(2026, 10, 18))[:2]
        (datetime.date(2026, 10, 1), datetime.date(2026, 10, 31))
        >>> period_bounds(2026, None, date(2026, 10, 18))[1]
        datetime.date(2026, 10, 18)
    """
    def ultimo(y: int, m: int) -> date:
        return date(y, m, monthrange(y, m)[1])

    if month:
        return date(year, month, 1), ultimo(year, month), date(year - 1, month, 1), ultimo(year - 1, month)
    if year == today.year:
        fim = today
        fim_ant = date(year - 1, today.month, min(today.day, monthrange(year - 1, today.month)[1]))
    else:
        fim, fim_ant = date(year, 12, 31), date(year - 1, 12, 31)
    return date(year, 1, 1), fim, date(year - 1, 1, 1), fim_ant


def compute_streaks(dates: list[str], today: date) -> dict:
    """Maior sequência e sequência atual de dias corridos com pelo menos uma interação.

    A atual vale até ontem: hoje sem interação ainda não a quebra.

    Args:
        dates: Datas ISO (AAAA-MM-DD) com interação; repetidas são ignoradas.
        today: Hoje no fuso local.

    Returns:
        ``{"best": int, "current": int}``.

    Example:
        >>> compute_streaks(["2026-10-15", "2026-10-16", "2026-10-17"], date(2026, 10, 18))
        {'best': 3, 'current': 3}
    """
    dias = sorted({date.fromisoformat(d) for d in dates})
    melhor = corrente = 0
    anterior: date | None = None
    for d in dias:
        corrente = corrente + 1 if anterior is not None and (d - anterior).days == 1 else 1
        melhor = max(melhor, corrente)
        anterior = d
    presentes = set(dias)
    cursor = today if today in presentes else today - timedelta(days=1)
    atual = 0
    while cursor in presentes:
        atual += 1
        cursor -= timedelta(days=1)
    return {"best": melhor, "current": atual}


def birthdays_in_window(people: list[dict], start: date, end: date) -> list[dict]:
    """Achar os aniversários que caem dentro de uma janela de datas.

    O 29/02 em ano comum cai em 28/02.

    Args:
        people: Pessoas com ``id``, ``name``, ``birth_day``, ``birth_month``, ``birth_year``.
        start: Início da janela (inclusive).
        end: Fim da janela (inclusive).

    Returns:
        ``[{id, name, date, turning}]`` ordenado por data.

    Example:
        >>> p = [{"id": "1", "name": "Bia", "birth_day": 15, "birth_month": 5, "birth_year": 1990}]
        >>> birthdays_in_window(p, date(2026, 5, 1), date(2026, 5, 31))[0]["turning"]
        36
    """
    achados = []
    for p in people:
        for ano in range(start.year, end.year + 1):
            dia = 28 if (p["birth_day"], p["birth_month"]) == (29, 2) and monthrange(ano, 2)[1] == 28 else p["birth_day"]
            quando = date(ano, p["birth_month"], dia)
            if start <= quando <= end:
                achados.append({"id": p["id"], "name": p["name"], "date": quando.isoformat(),
                                "turning": (ano - p["birth_year"]) if p.get("birth_year") else None,
                                "avatar_url": p.get("avatar_url")})
    achados.sort(key=lambda a: (a["date"], a["name"]))
    return achados


def build_stats_payload(
    *,
    year: int,
    month: int | None,
    today: date,
    totals: dict,
    prev_totals: dict,
    daily: list[dict],
    kinds: list[dict],
    top_people: list[dict],
    mentions: list[dict],
    stale: list[dict],
    stale_count: int,
    birthdays: list[dict],
    upcoming: list[dict],
    first_year: int | None = None,
) -> dict:
    """Montar o ``StatsPayload`` a partir de números já consultados — função pura, sem banco.

    Args:
        year: Ano pedido.
        month: Mês 1–12 ou ``None`` (ano inteiro).
        today: Hoje no fuso local.
        totals: ``{interactions, people}`` do período (``people`` = pessoas distintas contatadas).
        prev_totals: O mesmo, para o trecho equivalente do ano anterior.
        daily: ``[{date, value}]`` de interações do ANO inteiro (só dias com interação).
        kinds: ``[{label, count}]`` interações por tipo no período.
        top_people: ``[{label, count, image}]`` pessoas mais contatadas no período.
        mentions: ``[{label, count}]`` itens vinculados criados no período, por agente.
        stale: ``[{label, count (dias sem contato), image}]`` quem está há mais tempo sem contato (hoje).
        stale_count: Quantas pessoas estão há mais de ``DIAS_SEM_CONTATO`` dias sem contato (ou nunca).
        birthdays: Aniversários dentro do período (``birthdays_in_window``).
        upcoming: Aniversários dos próximos 30 dias (os "momentos").
        first_year: Ano da primeira interação/cadastro (limite do seletor de ano).

    Returns:
        O ``StatsPayload`` (sem a chave ``status``).
    """
    tem_anterior = (prev_totals["interactions"] + prev_totals["people"]) > 0
    label = f"{MESES[month - 1]} de {year}" if month else str(year)
    label_ant = f"{MESES[month - 1]} de {year - 1}" if month else str(year - 1)

    def kpi(chave: str, rotulo: str, valor, anterior, **extra) -> dict:
        return {"key": chave, "label": rotulo, "value": valor, "prev": anterior if tem_anterior else None, "decimals": 0, **extra}

    kpis = [
        kpi("interactions", "Interações", totals["interactions"], prev_totals["interactions"]),
        kpi("people_contacted", "Pessoas contatadas", totals["people"], prev_totals["people"]),
        {"key": "birthdays", "label": "Aniversários", "value": len(birthdays), "prev": None, "decimals": 0},
        {"key": "no_contact", "label": f"Sem contato há +{DIAS_SEM_CONTATO} dias", "value": stale_count, "prev": None, "decimals": 0},
    ]

    por_mes = [0] * 12
    for d in daily:
        por_mes[int(d["date"][5:7]) - 1] += int(d["value"])
    monthly = [{"month": m + 1, "value": por_mes[m]} for m in range(12)]

    # `daily` cobre o ano inteiro; os recordes olham só o período (o ano corrente termina hoje).
    inicio, fim, _, _ = period_bounds(year, month, today)
    no_periodo = [d for d in daily if inicio.isoformat() <= d["date"] <= fim.isoformat()]
    recordes: list[dict] = []
    if no_periodo:
        dia_top = max(no_periodo, key=lambda d: (d["value"], d["date"]))
        if dia_top["value"] > 1:
            recordes.append({"label": "Dia mais movimentado", "value": f"{dia_top['value']} interações",
                             "detail": f"{dia_top['date'][8:]}/{dia_top['date'][5:7]}/{dia_top['date'][:4]}"})
        sequencias = compute_streaks([d["date"] for d in no_periodo], today)
        if sequencias["best"] > 1:
            recordes.append({"label": "Maior sequência de contatos", "value": f"{sequencias['best']} dias"})
        if sequencias["current"] > 1 and fim == today:
            recordes.append({"label": "Sequência atual", "value": f"{sequencias['current']} dias"})
    if top_people:
        recordes.append({"label": "Mais contatada", "value": top_people[0]["label"], "detail": f"{top_people[0]['count']} interações"})

    rankings = {
        "kinds": {"title": "Tipos de contato", "items": kinds},
        "people": {"title": "Pessoas mais contatadas", "items": top_people},
        "mentions": {"title": "Onde aparecem (menções cruzadas)", "items": mentions},
        "stale": {"title": "Sem contato há mais tempo (dias)", "items": stale},
    }
    return {
        "period": {"year": year, "month": month, "label": label},
        "previous": {"label": label_ant} if tem_anterior else None,
        "kpis": kpis,
        "daily": daily,
        "monthly": monthly,
        "monthlyUnit": "interações",
        # A Komi não tem notas: o bloco de distribuição fica vazio e a tela o omite.
        "distribution": [],
        "rankings": {k: {"title": v["title"], "items": [{**i, "count": int(i["count"])} for i in v["items"]]}
                     for k, v in rankings.items() if v["items"]},
        "records": recordes,
        "first_year": min(first_year or year, year),
        "moments": [
            {"id": u["id"], "title": u["name"],
             "subtitle": f"{u['date'][8:]}/{u['date'][5:7]}" + (f" · faz {u['turning']} anos" if u.get("turning") else ""),
             "image": u.get("avatar_url")}
            for u in upcoming
        ],
    }


def _totais(inicio: date, fim: date) -> dict:
    """Contar interações e pessoas distintas contatadas num intervalo (dias locais de São Paulo).

    Args:
        inicio: Primeiro dia (inclusive).
        fim: Último dia (inclusive).

    Returns:
        ``{"interactions": int, "people": int}``.
    """
    linha = run_select(
        """
        SELECT COUNT(*) AS interacoes, COUNT(DISTINCT i.person_id) AS pessoas
        FROM person_interactions i JOIN people p ON p.id = i.person_id AND p.deleted = FALSE
        WHERE i.deleted = FALSE
          AND (i.happened_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN %(a)s AND %(b)s
        """,
        {"a": inicio, "b": fim},
    )[0]
    return {"interactions": int(linha["interacoes"]), "people": int(linha["pessoas"])}


def get_stats_payload(year: int = 0, month: int | None = None) -> dict:
    """Estatísticas das pessoas de um ano (ou de um mês dele) no contrato ``StatsPayload``.

    Args:
        year: Ano (0 = ano corrente em America/Sao_Paulo).
        month: Mês 1–12 para fechar o foco num mês; ``None`` = ano inteiro.

    Returns:
        ``{"status": "ok", **StatsPayload}`` ou ``{"status": "error", "message": ...}``.
    """
    from agents.komi import integration  # noqa: PLC0415 — import lazy: integration importa tools

    hoje = naming.today_sp()
    year = year or hoje.year
    if month is not None and not 1 <= month <= 12:
        return {"status": "error", "message": "month deve estar entre 1 e 12"}
    try:
        inicio, fim, ini_ant, fim_ant = period_bounds(year, month, hoje)
        totals, prev_totals = _totais(inicio, fim), _totais(ini_ant, fim_ant)

        daily = [
            {"date": r["dia"], "value": int(r["n"])}
            for r in run_select(
                """
                SELECT (i.happened_at AT TIME ZONE 'America/Sao_Paulo')::date::text AS dia, COUNT(*) AS n
                FROM person_interactions i JOIN people p ON p.id = i.person_id AND p.deleted = FALSE
                WHERE i.deleted = FALSE
                  AND (i.happened_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN %(a)s AND %(b)s
                GROUP BY 1 ORDER BY 1
                """,
                {"a": date(year, 1, 1), "b": date(year, 12, 31)},
            )
        ]
        kinds = [
            {"label": _ROTULO_TIPO.get(r["kind"], r["kind"]), "count": int(r["n"])}
            for r in run_select(
                """
                SELECT i.kind, COUNT(*) AS n
                FROM person_interactions i JOIN people p ON p.id = i.person_id AND p.deleted = FALSE
                WHERE i.deleted = FALSE
                  AND (i.happened_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN %(a)s AND %(b)s
                GROUP BY i.kind ORDER BY n DESC, i.kind
                """,
                {"a": inicio, "b": fim},
            )
        ]
        top_people = [
            {"label": r["name"], "count": int(r["n"]), "image": r["avatar_url"]}
            for r in run_select(
                """
                SELECT p.name, p.avatar_url, COUNT(*) AS n
                FROM person_interactions i JOIN people p ON p.id = i.person_id AND p.deleted = FALSE
                WHERE i.deleted = FALSE
                  AND (i.happened_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN %(a)s AND %(b)s
                GROUP BY p.id ORDER BY n DESC, p.name LIMIT 8
                """,
                {"a": inicio, "b": fim},
            )
        ]

        # Menções cruzadas: vínculos criados no período, agrupados pelo agente dono do item
        rotulos = {t: s["label"] for t, s in integration.providers().items()}
        mencoes: dict[str, int] = {}
        for r in run_select(
            """
            SELECT pl.entity_type, COUNT(*) AS n
            FROM person_links pl JOIN people p ON p.id = pl.person_id AND p.deleted = FALSE
            WHERE (pl.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN %(a)s AND %(b)s
            GROUP BY pl.entity_type
            """,
            {"a": inicio, "b": fim},
        ):
            nome = rotulos.get(r["entity_type"], r["entity_type"].replace("_", " ").capitalize())
            mencoes[nome] = mencoes.get(nome, 0) + int(r["n"])
        mentions = sorted(({"label": k, "count": v} for k, v in mencoes.items()), key=lambda i: (-i["count"], i["label"]))

        # Quem está sem contato: HOJE (não depende do período escolhido)
        vivas = run_select("SELECT id, name, avatar_url, birth_day, birth_month, birth_year FROM people WHERE deleted = FALSE")
        ultimas = integration.last_activity_map([p["id"] for p in vivas])
        sem_contato = []
        contagem = 0
        for p in vivas:
            ultima = ultimas.get(p["id"])
            dias = (hoje - date.fromisoformat(ultima["date"])).days if ultima else None
            if dias is None or dias > DIAS_SEM_CONTATO:
                contagem += 1
            if dias is not None and dias > DIAS_SEM_CONTATO:
                sem_contato.append({"label": p["name"], "count": dias, "image": p["avatar_url"]})
        sem_contato.sort(key=lambda i: (-i["count"], i["label"]))

        com_aniversario = [p for p in vivas if p["birth_day"] is not None]
        primeiro = run_select(
            """
            SELECT LEAST(
                COALESCE((SELECT MIN(EXTRACT(YEAR FROM happened_at AT TIME ZONE 'America/Sao_Paulo'))::int FROM person_interactions WHERE deleted = FALSE), 9999),
                COALESCE((SELECT MIN(EXTRACT(YEAR FROM created_at AT TIME ZONE 'America/Sao_Paulo'))::int FROM people WHERE deleted = FALSE), 9999)
            ) AS ano
            """
        )[0]["ano"]

        payload = build_stats_payload(
            year=year, month=month, today=hoje, totals=totals, prev_totals=prev_totals, daily=daily,
            kinds=kinds, top_people=top_people, mentions=mentions, stale=sem_contato[:8], stale_count=contagem,
            birthdays=birthdays_in_window(com_aniversario, inicio, fim),
            upcoming=birthdays_in_window(com_aniversario, hoje, hoje + timedelta(days=30))[:8],
            first_year=None if primeiro == 9999 else primeiro,
        )
        return {"status": "ok", **payload}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "message": str(e)}
