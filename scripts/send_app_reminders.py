"""Lembretes do app por push — roda a cada minuto (job `app_reminders`, scheduler/).

Avisa tarefas e eventos com hora, hábitos, aniversários, reuniões do Google e o resumo das 07:30 como
NOTIFICAÇÃO NO CELULAR, sem depender do app Google Calendar. A regra de "quando" é do motor puro
(`agents/kaguya/reminder_engine.py`), a leitura de dados é de `reminder_sources.py`; este script só
orquestra e garante **no máximo um aviso por lembrete**:

    1. reúne os candidatos de todas as fontes (uma fonte com erro não derruba as outras);
    2. fica com os que já deram a hora (janela de graça de 15 min);
    3. para cada um: grava a chave em `app_reminder_log` ANTES de enviar (`ON CONFLICT DO NOTHING` —
       se outra execução já pegou, pula); se o push falhar, apaga a chave e o minuto seguinte tenta de novo
       até a janela acabar.

Uso manual (dentro do container, ex.: para testar):
    docker exec makima-scheduler python -m scripts.send_app_reminders
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from agents.db import run_dml
from agents.kaguya import reminder_engine as eng
from agents.kaguya import reminder_sources
from agents.kaguya.tz import now_sp
from scheduler.notify_channels import send_notification

log = logging.getLogger("app-reminders")

# Linhas de `app_reminder_log` mais velhas que isso são apagadas (só servem para não repetir avisos).
_RETENTION_DAYS = 7


def _claim(key: str, fire_at: datetime) -> bool:
    """Reserva o lembrete. ``True`` se foi este processo que reservou (e portanto deve enviar)."""
    return (
        run_dml(
            "INSERT INTO app_reminder_log (key, fire_at) VALUES (%(k)s, %(f)s) ON CONFLICT (key) DO NOTHING",
            {"k": key, "f": fire_at},
        )
        == 1
    )


def _action_payload(r: eng.Reminder) -> tuple[dict[str, str] | None, bool]:
    """Dados extras do push de um lembrete e se ele vai "só dados".

    Lembretes de tarefa levam os botões (Concluir/Adiar 1h/Amanhã): o app desenha a notificação
    (`data_only`) e o token assinado deixa cada botão agir só naquela tarefa, sem a sessão do usuário.
    Os demais lembretes seguem como notificação comum.

    Args:
        r: O lembrete.

    Returns:
        Tupla `(dados_extras, so_dados)`; `(None, False)` quando não há botões.
    """
    if r.task_id is None or not r.actions:
        return None, False
    # Import tardio: só quem tem lembrete de tarefa precisa do segredo de assinatura carregado.
    from webapp.backend.push_actions import sign_action_token

    return (
        {
            "kind": "task_actions",
            "task_id": str(r.task_id),
            "token": sign_action_token(r.task_id),
            "actions": ",".join(r.actions),
        },
        True,
    )


def _release(key: str) -> None:
    """Desfaz a reserva (o push falhou): o próximo minuto tenta de novo, dentro da janela de graça."""
    run_dml("DELETE FROM app_reminder_log WHERE key = %(k)s", {"k": key})


def _cleanup() -> None:
    run_dml(
        "DELETE FROM app_reminder_log WHERE sent_at < %(limite)s",
        {"limite": datetime.now().astimezone() - timedelta(days=_RETENTION_DAYS)},
    )


def run(now: datetime | None = None) -> dict:
    """Uma rodada do motor de lembretes.

    Args:
        now: Instante da rodada (com fuso); padrão = agora em São Paulo. Parâmetro existe para teste.

    Returns:
        ``{"candidatos", "vencidos", "enviados", "falhas_envio", "fontes_com_erro"}``.

    Raises:
        RuntimeError: Se TODAS as fontes falharam, ou se algum push não pôde ser entregue (ex.: nenhum
            aparelho cadastrado, Firebase fora). O runner transforma isso em alerta (limitado a um a cada
            30 min por ser job `quiet_success`).
    """
    now = now or now_sp()
    candidatos, fontes_com_erro = reminder_sources.collect_all(now)
    if len(fontes_com_erro) == len(reminder_sources.SOURCES):
        raise RuntimeError(f"Todas as fontes de lembretes falharam: {', '.join(fontes_com_erro)}")

    vencidos = eng.select_due(candidatos, now)
    enviados = 0
    falhas_envio = 0
    for r in vencidos:
        if not _claim(r.key, r.fire_at):
            continue  # já avisado (por esta ou por outra rodada)
        push_data, data_only = _action_payload(r)
        ok = send_notification(
            r.body, channels=["push"], title=r.title, link=r.link, agent=r.agent,
            push_data=push_data, push_data_only=data_only,
        )
        if ok:
            enviados += 1
            log.info("Lembrete enviado: %s", r.key)
        else:
            falhas_envio += 1
            _release(r.key)
            log.warning("Push não entregue (%s); tentará de novo até fechar a janela.", r.key)

    if now.minute == 0:  # uma vez por hora basta
        try:
            _cleanup()
        except Exception:  # noqa: BLE001 — limpeza é acessória
            log.exception("Falha ao limpar app_reminder_log.")

    resultado = {
        "candidatos": len(candidatos),
        "vencidos": len(vencidos),
        "enviados": enviados,
        "falhas_envio": falhas_envio,
        "fontes_com_erro": fontes_com_erro,
    }
    if enviados or falhas_envio or fontes_com_erro:
        log.info("Rodada de lembretes: %s", resultado)
    if falhas_envio:
        raise RuntimeError(f"{falhas_envio} lembrete(s) não puderam ser entregues por push. {resultado}")
    return resultado


def main() -> int:
    """Execução manual: uma rodada, resumo na saída. Returns 0 em sucesso, 1 em falha."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(message)s")
    try:
        print(run())
        return 0
    except Exception as exc:  # noqa: BLE001
        log.error("Falha na rodada de lembretes: %s", exc)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
