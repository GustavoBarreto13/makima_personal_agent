"""Migra as transferências e os pagamentos de fatura antigos da Nami para o modelo com sinal (spec 071).

O que mudou no código:
- Transferência passa a guardar `valor` COM SINAL: negativo na origem, positivo no destino.
  Antes os dois lados eram positivos e o saldo das contas ignorava a transferência.
- Pagar fatura passa a ser uma transferência conta → cartão. Antes virava uma `Receita` no
  cartão: inflava a renda do mês e nunca debitava a conta bancária.

O que este script faz com os dados antigos:
  A) Transferências: o lado de origem (nome "Transferência para X") com valor positivo
     passa a negativo. Só mexe em pares íntegros (2 linhas, mesmo valor); o resto vira aviso.
  B) Pagamentos de fatura (Receita no cartão, nome "Pagamento fatura — X"): a linha vira o
     lado destino de uma transferência e ganha o lado origem na conta que paga o cartão.
     Pagamentos anteriores à `data_inicio` da conta ficam só com o lado do cartão (a conta
     não rastreava aquele período, então debitar de lá criaria dinheiro sumido).

SEGURANÇA
- Por padrão é DRY-RUN: faz tudo numa transação, mostra o relatório e dá ROLLBACK.
  Só grava com `--apply`.
- Idempotente: depois de aplicado, nenhuma linha casa mais com os filtros (A exige
  valor > 0 na origem; B exige tipo = 'Receita').
- ATENÇÃO ao relatório B: se você já lançava "pagamento do cartão" à mão como Despesa na
  conta bancária, o novo débito automático duplicaria. Confira a lista antes de aplicar.
- ATENÇÃO ao relatório de cartões: a dívida agora é ACUMULADA (antes só o ciclo corrente).
  Fatura antiga que nunca foi registrada como paga passa a aparecer como dívida.

Usage:
    # Rodar dentro do container makima-web (hostname PostgreSQL só resolve lá):
    docker cp scripts/migrate_nami_signed_transfers.py makima-web:/app/scripts/
    docker exec makima-web sh -c "cd /app && python -m scripts.migrate_nami_signed_transfers"          # dry-run
    docker exec makima-web sh -c "cd /app && python -m scripts.migrate_nami_signed_transfers --apply"  # grava
"""

import os
import sys
import uuid
from collections import defaultdict
from datetime import date, datetime
from zoneinfo import ZoneInfo

import psycopg2
import psycopg2.extras

ORIGIN_PREFIX = "Transferência para "
PAYMENT_PREFIX = "Pagamento fatura — "


# ─── Planejamento (funções puras, testadas sem banco) ─────────────────────────

def plan_transfer_fixes(rows: list[dict]) -> tuple[list[str], list[str]]:
    """Decide quais linhas de origem de transferência precisam virar negativas.

    Args:
        rows: linhas `tipo='Transferencia'` com `transfer_id` — campos id, transfer_id,
            name, valor.

    Returns:
        (ids_para_negativar, avisos). Só entram pares com exatamente 2 linhas, mesmo valor
        positivo e uma delas com nome de origem; o resto vira aviso e NÃO é tocado.
    """
    groups: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        groups[r["transfer_id"]].append(r)

    fix_ids: list[str] = []
    warnings: list[str] = []
    for tid, grp in groups.items():
        origins = [r for r in grp if (r["name"] or "").startswith(ORIGIN_PREFIX)]
        if len(grp) != 2 or len(origins) != 1:
            warnings.append(f"transferência {tid}: {len(grp)} linha(s), {len(origins)} de origem — ignorada")
            continue
        origin = origins[0]
        other = next(r for r in grp if r is not origin)
        if float(origin["valor"]) <= 0:
            continue  # já migrada (idempotência)
        if abs(float(origin["valor"]) - float(other["valor"])) > 0.005:
            warnings.append(f"transferência {tid}: valores diferentes ({origin['valor']} x {other['valor']}) — ignorada")
            continue
        fix_ids.append(origin["id"])
    return fix_ids, warnings


def plan_payment_conversions(payments: list[dict]) -> list[dict]:
    """Para cada pagamento de fatura legado, decide se cria o lado origem na conta.

    Args:
        payments: linhas Receita de cartão — id, name, valor, data (date), card_name,
            account_id, account_name, data_inicio (date | None).

    Returns:
        Uma entrada por pagamento com `create_origin` (bool) e `reason` quando não cria.
    """
    plan = []
    for p in payments:
        inicio = p.get("data_inicio")
        if not p.get("account_id"):
            create, reason = False, "cartão sem conta vinculada"
        elif inicio and p["data"] < inicio:
            create, reason = False, f"anterior à data_inicio da conta ({inicio.isoformat()})"
        else:
            create, reason = True, ""
        plan.append({**p, "create_origin": create, "reason": reason})
    return plan


# ─── Banco ────────────────────────────────────────────────────────────────────

def _today_sp() -> date:
    return datetime.now(ZoneInfo("America/Sao_Paulo")).date()


def _fetch_account_balances(cur, today: date) -> dict[str, dict]:
    """Saldo por conta nas duas fórmulas: `antes` (sem transferências) e `depois` (com sinal)."""
    cur.execute(
        """
        SELECT a.id, a.name, a.balance_inicial,
               COALESCE(SUM(CASE WHEN t.tipo = 'Receita' THEN t.valor
                                 WHEN t.tipo = 'Despesa' THEN -t.valor ELSE 0 END), 0) AS sem_transf,
               COALESCE(SUM(CASE WHEN t.tipo = 'Transferencia' THEN t.valor ELSE 0 END), 0) AS transf
          FROM accounts a
          LEFT JOIN transactions t
                 ON t.account_id = a.id AND t.deleted = FALSE AND t.data <= %(today)s
         WHERE a.status = 'ativo'
         GROUP BY a.id, a.name, a.balance_inicial
         ORDER BY a.name
        """,
        {"today": today},
    )
    out = {}
    for r in cur.fetchall():
        base = float(r["balance_inicial"] or 0) + float(r["sem_transf"])
        out[r["id"]] = {"name": r["name"], "antes": base, "depois": base + float(r["transf"])}
    return out


def _card_debts(cur, today: date) -> dict[str, dict]:
    """Dívida por cartão: `ciclo` (fórmula antiga, só ciclo corrente) e `acumulada` (nova)."""
    from agents.nami.tools_credit_cards import _billing_cycle  # lazy: só o cálculo do ciclo

    cur.execute("SELECT id, name, closing_day FROM credit_cards WHERE status = 'ativo' ORDER BY name")
    cards = cur.fetchall()
    out = {}
    for c in cards:
        start, end = _billing_cycle(c["closing_day"])
        cur.execute(
            """
            SELECT
              COALESCE(SUM(CASE WHEN tipo = 'Despesa' THEN valor WHEN tipo = 'Receita' THEN -valor ELSE 0 END)
                       FILTER (WHERE data BETWEEN %(start)s AND %(end)s), 0) AS ciclo,
              COALESCE(SUM(CASE WHEN tipo = 'Despesa' THEN valor
                                WHEN tipo IN ('Receita', 'Transferencia') THEN -valor ELSE 0 END), 0) AS acumulada
              FROM transactions
             WHERE card_id = %(id)s AND deleted = FALSE AND data <= %(today)s
            """,
            {"id": c["id"], "start": start, "end": end, "today": today},
        )
        r = cur.fetchone()
        out[c["id"]] = {
            "name": c["name"],
            "ciclo": max(0.0, float(r["ciclo"])),
            "acumulada": max(0.0, float(r["acumulada"])),
        }
    return out


def _brl(v: float) -> str:
    return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def run(apply: bool) -> None:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("ERRO: variável DATABASE_URL não encontrada no ambiente.", file=sys.stderr)
        sys.exit(1)
    for variant in ("+asyncpg", "+pg8000", "+aiopg"):
        database_url = database_url.replace(variant, "")

    today = _today_sp()
    conn = psycopg2.connect(database_url)
    conn.autocommit = False
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            balances_before = _fetch_account_balances(cur, today)
            debts_before = _card_debts(cur, today)  # antes de mexer: "ciclo" usa os pagamentos como Receita

            # ── A) transferências ─────────────────────────────────────────────
            cur.execute(
                """
                SELECT id, transfer_id, name, valor FROM transactions
                 WHERE tipo = 'Transferencia' AND transfer_id IS NOT NULL AND deleted = FALSE
                """
            )
            fix_ids, warnings = plan_transfer_fixes([dict(r) for r in cur.fetchall()])
            if fix_ids:
                cur.execute("UPDATE transactions SET valor = -ABS(valor) WHERE id = ANY(%(ids)s)", {"ids": fix_ids})

            # ── B) pagamentos de fatura ───────────────────────────────────────
            cur.execute(
                """
                SELECT t.id, t.name, t.valor, t.data, c.name AS card_name,
                       a.id AS account_id, a.name AS account_name, a.data_inicio
                  FROM transactions t
                  JOIN credit_cards c ON c.id = t.card_id
                  LEFT JOIN accounts a ON a.id = c.account_id
                 WHERE t.tipo = 'Receita' AND t.deleted = FALSE AND t.name LIKE %(prefix)s
                 ORDER BY t.data
                """,
                {"prefix": PAYMENT_PREFIX + "%"},
            )
            payments = plan_payment_conversions([dict(r) for r in cur.fetchall()])
            for p in payments:
                tid = str(uuid.uuid4())
                cur.execute(
                    """
                    UPDATE transactions
                       SET tipo = 'Transferencia', categoria = 'Transferencia',
                           name = %(name)s, transfer_id = %(tid)s
                     WHERE id = %(id)s
                    """,
                    {"name": f"Pagamento recebido — {p['card_name']}", "tid": tid, "id": p["id"]},
                )
                if p["create_origin"]:
                    cur.execute(
                        """
                        INSERT INTO transactions
                          (id, name, valor, tipo, categoria, conta, account_id, card_id,
                           data, source, notes, transfer_id, created_at, deleted)
                        VALUES
                          (%(id)s, %(name)s, %(valor)s, 'Transferencia', 'Transferencia',
                           %(conta)s, %(account_id)s, NULL, %(data)s, 'migration',
                           'Gerado pela migração spec 071', %(tid)s, NOW(), FALSE)
                        """,
                        {
                            "id": str(uuid.uuid4()), "name": p["name"], "valor": -abs(float(p["valor"])),
                            "conta": p["account_name"], "account_id": p["account_id"],
                            "data": p["data"], "tid": tid,
                        },
                    )

            balances_after = _fetch_account_balances(cur, today)
            debts_after = _card_debts(cur, today)

            # Trava de segurança: converter pagamento (Receita → Transferencia positiva) não pode
            # mudar a dívida acumulada de nenhum cartão — os dois abatem a dívida do mesmo jeito.
            for card_id, d in debts_after.items():
                if abs(d["acumulada"] - debts_before[card_id]["acumulada"]) > 0.005:
                    raise RuntimeError(
                        f"Dívida acumulada do cartão {d['name']} mudou na conversão "
                        f"({debts_before[card_id]['acumulada']} → {d['acumulada']}) — abortado."
                    )

        # ── Relatório ─────────────────────────────────────────────────────────
        modo = "APLICANDO" if apply else "DRY-RUN (nada será gravado)"
        print(f"=== Migração spec 071 — {modo} — hoje {today.isoformat()} ===\n")
        print(f"A) Transferências a negativar na origem: {len(fix_ids)}")
        for w in warnings:
            print(f"   AVISO: {w}")

        print(f"\nB) Pagamentos de fatura a converter: {len(payments)}")
        for p in payments:
            destino = f"debita {p['account_name']}" if p["create_origin"] else f"só o cartão ({p['reason']})"
            print(f"   {p['data']}  {_brl(float(p['valor'])):>14}  {p['card_name']:<18} → {destino}")
        if payments:
            print("   >> Se algum desses pagamentos você JÁ lançou como Despesa na conta, aborte e ajuste antes.")

        print("\nSaldo das contas (antes = fórmula antiga; depois = com transferências):")
        for acc_id, b in balances_after.items():
            antes = balances_before[acc_id]["antes"]
            print(f"   {b['name']:<22} {_brl(antes):>16}  →  {_brl(b['depois']):>16}")

        print("\nDívida dos cartões (ciclo = fórmula antiga; acumulada = nova):")
        for card_id, d in debts_after.items():
            ciclo = debts_before[card_id]["ciclo"]
            flag = "   <-- revisar (há fatura antiga em aberto?)" if d["acumulada"] - ciclo > 0.005 else ""
            print(f"   {d['name']:<22} {_brl(ciclo):>16}  →  {_brl(d['acumulada']):>16}{flag}")

        if apply:
            conn.commit()
            print("\nOK: alterações gravadas.")
        else:
            conn.rollback()
            print("\nDry-run: nada foi gravado. Rode com --apply para aplicar.")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    run(apply="--apply" in sys.argv[1:])
