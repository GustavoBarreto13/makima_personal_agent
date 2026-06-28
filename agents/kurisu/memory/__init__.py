"""Memória unificada da Kurisu (spec 028).

Este subpacote contém a lógica de domínio da memória operacional: ler os dados que os
agentes geram no PostgreSQL (somente leitura), renderizá-los em documentos de texto, e
sincronizá-los para um corpus Vertex AI RAG **separado** do corpus da wiki (027).

Módulos:
- `store`: infraestrutura (init Vertex, corpus operacional, conexão PG, GCS).
- `render`: transforma linhas do banco em documentos de memória (resumo vs individual).
- `exporters`: um exporter read-only por domínio (Nami, Kaguya, Violet, ...).
- `sync`: orquestra o ciclo de sincronização (incremental, prune com trava ≤50%).

A busca sobre esse corpus vive em `agents/kurisu/tools.py` (estende `buscar_na_base`).
"""
