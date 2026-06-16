"""Router de pessoas (Komi) — expõe as tools como endpoints REST.

Camada fina: cada endpoint delega diretamente para a tool correspondente
em agents.komi.tools. Lógica de negócio e smart-match ficam sempre nas tools.

IMPORTANTE: rotas com path fixo (search, list) DEVEM ser registradas ANTES
de /{person_id} para não serem interpretadas como IDs pelo FastAPI.

Usage:
    # Em main.py:
    from webapp.backend.routers import pessoas as pessoas_router
    app.include_router(pessoas_router.router, prefix="/api/people", tags=["people"])
"""

import os        # Para manipular caminhos de arquivo ao salvar o avatar
import uuid     # Para gerar nome único do arquivo de avatar

from typing import Optional

# Imports do FastAPI: APIRouter (agrupa rotas), Depends (autenticação), HTTPException (erros HTTP)
# File e UploadFile: para receber arquivos via multipart/form-data
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile

# BaseModel é a base de todos os modelos Pydantic (validação de body de POST/PATCH)
from pydantic import BaseModel

# Dependência de autenticação — obrigatória em TODAS as rotas /api/*
from webapp.backend.deps import require_user

# ── Tools da Komi — importadas diretamente (sem instanciar agente ADK) ────────
from agents.komi.tools import (
    create_person,
    update_person,
    delete_person,
    add_alias,
    add_important_date,
    list_people,
    find_people,
    get_person,
    get_person_summary,
    get_people_overview,
)

# ── Diretório de uploads de avatar ───────────────────────────────────────────
# Reutiliza o mesmo diretório de ícones de finanças (já montado como /uploads/icons/)
# Caminho relativo ao cwd do processo (webapp/), ajustado via os.path para ser robusto
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


# ─── Helper de resultado ────────────────────────────────────────────────────

def _check_result(result: dict) -> dict:
    """Converte resposta de erro das tools em HTTP 400; deixa 'ok' passar.

    As tools da Komi retornam {"status": "ok"|"error", "message": ...}.

    Args:
        result: Dict retornado por uma tool da Komi.

    Returns:
        O mesmo dict se status == "ok".

    Raises:
        HTTPException: 400 se status == "error".
    """
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message", "Erro desconhecido."))
    return result


# ─── Router ─────────────────────────────────────────────────────────────────

# O prefixo "/api/people" é adicionado em main.py
router = APIRouter()


# ════════════════════════════════════════════════════════════════════════════
# MODELOS PYDANTIC — Validação dos bodies POST/PATCH
# ════════════════════════════════════════════════════════════════════════════

class CreatePersonBody(BaseModel):
    """Body para cadastrar uma nova pessoa."""
    name: str                               # Nome completo (obrigatório)
    relationship: Optional[str] = ""        # Tipo de vínculo (amigo/família/trabalho...)
    category: Optional[str] = "outros"     # Categoria: familia | amigos | trabalho | outros
    phone: Optional[str] = ""              # Telefone
    email: Optional[str] = ""             # E-mail de contato
    instagram: Optional[str] = ""         # @ do Instagram (sem @)
    telegram: Optional[str] = ""          # @ do Telegram (sem @)
    city: Optional[str] = ""              # Cidade atual
    avatar_url: Optional[str] = ""        # URL da foto (opcional — pode vir de upload)
    notes: Optional[str] = ""            # Observações livres


class UpdatePersonBody(BaseModel):
    """Body para atualizar campos de uma pessoa (PATCH parcial)."""
    name: Optional[str] = None
    relationship: Optional[str] = None
    category: Optional[str] = None        # Categoria: familia | amigos | trabalho | outros
    phone: Optional[str] = None
    email: Optional[str] = None
    instagram: Optional[str] = None
    telegram: Optional[str] = None
    city: Optional[str] = None
    avatar_url: Optional[str] = None
    notes: Optional[str] = None


class AddAliasBody(BaseModel):
    """Body para adicionar um apelido a uma pessoa."""
    alias: str                             # Apelido (único globalmente)


class AddImportantDateBody(BaseModel):
    """Body para adicionar uma data importante (aniversário, formatura etc.)."""
    label: str                             # Nome da data (ex.: "aniversário")
    date: str                              # YYYY-MM-DD
    recurring: bool = True                 # True = repete todo ano


# ════════════════════════════════════════════════════════════════════════════
# ROTAS — path fixo ANTES de /{person_id}
# ════════════════════════════════════════════════════════════════════════════

@router.get("/")
def list_all_people(user: dict = Depends(require_user)):
    """Lista todas as pessoas vivas com contagem de vínculos.

    Returns:
        {"status": "ok", "people": [...]}
    """
    return _check_result(list_people())


@router.get("/search")
def search_people(
    q: str = Query(..., description="Termo de busca (nome ou apelido)"),
    user: dict = Depends(require_user),
):
    """Busca pessoas por nome ou apelido (smart-match: case/acento-insensitive).

    Args:
        q: Termo de busca.

    Returns:
        {"status": "ok", "people": [...]} — 0, 1 ou N resultados.
    """
    return _check_result(find_people(q))


@router.get("/overview")
def get_overview(user: dict = Depends(require_user)):
    """Retorna visão agregada de todas as pessoas para a Home do frontend.

    Inclui por pessoa: perfil, datas importantes, saldo financeiro e última interação.
    Mais eficiente que chamar /summary individualmente para cada pessoa.

    Returns:
        {"status": "ok", "people": [...]} com campos de perfil + dates + finance_net + last_interaction.
    """
    return _check_result(get_people_overview())


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
        {"url": "/uploads/icons/<filename>"}

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
        body: Dados da pessoa (name obrigatório; demais opcionais).

    Returns:
        {"status": "ok", "person": {...}}

    Raises:
        HTTPException 400: Se já existe pessoa com o mesmo nome normalizado.
    """
    return _check_result(create_person(**body.model_dump()))


# ════════════════════════════════════════════════════════════════════════════
# ROTAS — por ID
# ════════════════════════════════════════════════════════════════════════════

@router.get("/{person_id}")
def get_person_profile(person_id: str, user: dict = Depends(require_user)):
    """Retorna perfil completo de uma pessoa (sem vínculos cross-agent).

    Args:
        person_id: UUID da pessoa.

    Returns:
        {"status": "ok", "person": {...}, "aliases": [...], "dates": [...]}
    """
    return _check_result(get_person(person_id))


@router.get("/{person_id}/summary")
def get_summary(person_id: str, user: dict = Depends(require_user)):
    """Retorna resumo completo com vínculos cross-agent (finanças, tarefas, livros, diário).

    Args:
        person_id: UUID da pessoa.

    Returns:
        {"status": "ok", "perfil": {...}, "financas": {...}, "tarefas": {...}, ...}
    """
    return _check_result(get_person_summary(person_id))


@router.patch("/{person_id}")
def update_person_profile(
    person_id: str,
    body: UpdatePersonBody,
    user: dict = Depends(require_user),
):
    """Atualiza campos de uma pessoa (PATCH parcial — só os campos enviados).

    Args:
        person_id: UUID da pessoa.
        body: Campos a alterar (todos opcionais).

    Returns:
        {"status": "ok", "person": {...}}
    """
    # Filtra campos None para não sobrescrever com null o que não foi enviado
    campos = {k: v for k, v in body.model_dump().items() if v is not None}
    return _check_result(update_person(person_id, **campos))


@router.delete("/{person_id}", status_code=204)
def delete_person_soft(person_id: str, user: dict = Depends(require_user)):
    """Soft delete — marca pessoa como deletada (vínculos são preservados).

    Args:
        person_id: UUID da pessoa.
    """
    result = delete_person(person_id)
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message", "Erro ao deletar."))
    # 204 No Content — sem body


@router.post("/{person_id}/aliases", status_code=201)
def add_person_alias(
    person_id: str,
    body: AddAliasBody,
    user: dict = Depends(require_user),
):
    """Adiciona um apelido a uma pessoa.

    Args:
        person_id: UUID da pessoa.
        body: {"alias": "..."} — apelido único globalmente.

    Returns:
        {"status": "ok", ...}

    Raises:
        HTTPException 400: Se o apelido já pertence a outra pessoa.
    """
    return _check_result(add_alias(person_id, body.alias))


@router.post("/{person_id}/dates", status_code=201)
def add_person_date(
    person_id: str,
    body: AddImportantDateBody,
    user: dict = Depends(require_user),
):
    """Adiciona uma data importante (aniversário, formatura etc.) a uma pessoa.

    Args:
        person_id: UUID da pessoa.
        body: {label, date, recurring}

    Returns:
        {"status": "ok", ...}
    """
    return _check_result(
        add_important_date(person_id, body.label, body.date, body.recurring)
    )
