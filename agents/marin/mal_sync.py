"""Sincronização delta MAL → catálogo local de animes — agente Marin.

Este módulo busca a lista de animes do usuário no MyAnimeList (API v2) e
atualiza o banco de dados PostgreSQL local (tabela `anime`).

Estratégia delta:
    A API do MAL ordena a lista por `list_updated_at` DESC. O sync para de
    processar entradas quando encontra `updated_at <= last_sync_at` — assim
    apenas os animes alterados desde o último sync são processados, reduzindo
    chamadas à API e tempo de execução.

Uso típico:
    sync_mal()           # delta — só o que mudou desde o último sync
    sync_mal(full=True)  # processa toda a lista (ignorando last_sync_at)

Usage:
    from agents.marin.mal_sync import sync_mal
"""

import logging        # Registra erros e progresso do sync
import re             # Remove pontuação na normalização de strings (busca fuzzy)
import time           # Delay entre retries em caso de rate limit
import unicodedata    # Remove acentos na normalização fuzzy de títulos
import uuid           # Gera IDs únicos para novos animes inseridos no banco
from datetime import datetime, timezone  # Controle de timestamps e comparação de datas

import requests       # Chamadas HTTP à API do MAL

# Autenticação OAuth2 do MAL (access_token automático com refresh)
from agents.marin.mal_auth import MALAuth

# Helpers PostgreSQL compartilhados entre os agentes
from agents.db import run_select, run_dml


# ─────────────────────────────────────────────────────────────────────────────
# LOGGER
# ─────────────────────────────────────────────────────────────────────────────

# Logger nomeado para filtrar mensagens de sync nas logs do container
logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTES
# ─────────────────────────────────────────────────────────────────────────────

# Endpoint da API v2 do MAL para obter a animelist do usuário autenticado.
# @me = usuário dono do access_token (não precisa informar o username).
_MAL_ANIMELIST_URL = "https://api.myanimelist.net/v2/users/@me/animelist"

# Número máximo de entradas por página na API do MAL.
# O MAL aceita até 1000, mas 100 é seguro e evita respostas muito grandes.
_MAL_PAGE_LIMIT = 100

# Mapeamento dos status do MAL para os status usados no banco local.
# O MAL usa inglês (snake_case); o banco usa português para consistência
# com os outros agentes (frieren, akane).
_MAL_STATUS_MAP: dict[str, str] = {
    "watching":      "assistindo",    # Assistindo atualmente
    "completed":     "completo",       # Terminou de assistir
    "on_hold":       "pausado",        # Pausado temporariamente
    "dropped":       "abandonado",     # Desistiu do anime
    "plan_to_watch": "quero_assistir", # Pretende assistir no futuro
}

# Número máximo de tentativas em caso de erro HTTP 429 (rate limit) ou 5xx
_MAX_RETRIES = 3

# Delay base em segundos para backoff exponencial entre retries
_RETRY_BASE_DELAY_SECONDS = 2


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS PRIVADOS — normalização e HTTP
# ─────────────────────────────────────────────────────────────────────────────

def _norm(s: str) -> str:
    """Normaliza string para comparação fuzzy (lower, sem acentos, sem pontuação).

    Usado para preencher o campo `normalizado` na tabela `anime`, que permite
    buscar por título sem depender de capitalização ou acentuação.

    Args:
        s: String original (pode ter acentos, maiúsculas, pontuação).

    Returns:
        String normalizada — minúscula, sem acentos, sem pontuação, sem espaços
        no início/fim.

    Example:
        >>> _norm("Oshi no Ko")
        'oshi no ko'
        >>> _norm("Frieren: Beyond Journey's End")
        'frieren beyond journeys end'
    """
    # Converte para minúsculas antes de normalizar acentos
    s = s.lower()

    # NFD (Decomposição de Compatibilidade de Normalização) separa cada caractere
    # acentuado em dois: a letra base + o acento (combining mark).
    # Ex.: 'ã' → 'a' + '̃' (til combinante)
    s = unicodedata.normalize("NFD", s)

    # Remove os acentos (combining marks — categoria "Mn" = Mark, Nonspacing)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")

    # Remove pontuação, mantendo apenas letras, números e espaços
    s = re.sub(r"[^\w\s]", "", s)

    # Remove espaços no início e fim
    return s.strip()


def _mal_get(
    url: str,
    auth: MALAuth,
    params: dict | None = None,
) -> dict | None:
    """Executa GET autenticado na MAL API com retry em caso de erros temporários.

    Usa o header Bearer do MALAuth (que renova o token automaticamente se
    necessário). Retry com backoff exponencial em caso de 429 (rate limit)
    ou erros 5xx (servidor temporariamente indisponível).

    Args:
        url: URL completa do endpoint MAL (ex.: _MAL_ANIMELIST_URL).
        auth: Instância de MALAuth para gerar o header de autorização.
        params: Parâmetros de query string (ex.: {"limit": 100, "nsfw": "true"}).

    Returns:
        Dicionário com o corpo da resposta JSON, ou None em caso de erro
        persistente após todas as tentativas (não levanta exceção — o sync
        pode continuar com os dados já obtidos).
    """
    # Headers necessários para autenticar na API v2 do MAL
    headers = auth.auth_header()

    for tentativa in range(1, _MAX_RETRIES + 1):
        try:
            resposta = requests.get(
                url,
                headers=headers,
                params=params or {},
                timeout=15,  # Timeout para evitar travamento indefinido
            )

            if resposta.status_code == 200:
                # Sucesso — retorna o JSON parseado
                return resposta.json()

            elif resposta.status_code == 429:
                # Rate limit atingido — aguarda e tenta novamente
                delay = _RETRY_BASE_DELAY_SECONDS ** tentativa
                logger.warning(
                    "MAL API rate limit (tentativa %d/%d). Aguardando %ds...",
                    tentativa, _MAX_RETRIES, delay
                )
                time.sleep(delay)

            elif resposta.status_code >= 500:
                # Erro de servidor do MAL — pode ser temporário
                delay = _RETRY_BASE_DELAY_SECONDS ** tentativa
                logger.warning(
                    "MAL API erro %d (tentativa %d/%d). Aguardando %ds...",
                    resposta.status_code, tentativa, _MAX_RETRIES, delay
                )
                time.sleep(delay)

            else:
                # Erro 4xx (ex.: 401 Unauthorized, 404 Not Found) — não é temporário
                logger.error(
                    "MAL API erro permanente %d em %s",
                    resposta.status_code, url
                )
                return None

        except requests.RequestException as exc:
            # Erro de rede (timeout, DNS, conexão recusada)
            delay = _RETRY_BASE_DELAY_SECONDS ** tentativa
            logger.warning(
                "MAL API erro de rede (tentativa %d/%d): %s. Aguardando %ds...",
                tentativa, _MAX_RETRIES, exc, delay
            )
            if tentativa < _MAX_RETRIES:
                time.sleep(delay)

    # Esgotou todas as tentativas sem sucesso
    logger.error("MAL API: todas as %d tentativas falharam para %s", _MAX_RETRIES, url)
    return None


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS PRIVADOS — banco de dados
# ─────────────────────────────────────────────────────────────────────────────

def _upsert_mal_entry(
    mal_id: int,
    title: str,
    status_mal: str,
    episodes_watched: int,
    score: float,
    updated_at_str: str,
) -> str:
    """Insere ou atualiza uma entrada MAL no catálogo local de animes.

    Se o anime já existe (identificado por `mal_id`), atualiza os campos
    de progresso (status, episódios assistidos, nota, timestamp MAL).
    Se não existe, cria um novo registro com apenas os dados vindos do MAL
    (sem enriquecimento via Jikan/AniList — para não bloquear o sync com
    requests lentas).

    Args:
        mal_id: ID único do anime no MyAnimeList.
        title: Título do anime conforme retornado pela API do MAL.
        status_mal: Status na lista MAL em inglês (ex.: "watching", "completed").
        episodes_watched: Número de episódios assistidos até o momento.
        score: Nota do usuário de 0 a 10. Score 0 = sem avaliação (vira NULL).
        updated_at_str: String ISO 8601 do campo `updated_at` da entry MAL.
            Usada para preencher `mal_updated_at` no banco.

    Returns:
        String indicando o resultado: 'created' | 'updated' | 'skipped'.
        'skipped' quando não há linha afetada (ex.: anime com deleted=TRUE).
    """
    # Converte o status do MAL (inglês) para o padrão do banco (português)
    # Se o status não for reconhecido, usa 'quero_assistir' como fallback seguro
    status_banco = _MAL_STATUS_MAP.get(status_mal, "quero_assistir")

    # Score 0 no MAL significa "sem avaliação" — armazenamos como NULL no banco
    # para distinguir "não avaliou" de "deu nota 0"
    score_final: float | None = score if score and score > 0 else None

    # Converte o timestamp ISO do MAL para datetime Python (com timezone UTC)
    # O MAL retorna no formato "2024-01-15T12:30:00+00:00"
    try:
        mal_updated_at = datetime.fromisoformat(updated_at_str.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        # Se o formato for inesperado, usa o momento atual como fallback
        logger.warning(
            "MAL sync: updated_at inválido '%s' para mal_id=%d. Usando NOW().",
            updated_at_str, mal_id
        )
        mal_updated_at = datetime.now(timezone.utc)

    # ── Verifica se o anime já existe no banco (pelo mal_id) ─────────────────
    linhas = run_select(
        "SELECT id FROM anime WHERE mal_id = %(mal_id)s AND deleted = FALSE",
        {"mal_id": mal_id}
    )

    if linhas:
        # ── Anime EXISTE — atualiza os campos de progresso ──────────────────
        # Não sobrescreve campos de enriquecimento (studio, overview, etc.)
        # porque eles podem ter sido preenchidos por tools.py depois do sync.
        rows_afetadas = run_dml(
            """
            UPDATE anime
            SET status           = %(status)s,
                episodes_watched = %(episodes_watched)s,
                score            = %(score)s,
                mal_updated_at   = %(mal_updated_at)s,
                updated_at       = NOW()
            WHERE mal_id = %(mal_id)s
              AND deleted = FALSE
            """,
            {
                "status":           status_banco,
                "episodes_watched": episodes_watched,
                "score":            score_final,
                "mal_updated_at":   mal_updated_at,
                "mal_id":           mal_id,
            }
        )

        # Se rowcount = 0, nenhuma linha foi atualizada (pode ser deleted=TRUE)
        return "updated" if rows_afetadas > 0 else "skipped"

    else:
        # ── Anime NÃO EXISTE — insere com os dados básicos do MAL ───────────
        # ON CONFLICT DO NOTHING protege contra race condition em syncs paralelos
        # (improvável, mas garante idempotência).
        novo_id = str(uuid.uuid4())  # UUID único para esta entrada

        rows_afetadas = run_dml(
            """
            INSERT INTO anime (
                id, mal_id, title, normalizado,
                status, episodes_watched, score,
                source, mal_updated_at,
                created_at, updated_at
            )
            VALUES (
                %(id)s, %(mal_id)s, %(title)s, %(normalizado)s,
                %(status)s, %(episodes_watched)s, %(score)s,
                'mal_sync', %(mal_updated_at)s,
                NOW(), NOW()
            )
            ON CONFLICT DO NOTHING
            """,
            {
                "id":               novo_id,
                "mal_id":           mal_id,
                "title":            title,
                "normalizado":      _norm(title),  # Título normalizado para busca fuzzy
                "status":           status_banco,
                "episodes_watched": episodes_watched,
                "score":            score_final,
                "mal_updated_at":   mal_updated_at,
            }
        )

        # ON CONFLICT DO NOTHING → rowcount = 0 se já existia (race condition)
        return "created" if rows_afetadas > 0 else "skipped"


def _get_last_sync_at() -> datetime | None:
    """Lê o timestamp do último sync bem-sucedido da tabela mal_sync_state.

    Returns:
        Datetime com timezone do último sync, ou None se nunca sincronizou
        (first run) ou se a coluna for NULL.
    """
    linhas = run_select(
        "SELECT last_sync_at FROM mal_sync_state WHERE id = 1"
    )

    if not linhas:
        return None  # Linha singleton não existe ainda

    # last_sync_at pode ser None (NULL no banco) — é None no primeiro sync
    return linhas[0].get("last_sync_at")


def _update_last_sync_at(run_start: datetime) -> None:
    """Atualiza o campo last_sync_at com o timestamp de início do sync.

    Usa o timestamp de INÍCIO (não fim) para garantir que entradas MAL
    modificadas DURANTE o sync sejam reprocessadas no próximo ciclo —
    evitamos janela cega de mudanças feitas enquanto o sync estava rodando.

    Args:
        run_start: Datetime (UTC) de quando o sync começou.
    """
    run_dml(
        """
        UPDATE mal_sync_state
        SET last_sync_at = %(run_start)s,
            updated_at   = NOW()
        WHERE id = 1
        """,
        {"run_start": run_start}
    )

    logger.debug("MAL sync: last_sync_at atualizado para %s", run_start.isoformat())


# ─────────────────────────────────────────────────────────────────────────────
# FUNÇÃO PÚBLICA PRINCIPAL
# ─────────────────────────────────────────────────────────────────────────────

def sync_mal(full: bool = False) -> dict:
    """Sincroniza a lista do MyAnimeList com o catálogo local de animes.

    Por padrão faz delta sync: só processa entradas com `updated_at > last_sync_at`.
    Com `full=True`, processa toda a lista independente do last_sync_at.

    A lista da API MAL é ordenada por `list_updated_at` DESC (mais recente
    primeiro). O delta sync para de iterar quando encontra uma entrada com
    `updated_at <= last_sync_at`, pois todas as entradas seguintes são mais
    antigas e não precisam ser reprocessadas.

    Args:
        full: Se True, ignora last_sync_at e processa toda a lista.
            Útil para o primeiro sync ou para corrigir inconsistências.

    Returns:
        Dicionário com métricas do sync:
            - ok: True se o sync completou sem erros críticos.
            - full: Se foi um full sync (True) ou delta (False).
            - timestamp: ISO 8601 de quando o sync rodou.
            - mal_entries_fetched: Total de entradas MAL processadas.
            - updated: Animes atualizados no banco.
            - created: Animes novos inseridos no banco.
            - skipped: Entradas sem alteração no banco.
            - errors: Lista de dicts com mal_id e msg de erros não fatais.

    Example:
        >>> resultado = sync_mal()
        >>> # {"ok": True, "full": False, "updated": 3, "created": 0, ...}
    """
    # Registra o INÍCIO do sync ANTES de qualquer chamada à API.
    # Isso garante que entradas modificadas DURANTE o sync sejam capturadas
    # no próximo ciclo (usamos run_start, não agora-no-final, como referência).
    run_start = datetime.now(timezone.utc)

    logger.info(
        "MAL sync: iniciando %s sync em %s",
        "full" if full else "delta",
        run_start.isoformat()
    )

    # Carrega o timestamp do último sync para usar como ponto de corte no delta
    last_sync_at = _get_last_sync_at() if not full else None

    if last_sync_at:
        logger.info("MAL sync: delta desde %s", last_sync_at.isoformat())
    else:
        logger.info("MAL sync: sem last_sync_at — processando toda a lista")

    # Cria a instância de autenticação (carrega tokens do banco automaticamente)
    auth = MALAuth()

    # Métricas acumuladas ao longo do sync
    total_fetched = 0  # Entradas MAL processadas (incluindo as paradas pelo delta)
    total_updated = 0  # Animes atualizados no banco
    total_created = 0  # Animes novos inseridos no banco
    total_skipped = 0  # Entradas que não alteraram nada no banco
    erros: list[dict] = []  # Erros não fatais (uma entrada ruim não para o sync)

    # Flag de controle do loop de paginação
    continuar = True

    # URL inicial — as próximas páginas virão no campo `paging.next` da resposta
    url_proxima = _MAL_ANIMELIST_URL

    # Parâmetros do primeiro request — nos requests seguintes, usamos a URL
    # completa de `paging.next` que já inclui os parâmetros necessários
    params_iniciais: dict = {
        # Campos extras do list_status que queremos na resposta
        "fields": "list_status{score,num_episodes_watched,status,updated_at}",
        "nsfw":   "true",     # Inclui conteúdo adulto (lista pessoal completa)
        "limit":  _MAL_PAGE_LIMIT,
        "sort":   "list_updated_at",  # Mais recente primeiro — essencial para o delta
    }

    # Controla se é a primeira página (precisa dos params_iniciais) ou paginação
    primeira_pagina = True

    # ── Loop de paginação ────────────────────────────────────────────────────
    while continuar and url_proxima:
        # Primeira página usa os parâmetros definidos acima;
        # páginas seguintes usam a URL completa da API (sem params adicionais)
        if primeira_pagina:
            resposta = _mal_get(url_proxima, auth, params=params_iniciais)
            primeira_pagina = False
        else:
            # A URL de paginação já inclui todos os parâmetros necessários
            resposta = _mal_get(url_proxima, auth, params=None)

        if resposta is None:
            # Falha na chamada à API (já logado em _mal_get)
            # Registra como erro e para o loop — não queremos perder o last_sync_at
            logger.error("MAL sync: falha ao buscar página. Interrompendo sync.")
            continuar = False
            break

        # Extrai as entradas da resposta (campo "data" é uma lista de animes)
        entradas: list[dict] = resposta.get("data", [])

        if not entradas:
            # Página vazia — fim da lista
            logger.debug("MAL sync: página vazia — fim da lista MAL")
            break

        # ── Processa cada entrada da página ──────────────────────────────────
        for entrada in entradas:
            total_fetched += 1

            try:
                # Extrai os campos de identificação do anime
                node = entrada.get("node", {})
                mal_id: int = node.get("id", 0)
                title: str  = node.get("title", f"anime_{mal_id}")

                # Extrai os campos do status na lista do usuário
                list_status = entrada.get("list_status", {})
                status_mal: str   = list_status.get("status", "plan_to_watch")
                episodes: int     = list_status.get("num_episodes_watched", 0)
                score: float      = float(list_status.get("score", 0) or 0)
                updated_at_str: str = list_status.get("updated_at", "")

                # ── Verificação delta: para quando encontra entrada não modificada ──
                if last_sync_at and updated_at_str:
                    try:
                        # Converte o updated_at da entrada para datetime comparável
                        entry_updated_at = datetime.fromisoformat(
                            updated_at_str.replace("Z", "+00:00")
                        )

                        # A lista está ordenada por updated_at DESC.
                        # Quando a entrada atual é mais antiga que o last_sync_at,
                        # todas as seguintes também serão — podemos parar.
                        if entry_updated_at <= last_sync_at:
                            logger.debug(
                                "MAL sync: delta atingiu entrada não modificada "
                                "(mal_id=%d, updated_at=%s <= last_sync=%s). Parando.",
                                mal_id, updated_at_str, last_sync_at.isoformat()
                            )
                            continuar = False
                            break  # Sai do for — o while também vai parar (continuar=False)

                    except ValueError:
                        # Se o updated_at for inválido, processa a entrada mesmo assim
                        logger.warning(
                            "MAL sync: updated_at inválido '%s' para mal_id=%d. "
                            "Processando mesmo assim.",
                            updated_at_str, mal_id
                        )

                # Mal_id 0 indica dado inválido da API — pula
                if not mal_id:
                    logger.warning("MAL sync: entrada sem mal_id válido — pulando")
                    total_skipped += 1
                    continue

                # ── Upsert no banco ──────────────────────────────────────────
                resultado = _upsert_mal_entry(
                    mal_id=mal_id,
                    title=title,
                    status_mal=status_mal,
                    episodes_watched=episodes,
                    score=score,
                    updated_at_str=updated_at_str,
                )

                # Acumula as métricas de acordo com o resultado do upsert
                if resultado == "created":
                    total_created += 1
                    logger.debug("MAL sync: novo anime criado — mal_id=%d '%s'", mal_id, title)
                elif resultado == "updated":
                    total_updated += 1
                    logger.debug("MAL sync: anime atualizado — mal_id=%d '%s'", mal_id, title)
                else:
                    # 'skipped' — nenhuma linha afetada (ex.: anime com deleted=TRUE)
                    total_skipped += 1

            except Exception as exc:
                # Erro em uma entrada específica não deve parar o sync inteiro.
                # Registra o erro e continua com as próximas entradas.
                mal_id_erro = entrada.get("node", {}).get("id", "?")
                logger.error(
                    "MAL sync: erro ao processar mal_id=%s: %s",
                    mal_id_erro, exc,
                    exc_info=True
                )
                erros.append({
                    "mal_id": mal_id_erro,
                    "msg":    str(exc),
                })
                total_skipped += 1  # Conta como skipped para não distorcer métricas

        # ── Paginação: busca a URL da próxima página ──────────────────────────
        if continuar:
            # O campo `paging.next` contém a URL completa da próxima página,
            # ou está ausente quando chegamos na última página
            paging = resposta.get("paging", {})
            url_proxima = paging.get("next")  # None quando não há próxima página

            if url_proxima:
                logger.debug("MAL sync: buscando próxima página...")
            else:
                logger.debug("MAL sync: última página atingida")

    # ── Atualiza last_sync_at no banco ───────────────────────────────────────
    # Usa run_start (momento de início do sync), não agora, para garantir que
    # mudanças feitas no MAL DURANTE o sync sejam capturadas no próximo ciclo.
    try:
        _update_last_sync_at(run_start)
    except Exception as exc:
        # Falha ao atualizar last_sync_at é um erro de banco — registra mas não falha o sync
        logger.error("MAL sync: falha ao atualizar last_sync_at: %s", exc)
        erros.append({"mal_id": None, "msg": f"last_sync_at não atualizado: {exc}"})

    # ── Resultado final ───────────────────────────────────────────────────────
    resultado_final = {
        "ok":                 True,            # Sync completou (mesmo com erros individuais)
        "full":               full,            # True se foi full sync
        "timestamp":          run_start.isoformat(),  # Quando o sync iniciou
        "mal_entries_fetched": total_fetched,  # Total de entradas processadas da API
        "updated":            total_updated,   # Animes atualizados no banco
        "created":            total_created,   # Animes novos criados
        "skipped":            total_skipped,   # Entradas sem alteração ou com erro
        "errors":             erros,           # Erros individuais (lista de dicts)
    }

    logger.info(
        "MAL sync: concluído — %d buscados, %d atualizados, %d criados, "
        "%d pulados, %d erros",
        total_fetched, total_updated, total_created, total_skipped, len(erros)
    )

    return resultado_final
