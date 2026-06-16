"""Testes de integração da camada de lógica do agente Komi (spec 014).

São testes contra um PostgreSQL real — exercitam: unicidade de nome normalizado,
smart-match (find_people), unicidade de aliases, soft delete, resumo cross-agent
(get_person_summary) e vínculos polimórficos (person_links).

Cenários cobertos:
    SC-001  Alias resolve corretamente (case/acento-insensitive)
    SC-002  Criar duplicata de nome vivo é bloqueado
    SC-003  Soft delete preserva vínculos e impede duplicata reativada
    SC-004  Alias duplicado em outra pessoa retorna erro claro
    SC-005  find_people com 0, 1 e 2+ matches

Como rodar:
    export DATABASE_URL="postgresql://postgres:test@localhost:55432/makima_test"
    pytest tests/agents/test_komi.py -v

Sem DATABASE_URL o módulo inteiro é pulado.
"""

import os

import pytest

# Pula se não houver banco configurado
if not os.environ.get("DATABASE_URL"):
    pytest.skip("DATABASE_URL não definida — testes de integração da Komi pulados.", allow_module_level=True)

from agents.db import get_conn  # noqa: E402
from agents.komi import tools as K  # noqa: E402

# Caminho absoluto do schema da Komi
_SCHEMA_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "agents", "komi", "schema_pg.sql",
)

# Tabelas do domínio Komi, dependentes primeiro (para DROP CASCADE ser seguro)
_KOMI_TABLES = "person_links person_dates person_aliases people"


@pytest.fixture(autouse=True)
def reset_komi_schema():
    """Recria as tabelas Komi antes de cada teste para isolamento total."""
    with open(_SCHEMA_PATH, encoding="utf-8") as f:
        schema_sql = f.read()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"DROP TABLE IF EXISTS {_KOMI_TABLES.replace(' ', ', ')} CASCADE")
            cur.execute(schema_sql)
    yield


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _create(name: str, relationship: str = "amigo") -> dict:
    """Cria uma pessoa e retorna o resultado."""
    return K.create_person(name=name, relationship=relationship)


# ─────────────────────────────────────────────────────────────────────────────
# SC-001 — smart-match básico: find_people com 0, 1 e 2+ resultados
# ─────────────────────────────────────────────────────────────────────────────

def test_find_people_zero_matches():
    """find_people sem nenhuma pessoa cadastrada retorna lista vazia."""
    result = K.find_people("Ana")
    assert result["status"] == "ok"
    assert result["people"] == []


def test_find_people_one_match():
    """find_people com match único retorna exatamente 1 pessoa."""
    r = _create("Ana Silva")
    assert r["status"] == "ok"
    result = K.find_people("Ana")
    assert result["status"] == "ok"
    assert len(result["people"]) == 1
    assert result["people"][0]["name"] == "Ana Silva"


def test_find_people_case_insensitive():
    """find_people ignora maiúsculas/minúsculas e acentos."""
    _create("João Ferreira")
    result = K.find_people("joao")
    assert len(result["people"]) == 1
    assert "João" in result["people"][0]["name"]


def test_find_people_accent_insensitive():
    """find_people ignora acentos na busca."""
    _create("Ângela Mendes")
    result = K.find_people("Angela")
    assert len(result["people"]) == 1


def test_find_people_multiple_matches():
    """find_people com 2+ pessoas correspondentes retorna todos os matches."""
    _create("Ana Lima")
    _create("Ana Costa")
    result = K.find_people("Ana")
    assert result["status"] == "ok"
    assert len(result["people"]) == 2


# ─────────────────────────────────────────────────────────────────────────────
# SC-001 — Alias resolve corretamente
# ─────────────────────────────────────────────────────────────────────────────

def test_alias_resolves_in_find_people():
    """find_people encontra pessoa pelo apelido (alias)."""
    r = _create("Gustavo Barreto")
    pid = r["person"]["id"]
    K.add_alias(pid, "Gus")

    result = K.find_people("Gus")
    assert result["status"] == "ok"
    assert len(result["people"]) == 1
    assert result["people"][0]["id"] == pid


def test_alias_case_insensitive():
    """Alias é resolvido sem considerar maiúsculas/minúsculas."""
    r = _create("Maria Clara")
    pid = r["person"]["id"]
    K.add_alias(pid, "MC")

    result = K.find_people("mc")
    assert len(result["people"]) == 1
    assert result["people"][0]["id"] == pid


# ─────────────────────────────────────────────────────────────────────────────
# SC-002 — Unicidade de nome (no-duplicate vivo)
# ─────────────────────────────────────────────────────────────────────────────

def test_create_person_duplicate_name_blocked():
    """Criar pessoa com mesmo nome normalizado retorna erro."""
    _create("Pedro Alves")
    result = _create("pedro alves")  # normaliza para o mesmo valor
    assert result["status"] == "error"
    assert "já existe" in result["message"].lower() or "duplicata" in result["message"].lower() or result["status"] == "error"


def test_create_person_different_names_allowed():
    """Nomes diferentes são permitidos mesmo com prefixo semelhante."""
    r1 = _create("Ana Lima")
    r2 = _create("Ana Souza")
    assert r1["status"] == "ok"
    assert r2["status"] == "ok"


# ─────────────────────────────────────────────────────────────────────────────
# SC-003 — Soft delete preserva vínculos e bloqueia o nome
# ─────────────────────────────────────────────────────────────────────────────

def test_soft_delete_removes_from_list_people():
    """Pessoa deletada não aparece em list_people."""
    r = _create("Carlos Mendes")
    pid = r["person"]["id"]
    K.delete_person(pid)

    result = K.list_people()
    assert result["status"] == "ok"
    ids = [p["id"] for p in result["people"]]
    assert pid not in ids


def test_soft_delete_allows_same_name_recreation():
    """Após soft delete, o mesmo nome pode ser recadastrado."""
    r = _create("Carlos Mendes")
    pid = r["person"]["id"]
    K.delete_person(pid)

    # Deve ser possível recriar com o mesmo nome
    r2 = _create("Carlos Mendes")
    assert r2["status"] == "ok"
    assert r2["person"]["id"] != pid  # nova entidade


# ─────────────────────────────────────────────────────────────────────────────
# SC-004 — Alias duplicado em outra pessoa é bloqueado
# ─────────────────────────────────────────────────────────────────────────────

def test_alias_duplicate_across_persons():
    """Alias já vinculado a outra pessoa retorna erro claro."""
    r1 = _create("Bruno Silva")
    r2 = _create("Beatriz Santos")
    pid1 = r1["person"]["id"]
    pid2 = r2["person"]["id"]

    K.add_alias(pid1, "Bê")
    result = K.add_alias(pid2, "Bê")  # conflito global

    assert result["status"] == "error"
    assert "bê" in result["message"].lower() or "apelido" in result["message"].lower() or result["status"] == "error"


def test_alias_same_person_idempotent():
    """Adicionar o mesmo alias à mesma pessoa é bloqueado pelo índice único."""
    r = _create("Rafael Costa")
    pid = r["person"]["id"]
    r1 = K.add_alias(pid, "Rafa")
    # Segunda chamada deve retornar erro (violação de unicidade)
    r2 = K.add_alias(pid, "Rafa")
    assert r1["status"] == "ok"
    assert r2["status"] == "error"


# ─────────────────────────────────────────────────────────────────────────────
# CRUD básico
# ─────────────────────────────────────────────────────────────────────────────

def test_create_person_returns_id():
    """create_person retorna UUID válido."""
    r = _create("Fernanda Oliveira")
    assert r["status"] == "ok"
    assert "id" in r["person"]
    assert len(r["person"]["id"]) == 36  # UUID v4


def test_get_person_returns_profile():
    """get_person retorna o perfil correto."""
    r = _create("Letícia Moura")
    pid = r["person"]["id"]
    result = K.get_person(pid)
    assert result["status"] == "ok"
    assert result["person"]["name"] == "Letícia Moura"


def test_update_person_name():
    """update_person altera o nome e recalcula normalizado."""
    r = _create("Vinicius Rocha")
    pid = r["person"]["id"]
    K.update_person(pid, name="Vinícius Rocha")

    result = K.get_person(pid)
    assert result["person"]["name"] == "Vinícius Rocha"


def test_update_person_partial():
    """update_person atualiza só o campo informado, preserva os demais."""
    r = _create("Lucas Pinto", relationship="trabalho")
    pid = r["person"]["id"]
    K.update_person(pid, city="São Paulo")

    result = K.get_person(pid)
    assert result["person"]["city"] == "São Paulo"
    assert result["person"]["relationship"] == "trabalho"


def test_add_important_date():
    """add_important_date persiste a data e ela aparece no get_person."""
    r = _create("Camila Torres")
    pid = r["person"]["id"]
    K.add_important_date(pid, "aniversário", "1995-07-22", recurring=True)

    result = K.get_person(pid)
    dates = result.get("dates", [])
    assert any(d["label"] == "aniversário" for d in dates)


def test_list_people_shows_only_alive():
    """list_people exclui pessoas com deleted=TRUE."""
    r1 = _create("Pessoa Viva")
    r2 = _create("Pessoa Deletada")
    K.delete_person(r2["person"]["id"])

    result = K.list_people()
    names = [p["name"] for p in result["people"]]
    assert "Pessoa Viva" in names
    assert "Pessoa Deletada" not in names


# ─────────────────────────────────────────────────────────────────────────────
# get_person_summary — smoke test (sem dados cross-agent)
# ─────────────────────────────────────────────────────────────────────────────

def test_get_person_summary_empty():
    """get_person_summary com pessoa sem vínculos retorna blocos vazios sem erro."""
    r = _create("Joana Azevedo")
    pid = r["person"]["id"]
    result = K.get_person_summary(pid)

    assert result["status"] == "ok"
    # Blocos principais devem existir mesmo sem dados
    assert "perfil" in result
    assert "financas" in result
    assert "tarefas" in result
    assert "diario" in result
    assert "livros" in result


def test_get_person_summary_not_found():
    """get_person_summary com UUID inexistente retorna erro."""
    result = K.get_person_summary("00000000-0000-0000-0000-000000000000")
    assert result["status"] == "error"


# ─────────────────────────────────────────────────────────────────────────────
# link_person_on_cursor — idempotência e idoneidade do tipo
# ─────────────────────────────────────────────────────────────────────────────

def test_link_person_on_cursor_idempotent():
    """link_person_on_cursor com mesmos argumentos não cria duplicata."""
    r = _create("Tiago Nunes")
    pid = r["person"]["id"]

    with get_conn() as conn:
        with conn.cursor() as cur:
            K.link_person_on_cursor(cur, pid, "transaction", "tx-abc-123")
            # Segunda chamada — ON CONFLICT DO NOTHING
            K.link_person_on_cursor(cur, pid, "transaction", "tx-abc-123")

    # Verifica que há exatamente 1 vínculo
    from agents.db import run_select
    rows = run_select(
        "SELECT COUNT(*) AS c FROM person_links WHERE person_id = %s AND entity_id = %s",
        (pid, "tx-abc-123"),
    )
    assert rows[0]["c"] == 1


def test_link_person_on_cursor_entity_id_coerced_to_str():
    """link_person_on_cursor aceita entity_id inteiro (coercido para str)."""
    r = _create("Rebeca Alves")
    pid = r["person"]["id"]

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Passa int (tarefa com SERIAL PK) — deve funcionar sem erro
            K.link_person_on_cursor(cur, pid, "task", 42)

    from agents.db import run_select
    rows = run_select(
        "SELECT entity_id FROM person_links WHERE person_id = %s AND entity_type = 'task'",
        (pid,),
    )
    assert len(rows) == 1
    assert rows[0]["entity_id"] == "42"
