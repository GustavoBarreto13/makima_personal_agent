"""Ferramentas do agente Nami para gerenciamento de finanças pessoais.

Todas as operações financeiras — criar, editar, deletar e consultar
transações e assinaturas — são feitas aqui e armazenadas no BigQuery
(banco de dados em nuvem do Google).

Usage:
    As ferramentas deste módulo são registradas automaticamente no
    nami_agent e chamadas pelo modelo de IA conforme necessário.
    Não é necessário chamá-las diretamente.
"""

import os       # Para ler variáveis de ambiente (credenciais, IDs do projeto)
import uuid     # Para gerar IDs únicos para cada transação/assinatura
from datetime import date          # Para obter a data de hoje
from zoneinfo import ZoneInfo      # Para trabalhar com fuso horário (horário de Brasília)

from google.cloud import bigquery  # Cliente oficial do BigQuery (banco de dados na nuvem)

# Fuso horário de São Paulo / Brasília — usado para garantir que as datas
# registradas sejam no horário brasileiro, não no UTC do servidor
_TZ = ZoneInfo("America/Sao_Paulo")

# Lista de categorias válidas para classificar uma transação.
# Qualquer valor fora dessa lista será rejeitado para manter consistência nos dados.
CATEGORIES = [
    "Alimentacao", "Comer Fora", "Saude", "Lazer", "Transporte",
    "Moradia", "Roupas", "Educacao", "Assinaturas", "Viagem",
    "Presente", "Beleza", "Academia", "Farmacia", "Supermercado",
    "Eletronicos", "Pet", "Investimento", "Receita", "Inbox",
]

# Lista hardcoded mantida apenas para compatibilidade com testes legados.
# A fonte canônica de contas agora é a tabela `accounts` no BigQuery.
ACCOUNTS = ["Cartao Nu", "Cartao Itau", "Itau", "Mercado Pago", "Generico", "Dinheiro"]

# Variável global que armazena o cliente do BigQuery após a primeira criação.
_bq_client = None

# Cache das contas carregadas da tabela `accounts` no BigQuery.
# None = não carregado ainda; lista vazia = nenhuma conta cadastrada.
_accounts_cache: list[dict] | None = None


def _load_accounts() -> list[dict]:
    """Carrega contas ativas do BigQuery e armazena em cache para evitar queries repetidas."""
    global _accounts_cache
    if _accounts_cache is None:
        try:
            rows = _run_select(
                f"SELECT id, name FROM `{_project()}.nami_finance_agent.accounts` WHERE status = 'ativo'",
                [],
            )
            _accounts_cache = rows
        except Exception:
            # Se a tabela ainda não existir (ex.: ambiente de testes sem BQ),
            # retorna lista vazia em vez de lançar exceção
            _accounts_cache = []
    return _accounts_cache


def _invalidate_accounts_cache() -> None:
    """Invalida o cache de contas para forçar recarga na próxima chamada."""
    global _accounts_cache
    _accounts_cache = None


# Cache de cartões ativos — mesmo padrão do cache de contas.
# None = ainda não carregado; lista = já carregado (pode ser vazia).
_cards_cache: list[dict] | None = None


def _load_cards() -> list[dict]:
    """Carrega cartões ativos do BigQuery e armazena em cache para evitar queries repetidas."""
    global _cards_cache
    if _cards_cache is None:
        try:
            rows = _run_select(
                f"SELECT id, name FROM `{_project()}.nami_finance_agent.credit_cards` WHERE status = 'ativo'",
                [],
            )
            _cards_cache = rows
        except Exception:
            # Se a tabela ainda não existir (ex.: ambiente de testes sem BQ),
            # retorna lista vazia em vez de lançar exceção
            _cards_cache = []
    return _cards_cache


def _invalidate_cards_cache() -> None:
    """Invalida o cache de cartões para forçar recarga na próxima chamada."""
    global _cards_cache
    _cards_cache = None


def _resolve_credit_card(name: str) -> dict | None:
    """Resolve nome de cartão para {id, name} consultando credit_cards.

    Aceita correspondência exata ou por prefixo (case-insensitive, sem acentos).
    Retorna None se não encontrar ou se houver ambiguidade (mais de 1 match).

    Args:
        name: Nome ou prefixo do cartão digitado pelo usuário.

    Returns:
        Dicionário {"id": ..., "name": ...} ou None.
    """
    norm = _norm(name)
    cards = _load_cards()
    matches = [c for c in cards if _norm(c["name"]) == norm or _norm(c["name"]).startswith(norm)]
    return matches[0] if len(matches) == 1 else None


def _resolve_account(name: str) -> dict | None:
    """Resolve nome de conta para {id, name} consultando a tabela accounts.

    Aceita correspondência exata ou por prefixo (case-insensitive, sem acentos).
    Retorna None se não encontrar ou se houver ambiguidade (mais de 1 match).

    Args:
        name: Nome ou prefixo da conta digitado pelo usuário.

    Returns:
        Dicionário {"id": ..., "name": ...} ou None.
    """
    norm = _norm(name)
    accounts = _load_accounts()
    matches = [a for a in accounts if _norm(a["name"]) == norm or _norm(a["name"]).startswith(norm)]
    return matches[0] if len(matches) == 1 else None


def _client() -> bigquery.Client:
    """Retorna o cliente do BigQuery, criando-o na primeira chamada.

    Usa a variável global _bq_client para reutilizar a conexão entre chamadas
    e evitar abrir múltiplas conexões desnecessárias ao banco.
    """
    global _bq_client  # Indica que vamos modificar a variável global, não criar uma local

    # Só cria o cliente se ainda não foi inicializado
    if _bq_client is None:
        # Tenta ler as credenciais do GCP a partir de uma variável de ambiente
        # (string JSON com o conteúdo do arquivo de service account)
        creds_json = os.environ.get("GCP_CREDENTIALS_JSON", "")

        if creds_json:
            # Se a variável GCP_CREDENTIALS_JSON estiver definida, usa as credenciais
            # diretamente do JSON — útil em ambientes como Docker/VPS onde montar
            # arquivos é mais difícil do que definir variáveis de ambiente
            import json
            from google.oauth2 import service_account

            # Converte a string JSON em dicionário Python
            info = json.loads(creds_json)

            # Cria as credenciais de serviço a partir do dicionário,
            # limitando o acesso ao escopo do BigQuery (princípio de menor privilégio)
            creds = service_account.Credentials.from_service_account_info(
                info,
                scopes=["https://www.googleapis.com/auth/bigquery"],
            )

            # Instancia o cliente do BigQuery com as credenciais explícitas
            _bq_client = bigquery.Client(project=_project(), credentials=creds)
        else:
            # Se GCP_CREDENTIALS_JSON não estiver definida, o cliente usa as
            # credenciais padrão do ambiente (Application Default Credentials —
            # funciona localmente com `gcloud auth application-default login`)
            _bq_client = bigquery.Client(project=_project())

    return _bq_client


def _project() -> str:
    """Retorna o ID do projeto GCP lido da variável de ambiente GCP_PROJECT_ID.

    Lança um erro se a variável não estiver definida, porque sem o projeto
    não é possível fazer nenhuma query no BigQuery.
    """
    p = os.environ.get("GCP_PROJECT_ID", "")  # Lê a variável de ambiente

    # Se o valor for vazio, o sistema não sabe qual projeto usar — aborta com erro claro
    if not p:
        raise EnvironmentError("GCP_PROJECT_ID not set")

    return p


def _table(name: str = "transactions") -> str:
    """Retorna o caminho completo de uma tabela no BigQuery no formato esperado pelo SQL.

    O formato é: `projeto.dataset.tabela` — as crases são necessárias no SQL
    do BigQuery quando o nome contém hífens ou outros caracteres especiais.
    """
    # Exemplo de resultado: `meu-projeto.nami_finance_agent.transactions`
    return f"`{_project()}.nami_finance_agent.{name}`"


def _norm(s: str) -> str:
    """Normaliza uma string removendo acentos e convertendo para minúsculas.

    Usado para comparações flexíveis: "Alimentação" e "alimentacao" devem
    ser tratados como o mesmo valor ao buscar uma categoria ou conta.
    """
    import unicodedata

    # NFD decompõe os caracteres acentuados (ex.: "ã" → "a" + til combinante)
    # encode("ascii", "ignore") descarta os acentos (caracteres não-ASCII)
    # decode() converte de volta para string Python
    # lower() transforma em minúsculas para comparação case-insensitive
    return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode().lower()


def _run_select(sql: str, params: list = None) -> list[dict]:
    """Executa uma query SELECT no BigQuery e retorna as linhas como lista de dicionários.

    Usa parâmetros nomeados (@nome) no SQL para evitar SQL injection —
    nunca concatenamos valores do usuário direto na string SQL.
    """
    # Configura os parâmetros da query (substitui os @placeholder pelos valores reais)
    job_config = bigquery.QueryJobConfig(query_parameters=params or [])

    # Envia a query para o BigQuery e aguarda (.result()) até ela terminar
    result = _client().query(sql, job_config=job_config).result()

    # Converte cada linha do resultado em um dicionário Python para fácil manipulação
    return [dict(row) for row in result]


def _run_dml(sql: str, params: list = None) -> int:
    """Executa uma operação de modificação de dados (INSERT, UPDATE, DELETE) no BigQuery.

    Retorna o número de linhas afetadas — útil para verificar se algo foi
    realmente alterado (ex.: se 0 linhas foram afetadas, o registro não existia).
    """
    # Configura os parâmetros da query (evita SQL injection)
    job_config = bigquery.QueryJobConfig(query_parameters=params or [])

    # Envia a operação para o BigQuery
    job = _client().query(sql, job_config=job_config)

    # Aguarda a operação terminar no servidor
    job.result()

    # Retorna quantas linhas foram afetadas (0 se nenhuma foi modificada)
    return job.num_dml_affected_rows or 0


def _today() -> str:
    """Retorna a data de hoje no formato 'AAAA-MM-DD' (padrão aceito pelo BigQuery)."""
    return date.today().strftime("%Y-%m-%d")


def _month_start() -> str:
    """Retorna o primeiro dia do mês atual no formato 'AAAA-MM-DD'.

    Usado como data de início padrão em consultas mensais.
    """
    # replace(day=1) troca apenas o dia para 1, mantendo mês e ano atuais
    return date.today().replace(day=1).strftime("%Y-%m-%d")


def _match_category(name: str) -> str | None:
    """Tenta encontrar uma categoria válida a partir de um texto digitado pelo usuário.

    Aceita correspondência exata ou prefixo (ex.: "alim" encontra "Alimentacao").
    Retorna None se não encontrar nenhuma correspondência única — assim o sistema
    pode pedir ao usuário que seja mais específico em vez de assumir errado.
    """
    # Normaliza o texto digitado para comparação sem acentos e em minúsculas
    norm = _norm(name)

    # Filtra as categorias que são iguais ao texto OU começam com ele
    matches = [c for c in CATEGORIES if _norm(c) == norm or _norm(c).startswith(norm)]

    # Só retorna se houver exatamente 1 correspondência — evita ambiguidade
    # (ex.: "sa" poderia ser "Saude" ou "Supermercado" — retorna None nesses casos)
    return matches[0] if len(matches) == 1 else None


def _match_account(name: str) -> str | None:
    """Alias de compatibilidade — usa _resolve_account internamente.

    Retorna o nome canônico da conta (string) ou None se não encontrar.
    Prefira _resolve_account quando precisar do account_id.
    """
    result = _resolve_account(name)
    return result["name"] if result else None


# ─────────────────────────────────────────────────────────────────────────────
# FERRAMENTAS PÚBLICAS — chamadas pelo agente Nami via ADK
# ─────────────────────────────────────────────────────────────────────────────

def create_transaction(
    name: str,
    valor: float,
    tipo: str,
    categoria: str = "Inbox",
    conta: str = "",
    data: str = "",
    notes: str = "",
    subscription_id: str = "",
    card_id: str = "",
) -> dict:
    """Cria uma nova transação financeira (despesa ou receita) no BigQuery.

    Parâmetros:
        name          — Descrição da transação (ex.: "Almoço no bandejão")
        valor         — Valor em reais (ex.: 25.50)
        tipo          — "Despesa" ou "Receita"
        categoria     — Categoria da transação (deve estar na lista CATEGORIES)
        conta         — Conta/meio de pagamento (padrão: resolução automática)
        data          — Data no formato AAAA-MM-DD (padrão: hoje)
        notes         — Observações opcionais
        subscription_id — ID de assinatura vinculada (opcional)
        card_id       — ID do cartão de crédito (opcional). Quando fornecido,
                        account_id fica NULL — a transação pertence ao cartão,
                        não a uma conta bancária.

    Retorna um dicionário com "status": "ok" e o ID gerado, ou "status": "error"
    com uma mensagem descritiva se algo for inválido.
    """
    # Valida a categoria: verifica se o texto informado corresponde a uma categoria conhecida
    cat = _match_category(categoria)
    if cat is None:
        # Retorna erro com a lista de opções válidas para o usuário corrigir
        return {"status": "error", "message": f"Categoria inválida: '{categoria}'. Opções: {', '.join(CATEGORIES)}"}

    # Separa o caminho: transação de cartão vs. transação de conta bancária.
    # As duas são mutuamente exclusivas — nunca account_id e card_id populados juntos.
    if card_id:
        # Transação pertence ao cartão: usa o nome passado como display, account_id fica NULL
        acc = conta  # nome do cartão para exibição (campo conta continua preenchido por legibilidade)
        acc_id = None
    else:
        # Transação pertence a uma conta bancária: resolve nome → {id, name}
        acc_obj = _resolve_account(conta or "Generico")
        if acc_obj is None:
            return {"status": "error", "message": f"Conta inválida: '{conta}'. Use list_accounts() para ver as contas disponíveis."}
        acc = acc_obj["name"]
        acc_id = acc_obj["id"]

    # Valida o tipo: só aceita "Despesa" ou "Receita" — nada mais
    if tipo not in ("Despesa", "Receita"):
        return {"status": "error", "message": "tipo deve ser 'Despesa' ou 'Receita'"}

    # Gera um ID único universal (UUID v4) para identificar esta transação
    tx_id = str(uuid.uuid4())

    # Usa a data informada ou, se não foi informada, usa a data de hoje
    tx_date = data or _today()

    # Monta a query SQL de inserção com parâmetros nomeados (@nome)
    # para evitar SQL injection (nunca concatenamos valores direto na string)
    sql = f"""
        INSERT INTO {_table()} (id, name, valor, tipo, categoria, conta, account_id, card_id, data, source, notes, subscription_id, created_at, deleted)
        VALUES (@id, @name, @valor, @tipo, @categoria, @conta, @account_id, @card_id, @data, @source, @notes, @subscription_id, CURRENT_TIMESTAMP(), FALSE)
    """

    # Define os valores que substituirão cada @placeholder na query,
    # com seus tipos de dados corretos para o BigQuery
    params = [
        bigquery.ScalarQueryParameter("id", "STRING", tx_id),
        bigquery.ScalarQueryParameter("name", "STRING", name),
        bigquery.ScalarQueryParameter("valor", "FLOAT64", float(valor)),  # float() garante tipo numérico
        bigquery.ScalarQueryParameter("tipo", "STRING", tipo),
        bigquery.ScalarQueryParameter("categoria", "STRING", cat),     # cat já é o nome normalizado
        bigquery.ScalarQueryParameter("conta", "STRING", acc),          # acc já é o nome normalizado
        bigquery.ScalarQueryParameter("account_id", "STRING", acc_id),  # NULL para transações de cartão
        bigquery.ScalarQueryParameter("card_id", "STRING", card_id or None),  # NULL para transações de conta
        bigquery.ScalarQueryParameter("data", "DATE", tx_date),
        bigquery.ScalarQueryParameter("source", "STRING", "telegram"),  # marca que veio pelo bot
        bigquery.ScalarQueryParameter("notes", "STRING", notes or None),
        bigquery.ScalarQueryParameter("subscription_id", "STRING", subscription_id or None),
    ]

    try:
        # Executa a inserção no BigQuery
        _run_dml(sql, params)
        # Retorna confirmação com o ID gerado e um resumo legível
        return {"status": "ok", "id": tx_id, "message": f"Transação criada: {name} R${float(valor):.2f} ({cat})"}
    except Exception as e:
        # Captura qualquer erro do BigQuery e retorna como mensagem amigável
        return {"status": "error", "message": str(e)}


def update_transaction(
    id: str,
    name: str = "",
    valor: float = None,
    tipo: str = "",
    categoria: str = "",
    conta: str = "",
    data: str = "",
    notes: str = "",
) -> dict:
    """Atualiza campos de uma transação existente no BigQuery.

    Só altera os campos que forem informados (não-vazios / não-None).
    O campo `updated_at` é sempre atualizado para registrar quando ocorreu a mudança.

    Parâmetros:
        id       — ID da transação a ser editada (obrigatório)
        Os demais parâmetros são opcionais — só os informados serão alterados.

    Retorna "status": "ok" se atualizado, "status": "error" se não encontrado ou inválido.
    """
    # Lista de cláusulas SET do SQL — começa sempre com updated_at para registrar a edição
    sets = ["updated_at = CURRENT_TIMESTAMP()"]

    # Parâmetros da query — começa com o ID para o WHERE no final
    params = [bigquery.ScalarQueryParameter("id", "STRING", id)]

    # Para cada campo opcional, só adiciona ao SET se o valor foi informado
    if name:
        sets.append("name = @name")
        params.append(bigquery.ScalarQueryParameter("name", "STRING", name))

    if valor is not None:
        # Verifica explicitamente None (não string vazia) porque 0.0 é um valor válido
        sets.append("valor = @valor")
        params.append(bigquery.ScalarQueryParameter("valor", "FLOAT64", float(valor)))

    if tipo:
        # Valida o tipo antes de aceitar
        if tipo not in ("Despesa", "Receita"):
            return {"status": "error", "message": "tipo deve ser 'Despesa' ou 'Receita'"}
        sets.append("tipo = @tipo")
        params.append(bigquery.ScalarQueryParameter("tipo", "STRING", tipo))

    if categoria:
        # Valida e normaliza o nome da categoria
        cat = _match_category(categoria)
        if cat is None:
            return {"status": "error", "message": f"Categoria inválida: '{categoria}'"}
        sets.append("categoria = @categoria")
        params.append(bigquery.ScalarQueryParameter("categoria", "STRING", cat))

    if conta:
        # Valida e normaliza o nome da conta
        acc = _match_account(conta)
        if acc is None:
            return {"status": "error", "message": f"Conta inválida: '{conta}'"}
        sets.append("conta = @conta")
        params.append(bigquery.ScalarQueryParameter("conta", "STRING", acc))

    if data:
        sets.append("data = @data")
        params.append(bigquery.ScalarQueryParameter("data", "DATE", data))

    if notes:
        sets.append("notes = @notes")
        params.append(bigquery.ScalarQueryParameter("notes", "STRING", notes))

    # Se só o updated_at foi adicionado, não há campos reais para mudar — aborta
    if len(sets) == 1:
        return {"status": "error", "message": "Nenhum campo para atualizar"}

    # Monta o UPDATE com todos os campos coletados acima
    # AND deleted = FALSE garante que não atualizamos transações já deletadas
    sql = f"UPDATE {_table()} SET {', '.join(sets)} WHERE id = @id AND deleted = FALSE"

    try:
        affected = _run_dml(sql, params)

        # Se nenhuma linha foi afetada, o ID não existe ou já foi deletado
        if affected == 0:
            return {"status": "error", "message": f"Transação não encontrada: {id}"}

        return {"status": "ok", "message": "Transação atualizada"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def delete_transaction(id: str) -> dict:
    """Remove uma transação do histórico financeiro (soft delete — não apaga do banco).

    Ao invés de apagar fisicamente o registro, marca o campo `deleted = TRUE`.
    Isso preserva o histórico e permite auditoria futura.

    Parâmetros:
        id — ID da transação a ser removida

    Retorna "status": "ok" se removida, "status": "error" se não encontrada.
    """
    # Soft delete: atualiza o flag `deleted` para TRUE em vez de usar DELETE
    # Também registra o momento da remoção em `updated_at`
    sql = f"UPDATE {_table()} SET deleted = TRUE, updated_at = CURRENT_TIMESTAMP() WHERE id = @id AND deleted = FALSE"
    params = [bigquery.ScalarQueryParameter("id", "STRING", id)]

    try:
        affected = _run_dml(sql, params)

        # Se 0 linhas foram afetadas, o ID não existe ou já estava deletado
        if affected == 0:
            return {"status": "error", "message": f"Transação não encontrada: {id}"}

        return {"status": "ok", "message": "Transação removida"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def query_expenses(start_date: str = "", end_date: str = "") -> dict:
    """Busca todas as transações em um período e retorna a lista com o total.

    Se as datas não forem informadas, usa o mês atual (do dia 1 até hoje).

    Parâmetros:
        start_date — Data de início no formato AAAA-MM-DD (padrão: primeiro dia do mês)
        end_date   — Data de fim no formato AAAA-MM-DD (padrão: hoje)

    Retorna lista de transações, quantidade e soma total dos valores.
    """
    # Define o período de busca: datas informadas ou padrão (mês atual)
    start = start_date or _month_start()
    end = end_date or _today()

    # Query que busca todas as transações não-deletadas no período,
    # ordenadas da mais recente para a mais antiga
    sql = f"""
        SELECT id, name, valor, tipo, categoria, conta,
               CAST(data AS STRING) AS data, source, notes, subscription_id
        FROM {_table()}
        WHERE data BETWEEN @start AND @end
          AND deleted = FALSE
        ORDER BY data DESC
    """

    # Parâmetros de data para o filtro BETWEEN
    params = [
        bigquery.ScalarQueryParameter("start", "DATE", start),
        bigquery.ScalarQueryParameter("end", "DATE", end),
    ]

    try:
        rows = _run_select(sql, params)

        # Soma todos os valores das transações para calcular o total do período
        total = sum(r["valor"] for r in rows)

        return {"status": "ok", "transactions": rows, "count": len(rows), "total": total}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def get_spending_summary(period: str = "month", group_by: str = "categoria") -> dict:
    """Retorna um resumo dos gastos agrupados por categoria, conta ou tipo.

    Permite visualizar para onde o dinheiro está indo em um dado período.

    Parâmetros:
        period   — Período de análise: "month" (mês atual), "week" (semana atual),
                   "year" (ano atual) ou "YYYY-MM" (mês específico, ex.: "2025-03")
        group_by — Campo de agrupamento: "categoria", "conta" ou "tipo"

    Retorna um dicionário com o total por grupo e o total geral do período.
    """
    import calendar
    from datetime import timedelta

    # Valida o campo de agrupamento — apenas esses três são colunas reais no banco
    if group_by not in ("categoria", "conta", "tipo"):
        return {"status": "error", "message": "group_by deve ser 'categoria', 'conta' ou 'tipo'"}

    today = date.today()

    # Determina o intervalo de datas com base no período solicitado
    if period == "month":
        # Mês atual: do dia 1 até hoje
        start = today.replace(day=1).strftime("%Y-%m-%d")
        end = today.strftime("%Y-%m-%d")

    elif period == "week":
        # Semana atual: de segunda-feira (weekday=0) até hoje
        # timedelta(days=today.weekday()) calcula quantos dias se passaram desde segunda
        start = (today - timedelta(days=today.weekday())).strftime("%Y-%m-%d")
        end = today.strftime("%Y-%m-%d")

    elif period == "year":
        # Ano atual: de 1 de janeiro até hoje
        start = today.replace(month=1, day=1).strftime("%Y-%m-%d")
        end = today.strftime("%Y-%m-%d")

    elif len(period) == 7 and period[4] == "-":
        # Formato "YYYY-MM" — mês específico: do dia 1 ao último dia do mês
        year, month = int(period[:4]), int(period[5:])
        last_day = calendar.monthrange(year, month)[1]  # quantos dias tem o mês
        start = f"{period}-01"
        end = f"{period}-{last_day:02d}"  # :02d formata com zero à esquerda (ex.: 09)

    else:
        # Formato não reconhecido — retorna erro com as opções válidas
        return {"status": "error", "message": "period inválido. Use 'month', 'week', 'year' ou 'YYYY-MM'"}

    # Query que soma os valores agrupados pelo campo escolhido
    # O nome da coluna (group_by) é inserido diretamente porque já foi validado acima
    sql = f"""
        SELECT {group_by}, SUM(valor) AS total
        FROM {_table()}
        WHERE data BETWEEN @start AND @end
          AND deleted = FALSE
        GROUP BY {group_by}
        ORDER BY total DESC
    """

    params = [
        bigquery.ScalarQueryParameter("start", "DATE", start),
        bigquery.ScalarQueryParameter("end", "DATE", end),
    ]

    try:
        rows = _run_select(sql, params)

        # Converte a lista de linhas em um dicionário {grupo: total}
        # Ex.: {"Alimentacao": 450.0, "Transporte": 120.0}
        summary = {r[group_by]: r["total"] for r in rows}

        return {
            "status": "ok",
            "summary": summary,
            "total": sum(summary.values()),  # soma geral de todos os grupos
            "period": period,
            "group_by": group_by,
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


def get_spending_trend(months: int = 3) -> dict:
    """Retorna o total gasto por mês nos últimos N meses e projeta o gasto do mês atual.

    Permite identificar tendências de aumento ou redução de gastos ao longo do tempo.

    Parâmetros:
        months — Quantos meses anteriores ao atual incluir na análise (padrão: 3)

    Retorna um dicionário com o total por mês e uma projeção para o mês atual
    baseada no ritmo de gastos até hoje.
    """
    import calendar
    from datetime import timedelta

    today = date.today()

    # Calcula o primeiro dia do período: volta `months` meses antes do mês atual
    # A lógica: começa do dia 1 do mês atual e vai subtraindo meses um a um
    start = today.replace(day=1)
    for _ in range(months):
        # Subtrai 1 dia (vai para o último dia do mês anterior) e troca para dia 1
        start = (start - timedelta(days=1)).replace(day=1)

    # Query que agrupa o total por mês no formato "YYYY-MM"
    sql = f"""
        SELECT FORMAT_DATE('%Y-%m', data) AS month, SUM(valor) AS total
        FROM {_table()}
        WHERE data BETWEEN @start AND @end
          AND deleted = FALSE
        GROUP BY month
        ORDER BY month
    """

    params = [
        bigquery.ScalarQueryParameter("start", "DATE", start.strftime("%Y-%m-%d")),
        bigquery.ScalarQueryParameter("end", "DATE", today.strftime("%Y-%m-%d")),
    ]

    try:
        rows = _run_select(sql, params)

        # Converte a lista de linhas em um dicionário {mês: total}
        # Ex.: {"2025-01": 1200.0, "2025-02": 980.0, "2025-03": 430.0}
        trend = {r["month"]: r["total"] for r in rows}

        # Calcula a projeção do mês atual baseada nos gastos até hoje
        current_month = today.strftime("%Y-%m")
        current_spend = trend.get(current_month, 0.0)  # gasto acumulado até hoje neste mês
        days_in_month = calendar.monthrange(today.year, today.month)[1]  # total de dias no mês

        # Projeção linear: (gasto até hoje / dias decorridos) × total de dias no mês
        # today.day > 0 evita divisão por zero (sempre True, mas é uma salvaguarda)
        projected = round(current_spend / today.day * days_in_month, 2) if today.day > 0 else 0.0

        return {"status": "ok", "trend": trend, "current_month_projected": projected}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def create_subscription(
    name: str,
    valor: float,
    ciclo: str,
    next_billing: str,
    conta: str,
    categoria: str,
    notes: str = "",
) -> dict:
    """Cadastra uma nova assinatura recorrente (ex.: Netflix, Spotify, academia).

    Parâmetros:
        name         — Nome do serviço (ex.: "Netflix")
        valor        — Valor da cobrança (ex.: 55.90)
        ciclo        — Frequência: "mensal" ou "anual"
        next_billing — Próxima data de cobrança no formato AAAA-MM-DD
        conta        — Conta usada para pagamento (deve estar em ACCOUNTS)
        categoria    — Categoria da assinatura (deve estar em CATEGORIES)
        notes        — Observações opcionais

    Retorna "status": "ok" com o ID criado, ou "status": "error" se algo for inválido.
    """
    # Valida o ciclo de cobrança — só aceita mensal ou anual
    if ciclo not in ("mensal", "anual"):
        return {"status": "error", "message": "ciclo deve ser 'mensal' ou 'anual'"}

    # Valida e normaliza a conta informada
    acc = _match_account(conta)
    if acc is None:
        return {"status": "error", "message": f"Conta inválida: '{conta}'. Opções: {', '.join(ACCOUNTS)}"}

    # Valida e normaliza a categoria informada
    cat = _match_category(categoria)
    if cat is None:
        return {"status": "error", "message": f"Categoria inválida: '{categoria}'"}

    # Gera um ID único para esta assinatura
    sub_id = str(uuid.uuid4())

    # Monta a query de inserção na tabela de assinaturas
    # status 'ativa' é o valor inicial — pode ser alterado depois via update_subscription
    sql = f"""
        INSERT INTO {_table("subscriptions")} (id, name, valor, ciclo, next_billing, conta, categoria, status, notes, created_at)
        VALUES (@id, @name, @valor, @ciclo, @next_billing, @conta, @categoria, 'ativa', @notes, CURRENT_TIMESTAMP())
    """

    params = [
        bigquery.ScalarQueryParameter("id", "STRING", sub_id),
        bigquery.ScalarQueryParameter("name", "STRING", name),
        bigquery.ScalarQueryParameter("valor", "FLOAT64", float(valor)),
        bigquery.ScalarQueryParameter("ciclo", "STRING", ciclo),
        bigquery.ScalarQueryParameter("next_billing", "DATE", next_billing),
        bigquery.ScalarQueryParameter("conta", "STRING", acc),
        bigquery.ScalarQueryParameter("categoria", "STRING", cat),
        bigquery.ScalarQueryParameter("notes", "STRING", notes or None),  # None = NULL no banco
    ]

    try:
        _run_dml(sql, params)
        # Retorna confirmação com um resumo legível da assinatura criada
        return {"status": "ok", "id": sub_id, "message": f"Assinatura criada: {name} R${float(valor):.2f}/{ciclo}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def list_subscriptions(status: str = "ativa") -> dict:
    """Lista todas as assinaturas com o status informado.

    Também calcula o custo mensal total considerando assinaturas anuais
    (dividindo o valor anual por 12 para obter o equivalente mensal).

    Parâmetros:
        status — Filtro de status: "ativa" (padrão), "pausada" ou "cancelada"

    Retorna lista de assinaturas e o custo mensal equivalente total.
    """
    # Busca as assinaturas com o status solicitado, ordenando pela próxima cobrança
    sql = f"""
        SELECT id, name, valor, ciclo, CAST(next_billing AS STRING) AS next_billing,
               conta, categoria, status, notes
        FROM {_table("subscriptions")}
        WHERE status = @status
        ORDER BY next_billing
    """

    params = [bigquery.ScalarQueryParameter("status", "STRING", status)]

    try:
        rows = _run_select(sql, params)

        # Calcula o total mensal equivalente:
        # - Assinaturas mensais: usa o valor diretamente
        # - Assinaturas anuais: divide por 12 para obter o custo mensal proporcional
        total_mensal = sum(
            r["valor"] if r["ciclo"] == "mensal" else r["valor"] / 12
            for r in rows
        )

        return {"status": "ok", "subscriptions": rows, "total_mensal": round(total_mensal, 2)}
    except Exception as e:
        return {"status": "error", "message": str(e)}


def update_subscription(
    id: str,
    name: str = "",
    valor: float = None,
    ciclo: str = "",
    next_billing: str = "",
    conta: str = "",
    status: str = "",
    notes: str = "",
) -> dict:
    """Atualiza campos de uma assinatura existente.

    Só altera os campos que forem informados (não-vazios / não-None).
    Permite pausar, cancelar ou reativar uma assinatura via o campo `status`.

    Parâmetros:
        id           — ID da assinatura a ser editada (obrigatório)
        Os demais parâmetros são opcionais — só os informados serão alterados.
        status       — Novo status: "ativa", "pausada" ou "cancelada"

    Retorna "status": "ok" se atualizado, "status": "error" se não encontrada ou inválida.
    """
    # Lista de cláusulas SET — começa com updated_at para registrar quando foi alterado
    sets = ["updated_at = CURRENT_TIMESTAMP()"]

    # Parâmetros começam com o ID que será usado no WHERE
    params = [bigquery.ScalarQueryParameter("id", "STRING", id)]

    # Adiciona cada campo ao SET apenas se foi informado pelo usuário
    if name:
        sets.append("name = @name")
        params.append(bigquery.ScalarQueryParameter("name", "STRING", name))

    if valor is not None:
        # Checa None explicitamente pois 0.0 seria um valor válido (mesmo que estranho)
        sets.append("valor = @valor")
        params.append(bigquery.ScalarQueryParameter("valor", "FLOAT64", float(valor)))

    if ciclo:
        # Valida o ciclo antes de aceitar
        if ciclo not in ("mensal", "anual"):
            return {"status": "error", "message": "ciclo deve ser 'mensal' ou 'anual'"}
        sets.append("ciclo = @ciclo")
        params.append(bigquery.ScalarQueryParameter("ciclo", "STRING", ciclo))

    if next_billing:
        sets.append("next_billing = @next_billing")
        params.append(bigquery.ScalarQueryParameter("next_billing", "DATE", next_billing))

    if conta:
        # Valida e normaliza a conta
        acc = _match_account(conta)
        if acc is None:
            return {"status": "error", "message": f"Conta inválida: '{conta}'"}
        sets.append("conta = @conta")
        params.append(bigquery.ScalarQueryParameter("conta", "STRING", acc))

    if status:
        # Só aceita os três estados válidos do ciclo de vida de uma assinatura
        if status not in ("ativa", "pausada", "cancelada"):
            return {"status": "error", "message": "status deve ser 'ativa', 'pausada' ou 'cancelada'"}
        sets.append("status = @status")
        params.append(bigquery.ScalarQueryParameter("status", "STRING", status))

    if notes:
        sets.append("notes = @notes")
        params.append(bigquery.ScalarQueryParameter("notes", "STRING", notes))

    # Se só o updated_at foi adicionado, não há campos reais a mudar — aborta
    if len(sets) == 1:
        return {"status": "error", "message": "Nenhum campo para atualizar"}

    # Monta o UPDATE — sem filtro deleted porque assinaturas não usam soft delete
    sql = f"UPDATE {_table('subscriptions')} SET {', '.join(sets)} WHERE id = @id"

    try:
        affected = _run_dml(sql, params)

        # Se nenhuma linha foi afetada, o ID não existe na tabela
        if affected == 0:
            return {"status": "error", "message": f"Assinatura não encontrada: {id}"}

        return {"status": "ok", "message": "Assinatura atualizada"}
    except Exception as e:
        return {"status": "error", "message": str(e)}
