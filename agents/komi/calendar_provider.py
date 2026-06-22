"""Provedor de calendário para o agente Komi (Pessoas).

Fornece eventos de datas importantes de pessoas no formato CalendarItem
esperado pelo calendar_hub. Suporta dois tipos de data:

  - recurring = TRUE: a data repete todo ano (ex.: aniversário, casamento).
    A ocorrência é projetada para o(s) ano(s) dentro da janela solicitada.
    Trata o caso especial de 29/fev: anos não bissextos simplesmente pulam.

  - recurring = FALSE: data única (ex.: formatura). Só aparece se a data
    cair dentro da janela (sem projeção anual).

Usage:
    >>> from agents.komi.calendar_provider import list_calendar_events
    >>> itens = list_calendar_events("2026-06-01", "2026-06-30")
    >>> itens[0]["title"]
    '🎂 aniversário — João'
"""

from __future__ import annotations

import datetime

from agents.db import run_select

# Metadados desta fonte de calendário — espelhado no calendar_hub.py
SOURCE = {
    "id": "komi",
    "account": "makima",
    "kind": "base",
    "name": "Komi · Pessoas",
    "color": "oklch(0.70 0.13 150)",  # verde suave — cuidado e proximidade
}


def list_calendar_events(start: str, end: str) -> list[dict]:
    """Retorna itens de calendário de datas importantes de pessoas no intervalo.

    Para datas recorrentes (aniversários etc.), projeta a ocorrência para
    cada ano dentro da janela — essencial para janelas que cruzam dez→jan.
    Para datas únicas, inclui somente se a data original cair na janela.

    Args:
        start: Data inicial no formato YYYY-MM-DD (inclusivo).
        end: Data final no formato YYYY-MM-DD (inclusivo).

    Returns:
        Lista de dicionários CalendarItem com campos: cal, date, all_day,
        title, kind, ref_id, deep_link, color, start, end, loc.

    Example:
        >>> list_calendar_events("2026-06-01", "2026-06-30")
        [{"cal": "komi", "date": "2026-06-14", "all_day": True, "kind": "person-date", ...}]
    """
    # Converte as strings de início e fim para objetos datetime.date
    # (necessário para comparações e para a expansão de recorrência anual)
    start_date = datetime.date.fromisoformat(start)
    end_date = datetime.date.fromisoformat(end)

    # Busca TODAS as datas importantes de pessoas vivas do banco.
    # Não filtramos por data no SQL porque datas recorrentes precisam do
    # mês/dia original para serem projetadas no ano correto — se filtrássemos
    # por date BETWEEN ... perderíamos aniversários de anos anteriores que
    # caem dentro da janela atual.
    sql = """
    SELECT
        pd.id,
        pd.label,
        pd.date,
        pd.recurring,
        p.name,
        p.id AS person_id
    FROM person_dates pd
    JOIN people p ON p.id = pd.person_id AND p.deleted = FALSE
    ORDER BY pd.date
    """
    rows = run_select(sql, {})

    items = []
    for row in rows:
        # psycopg2 retorna DATE como objeto datetime.date
        # Caso venha como string (ambiente de testes), converte também
        stored_date = (
            row["date"]
            if isinstance(row["date"], datetime.date)
            else datetime.date.fromisoformat(str(row["date"]))
        )

        if row["recurring"]:
            # ── Data recorrente (aniversário, casamento, etc.) ────────────────
            # Projeta a data para cada ano dentro da janela [start_date, end_date].
            # A janela mensal do calendário pode cruzar anos (ex.: dez→jan),
            # então verificamos start.year E end.year.
            for year in range(start_date.year, end_date.year + 1):
                try:
                    # Monta a ocorrência no ano corrente mantendo mês/dia originais.
                    # ValueError é lançado para 29/fev em anos não bissextos —
                    # nesse caso simplesmente pulamos esse ano.
                    occurrence = stored_date.replace(year=year)
                except ValueError:
                    # 29/fev em ano não bissexto — pular silenciosamente
                    continue

                # Inclui somente se a ocorrência projetada cai dentro da janela
                if start_date <= occurrence <= end_date:
                    items.append(
                        _make_item(row, occurrence.isoformat())
                    )
        else:
            # ── Data única (formatura, viagem, etc.) ─────────────────────────
            # Inclui somente se a data original cair dentro da janela
            if start_date <= stored_date <= end_date:
                date_str = (
                    stored_date.isoformat()
                    if hasattr(stored_date, "isoformat")
                    else str(stored_date)
                )
                items.append(_make_item(row, date_str))

    # Ordena os resultados por data para facilitar a exibição no grid
    items.sort(key=lambda x: x["date"])
    return items


def _make_item(row: dict, date_str: str) -> dict:
    """Constrói um CalendarItem a partir de uma linha de person_dates.

    Usa emoji diferente para aniversários (🎂) e outras datas (📅).
    O label (ex.: 'aniversário', 'casamento') é mantido no título para
    facilitar a identificação rápida no grid do calendário.

    Args:
        row: Linha do banco com campos id, label, name, person_id.
        date_str: Data da ocorrência no formato YYYY-MM-DD (já calculada).

    Returns:
        Dicionário CalendarItem pronto para o calendar_hub.
    """
    label = row["label"]
    name = row["name"]

    # Escolhe o emoji com base no label: 🎂 para aniversários, 📅 para o resto.
    # Verifica se a palavra "anivers" aparece no label (cobre "aniversário",
    # "aniversario" sem acento, "aniversário de namoro", etc.)
    if "anivers" in label.lower():
        emoji = "🎂"
    else:
        emoji = "📅"

    # Formato: "🎂 aniversário — João" ou "📅 formatura — Ana"
    title = f"{emoji} {label} — {name}"

    return {
        "cal": "komi",
        "date": date_str,
        "start": None,   # all-day — data importante não tem horário específico
        "end": None,
        "all_day": True,
        "title": title,
        "kind": "person-date",
        "ref_id": row["id"],           # ID da person_date (não da pessoa)
        "deep_link": "/people",        # rota do shell Komi no frontend
        "color": None,                 # usa a cor verde padrão da fonte
        "loc": name,                   # nome da pessoa como detalhe adicional
    }
