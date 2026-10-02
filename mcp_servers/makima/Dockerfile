FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8090

# --proxy-headers/--forwarded-allow-ips: o domínio público da Kaguya passa pelo Traefik
# do Dokploy — sem isso, o redirect 307 de /mcp/kaguya -> /mcp/kaguya/ (streamable_http_path)
# saía com Location: http://... em vez de https://..., e alguns clientes MCP recusam o
# downgrade de esquema no redirect.
CMD ["uvicorn", "mcp_servers.makima.app:app", "--host", "0.0.0.0", "--port", "8090", "--proxy-headers", "--forwarded-allow-ips", "*"]
