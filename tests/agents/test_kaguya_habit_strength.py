"""Testes do motor puro de score de hábito — modelo "caixa d'água" (Fase 4 / fatia 014).

São testes **puros** (sem banco), rápidos e determinísticos — o equivalente, para hábitos, do
gate puro de recorrência em ``test_kaguya_recurrence.py``. Rodam SEMPRE (não dependem de
``DATABASE_URL``) e são o gate do princípio anti-streak: a consistência de um hábito com bom
histórico **não desaba** por causa de uma falha isolada.

Como rodar:
    pytest tests/agents/test_kaguya_habit_strength.py -v
"""

from datetime import date, timedelta

from agents.kaguya import habit_strength as H

# Data de referência fixa para os testes serem determinísticos.
HOJE = date(2026, 6, 12)


# ──────────────────────────────────────────────────────────────────────────────
# Helpers de construção de histórico (conjuntos de datas cumpridas)
# ──────────────────────────────────────────────────────────────────────────────
def _ultimos_dias(n: int, *, ate: date = HOJE) -> set:
    """Monta um histórico de ``n`` dias seguidos cumpridos, terminando em ``ate``.

    Args:
        n: Quantidade de dias consecutivos cumpridos.
        ate: Último dia da sequência (inclusive).

    Returns:
        Conjunto de ``n`` datas consecutivas.
    """
    return {ate - timedelta(days=i) for i in range(n)}


def _por_semana(weekdays: tuple, *, semanas: int = 9, ate: date = HOJE) -> set:
    """Monta um histórico cumprindo certos dias da semana ao longo de ``semanas`` semanas.

    Args:
        weekdays: Dias da semana cumpridos (0=seg … 6=dom).
        semanas: Quantas semanas para trás cobrir.
        ate: Último dia considerado.

    Returns:
        Conjunto das datas cumpridas no padrão pedido.
    """
    feitas = set()
    d = ate - timedelta(days=semanas * 7)
    while d <= ate:
        if d.weekday() in weekdays:
            feitas.add(d)
        d += timedelta(days=1)
    return feitas


# ──────────────────────────────────────────────────────────────────────────────
# expected_level — a régua que reescala o score pela meta
# ──────────────────────────────────────────────────────────────────────────────
def test_nivel_esperado_diario_e_um():
    """Hábito diário (7x/semana) espera nível 1.0 (todo dia)."""
    assert H.expected_level(7) == 1.0


def test_nivel_esperado_tres_por_semana():
    """3x/semana espera ~0.43 (3 dias cheios, 4 vazios na média)."""
    assert round(H.expected_level(3), 2) == 0.43


def test_nivel_esperado_nao_passa_de_um():
    """Meta absurda (>7x/semana) satura em 1.0 — não dá para esperar mais que todo dia."""
    assert H.expected_level(10) == 1.0


# ──────────────────────────────────────────────────────────────────────────────
# met_target — sim/não vs mensurável (inalterado)
# ──────────────────────────────────────────────────────────────────────────────
def test_met_target_sim_nao_basta_existir():
    """Hábito sim/não (sem meta): qualquer check-in conta como cumprido."""
    assert H.met_target(None, None) is True


def test_met_target_mensuravel():
    """Mensurável: valor >= meta conta; abaixo, não."""
    assert H.met_target(25, 20) is True
    assert H.met_target(20, 20) is True
    assert H.met_target(15, 20) is False
    assert H.met_target(None, 20) is False


# ──────────────────────────────────────────────────────────────────────────────
# Consistência — a tabela de referência (§4)
# ──────────────────────────────────────────────────────────────────────────────
def test_sem_checkins_consistencia_zero():
    """Hábito sem nenhum check-in tem consistência 0 e tendência estável."""
    s = H.summary(set(), 7, today=HOJE)
    assert s["consistency"] == 0
    assert s["trend"] == "flat"


def test_cumprir_a_meta_da_cem():
    """Cumprir exatamente a meta (3 de 3 num 3x/semana) chega a ~100 — igual a 7 de 7 diário."""
    feitas = _por_semana((0, 2, 4), ate=HOJE)   # seg/qua/sex = 3x/semana
    assert H.summary(feitas, 3, today=HOJE)["consistency"] >= 95


def test_diario_perfeito_da_cem():
    """Hábito diário cumprido todo dia chega a ~100."""
    assert H.summary(_ultimos_dias(64), 7, today=HOJE)["consistency"] >= 95


def test_abaixo_da_meta_afrouxa_o_score():
    """Fazer 2x/semana num hábito de meta 3x deixa a consistência mais baixa (~67), não zero."""
    feitas = _por_semana((0, 2), ate=HOJE)      # só seg/qua = 2x/semana
    cons = H.summary(feitas, 3, today=HOJE)["consistency"]
    assert 55 <= cons <= 75


# ──────────────────────────────────────────────────────────────────────────────
# SC-006 — falha isolada NÃO derruba a consistência (anti-streak)
# ──────────────────────────────────────────────────────────────────────────────
def test_sc006_falha_isolada_quase_nao_mexe():
    """SC-006: um hábito diário consistente que falha UM dia mantém a consistência quase intacta.

    É o oposto da ofensiva (que zeraria). Com peso 0.1, o dia de hoje vale só 10% da nota.
    """
    cheio = _ultimos_dias(60)                       # 60 dias seguidos cumpridos
    com_falha = set(cheio)
    com_falha.discard(HOJE)                          # falhou só hoje

    cons_cheio = H.summary(cheio, 7, today=HOJE)["consistency"]
    cons_falha = H.summary(com_falha, 7, today=HOJE)["consistency"]

    assert cons_falha >= 85                           # continua altíssima
    assert cons_cheio - cons_falha <= 12              # a falha tira pouco (≤ ~peso)


# ──────────────────────────────────────────────────────────────────────────────
# Tendência — média rápida vs lenta
# ──────────────────────────────────────────────────────────────────────────────
def test_tendencia_subindo():
    """Começar a cumprir agora (após um vazio) deixa a tendência subindo."""
    feitas = _ultimos_dias(8)                        # só os últimos 8 dias
    assert H.summary(feitas, 7, today=HOJE)["trend"] == "up"


def test_tendencia_caindo():
    """Parar de cumprir (histórico antigo, nada recente) deixa a tendência caindo."""
    # Cumpriu de 60 a 25 dias atrás, depois parou.
    feitas = {HOJE - timedelta(days=i) for i in range(25, 60)}
    assert H.summary(feitas, 7, today=HOJE)["trend"] == "down"


def test_tendencia_estavel():
    """Padrão constante (todo dia, sempre) mantém a tendência estável."""
    assert H.summary(_ultimos_dias(64), 7, today=HOJE)["trend"] == "flat"


# ──────────────────────────────────────────────────────────────────────────────
# Recente — o dado cru das últimas 2 semanas
# ──────────────────────────────────────────────────────────────────────────────
def test_recente_conta_ultimos_14_dias():
    """O 'recente' conta os cumprimentos dos últimos 14 dias; o total é meta*2."""
    feitas = _por_semana((0, 2, 4), ate=HOJE)        # 3x/semana
    s = H.summary(feitas, 3, today=HOJE)
    assert s["recent_total"] == 6                    # 3 * 2 semanas
    assert 5 <= s["recent_done"] <= 6                # ~6 cumprimentos em 2 semanas
