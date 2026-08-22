"""Semeia a tabela mobility_apps do Yato a partir do research.md (fatia 066).

Base de conhecimento regional de apps de mobilidade — cobertura DECLARADA,
nunca veredito (FR-014/FR-015). Idempotente: roda de novo sem duplicar (upsert
por nome).

Usage:
    python -m scripts.seed_mobility_apps
"""

import os
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agents.db import run_select, run_dml  # noqa: E402

# (name, kind, coverage_scope, coverage_values, url, notes, source_updated_at)
# Fonte: specs/066-travel-agent/research.md — Pesquisa 2, seção (a) e tabela de
# apps regionais da Pesquisa 1. Números de cobertura são estimativas voláteis
# (o próprio research alerta para isso) — nunca tratar como veredito.
_APPS = [
    (
        "Uber", "app_corrida", "nacional", None,
        "https://www.uber.com/global/en/r/brazil/cities/",
        "Cobre todas as capitais e cidades estratégicas; densidade de frota cai "
        "fora de horário comercial em cidades pequenas. Confirmar sempre via "
        "simulação in-app — a página de cidade é marketing/SEO.",
        "2026-08-20",
    ),
    (
        "99", "app_corrida", "nacional", None,
        "https://99app.com/cidades/",
        "Números divergem por fonte: lista pública cita ~1.093 cidades, a "
        "própria empresa declara atuação em ~3.600 municípios (out/2024). "
        "Confirmar sempre via simulação in-app.",
        "2026-08-20",
    ),
    (
        "InDrive", "app_corrida", "nacional", None,
        None,
        "Presente em ~200 cidades brasileiras (declarado), mirando "
        "explicitamente cidades médias/pequenas que Uber/99 subatendem — "
        "frequentemente a MELHOR aposta de app no interior. Passageiro negocia "
        "o preço.",
        "2026-08-20",
    ),
    (
        "Garupa", "app_corrida", "nacional", None,
        None,
        "700+ cidades, com modalidades Mulher, Pet, Kids — plataforma "
        "Gaudium/Machine.",
        "2026-08-20",
    ),
    (
        "Urbano Norte", "app_corrida", "regiao", ["Norte", "Nordeste", "Centro-Oeste"],
        None,
        "150+ cidades, primariamente Norte/Nordeste/Centro-Oeste. Densidade "
        "regional alta, canal direto de emergência.",
        "2026-08-20",
    ),
    (
        "Ubiz Car", "app_corrida", "uf", ["MG", "PI"],
        None,
        "Especializado em municípios de Minas Gerais e Piauí. Frota "
        "identificada por adesivos, motoristas uniformizados.",
        "2026-08-20",
    ),
    (
        "BibiMob", "app_corrida", "nacional", None,
        None,
        "~80 cidades pequenas, frequentemente via modelo de franquia "
        "municipal. Categoria exclusiva de motoristas femininas.",
        "2026-08-20",
    ),
    (
        "Bora94", "app_corrida", "uf", ["PA"],
        None,
        "Nascido no Pará, forte aderência em ~20 municípios. Comissões "
        "favoráveis aos motoristas — tarifas finais mais econômicas.",
        "2026-08-20",
    ),
    (
        "Chofer 46", "app_corrida", "regiao", ["Sul"],
        None,
        "Concentrado na Região Sul (ex.: Francisco Beltrão, Cascavel, "
        "Joinville). Também executa rotas intermunicipais de longa distância.",
        "2026-08-20",
    ),
    (
        "Urban66", "app_corrida", "uf", ["MT"],
        None,
        "Predominância absoluta em Mato Grosso (ex.: Sinop, Sorriso, Nova "
        "Mutum). Agendamento prévio de corridas, suporte 24h.",
        "2026-08-20",
    ),
    (
        "Rota Pop", "app_corrida", "uf", ["MG"],
        None,
        "Focado na região de Patos de Minas (MG). Botão de pânico nativo, "
        "paradas intermediárias.",
        "2026-08-20",
    ),
    (
        "V1", "app_corrida", "nacional", None,
        None,
        "Roda sobre a mesma plataforma Gaudium/Machine de vários apps "
        "regionais — cobertura específica não detalhada no research.",
        "2026-08-20",
    ),
    (
        "Cittamobi", "transporte_publico", "nacional", None,
        None,
        "Desenvolvimento nacional, parcerias diretas com operadores/prefeituras "
        "em 300+ cidades — dados diretos da telemetria embarcada, alta precisão "
        "em tempo real. Compra de bilhete e recarga pelo app.",
        "2026-08-20",
    ),
    (
        "Moovit", "transporte_publico", "nacional", None,
        None,
        "App de transporte público nº 1 globalmente, mas cobertura limitada no "
        "Brasil (~150 cidades mapeadas) — ausência de rotas não prova ausência "
        "de transporte.",
        "2026-08-20",
    ),
]


def seed() -> None:
    """Insere (ou atualiza) os apps de mobilidade em mobility_apps."""
    for name, kind, coverage_scope, coverage_values, url, notes, source_updated_at in _APPS:
        existing = run_select("SELECT id FROM mobility_apps WHERE name = %s", (name,))
        if existing:
            run_dml(
                """
                UPDATE mobility_apps SET
                    kind = %s, coverage_scope = %s, coverage_values = %s,
                    url = %s, notes = %s, source_updated_at = %s
                WHERE name = %s
                """,
                (kind, coverage_scope, coverage_values, url, notes, source_updated_at, name),
            )
            print(f"  ~ atualizado: {name}")
        else:
            run_dml(
                """
                INSERT INTO mobility_apps (
                    id, name, kind, coverage_scope, coverage_values, url, notes, source_updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (str(uuid.uuid4()), name, kind, coverage_scope, coverage_values, url, notes, source_updated_at),
            )
            print(f"  + inserido: {name}")


if __name__ == "__main__":
    print("Semeando mobility_apps...")
    seed()
    print(f"\nConcluído — {len(_APPS)} apps processados.")
