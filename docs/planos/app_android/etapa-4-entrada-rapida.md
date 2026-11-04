# Etapa 4 — Entrada rápida (atalhos, compartilhar, câmera, voz)

**Dificuldade:** ⭐⭐ · **Tempo:** 2 semanas · **Quem faz:** Claude (você testa no celular)

## O que é e por quê
Reduzir o esforço de registrar coisas: quanto menos toques, mais você usa.

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
