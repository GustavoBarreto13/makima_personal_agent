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


def base_position(first_unit: int | None, unit: str | None = "chapters") -> int:
    """Calcular a posição "zero" do livro: onde o leitor está antes de ler qualquer coisa.

    Mangás costumam numerar os capítulos de forma contínua entre os volumes (o Vol. 2 pode
    começar no capítulo 24). Então a leitura começa na posição ``first_unit - 1`` (23), e só
    o que passa daí conta como avanço. Em páginas o início é sempre 0.

    Args:
        first_unit: Número da primeira unidade do livro (``books.first_unit``); None vale 1.
        unit: Unidade do livro; em ``pages`` o valor de ``first_unit`` é ignorado.

    Returns:
        A posição base (0 para livros que começam no 1 ou contados em páginas).

    Example:
        >>> base_position(24, "chapters")
        23
        >>> base_position(None, "chapters")
        0
        >>> base_position(24, "pages")
        0
    """
    if normalize_unit(unit) == "pages":
        return 0
    return max(1, int(first_unit or 1)) - 1


def unit_count_total(total: int | None, first_unit: int | None = 1, unit: str | None = "chapters") -> int | None:
    """Calcular quantas unidades o livro tem de fato (último número - base).

    Args:
        total: Último número do livro (``books.total_pages``), ex.: 36.
        first_unit: Número da primeira unidade, ex.: 24.
        unit: Unidade do livro.

    Returns:
        A quantidade (13 no exemplo) ou None se o total não é conhecido.

    Example:
        >>> unit_count_total(36, 24, "chapters")
        13
        >>> unit_count_total(120, 1, "chapters")
        120
        >>> unit_count_total(None, 24, "chapters") is None
        True
    """
    if not total:
        return None
    return max(0, int(total) - base_position(first_unit, unit))


def progress_fraction(position: int | None, total: int | None, first_unit: int | None = 1,
                      unit: str | None = "chapters") -> float | None:
    """Calcular a fração lida (0 a 1) descontando a base do livro.

    Args:
        position: Posição atual (último ``page_end``), ex.: 30.
        total: Último número do livro, ex.: 36.
        first_unit: Número da primeira unidade, ex.: 24.
        unit: Unidade do livro.

    Returns:
        Fração entre 0 e 1, ou None se não dá para calcular (sem total ou sem quantidade).

    Example:
        >>> round(progress_fraction(30, 36, 24, "chapters"), 3)
        0.538
        >>> progress_fraction(40, 120, 1, "chapters") == 40 / 120
        True
        >>> progress_fraction(5, None) is None
        True
    """
    quantidade = unit_count_total(total, first_unit, unit)
    if not quantidade or position is None:
        return None
    lido = int(position) - base_position(first_unit, unit)
    return min(1.0, max(0.0, lido / quantidade))
