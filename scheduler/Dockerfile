# Imagem do serviço de agendamento (container makima-scheduler).
#
# Este container roda o APScheduler (scheduler/main.py) e, nos horários definidos,
# dispara os jobs recorrentes (backup, sync da Kurisu, sync do Letterboxd, etc.).
#
# POR QUÊ uma imagem própria (e não reusar a do webapp)?
# Um dos jobs é o backup, que chama `pg_dump` via subprocess. A imagem do webapp
# (python:3.12-slim puro) NÃO traz esse binário. Então esta imagem = a base do
# webapp (todo o código + todas as deps Python do requirements) MAIS o
# postgresql-client e o gzip que o backup precisa. Assim um único container
# consegue rodar TODOS os jobs. Esta imagem substitui a antiga scripts/Dockerfile.backup.

# Base enxuta do Python. O python:3.12-slim (Debian 13) traz o postgresql-client
# na versão 17, compatível com o servidor postgres:15 (cliente >= servidor — ok).
FROM python:3.12-slim

# Instala o pg_dump (postgresql-client) e o gzip (para comprimir o dump do backup).
# --no-install-recommends deixa a imagem menor; limpamos o cache do apt ao final.
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client gzip \
    && rm -rf /var/lib/apt/lists/*

# Diretório de trabalho dentro do container.
WORKDIR /app

# Instala TODAS as dependências Python do projeto (apscheduler, psycopg2,
# vertexai, google-cloud-storage, requests, etc.) — os jobs precisam delas.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Assa todo o código na imagem (agents/, scripts/, scheduler/). As credenciais
# NÃO entram na imagem — vêm por variável de ambiente em runtime.
COPY . .

# Comando padrão: sobe o agendador em modo normal (fica ligado agendando os jobs).
# Para rodar um job à mão: docker exec makima-scheduler python -m scheduler.main --run <job>.
CMD ["python", "-m", "scheduler.main"]
