"""Job de lembretes do app (scripts/send_app_reminders.py) e modo quiet_success do agendador."""

from datetime import date, datetime, time, timedelta

import pytest

from agents.kaguya import reminder_engine as eng
from agents.kaguya.tz import SP_TZ
from scheduler import runner
from scripts import send_app_reminders as job


def sp(h, mi=0):
    return datetime(2026, 11, 6, h, mi, tzinfo=SP_TZ)


class Banco:
    """Simula app_reminder_log: `INSERT ... ON CONFLICT DO NOTHING` / `DELETE`."""

    def __init__(self):
        self.chaves: set[str] = set()

    def run_dml(self, sql, params=None):
        params = params or {}
        if sql.lstrip().startswith("INSERT"):
            if params["k"] in self.chaves:
                return 0
            self.chaves.add(params["k"])
            return 1
        if "WHERE key" in sql:
            self.chaves.discard(params["k"])
            return 1
        return 0  # limpeza por data


@pytest.fixture
def ambiente(monkeypatch):
    banco = Banco()
    enviados: list[dict] = []
    estado = {"push_ok": True, "candidatos": [], "falhas": []}

    monkeypatch.setattr(job, "run_dml", banco.run_dml)
    monkeypatch.setattr(job.reminder_sources, "collect_all", lambda now: (list(estado["candidatos"]), list(estado["falhas"])))

    def _send(message, channels=None, **kw):
        enviados.append({"message": message, "channels": channels, **kw})
        return estado["push_ok"]

    monkeypatch.setattr(job, "send_notification", _send)
    return banco, enviados, estado


def tarefa(**kw):
    base = {"id": 7, "title": "Dentista", "due_date": date(2026, 11, 6), "due_time": time(14, 0), "project_name": "Saúde"}
    base.update(kw)
    return eng.task_reminder(base)


def test_envia_so_por_push_com_titulo_corpo_link_e_canal(ambiente):
    _, enviados, estado = ambiente
    estado["candidatos"] = [tarefa()]
    res = job.run(sp(13, 50))
    assert res["enviados"] == 1
    assert enviados == [{
        "message": "14:00 · em 10 min · Saúde", "channels": ["push"], "title": "Dentista",
        "link": "makima://kaguya/tarefa/7", "agent": "kaguya",
    }]


def test_nao_envia_antes_da_hora(ambiente):
    _, enviados, estado = ambiente
    estado["candidatos"] = [tarefa()]
    assert job.run(sp(13, 49))["enviados"] == 0
    assert enviados == []


def test_at_most_once_nas_rodadas_seguintes(ambiente):
    _, enviados, estado = ambiente
    estado["candidatos"] = [tarefa()]
    job.run(sp(13, 50))
    job.run(sp(13, 51))
    job.run(sp(14, 0))
    assert len(enviados) == 1


def test_reagendar_manda_de_novo(ambiente):
    _, enviados, estado = ambiente
    estado["candidatos"] = [tarefa()]
    job.run(sp(13, 50))
    estado["candidatos"] = [tarefa(due_time=time(16, 0))]
    job.run(sp(15, 50))
    assert len(enviados) == 2


def test_push_que_falha_libera_a_reserva_e_tenta_no_minuto_seguinte(ambiente):
    banco, enviados, estado = ambiente
    estado["candidatos"] = [tarefa()]
    estado["push_ok"] = False
    with pytest.raises(RuntimeError, match="não puderam ser entregues"):
        job.run(sp(13, 50))
    assert banco.chaves == set()  # reserva desfeita
    estado["push_ok"] = True
    assert job.run(sp(13, 51))["enviados"] == 1
    assert len(enviados) == 2  # 1ª tentativa falha + 2ª entregue


def test_depois_da_janela_de_graca_descarta(ambiente):
    _, enviados, estado = ambiente
    estado["candidatos"] = [tarefa()]
    assert job.run(sp(14, 10))["vencidos"] == 0
    assert enviados == []


def test_uma_fonte_com_erro_nao_impede_as_outras(ambiente):
    _, enviados, estado = ambiente
    estado["candidatos"] = [tarefa()]
    estado["falhas"] = ["google"]
    res = job.run(sp(13, 50))
    assert res["enviados"] == 1 and res["fontes_com_erro"] == ["google"]


def test_todas_as_fontes_falhando_levanta(ambiente):
    _, _, estado = ambiente
    estado["falhas"] = [nome for nome, _ in job.reminder_sources.SOURCES]
    with pytest.raises(RuntimeError, match="Todas as fontes"):
        job.run(sp(13, 50))


def test_varios_lembretes_na_mesma_rodada_saem_ordenados(ambiente):
    _, enviados, estado = ambiente
    estado["candidatos"] = [tarefa(id=2, title="B", due_time=time(14, 5)), tarefa(id=1, title="A", due_time=time(14, 0))]
    job.run(sp(14, 0))
    assert [e["title"] for e in enviados] == ["A", "B"]


# ── agendador: jobs quiet_success ───────────────────────────────────────────

class Job:
    def __init__(self, func, quiet):
        self.name = "app_reminders"
        self.func = func
        self.quiet_success = quiet


@pytest.fixture
def runner_falso(monkeypatch):
    chamadas = {"inicio": 0, "fim": 0, "erro": 0, "alerta": 0}
    monkeypatch.setattr(runner, "_registrar_inicio", lambda n: chamadas.__setitem__("inicio", chamadas["inicio"] + 1) or 1)
    monkeypatch.setattr(runner, "_registrar_fim", lambda *a: chamadas.__setitem__("fim", chamadas["fim"] + 1))
    monkeypatch.setattr(runner, "_registrar_erro_direto", lambda *a: chamadas.__setitem__("erro", chamadas["erro"] + 1))
    monkeypatch.setattr(runner, "send_telegram_alert", lambda *a: chamadas.__setitem__("alerta", chamadas["alerta"] + 1))
    runner._ULTIMO_ALERTA.clear()
    return chamadas


def test_job_normal_grava_inicio_e_fim(runner_falso):
    runner.execute_with_logging(Job(lambda: None, quiet=False))
    assert (runner_falso["inicio"], runner_falso["fim"]) == (1, 1)


def test_quiet_success_nao_grava_nada_quando_da_certo(runner_falso):
    runner.execute_with_logging(Job(lambda: None, quiet=True))
    assert runner_falso == {"inicio": 0, "fim": 0, "erro": 0, "alerta": 0}


def test_quiet_success_grava_a_falha_e_limita_o_alerta_a_um_por_30_min(runner_falso):
    def falha():
        raise RuntimeError("banco fora")

    for _ in range(5):
        runner.execute_with_logging(Job(falha, quiet=True))
    assert runner_falso["erro"] == 5  # todas as falhas ficam registradas
    assert runner_falso["alerta"] == 1  # mas o Telegram recebe um aviso só


def test_quiet_success_volta_a_alertar_depois_do_intervalo(runner_falso, monkeypatch):
    def falha():
        raise RuntimeError("x")

    runner.execute_with_logging(Job(falha, quiet=True))
    runner._ULTIMO_ALERTA["app_reminders"] -= runner._INTERVALO_ALERTA_QUIET_S + 1
    runner.execute_with_logging(Job(falha, quiet=True))
    assert runner_falso["alerta"] == 2


# ── validação da antecedência (tools_tasks) ─────────────────────────────────

@pytest.mark.parametrize("valor", [None, -1, 0, 10, 10080])
def test_antecedencia_valida(valor):
    from agents.kaguya.tools_tasks import _check_reminder_lead

    assert _check_reminder_lead(valor) is None


@pytest.mark.parametrize("valor", [-2, 10081, 1.5, "10", True])
def test_antecedencia_invalida(valor):
    from agents.kaguya.tools_tasks import _check_reminder_lead

    assert "minutos" in _check_reminder_lead(valor)


# ── espelhos do Google sem alerta (o app avisa por push) ─────────────────────

def test_alertas_do_google_vem_desligados_por_padrao(monkeypatch):
    from agents.kaguya import gcal

    monkeypatch.delenv("GCAL_ALERTS_ENABLED", raising=False)
    assert gcal.alerts_enabled() is False
    monkeypatch.setenv("GCAL_ALERTS_ENABLED", "true")
    assert gcal.alerts_enabled() is True


def test_espelho_de_tarefa_e_habito_grava_alerta_vazio_explicito(monkeypatch):
    from agents.kaguya import gcal, gcal_sync

    monkeypatch.delenv("GCAL_ALERTS_ENABLED", raising=False)
    com_popup = {"reminders": {"useDefault": False, "overrides": [{"method": "popup", "minutes": 30}]}}
    assert gcal_sync._reminders_for(com_popup) == gcal.NO_ALERTS
    assert gcal_sync._reminders_for({}) == gcal.NO_ALERTS  # evento sem chave: não herda o padrão do calendário
    monkeypatch.setenv("GCAL_ALERTS_ENABLED", "true")
    assert gcal_sync._reminders_for(com_popup) == com_popup["reminders"]


def test_espelho_do_hub_nao_leva_o_lembrete_da_komi_ao_google(monkeypatch):
    from agents.kaguya import gcal_mirror

    monkeypatch.delenv("GCAL_ALERTS_ENABLED", raising=False)
    item = {"cal": "komi", "kind": "birthday", "ref_id": 1, "date": "2026-11-10", "title": "🎂", "all_day": True, "reminders": [900]}
    assert gcal_mirror._event_body(item)["reminders"] == {"useDefault": False, "overrides": []}
