"""Render de documentos de memória + metadados (spec 028).

Define a estrutura `MemoryDoc` — a unidade que o sync indexa no corpus operacional — com
o hash de conteúdo (para detectar edição) e o caminho no GCS.

A convenção de path no GCS é **casada** com `_extrair_meta_operacional` em
`agents/kurisu/tools.py`: os documentos ficam sob `kurisu-memoria/{domain}/{doc_date}__{source_ref}.md`,
e a busca extrai `domain` e `doc_date` desse path para citar a origem (FR-011) e aplicar
recência (FR-005). Se mudar a convenção aqui, mude lá também.
"""

import hashlib
import re
from dataclasses import dataclass
from datetime import date

# Prefixo lógico no GCS onde os documentos operacionais são espelhados.
# DEVE ser igual ao _PREFIXO_OPERACIONAL de agents/kurisu/tools.py.
PREFIXO_OPERACIONAL = "kurisu-memoria"


@dataclass
class MemoryDoc:
    """Um documento de memória pronto para indexar no corpus operacional.

    Attributes:
        texto: Conteúdo em português que será embeddado e recuperado.
        domain: Domínio de origem (ex.: "diario", "tarefas", "filmes").
        doc_date: Data local (UTC-3) do conteúdo — base da recência e da citação.
        source_ref: Identidade da linha de origem (ex.: "bullet:123") — base do prune.
        source_type: "resumo" (datado) ou "individual".
    """

    texto: str
    domain: str
    doc_date: date
    source_ref: str
    source_type: str

    @property
    def content_hash(self) -> str:
        """Hash curto e estável do texto — detecta alterações entre syncs.

        Example:
            >>> d = MemoryDoc("oi", "diario", date(2026, 5, 4), "bullet:1", "individual")
            >>> len(d.content_hash)
            16
        """
        return hashlib.sha256(self.texto.encode("utf-8")).hexdigest()[:16]

    def gcs_relpath(self) -> str:
        """Caminho relativo no GCS: `{domain}/{doc_date}__{source_ref}.md`.

        O `source_ref` é sanitizado (só `[A-Za-z0-9._-]`) para virar um nome de arquivo
        válido — o ":" de "bullet:123" vira "-". A busca reconstrói `domain` (1º segmento)
        e `doc_date` (antes do "__") desse path.

        Example:
            >>> MemoryDoc("x", "diario", date(2026, 5, 4), "bullet:123", "individual").gcs_relpath()
            'diario/2026-05-04__bullet-123.md'
        """
        ref = re.sub(r"[^A-Za-z0-9._-]", "-", self.source_ref)
        return f"{self.domain}/{self.doc_date.isoformat()}__{ref}.md"

    def gcs_uri(self, bucket_name: str) -> str:
        """URI gs:// completa do documento no bucket (com o prefixo operacional).

        Example:
            >>> d = MemoryDoc("x", "diario", date(2026, 5, 4), "bullet:1", "individual")
            >>> d.gcs_uri("meu-bucket")
            'gs://meu-bucket/kurisu-memoria/diario/2026-05-04__bullet-1.md'
        """
        return f"gs://{bucket_name}/{PREFIXO_OPERACIONAL}/{self.gcs_relpath()}"
