"""Router do journal — expõe as tools do diário pessoal (Violet) como endpoints REST.

Cada endpoint embrulha diretamente uma função de tool do journal (agents/journal/*).
As tools retornam dicts com "status": "ok"/"error" — o router converte "error" em HTTP 400.

Integrações cross-domain que só este router conhece (agents/journal/ não depende delas):
    - Kurisu: Tutor de Idiomas (031), Conselho do Dia (061/076), Revisão semanal e
      leitura emocional da Violet (076);
    - Komi: sugestões do autocomplete de @ (076).

Usage:
    # Em main.py:
    from webapp.backend.routers import journal as journal_router
    app.include_router(journal_router.router, prefix="/api/journal", tags=["journal"])
"""

import re
from typing import Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from webapp.backend.deps import require_user

from agents.journal import references as journal_refs
from agents.journal import values as journal_values
from agents.journal.emotion_patterns import get_emotion_patterns
from agents.journal.reflect import get_reflect
from agents.journal.strength import get_writing_strength
from agents.journal.tools import (
    _today_sp,
    get_page,
    ensure_page,
    set_page_font,
    upsert_bullet,
    delete_bullet,
    list_heatmap,
    list_mentions,
    get_bullets_by_mention,
    get_bullets_by_ref,
    list_refs,
    search_bullets,
    set_dream,
    list_entries,
    list_collection,
    list_dreams,
    get_available_years,
    # Feature 006 — Registro Emocional TCC
    list_emotions,
    create_emotion,
    list_emotion_logs,
    list_all_emotion_logs,
    list_emotion_logs_by_ids,
    get_emotion_log,
    create_emotion_log,
    update_emotion_log,
    delete_emotion_log,
    get_emotion_stats,
    # Feature 007 — Favoritar Bullet
    set_favorite,
    list_favorite_days,
    # Cartas — registro expressivo livre ancorado ao dia
    list_letters,
    list_all_letters,
    get_letter,
    create_letter,
    update_letter,
    seal_letter,
    delete_letter,
)
from agents.journal.tools_stats import get_stats_payload

# Tutor de Idiomas (spec 031) — persona Kurisu; a lógica mora em agents/kurisu/tutor.py.
from agents.kurisu.tutor import (
    analisar_escrita,
    get_bullet_analysis,
    get_bullets_tutor_meta,
    list_analyses,
    list_concepts,
    get_progress,
    get_active_guide,
    set_active_guide,
    deactivate_guide,
)

# Conselho do Dia (spec 061, reescrito na 076) — persona Violet, lógica na Kurisu (dona do RAG).
from agents.kurisu.counsel import (
    gerar_conselho,
    get_conselho,
    list_conselhos,
    marcar_acao_como_tarefa,
)
# Revisão semanal e leitura emocional (spec 076) — mesmo desenho do Conselho.
from agents.kurisu.weekly_review import (
    gerar_revisao_semanal,
    get_revisao_semanal,
    list_revisoes,
    marcar_acao_como_tarefa as marcar_compromisso_como_tarefa,
)
from agents.kurisu.emotion_analysis import analisar_emocoes, get_analise_emocoes, classificar_distorcoes


# ─── Helpers internos ─────────────────────────────────────────────────────────

_DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')


def _check_result(result: dict) -> dict:
    """Converter ``{"status": "error"}`` de uma tool em HTTP 400; deixar "ok" passar."""
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message", "Erro desconhecido"))
    return result


def _check_date(value: Optional[str], name: str = "date") -> None:
    if value is not None and not _DATE_RE.match(value):
        raise HTTPException(status_code=400, detail=f"Formato de {name} inválido. Use YYYY-MM-DD.")


# ─── Router ───────────────────────────────────────────────────────────────────

router = APIRouter()

Font = Literal["normal", "roteiro", "cursiva"]


# ═════════════════════════════════════════════════════════════════════════════
# MODELOS PYDANTIC
# ═════════════════════════════════════════════════════════════════════════════

class UpsertBulletBody(BaseModel):
    """Inserir ou atualizar um bullet (texto vazio apaga o bullet da posição)."""
    page_id: int
    position: int
    content: str
    kind: str = 'bullet'  # default retrocompatível com bullets antigos
    person_ids: Optional[list[str]] = None


class EnsurePageBody(BaseModel):
    """Criar (se preciso) a página de um dia — chamado no primeiro write."""
    date: str
    type_id: int = 1


class PageFontBody(BaseModel):
    """Fonte do dia; ``None`` volta ao padrão das preferências."""
    date: str
    font: Optional[Font] = None
    type_id: int = 1


class DreamBody(BaseModel):
    """Corpo da requisição para atualizar o campo dream de uma page."""
    page_id: int
    dream: Optional[str] = None  # None ou string vazia limpa o campo


class CreateEmotionBody(BaseModel):
    """Corpo da requisição para criar uma emoção custom."""
    name: str


class CreateEmotionLogBody(BaseModel):
    """Registro de Pensamentos da TCC (só page_id, emotion_id e intensity são obrigatórios)."""
    page_id: int
    emotion_id: int
    intensity: int = Field(ge=0, le=10)
    situation: Optional[str] = None
    automatic_thought: Optional[str] = None
    adaptive_response: Optional[str] = None
    reappraised_intensity: Optional[int] = Field(default=None, ge=0, le=10)


class UpdateEmotionLogBody(BaseModel):
    """Atualização parcial de um registro emocional."""
    emotion_id: Optional[int] = None
    intensity: Optional[int] = Field(default=None, ge=0, le=10)
    situation: Optional[str] = None
    automatic_thought: Optional[str] = None
    adaptive_response: Optional[str] = None
    reappraised_intensity: Optional[int] = Field(default=None, ge=0, le=10)


class SetFavoriteBody(BaseModel):
    """Estado-alvo do favorito (não toggle — idempotente)."""
    favorite: bool


class CreateLetterBody(BaseModel):
    """Criar uma carta (rascunho ou já lacrada), com fonte e pessoas da Komi opcionais."""
    page_id: int
    recipient: str
    body: str
    title: Optional[str] = None
    status: Literal["draft", "sealed"] = "draft"
    person_ids: Optional[list[str]] = None
    font: Font = "normal"


class UpdateLetterBody(BaseModel):
    """Atualização parcial de uma carta em rascunho. ``person_ids`` (se enviado) regrava os vínculos."""
    recipient: Optional[str] = None
    body: Optional[str] = None
    title: Optional[str] = None
    font: Optional[Font] = None
    person_ids: Optional[list[str]] = None


class AnalyzeTutorBody(BaseModel):
    language: str = 'en'


class SaveTutorGuideBody(BaseModel):
    language: str = 'en'
    description: str
    target_concepts: Optional[list[str]] = None


class GenerateCounselBody(BaseModel):
    """Gerar (ou regerar) o conselho do dia."""
    date: str
    type_id: int = 1


class MarkCounselActionBody(BaseModel):
    page_id: int
    action_index: int
    task_id: int


class WeeklyReviewBody(BaseModel):
    """Gerar (ou regerar) a revisão de uma semana (qualquer data dentro dela; default: a última)."""
    week: Optional[str] = None


class MarkWeeklyActionBody(BaseModel):
    week_start: str
    action_index: int
    task_id: int


class EmotionAnalysisBody(BaseModel):
    since: Optional[str] = None
    until: Optional[str] = None


class ValuesAreaBody(BaseModel):
    """Salvar parte de uma área da Avaliação dos Valores."""
    description: Optional[str] = None
    narrative: Optional[str] = None
    skipped: Optional[bool] = None
    possibility: Optional[int] = Field(default=None, ge=1, le=10)
    importance_now: Optional[int] = Field(default=None, ge=1, le=10)
    importance_general: Optional[int] = Field(default=None, ge=1, le=10)
    action: Optional[int] = Field(default=None, ge=1, le=10)
    satisfaction: Optional[int] = Field(default=None, ge=1, le=10)
    concern: Optional[int] = Field(default=None, ge=1, le=10)


class ValuesCommitmentBody(BaseModel):
    domain_key: str
    text: str
    task_id: Optional[int] = None


class ValuesCommitmentUpdateBody(BaseModel):
    text: Optional[str] = None
    task_id: Optional[int] = None


class ValuesCheckinBody(BaseModel):
    domain_key: str
    action: Optional[int] = Field(default=None, ge=1, le=10)
    satisfaction: Optional[int] = Field(default=None, ge=1, le=10)
    week_start: Optional[str] = None


# ═════════════════════════════════════════════════════════════════════════════
# DIA (página, bullets, sonho, fonte)
# ═════════════════════════════════════════════════════════════════════════════

def _with_tutor(result: dict) -> dict:
    # Tutor de Idiomas (spec 031): compõe o campo `tutor` de cada bullet AQUI no router.
    bullets = result.get("bullets") or []
    if bullets:
        meta = get_bullets_tutor_meta([b["id"] for b in bullets])
        for b in bullets:
            b["tutor"] = meta.get(b["id"])
    return result


@router.get("/page")
def page_endpoint(
    date: str = Query(..., description="Data no formato YYYY-MM-DD"),
    type_id: int = Query(default=1, description="ID do tipo de diário"),
    user: dict = Depends(require_user),
) -> dict:
    """Ler o dia SEM criar (spec 076). Dia ainda vazio volta com ``page.id = null``."""
    _check_date(date)
    return _with_tutor(get_page(date=date, type_id=type_id))


@router.post("/page")
def ensure_page_endpoint(body: EnsurePageBody, user: dict = Depends(require_user)) -> dict:
    """Criar (se preciso) a página do dia — o front chama antes do primeiro write."""
    _check_date(body.date)
    result = ensure_page(date=body.date, type_id=body.type_id)
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"])
    return _with_tutor(result)


@router.put("/page/font")
def set_page_font_endpoint(body: PageFontBody, user: dict = Depends(require_user)) -> dict:
    """Fonte do dia (``normal`` | ``roteiro`` | ``cursiva`` | null = padrão)."""
    _check_date(body.date)
    return _check_result(set_page_font(date=body.date, font=body.font, type_id=body.type_id))


@router.put("/page/dream")
def set_dream_endpoint(body: DreamBody, user: dict = Depends(require_user)) -> dict:
    """Atualizar o sonho do dia (vazio limpa)."""
    return _check_result(set_dream(page_id=body.page_id, text=body.dream or ''))


@router.post("/bullets", status_code=200)
def upsert_bullet_endpoint(body: UpsertBulletBody, user: dict = Depends(require_user)) -> dict:
    """Inserir/atualizar um bullet por (page_id, position). Texto vazio apaga."""
    return _check_result(upsert_bullet(
        page_id=body.page_id, position=body.position, content=body.content,
        kind=body.kind, person_ids=body.person_ids,
    ))


@router.delete("/bullets/{bullet_id}")
def delete_bullet_endpoint(bullet_id: int, user: dict = Depends(require_user)) -> dict:
    """Apagar um bullet (devolve o que foi apagado, para o Desfazer)."""
    result = delete_bullet(bullet_id=bullet_id)
    if result.get("status") == "error":
        raise HTTPException(status_code=404, detail=result.get("message", "bullet não encontrado"))
    return result


@router.patch("/bullets/{bullet_id}/favorite")
def set_favorite_endpoint(bullet_id: int, body: SetFavoriteBody, user: dict = Depends(require_user)) -> dict:
    """Definir o favorito de um bullet (estado-alvo explícito)."""
    result = set_favorite(bullet_id=bullet_id, favorite=body.favorite)
    if result.get("status") == "error":
        raise HTTPException(status_code=404, detail=result.get("message", "bullet não encontrado"))
    return result


# ═════════════════════════════════════════════════════════════════════════════
# ARQUIVO, BUSCA, MENÇÕES E REFERÊNCIAS
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/favorite-days")
def favorite_days_endpoint(year: int = Query(...), user: dict = Depends(require_user)) -> list:
    """Datas do ano com ao menos um bullet favorito."""
    return list_favorite_days(year=year)


@router.get("/heatmap")
def heatmap_endpoint(year: int = Query(...), user: dict = Depends(require_user)) -> dict:
    """Palavras escritas por dia no ano ({"YYYY-MM-DD": words})."""
    return list_heatmap(year=year)


@router.get("/entries")
def entries_endpoint(
    q: str = Query(default='', description="Busca opcional"),
    limit: Optional[int] = Query(default=None, ge=1, le=500),
    before: Optional[str] = Query(default=None, description="Paginação: dias anteriores a esta data"),
    user: dict = Depends(require_user),
) -> list:
    """Dias com conteúdo para o Arquivo (spec 076): só o que tem algo escrito; ``num`` estável."""
    _check_date(before, "before")
    return list_entries(query=q, limit=limit, before=before)


@router.get("/mentions")
def mentions_endpoint(kind: Literal["person", "tag"] = Query(...), user: dict = Depends(require_user)) -> list:
    """Menções distintas com contagem: ``[{value, person_id, count, last_date}]``."""
    return list_mentions(kind=kind)


@router.get("/filter")
def filter_by_mention_endpoint(
    kind: Literal["person", "tag"] = Query(...),
    value: str = Query(default=""),
    person_id: Optional[str] = Query(default=None),
    user: dict = Depends(require_user),
) -> list:
    """Bullets que citam uma pessoa (por nome ou ``person_id`` da Komi) ou tag, agrupados por dia."""
    if not value and not person_id:
        raise HTTPException(status_code=400, detail="informe value ou person_id")
    return get_bullets_by_mention(kind=kind, value=value, person_id=person_id)


@router.get("/filter/ref")
def filter_by_ref_endpoint(
    agent: str = Query(...), entity_type: str = Query(...), entity_id: str = Query(...),
    user: dict = Depends(require_user),
) -> list:
    """Bullets que citam um item de outro agente (``[Matrix](akane:movie:<id>)``)."""
    return get_bullets_by_ref(agent=agent, entity_type=entity_type, entity_id=entity_id)


@router.get("/search")
def search_endpoint(q: str = Query(...), user: dict = Depends(require_user)) -> list:
    """Busca full-text nos bullets, agrupada por dia."""
    return search_bullets(query=q)


@router.get("/refs/providers")
def refs_providers_endpoint(user: dict = Depends(require_user)) -> list:
    """Agentes que dá para referenciar com "/" (o que aparece ao digitar só a barra)."""
    return journal_refs.list_providers()


@router.get("/refs/search")
def refs_search_endpoint(
    agent: str = Query(...), q: str = Query(default=""), limit: int = Query(default=8, ge=1, le=20),
    user: dict = Depends(require_user),
) -> dict:
    """Buscar itens de um agente para referenciar (``/akane Matrix``)."""
    return _check_result(journal_refs.search(agent=agent, query=q, limit=limit))


@router.get("/refs")
def refs_list_endpoint(
    agent: Optional[str] = Query(default=None), since: Optional[str] = None, until: Optional[str] = None,
    user: dict = Depends(require_user),
) -> list:
    """Itens de outros agentes citados no diário (com contagem)."""
    _check_date(since, "since")
    _check_date(until, "until")
    return list_refs(agent=agent, since=since, until=until)


@router.get("/people/suggest")
def people_suggest_endpoint(
    q: str = Query(default=""), limit: int = Query(default=8, ge=1, le=20), user: dict = Depends(require_user),
) -> dict:
    """Sugestões da Komi para o autocomplete de @ (prefixo no nome ou apelido)."""
    from agents.komi.tools import suggest_people  # noqa: PLC0415 — Komi é opcional
    return _check_result(suggest_people(query=q, limit=limit))


# ═════════════════════════════════════════════════════════════════════════════
# COLEÇÕES, INSIGHTS, FORÇA E REFLETIR
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/collection/{kind}")
def collection_endpoint(kind: str, user: dict = Depends(require_user)) -> list:
    """Bullets de um tipo (highlight, idea, wisdom, note, dream)."""
    if kind not in {'highlight', 'dream', 'idea', 'wisdom', 'note'}:
        raise HTTPException(status_code=400, detail="kind inválido")
    return list_collection(kind=kind)


@router.get("/dreams")
def dreams_endpoint(user: dict = Depends(require_user)) -> list:
    """Dias com o campo sonho preenchido."""
    return list_dreams()


@router.get("/stats")
def stats_endpoint(
    year: int = Query(...),
    month: Optional[int] = Query(default=None, ge=1, le=12),
    weekly_target: float = Query(default=5, ge=1, le=7),
    user: dict = Depends(require_user),
) -> dict:
    """Insights no contrato ``StatsPayload`` do DS (+ blocos ``strength`` e ``emotions``)."""
    return get_stats_payload(year=year, month=month, weekly_target=weekly_target)


@router.get("/strength")
def strength_endpoint(
    weekly_target: float = Query(default=5, ge=1, le=7),
    days: int = Query(default=90, ge=7, le=365),
    user: dict = Depends(require_user),
) -> dict:
    """Força da escrita (motor dos hábitos da Kaguya) com a série dos últimos ``days`` dias."""
    return get_writing_strength(weekly_target=weekly_target, days=days)


@router.get("/years")
def years_endpoint(user: dict = Depends(require_user)) -> list:
    """Anos com registro no diário, do mais recente ao primeiro."""
    return get_available_years()


@router.get("/reflect")
def reflect_endpoint(
    date: Optional[str] = Query(default=None),
    pins: str = Query(default="", description="tag:x,person:<id>"),
    prompt: int = 0, gem: int = 0, idea: int = 0, memory: int = 0,
    user: dict = Depends(require_user),
) -> dict:
    """Todas as seções do Refletir (a semente muda por dia; os contadores sorteiam de novo)."""
    from datetime import date as _date  # noqa: PLC0415
    _check_date(date)
    day = _date.fromisoformat(date) if date else _today_sp()
    result = get_reflect(
        day, pins=[p for p in pins.split(",") if p.strip()],
        reroll={"prompt": prompt, "gem": gem, "idea": idea, "memory_lane": memory},
    )
    # Revisão semanal mais recente (aparece no topo do Refletir no domingo e na segunda).
    try:
        result["weekly_review"] = get_revisao_semanal(None)
    except Exception:  # noqa: BLE001
        result["weekly_review"] = None
    return result


# ═════════════════════════════════════════════════════════════════════════════
# REGISTRO EMOCIONAL (TCC)
# ═════════════════════════════════════════════════════════════════════════════

def _validate_reappraisal(reappraised_intensity, adaptive_response) -> None:
    """A reavaliação de intensidade só vale com resposta adaptativa preenchida."""
    if reappraised_intensity is not None and not (adaptive_response and adaptive_response.strip()):
        raise HTTPException(
            status_code=400,
            detail="A reavaliação de intensidade exige uma resposta adaptativa preenchida.",
        )


@router.get("/emotions")
def list_emotions_endpoint(user: dict = Depends(require_user)) -> list:
    """Vocabulário de emoções (predefinidas primeiro)."""
    return list_emotions()


@router.post("/emotions", status_code=201)
def create_emotion_endpoint(body: CreateEmotionBody, user: dict = Depends(require_user)) -> dict:
    """Criar emoção custom (idempotente)."""
    return _check_result(create_emotion(name=body.name))


@router.get("/emotion-logs")
def list_emotion_logs_endpoint(page_id: int = Query(...), user: dict = Depends(require_user)) -> list:
    """Registros emocionais de um dia."""
    return list_emotion_logs(page_id=page_id)


@router.get("/emotion-logs/all")
def list_all_emotion_logs_endpoint(
    emotion_id: Optional[int] = None,
    min_intensity: Optional[int] = Query(default=None, ge=0, le=10),
    q: Optional[str] = None,
    since: Optional[str] = None,
    until: Optional[str] = None,
    limit: int = Query(default=50, ge=1, le=1000),
    before: Optional[str] = None,
    ids: Optional[str] = Query(default=None, description="IDs separados por vírgula (evidência de um achado)"),
    user: dict = Depends(require_user),
) -> list:
    """Todos os registros emocionais (aba Registro emocional), com filtros."""
    for v, n in ((since, "since"), (until, "until"), (before, "before")):
        _check_date(v, n)
    if ids:
        return list_emotion_logs_by_ids([int(i) for i in ids.split(",") if i.strip().isdigit()])
    return list_all_emotion_logs(emotion_id=emotion_id, min_intensity=min_intensity, q=q,
                                 since=since, until=until, limit=limit, before=before)


@router.get("/emotion-logs/{log_id}")
def get_emotion_log_endpoint(log_id: int, user: dict = Depends(require_user)) -> dict:
    result = get_emotion_log(log_id)
    if result.get("status") == "error":
        raise HTTPException(status_code=404, detail=result["message"])
    return result


@router.post("/emotion-logs", status_code=201)
def create_emotion_log_endpoint(
    body: CreateEmotionLogBody, background: BackgroundTasks, user: dict = Depends(require_user),
) -> dict:
    """Criar um registro emocional. Se tiver pensamento automático, classifica as distorções
    cognitivas em segundo plano (best-effort — falha só deixa o registro sem rótulo)."""
    _validate_reappraisal(body.reappraised_intensity, body.adaptive_response)
    result = _check_result(create_emotion_log(**body.model_dump()))
    if (body.automatic_thought or "").strip():
        background.add_task(classificar_distorcoes, result["log"]["id"])
    return result


@router.patch("/emotion-logs/{log_id}")
def update_emotion_log_endpoint(
    log_id: int, body: UpdateEmotionLogBody, background: BackgroundTasks, user: dict = Depends(require_user),
) -> dict:
    """Atualização parcial; mudou o pensamento automático → reclassifica as distorções."""
    _validate_reappraisal(body.reappraised_intensity, body.adaptive_response)
    updates = body.model_dump(exclude_unset=True)
    result = _check_result(update_emotion_log(log_id, **updates))
    if "automatic_thought" in updates and (updates["automatic_thought"] or "").strip():
        background.add_task(classificar_distorcoes, log_id)
    return result


@router.delete("/emotion-logs/{log_id}")
def delete_emotion_log_endpoint(log_id: int, user: dict = Depends(require_user)) -> dict:
    result = delete_emotion_log(log_id=log_id)
    if result.get("status") == "error":
        raise HTTPException(status_code=404, detail=result.get("message", "registro não encontrado"))
    return result


@router.get("/emotion-stats")
def emotion_stats_endpoint(
    year: Optional[int] = None, since: Optional[str] = None, until: Optional[str] = None,
    user: dict = Depends(require_user),
) -> dict:
    """Agregações de emoções do ano ou de um intervalo."""
    _check_date(since, "since")
    _check_date(until, "until")
    return get_emotion_stats(year=year, since=since, until=until)


@router.get("/emotion-patterns")
def emotion_patterns_endpoint(
    since: Optional[str] = None, until: Optional[str] = None, user: dict = Depends(require_user),
) -> dict:
    """Camada 1 da análise: padrões determinísticos com evidência (sem IA)."""
    _check_date(since, "since")
    _check_date(until, "until")
    return get_emotion_patterns(since=since, until=until)


@router.get("/emotion-analysis")
def get_emotion_analysis_endpoint(
    since: Optional[str] = None, until: Optional[str] = None, user: dict = Depends(require_user),
) -> dict:
    """Leitura da Violet já gerada para o período (sem gerar)."""
    _check_date(since, "since")
    _check_date(until, "until")
    return {"analysis": get_analise_emocoes(since=since, until=until)}


@router.post("/emotion-analysis")
def generate_emotion_analysis_endpoint(body: EmotionAnalysisBody, user: dict = Depends(require_user)) -> dict:
    """Gerar a leitura da Violet sobre os registros do período (chamada longa)."""
    _check_date(body.since, "since")
    _check_date(body.until, "until")
    return _check_result(analisar_emocoes(since=body.since, until=body.until))


# ═════════════════════════════════════════════════════════════════════════════
# CARTAS
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/letters")
def list_letters_endpoint(page_id: int = Query(...), user: dict = Depends(require_user)) -> list:
    """Cartas de um dia, com as pessoas vinculadas."""
    return list_letters(page_id=page_id)


@router.get("/letters/all")
def list_all_letters_endpoint(
    status: Optional[Literal["draft", "sealed"]] = None,
    person_id: Optional[str] = None,
    q: Optional[str] = None,
    limit: int = Query(default=50, ge=1, le=200),
    before: Optional[str] = None,
    user: dict = Depends(require_user),
) -> list:
    """Todas as cartas (aba Cartas), da mais recente para a mais antiga."""
    _check_date(before, "before")
    return list_all_letters(status=status, person_id=person_id, q=q, limit=limit, before=before)


@router.get("/letters/{letter_id}")
def get_letter_endpoint(letter_id: int, user: dict = Depends(require_user)) -> dict:
    result = get_letter(letter_id)
    if result.get("status") == "error":
        raise HTTPException(status_code=404, detail=result["message"])
    return result


@router.post("/letters", status_code=201)
def create_letter_endpoint(body: CreateLetterBody, user: dict = Depends(require_user)) -> dict:
    """Criar uma carta (rascunho ou lacrada), com fonte e pessoas."""
    return _check_result(create_letter(**body.model_dump()))


@router.patch("/letters/{letter_id}")
def update_letter_endpoint(letter_id: int, body: UpdateLetterBody, user: dict = Depends(require_user)) -> dict:
    """Atualizar uma carta em rascunho. ``person_ids`` (se enviado) regrava os vínculos."""
    updates = body.model_dump(exclude_unset=True)
    person_ids = updates.pop("person_ids", None)
    return _check_result(update_letter(letter_id, person_ids=person_ids, **updates))


@router.post("/letters/{letter_id}/seal")
def seal_letter_endpoint(letter_id: int, user: dict = Depends(require_user)) -> dict:
    """Lacrar uma carta (vira registro imutável)."""
    return _check_result(seal_letter(letter_id=letter_id))


@router.delete("/letters/{letter_id}")
def delete_letter_endpoint(letter_id: int, user: dict = Depends(require_user)) -> dict:
    result = delete_letter(letter_id=letter_id)
    if result.get("status") == "error":
        raise HTTPException(status_code=404, detail=result.get("message", "carta não encontrada"))
    return result


# ═════════════════════════════════════════════════════════════════════════════
# AVALIAÇÃO DOS VALORES (spec 076)
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/values/domains")
def values_domains_endpoint(user: dict = Depends(require_user)) -> dict:
    """O roteiro: introdução, 12 áreas com perguntas-guia, as 6 notas e a pergunta-chave."""
    return journal_values.get_domains()


@router.get("/values/current")
def values_current_endpoint(user: dict = Depends(require_user)) -> dict:
    """Rascunho em andamento ou a última avaliação concluída (com diagnóstico)."""
    return journal_values.get_current()


@router.post("/values")
def values_start_endpoint(user: dict = Depends(require_user)) -> dict:
    """Começar (ou retomar) uma avaliação — refazer parte da anterior pré-preenchida."""
    return journal_values.start_assessment()


@router.delete("/values/draft")
def values_discard_endpoint(user: dict = Depends(require_user)) -> dict:
    return journal_values.discard_draft()


@router.patch("/values/{assessment_id}/areas/{domain_key}")
def values_area_endpoint(
    assessment_id: int, domain_key: str, body: ValuesAreaBody, user: dict = Depends(require_user),
) -> dict:
    """Autosave de uma área (texto, narrativa, pular, notas 1–10)."""
    return _check_result(journal_values.update_area(assessment_id, domain_key, **body.model_dump(exclude_unset=True)))


@router.post("/values/{assessment_id}/complete")
def values_complete_endpoint(assessment_id: int, user: dict = Depends(require_user)) -> dict:
    return _check_result(journal_values.complete_assessment(assessment_id))


@router.get("/values/history")
def values_history_endpoint(user: dict = Depends(require_user)) -> dict:
    """Avaliações concluídas + evolução por área."""
    return journal_values.list_history()


@router.post("/values/{assessment_id}/commitments", status_code=201)
def values_add_commitment_endpoint(
    assessment_id: int, body: ValuesCommitmentBody, user: dict = Depends(require_user),
) -> dict:
    return _check_result(journal_values.add_commitment(assessment_id, body.domain_key, body.text, body.task_id))


@router.patch("/values/commitments/{commitment_id}")
def values_update_commitment_endpoint(
    commitment_id: int, body: ValuesCommitmentUpdateBody, user: dict = Depends(require_user),
) -> dict:
    return _check_result(journal_values.update_commitment(commitment_id, body.text, body.task_id))


@router.delete("/values/commitments/{commitment_id}")
def values_delete_commitment_endpoint(commitment_id: int, user: dict = Depends(require_user)) -> dict:
    return journal_values.delete_commitment(commitment_id)


@router.post("/values/checkin")
def values_checkin_endpoint(body: ValuesCheckinBody, user: dict = Depends(require_user)) -> dict:
    """Check-in semanal leve (ação e satisfação da semana que passou) de uma área."""
    _check_date(body.week_start, "week_start")
    return _check_result(journal_values.checkin(body.domain_key, body.action, body.satisfaction, body.week_start))


@router.get("/values/checkins")
def values_checkins_endpoint(weeks: int = Query(default=8, ge=1, le=52), user: dict = Depends(require_user)) -> list:
    return journal_values.list_checkins(weeks)


# ═════════════════════════════════════════════════════════════════════════════
# TUTOR DE IDIOMAS (spec 031 — persona Kurisu)
# ═════════════════════════════════════════════════════════════════════════════

@router.post("/bullets/{bullet_id}/tutor")
def analyze_tutor_endpoint(bullet_id: int, body: AnalyzeTutorBody, user: dict = Depends(require_user)) -> dict:
    """Analisar a escrita de um bullet via Gemini."""
    return _check_result(analisar_escrita(bullet_id=bullet_id, language=body.language))


@router.get("/bullets/{bullet_id}/tutor")
def bullet_tutor_analysis_endpoint(bullet_id: int, user: dict = Depends(require_user)) -> dict:
    """Última análise de um bullet (toggle original↔corrigido)."""
    return {"analysis": get_bullet_analysis(bullet_id=bullet_id)}


@router.get("/tutor/progress")
def tutor_progress_endpoint(language: str = 'en', user: dict = Depends(require_user)) -> dict:
    return get_progress(language=language)


@router.get("/tutor/analyses")
def tutor_analyses_endpoint(language: str = 'en', limit: int = 20, user: dict = Depends(require_user)) -> list:
    return list_analyses(language=language, limit=limit)


@router.get("/tutor/concepts")
def tutor_concepts_endpoint(user: dict = Depends(require_user)) -> list:
    return list_concepts()


@router.get("/tutor/guide")
def get_tutor_guide_endpoint(language: str = 'en', user: dict = Depends(require_user)) -> dict:
    return {"guide": get_active_guide(language=language)}


@router.put("/tutor/guide")
def save_tutor_guide_endpoint(body: SaveTutorGuideBody, user: dict = Depends(require_user)) -> dict:
    return _check_result(set_active_guide(
        language=body.language, description=body.description, target_concepts=body.target_concepts,
    ))


@router.delete("/tutor/guide")
def delete_tutor_guide_endpoint(language: str = 'en', user: dict = Depends(require_user)) -> dict:
    return _check_result(deactivate_guide(language=language))


# ═════════════════════════════════════════════════════════════════════════════
# CONSELHO DO DIA E REVISÃO SEMANAL (persona Violet, lógica na Kurisu)
# ═════════════════════════════════════════════════════════════════════════════

@router.post("/counsel")
def generate_counsel_endpoint(body: GenerateCounselBody, user: dict = Depends(require_user)) -> dict:
    """Gerar (ou regerar) o conselho do dia — chamada longa (até ~90s)."""
    _check_date(body.date)
    return _check_result(gerar_conselho(date=body.date, type_id=body.type_id))


@router.get("/counsel")
def get_counsel_endpoint(date: str = Query(...), type_id: int = 1, user: dict = Depends(require_user)) -> dict:
    """Conselho já gerado de uma data (leitura pura)."""
    _check_date(date)
    return {"counsel": get_conselho(date=date, type_id=type_id)}


@router.get("/counsel/history")
def counsel_history_endpoint(limit: int = 20, user: dict = Depends(require_user)) -> dict:
    """Conselhos mais recentes (trajetória: humor e princípios por dia)."""
    return {"items": list_conselhos(limit=limit)}


@router.patch("/counsel/actions")
def mark_counsel_action_endpoint(body: MarkCounselActionBody, user: dict = Depends(require_user)) -> dict:
    """Registrar que uma ação sugerida virou tarefa (o front cria a tarefa antes)."""
    result = marcar_acao_como_tarefa(page_id=body.page_id, action_index=body.action_index, task_id=body.task_id)
    if result.get("status") == "error":
        raise HTTPException(status_code=404, detail=result.get("message", "conselho não encontrado"))
    return result


@router.get("/weekly-review")
def get_weekly_review_endpoint(week: Optional[str] = None, user: dict = Depends(require_user)) -> dict:
    """Revisão de uma semana (qualquer data dentro dela); sem ``week``, a mais recente."""
    _check_date(week, "week")
    return {"review": get_revisao_semanal(week)}


@router.post("/weekly-review")
def generate_weekly_review_endpoint(body: WeeklyReviewBody, user: dict = Depends(require_user)) -> dict:
    """Gerar (ou regerar) a revisão semanal — chamada longa."""
    _check_date(body.week, "week")
    return _check_result(gerar_revisao_semanal(body.week))


@router.get("/weekly-review/history")
def weekly_review_history_endpoint(limit: int = 12, user: dict = Depends(require_user)) -> dict:
    return {"items": list_revisoes(limit=limit)}


@router.patch("/weekly-review/actions")
def mark_weekly_action_endpoint(body: MarkWeeklyActionBody, user: dict = Depends(require_user)) -> dict:
    """Registrar que um compromisso da revisão semanal virou tarefa (o front cria a tarefa antes)."""
    _check_date(body.week_start, "week_start")
    result = marcar_compromisso_como_tarefa(body.week_start, body.action_index, body.task_id)
    if result.get("status") == "error":
        raise HTTPException(status_code=404, detail=result["message"])
    return result
