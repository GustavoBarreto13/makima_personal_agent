"""Lista de tools públicas do Yato, para exposição via MCP (mcp_servers/makima).

Extraído de agents/yato/tools.py (mesma fachada usada pelo agent.py e pelo router
REST) — nenhuma lógica nova aqui, só o registro. Usado por
mcp_servers/makima/registry.py (DOMAINS["yato"]).

Exclui variantes `*_on_cursor` (não existem no domínio do Yato — a única escrita
cross-agent, `log_trip_expense`, já expõe só a fachada pública) e o motor puro
`comfort_matrix.recommend`, que não é tool própria — é chamado internamente por
`recommend_comfort_class`.
"""

from agents.yato.tools import (
    # Viagens (US1)
    create_trip, list_trips, get_trip, update_trip, resolve_trip_orphans, delete_trip,
    # Roteiro (US1)
    add_itinerary_item, list_itinerary, update_itinerary_item, delete_itinerary_item,
    # Dossiê de mobilidade (US2)
    get_or_create_mobility_dossier, record_mobility_check, get_mobility_strategy,
    suggest_mobility_apps,
    # Checklist pré-viagem (US3)
    list_checklist, add_checklist_item, set_checklist_item_done,
    regenerate_checklist_from_dossier, delete_checklist_item,
    # Matriz economia × conforto (US4)
    recommend_comfort_class,
    # Orçamento e cross-agent Nami (US5)
    set_trip_budget, get_trip_budget, log_trip_expense, delete_trip_expense,
    get_trip_readiness, list_trip_expenses,
)

TOOLS = [
    create_trip, list_trips, get_trip, update_trip, resolve_trip_orphans, delete_trip,
    add_itinerary_item, list_itinerary, update_itinerary_item, delete_itinerary_item,
    get_or_create_mobility_dossier, record_mobility_check, get_mobility_strategy,
    suggest_mobility_apps,
    list_checklist, add_checklist_item, set_checklist_item_done,
    regenerate_checklist_from_dossier, delete_checklist_item,
    recommend_comfort_class,
    set_trip_budget, get_trip_budget, log_trip_expense, delete_trip_expense,
    get_trip_readiness, list_trip_expenses,
]
