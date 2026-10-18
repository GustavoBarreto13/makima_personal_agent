"""Spec 077 · Fase 1 — três campos de nome, espaço, aniversário e categorias da Komi.

Testes de integração contra um PostgreSQL real (descartável). Cobrem:
    - Nome / Apelido / Nome completo e a resolução por qualquer um deles
      (``@Bia`` e ``@Beatriz`` apontam para a mesma pessoa).
    - Colisão entre nome × apelido × "outras formas" de pessoas diferentes.
    - Espaço (pessoal / trabalho / ambos) e o filtro por espaço.
    - Aniversário como campo (validação contra o calendário real).
    - Relacionamentos como lista configurável.

Como rodar:
    export DATABASE_URL="postgresql://postgres:test@127.0.0.1:55432/makima_test"
    pytest tests/agents/test_komi_077_names.py -v

Sem DATABASE_URL o módulo inteiro é pulado.
"""

import os

import psycopg2
import pytest

if not os.environ.get("DATABASE_URL"):
    pytest.skip("DATABASE_URL não definida — testes de integração da Komi pulados.", allow_module_level=True)

from agents.db import get_conn  # noqa: E402
from agents.komi import tools as K  # noqa: E402
from tests.agents.komi_testing import reset_komi_schema  # noqa: E402


@pytest.fixture(autouse=True)
def _banco_limpo():
    """Recria o schema da Komi antes de cada teste (isolamento total)."""
    reset_komi_schema()
    yield


def _criar(name: str, **extra) -> str:
    """Cria uma pessoa e devolve o ID (falha o teste se a criação der erro)."""
    r = K.create_person(name, **extra)
    assert r["status"] == "ok", r
    return r["id"]


# ── três campos de nome ──────────────────────────────────────────────────────

def test_cria_com_tres_nomes_e_grava_as_chaves_de_busca():
    pid = _criar("Beatriz", nickname="Bia", full_name="Beatriz Silva Souza")
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT name, nickname, full_name, nickname_norm, full_name_norm FROM people WHERE id=%s", (pid,))
        assert cur.fetchone() == ("Beatriz", "Bia", "Beatriz Silva Souza", "bia", "beatriz silva souza")


def test_apelido_igual_ao_nome_nao_e_guardado():
    pid = _criar("Bia", nickname="  BIA ")
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT nickname, nickname_norm FROM people WHERE id=%s", (pid,))
        assert cur.fetchone() == (None, None)


def test_nome_e_apelido_resolvem_a_mesma_pessoa():
    pid = _criar("Beatriz", nickname="Bia", full_name="Beatriz Silva Souza")
    for texto in ("Bia", "bia", "BEATRIZ", "Beatriz Silva Souza", "beatríz"):
        achados = K.find_people_exact(texto)
        assert [a["id"] for a in achados] == [pid], texto
    assert [m["id"] for m in K.find_people("be")["matches"]] == [pid]
    assert [m["id"] for m in K.find_people("bi")["matches"]] == [pid]


def test_outra_forma_tambem_resolve():
    pid = _criar("Beatriz")
    assert K.add_alias(pid, "Betinha")["status"] == "ok"
    assert [a["id"] for a in K.find_people_exact("betinha")] == [pid]


def test_busca_nao_trata_underscore_nem_percentual_como_curinga():
    _criar("Axb")
    assert K.find_people("a_b")["matches"] == []
    assert K.find_people("%")["matches"] == []


def test_sugestoes_mostram_a_forma_que_casou():
    pid = _criar("Beatriz", nickname="Bia", full_name="Beatriz Silva Souza")
    por_apelido = K.suggest_people("bi")["people"]
    assert por_apelido[0]["id"] == pid and por_apelido[0]["alias"] == "Bia"
    por_sobrenome = K.suggest_people("souza")["people"]
    assert por_sobrenome[0]["id"] == pid and por_sobrenome[0]["alias"] == "Beatriz Silva Souza"
    assert len(K.suggest_people("be")["people"]) == 1   # uma sugestão por pessoa, mesmo casando em vários campos


# ── colisão de nomes ─────────────────────────────────────────────────────────

def test_apelido_nao_pode_ser_o_nome_de_outra_pessoa():
    _criar("Bia")
    r = K.create_person("Beatriz", nickname="Bia")
    assert r["status"] == "error" and "Bia" in r["message"]


def test_nome_nao_pode_ser_o_apelido_de_outra_pessoa():
    _criar("Beatriz", nickname="Bia")
    assert K.create_person("Bia")["status"] == "error"


def test_apelido_nao_pode_repetir_entre_pessoas():
    _criar("Beatriz", nickname="Bia")
    assert K.create_person("Beatrice", nickname="bia")["status"] == "error"


def test_outra_forma_nao_pode_ser_apelido_de_outra_pessoa():
    _criar("Beatriz", nickname="Bia")
    outra = _criar("Carlos")
    r = K.add_alias(outra, "Bia")
    assert r["status"] == "error" and "Beatriz" in r["message"]


def test_editar_apelido_para_um_ocupado_e_barrado_mas_o_proprio_vale():
    a = _criar("Beatriz", nickname="Bia")
    b = _criar("Carlos")
    assert K.update_person(b, nickname="Bia")["status"] == "error"
    assert K.update_person(a, nickname="Bia")["status"] == "ok"        # a própria pessoa não colide consigo
    assert K.update_person(a, nickname="")["status"] == "ok"           # limpar apelido
    assert K.update_person(b, nickname="Bia")["status"] == "ok"        # agora está livre


def test_renomear_para_o_proprio_apelido_remove_a_redundancia():
    a = _criar("Beatriz", nickname="Bia")
    assert K.update_person(a, name="Bia")["status"] == "ok"
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT name, nickname FROM people WHERE id=%s", (a,))
        assert cur.fetchone() == ("Bia", None)


def test_pessoa_excluida_libera_nome_e_apelido():
    a = _criar("Beatriz", nickname="Bia")
    K.delete_person(a)
    assert K.create_person("Outra", nickname="Bia")["status"] == "ok"


def test_remove_alias_so_da_pessoa_certa():
    a = _criar("Beatriz")
    b = _criar("Carlos")
    alias_id = K.add_alias(a, "Betinha")["id"]
    assert K.remove_alias(alias_id, person_id=b)["status"] == "error"   # não é do Carlos
    assert K.remove_alias(alias_id, person_id=a)["status"] == "ok"
    assert K.find_people_exact("betinha") == []
    assert K.remove_alias(alias_id)["status"] == "error"                # já foi removido


# ── espaço (pessoal / trabalho / ambos) ──────────────────────────────────────

def test_filtro_por_espaco_inclui_ambos_nos_dois_lados():
    p = _criar("Pessoal", context="personal")
    w = _criar("Trabalho", context="work")
    b = _criar("Ambos", context="both")
    ids = lambda espaco: {x["id"] for x in K.list_people(space=espaco)["people"]}  # noqa: E731
    assert ids("work") == {w, b}
    assert ids("personal") == {p, b}
    assert ids(None) == {p, w, b}
    assert ids("tudo") == {p, w, b}
    assert K.list_people(space="lua")["status"] == "error"


def test_sugestoes_respeitam_o_espaco():
    w = _criar("Walter", context="work")
    _criar("Wanda", context="personal")
    assert [s["id"] for s in K.suggest_people("wa", space="work")["people"]] == [w]


def test_contexto_invalido_e_barrado_e_editar_funciona():
    assert K.create_person("X", context="trabalho")["status"] == "error"
    pid = _criar("Y")
    assert K.update_person(pid, context="both")["status"] == "ok"
    assert K.update_person(pid, context="xxx")["status"] == "error"
    assert {x["id"] for x in K.list_people(space="work")["people"]} == {pid}


# ── aniversário ──────────────────────────────────────────────────────────────

def test_aniversario_valido_com_e_sem_ano():
    a = _criar("Com Ano", birth_day=15, birth_month=5, birth_year=1998)
    b = _criar("Sem Ano", birth_day=29, birth_month=2)
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT birth_day, birth_month, birth_year, birthday_remind_days FROM people WHERE id=%s", (a,))
        assert cur.fetchone() == (15, 5, 1998, 1)
        cur.execute("SELECT birth_day, birth_month, birth_year FROM people WHERE id=%s", (b,))
        assert cur.fetchone() == (29, 2, None)


@pytest.mark.parametrize("dia,mes,ano", [(30, 2, None), (31, 4, None), (10, None, None), (None, 10, None), (29, 2, 1999), (1, 13, None)])
def test_aniversario_impossivel_e_barrado(dia, mes, ano):
    assert K.create_person("Fulano", birth_day=dia, birth_month=mes, birth_year=ano)["status"] == "error"


def test_editar_aniversario_valida_junto_com_o_valor_atual():
    pid = _criar("Fulano", birth_day=10, birth_month=3)

    def aniversario():
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT birth_day, birth_month, birth_year FROM people WHERE id=%s", (pid,))
            return cur.fetchone()

    assert K.update_person(pid, birth_year=1990)["status"] == "ok"        # só o ano: dia/mês já existem
    assert aniversario() == (10, 3, 1990)
    assert K.update_person(pid, birth_month=2, birth_day=30)["status"] == "error"   # 30/02 não existe
    assert K.update_person(pid, birth_day=31)["status"] == "ok"           # 31/03 existe
    assert K.update_person(pid, birth_month=4)["status"] == "error"       # 31/04 não existe (usa o dia atual)
    assert aniversario() == (31, 3, 1990)                                  # o erro não alterou nada
    assert K.update_person(pid, birth_day=None, birth_month=None)["status"] == "ok"
    assert aniversario() == (None, None, None)                             # limpar apaga o ano junto


def test_lembrete_do_aniversario():
    pid = _criar("Fulano", birth_day=1, birth_month=1, birthday_remind_days=7)
    assert K.update_person(pid, birthday_remind_days=0)["status"] == "ok"
    assert K.update_person(pid, birthday_remind_days=None)["status"] == "ok"      # sem lembrete
    assert K.update_person(pid, birthday_remind_days=-1)["status"] == "error"
    assert K.update_person(pid, birthday_remind_days=999)["status"] == "error"
    assert K.update_person(pid, birthday_remind_days="abc")["status"] == "error"


# ── relacionamentos configuráveis ────────────────────────────────────────────

def test_categorias_semeadas_e_categoria_desconhecida_cai_em_outros():
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT slug FROM person_categories ORDER BY position")
        assert [r[0] for r in cur.fetchall()] == ["familia", "amigos", "trabalho", "outros"]
    pid = _criar("Fulano", category="inexistente")
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT category FROM people WHERE id=%s", (pid,))
        assert cur.fetchone()[0] == "outros"


def test_categoria_nova_e_arquivada():
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("INSERT INTO person_categories (slug, label, icon, position) VALUES ('faculdade','Faculdade','people',9)")
    pid = _criar("Fulano", category="faculdade")
    assert K.update_person(pid, category="amigos")["status"] == "ok"
    assert K.update_person(pid, category="faculdade")["status"] == "ok"
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("UPDATE person_categories SET archived = TRUE WHERE slug='faculdade'")
    r = K.update_person(pid, category="faculdade")
    assert r["status"] == "error" and "arquivado" in r["message"]


# ── update_person: lista fechada de campos e anotação legada ─────────────────

def test_update_rejeita_campo_desconhecido_e_nao_executa_sql_injetado():
    pid = _criar("Fulano")
    r = K.update_person(pid, **{"deleted = TRUE, name": "x"})
    assert r["status"] == "error" and "não editável" in r["message"]
    assert K.find_people_exact("fulano")           # continua viva


def test_texto_vazio_limpa_campo_e_notes_vira_anotacao():
    pid = _criar("Fulano", city="Recife", notes="gosta de café")
    assert K.update_person(pid, city="  ")["status"] == "ok"
    assert K.update_person(pid, notes="alérgico a amendoim")["status"] == "ok"      # acrescenta, não substitui
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT city FROM people WHERE id=%s", (pid,))
        assert cur.fetchone()[0] is None
        cur.execute("SELECT text, kind, context, status FROM person_notes WHERE person_id=%s ORDER BY id", (pid,))
        assert cur.fetchall() == [("gosta de café", "nota", "personal", "ativa"), ("alérgico a amendoim", "nota", "personal", "ativa")]


def test_nota_de_pessoa_de_trabalho_nasce_como_de_trabalho():
    pid = _criar("Chefe", context="work", notes="reunião às 9h")
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT context FROM person_notes WHERE person_id=%s", (pid,))
        assert cur.fetchone()[0] == "work"


# ── transação do chamador (create_person_on_cursor) ──────────────────────────

def test_create_person_on_cursor_com_novos_campos_e_rollback():
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn.cursor() as cur:
            r = K.create_person_on_cursor(cur, "Beatriz", nickname="Bia", context="both", birth_day=15, birth_month=5)
            assert r["status"] == "ok"
            dup = K.create_person_on_cursor(cur, "Outra", nickname="bia")      # colide DENTRO da mesma transação
            assert dup["status"] == "error"
        conn.rollback()
    finally:
        conn.close()
    assert K.find_people_exact("bia") == []                                   # rollback descartou tudo
