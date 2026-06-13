"""Pacote do agente Akane — cinemateca pessoal (domínio: filmes).

Akane Kurokawa de *Oshi no Ko* gerencia o catálogo pessoal de filmes estilo
Letterboxd: catálogo + diário de sessões + watchlist + metadados TMDB +
ingestão do Letterboxd (RSS + CSV).

Submódulos:
    tools   — camada de lógica única (CRUD, TMDB, agregações, sync helpers)
    agent   — akane_agent (ADK singleton, sem MCP) — Onda 3
"""
