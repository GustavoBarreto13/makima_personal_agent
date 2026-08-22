"""Motor de economia × conforto do Yato — função pura, sem banco nem rede.

Traduz duração + período do trecho rodoviário na categoria ANTT recomendada
(convencional → executivo → semi-leito → leito → leito-cama), aplicando o
"custo de exaustão" do research.md (viagem noturna longa em classe baixa anula
o dia seguinte; leito-cama muito longo pode substituir uma diária de hotel), e
ordena os upgrades de conforto por retorno (ROI), subindo o transfer privativo
quando o dossiê da cidade não tem app de corrida confirmado.

Puro significa: recebe os parâmetros já resolvidos (duração, período, perfil,
sinal do dossiê), não acessa banco nem API — mesmo padrão de
agents/kaguya/capacity.py e agents/kaguya/goal_progress.py.

Usage:
    >>> recommend(11, night=True)['recommended_class']
    'semi_leito'
"""

# Ordem fixa dos upgrades quando o dossiê JÁ tem app de corrida confirmado —
# o transfer perde prioridade porque a alternativa de app já cobre o problema.
_ROI_QUEUE_WITH_RIDE_APP = [
    "upgrade_hospedagem",
    "passeio_privativo",
    "transfer_privativo",
    "executiva_domestica",
]

# Ordem fixa quando NÃO há app de corrida confirmado — o transfer privativo é
# o maior ganho de conforto/segurança nessa cidade (FR-019, research.md).
_ROI_QUEUE_WITHOUT_RIDE_APP = [
    "transfer_privativo",
    "upgrade_hospedagem",
    "passeio_privativo",
    "executiva_domestica",
]


def recommend(
    hours: float,
    night: bool = False,
    profile: str = "equilibrado",
    has_ride_app: bool = False,
) -> dict:
    """Recomenda a categoria rodoviária ANTT e a fila de ROI de upgrades.

    Args:
        hours: Duração do trecho em horas.
        night: Período noturno do trecho (FR-018 — o custo de exaustão só se
            aplica à noite; trechos diurnos longos usam degraus mais brandos).
        profile: economia | equilibrado | conforto — recebido por paridade com
            o contrato da tool, mas não reordena a fila de ROI nesta fatia
            (só o sinal do dossiê, `has_ride_app`, faz isso — FR-019).
        has_ride_app: True se o dossiê da cidade tem algum app de corrida
            `confirmado` — desce o transfer privativo na fila de ROI.

    Returns:
        Dicionário com:
            ``recommended_class`` (str): convencional | executivo | semi_leito |
                leito | leito_cama.
            ``rationale`` (str): justificativa em português.
            ``roi_queue`` (list[str]): 4 upgrades ordenados por retorno.

    Example:
        >>> recommend(11, night=True)['recommended_class']
        'semi_leito'
        >>> recommend(3, night=False)['recommended_class']
        'convencional'
        >>> recommend(13, night=True)['recommended_class']
        'leito_cama'
    """
    periodo = "noturno" if night else "diurno"

    if hours <= 4:
        recommended_class = "convencional"
        rationale = (
            f"Trecho de {hours:g}h {periodo} — convencional já é suficiente; "
            "upgrade não traria retorno proporcional aqui."
        )
    elif hours <= 8:
        recommended_class = "executivo"
        rationale = (
            f"Trecho de {hours:g}h {periodo} — ponto de equilíbrio: executivo "
            "cobre ar-condicionado, sanitário e espaço para as pernas sem pagar "
            "o prêmio do semi-leito."
        )
    elif hours <= 12:
        if night:
            recommended_class = "semi_leito"
            rationale = (
                f"Trecho de {hours:g}h em período noturno, acima de 8h — custo "
                "de exaustão: recomendado no mínimo semi-leito para não anular "
                "o dia seguinte de viagem."
            )
        else:
            recommended_class = "executivo"
            rationale = (
                f"Trecho de {hours:g}h diurno — longo, mas de dia o desgaste é "
                "menor; executivo é suficiente."
            )
    else:  # hours > 12
        if night:
            recommended_class = "leito_cama"
            rationale = (
                f"Trecho de {hours:g}h noturno, acima de 12h — o leito-cama "
                "pode substituir uma diária de hospedagem: compare o valor do "
                "upgrade com o custo de uma noite de hotel antes de decidir."
            )
        else:
            recommended_class = "leito"
            rationale = (
                f"Trecho de {hours:g}h diurno — duração longa demais para "
                "economizar no assento: leito garante descanso sem o custo do "
                "leito-cama."
            )

    roi_queue = (
        list(_ROI_QUEUE_WITH_RIDE_APP)
        if has_ride_app
        else list(_ROI_QUEUE_WITHOUT_RIDE_APP)
    )

    return {
        "recommended_class": recommended_class,
        "rationale": rationale,
        "roi_queue": roi_queue,
    }
