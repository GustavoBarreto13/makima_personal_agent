"""Limpa as páginas vazias do diário (Violet) — spec 076.

Antes da spec 076, só abrir uma data no Escrever criava a página (``get_or_create_page``), e o
Arquivo listava todas — por isso "a maioria aparecia vazia". O código novo não cria mais
página ao ler; este script remove as que já existem sem conteúdo nenhum:

    - nenhum bullet com texto (bullets vazios também são apagados);
    - sonho vazio;
    - nenhum registro emocional, carta, conselho do dia ou análise do Tutor.

Dry-run por padrão (só mostra o que faria). Rodar dentro do container ``makima-web``:

    docker exec makima-web sh -c "cd /app && python -m scripts.cleanup_violet_empty_pages"
    docker exec makima-web sh -c "cd /app && python -m scripts.cleanup_violet_empty_pages --apply"
"""

import argparse
import sys

from agents.db import get_conn


def _exists(cur, table: str) -> bool:
    cur.execute("SELECT to_regclass(%s) IS NOT NULL", (table,))
    return bool(cur.fetchone()[0])


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Remove páginas vazias do diário (spec 076).")
    parser.add_argument("--apply", action="store_true", help="Aplica (sem isto, só mostra)")
    args = parser.parse_args(argv)

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Bullets vazios — o diário não guarda mais bullet sem texto. Os vínculos da Komi
            # desses bullets saem junto (person_links não tem FK).
            cur.execute("SELECT id FROM journal_bullets WHERE btrim(content) = ''")
            empty_bullets = [r[0] for r in cur.fetchall()]

            extra = []
            if _exists(cur, "journal_counsel"):
                extra.append("EXISTS (SELECT 1 FROM journal_counsel c WHERE c.page_id = p.id)")
            cur.execute(f"""
                SELECT p.id, p.date::text FROM journal_pages p
                WHERE NULLIF(btrim(p.dream), '') IS NULL
                  AND NOT EXISTS (SELECT 1 FROM journal_bullets b WHERE b.page_id = p.id AND btrim(b.content) <> '')
                  AND NOT EXISTS (SELECT 1 FROM journal_emotion_logs e WHERE e.page_id = p.id)
                  AND NOT EXISTS (SELECT 1 FROM journal_letters l WHERE l.page_id = p.id)
                  {''.join(' AND NOT ' + x for x in extra)}
                ORDER BY p.date
            """)
            empty_pages = cur.fetchall()

            print(f"Bullets vazios: {len(empty_bullets)}")
            print(f"Páginas sem conteúdo: {len(empty_pages)}")
            for pid, d in empty_pages[:20]:
                print(f"  - {d} (page {pid})")
            if len(empty_pages) > 20:
                print(f"  … e mais {len(empty_pages) - 20}")

            if not args.apply:
                print("\nDry-run: nada foi alterado. Rode com --apply para aplicar.")
                conn.rollback()
                return 0

            if empty_bullets:
                if _exists(cur, "person_links"):
                    cur.execute(
                        "DELETE FROM person_links WHERE entity_type = 'journal_bullet' AND entity_id = ANY(%s)",
                        ([str(i) for i in empty_bullets],),
                    )
                cur.execute("DELETE FROM journal_bullets WHERE id = ANY(%s)", (empty_bullets,))
            if empty_pages:
                # Bullets vazios restantes e análises do tutor caem pelo CASCADE.
                cur.execute("DELETE FROM journal_pages WHERE id = ANY(%s)", ([p for p, _ in empty_pages],))
        conn.commit()
    print(f"\nAplicado: {len(empty_bullets)} bullets vazios e {len(empty_pages)} páginas removidos.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
