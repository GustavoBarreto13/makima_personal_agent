"""Router de pessoas (Komi) — expõe as tools como endpoints REST.

Camada fina: cada endpoint delega para a tool correspondente em ``agents.komi``. A lógica de
negócio (smart-match, espaço trabalho × pessoal, mesclar, memória, IA) fica SEMPRE nas tools.

IMPORTANTE: rotas com path fixo (``/search``, ``/stats``, ``/categories``, ``/groups``, ``/merge``...)
DEVEM ser registradas ANTES de ``/{person_id}``, senão o FastAPI as interpreta como IDs.

Usage:
    # Em main.py:
    from webapp.backend.routers import pessoas as pessoas_router
    app.include_router(pessoas_router.router, prefix="/api/people", tags=["people"])
"""

import os        # Para manipular caminhos de arquivo ao salvar o avatar
import uuid      # Para gerar nome único do arquivo de avatar
from typing import Optional

# Imports do FastAPI: APIRouter (agrupa rotas), Depends (autenticação), HTTPException (erros HTTP)
# File e UploadFile: para receber arquivos via multipart/form-data
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field

# Dependência de autenticação — obrigatória em TODAS as rotas /api/*
from webapp.backend.deps import require_user

# ── Tools da Komi — importadas diretamente (sem instanciar agente ADK) ────────
from agents.komi.briefing import get_person_briefing
from agents.komi.integration import get_person_memory, link_item, unlink_item
from agents.komi.tools import (
    add_alias,
    add_important_date,
    create_person,
    delete_important_date,
    delete_person,
    find_people,
    get_people_overview,
    get_person,
    get_person_summary,
    list_people,
    remove_alias,
    restore_person,
    suggest_people,
    update_important_date,
    update_person,
)
from agents.komi.tools_categories import (
    archive_category,
    create_category,
    list_categories,
    reorder_categories,
    unarchive_category,
    update_category,
)
from agents.komi.tools_interactions import (
    delete_interaction,
    list_interactions,
    log_interaction,
    restore_interaction,
    update_interaction,
)
from agents.komi.tools_merge import find_duplicates, merge_people, preview_merge
from agents.komi.tools_notes import (
    accept_person_note,
    add_person_note,
    delete_person_note,
    dismiss_person_note,
    list_person_notes,
    restore_person_note,
    update_person_note,
)
from agents.komi.tools_relations import (
    add_to_group,
    create_group,
    delete_group,
    list_groups,
    list_person_groups,
    list_relation_kinds,
    list_relations,
    relate_people,
    remove_from_group,
    rename_group,
    unrelate_people,
)
from agents.komi.tools_stats import get_stats_payload

# ── Diretório de uploads de avatar ───────────────────────────────────────────
# Reutiliza o mesmo diretório de ícones de finanças (já montado como /uploads/icons/)
_UPLOADS_DIR = os.path.join(
    os.path.dirname(__file__),   # webapp/backend/routers/
    "..",                        # webapp/backend/
    "..",                        # webapp/
    "uploads",                   # webapp/uploads/
    "icons",                     # webapp/uploads/icons/ (já existente para finanças)
)

# Tipos MIME aceitos para avatar (iguais ao upload_icon de finanças)
_ALLOWED_MIME = {"image/png", "image/jpeg", "image/webp", "image/gif"}
# Tamanho máximo em bytes (1 MB)
_MAX_SIZE_BYTES = 1 * 1024 * 1024


# ─── IA da Kurisu: import lazy (o módulo puxa a Vertex AI e custa caro no import) ───

def gerar_resumo(person_id: str, context: str = "all", force: bool = False) -> dict:
    """Gerar (ou ler do cache) o resumo de IA da Memória da pessoa.

    Args:
        person_id: UUID da pessoa.
        context: ``all`` | ``personal`` | ``work``.
        force: Regera mesmo que a Memória não tenha mudado.

    Returns:
        O retorno de ``agents.kurisu.person_summary.gerar_resumo``.
    """
    from agents.kurisu.person_summary import gerar_resumo as _gerar  # noqa: PLC0415
    return _gerar(person_id, context=context, force=force)


def resumo_da_pessoa(person_id: str, context: str = "all") -> dict:
    """Ler o resumo de IA guardado (sem chamar a IA).

    Args:
        person_id: UUID da pessoa.
        context: ``all`` | ``personal`` | ``work``.

    Returns:
        O retorno de ``agents.kurisu.person_summary.resumo_da_pessoa``.
    """
    from agents.kurisu.person_summary import resumo_da_pessoa as _ler  # noqa: PLC0415
    return _ler(person_id, context=context)


# ─── Helper de resultado ────────────────────────────────────────────────────

def _check_result(result: dict) -> dict:
    """Converte resposta de erro das tools em HTTP 400; deixa 'ok' passar.

    As tools da Komi retornam ``{"status": "ok"|"error", "message": ...}``.

    Args:
        result: Dict retornado por uma tool da Komi.

    Returns:
        O mesmo dict se ``status != "error"``.

    Raises:
        HTTPException: 400 se ``status == "error"``.
    """
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message", "Erro desconhecido."))
    return result


def _no_content(result: dict) -> None:
    """Converte erro de tool em HTTP 400 para rotas que respondem 204.

    Args:
        result: Dict retornado por uma tool da Komi.

    Raises:
        HTTPException: 400 se ``status == "error"``.
    """
    _check_result(result)


# ─── Router ─────────────────────────────────────────────────────────────────

# O prefixo "/api/people" é adicionado em main.py
router = APIRouter()


# ════════════════════════════════════════════════════════════════════════════
# MODELOS PYDANTIC — Validação dos bodies POST/PATCH
# ════════════════════════════════════════════════════════════════════════════

class CreatePersonBody(BaseModel):
    """Body para cadastrar uma nova pessoa."""
    name: str                                   # Nome — o que o dono escolhe (obrigatório)
    nickname: Optional[str] = ""                # Apelido
    full_name: Optional[str] = ""               # Nome completo
    relationship: Optional[str] = ""            # "mãe", "colega de equipe"... (texto livre)
    category: Optional[str] = "outros"          # Relacionamento (slug da lista configurável)
    context: Optional[str] = "personal"         # personal | work | both
    phone: Optional[str] = ""
    email: Optional[str] = ""
    instagram: Optional[str] = ""
    telegram: Optional[str] = ""
    city: Optional[str] = ""
    avatar_url: Optional[str] = ""
    notes: Optional[str] = ""                   # Observação inicial (vira uma anotação)
    birth_day: Optional[int] = None
    birth_month: Optional[int] = None
    birth_year: Optional[int] = None
    birthday_remind_days: Optional[int] = 1     # None = sem lembrete


class UpdatePersonBody(BaseModel):
    """Body para atualizar campos de uma pessoa (PATCH parcial).

    Só os campos ENVIADOS mudam (``exclude_unset``); enviar ``null`` num campo opcional o limpa
    (ex.: ``"nickname": null`` tira o apelido, ``"birth_day": null`` + ``"birth_month": null`` tira o aniversário).
    """
    name: Optional[str] = None
    nickname: Optional[str] = None
    full_name: Optional[str] = None
    relationship: Optional[str] = None
    category: Optional[str] = None
    context: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    instagram: Optional[str] = None
    telegram: Optional[str] = None
    city: Optional[str] = None
    avatar_url: Optional[str] = None
    birth_day: Optional[int] = None
    birth_month: Optional[int] = None
    birth_year: Optional[int] = None
    birthday_remind_days: Optional[int] = None


class AddAliasBody(BaseModel):
    """Body para adicionar uma "outra forma de chamar" a uma pessoa."""
    alias: str


class AddImportantDateBody(BaseModel):
    """Body para adicionar uma data importante (casamento, formatura...). O aniversário é campo da pessoa."""
    label: str
    date: str                                   # AAAA-MM-DD ou MM-DD
    recurring: bool = True                      # True = repete todo ano
    remind_days_before: Optional[int] = 1       # 0 = no dia; -1 = sem lembrete


class UpdateImportantDateBody(BaseModel):
    """Body para atualizar uma data importante (PATCH parcial — só o que foi enviado muda)."""
    label: Optional[str] = None
    date: Optional[str] = None
    recurring: Optional[bool] = None
    remind_days_before: Optional[int] = None    # 0 = no dia; -1 = sem lembrete


class InteractionBody(BaseModel):
    """Body para registrar uma interação."""
    kind: str = "outro"                         # mensagem | ligacao | encontro | video | outro
    happened_at: Optional[str] = None           # AAAA-MM-DD ou AAAA-MM-DDTHH:MM (padrão: agora)
    note: Optional[str] = None
    context: Optional[str] = None               # personal | work (padrão: o espaço da pessoa)


class UpdateInteractionBody(BaseModel):
    """Body para corrigir uma interação (PATCH parcial). ``note: ""`` apaga a observação."""
    kind: Optional[str] = None
    happened_at: Optional[str] = None
    note: Optional[str] = None
    context: Optional[str] = None


class NoteBody(BaseModel):
    """Body para criar uma anotação."""
    text: str
    kind: str = "nota"                          # presente | gosta | nao_gosta | nota
    context: Optional[str] = None               # personal | work (padrão: o espaço da pessoa)


class UpdateNoteBody(BaseModel):
    """Body para editar uma anotação (PATCH parcial)."""
    text: Optional[str] = None
    kind: Optional[str] = None
    context: Optional[str] = None


class AcceptNoteBody(BaseModel):
    """Body (opcional) para aceitar uma sugestão da IA já editando o texto ou o tipo."""
    text: Optional[str] = None
    kind: Optional[str] = None


class SummaryBody(BaseModel):
    """Body para gerar o resumo de IA da Memória."""
    context: str = "all"                        # all | personal | work
    force: bool = False                         # True = regera mesmo sem mudança na Memória


class RelationBody(BaseModel):
    """Body para registrar uma relação: ``other_id`` É ``kind`` DESTA pessoa (ex.: o João é 'filho' da Ana)."""
    other_id: str
    kind: str                                   # slug de GET /relation-kinds


class LinkBody(BaseModel):
    """Body para vincular a pessoa a um item de outro agente (o "Desfazer" do desvincular)."""
    entity_type: str
    entity_id: str


class MergeBody(BaseModel):
    """Body para mesclar duas pessoas: ``drop_id`` é absorvida por ``keep_id``."""
    keep_id: str
    drop_id: str


class CategoryBody(BaseModel):
    """Body para criar um relacionamento."""
    label: str
    icon: str = "person"
    slug: Optional[str] = None


class UpdateCategoryBody(BaseModel):
    """Body para renomear/trocar o ícone de um relacionamento."""
    label: Optional[str] = None
    icon: Optional[str] = None


class ReorderCategoriesBody(BaseModel):
    """Body para reordenar os relacionamentos."""
    slugs: list[str] = Field(default_factory=list)


class ArchiveCategoryBody(BaseModel):
    """Body para arquivar um relacionamento (``move_to`` recebe as pessoas dele)."""
    move_to: Optional[str] = None


class GroupBody(BaseModel):
    """Body para criar/renomear um grupo."""
    name: str


class GroupMemberBody(BaseModel):
    """Body para colocar uma pessoa num grupo."""
    person_id: str


# ════════════════════════════════════════════════════════════════════════════
# ROTAS — path fixo ANTES de /{person_id}
# ════════════════════════════════════════════════════════════════════════════

@router.get("/")
def list_all_people(space: Optional[str] = Query(None, description="personal | work | vazio = todos"),
                    user: dict = Depends(require_user)):
    """Lista as pessoas vivas com contagem de vínculos.

    Args:
        space: ``personal`` ou ``work`` para filtrar por espaço (quem é "ambos" aparece nos dois).

    Returns:
        ``{"status": "ok", "people": [...]}`` com nomes, relacionamento, espaço, aniversário e outras formas.
    """
    return _check_result(list_people(space))


@router.get("/search")
def search_people(
    q: str = Query(..., description="Termo de busca (nome, apelido, nome completo ou outra forma)"),
    user: dict = Depends(require_user),
):
    """Busca pessoas por prefixo de qualquer nome (smart-match: sem caixa nem acento).

    Args:
        q: Termo de busca.

    Returns:
        ``{"status": "ok", "matches": [...]}`` — 0, 1 ou N resultados.
    """
    return _check_result(find_people(q))


@router.get("/suggest")
def suggest(
    q: str = Query("", description="O que foi digitado (vazio = as mais vinculadas)"),
    limit: int = Query(8, ge=1, le=20),
    space: Optional[str] = Query(None, description="personal | work"),
    user: dict = Depends(require_user),
):
    """Sugestões para seletores de pessoa (nome, apelido, nome completo ou outra forma), com avatar.

    Args:
        q: O que foi digitado.
        limit: Máximo de sugestões.
        space: Só considerar quem vale naquele espaço.

    Returns:
        ``{"status": "ok", "people": [{id, name, nickname, relationship, avatar_url, alias}]}``.
    """
    return _check_result(suggest_people(q, limit, space))


@router.get("/overview")
def get_overview(user: dict = Depends(require_user)):
    """Visão agregada de todas as pessoas para o Início (perfil, datas, saldo e último contato).

    Returns:
        ``{"status": "ok", "people": [...]}``.
    """
    return _check_result(get_people_overview())


@router.get("/stats")
def stats(year: int = 0, month: Optional[int] = None, user: dict = Depends(require_user)):
    """Estatísticas no contrato ``StatsPayload`` do Design System.

    Args:
        year: Ano (0 = ano corrente em America/Sao_Paulo).
        month: Mês 1–12 para focar num mês.

    Returns:
        ``{"status": "ok", **StatsPayload}``.
    """
    return _check_result(get_stats_payload(year, month))


@router.get("/duplicates")
def duplicates(limit: int = Query(20, ge=1, le=100), user: dict = Depends(require_user)):
    """Sugere pares de pessoas que podem ser a mesma (para o dono revisar e mesclar).

    Args:
        limit: Máximo de pares.

    Returns:
        ``{"status": "ok", "pairs": [{a, b, reasons, score}, ...]}``.
    """
    return _check_result(find_duplicates(limit))


@router.post("/merge/preview")
def merge_preview(body: MergeBody, user: dict = Depends(require_user)):
    """Mostra o que a mescla moveria, sem mudar nada.

    Args:
        body: ``keep_id`` (quem fica) e ``drop_id`` (quem é absorvida).

    Returns:
        ``{"status": "ok", "keep": {...}, "drop": {...}, "moves": {...}, "fill": {...}, "aliases": [...]}``.
    """
    return _check_result(preview_merge(body.keep_id, body.drop_id))


@router.post("/merge")
def merge(body: MergeBody, user: dict = Depends(require_user)):
    """Mescla ``drop_id`` em ``keep_id``. NÃO tem desfazer — confira com ``/merge/preview``.

    Args:
        body: ``keep_id`` (quem fica) e ``drop_id`` (quem é absorvida).

    Returns:
        ``{"status": "ok", "message": ..., "moved": {...}, "warnings": [...]}``.
    """
    return _check_result(merge_people(body.keep_id, body.drop_id))


# ── relacionamentos (lista configurável) ─────────────────────────────────────

@router.get("/categories")
def categories(include_archived: bool = False, user: dict = Depends(require_user)):
    """Lista os relacionamentos (família, amigos...), na ordem escolhida, com a contagem de pessoas.

    Args:
        include_archived: Inclui os arquivados.

    Returns:
        ``{"status": "ok", "categories": [{slug, label, icon, position, archived, people_count}]}``.
    """
    return _check_result(list_categories(include_archived))


@router.post("/categories", status_code=201)
def new_category(body: CategoryBody, user: dict = Depends(require_user)):
    """Cria um relacionamento novo (vai para o fim da lista).

    Args:
        body: ``label``, ``icon`` e (opcional) ``slug``.

    Returns:
        ``{"status": "ok", "slug": ...}``.
    """
    return _check_result(create_category(body.label, body.icon, body.slug))


@router.post("/categories/reorder")
def reorder(body: ReorderCategoriesBody, user: dict = Depends(require_user)):
    """Define a ordem dos relacionamentos.

    Args:
        body: ``slugs`` na ordem desejada.

    Returns:
        ``{"status": "ok", ...}``.
    """
    return _check_result(reorder_categories(body.slugs))


@router.patch("/categories/{slug}")
def edit_category(slug: str, body: UpdateCategoryBody, user: dict = Depends(require_user)):
    """Renomeia um relacionamento e/ou troca o ícone.

    Args:
        slug: Identificador do relacionamento.
        body: ``label`` e/ou ``icon``.

    Returns:
        ``{"status": "ok", ...}``.
    """
    return _check_result(update_category(slug, **body.model_dump(exclude_unset=True)))


@router.post("/categories/{slug}/archive")
def archive(slug: str, body: ArchiveCategoryBody, user: dict = Depends(require_user)):
    """Arquiva um relacionamento, movendo as pessoas dele para ``move_to``.

    Args:
        slug: Relacionamento a arquivar.
        body: ``move_to`` (obrigatório se há pessoas nele).

    Returns:
        ``{"status": "ok", "moved": n}``.

    Raises:
        HTTPException 409: Há pessoas e ``move_to`` não veio — ``detail`` traz ``people_count``.
        HTTPException 400: Qualquer outro erro.
    """
    resultado = archive_category(slug, body.move_to)
    if resultado.get("needs_move_to"):
        raise HTTPException(status_code=409, detail={"message": resultado["message"], "people_count": resultado["people_count"]})
    return _check_result(resultado)


@router.post("/categories/{slug}/unarchive")
def unarchive(slug: str, user: dict = Depends(require_user)):
    """Reativa um relacionamento arquivado.

    Args:
        slug: Relacionamento a reativar.

    Returns:
        ``{"status": "ok", ...}``.
    """
    return _check_result(unarchive_category(slug))


@router.get("/relation-kinds")
def relation_kinds(user: dict = Depends(require_user)):
    """Lista os tipos de relação entre pessoas (irmão, pai/mãe, colega...).

    Returns:
        ``{"status": "ok", "kinds": [{slug, label, inverse_slug}]}``.
    """
    return _check_result(list_relation_kinds())


# ── grupos ───────────────────────────────────────────────────────────────────

@router.get("/groups")
def groups(user: dict = Depends(require_user)):
    """Lista os grupos livres com a quantidade de pessoas.

    Returns:
        ``{"status": "ok", "groups": [{id, name, member_count}]}``.
    """
    return _check_result(list_groups())


@router.post("/groups", status_code=201)
def new_group(body: GroupBody, user: dict = Depends(require_user)):
    """Cria um grupo.

    Args:
        body: ``name``.

    Returns:
        ``{"status": "ok", "id": n}``.
    """
    return _check_result(create_group(body.name))


@router.patch("/groups/{group_id}")
def edit_group(group_id: int, body: GroupBody, user: dict = Depends(require_user)):
    """Renomeia um grupo.

    Args:
        group_id: ID do grupo.
        body: ``name``.

    Returns:
        ``{"status": "ok", ...}``.
    """
    return _check_result(rename_group(group_id, body.name))


@router.delete("/groups/{group_id}", status_code=204)
def remove_group(group_id: int, user: dict = Depends(require_user)):
    """Apaga um grupo (as pessoas continuam existindo).

    Args:
        group_id: ID do grupo.
    """
    _no_content(delete_group(group_id))


@router.post("/groups/{group_id}/members", status_code=201)
def group_add_member(group_id: int, body: GroupMemberBody, user: dict = Depends(require_user)):
    """Coloca uma pessoa no grupo.

    Args:
        group_id: ID do grupo.
        body: ``person_id``.

    Returns:
        ``{"status": "ok", ...}``.
    """
    return _check_result(add_to_group(group_id, body.person_id))


@router.delete("/groups/{group_id}/members/{person_id}", status_code=204)
def group_remove_member(group_id: int, person_id: str, user: dict = Depends(require_user)):
    """Tira uma pessoa do grupo.

    Args:
        group_id: ID do grupo.
        person_id: UUID da pessoa.
    """
    _no_content(remove_from_group(group_id, person_id))


# ── interações e anotações (por ID da interação/anotação) ────────────────────

@router.patch("/interactions/{interaction_id}")
def edit_interaction(interaction_id: int, body: UpdateInteractionBody, user: dict = Depends(require_user)):
    """Corrige uma interação (PATCH parcial).

    Args:
        interaction_id: ID da interação.
        body: Campos a alterar.

    Returns:
        ``{"status": "ok", ...}``.
    """
    return _check_result(update_interaction(interaction_id, **body.model_dump(exclude_unset=True)))


@router.delete("/interactions/{interaction_id}", status_code=204)
def remove_interaction(interaction_id: int, user: dict = Depends(require_user)):
    """Apaga uma interação (soft delete; ``/restore`` desfaz).

    Args:
        interaction_id: ID da interação.
    """
    _no_content(delete_interaction(interaction_id))


@router.post("/interactions/{interaction_id}/restore")
def undo_interaction(interaction_id: int, user: dict = Depends(require_user)):
    """Desfaz a exclusão de uma interação.

    Args:
        interaction_id: ID da interação.

    Returns:
        ``{"status": "ok", ...}``.
    """
    return _check_result(restore_interaction(interaction_id))


@router.patch("/notes/{note_id}")
def edit_note(note_id: int, body: UpdateNoteBody, user: dict = Depends(require_user)):
    """Edita uma anotação (PATCH parcial).

    Args:
        note_id: ID da anotação.
        body: Campos a alterar.

    Returns:
        ``{"status": "ok", ...}``.
    """
    return _check_result(update_person_note(note_id, **body.model_dump(exclude_unset=True)))


@router.delete("/notes/{note_id}", status_code=204)
def remove_note(note_id: int, user: dict = Depends(require_user)):
    """Apaga uma anotação (soft delete; ``/restore`` desfaz).

    Args:
        note_id: ID da anotação.
    """
    _no_content(delete_person_note(note_id))


@router.post("/notes/{note_id}/restore")
def undo_note(note_id: int, user: dict = Depends(require_user)):
    """Desfaz a exclusão de uma anotação.

    Args:
        note_id: ID da anotação.

    Returns:
        ``{"status": "ok", ...}``.
    """
    return _check_result(restore_person_note(note_id))


@router.post("/notes/{note_id}/accept")
def accept_note(note_id: int, body: Optional[AcceptNoteBody] = None, user: dict = Depends(require_user)):
    """Aceita uma anotação sugerida pela IA (opcionalmente já editando o texto/tipo).

    Args:
        note_id: ID da sugestão.
        body: ``text`` e/ou ``kind`` editados (opcional).

    Returns:
        ``{"status": "ok", ...}``.
    """
    editado = body.model_dump(exclude_unset=True) if body else {}
    return _check_result(accept_person_note(note_id, **editado))


@router.post("/notes/{note_id}/dismiss")
def dismiss_note(note_id: int, user: dict = Depends(require_user)):
    """Descarta uma sugestão da IA (a IA não a sugere de novo).

    Args:
        note_id: ID da sugestão.

    Returns:
        ``{"status": "ok", ...}``.
    """
    return _check_result(dismiss_person_note(note_id))


@router.post("/uploads/avatar", status_code=201)
async def upload_avatar(
    file: UploadFile = File(...),
    user: dict = Depends(require_user),
):
    """Faz upload de uma foto de avatar (png, jpeg, webp ou gif, máx 1 MB).

    Salva em /uploads/icons/ (mesmo diretório dos ícones de finanças).
    Retorna a URL para armazenar em people.avatar_url.

    Args:
        file: Arquivo de imagem enviado via multipart/form-data.

    Returns:
        ``{"url": "/uploads/icons/<filename>"}``

    Raises:
        HTTPException 400: Tipo MIME inválido ou arquivo maior que 1 MB.
    """
    # Valida o tipo MIME declarado pelo cliente
    if file.content_type not in _ALLOWED_MIME:
        raise HTTPException(
            status_code=400,
            detail=f"Tipo de arquivo não permitido: {file.content_type}. Use png, jpeg, webp ou gif.",
        )

    # Lê os bytes do arquivo
    contents = await file.read()

    # Valida o tamanho (proteção contra uploads muito grandes)
    if len(contents) > _MAX_SIZE_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"Arquivo muito grande ({len(contents) // 1024} KB). Máximo: 1 MB.",
        )

    # Gera um nome de arquivo único (UUID curto + extensão original)
    ext = (file.filename or "").rsplit(".", 1)[-1] or "png"
    filename = f"avatar_{uuid.uuid4().hex[:12]}.{ext}"

    # Garante que o diretório de uploads existe
    os.makedirs(_UPLOADS_DIR, exist_ok=True)

    # Salva o arquivo no disco
    dest = os.path.join(_UPLOADS_DIR, filename)
    with open(dest, "wb") as f:
        f.write(contents)

    # Retorna a URL pública — FastAPI serve /uploads/ via StaticFiles em main.py
    return {"url": f"/uploads/icons/{filename}"}


@router.post("/", status_code=201)
def create_new_person(body: CreatePersonBody, user: dict = Depends(require_user)):
    """Cadastra uma nova pessoa no sistema.

    Args:
        body: Dados da pessoa (``name`` obrigatório; demais opcionais).

    Returns:
        ``{"status": "ok", "id": "<uuid>", "message": ...}``.

    Raises:
        HTTPException 400: Nome/apelido já é de outra pessoa, aniversário impossível etc.
    """
    return _check_result(create_person(**body.model_dump()))


# ════════════════════════════════════════════════════════════════════════════
# ROTAS — por ID
# ════════════════════════════════════════════════════════════════════════════

@router.get("/{person_id}")
def get_person_profile(person_id: str, user: dict = Depends(require_user)):
    """Retorna o perfil de uma pessoa (sem vínculos cross-agent).

    Args:
        person_id: UUID da pessoa.

    Returns:
        ``{"status": "ok", "perfil": {...}, "aliases": [...], "datas": [...]}``.
    """
    return _check_result(get_person(person_id))


@router.get("/{person_id}/summary")
def get_summary(person_id: str, user: dict = Depends(require_user)):
    """Resumo com os blocos de todos os agentes (finanças, tarefas, diário, cartas, livros, filmes...).

    Args:
        person_id: UUID da pessoa.

    Returns:
        ``{"status": "ok", "perfil": {...}, "financas": {...}, "tarefas": {...}, ...}``.
    """
    return _check_result(get_person_summary(person_id))


@router.get("/{person_id}/memory")
def get_memory(
    person_id: str,
    context: Optional[str] = Query(None, description="personal | work | vazio = tudo"),
    limit: int = Query(300, ge=1, le=1000),
    user: dict = Depends(require_user),
):
    """Memória da pessoa: backlinks de TODOS os agentes + interações, do mais recente ao mais antigo.

    Args:
        person_id: UUID da pessoa.
        context: Ver só o lado pessoal ou o de trabalho.
        limit: Máximo de itens.

    Returns:
        ``{"status": "ok", "items": [...], "counts": {agente: n}, "by_context": {...}, "unavailable": [...]}``.
    """
    return _check_result(get_person_memory(person_id, context=context, limit=limit))


@router.get("/{person_id}/memory/summary")
def read_memory_summary(person_id: str, context: str = "all", user: dict = Depends(require_user)):
    """Lê o resumo de IA guardado (sem chamar a IA), dizendo se está desatualizado.

    Args:
        person_id: UUID da pessoa.
        context: ``all`` | ``personal`` | ``work``.

    Returns:
        ``{"status": "ok", "summary": {...}|null, "stale": bool|null, "generated_at": ISO|null}``.
    """
    return _check_result(resumo_da_pessoa(person_id, context))


@router.post("/{person_id}/memory/summary")
def generate_memory_summary(person_id: str, body: Optional[SummaryBody] = None, user: dict = Depends(require_user)):
    """Gera o resumo de IA da Memória (e sugestões de anotação, que só valem após aceite).

    Args:
        person_id: UUID da pessoa.
        body: ``context`` e ``force`` (opcional).

    Returns:
        ``{"status": "ok", "summary": {...}, "cached": bool, "suggestions_created": n}``; ou
        ``{"status": "ok", "empty": true}`` se não há o que resumir.
    """
    corpo = body or SummaryBody()
    return _check_result(gerar_resumo(person_id, corpo.context, corpo.force))


@router.get("/{person_id}/briefing")
def briefing(person_id: str, check_stale: bool = True, user: dict = Depends(require_user)):
    """Briefing: tudo o que importa saber antes de falar com a pessoa.

    Args:
        person_id: UUID da pessoa.
        check_stale: Se o resumo de IA está desatualizado (consulta os agentes).

    Returns:
        ``{"status": "ok", "perfil", "birthday", "dates", "notes", "ai", "pending", "contact", "relations", "groups"}``.
    """
    return _check_result(get_person_briefing(person_id, check_stale))


@router.patch("/{person_id}")
def update_person_profile(
    person_id: str,
    body: UpdatePersonBody,
    user: dict = Depends(require_user),
):
    """Atualiza campos de uma pessoa (PATCH parcial — só os campos enviados).

    ``null`` num campo opcional o limpa (apelido, aniversário...).

    Args:
        person_id: UUID da pessoa.
        body: Campos a alterar.

    Returns:
        ``{"status": "ok", ...}``.
    """
    return _check_result(update_person(person_id, **body.model_dump(exclude_unset=True)))


@router.delete("/{person_id}", status_code=204)
def delete_person_soft(person_id: str, user: dict = Depends(require_user)):
    """Soft delete — marca a pessoa como excluída (vínculos são preservados).

    Args:
        person_id: UUID da pessoa.
    """
    _no_content(delete_person(person_id))


@router.post("/{person_id}/restore")
def restore_person_route(person_id: str, user: dict = Depends(require_user)):
    """Desfaz a exclusão de uma pessoa (recusa se ela foi mesclada em outra).

    Args:
        person_id: UUID da pessoa.

    Returns:
        ``{"status": "ok", ...}``.
    """
    return _check_result(restore_person(person_id))


@router.post("/{person_id}/aliases", status_code=201)
def add_person_alias(person_id: str, body: AddAliasBody, user: dict = Depends(require_user)):
    """Adiciona uma "outra forma de chamar" a uma pessoa.

    Args:
        person_id: UUID da pessoa.
        body: ``alias`` — não pode ser nome/apelido de outra pessoa.

    Returns:
        ``{"status": "ok", "id": n, ...}``.

    Raises:
        HTTPException 400: Se o nome já pertence a outra pessoa.
    """
    return _check_result(add_alias(person_id, body.alias))


@router.delete("/{person_id}/aliases/{alias_id}", status_code=204)
def remove_person_alias(person_id: str, alias_id: int, user: dict = Depends(require_user)):
    """Remove uma "outra forma de chamar" (só se for desta pessoa).

    Args:
        person_id: UUID da pessoa.
        alias_id: ID do apelido extra.
    """
    _no_content(remove_alias(alias_id, person_id))


@router.post("/{person_id}/dates", status_code=201)
def add_person_date(person_id: str, body: AddImportantDateBody, user: dict = Depends(require_user)):
    """Adiciona uma data importante (casamento, formatura...). Para o aniversário, use o campo da pessoa.

    Args:
        person_id: UUID da pessoa.
        body: ``label``, ``date``, ``recurring`` e ``remind_days_before``.

    Returns:
        ``{"status": "ok", "id": int, ...}``.
    """
    return _check_result(
        add_important_date(person_id, body.label, body.date, body.recurring, body.remind_days_before)
    )


@router.patch("/{person_id}/dates/{date_id}")
def update_person_date(person_id: str, date_id: int, body: UpdateImportantDateBody, user: dict = Depends(require_user)):
    """Atualiza campos de uma data importante (PATCH parcial).

    Args:
        person_id: UUID da pessoa (contexto; a validação real é via ``date_id``).
        date_id: ID da data.
        body: Campos a alterar.

    Returns:
        ``{"status": "ok", "message": "Data atualizada."}``.
    """
    campos = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    return _check_result(update_important_date(date_id, **campos))


@router.delete("/{person_id}/dates/{date_id}", status_code=204)
def delete_person_date(person_id: str, date_id: int, user: dict = Depends(require_user)):
    """Remove uma data importante.

    Args:
        person_id: UUID da pessoa (contexto).
        date_id: ID da data.
    """
    _no_content(delete_important_date(date_id))


@router.get("/{person_id}/interactions")
def person_interactions(
    person_id: str,
    context: Optional[str] = Query(None, description="personal | work"),
    limit: int = Query(50, ge=1, le=500),
    user: dict = Depends(require_user),
):
    """Lista as interações da pessoa, da mais recente à mais antiga.

    Args:
        person_id: UUID da pessoa.
        context: Ver só um lado (pessoal ou trabalho).
        limit: Máximo de interações.

    Returns:
        ``{"status": "ok", "interactions": [...]}``.
    """
    return _check_result(list_interactions(person_id, limit, context))


@router.post("/{person_id}/interactions", status_code=201)
def new_interaction(person_id: str, body: InteractionBody, user: dict = Depends(require_user)):
    """Registra uma interação ("liguei pra ela ontem").

    Args:
        person_id: UUID da pessoa.
        body: ``kind``, ``happened_at``, ``note`` e ``context``.

    Returns:
        ``{"status": "ok", "id": n}``.
    """
    return _check_result(log_interaction(person_id, body.kind, body.happened_at, body.note, body.context))


@router.get("/{person_id}/notes")
def person_notes(
    person_id: str,
    context: Optional[str] = Query(None, description="personal | work"),
    status: Optional[str] = Query(None, description="ativa | sugerida | descartada (vazio = ativas e sugeridas)"),
    user: dict = Depends(require_user),
):
    """Lista as anotações da pessoa (ideias de presente, do que gosta...).

    Args:
        person_id: UUID da pessoa.
        context: Ver só um lado.
        status: Filtrar por status.

    Returns:
        ``{"status": "ok", "notes": [...]}``.
    """
    return _check_result(list_person_notes(person_id, context, status))


@router.post("/{person_id}/notes", status_code=201)
def new_note(person_id: str, body: NoteBody, user: dict = Depends(require_user)):
    """Cria uma anotação sobre a pessoa.

    Args:
        person_id: UUID da pessoa.
        body: ``text``, ``kind`` e ``context``.

    Returns:
        ``{"status": "ok", "id": n}``.
    """
    return _check_result(add_person_note(person_id, body.text, body.kind, body.context))


@router.get("/{person_id}/relations")
def person_relations(person_id: str, user: dict = Depends(require_user)):
    """Lista as pessoas ligadas a esta, do ponto de vista dela ("João — filho").

    Args:
        person_id: UUID da pessoa.

    Returns:
        ``{"status": "ok", "relations": [{other_id, other_name, kind, label, ...}]}``.
    """
    return _check_result(list_relations(person_id))


@router.post("/{person_id}/relations", status_code=201)
def new_relation(person_id: str, body: RelationBody, user: dict = Depends(require_user)):
    """Registra que ``other_id`` É ``kind`` DESTA pessoa (ex.: o João é 'filho' da Ana).

    Args:
        person_id: UUID desta pessoa.
        body: ``other_id`` e ``kind``.

    Returns:
        ``{"status": "ok", "created": bool}``.
    """
    return _check_result(relate_people(body.other_id, person_id, body.kind))


@router.delete("/{person_id}/relations/{other_id}", status_code=204)
def remove_relation(person_id: str, other_id: str, kind: Optional[str] = None, user: dict = Depends(require_user)):
    """Remove a relação com ``other_id`` (do tipo ``kind`` — o que a outra pessoa É desta; vazio = todas).

    Args:
        person_id: UUID desta pessoa.
        other_id: UUID da outra.
        kind: Tipo, como listado em ``GET /{id}/relations``.
    """
    _no_content(unrelate_people(other_id, person_id, kind))


@router.get("/{person_id}/groups")
def person_group_list(person_id: str, user: dict = Depends(require_user)):
    """Lista os grupos em que a pessoa está.

    Args:
        person_id: UUID da pessoa.

    Returns:
        ``{"status": "ok", "groups": [{id, name}]}``.
    """
    return _check_result(list_person_groups(person_id))


@router.post("/{person_id}/links", status_code=201)
def relink(person_id: str, body: LinkBody, user: dict = Depends(require_user)):
    """Vincula a pessoa a um item existente de outro agente (o "Desfazer" do desvincular).

    Args:
        person_id: UUID da pessoa.
        body: ``entity_type`` e ``entity_id``.

    Returns:
        ``{"status": "ok", ...}``.
    """
    return _check_result(link_item(person_id, body.entity_type, body.entity_id))


@router.delete("/{person_id}/links/{entity_type}/{entity_id}")
def unlink(person_id: str, entity_type: str, entity_id: str, user: dict = Depends(require_user)):
    """Desvincula a pessoa de um item (tira também a menção do texto, quando o agente a guarda lá).

    Args:
        person_id: UUID da pessoa.
        entity_type: Tipo do item (ex.: ``task``, ``journal_bullet``).
        entity_id: ID do item.

    Returns:
        ``{"status": "ok", "removed": 1, "undoable": bool}`` — ``undoable`` diz se ``POST /{id}/links`` desfaz.
    """
    return _check_result(unlink_item(person_id, entity_type, entity_id))
