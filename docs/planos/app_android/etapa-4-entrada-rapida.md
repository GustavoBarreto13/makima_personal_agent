# Etapa 4 — Entrada rápida (atalhos, compartilhar, câmera, voz)

**Dificuldade:** ⭐⭐ · **Tempo:** 2 semanas · **Quem faz:** Claude (você testa no celular)

## O que é e por quê
Reduzir o esforço de registrar coisas: quanto menos toques, mais você usa.

> **Adiantado (06/nov/2026, código pronto — falta testar no celular):** itens 1, 2 e 4.
> - **Atalhos:** `res/xml/shortcuts.xml` (4 atalhos estáticos) abre `makima://kaguya/nova`, `makima://nami/novo-gasto`,
>   `makima://violet/novo` e `makima://kaguya/foco/iniciar`; cada shell trata o hash e abre o formulário já pronto.
> - **Compartilhar → Makima:** `ShareIntentPlugin.java` + `src/native/share.ts` + `lib/shareTarget.ts` (`resolveShare`). Letterboxd, TMDB,
>   MyAnimeList e AniList abrem a tela do agente já buscando pelo título tirado do endereço (`#compartilhar/<busca>` em Akane, Mai, Marin e
>   Frieren); IMDb pergunta "Filme ou série?"; ISBN abre a Frieren. Links só com código (IMDb, `boxd.it`, Google Livros) abrem a tela sem busca.
> - **Voz:** botão de microfone na `QuickCapture` (todas as telas que a usam), via `VoiceInputPlugin.java` (janela de voz do próprio Android,
>   sem permissão de microfone) e a porta `setVoiceProvider` do Design System. Dentro do editor do diário ainda não (o teclado do Android já dita).
> - **Falta:** câmera (ISBN, recibo, foto do diário) — depende do bucket e do `POST /api/media`.

## Passo a passo

1. **Atalhos no ícone** (segurar o ícone): *Nova tarefa · Novo gasto · Escrever no diário · Iniciar foco*.
   Cada um é um deep link para a tela certa, já com o campo focado.
2. **Compartilhar para a Makima** (Share Target): no Letterboxd, MAL/AniList ou navegador →
   *Compartilhar → Makima*. O app reconhece o domínio e abre o registro de filme (Akane), anime (Marin)
   ou série (Mai) já preenchido.
3. **Câmera**
   1. *Frieren:* escanear o código de barras (ISBN) → busca no Google Books (já integrado) → adicionar.
   2. *Nami:* foto do recibo → Gemini extrai valor, data, loja → **tela de confirmação** (nunca lança sozinho).
   3. *Violet:* anexar foto a um bullet.
   **Pré-requisito:** `POST /api/media` e o bucket privado `makima-media` (ver `01-backend-necessario.md` §6). Sem isso a foto não tem onde ficar.
   *Você:* criar o bucket no Google Cloud e dar permissão à conta de serviço já usada nos backups.
4. **Voz:** botão de microfone na captura rápida e no diário. O texto falado passa pelo `lib/parseTask.ts`
   ("pagar luz amanhã 180" → tarefa com data).
5. **Captura universal** (opcional): um único campo que decide se é tarefa, gasto ou bullet.

## Como saber que deu certo
- Escanear um livro real e ele aparecer na estante.
- Compartilhar um link do Letterboxd abre o registro de filme preenchido.
- Fotografar um recibo e confirmar o lançamento na Nami.

## Riscos
- Permissões de câmera/microfone devem ser pedidas só no momento do uso, com texto claro.
- OCR/IA pode errar valores → confirmação obrigatória.
