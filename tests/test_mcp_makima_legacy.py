"""Testes da ponte legada (mcp_servers/makima/legacy.py — spec 064 Etapa E2).

Só cobre registro/schema da tool (sem chamar o modelo Gemini de verdade — isso exige
GEMINI_API_KEY válida e rede, fora do escopo de um teste unitário). O comportamento de
consumo de eventos em si já é coberto por tests/test_runner_utils.py.
"""

import os

os.environ.setdefault("GEMINI_API_KEY", "dummy-for-import-only")

import mcp_servers.makima.legacy as legacy


def test_legacy_domain_agents_excludes_migrated_domains():
    # Nami e Kaguya já têm servidor MCP nativo (Etapa E1) — não devem reaparecer na
    # ponte legada, senão o mesmo domínio responderia por dois caminhos diferentes.
    agent_names = {agent.name for agent in legacy._LEGACY_DOMAIN_AGENTS}
    assert "nami_agent" not in agent_names
    assert "kaguya_agent" not in agent_names


def test_legacy_tool_registered_with_expected_signature():
    # FastMCP guarda as tools registradas no ToolManager interno — inspeciona direto em
    # vez de subir um servidor HTTP só para checar o nome (já coberto pelo teste de
    # integração manual da quickstart E2).
    registered = legacy.mcp._tool_manager._tools
    assert "perguntar_makima_legado" in registered

    tool = registered["perguntar_makima_legado"]
    assert set(tool.parameters["properties"].keys()) == {"mensagem", "chat_id"}
