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
