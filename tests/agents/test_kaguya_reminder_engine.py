"""Motor PURO dos lembretes do app (agents/kaguya/reminder_engine.py) — sem banco, sem rede."""

from datetime import date, datetime, time, timedelta, timezone

from agents.kaguya import reminder_engine as eng
from agents.kaguya.tz import SP_TZ


def sp(y, mo, d, h=0, mi=0):
    return datetime(y, mo, d, h, mi, tzinfo=SP_TZ)


def tarefa(**kw):
    base = {
        "id": 12, "title": "Reunião com o time", "due_date": date(2026, 11, 6), "due_time": time(14, 0),
        "start_at": None, "reminder_lead_min": None, "project_name": "Trabalho",
    }
    base.update(kw)
    return base


# ── tarefas e eventos ────────────────────────────────────────────────────────

def test_padrao_avisa_10_minutos_antes():
    r = eng.task_reminder(tarefa())
    assert r.fire_at == sp(2026, 11, 6, 13, 50)
    assert r.title == "Reunião com o time"
    assert r.body == "14:00 · em 10 min · Trabalho"
    assert r.link == "makima://kaguya/tarefa/12"
    assert r.agent == "kaguya"


def test_antecedencia_configurada_na_tarefa():
    assert eng.task_reminder(tarefa(reminder_lead_min=30)).fire_at == sp(2026, 11, 6, 13, 30)
    assert eng.task_reminder(tarefa(reminder_lead_min=0)).fire_at == sp(2026, 11, 6, 14, 0)
    assert eng.task_reminder(tarefa(reminder_lead_min=1440)).fire_at == sp(2026, 11, 5, 14, 0)


def test_sem_aviso_nao_gera_lembrete():
    assert eng.task_reminder(tarefa(reminder_lead_min=-1)) is None


def test_tarefa_so_com_data_nao_tem_aviso_proprio():
    assert eng.task_reminder(tarefa(due_time=None)) is None


def test_bloco_de_tempo_vale_mais_que_o_horario_de_vencimento():
    # start_at vem do banco em UTC: 17:30Z = 14:30 em São Paulo
    inicio = datetime(2026, 11, 6, 17, 30, tzinfo=timezone.utc)
    r = eng.task_reminder(tarefa(start_at=inicio))
    assert r.fire_at == sp(2026, 11, 6, 14, 20)
    assert r.body.startswith("14:30")


def test_reagendar_muda_a_chave_e_rearma_o_aviso():
    antes = eng.task_reminder(tarefa())
    depois = eng.task_reminder(tarefa(due_time=time(15, 0)))
    assert antes.key != depois.key
    # mudar só a antecedência também é "outro aviso"
    assert antes.key != eng.task_reminder(tarefa(reminder_lead_min=30)).key


def test_aceita_data_e_hora_como_texto():
    r = eng.task_reminder(tarefa(due_date="2026-11-06", due_time="14:00:00"))
    assert r.fire_at == sp(2026, 11, 6, 13, 50)


# ── janela de seleção ────────────────────────────────────────────────────────

def test_select_due_respeita_a_janela_de_graca():
    r = eng.task_reminder(tarefa())  # sai às 13:50
    assert eng.select_due([r], sp(2026, 11, 6, 13, 49)) == []  # ainda não deu a hora
    assert eng.select_due([r], sp(2026, 11, 6, 13, 50)) == [r]  # na hora
    assert eng.select_due([r], sp(2026, 11, 6, 14, 5)) == [r]  # 15 min depois ainda vale
    assert eng.select_due([r], sp(2026, 11, 6, 14, 6)) == []  # passou da graça: descarta


def test_select_due_ordena_e_remove_chaves_repetidas():
    a = eng.task_reminder(tarefa(id=1, due_time=time(14, 0)))
    b = eng.task_reminder(tarefa(id=2, due_time=time(13, 55)))
    saida = eng.select_due([a, b, a], sp(2026, 11, 6, 13, 56))
    assert [r.key for r in saida] == [b.key, a.key]


# ── fuso ─────────────────────────────────────────────────────────────────────

def test_fuso_tarefa_as_23h50_local_nao_vira_o_dia_seguinte():
    r = eng.task_reminder(tarefa(due_time=time(23, 50), reminder_lead_min=0))
    assert r.fire_at.date() == date(2026, 11, 6)
    assert r.fire_at.utcoffset() == timedelta(hours=-3)


# ── hábitos ──────────────────────────────────────────────────────────────────

def habito(**kw):
    base = {"id": 3, "name": "Academia", "time_of_day": time(7, 0), "reminder_lead_min": 15, "checked_today": False}
    base.update(kw)
    return base


def test_habito_avisa_no_horario_menos_a_antecedencia_dele():
    r = eng.habit_reminder(habito(), date(2026, 11, 6))
    assert r.fire_at == sp(2026, 11, 6, 6, 45)
    assert r.title == "Academia"
    assert r.link == "makima://kaguya/habitos"


def test_habito_ja_feito_hoje_nao_avisa():
    assert eng.habit_reminder(habito(checked_today=True), date(2026, 11, 6)) is None


def test_habito_sem_hora_nao_avisa():
    assert eng.habit_reminder(habito(time_of_day=None), date(2026, 11, 6)) is None


def test_habito_chave_muda_por_dia():
    a = eng.habit_reminder(habito(), date(2026, 11, 6))
    b = eng.habit_reminder(habito(), date(2026, 11, 7))
    assert a.key != b.key


# ── dia inteiro (Komi) ───────────────────────────────────────────────────────

def test_dia_inteiro_um_dia_antes_as_9h():
    assert eng.allday_fire(date(2026, 11, 10), 900) == sp(2026, 11, 9, 9, 0)


def test_dia_inteiro_no_proprio_dia_sobe_de_madrugada_para_9h():
    assert eng.allday_fire(date(2026, 11, 10), 0) == sp(2026, 11, 10, 9, 0)


def test_komi_gera_um_lembrete_por_aviso_e_ignora_item_sem_lembrete():
    itens = [
        {"date": "2026-11-10", "title": "🎂 aniversário — Bia", "kind": "birthday", "ref_id": 5, "reminders": [900]},
        {"date": "2026-11-10", "title": "sem aviso", "kind": "date", "ref_id": 6},
    ]
    saida = eng.komi_reminders(itens)
    assert len(saida) == 1
    assert saida[0].fire_at == sp(2026, 11, 9, 9, 0)
    assert saida[0].body == "Amanhã"
    assert saida[0].agent == "komi"
    assert saida[0].link == "makima://komi"


def test_komi_no_dia_diz_hoje():
    itens = [{"date": "2026-11-10", "title": "x", "kind": "birthday", "ref_id": 1, "reminders": [0]}]
    assert eng.komi_reminders(itens)[0].body == "Hoje"


# ── Google ───────────────────────────────────────────────────────────────────

def evento(**kw):
    base = {"id": "abc", "summary": "Alinhamento", "start": "2026-11-06T10:00:00-03:00", "location": "Sala 2", "reminders": {}}
    base.update(kw)
    return base


def test_google_sem_configuracao_usa_o_padrao_de_10_min():
    r = eng.google_reminders([evento()])[0]
    assert r.fire_at == sp(2026, 11, 6, 9, 50)
    assert r.body == "10:00 · em 10 min · Sala 2"


def test_google_usa_os_popups_do_proprio_evento():
    ev = evento(reminders={"useDefault": False, "overrides": [
        {"method": "popup", "minutes": 30}, {"method": "email", "minutes": 60}, {"method": "popup", "minutes": 5}]})
    leads = sorted(r.fire_at for r in eng.google_reminders([ev]))
    assert leads == [sp(2026, 11, 6, 9, 30), sp(2026, 11, 6, 9, 55)]


def test_google_sem_alerta_nenhum_nao_avisa():
    assert eng.google_reminders([evento(reminders={"useDefault": False, "overrides": []})]) == []


def test_google_ignora_dia_inteiro():
    assert eng.google_reminders([evento(start="2026-11-06")]) == []


# ── resumo do dia ────────────────────────────────────────────────────────────

def test_resumo_as_7h30_com_contagens():
    r = eng.daily_summary(date(2026, 11, 6), 3, 1, ("09:00", "Dentista"))
    assert r.fire_at == sp(2026, 11, 6, 7, 30)
    assert r.body == "3 tarefas hoje · 1 atrasada · 1º: 09:00 Dentista"
    assert r.key == "summary:2026-11-06"


def test_resumo_singular_e_dia_vazio():
    assert eng.daily_summary(date(2026, 11, 6), 1, 0).body == "1 tarefa hoje"
    assert eng.daily_summary(date(2026, 11, 6), 0, 0) is None


def test_lead_label():
    assert [eng.lead_label(m) for m in (0, 10, 60, 90, 1440, 2880)] == [
        "agora", "em 10 min", "em 1 h", "em 1 h 30", "em 1 dia", "em 2 dias"]
