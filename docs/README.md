# docs/ — mapa da documentação

> **Vai criar ou mover um doc?** O guia de manutenção da estrutura (onde cada coisa vive,
> checklist por fase, ciclo de vida dos docs) está no `CLAUDE.md` da raiz, seção
> **"Como manter a documentação"**.

A pasta é organizada por **tipo de documento**, para que fique claro o que é confiável hoje,
o que é intenção futura e o que é só registro do passado:

| Pasta | O que contém | Confiar? |
|---|---|---|
| [`referencia/`](referencia/) | Documentação **viva** — descreve o sistema como ele é hoje e é mantida junto com o código | ✅ Sim |
| [`planos/`](planos/) | Planos **futuros** aprovados mas ainda não executados | 📋 É intenção, não realidade |
| [`arquivo/`](arquivo/) | Documentos **históricos** — planos já executados, checklists concluídos e docs obsoletas, mantidos só como registro | 🗄️ Não seguir como guia |
| [`claude_design/`](claude_design/) | Design handoffs (HTML/CSS de referência) usados na construção dos shells do webapp | 🎨 Referência visual |

## Referência viva

- [`referencia/POSTGRES.md`](referencia/POSTGRES.md) — o banco inteiro: 8 domínios, 54 tabelas coluna a coluna, padrões e pegadinhas
- [`referencia/BACKUP_POSTGRES.md`](referencia/BACKUP_POSTGRES.md) — como o backup diário funciona, como verificar e restaurar
- [`referencia/KURISU_BASE_CONHECIMENTO.md`](referencia/KURISU_BASE_CONHECIMENTO.md) — explicação **em linguagem leiga** da base de conhecimento (RAG) da Kurisu

## Planos futuros

- [`planos/PLANO_VIOLET_EVERGARDEN.md`](planos/PLANO_VIOLET_EVERGARDEN.md) — personalidade Violet + rename `agents/journal → agents/violet`
- [`planos/PLANO_INTEGRACAO_VIOLET_KOMI.md`](planos/PLANO_INTEGRACAO_VIOLET_KOMI.md) — autocomplete `@menção` no diário usando a Komi
- [`planos/PLANO_KAGUYA_MELHORIAS_2026H2.md`](planos/PLANO_KAGUYA_MELHORIAS_2026H2.md) — roadmap das 6 melhorias da Kaguya (specs 034–039: GTD core, weekly review, vínculos cross-agent, pomodoro, work/pessoal no Meu Dia, QoL)
- [`planos/PLANO_NAMI_REFORMA_2026H2.md`](planos/PLANO_NAMI_REFORMA_2026H2.md) — reforma completa do webapp de finanças (specs 040–048: bugs/timezone, parcelamentos com drill-down, dashboard insights, QoL, contas fixas, lista de compras, unificação de dívidas, cross-agent, jobs do scheduler)

## Arquivo (histórico)

- [`arquivo/PLAN.md`](arquivo/PLAN.md) — design original do projeto (congelado ~jun/2026); o roadmap atual é o [`ROADMAP.md`](../ROADMAP.md) na raiz
- [`arquivo/MIGRACAO_POSTGRES.md`](arquivo/MIGRACAO_POSTGRES.md) — checklist da migração BigQuery → PostgreSQL (concluída em 2026-06-28)
- [`arquivo/persistencia-sessao-postgres.md`](arquivo/persistencia-sessao-postgres.md) — plano da persistência de sessões ADK (já implementado)
- [`arquivo/setup-hook.md`](arquivo/setup-hook.md) — hook TickTick (obsoleto; TickTick foi aposentado na spec 011)
- [`arquivo/superpowers/`](arquivo/superpowers/) — plans/specs do fluxo antigo (mai–jun/2026), anteriores ao Spec Kit
