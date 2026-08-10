"""Lista de tools públicas da Violet (diário), para exposição via MCP (mcp_servers/makima).

Extraído do conjunto de tools documentado em agents/journal/CLAUDE.md ("Tools
disponíveis") — usado tanto por agents/journal/agent.py (violet_agent) quanto por
mcp_servers/makima/registry.py. A chave do domínio MCP continua "journal" (nome do
pacote), mesma convenção das outras 9 entradas — a identidade "Violet" vive na
personalidade do agente, não no nome do módulo (mesmo padrão já usado pelo provedor de
hábito "violet_diary", que aponta para agents.journal.habit_provider).

Exclui helpers formatados especificamente para telas do webapp (set_dream, list_entries,
list_collection, list_dreams, get_stats, get_available_years) — não documentados como
tools do agente, mesmo padrão de exclusão de funções "webapp-only" usado em
Frieren/Akane/Mai.
"""

from agents.journal.tools import (
    get_or_create_page,
    upsert_bullet,
    delete_bullet,
    list_heatmap,
    list_mentions,
    get_bullets_by_mention,
    search_bullets,
    list_emotions,
    create_emotion,
    list_emotion_logs,
    create_emotion_log,
    update_emotion_log,
    delete_emotion_log,
    get_emotion_stats,
    set_favorite,
    list_favorite_days,
    list_letters,
    create_letter,
    update_letter,
    seal_letter,
    delete_letter,
)

TOOLS = [
    get_or_create_page,
    upsert_bullet,
    delete_bullet,
    list_heatmap,
    list_mentions,
    get_bullets_by_mention,
    search_bullets,
    list_emotions,
    create_emotion,
    list_emotion_logs,
    create_emotion_log,
    update_emotion_log,
    delete_emotion_log,
    get_emotion_stats,
    set_favorite,
    list_favorite_days,
    list_letters,
    create_letter,
    update_letter,
    seal_letter,
    delete_letter,
]
