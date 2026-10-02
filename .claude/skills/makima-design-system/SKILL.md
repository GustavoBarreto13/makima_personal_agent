---
name: makima-design-system
description: Use SEMPRE que for criar, migrar, alterar ou revisar uma tela, componente ou estilo em webapp/frontend (pages/<agente>/, src/design/). Aplica o Design System Makima (tokens --ds-*, AppShell, Hero, useCollection, QuickCapture, StatsPage, DetailPage, Stars 0-5 com meia estrela), pergunta a direção de arte da página, roda a auditoria e mantém o manifesto de conformidade. Não usar para backend.
user-invocable: true
disable-model-invocation: false
---

# Design System Makima — roteiro de tela

Toda mudança de UI em `webapp/frontend` passa por este roteiro. O padrão vive em
`webapp/frontend/src/design/`; a referência viva é a rota `/design`; o guia é
`webapp/docs/DESIGN_SYSTEM.md` (leia antes de começar). Status de adoção: `webapp/docs/DESIGN_CONFORMANCE.md`.

## Roteiro

1. **Ler** `webapp/docs/DESIGN_SYSTEM.md` e a entrada da página em `src/design/conformance.json`
   (status, `art`, o que já foi adotado). Abrir `src/pages/design/` como exemplo de uso.
2. **Perguntar a direção de arte** com `AskUserQuestion`, uma vez por página (se `art` for `null`):
   *"Quer seguir algum estilo de arte específico para esta página?"* Opções: **Padrão Makima (vidro +
   ambiente)** (recomendada), até **2 estilos sugeridos** pelo domínio (ex.: Yato "caderno de
   bordo", Akane "cinema noir", Frieren "grimório", Marin "neon kawaii", Violet "papel de carta") e
   **Outro** (texto ou referência). Registrar a resposta em `agents.json` (`art`) e em
   `conformance.json`. **O estilo muda o visual, nunca a estrutura**: só custom properties `--ds-*`
   em `src/design/art/<estilo>.css` (nada de layout; o lint rejeita).
3. **Confirmar com o usuário** (só se não estiver claro) as **estatísticas** do domínio (métricas
   mínimas em `statsRequired`) e as **facetas** das coleções (busca + status/tipo + data + 2 ordenações).
4. **Implementar** seguindo o checklist de tela nova do `DESIGN_SYSTEM.md`:
   - esqueleto `AppShell` (agente de `agents.json`), um CTA primário, `Hero` na tela Início;
   - listas em `useCollection` (esquema com `defineCollection`); criação rápida em `QuickCapture`
     (regras de `core/capture`); stats no `StatsPage` (contrato `StatsPayload`); detalhe no `DetailPage`;
   - formulários com `Field` + validação inline; exclusão com `confirm()` + `toast(..., { undo })`;
   - 4 estados em toda tela (`LoadingState`, `EmptyState`, `ErrorState`, dados);
   - ícones só de `design/` (`<Icon name>`); estrelas só `Stars`/`RateInput` (0–5, meia estrela);
   - atalhos no padrão **Windows** (`Ctrl`), sempre com botão/comando equivalente.
5. **Regras que não se negociam:** tokens `--ds-*` (nunca cor/raio/fonte literal); sem
   `<input type=date|time>`, `alert/confirm/prompt`, emoji de UI, `new Date('YYYY-MM-DD')`,
   `toISOString().slice(0,10)`; datas no fuso America/Sao_Paulo; o `design/` nunca chama a rede
   (a tela liga a API); `core/` sem React/DOM.
6. **Rodar** (em `webapp/frontend`): `npm run audit:design` e `npm test`; corrigir até passar.
   Para ver o resultado: `npm run dev` e abrir a página (e `/design` para comparar), verificando
   tema claro/escuro e celular (< 640px: gaveta, barra inferior, FAB, bottom sheet).
7. **Revisão visual:** rodar a skill `impeccable` em modo *critique/audit* sobre a tela pronta.
8. **Atualizar** `conformance.json` (status → `migrating`/`conformant`, itens adotados, métricas de
   stats), regenerar o relatório com `npm run audit:design -- --report`, e a documentação:
   `agents/<nome>/CLAUDE.md` se mudou tool/rota, `webapp/docs/FRONTEND.md`, `ROADMAP.md`.

## Política de conformidade

`legacy` só aparece no relatório · `migrating` falha o lint estático dos arquivos da página ·
`conformant` falha em **qualquer** item (a página não pode "voltar" a sair do padrão).

## Dicas

- Token novo? Edite `src/design/tokens.json` e rode `npm run tokens` (nunca edite `tokens.css`).
- Agente novo? Acrescente em `agents.json` (cor, rota, retrato) e em `conformance.json`.
- Ícone novo? Registre em `src/design/ui/icons.ts` (um conceito = um ícone em todo o app).
- Contraste falhou? `npm run audit:design -- --contrast` mostra o par e a razão.
- Não crie `TweaksPanel`, `Toast`, `Icons`, modais ou botões locais: use os do `design/`.
