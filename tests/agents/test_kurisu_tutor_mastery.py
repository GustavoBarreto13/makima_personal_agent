"""Testes do motor puro do Tutor de Idiomas — maestria por conceito, CEFR e foco (spec 031).

Testes **puros** (sem banco, sem rede) — o mesmo padrão de
``tests/agents/test_kaguya_habit_strength.py``. Rodam sempre, são o gate de
``agents/kurisu/tutor_mastery.py`` antes de qualquer user story usar o motor.

Como rodar:
    pytest tests/agents/test_kurisu_tutor_mastery.py -v
"""

from agents.kurisu import tutor_mastery as M


# ──────────────────────────────────────────────────────────────────────────────
# mastery — EMA sobe com acertos, cai suave com erros
# ──────────────────────────────────────────────────────────────────────────────
def test_mastery_sem_sinais_e_zero():
    """Conceito nunca visto: maestria zero."""
    assert M.mastery([]) == 0.0


def test_mastery_sobe_com_acertos_consecutivos():
    """Uma sequência de acertos aproxima a maestria de 1.0."""
    m1 = M.mastery([True])
    m2 = M.mastery([True, True])
    m3 = M.mastery([True, True, True, True, True, True])
    assert 0 < m1 < m2 < m3 < 1.0


def test_mastery_cai_suave_com_um_erro_isolado():
    """Um erro isolado depois de um bom histórico derruba pouco, não zera."""
    bom_historico = M.mastery([True] * 6)
    com_um_erro = M.mastery([True] * 6 + [False])
    # Cai, mas não desaba: continua bem acima da metade do valor anterior.
    assert com_um_erro < bom_historico
    assert com_um_erro > bom_historico * 0.5


def test_mastery_sobe_apos_serie_de_erros_seguida_de_acertos():
    """Histórico ruim seguido de acertos recentes puxa a maestria para cima."""
    m = M.mastery([False] * 5 + [True] * 5)
    assert m > 0.5


# ──────────────────────────────────────────────────────────────────────────────
# trend — up/down/flat, oculta (None) com poucos sinais
# ──────────────────────────────────────────────────────────────────────────────
def test_trend_none_com_menos_de_3_sinais():
    """Menos de 3 sinais: tendência não é confiável (selo 'poucos dados' na UI)."""
    assert M.trend([]) is None
    assert M.trend([True]) is None
    assert M.trend([True, False]) is None


def test_trend_up_quando_melhora_recente():
    """Erros antigos seguidos de acertos recentes → tendência de alta."""
    assert M.trend([False, False, False, True, True, True]) == "up"


def test_trend_down_quando_piora_recente():
    """Acertos antigos seguidos de erros recentes → tendência de queda."""
    assert M.trend([True, True, True, False, False, False]) == "down"


def test_trend_flat_quando_estavel():
    """Série sem variação clara entre rápida e lenta → estável."""
    assert M.trend([True, False, True, False, True, False]) == "flat"


# ──────────────────────────────────────────────────────────────────────────────
# summarize — o dict que a UI consome
# ──────────────────────────────────────────────────────────────────────────────
def test_summarize_campos_basicos():
    """Com exatamente 3 sinais (o limiar mínimo), a tendência já é calculada (não None)."""
    resumo = M.summarize([True, True, False])
    assert resumo["samples"] == 3
    assert resumo["correct"] == 2
    assert 0 <= resumo["mastery_pct"] <= 100
    assert resumo["trend"] in ("up", "down", "flat")


# ──────────────────────────────────────────────────────────────────────────────
# estimate_cefr — faixas de nota → CEFR + selo de preliminaridade
# ──────────────────────────────────────────────────────────────────────────────
def test_cefr_sem_notas_e_none_preliminar():
    resultado = M.estimate_cefr([])
    assert resultado == {"level": None, "preliminary": True}


def test_cefr_faixas_por_media():
    assert M.estimate_cefr([10, 20, 30])["level"] == "A1"
    assert M.estimate_cefr([45, 45])["level"] == "A2"
    assert M.estimate_cefr([60, 65, 70])["level"] == "B1"
    assert M.estimate_cefr([75, 80])["level"] == "B2"
    assert M.estimate_cefr([88, 90])["level"] == "C1"
    assert M.estimate_cefr([95, 98])["level"] == "C2"


def test_cefr_preliminar_com_poucas_analises():
    """Menos de 5 análises: marcado como preliminar, mesmo com nível calculado."""
    resultado = M.estimate_cefr([80, 82])
    assert resultado["preliminary"] is True
    assert resultado["level"] == "B2"


def test_cefr_nao_preliminar_com_analises_suficientes():
    resultado = M.estimate_cefr([80, 82, 81, 79, 83])
    assert resultado["preliminary"] is False


# ──────────────────────────────────────────────────────────────────────────────
# pick_next_focus — prioriza alvos do guia, depois menor maestria geral
# ──────────────────────────────────────────────────────────────────────────────
_SKILLS = [
    {"concept_slug": "past-simple", "concept_label": "Passado simples", "mastery_pct": 40, "samples": 5},
    {"concept_slug": "articles", "concept_label": "Artigos", "mastery_pct": 80, "samples": 6},
    {"concept_slug": "prepositions", "concept_label": "Preposições", "mastery_pct": 20, "samples": 4},
    {"concept_slug": "outros", "concept_label": "Outros", "mastery_pct": 10, "samples": 1},  # poucos dados
]


def test_pick_next_focus_sem_skills_e_none():
    assert M.pick_next_focus([]) is None


def test_pick_next_focus_sem_guia_usa_menor_maestria_com_dados():
    """Sem guia ativo: menor maestria entre os que têm >=3 amostras (ignora 'outros' com 1)."""
    escolhido = M.pick_next_focus(_SKILLS, guide_targets=None)
    assert escolhido["concept_slug"] == "prepositions"


def test_pick_next_focus_prioriza_alvo_do_guia():
    """Com guia ativo, prioriza o alvo mesmo que outro conceito tenha maestria menor."""
    escolhido = M.pick_next_focus(_SKILLS, guide_targets=["articles", "past-simple"])
    assert escolhido["concept_slug"] == "past-simple"  # menor entre os 2 alvos (40 < 80)


def test_pick_next_focus_guia_sem_dados_cai_para_geral():
    """Alvo do guia nunca praticado (fora de skills): cai para o comportamento geral."""
    escolhido = M.pick_next_focus(_SKILLS, guide_targets=["present-perfect"])
    assert escolhido["concept_slug"] == "prepositions"
