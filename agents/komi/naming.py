"""Regras PURAS de nome, espaço e aniversário da Komi (sem banco, sem rede).

Aqui vivem as decisões que não dependem de dados do PostgreSQL: como normalizar um
nome para comparar, quais valores de "espaço" existem e se um aniversário é uma data
real do calendário. Ficar fora de ``tools.py`` deixa tudo testável sem banco e
reaproveitável por qualquer agente (``agents.komi.integration``).

Os três campos de nome de uma pessoa (spec 077):
    - **Nome** (``name``): o que o dono escolhe; é o que aparece em toda a interface.
    - **Apelido** (``nickname``): outro jeito curto de chamar ("Bia").
    - **Nome completo** (``full_name``): o nome de registro ("Beatriz Silva Souza").
Em qualquer agente, o Nome e o Apelido servem para referenciar a pessoa (``@Bia`` e
``@Beatriz`` resolvem a mesma pessoa).

Usage:
    >>> from agents.komi.naming import norm, validate_birth
    >>> norm("  Beatriz ")
    'beatriz'
    >>> validate_birth(29, 2, None)
    (29, 2, None)
"""

from __future__ import annotations

import calendar
import unicodedata
from datetime import date, datetime
from zoneinfo import ZoneInfo

# Valores aceitos para o espaço (contexto) de uma pessoa.
CONTEXTS = ("personal", "work", "both")

# Espaços "puros" — o contexto de uma interação/anotação/item de memória nunca é "both":
# o item acontece em UM dos dois lados (é isso que separa trabalho de pessoal).
SPACES = ("personal", "work")

# Ano usado como âncora quando um aniversário foi informado só como dia/mês no modelo
# antigo (``person_dates``). Era bissexto de propósito, para o 29/02 continuar válido.
LEGACY_SENTINEL_YEAR = 2000


def norm(texto: str | None) -> str:
    """Normalizar um texto para comparar sem depender de caixa ou acento.

    Args:
        texto: Texto original (pode ter acentos, maiúsculas e espaços extras).

    Returns:
        O texto em minúsculas, sem acentos e sem espaços nas pontas. ``None`` vira ``""``.

    Example:
        >>> norm("  João  ")
        'joao'
    """
    if not texto:
        return ""
    # NFD separa a letra do acento; descartamos só as marcas de acento (categoria "Mn").
    decomposto = unicodedata.normalize("NFD", texto.strip().lower())
    return "".join(c for c in decomposto if unicodedata.category(c) != "Mn")


def clean(texto: str | None) -> str | None:
    """Aparar um texto opcional, devolvendo ``None`` quando fica vazio.

    Campos opcionais vazios são gravados como ``NULL`` no banco (e não como ``""``),
    para "sem valor" ter uma única representação.

    Args:
        texto: Texto vindo de um formulário, agente ou API.

    Returns:
        O texto aparado, ou ``None`` se estava ausente ou só com espaços.

    Example:
        >>> clean("  ") is None
        True
        >>> clean(" Bia ")
        'Bia'
    """
    if texto is None:
        return None
    aparado = str(texto).strip()
    return aparado or None


def valid_context(contexto: str | None, padrao: str = "personal") -> str:
    """Validar o espaço de uma pessoa (pessoal, trabalho ou ambos).

    Args:
        contexto: Valor recebido (``"personal"``, ``"work"`` ou ``"both"``).
        padrao: Valor usado quando ``contexto`` vem vazio.

    Returns:
        O contexto válido.

    Raises:
        ValueError: Se o valor não for um dos três espaços.

    Example:
        >>> valid_context("work")
        'work'
        >>> valid_context(None)
        'personal'
    """
    if contexto is None or str(contexto).strip() == "":
        return padrao
    valor = str(contexto).strip().lower()
    if valor not in CONTEXTS:
        raise ValueError("Espaço inválido. Use 'personal' (pessoal), 'work' (trabalho) ou 'both' (ambos).")
    return valor


def valid_space(espaco: str | None) -> str | None:
    """Interpretar o filtro de espaço de uma tela ou consulta.

    Args:
        espaco: ``"personal"``, ``"work"`` ou vazio/``"all"``/``"tudo"`` (sem filtro).

    Returns:
        ``"personal"``, ``"work"`` ou ``None`` quando não deve filtrar.

    Raises:
        ValueError: Se o valor não for reconhecido.

    Example:
        >>> valid_space("tudo") is None
        True
        >>> valid_space("work")
        'work'
    """
    if espaco is None:
        return None
    valor = str(espaco).strip().lower()
    if valor in ("", "all", "tudo", "todos"):
        return None
    if valor not in SPACES:
        raise ValueError("Espaço inválido. Use 'personal' (pessoal) ou 'work' (trabalho).")
    return valor


def spaces_matching(espaco: str | None) -> tuple[str, ...] | None:
    """Listar os contextos de pessoa que aparecem em um espaço.

    Quem é ``both`` (ambos) aparece nos dois espaços.

    Args:
        espaco: ``"personal"``, ``"work"`` ou ``None`` (sem filtro).

    Returns:
        Tupla de contextos para usar em ``context IN (...)``, ou ``None`` sem filtro.

    Example:
        >>> spaces_matching("work")
        ('work', 'both')
        >>> spaces_matching(None) is None
        True
    """
    alvo = valid_space(espaco)
    if alvo is None:
        return None
    return (alvo, "both")


def validate_birth(
    dia: int | None,
    mes: int | None,
    ano: int | None = None,
) -> tuple[int | None, int | None, int | None]:
    """Validar um aniversário contra o calendário real.

    Dia e mês andam juntos; o ano é opcional (a idade só existe com ano). O 29/02 é
    aceito (nasceu em ano bissexto) e dias que não existem no mês (30/02, 31/04) não.

    Args:
        dia: Dia do mês (1–31) ou ``None``.
        mes: Mês (1–12) ou ``None``.
        ano: Ano de nascimento (opcional).

    Returns:
        A tripla ``(dia, mes, ano)`` normalizada. ``(None, None, None)`` limpa o aniversário.

    Raises:
        ValueError: Se só um de dia/mês foi informado, se algum está fora da faixa, se a
            data não existe no calendário ou se o ano está no futuro.

    Example:
        >>> validate_birth(15, 5, 1998)
        (15, 5, 1998)
        >>> validate_birth(None, None, 1998)
        (None, None, None)
        >>> validate_birth(30, 2, None)
        Traceback (most recent call last):
            ...
        ValueError: O dia 30 não existe no mês 2.
    """
    # Sem dia e mês não há aniversário — descarta o ano solto em vez de gravar lixo.
    if dia is None and mes is None:
        return (None, None, None)
    if dia is None or mes is None:
        raise ValueError("Informe o dia e o mês do aniversário juntos.")

    dia, mes = int(dia), int(mes)
    if not 1 <= mes <= 12:
        raise ValueError(f"O mês {mes} é inválido (use de 1 a 12).")
    # monthrange usa um ano bissexto (2000) para o 29/02 continuar existindo.
    ultimo_dia = calendar.monthrange(2000, mes)[1]
    if not 1 <= dia <= ultimo_dia:
        raise ValueError(f"O dia {dia} não existe no mês {mes}.")

    if ano is not None:
        ano = int(ano)
        if ano < 1900 or ano > date.today().year:
            raise ValueError(f"O ano {ano} é inválido para um nascimento.")
        # 29/02 só existe em ano bissexto — "29/02/1999" é uma data que nunca existiu.
        if (dia, mes) == (29, 2) and not calendar.isleap(ano):
            raise ValueError(f"{ano} não foi bissexto: 29/02 não existe nesse ano.")
    return (dia, mes, ano)


def age_on(ano_nascimento: int | None, dia: int | None, mes: int | None, hoje: date) -> int | None:
    """Calcular a idade completada em uma data, quando o ano de nascimento é conhecido.

    Args:
        ano_nascimento: Ano de nascimento (``None`` = desconhecido).
        dia: Dia do aniversário.
        mes: Mês do aniversário.
        hoje: Data de referência (quem chama passa "hoje" no fuso America/Sao_Paulo).

    Returns:
        A idade em anos completos, ou ``None`` sem ano/dia/mês.

    Example:
        >>> age_on(1998, 15, 5, date(2026, 5, 14))
        27
        >>> age_on(1998, 15, 5, date(2026, 5, 15))
        28
    """
    if ano_nascimento is None or dia is None or mes is None:
        return None
    idade = hoje.year - ano_nascimento
    # Ainda não fez aniversário neste ano → uma idade a menos.
    if (hoje.month, hoje.day) < (mes, dia):
        idade -= 1
    return idade


def next_birthday(dia: int, mes: int, hoje: date) -> date:
    """Achar a próxima ocorrência de um aniversário a partir de uma data.

    O 29/02 em ano não bissexto cai em 28/02 (o dia mais próximo que existe).

    Args:
        dia: Dia do aniversário.
        mes: Mês do aniversário.
        hoje: Data de referência (inclusive: aniversário hoje devolve hoje).

    Returns:
        A data da próxima comemoração.

    Example:
        >>> next_birthday(15, 5, date(2026, 5, 16))
        datetime.date(2027, 5, 15)
        >>> next_birthday(29, 2, date(2027, 1, 1))
        datetime.date(2027, 2, 28)
    """
    for ano in (hoje.year, hoje.year + 1):
        d = dia
        # 29/02 num ano não bissexto → 28/02.
        if (dia, mes) == (29, 2) and not calendar.isleap(ano):
            d = 28
        candidata = date(ano, mes, d)
        if candidata >= hoje:
            return candidata
    # Inalcançável (o ano seguinte sempre vale), mas mantém o tipo de retorno honesto.
    raise ValueError("Não foi possível calcular o próximo aniversário.")


def name_keys(*nomes: str | None) -> list[str]:
    """Reunir as chaves normalizadas (sem vazias nem repetidas) de uma lista de nomes.

    Usada para checar colisão: o Nome, o Apelido e as "outras formas" de uma pessoa não
    podem coincidir com os de outra.

    Args:
        *nomes: Nome, apelido, nome completo e/ou outras formas.

    Returns:
        Chaves normalizadas, na ordem em que apareceram, sem duplicatas.

    Example:
        >>> name_keys("Bia", " BIA ", None, "Beatriz")
        ['bia', 'beatriz']
    """
    vistas: list[str] = []
    for nome in nomes:
        chave = norm(nome)
        if chave and chave not in vistas:
            vistas.append(chave)
    return vistas


def today_sp(agora: datetime | None = None) -> date:
    """Dizer que dia é "hoje" para o dono: fuso America/Sao_Paulo (UTC-3), nunca o do servidor.

    O servidor roda em UTC; depois das 21h locais a data UTC já é a de amanhã (bug histórico
    do projeto). Toda conta de "hoje" da Komi passa por aqui.

    Args:
        agora: Instante de referência (``None`` = agora). Útil para testes.

    Returns:
        A data local em São Paulo.

    Example:
        >>> from datetime import timezone
        >>> today_sp(datetime(2026, 10, 18, 1, 30, tzinfo=timezone.utc))   # 22h30 do dia 17 em SP
        datetime.date(2026, 10, 17)
    """
    fuso = ZoneInfo("America/Sao_Paulo")
    return (agora or datetime.now(fuso)).astimezone(fuso).date()
