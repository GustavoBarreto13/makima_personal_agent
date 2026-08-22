"""Dossiê de mobilidade + protocolo de 7 passos + estratégia consolidada.

Camada de lógica do diferencial do Yato: o dossiê é global por cidade
(`mobility_dossiers`, chave `city` + `state_uf`), reaproveitado entre viagens.
Cada um dos 7 passos do protocolo (`mobility_checks`) carrega um veredito
(`confirmado` | `ausente` | `inconclusivo` | `pendente`) — a honestidade
epistêmica do agente vive aqui: ausência de dado é SEMPRE `inconclusivo`,
nunca `ausente` (FR-010/FR-011). O agente nunca declara veredito sozinho —
quem chama `record_mobility_check` já decidiu, a partir da resposta do
usuário ao passo conduzido.

Usage:
    from agents.yato.tools_mobility import get_or_create_mobility_dossier
    result = get_or_create_mobility_dossier("Tiradentes", "MG")
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from agents.db import run_select, run_dml

# ─── Constantes do protocolo ────────────────────────────────────────────────

# Ordem fixa dos 7 passos do protocolo (research.md) — sempre devolvidos
# nessa ordem, independente da ordem de gravação no banco.
CHECK_KEYS = [
    "porte_cidade",
    "uber",
    "99",
    "indrive",
    "transporte_publico",
    "hospedagem_transfer",
    "deslocamentos",
]

# Vereditos que o CLIENTE pode gravar via record_mobility_check — 'pendente'
# é só o estado inicial do seed, nunca setado explicitamente por quem chama.
_VALID_VERDICTS = {"confirmado", "ausente", "inconclusivo"}

# Dossiê é considerado desatualizado acima de 180 dias sem nenhum check
# revisado (FR-013).
_STALE_DAYS = 180

# Mapa UF → macro-região (IBGE), usado para casar apps de cobertura regional
# (coverage_scope='regiao') com a UF do destino em suggest_mobility_apps.
_REGION_BY_UF = {
    "AC": "Norte", "AP": "Norte", "AM": "Norte", "PA": "Norte",
    "RO": "Norte", "RR": "Norte", "TO": "Norte",
    "AL": "Nordeste", "BA": "Nordeste", "CE": "Nordeste", "MA": "Nordeste",
    "PB": "Nordeste", "PE": "Nordeste", "PI": "Nordeste", "RN": "Nordeste",
    "SE": "Nordeste",
    "DF": "Centro-Oeste", "GO": "Centro-Oeste", "MT": "Centro-Oeste", "MS": "Centro-Oeste",
    "ES": "Sudeste", "MG": "Sudeste", "RJ": "Sudeste", "SP": "Sudeste",
    "PR": "Sul", "RS": "Sul", "SC": "Sul",
}


def _ok(**kwargs) -> dict:
    return {"status": "ok", **kwargs}


def _err(message: str) -> dict:
    return {"status": "error", "message": message}


def _list_checks(dossier_id: str) -> list[dict]:
    """Devolve os 7 checks do dossiê, sempre na ordem canônica de CHECK_KEYS."""
    rows = run_select(
        "SELECT * FROM mobility_checks WHERE dossier_id = %s", (dossier_id,)
    )
    by_key = {r["check_key"]: r for r in rows}

    out = []
    for key in CHECK_KEYS:
        r = by_key.get(key)
        if not r:
            out.append({
                "check_key": key, "verdict": "pendente",
                "source": None, "evidence": None, "checked_at": None,
            })
        else:
            out.append({
                "check_key": key,
                "verdict": r["verdict"],
                "source": r.get("source"),
                "evidence": r.get("evidence"),
                "checked_at": r["checked_at"].isoformat() if r.get("checked_at") else None,
            })
    return out


def _is_stale(last_checked_at) -> bool:
    """True quando last_checked_at existe e tem mais de 180 dias (FR-013)."""
    if not last_checked_at:
        return False
    now = datetime.now(timezone.utc)
    return (now - last_checked_at).days > _STALE_DAYS


def get_or_create_mobility_dossier(city: str, state_uf: str) -> dict:
    """Busca (ou cria) o dossiê de mobilidade de uma cidade.

    Cria o dossiê e semeia os 7 checks como `pendente` se ainda não existir —
    nunca pula direto para um veredito (FR-007). Se `state_uf` vier vazio,
    recusa e pede a UF (Edge Cases: cidades homônimas — o dossiê é chaveado
    por cidade + UF).

    Args:
        city: Cidade de destino.
        state_uf: UF (2 letras) — obrigatória para desambiguar homônimos.

    Returns:
        dict com status='ok', 'dossier' (com 'stale': bool) e 'checks'
        (lista dos 7 passos, na ordem canônica).
    """
    if not city or not city.strip():
        return _err("Informe a cidade do dossiê.")
    if not state_uf or not state_uf.strip():
        return _err(
            "Informe a UF (2 letras) do destino — necessário para não confundir "
            "cidades homônimas."
        )

    city = city.strip()
    uf = state_uf.strip().upper()
    if len(uf) != 2:
        return _err(f"UF deve ter 2 letras (ex.: MG, RJ). Recebido: '{state_uf}'")

    rows = run_select(
        "SELECT * FROM mobility_dossiers WHERE city = %s AND state_uf = %s",
        (city, uf),
    )
    if rows:
        dossier = rows[0]
    else:
        dossier_id = str(uuid.uuid4())
        run_dml(
            "INSERT INTO mobility_dossiers (id, city, state_uf) VALUES (%s, %s, %s)",
            (dossier_id, city, uf),
        )
        dossier = {
            "id": dossier_id, "city": city, "state_uf": uf,
            "city_size": None, "pedestrian_scale": False,
            "summary": None, "last_checked_at": None,
        }

    # Seed idempotente dos 7 passos — ON CONFLICT DO NOTHING não sobrescreve
    # checks já respondidos em chamadas anteriores.
    for key in CHECK_KEYS:
        run_dml(
            """
            INSERT INTO mobility_checks (id, dossier_id, check_key, verdict)
            VALUES (%s, %s, %s, 'pendente')
            ON CONFLICT (dossier_id, check_key) DO NOTHING
            """,
            (str(uuid.uuid4()), dossier["id"], key),
        )

    checks = _list_checks(dossier["id"])

    dossier_out = {
        "id": dossier["id"],
        "city": dossier["city"],
        "state_uf": dossier["state_uf"],
        "city_size": dossier.get("city_size"),
        "pedestrian_scale": bool(dossier.get("pedestrian_scale") or False),
        "summary": dossier.get("summary"),
        "last_checked_at": (
            dossier["last_checked_at"].isoformat() if dossier.get("last_checked_at") else None
        ),
        "stale": _is_stale(dossier.get("last_checked_at")),
    }

    return _ok(dossier=dossier_out, checks=checks)


def record_mobility_check(
    city: str,
    state_uf: str,
    check_key: str,
    verdict: str,
    source: str,
    evidence: Optional[str] = None,
) -> dict:
    """Grava o veredito de UM passo do protocolo (nunca em lote — FR-009).

    Regra dura (FR-010/FR-011): quem chama esta tool nunca deve passar
    `verdict='ausente'` quando a resposta do usuário só indica ausência de
    dado (ex.: rota de ônibus não aparece no Google Maps) — isso é sempre
    `'inconclusivo'`. `'ausente'` só vale com evidência explícita de
    tentativa e falha (ex.: simulação no app não achou carro).

    Args:
        city: Cidade do dossiê.
        state_uf: UF (2 letras) do dossiê.
        check_key: Um de CHECK_KEYS.
        verdict: confirmado | ausente | inconclusivo.
        source: simulacao_in_app | pagina_oficial | google_maps | moovit |
            contato_hospedagem | relato_local | outro.
        evidence: Texto livre — o que foi observado/relatado.

    Returns:
        dict com status='ok', 'check' (o passo atualizado) e 'dossier_id'.
    """
    if check_key not in CHECK_KEYS:
        return _err(f"Passo inválido: '{check_key}'. Use um de: {', '.join(CHECK_KEYS)}")
    if verdict not in _VALID_VERDICTS:
        return _err(
            f"Veredito inválido: '{verdict}'. Use: {', '.join(sorted(_VALID_VERDICTS))}"
        )

    created = get_or_create_mobility_dossier(city, state_uf)
    if created.get("status") != "ok":
        return created
    dossier_id = created["dossier"]["id"]

    run_dml(
        """
        UPDATE mobility_checks
        SET verdict = %s, source = %s, evidence = %s, checked_at = NOW()
        WHERE dossier_id = %s AND check_key = %s
        """,
        (verdict, source, evidence, dossier_id, check_key),
    )
    run_dml(
        "UPDATE mobility_dossiers SET last_checked_at = NOW(), updated_at = NOW() WHERE id = %s",
        (dossier_id,),
    )

    checks = _list_checks(dossier_id)
    updated_check = next(c for c in checks if c["check_key"] == check_key)
    return _ok(check=updated_check, dossier_id=dossier_id)


def get_mobility_strategy(city: str, state_uf: str) -> dict:
    """Consolida os 7 checks numa estratégia de mobilidade recomendada (FR-012).

    Ordem de decisão: cidade de escala pedonal → transporte público
    confirmado → algum app de corrida confirmado → transfer da hospedagem
    confirmado → fallback para táxi/mototáxi local (quase sempre existe,
    mesmo sem nada mais — research.md).

    Args:
        city: Cidade do dossiê.
        state_uf: UF (2 letras) do dossiê.

    Returns:
        dict com status='ok', 'strategy', 'pending_checks' (check_keys ainda
        `pendente`) e 'rationale'.
    """
    result = get_or_create_mobility_dossier(city, state_uf)
    if result.get("status") != "ok":
        return result

    dossier = result["dossier"]
    checks = {c["check_key"]: c for c in result["checks"]}
    pending = [key for key, c in checks.items() if c["verdict"] == "pendente"]

    if dossier["pedestrian_scale"]:
        strategy = "caminhavel"
        rationale = (
            "Cidade de escala pedonal — mobilidade motorizada não se aplica; "
            "tudo se resolve a pé."
        )
    elif checks["transporte_publico"]["verdict"] == "confirmado":
        strategy = "transporte_publico"
        rationale = "Transporte público confirmado no Google Maps/Moovit — dispensa carro."
    elif any(checks[k]["verdict"] == "confirmado" for k in ("uber", "99", "indrive")):
        apps_ok = [k for k in ("uber", "99", "indrive") if checks[k]["verdict"] == "confirmado"]
        strategy = "app_corrida"
        rationale = f"App(s) de corrida confirmado(s) na simulação: {', '.join(apps_ok)}."
    elif checks["hospedagem_transfer"]["verdict"] == "confirmado":
        strategy = "transfer_hospedagem"
        rationale = (
            "Sem app de corrida nem transporte público confirmados — transfer "
            "combinado com a hospedagem é o caminho mais seguro."
        )
    else:
        strategy = "taxi_mototaxi"
        rationale = (
            "Apps de corrida e transporte público ausentes ou inconclusivos — "
            "recorra a táxi/mototáxi local; apps não são um caminho confiável "
            "nesta cidade."
        )

    return _ok(strategy=strategy, pending_checks=pending, rationale=rationale)


def suggest_mobility_apps(
    state_uf: Optional[str] = None,
    city: Optional[str] = None,
) -> dict:
    """Sugere apps de mobilidade cuja cobertura DECLARADA cobre o destino.

    Nunca é veredito de disponibilidade (FR-014/FR-015) — cada item volta
    rotulado "cobertura declarada — confirmar in-app", inclusive Uber e 99.

    Args:
        state_uf: UF (2 letras) do destino.
        city: Cidade do destino (usado só para apps com coverage_scope='cidades').

    Returns:
        dict com status='ok' e lista 'apps'.
    """
    uf = state_uf.strip().upper() if state_uf else None
    city_norm = city.strip().lower() if city else None
    region = _REGION_BY_UF.get(uf) if uf else None

    rows = run_select("SELECT * FROM mobility_apps ORDER BY kind, name", ())

    out = []
    for r in rows:
        scope = r["coverage_scope"]
        values = r.get("coverage_values") or []
        match = False
        if scope == "nacional":
            match = True
        elif scope == "uf" and uf and uf in values:
            match = True
        elif scope == "regiao" and region and region in values:
            match = True
        elif scope == "cidades" and city_norm and any(city_norm == v.lower() for v in values):
            match = True

        if match:
            out.append({
                "name": r["name"],
                "kind": r["kind"],
                "coverage_scope": scope,
                "url": r.get("url"),
                "label": "cobertura declarada — confirmar in-app",
            })

    return _ok(apps=out)
