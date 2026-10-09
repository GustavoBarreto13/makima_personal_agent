"""Testes da função pura compute_capacity (agents/kaguya/capacity.py).

Puro = sem banco, sem Calendar, sem MCP. Exercita o motor isolado, como a spec
pede em SC-001. Roda com pytest sem nenhum ambiente externo.
"""

import pytest
from agents.kaguya.capacity import compute_capacity, _FREE_WINDOW


# ─── Casos básicos ───────────────────────────────────────────────────────────

def test_sem_nada():
    """Plano vazio e sem eventos: folga = janela inteira."""
    r = compute_capacity([], [])
    assert r["no_plano"] == 0
    assert r["estimado_min"] == 0
    assert r["agenda_min"] == 0
    assert r["livre_min"] == _FREE_WINDOW     # 840 min = 14h (8h–22h)
    assert r["folga_min"] == _FREE_WINDOW
    assert not r["excedeu"]
    assert r["calendar_ok"] is True


def test_estimativas_simples():
    """Tarefas estimadas somam corretamente; None conta como 0."""
    r = compute_capacity([60, 30, None, 45], [])
    assert r["estimado_min"] == 135   # 60 + 30 + 0 + 45
    assert r["no_plano"] == 4
    assert r["folga_min"] == _FREE_WINDOW - 135


def test_estimativa_negativa_ignorada():
    """Estimativa <= 0 deve ser ignorada (não subtrai da folga)."""
    r = compute_capacity([60, 0, -10], [])
    assert r["estimado_min"] == 60


def test_agenda_dentro_da_janela():
    """Evento completamente dentro da janela (8h–22h) conta inteiro."""
    # 9h–10h = 540–600 → 60 min
    r = compute_capacity([], [(540, 600)])
    assert r["agenda_min"] == 60
    assert r["livre_min"] == _FREE_WINDOW - 60


def test_agenda_fora_da_janela_antes():
    """Evento antes das 8h não conta."""
    # 6h–7h = 360–420 — totalmente fora
    r = compute_capacity([], [(360, 420)])
    assert r["agenda_min"] == 0


def test_agenda_fora_da_janela_depois():
    """Evento após as 22h não conta."""
    # 22h–23h = 1320–1380 — totalmente fora
    r = compute_capacity([], [(1320, 1380)])
    assert r["agenda_min"] == 0


def test_agenda_recorte_parcial():
    """Evento que começa antes das 8h mas termina depois: só a parte dentro conta."""
    # 7h–9h = 420–540 → só 8h–9h = 480–540 = 60 min dentro
    r = compute_capacity([], [(420, 540)])
    assert r["agenda_min"] == 60


def test_agenda_recorte_fim():
    """Evento que começa dentro mas termina depois das 22h: recortado no fim."""
    # 21h–23h = 1260–1380 → só 21h–22h = 1260–1320 = 60 min dentro
    r = compute_capacity([], [(1260, 1380)])
    assert r["agenda_min"] == 60


def test_estouro():
    """Plano que excede a janela livre → excedeu=True, folga_min negativo."""
    # Janela livre = 840 min; agenda = 600 min → livre = 240 min; tarefas = 360 min → -120 min
    r = compute_capacity([360], [(480, 1080)])   # agenda: 10h de eventos (480–1080)
    assert r["livre_min"] == _FREE_WINDOW - 600   # 240 min livres
    assert r["excedeu"] is True
    assert r["folga_min"] < 0


def test_livre_nunca_negativo():
    """Mesmo com agenda double-booked, livre_min não fica negativo."""
    # Dois eventos que cobrem 16h dentro da janela de 14h (pode acontecer com sobreposição)
    r = compute_capacity([], [(480, 900), (480, 1320)])  # 7h + 14h dentro = 21h
    assert r["livre_min"] >= 0


def test_calendar_indisponivel():
    """Com calendar_ok=False, agenda_min = 0 e calendar_ok retorna False."""
    r = compute_capacity([60], [(480, 600)], calendar_ok=False)
    assert r["agenda_min"] == 0
    assert r["calendar_ok"] is False
    # Livre = janela toda (sem eventos); folga = livre - estimado
    assert r["livre_min"] == _FREE_WINDOW
    assert r["folga_min"] == _FREE_WINDOW - 60
    # Não quebra (sem exceção), não excede (60 min de tarefa cabe em 840 min)
    assert not r["excedeu"]


def test_janela_personalizada():
    """Janela customizada é respeitada."""
    # Janela 9h–17h = 540–1020 = 480 min
    r = compute_capacity([200], [(600, 660)], janela=(540, 1020))  # evento 10h–11h = 60 min
    assert r["livre_min"] == 480 - 60     # 420 min
    assert r["folga_min"] == 420 - 200    # 220 min
    assert not r["excedeu"]


def test_multiplos_eventos():
    """Vários eventos somam corretamente."""
    # 9h–10h (60) + 14h–15h30 (90) = 150 min
    r = compute_capacity([], [(540, 600), (840, 930)])
    assert r["agenda_min"] == 150
    assert r["livre_min"] == _FREE_WINDOW - 150


# ──────────────────────────────────────────────────────────────────────────────
# Spec 075 — eventos sobrepostos e o modelo de agenda (dois tempos livres)
# ──────────────────────────────────────────────────────────────────────────────
from datetime import date, time  # noqa: E402

from agents.kaguya.capacity import (  # noqa: E402
    compute_free_time, merge_intervals, resolve_day_schedule,
)

PREFS = {
    "work_days": [1, 2, 3, 4, 5],
    "work_start": time(9, 0), "work_end": time(18, 0),
    "lunch_start": time(12, 0), "lunch_end": time(13, 0), "lunch_is_free": False,
    "wake_time": time(7, 0), "sleep_time": time(23, 0),
}
SEG = date(2026, 6, 1)    # segunda
SAB = date(2026, 6, 6)    # sábado


def test_merge_intervals_funde_sobrepostos_e_encostados():
    assert merge_intervals([(540, 600), (570, 660), (900, 930), (660, 700)]) == [(540, 700), (900, 930)]
    assert merge_intervals([(10, 10), (30, 20)]) == []   # vazios/invertidos são ignorados


def test_eventos_sobrepostos_nao_contam_em_dobro():
    r = compute_capacity([], [(600, 720), (660, 780)])   # 10h–12h e 11h–13h → 10h–13h = 180
    assert r["agenda_min"] == 180


def test_dia_util_vs_fim_de_semana():
    assert resolve_day_schedule(PREFS, SEG)["works"] is True
    assert resolve_day_schedule(PREFS, SAB)["works"] is False
    assert resolve_day_schedule(PREFS, SAB)["work"] is None


def test_override_trabalha_no_sabado_e_folga_no_dia_util():
    sab = resolve_day_schedule(PREFS, SAB, {"works": True, "work_start": None, "work_end": None})
    assert sab["works"] is True and sab["work"] == (540, 1080)          # horário padrão
    custom = resolve_day_schedule(PREFS, SAB, {"works": True, "work_start": time(8), "work_end": time(12)})
    assert custom["work"] == (480, 720) and custom["lunch"] is None     # almoço fora do expediente
    folga = resolve_day_schedule(PREFS, SEG, {"works": False, "work_start": None, "work_end": None})
    assert folga["works"] is False and folga["work"] is None


def test_dois_tempos_livres_dia_util_almoco_descontado():
    sched = resolve_day_schedule(PREFS, SEG)
    r = compute_free_time(sched, eventos=[(600, 660)], estimado_work_min=120, estimado_personal_min=30)
    # trabalho: 9–18 (540) − almoço 60 − reunião 60 = 420
    assert r["work"]["livre_min"] == 420 and r["work"]["folga_min"] == 300
    # geral: 7–23 (960) − expediente 540 = 420 (o almoço não é contado duas vezes)
    assert r["general"]["livre_min"] == 420 and r["general"]["folga_min"] == 390
    assert r["total"]["livre_min"] == 840


def test_almoco_livre_entra_no_tempo_do_trabalho():
    sched = resolve_day_schedule({**PREFS, "lunch_is_free": True}, SEG)
    r = compute_free_time(sched, eventos=[])
    assert r["work"]["livre_min"] == 540 and r["general"]["livre_min"] == 420


def test_fim_de_semana_sem_trabalho_e_tudo_geral():
    r = compute_free_time(resolve_day_schedule(PREFS, SAB), eventos=[])
    assert r["work"]["livre_min"] == 0 and r["general"]["livre_min"] == 960


def test_dorme_depois_da_meia_noite():
    sched = resolve_day_schedule({**PREFS, "sleep_time": time(1, 0)}, SAB)
    assert sched["awake"] == (420, 1500)   # 07:00 → 01:00 do dia seguinte
    assert compute_free_time(sched, eventos=[])["general"]["livre_min"] == 1080


def test_compromisso_pessoal_no_expediente_rouba_tempo_do_trabalho():
    sched = resolve_day_schedule(PREFS, SEG)
    r = compute_free_time(sched, eventos=[(900, 960)])   # 15h–16h (ex.: dentista)
    assert r["work"]["livre_min"] == 540 - 60 - 60


def test_a_partir_de_conta_so_o_que_resta_do_dia():
    sched = resolve_day_schedule(PREFS, SEG)
    r = compute_free_time(sched, eventos=[], a_partir_de=15 * 60)
    assert r["work"]["livre_min"] == 180 and r["general"]["livre_min"] == 5 * 60   # 18–23h


def test_estouro_e_calendario_fora_do_ar():
    sched = resolve_day_schedule(PREFS, SEG)
    assert compute_free_time(sched, [], estimado_work_min=9999)["work"]["excedeu"] is True
    r = compute_free_time(sched, [(600, 660)], calendar_ok=False)
    assert r["work"]["busy_min"] == 0 and r["calendar_ok"] is False
