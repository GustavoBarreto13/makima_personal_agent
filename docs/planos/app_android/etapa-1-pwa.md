# Etapa 1 — O site vira "instalável de verdade" (PWA)

**Dificuldade:** ⭐ · **Tempo:** 1–2 semanas · **Quem faz:** Claude (código) + você (testar no celular)

## O que é e por quê
Hoje existe só o `public/manifest.webmanifest` (um ícone de 256px). Falta o **service worker** — um
"ajudante" que guarda cópias das telas no celular para abrir rápido e funcionar sem internet.
Esta etapa serve ao navegador, ao celular e ao app da Etapa 2.

## Passo a passo

1. Instalar `vite-plugin-pwa` e configurar em `webapp/frontend/vite.config.ts`.
2. **Ícones:** gerar 192px, 512px e versão "maskable" (o Android recorta em círculo/quadrado) a partir
   de `public/makima.png`; atualizar o `manifest.webmanifest` (hoje com um único ícone).
3. **Splash e cores:** `theme_color` claro/escuro já existe no `index.html`; conferir com o DS.
4. **Estratégia de cache** (o que fica guardado):
   - Arquivos do app (JS/CSS/imagens): sempre em cache, atualizados em segundo plano.
   - Leituras da API (`/api/...` GET): "tenta a rede, se falhar usa a cópia" — só das telas-chave
     (Meu Dia, tarefas, roteiro da viagem).
   - **Nunca** guardar respostas de login/`/auth`.
5. **Tela "Sem conexão"** no padrão do Design System (`design/ui/feedback.tsx`), seguindo o fluxo Impeccable.
6. **Aviso de nova versão:** quando houver deploy, um toast "Atualizar" (usa `design/headless/toast.ts`).
7. **Você:** abrir o site no Chrome do celular → menu → *Instalar app* → ligar o modo avião e navegar.

## Arquivos tocados
`webapp/frontend/vite.config.ts`, `webapp/frontend/public/manifest.webmanifest`, `webapp/frontend/index.html`,
um novo `src/pwa/` (registro do service worker), tela offline em `src/design/ui/`.

## Como saber que deu certo
- Lighthouse (Chrome DevTools) → categoria PWA sem pendências.
- Ícone da Makima na gaveta; no modo avião, as telas já visitadas abrem.
- `npm test` e `npm run audit:design` continuam verdes.

## Riscos
- Cache velho mostrando versão antiga → o aviso de atualização mitiga.
- Guardar dado sensível (diário, finanças) no cache do navegador: limitar às rotas necessárias e limpar no logout.
