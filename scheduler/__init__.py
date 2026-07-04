"""Pacote do agendador de jobs recorrentes da Makima.

Este pacote define UM padrão único para rodar scripts que precisam executar de
tempos em tempos — todo dia num horário fixo (ex.: 03:00) ou de X em X tempo
(ex.: a cada 6 horas). Ele substitui os antigos containers de loop
(`while true; sleep 86400`) que rodavam o backup e o sync da Kurisu.

Como funciona, em resumo:
    - `registry.py`  → a LISTA declarativa de jobs (nome + função + quando rodar).
    - `jobs.py`      → as funções que embrulham cada script existente.
    - `runner.py`    → executa um job, cronometra, grava o resultado no banco e
                       avisa no Telegram se falhar.
    - `notify.py`    → manda o alerta de falha no Telegram.
    - `main.py`      → o processo que fica ligado (container `makima-scheduler`),
                       lê a lista de jobs e agenda cada um no horário certo.

Para adicionar um job novo, ver o passo a passo em `scheduler/CLAUDE.md`.
"""
