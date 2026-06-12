"""Testes do motor puro de força do hábito (Fase 4 / fatia 014).

São testes **puros** (sem banco), rápidos e determinísticos — o equivalente, para hábitos, do
gate puro de recorrência em ``test_kaguya_recurrence.py``. Rodam SEMPRE (não dependem de
``DATABASE_URL``) e são o **gate automatizado do SC-006**: a força de um hábito com boa
aderência permanece acima de zero depois de uma falha isolada (anti-streak).

Como rodar:
    pytest tests/agents/test_kaguya_habit_strength.py -v
"""

from datetime import date, timedelta

from agents.kaguya import habit_strength as H


# ──────────────────────────────────────────────────────────────────────────────
# Helpers de construção de histórico (mapas data -> cumpriu)
# ──────────────────────────────────────────────────────────────────────────────
def _streak(start: date, n: int, *, done: bool = True) -> dict:
    """Monta um histórico de ``n`` dias seguidos a partir de ``start``, todos com o mesmo estado.

    Args:
        start: Primeiro dia da sequência.
        n: Quantidade de dias.
        done: Estado (cumprido/não) de cada dia.

    Returns:
        Mapa ``{data: done}`` com ``n`` dias consecutivos.
    """
    return {start + timedelta(days=i): done for i in range(n)}


ANCORA = date(2026, 6, 1)


# ──────────────────────────────────────────────────────────────────────────────
# Multiplicador diário (a "memória" da EMA)
# ──────────────────────────────────────────────────────────────────────────────
def test_multiplicador_habito_diario():
    """Hábito diário (freq=1) → multiplicador conhecido ~0.948 (valor da fórmula Loop)."""
    assert round(H.daily_multiplier(1, 1), 3) == 0.948


def test_multiplicador_cinco_por_semana():
    """5x/semana (freq≈0.714) → multiplicador ~0.956."""
    assert round(H.daily_multiplier(5, 7), 3) == 0.956


def test_habito_menos_frequente_decai_mais_devagar():
    """Frequência menor → multiplicador maior (mais perdão): 2x/sem perdoa mais que diário."""
    # Quanto maior o multiplicador, mais devagar a força muda — logo, mais tolerante a falhas.
    assert H.daily_multiplier(2, 7) > H.daily_multiplier(1, 1)


# ──────────────────────────────────────────────────────────────────────────────
# met_target — sim/não vs mensurável
# ──────────────────────────────────────────────────────────────────────────────
def test_met_target_sim_nao_basta_existir():
    """Hábito sim/não (sem meta): qualquer check-in conta como cumprido."""
    assert H.met_target(None, None) is True


def test_met_target_mensuravel_alcanca_meta():
    """Mensurável: valor >= meta conta como cumprido (AC2: ler 25, meta 20)."""
    assert H.met_target(25, 20) is True
    assert H.met_target(20, 20) is True   # alcançar exatamente a meta conta


def test_met_target_mensuravel_abaixo_da_meta():
    """Mensurável: valor abaixo da meta NÃO conta como cumprido."""
    assert H.met_target(15, 20) is False
    assert H.met_target(None, 20) is False  # sem valor num hábito com meta → não cumpriu


# ──────────────────────────────────────────────────────────────────────────────
# Força — comportamento da EMA
# ──────────────────────────────────────────────────────────────────────────────
def test_sem_checkins_forca_zero():
    """Hábito sem nenhum check-in tem força exatamente zero."""
    assert H.strength({}, 1, 1) == 0.0


def test_forca_cresce_com_a_consistencia():
    """Mais dias seguidos cumpridos → força maior (a consistência constrói força)."""
    curta = H.strength(_streak(ANCORA, 5), 1, 1, until=ANCORA + timedelta(days=4))
    longa = H.strength(_streak(ANCORA, 60), 1, 1, until=ANCORA + timedelta(days=59))
    assert longa > curta > 0.0


def test_forca_se_aproxima_de_um_com_muita_consistencia():
    """Cumprir todo dia por muito tempo aproxima a força de 1.0 (teto da EMA)."""
    forca = H.strength(_streak(ANCORA, 365), 1, 1, until=ANCORA + timedelta(days=364))
    assert forca > 0.95


def test_abandono_decai_a_forca_para_perto_de_zero():
    """Construir força e depois parar por muito tempo derruba a força para perto de zero."""
    # 30 dias cumpridos, depois 200 dias parados (sem check-ins nesse intervalo).
    hist = _streak(ANCORA, 30)
    fim = ANCORA + timedelta(days=30 + 200)
    forca = H.strength(hist, 1, 1, until=fim)
    assert forca < 0.05   # quase zerou — mas por abandono prolongado, não por um dia ruim


# ──────────────────────────────────────────────────────────────────────────────
# SC-006 — o gate: falha isolada NÃO zera a força (anti-streak)
# ──────────────────────────────────────────────────────────────────────────────
def test_sc006_falha_isolada_nao_zera_a_forca():
    """SC-006: hábito consistente que falha UM dia mantém a força quase intacta e bem > 0.

    Diferencial central versus um streak (que zeraria). Construímos 60 dias de consistência,
    comparamos a força com e sem uma única falha no último dia.
    """
    cheio = _streak(ANCORA, 60)                       # 60 dias, todos cumpridos
    com_falha = dict(cheio)
    com_falha[ANCORA + timedelta(days=59)] = False    # último dia: falhou

    fim = ANCORA + timedelta(days=59)
    forca_cheia = H.strength(cheio, 5, 7, until=fim)
    forca_falha = H.strength(com_falha, 5, 7, until=fim)

    # Não zerou: continua claramente positiva.
    assert forca_falha > 0.3
    # O arranhão é pequeno: a falha tira só uma fração pequena da força acumulada.
    assert forca_cheia - forca_falha < 0.06
    # E, obviamente, falhar deixa a força um pouco menor que não falhar.
    assert forca_falha < forca_cheia


# ──────────────────────────────────────────────────────────────────────────────
# Aderência — leitura recente "cumpridos / meta"
# ──────────────────────────────────────────────────────────────────────────────
def test_aderencia_quatro_de_cinco_da_oitenta_por_cento():
    """AC1: 4 check-ins numa semana num hábito 5x/semana → 80% de aderência."""
    semana = _streak(ANCORA, 4)   # cumpriu seg–qui
    ad = H.adherence(semana, 5, 7, window_days=7, until=ANCORA + timedelta(days=6))
    assert round(ad, 2) == 0.80


def test_aderencia_limitada_a_cem_por_cento():
    """Cumprir mais que a meta na janela não passa de 100% de aderência."""
    semana = _streak(ANCORA, 7)   # cumpriu os 7 dias, mas a meta era só 5
    ad = H.adherence(semana, 5, 7, window_days=7, until=ANCORA + timedelta(days=6))
    assert ad == 1.0


def test_aderencia_sem_historico_e_zero():
    """Sem check-ins, a aderência é zero (não divide por zero)."""
    assert H.adherence({}, 5, 7) == 0.0
