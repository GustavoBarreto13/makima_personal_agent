# scripts/backup_postgres.py
"""Script de backup: pg_dump → Google Cloud Storage.

Gera um dump completo do PostgreSQL e envia para um bucket GCS.
O arquivo fica disponível por 30 dias (configurar lifecycle no GCS).

Pré-requisito: criar o bucket GCS uma vez:
    gcloud storage buckets create gs://makima-backups --project=SEU_PROJECT --location=southamerica-east1

Usage:
    GCS_BACKUP_BUCKET=makima-backups python scripts/backup_postgres.py
"""

import datetime
import json
import os
import subprocess
import sys
import tempfile

from google.cloud import storage
from google.oauth2 import service_account


def _gcs_client() -> storage.Client:
    """Cria cliente Google Cloud Storage com credenciais da env var GCP_CREDENTIALS_JSON.

    Returns:
        Cliente GCS autenticado.
    """
    creds_json = os.environ.get("GCP_CREDENTIALS_JSON", "")
    if creds_json:
        # Converte a string JSON (conteúdo do service account) para dict e cria credenciais
        info = json.loads(creds_json)
        creds = service_account.Credentials.from_service_account_info(
            info,
            # Escopo mínimo necessário para leitura e escrita no GCS
            scopes=["https://www.googleapis.com/auth/devstorage.read_write"],
        )
        return storage.Client(
            project=os.environ["GCP_PROJECT_ID"],
            credentials=creds,
        )
    # Fallback para Application Default Credentials (funciona localmente com gcloud auth)
    return storage.Client()


def _database_url_to_env(url: str) -> dict:
    """Converte DATABASE_URL em variáveis de ambiente para o pg_dump.

    O pg_dump aceita credenciais via variáveis de ambiente (PGHOST, PGUSER, etc.)
    em vez de URL direta, então convertemos aqui.

    Args:
        url: String no formato postgresql://user:pass@host:port/db

    Returns:
        Dicionário com PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE.
    """
    # Remove variantes de driver async que o ADK pode adicionar à URL
    url = url.replace("postgresql+asyncpg://", "postgresql://")
    url = url.replace("postgresql://", "")

    # Separa user:pass@host:port/db em suas partes
    user_pass, rest = url.split("@", 1)
    user, password = user_pass.split(":", 1)
    host_port, dbname = rest.split("/", 1)

    # Extrai host e porta — a porta pode ser omitida (padrão PostgreSQL é 5432)
    if ":" in host_port:
        host, port = host_port.split(":", 1)
    else:
        host, port = host_port, "5432"

    return {
        "PGHOST":     host,
        "PGPORT":     port,
        "PGUSER":     user,
        "PGPASSWORD": password,
        "PGDATABASE": dbname,
    }


def run_backup() -> None:
    """Executa pg_dump e faz upload do resultado comprimido para GCS."""
    # Bucket GCS destino — configurável via env var
    bucket_name = os.environ.get("GCS_BACKUP_BUCKET", "makima-backups")
    database_url = os.environ["DATABASE_URL"]

    # Nome do arquivo inclui data e hora para identificação fácil e não sobrescrever backups anteriores
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"backup_{timestamp}.sql"
    gcs_path = f"backups/{filename}.gz"

    print(f"Iniciando backup: {filename}")

    # Converte a URL em variáveis de ambiente para o pg_dump
    # (pg_dump não aceita URLs no formato postgresql://, mas aceita variáveis PGHOST etc.)
    pg_env = {**os.environ, **_database_url_to_env(database_url)}

    with tempfile.TemporaryDirectory() as tmpdir:
        local_sql = os.path.join(tmpdir, filename)
        local_gz = local_sql + ".gz"

        # pg_dump gera SQL legível e portável (formato plain)
        # --no-owner e --no-privileges permitem restaurar em qualquer banco sem conflitos de permissão
        cmd = [
            "pg_dump",
            "--format=plain",
            "--no-owner",
            "--no-privileges",
            f"--file={local_sql}",
        ]

        result = subprocess.run(cmd, env=pg_env, capture_output=True, text=True)

        if result.returncode != 0:
            print(f"ERRO no pg_dump:\n{result.stderr}", file=sys.stderr)
            sys.exit(1)

        # Comprime com gzip nível 6 — reduz tamanho ~10x sem custo excessivo de CPU
        subprocess.run(["gzip", "-6", local_sql], check=True)

        print(f"Dump gerado: {os.path.getsize(local_gz) / 1024:.1f} KB")

        # Upload para GCS
        gcs = _gcs_client()
        bucket = gcs.bucket(bucket_name)
        blob = bucket.blob(gcs_path)
        blob.upload_from_filename(local_gz)

        print(f"✓ Backup enviado: gs://{bucket_name}/{gcs_path}")

    # Lista os últimos 5 backups para confirmar que estão no GCS
    blobs = sorted(
        gcs.list_blobs(bucket_name, prefix="backups/"),
        key=lambda b: b.time_created,
        reverse=True,
    )
    print("\nÚltimos backups no GCS:")
    for b in blobs[:5]:
        size_kb = b.size / 1024
        print(f"  {b.name} ({size_kb:.1f} KB) — {b.time_created.strftime('%Y-%m-%d %H:%M')}")


if __name__ == "__main__":
    run_backup()
