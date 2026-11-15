"""Router do Makima Hub — endpoint agregador de stats dos 8 agentes.

Expõe `GET /api/hub/summary` (registrado em main.py sob o prefixo `/api/hub`),
que calcula 2 stats reais por agente para os 8 domínios da "Sala de Controle":
Nami, Frieren, Komi, Violet, Kaguya, Mai, Marin e Akane.

Princípios (spec 023 — REQ-11 a REQ-14):
- Cada agente é calculado em um `try/except` **isolado**: a falha de um agente
  retorna `None` para aquela chave, sem derrubar os outros 7 — a resposta é
  sempre HTTP 200 com as 8 chaves presentes.
- Todos os valores `stat.v` / `stat2.v` já vêm **formatados como string** — o
  frontend não faz nenhuma formatação de número (saldo "+R$ X.XXX", percentuais,
  "X.X★", "X.X/sem", contagens).
- Este router **só lê**: nenhuma tool de `agents/*` é modificada. As stats vêm de
  SQL direto via `run_select` ou de chamadas a tools já existentes (Violet, Kaguya, Mai).

Usage:
    # Em main.py:
    from webapp.backend.routers import hub as hub_router
    app.include_router(hub_router.router, prefix="/api/hub", tags=["hub"])
"""

# APIRouter agrupa as rotas; Depends injeta a dependência de autenticação.
from fastapi import APIRouter, Depends, HTTPException

from pydantic import BaseModel, Field

# calendar.monthrange calcula o último dia real do mês (evita 31 em meses de 30 dias).
import calendar

# date.today() é a base de todos os cálculos de período (mês corrente, ano corrente).
from datetime import date

# require_user valida o cookie de sessão e bloqueia rotas não autenticadas (401).
from webapp.backend.deps import require_user

# run_select executa SELECT no PostgreSQL compartilhado e retorna lista de dicts.
from agents.db import run_select
# Progresso descontando o capítulo/volume inicial dos mangás (módulo puro da Frieren).
from agents.frieren.units import progress_fraction

# Score de saúde financeira (spec 047, US3) — mesma tool usada pela tela da Nami.
from agents.nami.tools_health import get_financial_health_score

# O prefixo "/api/hub" é adicionado em main.py quando este router é incluído.
router = APIRouter()


# ═════════════════════════════════════════════════════════════════════════════
# HELPERS INTERNOS — formato de stat, formato de agente, truncamento e moeda
# ═════════════════════════════════════════════════════════════════════════════

def _stat(v: str, k: str) -> dict:
    """Montar o dicionário de um stat no formato padrão do hub.

    Centraliza o formato `{"v": valor, "k": rótulo}` usado em todos os cards,
    garantindo consistência entre os 8 agentes.

    Args:
        v: Valor já formatado como string (ex.: "+R$ 2.480", "47%", "12").
        k: Rótulo descritivo do stat (ex.: "saldo do mês", "lendo agora").

    Returns:
        Dicionário `{"v": v, "k": k}`.

    Example:
        >>> _stat("12", "pessoas")
        {"v": "12", "k": "pessoas"}
    """
    # Sempre devolve o mesmo formato — o frontend lê apenas .v e .k.
    return {"v": v, "k": k}


def _agent(stat: dict, stat2: dict) -> dict:
    """Montar o dicionário de um agente com seus dois stats (REQ-11).

    Args:
        stat: Primeiro stat (resultado de `_stat`).
        stat2: Segundo stat (resultado de `_stat`).

    Returns:
        Dicionário `{"stat": stat, "stat2": stat2}` — o formato que cada chave
        de agente assume na resposta do hub.

    Example:
        >>> _agent(_stat("12", "pessoas"), _stat("3", "aniversários este mês"))
        {"stat": {"v": "12", "k": "pessoas"}, "stat2": {"v": "3", "k": "aniversários este mês"}}
    """
    # Formato fixo de um agente: dois stats nomeados.
    return {"stat": stat, "stat2": stat2}


def _trunc(title: str, n: int = 14) -> str:
    """Truncar um título longo adicionando reticências (Frieren / Mai).

    Se o título tem mais que `n` caracteres, corta nos primeiros `n` e acrescenta
    o caractere de reticências "…". Caso contrário, devolve o título intacto.

    Args:
        title: Título a ser truncado.
        n: Comprimento máximo antes de truncar. Default 14.

    Returns:
        Título truncado (até `n` chars + "…") ou o original se já couber.

    Example:
        >>> _trunc("Duna")
        'Duna'
        >>> _trunc("Um Título Muito Longo Demais")
        'Um Título Muit…'
    """
    # Só trunca se ultrapassar o limite — evita reticências desnecessárias.
    if len(title) > n:
        return title[:n] + "…"
    return title


def _fmt_brl(v: float) -> str:
    """Formatar um valor em reais com sinal explícito e separador de milhar PONTO.

    Padrão exigido pelo SPEC: sinal "+" para positivos e o caractere unicode
    "−" (U+2212, MINUS SIGN — não o hífen comum) para negativos, sem casas
    decimais e com ponto como separador de milhar.

    Args:
        v: Valor numérico em reais (pode ser negativo).

    Returns:
        String formatada (ex.: "+R$ 2.480", "−R$ 2.480", "+R$ 0").

    Example:
        >>> _fmt_brl(2480.0)
        '+R$ 2.480'
        >>> _fmt_brl(-2480.0)
        '−R$ 2.480'
    """
    # Sinal: "+" para zero ou positivo; "−" (U+2212) para negativo, conforme o SPEC.
    sinal = "−" if v < 0 else "+"
    # Arredonda o valor absoluto para inteiro (sem casas decimais) e formata com
    # vírgula como separador de milhar; depois troca a vírgula por ponto (padrão pt-BR).
    numero = f"{int(round(abs(v))):,}".replace(",", ".")
    # Concatena sinal + prefixo "R$ " + número formatado.
    return f"{sinal}R$ {numero}"


# ═════════════════════════════════════════════════════════════════════════════
# CÁLCULO POR AGENTE — cada função pode levantar exceção livremente
# (capturada no endpoint, virando None para aquela chave)
# ═════════════════════════════════════════════════════════════════════════════

def _nami() -> dict:
    """Calcular os 2 stats da Nami: saldo do mês + score de saúde financeira.

    Returns:
        Dicionário de agente com:
        - stat: saldo do mês corrente (receitas − despesas) formatado em BRL.
        - stat2: score de saúde financeira 0-100 (spec 047, US3) — idêntico ao
          exibido na tela da Nami, mesma tool (`get_financial_health_score`).
          Calculado em try/except próprio: uma falha aqui não derruba o stat1
          (saldo), mesmo princípio de isolamento do Hub, só que por stat.
    """
    # Limites do mês corrente: primeiro dia (day=1) e último dia real do mês.
    hoje = date.today()
    mes_ini = hoje.replace(day=1).isoformat()
    # monthrange(ano, mes)[1] devolve o número de dias do mês (ex.: 30 em junho).
    ultimo_dia = calendar.monthrange(hoje.year, hoje.month)[1]
    mes_fim = hoje.replace(day=ultimo_dia).isoformat()

    # Query 1 — saldo do mês: soma receitas e despesas separadamente no intervalo.
    rows = run_select(
        """
        SELECT
            COALESCE(SUM(CASE WHEN tipo = 'Receita' THEN valor ELSE 0 END), 0) AS receitas,
            COALESCE(SUM(CASE WHEN tipo = 'Despesa' THEN valor ELSE 0 END), 0) AS despesas
        FROM transactions
        WHERE data BETWEEN %(ini)s AND %(fim)s
          AND deleted = FALSE
        """,
        {"ini": mes_ini, "fim": mes_fim},
    )
    # Saldo = receitas menos despesas; coage para float (vem como Decimal do banco).
    receitas = float(rows[0]["receitas"]) if rows else 0.0
    despesas = float(rows[0]["despesas"]) if rows else 0.0
    saldo = receitas - despesas
    stat = _stat(_fmt_brl(saldo), "saldo do mês")

    # Score de saúde financeira do mês corrente — isolado em try/except próprio
    # para que uma falha aqui vire "—" só neste stat, sem apagar o saldo acima.
    try:
        health = get_financial_health_score(hoje.strftime("%Y-%m"))
        stat2 = _stat(f"{health['score']}", "saúde financeira")
    except Exception:
        stat2 = _stat("—", "saúde financeira")

    return _agent(stat, stat2)


def _frieren() -> dict:
    """Calcular os 2 stats da Frieren: livro lendo agora + livros lidos no ano (REQ-13).

    Returns:
        Dicionário de agente com:
        - stat: título truncado + percentual do livro com status 'lendo', ou "—".
        - stat2: contagem de livros 'lido' com updated_at no ano corrente.
    """
    # Query 1 — livro "lendo agora": pega o mais recentemente atualizado.
    # NÃO existe coluna current_page; o progresso vem de MAX(page_end) dos reading_logs.
    rows = run_select(
        """
        SELECT b.title,
               b.total_pages,
               b.progress_unit,
               b.first_unit,
               COALESCE(MAX(rl.page_end), 0) AS current_page
        FROM books b
        LEFT JOIN reading_logs rl ON rl.book_id = b.id
        WHERE b.status = 'lendo'
          AND b.deleted = FALSE
        GROUP BY b.id, b.title, b.total_pages, b.progress_unit, b.first_unit
        ORDER BY b.updated_at DESC
        LIMIT 1
        """
    )
    if not rows:
        # Sem livro em leitura → travessão vazio (fallback do SPEC).
        stat = _stat("—", "lendo agora")
    else:
        livro = rows[0]
        total = livro["total_pages"]
        atual = int(livro["current_page"] or 0)
        # Percentual só faz sentido se total_pages for truthy (evita divisão por zero).
        # Descontando o capítulo/volume inicial (mangá que começa no cap. 24).
        pct = round((progress_fraction(atual, total, livro.get("first_unit"), livro.get("progress_unit") or "pages") or 0) * 100) if total else 0
        # Formato: "Título · 47%" (título truncado a 14 chars).
        stat = _stat(f"{_trunc(livro['title'])} · {pct}%", "lendo agora")

    # Query 2 — livros concluídos ('lido') com updated_at no ano corrente.
    rows2 = run_select(
        """
        SELECT COUNT(*) AS n
        FROM books
        WHERE status = 'lido'
          AND deleted = FALSE
          AND EXTRACT(YEAR FROM updated_at) = EXTRACT(YEAR FROM CURRENT_DATE)
        """
    )
    n = int(rows2[0]["n"]) if rows2 else 0
    stat2 = _stat(str(n), "livros este ano")

    return _agent(stat, stat2)


def _komi() -> dict:
    """Calcular os 2 stats da Komi: pessoas ativas + aniversários do mês (REQ-14).

    Returns:
        Dicionário de agente com:
        - stat: contagem de pessoas não deletadas.
        - stat2: contagem de pessoas com aniversário no mês corrente.
    """
    # Query 1 — pessoas ativas (não soft-deletadas).
    rows = run_select(
        """
        SELECT COUNT(*) AS n
        FROM people
        WHERE deleted = FALSE
        """
    )
    n = int(rows[0]["n"]) if rows else 0
    stat = _stat(str(n), "pessoas")

    # Query 2 — datas do tipo "aniversário" (label começa com "aniver") cujo mês
    # da data é o mês corrente; apenas de pessoas vivas.
    rows2 = run_select(
        """
        SELECT COUNT(*) AS n
        FROM person_dates pd
        JOIN people p ON p.id = pd.person_id
        WHERE p.deleted = FALSE
          AND lower(pd.label) LIKE '%aniver%'
          AND EXTRACT(MONTH FROM pd.date) = EXTRACT(MONTH FROM CURRENT_DATE)
        """
    )
    n2 = int(rows2[0]["n"]) if rows2 else 0
    stat2 = _stat(str(n2), "aniversários este mês")

    return _agent(stat, stat2)


def _violet() -> dict:
    """Calcular os 2 stats do Violet via tools do journal (REQ-14).

    Atenção: NÃO existe agente "violet" — os stats vêm diretamente das tools de
    `agents/journal`. O import é lazy (dentro da função) para evitar carregar o
    módulo do journal no import do router.

    Returns:
        Dicionário de agente com:
        - stat: dias escritos no ano (days_written).
        - stat2: frequência média por semana (freq_per_week) formatada "X.X/sem".
    """
    # Import lazy — só carrega o journal quando este agente é efetivamente calculado.
    from agents.journal.tools import get_stats as _journal_stats

    # get_stats devolve um dict com days_written e freq_per_week para o ano dado.
    s = _journal_stats(year=date.today().year)
    stat = _stat(str(s["days_written"]), "dias escritos")
    # Formata a frequência semanal com 1 casa decimal (ex.: "4.2/sem").
    stat2 = _stat(f'{s["freq_per_week"]:.1f}/sem', "por semana")

    return _agent(stat, stat2)


def _kaguya() -> dict:
    """Calcular os 2 stats da Kaguya: tarefas de hoje + atrasadas (REQ-14).

    Returns:
        Dicionário de agente com:
        - stat: quantidade de tarefas com vencimento hoje.
        - stat2: quantidade de tarefas atrasadas (overdue).
    """
    # Import lazy — evita carregar a camada de tarefas no import do router.
    from agents.kaguya.tools_tasks import list_tasks_today

    # list_tasks_today() retorna {"today": [...], "overdue": [...]}.
    # only_chargeable: homologação/bloqueadas/delegadas/algum dia não contam como atrasadas.
    t = list_tasks_today(only_chargeable=True)
    stat = _stat(str(len(t["today"])), "tarefas hoje")
    stat2 = _stat(str(len(t["overdue"])), "atrasadas")

    return _agent(stat, stat2)


def _mai() -> dict:
    """Calcular os 2 stats da Mai: série assistindo agora + total de séries (REQ-14).

    Returns:
        Dicionário de agente com:
        - stat: título truncado + "· Ep X" da 1ª série assistindo, ou "—".
        - stat2: contagem total de séries não deletadas.
    """
    # Import lazy — evita carregar as tools da Mai no import do router.
    from agents.mai.tools import get_currently_watching

    # get_currently_watching() retorna {"status": "ok", "series": [...]}.
    cw = get_currently_watching()
    lista = cw.get("series", [])
    if not lista:
        # Nenhuma série assistindo → travessão vazio (fallback do SPEC).
        stat = _stat("—", "assistindo")
    else:
        s0 = lista[0]
        # Formato: "Título · Ep N" (título truncado a 14 chars).
        stat = _stat(
            f'{_trunc(s0["title"])} · Ep {s0.get("episodes_watched", 0)}',
            "assistindo",
        )

    # Query 2 — total de séries no catálogo (não deletadas).
    rows = run_select(
        """
        SELECT COUNT(*) AS n
        FROM series
        WHERE deleted = FALSE
        """
    )
    n = int(rows[0]["n"]) if rows else 0
    stat2 = _stat(str(n), "séries")

    return _agent(stat, stat2)


def _marin() -> dict:
    """Calcular os 2 stats da Marin: animes assistindo + sessões na semana (REQ-14).

    Returns:
        Dicionário de agente com:
        - stat: contagem de animes com status 'assistindo'.
        - stat2: contagem de linhas em watch_logs nos últimos 7 dias.
    """
    # Query 1 — animes em progresso (status 'assistindo', não deletados).
    rows = run_select(
        """
        SELECT COUNT(*) AS n
        FROM anime
        WHERE status = 'assistindo'
          AND deleted = FALSE
        """
    )
    n = int(rows[0]["n"]) if rows else 0
    stat = _stat(str(n), "assistindo")

    # Query 2 — sessões de episódios na última semana. O SPEC pede COUNT de LINHAS
    # em watch_logs (cada linha é uma sessão, que pode cobrir vários eps);
    # seguimos o SPEC literalmente com COUNT(*).
    rows2 = run_select(
        """
        SELECT COUNT(*) AS n
        FROM watch_logs
        WHERE watched_date >= CURRENT_DATE - 7
        """
    )
    n2 = int(rows2[0]["n"]) if rows2 else 0
    stat2 = _stat(str(n2), "episódios esta semana")

    return _agent(stat, stat2)


def _yato() -> dict:
    """Calcular os 2 stats do Yato: próxima viagem + prontidão do dossiê (spec 066).

    Returns:
        Dicionário de agente com:
        - stat: "Cidade/UF · DD/MM" da próxima viagem não cancelada/concluída, ou "—".
        - stat2: `readiness_pct` (get_trip_readiness) dessa viagem formatado "N%", ou "—".
    """
    rows = run_select(
        """
        SELECT id, city, state_uf, start_date
        FROM trips
        WHERE deleted = FALSE
          AND status IN ('planejando', 'confirmada', 'em_curso')
        ORDER BY start_date ASC
        LIMIT 1
        """
    )
    if not rows:
        return _agent(_stat("—", "próxima viagem"), _stat("—", "prontidão"))

    trip = rows[0]
    stat = _stat(f"{_trunc(trip['city'])}/{trip['state_uf']} · {trip['start_date'].strftime('%d/%m')}", "próxima viagem")

    # Prontidão isolada em try/except próprio — falha aqui não apaga o stat da
    # próxima viagem, mesmo princípio de isolamento por stat da Nami acima.
    try:
        from agents.yato.tools import get_trip_readiness
        readiness = get_trip_readiness(trip["id"])
        pct = readiness.get("readiness_pct", 0) if readiness.get("status") == "ok" else 0
        stat2 = _stat(f"{pct}%", "prontidão")
    except Exception:
        stat2 = _stat("—", "prontidão")

    return _agent(stat, stat2)


def _akane() -> dict:
    """Calcular os 2 stats da Akane: última nota + filmes vistos (REQ-14).

    Returns:
        Dicionário de agente com:
        - stat: última nota não-nula do diário formatada "X.X★", ou "—".
        - stat2: contagem de filmes com status 'watched'.
    """
    # Query 1 — última nota lançada no diário (sessão mais recente com rating).
    rows = run_select(
        """
        SELECT rating
        FROM diary_entries
        WHERE rating IS NOT NULL
        ORDER BY watched_date DESC
        LIMIT 1
        """
    )
    if not rows:
        # Nenhuma nota registrada → travessão vazio (fallback do SPEC).
        stat = _stat("—", "última nota")
    else:
        # Formata a nota com 1 casa decimal seguida da estrela (ex.: "4.5★").
        stat = _stat(f"{float(rows[0]['rating']):.1f}★", "última nota")

    # Query 2 — filmes já assistidos (status 'watched').
    # A tabela movies TEM coluna deleted, então filtramos os soft-deletados.
    rows2 = run_select(
        """
        SELECT COUNT(*) AS n
        FROM movies
        WHERE status = 'watched'
          AND deleted = FALSE
        """
    )
    n = int(rows2[0]["n"]) if rows2 else 0
    stat2 = _stat(str(n), "filmes vistos")

    return _agent(stat, stat2)


# ═════════════════════════════════════════════════════════════════════════════
# ENDPOINT — GET /api/hub/summary
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/summary")
def hub_summary(user: dict = Depends(require_user)) -> dict:
    """Agregar os 2 stats reais de cada um dos 8 agentes do Makima Hub.

    Calcula, para cada domínio (Nami, Frieren, Komi, Violet, Kaguya, Mai, Marin,
    Akane), um dicionário `{stat: {v, k}, stat2: {v, k}}` com valores já
    formatados como string. Cada agente roda em um `try/except` **isolado**: se
    a coleta de um agente falhar (tabela ausente, erro de query, etc.), aquela
    chave vira `None` e os demais 7 continuam preenchidos — a resposta é sempre
    HTTP 200 com as 8 chaves (REQ-11 / REQ-15).

    Args:
        user: Dados do usuário autenticado (injetado por Depends(require_user)).
              A ausência de cookie válido resulta em HTTP 401 antes deste corpo.

    Returns:
        Dicionário com EXATAMENTE as 8 chaves de agente. Cada valor é um
        `{"stat": {...}, "stat2": {...}}` ou `None` se o agente falhou.

    Raises:
        HTTPException: 401 se o usuário não estiver autenticado.
    """
    # Mapeia cada chave de agente à sua função de cálculo. A ordem segue o handoff
    # da "Sala de Controle" (Nami → Akane).
    agentes = {
        "nami": _nami,
        "frieren": _frieren,
        "komi": _komi,
        "violet": _violet,
        "kaguya": _kaguya,
        "mai": _mai,
        "marin": _marin,
        "akane": _akane,
        "yato": _yato,
    }

    out: dict = {}
    for chave, fn in agentes.items():
        try:
            # Calcula os stats do agente; em caso de sucesso, popula a chave.
            out[chave] = fn()
        except Exception:
            # Isolamento de falha: NUNCA propaga — a chave do agente que falhou
            # vira None e os demais agentes permanecem intactos (resposta ainda 200).
            out[chave] = None

    # Dicionário final com exatamente as 8 chaves de agente.
    return out


# ═════════════════════════════════════════════════════════════════════════════
# ENDPOINT — GET /api/hub/today  (nova home "Hoje")
# ═════════════════════════════════════════════════════════════════════════════
# Cada bloco roda isolado: se falhar, a chave vira None/[] e o resto segue (sempre HTTP 200).
# "Hoje" e "agora" SEMPRE no fuso America/Sao_Paulo (agents.kaguya.tz), nunca date.today().

def _brl(v: float) -> str:
    """Reais sem '+' para positivos; mantém o '−' (U+2212) dos negativos."""
    t = _fmt_brl(v)
    return t[1:] if t.startswith("+") else t


def _now_block() -> dict:
    """Foco ativo + próximo compromisso do dia."""
    from datetime import datetime

    from agents.kaguya import calendar_hub
    from agents.kaguya.tools_focus import get_active_session
    from agents.kaguya.tz import now_sp

    focus = None
    s = get_active_session()
    if s:
        focus = {
            "id": s["id"],
            "title": s.get("task_title") or s.get("habit_name") or "Foco livre",
            "phase": s.get("phase"),
            "remaining_sec": s.get("remaining_sec"),
            "href": "/tasks#foco",
        }

    nxt = None
    agora = now_sp()
    dia = agora.date().isoformat()
    try:
        itens = calendar_hub.aggregate(dia, dia).get("items", [])
    except Exception:
        itens = []
    com_hora = []
    for it in itens:
        ini = it.get("start")
        if not ini or it.get("all_day"):
            continue
        try:
            dt = datetime.fromisoformat(ini)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=agora.tzinfo)
            dt = dt.astimezone(agora.tzinfo)
        except ValueError:
            continue
        if dt >= agora:
            com_hora.append((dt, it))
    if com_hora:
        dt, it = min(com_hora, key=lambda x: x[0])
        nxt = {"title": it.get("title", ""), "time": dt.strftime("%H:%M"), "href": it.get("deep_link") or "/tasks"}
    return {"focus": focus, "next": nxt}


def _attention_block() -> list[dict]:
    """O que pede ação: tarefas vencidas, contas a pagar, aniversários próximos."""
    items: list[dict] = []

    try:
        from agents.kaguya.tools_tasks import list_tasks_today

        t = list_tasks_today(only_chargeable=True)
        n = len(t["overdue"])
        if n:
            items.append({"id": "overdue", "agent": "kaguya", "tone": "danger",
                          "label": f"{n} tarefa{'s' if n != 1 else ''} vencida{'s' if n != 1 else ''}",
                          "action": "Ver", "href": "/tasks#hoje"})
    except Exception:
        pass

    try:
        from agents.nami.tools_plan import get_month_plan

        plano = get_month_plan("")
        if plano.get("status") == "ok":
            for c in (plano.get("a_pagar") or [])[:3]:
                atrasada = c.get("status") == "atrasada"
                items.append({"id": f"pay-{c['kind']}-{c['id']}", "agent": "nami",
                              "tone": "danger" if atrasada else "warn",
                              "label": f"{c['name']} · {_brl(float(c['valor']))} · {c['due'][8:10]}/{c['due'][5:7]}",
                              "action": "Pagar", "href": "/nami#recorrentes"})
    except Exception:
        pass

    try:
        from agents.komi.tools import upcoming_birthdays

        r = upcoming_birthdays(days=7)
        if r.get("status") == "ok":
            for b in r["birthdays"][:2]:
                quando = "hoje" if b["in_days"] == 0 else "amanhã" if b["in_days"] == 1 else f"em {b['in_days']} dias"
                items.append({"id": f"bday-{b['person_id']}", "agent": "komi", "tone": "info",
                              "label": f"Aniversário de {b['name']} · {quando}",
                              "action": "Abrir", "href": f"/people#pessoa/{b['person_id']}"})
    except Exception:
        pass

    return items


def _numbers_block() -> dict:
    """Números dos widgets (cada um None se falhar). Valores já formatados."""
    out: dict = {}

    try:
        from agents.nami.tools_plan import get_month_plan

        p = get_month_plan("")
        if p.get("status") == "ok":
            out["nami_livre"] = {"v": _brl(float(p["livre"])), "k": "livre pra gastar", "href": "/nami"}
    except Exception:
        out["nami_livre"] = None

    try:
        from agents.kaguya.tools_tasks import list_tasks_today

        t = list_tasks_today(only_chargeable=True)
        out["kaguya_hoje"] = {"v": str(len(t["today"])), "k": "tarefas hoje", "href": "/tasks#hoje"}
    except Exception:
        out["kaguya_hoje"] = None

    try:
        from agents.kaguya.tools_habits import list_habits

        hs = list_habits()
        feitos = sum(1 for h in hs if h.get("done_today"))
        out["habitos"] = {"v": f"{feitos} de {len(hs)}", "k": "hábitos feitos hoje", "href": "/tasks#habitos"} if hs else None
    except Exception:
        out["habitos"] = None

    try:
        from agents.journal.tools import get_stats as _journal_stats
        from agents.kaguya.tz import today_sp

        s = _journal_stats(year=today_sp().year)
        out["violet_dias"] = {"v": str(s["days_written"]), "k": "dias escritos no ano", "href": "/journal"}
    except Exception:
        out["violet_dias"] = None

    return out


@router.get("/today")
def hub_today(user: dict = Depends(require_user)) -> dict:
    """Painel "Hoje" da home: agora, precisa de você e números.

    Cada bloco é calculado em `try/except` isolado — falha vira `None`/`[]`, nunca 500.
    Os cards dos agentes continuam vindo de `GET /api/hub/summary`.
    """
    from agents.kaguya.tz import today_sp

    def seguro(fn, vazio):
        try:
            return fn()
        except Exception:
            return vazio

    return {
        "date": today_sp().isoformat(),
        "now": seguro(_now_block, {"focus": None, "next": None}),
        "attention": seguro(_attention_block, []),
        "numbers": seguro(_numbers_block, {}),
    }


# ═════════════════════════════════════════════════════════════════════════════
# CAPTURA UNIVERSAL — POST /api/hub/capture/{parse,commit,undo}
# ═════════════════════════════════════════════════════════════════════════════
# parse NÃO grava: só classifica e devolve a prévia (e resolve @Nome pela regra 0/1/2+ da Komi).
# commit grava via as tools de sempre (Nami/Kaguya) e devolve o que precisa para o Desfazer.
# Pessoa ambígua ou desconhecida nunca é vinculada sem confirmação: vira aviso na prévia.

class CaptureParseBody(BaseModel):
    text: str = Field(default="", max_length=500)


class CaptureCommitBody(BaseModel):
    kind: str = Field(pattern="^(expense|income|task)$")
    fields: dict
    person_ids: list[str] = Field(default_factory=list)


class CaptureUndoBody(BaseModel):
    kind: str = Field(pattern="^(expense|income|task)$")
    id: str


def _resolve_mentions(names: list[str]) -> tuple[list[dict], list[str]]:
    """@Nome → pessoa (1 match), ou aviso (0/2+). Falha da Komi nunca derruba a prévia."""
    people: list[dict] = []
    warnings: list[str] = []
    if not names:
        return people, warnings
    try:
        from agents.komi.integration import resolve_person

        for n in names:
            r = resolve_person(n)
            if r.get("status") != "ok":
                warnings.append(f"Não consegui procurar @{n} agora; não vinculei.")
            elif r["match"] == "one":
                people.append({"id": r["person"]["id"], "name": r["person"]["name"], "mention": n})
            elif r["match"] == "none":
                warnings.append(f"Não achei @{n} nas suas pessoas; não vinculei.")
            else:
                warnings.append(f"Mais de uma pessoa combina com @{n}; não vinculei. Use o nome completo.")
    except Exception:  # noqa: BLE001
        warnings.append("Não consegui procurar as pessoas agora; não vinculei ninguém.")
    return people, warnings


@router.post("/capture/parse")
def capture_parse(body: CaptureParseBody, user: dict = Depends(require_user)) -> dict:
    """Prévia da captura universal: o que a Makima entendeu, sem gravar nada."""
    from agents.kaguya.tz import today_sp
    from webapp.backend.universal_capture import parse_line

    r = parse_line(body.text, today_sp())
    r["people"], r["warnings"] = _resolve_mentions(r.pop("mentions", []))
    return r


@router.post("/capture/commit", status_code=201)
def capture_commit(body: CaptureCommitBody, user: dict = Depends(require_user)) -> dict:
    """Grava o que a prévia mostrou. Devolve `{status, summary, undo:{kind,id}}`. Aceita `Idempotency-Key`."""
    f = body.fields
    people = body.person_ids or None
    if body.kind in ("expense", "income"):
        from agents.nami.tools import create_transaction

        try:
            valor = float(f.get("valor"))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Valor inválido.")
        if valor <= 0:
            raise HTTPException(status_code=400, detail="O valor precisa ser maior que zero.")
        tipo = "Despesa" if body.kind == "expense" else "Receita"
        r = create_transaction(
            name=str(f.get("name") or tipo), valor=valor, tipo=tipo,
            categoria=str(f.get("categoria") or "Inbox"), data=str(f.get("data") or ""), person_ids=people,
        )
        if r.get("status") == "error":
            raise HTTPException(status_code=400, detail=r.get("message"))
        return {"status": "ok", "summary": r.get("message", "Lançado."), "undo": {"kind": body.kind, "id": str(r["id"])}}

    from agents.kaguya.tools_tasks import create_task

    title = str(f.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="Escreva o que precisa ser feito.")
    r = create_task(title=title, due_date=f.get("due_date") or None, person_ids=people)
    if r.get("status") == "error":
        raise HTTPException(status_code=400, detail=r.get("message"))
    return {"status": "ok", "summary": f"Tarefa criada: {title}", "undo": {"kind": "task", "id": str(r["id"])}}


@router.post("/capture/undo")
def capture_undo(body: CaptureUndoBody, user: dict = Depends(require_user)) -> dict:
    """Desfaz uma captura recém-gravada (transação → lixeira; tarefa → lixeira)."""
    if body.kind in ("expense", "income"):
        from agents.nami.tools import delete_transaction

        r = delete_transaction(body.id)
    else:
        from agents.kaguya.tools_tasks import delete_task

        try:
            r = delete_task(int(body.id))
        except ValueError:
            raise HTTPException(status_code=400, detail="Identificador inválido.")
    if isinstance(r, dict) and r.get("status") == "error":
        raise HTTPException(status_code=400, detail=r.get("message"))
    return {"status": "ok"}


# ═════════════════════════════════════════════════════════════════════════════
# BUSCA GLOBAL — GET /api/hub/search?q=
# ═════════════════════════════════════════════════════════════════════════════
# Fan-out por agente, cada fonte isolada (uma tabela fora do ar não derruba as outras).
# Só título/nome — o diário não entra (privacidade: nada do texto escrito vai para uma busca global).

_SEARCH_SOURCES: list[tuple[str, str, str, str, str, str]] = [
    # (grupo, agente, SQL, ícone, deep link com {id}, descrição curta)
    ("Tarefas", "kaguya", "SELECT id::text AS id, title AS label FROM tasks WHERE deleted_at IS NULL AND completed_at IS NULL AND title ILIKE %(q)s ORDER BY updated_at DESC NULLS LAST LIMIT 5", "task", "/tasks", ""),
    ("Pessoas", "komi", "SELECT id::text AS id, name AS label FROM people WHERE deleted = FALSE AND (name ILIKE %(q)s OR nickname ILIKE %(q)s OR full_name ILIKE %(q)s) ORDER BY name LIMIT 5", "person", "/people#pessoa/{id}", ""),
    ("Livros", "frieren", "SELECT id::text AS id, title AS label FROM books WHERE deleted = FALSE AND title ILIKE %(q)s ORDER BY title LIMIT 5", "book", "/books#livro/{id}", ""),
    ("Filmes", "akane", "SELECT id::text AS id, title AS label FROM movies WHERE deleted = FALSE AND title ILIKE %(q)s ORDER BY title LIMIT 5", "movie", "/movies#filme/{id}", ""),
    ("Animes", "marin", "SELECT id::text AS id, title AS label FROM anime WHERE deleted = FALSE AND title ILIKE %(q)s ORDER BY title LIMIT 5", "anime", "/animes#anime/{id}", ""),
    ("Séries", "mai", "SELECT id::text AS id, title AS label FROM series WHERE deleted = FALSE AND title ILIKE %(q)s ORDER BY title LIMIT 5", "series", "/series", ""),
    ("Lançamentos", "nami", "SELECT id::text AS id, name || ' · R$ ' || valor::text AS label FROM transactions WHERE deleted = FALSE AND tipo IN ('Despesa','Receita') AND name ILIKE %(q)s ORDER BY data DESC LIMIT 5", "money", "/nami", ""),
]


def _like(q: str) -> str:
    """Termo seguro para ILIKE: escapa % _ \ digitados pelo usuário."""
    esc = q.replace("\\", "\\\\").replace("%", "\%").replace("_", "\_")
    return f"%{esc}%"


@router.get("/search")
def hub_search(q: str = "", user: dict = Depends(require_user)) -> dict:
    """Busca por título/nome em todos os agentes (até 5 por grupo). Cada fonte é isolada.

    Returns:
        ``{"q", "results": [{"id", "group", "agent", "label", "icon", "href"}], "errors": ["Tarefas", ...]}``.
        Menos de 2 caracteres devolve vazio (a paleta só consulta a partir de 2).
    """
    termo = (q or "").strip()
    if len(termo) < 2:
        return {"q": termo, "results": [], "errors": []}
    like = _like(termo[:80])
    results: list[dict] = []
    errors: list[str] = []
    for group, agent, sql, icon, href, _ in _SEARCH_SOURCES:
        try:
            for r in run_select(sql, {"q": like}):
                results.append({
                    "id": f"{agent}:{r['id']}", "group": group, "agent": agent, "label": r["label"], "icon": icon,
                    "href": href.replace("{id}", r["id"]),
                })
        except Exception:  # noqa: BLE001 — falha de uma fonte nunca derruba a busca
            errors.append(group)
    return {"q": termo, "results": results, "errors": errors}
