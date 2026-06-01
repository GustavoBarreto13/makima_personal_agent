# Servidor MCP do Google Calendar — expõe tools de leitura e escrita de eventos.
# Roda como processo filho do agente Kaguya (iniciado pelo ADK via McpToolset).
# Leitura: todos os calendários. Escrita: apenas GOOGLE_CALENDAR_MAIN_CALENDAR_ID.

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from mcp.server.fastmcp import FastMCP

# Inicializa o servidor MCP
mcp = FastMCP("google_calendar")

# Escopo OAuth necessário (leitura + escrita)
_SCOPES = ["https://www.googleapis.com/auth/calendar"]

# Cache do cliente da API em memória (recriado se token renovar)
_service = None
_cached_creds: Optional[Credentials] = None


def _get_service():
    """Retorna o cliente da Google Calendar API, renovando o token se necessário."""
    global _service, _cached_creds

    # Lê as credenciais das variáveis de ambiente
    access_token = os.environ.get("GOOGLE_CALENDAR_ACCESS_TOKEN", "")
    refresh_token = os.environ.get("GOOGLE_CALENDAR_REFRESH_TOKEN", "")
    client_id = os.environ.get("GOOGLE_CALENDAR_CLIENT_ID", "")
    client_secret = os.environ.get("GOOGLE_CALENDAR_CLIENT_SECRET", "")
    token_expiry_str = os.environ.get("GOOGLE_CALENDAR_TOKEN_EXPIRY", "")

    # Converte a string de expiração para datetime com timezone UTC
    token_expiry = None
    if token_expiry_str:
        try:
            token_expiry = datetime.fromisoformat(token_expiry_str)
            # Garante que o datetime tem timezone para comparação correta
            if token_expiry.tzinfo is None:
                token_expiry = token_expiry.replace(tzinfo=timezone.utc)
        except ValueError:
            pass

    # Cria o objeto de credenciais do Google
    creds = Credentials(
        token=access_token,
        refresh_token=refresh_token,
        client_id=client_id,
        client_secret=client_secret,
        token_uri="https://oauth2.googleapis.com/token",
        scopes=_SCOPES,
        expiry=token_expiry,
    )

    # Renova o token se estiver expirado ou prestes a expirar (margem de 5 minutos)
    if token_expiry and datetime.now(timezone.utc) >= token_expiry - timedelta(minutes=5):
        creds.refresh(Request())
        # Atualiza as vars em memória com o novo token
        os.environ["GOOGLE_CALENDAR_ACCESS_TOKEN"] = creds.token
        if creds.expiry:
            os.environ["GOOGLE_CALENDAR_TOKEN_EXPIRY"] = creds.expiry.isoformat()
        _service = None  # força recriação do serviço com novo token

    # Cria o cliente da API apenas se necessário
    if _service is None:
        _service = build("calendar", "v3", credentials=creds, cache_discovery=False)

    return _service


def _main_calendar_id() -> str:
    """Retorna o ID do calendário principal configurado nas env vars."""
    cal_id = os.environ.get("GOOGLE_CALENDAR_MAIN_CALENDAR_ID", "")
    if not cal_id:
        raise EnvironmentError("GOOGLE_CALENDAR_MAIN_CALENDAR_ID não configurado")
    return cal_id


def _assert_is_main_calendar(calendar_id: str) -> None:
    """Lança erro se calendar_id não for o calendário principal.
    Impede escrita acidental em calendários secundários (aniversários, feriados, etc.)."""
    main = _main_calendar_id()
    if calendar_id != main:
        raise PermissionError(
            f"Escrita permitida apenas no calendário principal '{main}'. "
            f"'{calendar_id}' é somente leitura."
        )


@mcp.tool()
def list_calendars() -> list[dict]:
    """Lista todos os calendários disponíveis na conta Google do usuário.

    Retorna:
        Lista de dicts com id, summary (nome) e accessRole de cada calendário.
    """
    service = _get_service()
    result = service.calendarList().list().execute()
    calendars = result.get("items", [])
    # Retorna apenas os campos relevantes para o agente
    return [
        {
            "id": cal["id"],
            "name": cal.get("summary", ""),
            "role": cal.get("accessRole", ""),
            "is_main": cal["id"] == os.environ.get("GOOGLE_CALENDAR_MAIN_CALENDAR_ID", ""),
        }
        for cal in calendars
    ]


@mcp.tool()
def list_events(
    calendar_id: str,
    date_from: str,
    date_to: str,
    max_results: int = 50,
) -> list[dict]:
    """Lista eventos de um calendário num intervalo de datas.

    Args:
        calendar_id: ID do calendário (obtido via list_calendars).
        date_from: Data de início no formato YYYY-MM-DD.
        date_to: Data de fim no formato YYYY-MM-DD (inclusive).
        max_results: Número máximo de eventos a retornar (padrão 50).

    Retorna:
        Lista de dicts com id, summary, start, end, description, location de cada evento.
    """
    service = _get_service()

    # Converte datas para formato RFC3339 exigido pela API (início do dia / fim do dia)
    time_min = f"{date_from}T00:00:00Z"
    time_max = f"{date_to}T23:59:59Z"

    result = service.events().list(
        calendarId=calendar_id,
        timeMin=time_min,
        timeMax=time_max,
        maxResults=max_results,
        singleEvents=True,   # expande eventos recorrentes em instâncias individuais
        orderBy="startTime",
    ).execute()

    events = result.get("items", [])
    return [_format_event(e) for e in events]


@mcp.tool()
def list_events_today() -> dict:
    """Lista eventos do dia corrente em TODOS os calendários do usuário.

    Retorna:
        Dict com chave = nome do calendário, valor = lista de eventos do dia.
    """
    service = _get_service()
    today = datetime.now(timezone.utc).date()
    date_str = today.isoformat()

    # Busca todos os calendários disponíveis
    cal_result = service.calendarList().list().execute()
    calendars = cal_result.get("items", [])

    time_min = f"{date_str}T00:00:00Z"
    time_max = f"{date_str}T23:59:59Z"

    all_events: dict[str, list] = {}
    for cal in calendars:
        cal_id = cal["id"]
        cal_name = cal.get("summary", cal_id)

        try:
            result = service.events().list(
                calendarId=cal_id,
                timeMin=time_min,
                timeMax=time_max,
                maxResults=50,
                singleEvents=True,
                orderBy="startTime",
            ).execute()
            events = result.get("items", [])
            if events:  # só inclui calendários com eventos hoje
                all_events[cal_name] = [_format_event(e) for e in events]
        except Exception:
            # Calendários sem permissão de leitura são ignorados silenciosamente
            pass

    return all_events


@mcp.tool()
def get_event(calendar_id: str, event_id: str) -> dict:
    """Retorna os detalhes completos de um evento específico.

    Args:
        calendar_id: ID do calendário que contém o evento.
        event_id: ID do evento (obtido via list_events ou list_events_today).

    Retorna:
        Dict com todos os campos do evento.
    """
    service = _get_service()
    event = service.events().get(calendarId=calendar_id, eventId=event_id).execute()
    return _format_event(event)


@mcp.tool()
def create_event(
    summary: str,
    start_datetime: str,
    end_datetime: str,
    description: str = "",
    location: str = "",
    attendees: list[str] = None,
) -> dict:
    """Cria um novo evento no calendário principal do usuário.

    Args:
        summary: Título do evento.
        start_datetime: Data e hora de início no formato ISO 8601 (ex: 2026-06-01T15:00:00).
        end_datetime: Data e hora de fim no formato ISO 8601 (ex: 2026-06-01T16:00:00).
        description: Descrição opcional do evento.
        location: Local opcional do evento.
        attendees: Lista opcional de emails dos convidados.

    Retorna:
        Dict com id e link do evento criado.
    """
    service = _get_service()
    calendar_id = _main_calendar_id()

    # Monta o corpo do evento no formato exigido pela API
    event_body = {
        "summary": summary,
        "start": {"dateTime": start_datetime, "timeZone": "America/Sao_Paulo"},
        "end": {"dateTime": end_datetime, "timeZone": "America/Sao_Paulo"},
    }
    if description:
        event_body["description"] = description
    if location:
        event_body["location"] = location
    if attendees:
        event_body["attendees"] = [{"email": email} for email in attendees]

    created = service.events().insert(calendarId=calendar_id, body=event_body).execute()
    return {"id": created["id"], "link": created.get("htmlLink", ""), "summary": created["summary"]}


@mcp.tool()
def update_event(
    event_id: str,
    summary: str = None,
    start_datetime: str = None,
    end_datetime: str = None,
    description: str = None,
    location: str = None,
) -> dict:
    """Atualiza campos de um evento existente no calendário principal.

    Args:
        event_id: ID do evento a atualizar.
        summary: Novo título (opcional — omita para não alterar).
        start_datetime: Nova data/hora de início em ISO 8601 (opcional).
        end_datetime: Nova data/hora de fim em ISO 8601 (opcional).
        description: Nova descrição (opcional).
        location: Novo local (opcional).

    Retorna:
        Dict com os campos atualizados do evento.
    """
    service = _get_service()
    calendar_id = _main_calendar_id()

    # Busca o evento atual para fazer patch (atualização parcial)
    existing = service.events().get(calendarId=calendar_id, eventId=event_id).execute()

    # Aplica apenas os campos informados
    if summary is not None:
        existing["summary"] = summary
    if start_datetime is not None:
        existing["start"] = {"dateTime": start_datetime, "timeZone": "America/Sao_Paulo"}
    if end_datetime is not None:
        existing["end"] = {"dateTime": end_datetime, "timeZone": "America/Sao_Paulo"}
    if description is not None:
        existing["description"] = description
    if location is not None:
        existing["location"] = location

    updated = service.events().update(
        calendarId=calendar_id, eventId=event_id, body=existing
    ).execute()
    return _format_event(updated)


@mcp.tool()
def delete_event(event_id: str) -> dict:
    """Remove um evento do calendário principal. Esta ação é irreversível.

    Args:
        event_id: ID do evento a remover.

    Retorna:
        Dict com status 'deleted' e o event_id removido.
    """
    service = _get_service()
    calendar_id = _main_calendar_id()
    service.events().delete(calendarId=calendar_id, eventId=event_id).execute()
    return {"status": "deleted", "event_id": event_id}


@mcp.tool()
def find_free_slots(
    date_from: str,
    date_to: str,
    duration_minutes: int = 60,
) -> list[dict]:
    """Encontra horários livres em TODOS os calendários num intervalo de datas.

    Usa a API freebusy do Google Calendar para verificar disponibilidade real.

    Args:
        date_from: Data de início no formato YYYY-MM-DD.
        date_to: Data de fim no formato YYYY-MM-DD.
        duration_minutes: Duração mínima do slot livre em minutos (padrão 60).

    Retorna:
        Lista de dicts com start e end de cada horário livre encontrado.
    """
    service = _get_service()

    # Busca todos os calendários para incluir na query de freebusy
    cal_result = service.calendarList().list().execute()
    calendar_ids = [{"id": cal["id"]} for cal in cal_result.get("items", [])]

    time_min = f"{date_from}T08:00:00Z"  # considera dia útil a partir das 8h
    time_max = f"{date_to}T22:00:00Z"   # até as 22h

    freebusy_result = service.freebusy().query(body={
        "timeMin": time_min,
        "timeMax": time_max,
        "items": calendar_ids,
    }).execute()

    # Coleta todos os períodos ocupados de todos os calendários
    busy_periods = []
    for cal_data in freebusy_result.get("calendars", {}).values():
        for period in cal_data.get("busy", []):
            busy_periods.append((
                datetime.fromisoformat(period["start"].replace("Z", "+00:00")),
                datetime.fromisoformat(period["end"].replace("Z", "+00:00")),
            ))

    # Ordena e mescla os períodos ocupados sobrepostos
    busy_periods.sort(key=lambda x: x[0])
    merged_busy = []
    for start, end in busy_periods:
        if merged_busy and start <= merged_busy[-1][1]:
            merged_busy[-1] = (merged_busy[-1][0], max(merged_busy[-1][1], end))
        else:
            merged_busy.append((start, end))

    # Encontra os slots livres entre os períodos ocupados
    free_slots = []
    current = datetime.fromisoformat(time_min.replace("Z", "+00:00"))
    end_boundary = datetime.fromisoformat(time_max.replace("Z", "+00:00"))
    min_duration = timedelta(minutes=duration_minutes)

    for busy_start, busy_end in merged_busy:
        if current < busy_start and (busy_start - current) >= min_duration:
            free_slots.append({
                "start": current.isoformat(),
                "end": busy_start.isoformat(),
                "duration_minutes": int((busy_start - current).total_seconds() / 60),
            })
        current = max(current, busy_end)

    # Verifica o slot após o último período ocupado
    if current < end_boundary and (end_boundary - current) >= min_duration:
        free_slots.append({
            "start": current.isoformat(),
            "end": end_boundary.isoformat(),
            "duration_minutes": int((end_boundary - current).total_seconds() / 60),
        })

    return free_slots


def _format_event(event: dict) -> dict:
    """Normaliza um evento da API para o formato retornado pelas tools."""
    start = event.get("start", {})
    end = event.get("end", {})
    return {
        "id": event.get("id", ""),
        "summary": event.get("summary", "(sem título)"),
        "start": start.get("dateTime", start.get("date", "")),
        "end": end.get("dateTime", end.get("date", "")),
        "description": event.get("description", ""),
        "location": event.get("location", ""),
        "attendees": [a.get("email", "") for a in event.get("attendees", [])],
        "calendar_id": event.get("organizer", {}).get("email", ""),
        "link": event.get("htmlLink", ""),
    }


if __name__ == "__main__":
    # Ponto de entrada quando iniciado como processo filho pelo ADK
    mcp.run(transport="stdio")
