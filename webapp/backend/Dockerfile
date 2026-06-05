# Dockerfile multi-stage para a webapp da Makima.
# "Multi-stage" significa que usamos dois ambientes de build separados:
# um para compilar o React (Node.js) e outro para rodar a API (Python).
# O resultado final é uma imagem só com o Python — sem Node.js — o que a torna menor e mais segura.

# ─── Estágio 1: Build do React ───────────────────────────────────────────────
# Usamos a imagem Node.js Alpine (versão leve do Linux) para compilar o frontend.
FROM node:20-alpine AS frontend-builder

# Define o diretório de trabalho dentro do container para este estágio
WORKDIR /app/frontend

# Copia apenas o package.json (e o lock file, se existir) primeiro.
# Isso permite que o Docker use o cache desta camada: se as dependências não mudaram,
# o npm ci não precisa baixar tudo de novo a cada build.
COPY webapp/frontend/package.json webapp/frontend/package-lock.json* ./

# Instala as dependências do Node.js de forma limpa e reproduzível (npm ci respeita o lock file)
RUN npm ci

# Copia o restante dos arquivos do frontend (src/, index.html, vite.config.ts, etc.)
COPY webapp/frontend/ .

# Compila o React para arquivos estáticos otimizados (HTML, CSS, JS minificados)
# O resultado fica em /app/frontend/dist/
RUN npm run build


# ─── Estágio 2: Imagem Python para rodar a API ───────────────────────────────
# Usamos python:3.12-slim — imagem oficial mínima do Python, sem pacotes desnecessários.
FROM python:3.12-slim

# Define o diretório de trabalho para o código Python
WORKDIR /app

# Copia e instala as dependências Python primeiro (aproveita o cache do Docker).
# --no-cache-dir evita guardar o cache do pip dentro da imagem, reduzindo o tamanho.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia todo o código do projeto para dentro do container
COPY . .

# Copia o build do React do Estágio 1 para o lugar onde o FastAPI espera encontrá-lo.
# O caminho webapp/frontend/dist/ é o que main.py usa para servir os arquivos estáticos.
COPY --from=frontend-builder /app/frontend/dist webapp/frontend/dist

# Informa ao Docker que o container vai escutar na porta 8080.
# Isso é apenas documentação — a porta real é mapeada no docker-compose.
EXPOSE 8080

# Comando que inicia o servidor quando o container sobe.
# uvicorn = servidor ASGI (o tipo de servidor que o FastAPI usa)
# webapp.backend.main:app = caminho para o objeto `app` em webapp/backend/main.py
# --host 0.0.0.0 = aceita conexões de qualquer endereço (necessário em container)
# --port 8080 = porta onde o servidor escuta
CMD ["uvicorn", "webapp.backend.main:app", "--host", "0.0.0.0", "--port", "8080"]
