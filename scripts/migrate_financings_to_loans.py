"""Migra os financiamentos do sistema antigo (tabela `financings`, só webapp) para o
sistema unificado de dívidas (tabela `loans`, PRICE/SAC + simuladores — spec 046).

Idempotente: usa `loans.financing_source_id` como chave de dedupe — cada linha de
`financings` só é migrada uma vez, mesmo que o script rode várias vezes. A tabela
`financings` NUNCA é apagada ou alterada por este script — permanece intacta como
backup até uma decisão posterior de remoção física (fora do escopo da spec 046).

Regras da migração (documentadas em detalhe no plan.md da spec 046):
- `sistema_amortizacao` sempre "PRICE" (financiamentos legados só guardavam parcela fixa
  = total/parcelas, que é o que PRICE assume com taxa 0 — não há dado para inferir SAC).
- `taxa_juros_mensal` é parseada do texto livre `interest_rate` (ex.: "1,2% a.m.") via
  `_parse_interest_rate`; quando não interpretável, grava 0 e anota "[REVISAR TAXA]".
- `conta`/`account_id` ficam vazios — financiamentos legados nunca guardaram essa
  informação; inventar uma conta mascararia dado incorreto. Nota pede revisão do pagador.
- `primeiro_vencimento` é aproximado a partir de `next_due_day` e `paid_installments`
  (não há data exata na origem) — anotado como aproximação.

Usage:
    # Rodar dentro do container makima-web (hostname PostgreSQL só resolve lá):
    docker cp scripts/migrate_financings_to_loans.py makima-web:/app/scripts/migrate_financings_to_loans.py
    docker exec makima-web sh -c "cd /app && python -m scripts.migrate_financings_to_loans"

    # Ou localmente se DATABASE_URL apontar para o servidor correto:
    python -m scripts.migrate_financings_to_loans
"""

import os
import re
import sys
import uuid
from datetime import date

import psycopg2
import psycopg2.extras


def _parse_interest_rate(text: str | None) -> float | None:
    """Extrai uma taxa mensal decimal de um texto livre como "1,2% a.m.".

    Aceita vírgula ou ponto como separador decimal. Retorna None quando o texto
    não contém um número seguido de "%" — o chamador decide o fallback (0 + nota
    de revisão), nunca falha a migração inteira por causa de uma taxa ilegível.

    Args:
        text: Texto livre da coluna `financings.interest_rate` (pode ser None).

    Returns:
        Taxa mensal como fração decimal (ex.: 0.012 para "1,2%"), ou None.

    Example:
        >>> _parse_interest_rate("1,2% a.m.")
        0.012
        >>> _parse_interest_rate("taxa boa")
        None
    """
    if not text:
        return None
    match = re.search(r"(\d+(?:[.,]\d+)?)\s*%", text)
    if not match:
        return None
    try:
        return round(float(match.group(1).replace(",", ".")) / 100, 6)
    except ValueError:
        return None


def _approximate_first_due(next_due_day: int | None, paid_installments: int, created_at: date) -> date:
    """Aproxima a data da 1ª parcela a partir do dia de vencimento e do progresso.

    A tabela `financings` nunca guardou uma data completa da 1ª parcela — só o dia
    do mês. Aproximamos subtraindo `paid_installments` meses da data de criação do
    registro (melhor estimativa disponível; não é exata, e por isso a nota da
    migração avisa "aproximado").

    Args:
        next_due_day: Dia do mês de vencimento (1-28), pode ser None.
        paid_installments: Quantas parcelas já foram pagas até a migração.
        created_at: Data de criação do registro em `financings`.

    Returns:
        Data aproximada da 1ª parcela.
    """
    day = next_due_day or created_at.day
    day = min(day, 28)  # evita estourar meses curtos (fevereiro)

    # Subtrai paid_installments meses de created_at, mantendo o dia aproximado.
    month_index = created_at.month - 1 - paid_installments
    year = created_at.year + month_index // 12
    month = month_index % 12 + 1
    return date(year, month, day)


def run() -> None:
    """Executa a migração idempotente de `financings` para `loans`."""
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("ERRO: variável DATABASE_URL não encontrada no ambiente.", file=sys.stderr)
        sys.exit(1)

    conn = psycopg2.connect(database_url)
    conn.autocommit = False

    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                SELECT id, description, lender, total_amount, installments,
                       paid_installments, next_due_day, interest_rate, note,
                       created_at::date AS created_at
                  FROM financings
                 WHERE deleted = FALSE
            """)
            financings = cur.fetchall()

            # Financiamentos já migrados anteriormente — evita duplicar em reexecuções.
            cur.execute("SELECT financing_source_id FROM loans WHERE financing_source_id IS NOT NULL")
            already_migrated = {r["financing_source_id"] for r in cur.fetchall()}

            migrated = 0
            skipped = 0
            flagged_for_review = 0

            for fin in financings:
                if fin["id"] in already_migrated:
                    skipped += 1
                    continue

                taxa = _parse_interest_rate(fin["interest_rate"])
                needs_review = taxa is None
                taxa = taxa or 0.0

                installments = fin["installments"] or 1
                total_amount = float(fin["total_amount"] or 0)
                valor_parcela = total_amount / installments if installments else total_amount

                name = fin["description"] or "Financiamento migrado"
                if fin["lender"]:
                    name = f"{name} ({fin['lender']})"

                notes_parts = []
                if fin["note"]:
                    notes_parts.append(fin["note"])
                notes_parts.append("[Migrado de financings — sem conta vinculada, defina o pagador]")
                notes_parts.append("[1ª parcela aproximada]")
                if needs_review:
                    notes_parts.append(f"[REVISAR TAXA — original: '{fin['interest_rate'] or ''}']")
                notes = " ".join(notes_parts)

                first_due = _approximate_first_due(
                    fin["next_due_day"], fin["paid_installments"] or 0, fin["created_at"],
                )

                status = "quitado" if (fin["paid_installments"] or 0) >= installments else "ativo"

                cur.execute("""
                    INSERT INTO loans
                      (id, name, tipo, sistema_amortizacao, valor_original, taxa_juros_mensal,
                       num_parcelas_total, parcelas_pagas, valor_parcela, primeiro_vencimento,
                       conta, account_id, desconto_folha, status, notes, financing_source_id,
                       created_at, deleted)
                    VALUES
                      (%(id)s, %(name)s, 'outro', 'PRICE', %(valor_original)s, %(taxa)s,
                       %(num_parcelas)s, %(parcelas_pagas)s, %(valor_parcela)s, %(first_due)s,
                       NULL, NULL, FALSE, %(status)s, %(notes)s, %(financing_source_id)s,
                       NOW(), FALSE)
                """, {
                    "id": str(uuid.uuid4()),
                    "name": name,
                    "valor_original": total_amount,
                    "taxa": taxa,
                    "num_parcelas": installments,
                    "parcelas_pagas": fin["paid_installments"] or 0,
                    "valor_parcela": valor_parcela,
                    "first_due": first_due.isoformat(),
                    "status": status,
                    "notes": notes,
                    "financing_source_id": fin["id"],
                })
                migrated += 1
                if needs_review:
                    flagged_for_review += 1

        conn.commit()
        print(
            f"Migração concluída: {migrated} financiamento(s) migrado(s), "
            f"{skipped} já migrado(s) anteriormente (pulados), "
            f"{flagged_for_review} sinalizado(s) para revisão de taxa."
        )

    except Exception as exc:
        conn.rollback()
        print(f"\nERRO durante a migração: {exc}", file=sys.stderr)
        print("Rollback realizado — nenhuma alteração foi persistida.", file=sys.stderr)
        sys.exit(1)

    finally:
        conn.close()


if __name__ == "__main__":
    run()
