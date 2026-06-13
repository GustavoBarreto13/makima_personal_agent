"""Pacote do agente Marin — cinemateca pessoal de animes (domínio: animes).

Marin Kitagawa de *Sua Conduta Foi Adorável / My Dress-Up Darling* gerencia o
catálogo pessoal de animes estilo MyAnimeList: catálogo + diário de sessões de
episódios + cache de metadados de episódios + sync OAuth com o MAL.

Submódulos:
    tools       — camada de lógica única (CRUD, agregações, busca)
    metadata    — enriquecimento via Jikan (MAL), AniList e TMDB
    mal_auth    — fluxo PKCE OAuth com o MyAnimeList
    mal_sync    — sync delta da lista do usuário no MAL → PostgreSQL
    agent       — marin_agent (ADK singleton, sem MCP) — fatia 021
"""
