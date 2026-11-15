"""Captura universal da home: uma linha de texto vira gasto, receita ou tarefa (com prévia antes de gravar).

Motor PURO e determinístico (sem banco, sem rede): `parse_line` só classifica e extrai campos.
A gravação acontece no router (`/api/hub/capture/commit`) chamando as tools que já existem.

Regras (pt-BR):
    - "gastei/paguei/comprei 32 no ifood"  → gasto (Nami), categoria sugerida pelo estabelecimento;
    - "recebi/ganhei 500 de freela"        → receita (Nami);
    - qualquer outra coisa                 → tarefa (Kaguya), com `confidence="low"` — a prévia avisa e
      o usuário troca o tipo com um toque (nunca grava no chute sem mostrar o que entendeu);
    - datas: hoje, ontem, anteontem, amanhã, depois de amanhã, "dia 20";
    - `@Nome` fica em `mentions`; quem resolve a pessoa (regra 0/1/2+ da Komi) é o router.

Usage:
    >>> r = parse_line("gastei 32 no ifood ontem", today=date(2026, 11, 15))
    >>> (r["kind"], r["fields"]["valor"], r["fields"]["data"], r["fields"]["categoria"])
    ('expense', 32.0, '2026-11-14', 'Comer Fora')
"""

from __future__ import annotations

import re
import unicodedata
from datetime import date, timedelta

# Categorias válidas da Nami (agents/nami/tools.py::CATEGORIES) — "Inbox" é o balde de triagem.
_CATEGORY_HINTS: list[tuple[str, tuple[str, ...]]] = [
    ("Comer Fora", ("ifood", "restaurante", "lanche", "almoco", "jantar", "pizza", "hamburguer", "padaria", "cafe", "bar", "sorvete")),
    ("Supermercado", ("mercado", "supermercado", "feira", "atacadao", "hortifruti")),
    ("Transporte", ("uber", "99", "gasolina", "combustivel", "onibus", "metro", "estacionamento", "pedagio", "taxi")),
    ("Farmacia", ("farmacia", "remedio", "drogaria")),
    ("Saude", ("consulta", "medico", "dentista", "exame", "terapia")),
    ("Assinaturas", ("netflix", "spotify", "youtube", "disney", "assinatura", "icloud", "chatgpt")),
    ("Lazer", ("cinema", "show", "festa", "jogo", "ingresso", "bar")),
    ("Moradia", ("aluguel", "condominio", "luz", "agua", "internet", "gas")),
]

_AMOUNT = r"(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)"
_EXPENSE_RE = re.compile(rf"^\s*(?:gastei|paguei|comprei|gasto|despesa)\s+{_AMOUNT}\s*(?:reais|real|conto|contos)?\b\s*(?P<rest>.*)$", re.I)
_INCOME_RE = re.compile(rf"^\s*(?:recebi|ganhei|entrou|receita)\s+{_AMOUNT}\s*(?:reais|real|conto|contos)?\b\s*(?P<rest>.*)$", re.I)
_MENTION_RE = re.compile(r"@([\wÀ-ÿ]+)")
_DAY_RE = re.compile(r"\bdia\s+(\d{1,2})\b", re.I)
_FILLER_RE = re.compile(r"^(?:no|na|nos|nas|em|de|do|da|com|pra|para|num|numa|o|a)\s+", re.I)


def _norm(s: str) -> str:
    """Minúsculas sem acento (para casar palavras-chave)."""
    return "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")


def _to_float(raw: str) -> float:
    """'1.234,50' → 1234.5 ; '32,5' → 32.5 ; '32' → 32.0."""
    s = raw.strip()
    if "," in s:
        s = s.replace(".", "").replace(",", ".")
    elif re.fullmatch(r"\d{1,3}(?:\.\d{3})+", s):
        s = s.replace(".", "")
    return float(s)


def _extract_date(text: str, today: date) -> tuple[str, date | None]:
    """Tira da frase a palavra de data e devolve (frase sem ela, data ou None)."""
    patterns: list[tuple[str, int]] = [
        (r"\bdepois\s+de\s+amanh[ãa]\b", 2), (r"\bamanh[ãa]\b", 1), (r"\banteontem\b", -2), (r"\bontem\b", -1), (r"\bhoje\b", 0),
    ]
    for pat, delta in patterns:
        m = re.search(pat, text, re.I)
        if m:
            return (text[: m.start()] + " " + text[m.end():]).strip(), today + timedelta(days=delta)
    m = _DAY_RE.search(text)
    if m:
        dia = int(m.group(1))
        if 1 <= dia <= 31:
            # Próximo "dia N" a partir de hoje (este mês se ainda não passou, senão o mês seguinte).
            ano, mes = today.year, today.month
            for _ in range(3):
                try:
                    cand = date(ano, mes, dia)
                except ValueError:
                    cand = None
                if cand and cand >= today:
                    return (text[: m.start()] + " " + text[m.end():]).strip(), cand
                mes += 1
                if mes > 12:
                    ano, mes = ano + 1, 1
    return text.strip(), None


def _clean_title(text: str) -> str:
    t = re.sub(r"\s+", " ", text).strip(" ,.;-")
    t = _FILLER_RE.sub("", t).strip()
    return t[:1].upper() + t[1:] if t else ""


def _category_for(text: str) -> str:
    words = set(re.findall(r"[a-z0-9]+", _norm(text)))
    for cat, hints in _CATEGORY_HINTS:
        if any(h in words for h in hints):
            return cat
    return "Inbox"


def _brl(v: float) -> str:
    return "R$ " + f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".").removesuffix(",00")


def _when(d: date, today: date) -> str:
    delta = (d - today).days
    return {0: "hoje", 1: "amanhã", -1: "ontem", -2: "anteontem", 2: "depois de amanhã"}.get(delta, f"{d.day:02d}/{d.month:02d}")


def parse_line(text: str, today: date) -> dict:
    """Classifica a linha e extrai os campos. Nunca grava nada.

    Args:
        text: Linha digitada (ou falada) pelo usuário.
        today: Data local de hoje (America/Sao_Paulo), passada pelo chamador para o motor ficar puro.

    Returns:
        ``{"kind": "expense"|"income"|"task"|"empty", "agent", "confidence": "high"|"low", "title",
        "summary", "fields", "mentions"}``. ``fields`` já tem os nomes dos parâmetros das tools
        (`name/valor/tipo/categoria/data` na Nami; `title/due_date` na Kaguya).

    Example:
        >>> parse_line("ligar pro contador amanhã", date(2026, 11, 15))["fields"]["due_date"]
        '2026-11-16'
    """
    raw = (text or "").strip()
    if not raw:
        return {"kind": "empty", "agent": None, "confidence": "low", "title": "", "summary": "", "fields": {}, "mentions": []}

    mentions = [m.group(1) for m in _MENTION_RE.finditer(raw)]
    clean = _MENTION_RE.sub("", raw)

    for regex, kind, tipo in ((_EXPENSE_RE, "expense", "Despesa"), (_INCOME_RE, "income", "Receita")):
        m = regex.match(clean)
        if m:
            valor = _to_float(m.group(1))
            rest, d = _extract_date(m.group("rest"), today)
            d = d or today
            title = _clean_title(rest) or ("Gasto" if kind == "expense" else "Receita")
            cat = _category_for(rest) if kind == "expense" else "Receita"
            fields = {"name": title, "valor": valor, "tipo": tipo, "categoria": cat, "data": d.isoformat()}
            verbo = "Gasto" if kind == "expense" else "Receita"
            return {
                "kind": kind, "agent": "nami", "confidence": "high", "title": title,
                "summary": f"{verbo} de {_brl(valor)} · {title} · {cat} · {_when(d, today)}",
                "fields": fields, "mentions": mentions,
            }

    rest, d = _extract_date(clean, today)
    low = not re.match(r"^\s*(?:tarefa|lembrar|lembrete|ligar|comprar|enviar|marcar|pagar|fazer)\b", rest, re.I)
    title = _clean_title(re.sub(r"^\s*(?:tarefa|lembrete)\s*[:\-]?\s*", "", rest, flags=re.I))
    fields: dict = {"title": title}
    if d:
        fields["due_date"] = d.isoformat()
    when = f" · {_when(d, today)}" if d else ""
    return {
        "kind": "task", "agent": "kaguya", "confidence": "low" if low else "high", "title": title,
        "summary": f"Tarefa · {title}{when}" if title else "", "fields": fields, "mentions": mentions,
    }
