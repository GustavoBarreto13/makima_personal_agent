"""Script de correção de fuso horário — bullets salvos no dia errado (UTC vs UTC-3).

Problema:
    O frontend calculava "hoje" com `new Date().toISOString().slice(0,10)`, que retorna
    a data em UTC. Para usuários em UTC-3 (America/Sao_Paulo), qualquer escrita após
    as 21h local era registrada no dia seguinte (UTC). Isso criava a página do dia
    seguinte e salvava os bullets lá.

O que este script faz:
    Detecta bullets que foram vítimas do bug usando a seguinte "impressão digital":
        1. O instante real de criação (created_at AT TIME ZONE 'America/Sao_Paulo')
           corresponde a um dia ANTERIOR à página onde o bullet foi salvo.
        2. O bullet foi escrito no fim da noite local (hora >= 21h), que é quando o
           rollover UTC acontece.
    Move esses bullets para a página do dia correto (criando-a se necessário).

Uso:
    # Modo DRY-RUN (padrão) — apenas exibe o que seria movido, sem alterar o banco
    python -m scripts.fix_journal_bullet_timezone

    # Modo APPLY — aplica as mudanças de fato
    python -m scripts.fix_journal_bullet_timezone --apply

Atenção:
    - Rodar de dentro do container makima-web (único lugar onde o hostname do
      PostgreSQL é resolvível):
        docker exec makima-web sh -c "cd /app && python -m scripts.fix_journal_bullet_timezone"
        docker exec makima-web sh -c "cd /app && python -m scripts.fix_journal_bullet_timezone --apply"
    - Bullet de 'dream' e journal_emotion_logs NÃO são migrados por este script —
      ficam fora do escopo do pedido.
"""

import sys
import textwrap

# Importa o módulo de conexão ao banco — já lida com DATABASE_URL e psycopg2
# Importamos diretamente a função de conexão do módulo de tools do journal
from agents.journal.tools import _get_conn  # noqa: F401  (reutiliza a conexão configurada)

# Flag que controla se vamos realmente commitar ou só simular
DRY_RUN = '--apply' not in sys.argv


def main() -> None:
    """Ponto de entrada principal do script de correção de fuso."""

    # Informa o modo de operação no início para o usuário não ter surpresa
    if DRY_RUN:
        print("╔══════════════════════════════════════════════════════════╗")
        print("║  MODO DRY-RUN — nenhuma alteração será feita no banco   ║")
        print("║  Use --apply para aplicar as correções de fato           ║")
        print("╚══════════════════════════════════════════════════════════╝")
    else:
        print("╔══════════════════════════════════════════════════════════╗")
        print("║  MODO APPLY — as mudanças SERÃO gravadas no banco        ║")
        print("╚══════════════════════════════════════════════════════════╝")
    print()

    # Abre conexão com o PostgreSQL usando a mesma factory das tools do journal
    conn = _get_conn()

    try:
        with conn.cursor() as cur:

            # ── Consulta 1: Detectar bullets candidatos à migração ──────────────────
            #
            # Critérios para identificar o bug:
            #   (a) A data local real (created_at convertido para 'America/Sao_Paulo')
            #       é ANTERIOR à data da página onde o bullet foi salvo.
            #   (b) A diferença é exatamente 1 dia — o rollover UTC nunca pula mais.
            #   (c) O bullet foi escrito às 21h ou depois (horário local Sao_Paulo) —
            #       janela exata onde o UTC já virou o dia seguinte para UTC-3.
            #
            # A coluna `local_date` é a data "verdadeira" do bullet.
            # A coluna `page_date` é onde ele foi erroneamente salvo.
            #
            # Nota sobre falsos positivos: se o usuário abriu manualmente a página de
            # amanhã via date-picker e escreveu após as 21h, o bullet também casaria o
            # padrão e seria movido. Não há como distinguir intenção do bug — esse
            # risco foi aceito explicitamente pelo usuário.

            cur.execute("""
                SELECT
                    b.id                                                           AS bullet_id,
                    b.content,
                    b.kind,
                    b.position                                                     AS original_position,
                    b.created_at AT TIME ZONE 'America/Sao_Paulo'                 AS created_at_local,
                    (b.created_at AT TIME ZONE 'America/Sao_Paulo')::date         AS local_date,
                    p.id                                                           AS src_page_id,
                    p.date                                                         AS page_date,
                    p.type_id
                FROM journal_bullets b
                JOIN journal_pages p ON p.id = b.page_id
                WHERE
                    -- Condição (a)+(b): a data local é exatamente 1 dia antes da página
                    (b.created_at AT TIME ZONE 'America/Sao_Paulo')::date
                        = p.date - INTERVAL '1 day'
                    -- Condição (c): escrito no horário de rollover (21h–23h59 locais)
                    AND EXTRACT(HOUR FROM b.created_at AT TIME ZONE 'America/Sao_Paulo') >= 21
                ORDER BY local_date, b.position
            """)

            # Carrega todos os candidatos em memória (normalmente poucos registros)
            candidates = cur.fetchall()

            # Nomeia as colunas da query para facilitar o acesso por nome
            cols = [d[0] for d in cur.description]

            def row(r):
                """Transforma uma linha da query em dicionário pelo nome da coluna."""
                return dict(zip(cols, r))

            if not candidates:
                print("✓ Nenhum bullet fora do lugar encontrado. Tudo certo!")
                return

            print(f"Encontrados {len(candidates)} bullet(s) candidato(s) à migração:\n")

            # ── Para cada bullet: calcular o destino e (se --apply) mover ─────────
            #
            # Mantemos um dicionário {(type_id, local_date): novo_page_id} como cache
            # para não fazer múltiplos INSERTs desnecessários para a mesma página destino.
            # Também rastreamos a posição máxima já usada em cada página destino para
            # não colidir com a UNIQUE (page_id, position) existente.

            # Cache: (type_id, local_date) → page_id de destino
            dest_page_cache: dict[tuple, int] = {}

            # Rastreador de posição: dest_page_id → próxima posição disponível
            # Começa em None para indicar que ainda não consultamos o banco
            next_position: dict[int, int] = {}

            moved = 0
            for r_raw in candidates:
                r = row(r_raw)

                # Extrai os campos relevantes
                bullet_id = r['bullet_id']
                content_preview = textwrap.shorten(r['content'], width=60, placeholder='…')
                local_date = r['local_date']             # date Python
                created_at_local = r['created_at_local'] # datetime Python
                src_page_id = r['src_page_id']
                page_date = r['page_date']               # date Python
                type_id = r['type_id']

                # ── Exibição do candidato ──────────────────────────────────────────
                print(f"  Bullet #{bullet_id}")
                print(f"    Conteúdo : {content_preview!r}")
                print(f"    Escrito  : {created_at_local.strftime('%Y-%m-%d %H:%M')} (horário Sao_Paulo)")
                print(f"    Página   : {page_date} (errada) → {local_date} (correta)")

                if DRY_RUN:
                    # Em dry-run, apenas exibimos; não alteramos o banco
                    print(f"    [DRY-RUN] Seria movido.")
                    print()
                    moved += 1
                    continue

                # ── Obter (ou criar) a página de destino ───────────────────────────
                cache_key = (type_id, local_date)

                if cache_key not in dest_page_cache:
                    # Tenta inserir a página de destino; ignora se já existir (UNIQUE)
                    cur.execute("""
                        INSERT INTO journal_pages (type_id, date)
                        VALUES (%s, %s)
                        ON CONFLICT (type_id, date) DO NOTHING
                    """, (type_id, local_date))

                    # Busca o id real da página (independente de ser nova ou existente)
                    cur.execute("""
                        SELECT id FROM journal_pages
                        WHERE type_id = %s AND date = %s
                    """, (type_id, local_date))
                    dest_page_id = cur.fetchone()[0]
                    dest_page_cache[cache_key] = dest_page_id
                else:
                    # Já temos o id em cache — sem nova query
                    dest_page_id = dest_page_cache[cache_key]

                # ── Calcular a próxima posição disponível na página destino ────────
                #
                # Bullets existentes na página destino ficam onde estão. Os bullets
                # migrados entram DEPOIS (MAX + 1000, com incremento ×1000 a cada
                # bullet migrado para a mesma página). Isso preserva a ordem relativa
                # dos bullets vindos da mesma página de origem.

                if dest_page_id not in next_position:
                    # Primeira vez que tocamos essa página destino: busca o MAX atual
                    cur.execute("""
                        SELECT COALESCE(MAX(position), 0) FROM journal_bullets
                        WHERE page_id = %s
                    """, (dest_page_id,))
                    max_pos = cur.fetchone()[0]
                    # Próxima posição = MAX + 1000 (passo padrão do frontend)
                    next_position[dest_page_id] = max_pos + 1000
                else:
                    # Já calculamos antes: apenas incrementa ×1000 para o próximo bullet
                    next_position[dest_page_id] += 1000

                new_position = next_position[dest_page_id]

                # ── Mover o bullet para a página correta ───────────────────────────
                #
                # Atualiza page_id e position. O campo search_vec é GENERATED pelo banco
                # a partir de content — não precisa ser tocado. As journal_mentions
                # referenciam bullet_id (não page_id), então não quebram ao mover.
                cur.execute("""
                    UPDATE journal_bullets
                    SET page_id = %s, position = %s
                    WHERE id = %s
                """, (dest_page_id, new_position, bullet_id))

                print(f"    ✓ Movido para página {dest_page_id} (date={local_date}), posição {new_position}")
                print()
                moved += 1

            # ── Resultado final ────────────────────────────────────────────────────
            print("─" * 60)
            if DRY_RUN:
                print(f"DRY-RUN concluído. {moved} bullet(s) seriam movidos.")
                print("Rode com --apply para aplicar as mudanças.")
            else:
                # Commita tudo de uma vez — se algo falhou acima, o rollback é automático
                conn.commit()
                print(f"✓ Migração concluída. {moved} bullet(s) movidos.")
                print()
                print("Notas:")
                print("  • journal_emotion_logs e o campo dream NÃO foram migrados.")
                print("  • Páginas de origem que ficaram vazias NÃO foram removidas")
                print("    (são inofensivas — basta ignorar no arquivo).")

    except Exception as exc:
        # Em caso de erro, garante rollback e re-lança para exibir o traceback completo
        conn.rollback()
        print(f"\n✗ Erro durante a migração. Rollback aplicado.\nDetalhe: {exc}")
        raise
    finally:
        # Sempre fecha a conexão, mesmo em caso de exceção
        conn.close()


if __name__ == '__main__':
    main()
