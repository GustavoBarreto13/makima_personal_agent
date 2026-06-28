"""Motor PURO de recência pós-recuperação da Kurisu (spec 028).

Por que existe: o Vertex AI RAG **não** aplica decaimento por data nativamente — ele
ordena só por relevância semântica. Mas a memória unificada (028) precisa que, numa
pergunta como "o que fiz esta semana?", o conteúdo mais recente apareça primeiro
(FR-005/SC-006). Esta camada reordena os trechos JÁ recuperados usando o `doc_date`
que cada documento operacional carrega no metadado.

É um módulo **puro**: não acessa rede, banco nem variáveis de ambiente. Por isso é
testável por `doctest` (rode `python -m doctest agents/kurisu/recency.py -v`).

Usage:
    from agents.kurisu.recency import aplicar_recencia
    trechos_ordenados = aplicar_recencia(trechos)
"""

from datetime import date


def to_date(valor: object) -> "date | None":
    """Normaliza um valor de data para `date` (ou `None` se não houver data válida).

    Aceita um objeto `date` já pronto, uma string ISO no formato "YYYY-MM-DD"
    (ou maior, como um timestamp — só os 10 primeiros caracteres são usados), ou
    `None`/vazio. Qualquer coisa não reconhecida vira `None`.

    Args:
        valor: O valor bruto vindo do metadado do documento.

    Returns:
        Um `date` quando o valor é uma data válida; caso contrário, `None`.

    Example:
        >>> to_date("2026-05-04")
        datetime.date(2026, 5, 4)
        >>> to_date("2026-05-04T13:00:00-03:00")
        datetime.date(2026, 5, 4)
        >>> to_date(None) is None
        True
        >>> to_date("") is None
        True
    """
    # Já é um date: devolve como está.
    if isinstance(valor, date):
        return valor
    # String não vazia: tenta interpretar os 10 primeiros chars como data ISO.
    if isinstance(valor, str) and valor.strip():
        try:
            return date.fromisoformat(valor.strip()[:10])
        except ValueError:
            return None
    # Qualquer outro caso (None, número, etc.): sem data.
    return None


def score_decaimento(
    doc_date: object, hoje: date, meia_vida_dias: float = 180.0
) -> float:
    """Calcula um score de recência em [0, 1] com decaimento exponencial pela idade.

    Vale 1.0 para um documento de hoje, 0.5 quando a idade atinge `meia_vida_dias`, e
    se aproxima de 0 para documentos muito antigos. Documentos **sem data** (ex.: páginas
    da wiki da 027) recebem 0.0 — não ganham nenhum bônus temporal, só competem por
    relevância.

    Args:
        doc_date: A data do documento (date, string ISO ou None).
        hoje: A data de referência (a data local UTC-3 "de hoje").
        meia_vida_dias: Em quantos dias o score cai pela metade.

    Returns:
        Um float em [0, 1] — quanto mais recente, mais perto de 1.

    Example:
        >>> round(score_decaimento(date(2026, 1, 1), date(2026, 1, 1)), 3)
        1.0
        >>> round(score_decaimento(date(2025, 7, 5), date(2026, 1, 1), 180.0), 2)
        0.5
        >>> score_decaimento(None, date(2026, 1, 1))
        0.0
    """
    d = to_date(doc_date)
    # Sem data → sem bônus de recência.
    if d is None:
        return 0.0
    # Idade em dias; data futura (idade negativa) é tratada como "hoje" (idade 0).
    idade = (hoje - d).days
    if idade < 0:
        idade = 0
    # Decaimento exponencial: 0.5 ** (idade / meia_vida) = 1 hoje, 0.5 na meia-vida.
    return 0.5 ** (idade / meia_vida_dias)


def aplicar_recencia(trechos: list, granularidade: float = 0.02) -> list:
    """Reordena os trechos para que, em empate de relevância, o mais recente venha antes.

    Estratégia (tie-break por recência): agrupa os trechos em "buckets" de score (de
    `granularidade` em `granularidade`). Dentro do mesmo bucket — ou seja, quando a
    relevância é praticamente equivalente — ordena pelo `doc_date` decrescente (mais
    recente primeiro). Entre buckets diferentes, a relevância manda (não invertemos a
    ordem de quem é claramente mais relevante).

    Assim, perguntas conceituais (atemporais) continuam dominadas pela relevância, e
    perguntas com empate temporal favorecem o conteúdo recente (FR-005/SC-006). Trechos
    sem `doc_date` (páginas da wiki) usam uma data mínima e não disputam o desempate
    temporal — mas mantêm sua posição de relevância.

    Args:
        trechos: Lista de dicts com pelo menos 'score' (float) e 'doc_date'
            (date, string ISO ou None).
        granularidade: Largura do bucket de score. Scores cuja diferença cabe dentro
            de uma granularidade são considerados "empate".

    Returns:
        Uma **nova** lista de trechos, reordenada.

    Example:
        Dois trechos com a MESMA relevância — o mais recente vem primeiro:

        >>> ts = [
        ...   {"fonte": "antigo", "score": 0.30, "doc_date": "2026-01-01"},
        ...   {"fonte": "novo",   "score": 0.30, "doc_date": "2026-05-01"},
        ... ]
        >>> [t["fonte"] for t in aplicar_recencia(ts)]
        ['novo', 'antigo']

        Relevância claramente maior NÃO é ultrapassada pela recência:

        >>> ts = [
        ...   {"fonte": "relevante_antigo", "score": 0.50, "doc_date": "2020-01-01"},
        ...   {"fonte": "fraco_novo",       "score": 0.20, "doc_date": "2026-05-01"},
        ... ]
        >>> [t["fonte"] for t in aplicar_recencia(ts)]
        ['relevante_antigo', 'fraco_novo']
    """
    def chave(t: dict) -> tuple:
        # Bucket de score: divide pela granularidade e arredonda — scores próximos
        # caem no mesmo bucket e passam a desempatar por data.
        bucket = round(float(t.get("score", 0.0)) / granularidade)
        # Data do trecho; sem data → date.min (vai pro fim do desempate temporal).
        d = to_date(t.get("doc_date")) or date.min
        return (bucket, d)

    # reverse=True: bucket maior (mais relevante) primeiro e, no empate, data maior
    # (mais recente) primeiro. sorted() é estável, então a ordem original é preservada
    # quando bucket e data coincidem.
    return sorted(trechos, key=chave, reverse=True)
