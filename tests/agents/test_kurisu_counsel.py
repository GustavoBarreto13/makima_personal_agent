"""Testes das partes puras/sem rede do Conselho do Dia (spec 061).

Cobre: guarda de dia vazio, dedup por `uri` na consulta ao RAG, o gate de disparo da
busca web, a normalização server-side de `origem` (base/web) e o round-trip de
serialização — nada aqui abre conexão de rede nem de banco (a criação da tabela ao
importar o módulo já é protegida por try/except, mesmo padrão de
`tests/agents/test_kurisu_tutor_mastery.py`).

Como rodar:
    pytest tests/agents/test_kurisu_counsel.py -v
"""

from datetime import datetime

from agents.kurisu import counsel as C

# Nota: `agents.kurisu.tools` importa `vertexai` no nível do módulo — evitamos importá-lo
# aqui de propósito. `_consultar_rag` (que chama `buscar_na_base`) foi desenhado para
# delegar toda a lógica testável (seleção de queries + dedup) a duas funções PURAS
# (`_selecionar_queries`, `_merge_dedup_trechos`) que não tocam em `agents.kurisu.tools` —
# são elas que testamos abaixo, sem rede, sem mock, sem depender do SDK do Vertex.


# ──────────────────────────────────────────────────────────────────────────────
# _dia_esta_vazio — guarda contra dia sem nada para analisar (US1)
# ──────────────────────────────────────────────────────────────────────────────
def test_dia_vazio_quando_nao_ha_nenhum_sinal():
    dia = {"dream": None, "bullets": [], "emotion_logs": [], "letters": []}
    assert C._dia_esta_vazio(dia) is True


def test_dia_nao_vazio_com_um_bullet():
    dia = {"dream": None, "bullets": [{"kind": "bullet", "content": "oi"}], "emotion_logs": [], "letters": []}
    assert C._dia_esta_vazio(dia) is False


def test_dia_nao_vazio_so_com_sonho():
    dia = {"dream": "sonhei com o mar", "bullets": [], "emotion_logs": [], "letters": []}
    assert C._dia_esta_vazio(dia) is False


def test_dia_nao_vazio_so_com_registro_emocional():
    dia = {"dream": None, "bullets": [], "emotion_logs": [{"emotion": "tristeza"}], "letters": []}
    assert C._dia_esta_vazio(dia) is False


def test_dia_nao_vazio_so_com_carta():
    dia = {"dream": None, "bullets": [], "emotion_logs": [], "letters": [{"recipient": "mim"}]}
    assert C._dia_esta_vazio(dia) is False


# ──────────────────────────────────────────────────────────────────────────────
# _selecionar_queries / _merge_dedup_trechos — as duas partes puras de _consultar_rag
# ──────────────────────────────────────────────────────────────────────────────
def test_selecionar_queries_respeita_o_teto():
    """No máximo _MAX_RAG_QUERIES consultas, mesmo que o modelo peça mais (research.md R3)."""
    temas = {"queries": ["q1", "q2", "q3", "q4", "q5", "q6"]}
    assert len(C._selecionar_queries(temas)) == C._MAX_RAG_QUERIES


def test_selecionar_queries_sem_queries_retorna_lista_vazia():
    assert C._selecionar_queries({}) == []
    assert C._selecionar_queries({"queries": None}) == []


def test_merge_dedup_trechos_remove_uri_repetida():
    """Duas listas com o mesmo trecho (mesma uri) não devem duplicar — 1ª ocorrência vence."""
    lista1 = [{"texto": "A", "fonte": "a.md", "uri": "gs://b/a.md", "score": 0.9}]
    lista2 = [
        {"texto": "A", "fonte": "a.md", "uri": "gs://b/a.md", "score": 0.8},  # mesma uri
        {"texto": "B", "fonte": "b.md", "uri": "gs://b/b.md", "score": 0.7},
    ]
    trechos = C._merge_dedup_trechos([lista1, lista2])
    uris = [t["uri"] for t in trechos]
    assert uris == ["gs://b/a.md", "gs://b/b.md"]  # "a.md" aparece uma única vez
    assert trechos[0]["score"] == 0.9  # preserva a 1ª ocorrência, não a última


def test_merge_dedup_trechos_com_listas_vazias():
    assert C._merge_dedup_trechos([]) == []
    assert C._merge_dedup_trechos([[], []]) == []


def test_merge_dedup_trechos_sem_uri_nao_deduplica():
    """Trechos sem `uri` (caso degenerado) não são deduplicados entre si — mantém todos."""
    lista = [{"texto": "X", "uri": None}, {"texto": "Y", "uri": ""}]
    trechos = C._merge_dedup_trechos([lista])
    assert len(trechos) == 2


# ──────────────────────────────────────────────────────────────────────────────
# _precisa_busca_web — gate da User Story 3 (research.md R3)
# ──────────────────────────────────────────────────────────────────────────────
def test_precisa_busca_web_quando_base_vazia():
    assert C._precisa_busca_web([]) is True


def test_precisa_busca_web_com_um_trecho_so():
    assert C._precisa_busca_web([{"uri": "gs://a"}]) is True


def test_nao_precisa_busca_web_com_dois_trechos_ou_mais():
    assert C._precisa_busca_web([{"uri": "gs://a"}, {"uri": "gs://b"}]) is False


# ──────────────────────────────────────────────────────────────────────────────
# _normalize_toolkit — origem decidida no servidor, nunca confiando no modelo (FR-011/012)
# ──────────────────────────────────────────────────────────────────────────────
def test_normalize_toolkit_marca_base_quando_uri_bate():
    rag_uris = {"gs://b/ansiedade.md"}
    raw = [{"titulo": "T", "porque": "P", "como": "C", "fonte": "ansiedade.md", "uri": "gs://b/ansiedade.md"}]
    resultado = C._normalize_toolkit(raw, rag_uris)
    assert resultado[0]["origem"] == "base"


def test_normalize_toolkit_marca_web_quando_uri_nao_bate():
    rag_uris = {"gs://b/ansiedade.md"}
    raw = [{"titulo": "T", "porque": "P", "como": "C", "fonte": "algum blog", "uri": ""}]
    resultado = C._normalize_toolkit(raw, rag_uris)
    assert resultado[0]["origem"] == "web"


def test_normalize_toolkit_ignora_alegacao_do_modelo_se_uri_nao_e_real():
    """Mesmo que o modelo tenha inventado uma uri, se ela não está no conjunto
    realmente recuperado, o item vira "web" — nunca confiamos na palavra do modelo."""
    rag_uris = {"gs://b/real.md"}
    raw = [{"titulo": "T", "porque": "P", "como": "C", "fonte": "inventado.md", "uri": "gs://b/nao-existe.md"}]
    resultado = C._normalize_toolkit(raw, rag_uris)
    assert resultado[0]["origem"] == "web"


# ──────────────────────────────────────────────────────────────────────────────
# _serialize_counsel_row — round-trip de serialização (leitura)
# ──────────────────────────────────────────────────────────────────────────────
def test_serialize_counsel_row_round_trip():
    row = {
        "page_id": 42,
        "mirror": "Foi um dia de altos e baixos.",
        "toolkit_json": [{"titulo": "X", "porque": "Y", "como": "Z", "fonte": "f.md", "uri": "gs://f.md", "origem": "base"}],
        "question": "O que pesou mais hoje?",
        "actions_json": [{"texto": "Descansar", "motivo": "Você mencionou cansaço", "task_id": None}],
        "used_web": False,
        "created_at": datetime(2026, 7, 26, 10, 0, 0),
        "updated_at": datetime(2026, 7, 26, 10, 0, 0),
    }
    result = C._serialize_counsel_row(row, "2026-07-26")
    assert result["page_id"] == 42
    assert result["date"] == "2026-07-26"
    assert result["toolkit"][0]["origem"] == "base"
    assert result["actions"][0]["task_id"] is None
    assert result["created_at"] == "2026-07-26T10:00:00"


def test_serialize_counsel_row_aceita_json_como_string():
    """toolkit_json/actions_json podem chegar já como string JSON (psycopg2 sem
    RealDictCursor, ou vindo de round-trip) — a serialização precisa parsear os dois."""
    row = {
        "page_id": 1,
        "mirror": "m",
        "toolkit_json": "[]",
        "question": None,
        "actions_json": "[]",
        "used_web": False,
        "created_at": None,
        "updated_at": None,
    }
    result = C._serialize_counsel_row(row, "2026-07-01")
    assert result["toolkit"] == []
    assert result["actions"] == []
    assert result["created_at"] is None
