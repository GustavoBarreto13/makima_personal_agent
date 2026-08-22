"""Testes da função pura recommend (agents/yato/comfort_matrix.py).

Puro = sem banco, sem rede. Casos derivados diretamente dos cenários de aceite
da User Story 4 (spec.md) e da tabela ANTT do research.md (SC-005). Roda com
pytest sem nenhum ambiente externo.
"""

from agents.yato.comfort_matrix import recommend


# ─── Cenário 1 — 11h noturno → semi-leito ou superior ───────────────────────

def test_11h_noturno_recomenda_semi_leito():
    r = recommend(11, night=True)
    assert r["recommended_class"] in ("semi_leito", "leito", "leito_cama")
    assert "exaustão" in r["rationale"] or "exaustao" in r["rationale"]


# ─── Cenário 2 — 3h diurno → convencional, sem empurrar upgrade ─────────────

def test_3h_diurno_convencional_sem_upgrade():
    r = recommend(3, night=False)
    assert r["recommended_class"] == "convencional"


# ─── Cenário 3 — 13h noturno → compara leito-cama com diária de hotel ───────

def test_13h_noturno_compara_leito_cama_com_hotel():
    r = recommend(13, night=True)
    assert r["recommended_class"] == "leito_cama"
    assert "hospedagem" in r["rationale"] or "hotel" in r["rationale"]


# ─── Cenário 4 — perfil economia, sem app de corrida → transfer no topo do ROI ──

def test_sem_app_de_corrida_transfer_no_topo():
    r = recommend(6, night=False, profile="economia", has_ride_app=False)
    assert r["roi_queue"][0] == "transfer_privativo"


def test_com_app_de_corrida_transfer_desce():
    r = recommend(6, night=False, profile="economia", has_ride_app=True)
    assert r["roi_queue"][0] != "transfer_privativo"
    assert "transfer_privativo" in r["roi_queue"]


# ─── Cobertura adicional da matriz de duração ───────────────────────────────

def test_trecho_curto_diurno_convencional():
    assert recommend(2, night=False)["recommended_class"] == "convencional"


def test_trecho_medio_executivo():
    r = recommend(6, night=False)
    assert r["recommended_class"] == "executivo"


def test_trecho_longo_diurno_nao_forca_leito_cama():
    """Acima de 12h SEM ser noturno não aciona a comparação com diária de hotel."""
    r = recommend(14, night=False)
    assert r["recommended_class"] == "leito"


def test_roi_queue_sempre_tem_4_itens_fixos():
    esperado = {"transfer_privativo", "upgrade_hospedagem", "passeio_privativo", "executiva_domestica"}
    r = recommend(5)
    assert set(r["roi_queue"]) == esperado
    assert len(r["roi_queue"]) == 4
