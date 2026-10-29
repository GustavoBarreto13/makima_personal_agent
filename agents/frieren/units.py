"""Unidades de progresso e formatos de livro da Frieren (páginas, capítulos, volumes).

Módulo PURO (sem banco, sem rede): é a fonte única do vocabulário usado pelas tools, pelas
estatísticas, pelo calendário e pelo hub. O frontend espelha esta tabela em
``webapp/frontend/src/pages/frieren/lib/units.ts`` — mudou aqui, mude lá.

Usage:
    >>> from agents.frieren.units import unit_label, default_unit_for
    >>> unit_label("chapters", 3)
    '3 capítulos'
    >>> default_unit_for("audiobook")
    'chapters'
"""

# Unidades aceitas em ``books.progress_unit``. O que a unidade muda é só o SIGNIFICADO dos números
# (``total_pages`` = total na unidade; ``reading_logs.page_end`` = posição; ``pages_read`` = avanço).
VALID_UNITS = ("pages", "chapters", "volumes")

# Formatos aceitos em ``books.format``.
VALID_FORMATS = ("fisico", "ebook", "audiobook", "quadrinho")

# Unidade padrão. Livros antigos (sem a coluna preenchida) continuam sendo lidos em páginas.
DEFAULT_UNIT = "pages"
DEFAULT_FORMAT = "fisico"

# Vocabulário de cada unidade: singular, plural, abreviação (usada em textos curtos) e o
# complemento do verbo "parou no/na" ("na página", "no capítulo", "no volume").
_UNITS = {
    "pages":    {"singular": "página",   "plural": "páginas",   "abbr": "pág.", "stopped": "na página"},
    "chapters": {"singular": "capítulo", "plural": "capítulos", "abbr": "cap.", "stopped": "no capítulo"},
    "volumes":  {"singular": "volume",   "plural": "volumes",   "abbr": "vol.", "stopped": "no volume"},
}

# Formato → unidade sugerida ao cadastrar. É só um PONTO DE PARTIDA: o usuário pode trocar.
_FORMAT_DEFAULT_UNIT = {
    "fisico": "pages",
    "ebook": "pages",
    "audiobook": "chapters",
    "quadrinho": "chapters",
}

# Rótulos dos formatos para textos do agente e rankings.
_FORMAT_LABELS = {
    "fisico": "Físico",
    "ebook": "E-book",
    "audiobook": "Audiobook",
    "quadrinho": "Mangá/HQ",
}


def normalize_unit(unit: str | None) -> str:
    """Normalizar uma unidade vinda de fora (banco, API ou texto do usuário).

    Args:
        unit: Unidade crua; aceita None, maiúsculas e as abreviações ``pag``/``cap``/``vol``.

    Returns:
        Uma das ``VALID_UNITS``; valores desconhecidos ou vazios viram ``"pages"``.

    Example:
        >>> normalize_unit("Cap.")
        'chapters'
        >>> normalize_unit(None)
        'pages'
    """
    texto = (unit or "").strip().lower().rstrip(".")
    # Aceita os apelidos curtos que o usuário costuma digitar.
    apelidos = {"pag": "pages", "pág": "pages", "cap": "chapters", "vol": "volumes"}
    texto = apelidos.get(texto, texto)
    return texto if texto in VALID_UNITS else DEFAULT_UNIT


def default_unit_for(book_format: str | None) -> str:
    """Sugerir a unidade de progresso para um formato de livro.

    Args:
        book_format: Formato do livro (``fisico``, ``ebook``, ``audiobook`` ou ``quadrinho``).

    Returns:
        A unidade sugerida; formato desconhecido cai em páginas.

    Example:
        >>> default_unit_for("quadrinho")
        'chapters'
        >>> default_unit_for("fisico")
        'pages'
    """
    return _FORMAT_DEFAULT_UNIT.get((book_format or "").strip().lower(), DEFAULT_UNIT)


def format_label(book_format: str | None) -> str:
    """Devolver o rótulo legível de um formato.

    Args:
        book_format: Formato do livro.

    Returns:
        Rótulo em português (formato desconhecido vira "Físico").

    Example:
        >>> format_label("audiobook")
        'Audiobook'
    """
    return _FORMAT_LABELS.get((book_format or "").strip().lower(), _FORMAT_LABELS[DEFAULT_FORMAT])


def unit_label(unit: str | None, n: int | float | None = None, *, abbr: bool = False) -> str:
    """Escrever uma quantidade com a unidade, no singular ou no plural.

    Args:
        unit: Unidade de progresso do livro.
        n: Quantidade. Se None, devolve só o nome da unidade (plural).
        abbr: Se True, usa a abreviação (``cap.``), boa para títulos curtos de calendário.

    Returns:
        Texto como ``"1 capítulo"``, ``"3 capítulos"``, ``"2 vol."`` ou ``"páginas"``.

    Example:
        >>> unit_label("volumes", 1)
        '1 volume'
        >>> unit_label("pages", 20, abbr=True)
        '20 pág.'
        >>> unit_label("chapters")
        'capítulos'
    """
    dados = _UNITS[normalize_unit(unit)]
    if n is None:
        return dados["plural"]
    n_txt = int(n) if float(n).is_integer() else n
    if abbr:
        return f"{n_txt} {dados['abbr']}"
    nome = dados["singular"] if n_txt == 1 else dados["plural"]
    return f"{n_txt} {nome}"


def stopped_label(unit: str | None) -> str:
    """Devolver o complemento de "parou ...": "na página", "no capítulo" ou "no volume".

    Args:
        unit: Unidade de progresso do livro.

    Returns:
        O complemento, já com a preposição.

    Example:
        >>> stopped_label("chapters")
        'no capítulo'
    """
    return _UNITS[normalize_unit(unit)]["stopped"]
