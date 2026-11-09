// "Compartilhar → Makima": recebe o texto que outro app (Letterboxd, MyAnimeList, navegador…) manda pelo
// menu Compartilhar do Android e abre a tela certa já buscando o item.
//
// A parte nativa (ShareIntentPlugin.java) guarda o texto recebido; aqui o app o lê na abertura e quando
// chega um novo com o app já aberto. Quem decide o destino é lib/shareTarget.ts (função pura, testada).

import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { confirm } from '../design/headless/confirm'
import { toast } from '../design/headless/toast'
import { resolveShare } from '../lib/shareTarget'
import { isNativeApp } from './nativeAuth'

interface ShareIntentPlugin {
  /** Texto compartilhado que ainda não foi tratado (lê e esquece). */
  getPending(): Promise<{ text: string | null }>
  addListener(event: 'shareReceived', fn: () => void): Promise<PluginListenerHandle>
}

const ShareIntent = registerPlugin<ShareIntentPlugin>('ShareIntent')

/** Abre o destino de um texto compartilhado (pergunta quando o link é ambíguo, como o IMDb). */
export async function handleShared(text: string, open: (deepLink: string) => void): Promise<void> {
  const action = resolveShare(text)
  if (action.kind === 'open') {
    open(action.link)
    return
  }
  if (action.kind === 'choose') {
    const [primeira, segunda] = action.options
    // Fechar a caixa sem escolher conta como a segunda opção (a caixa de confirmação só tem dois resultados).
    const escolheuPrimeira = await confirm({
      title: 'O que é isso?',
      body: 'Esse link não diz se é filme ou série.',
      confirmLabel: primeira.label,
      cancelLabel: segunda.label,
    })
    open((escolheuPrimeira ? primeira : segunda).link)
    return
  }
  toast('Não reconheci esse link. A Makima entende Letterboxd, IMDb, TMDB, MyAnimeList, AniList e Google Livros.', { tone: 'info' })
}

/**
 * Começa a escutar compartilhamentos. Trata o que abriu o app e o que chegar depois.
 *
 * @param open - Abre um deep link (`makima://…`) no app.
 * @returns Função que para de escutar.
 */
export function initShare(open: (deepLink: string) => void): () => void {
  if (!isNativeApp()) return () => {}
  const tratar = async () => {
    try {
      const { text } = await ShareIntent.getPending()
      if (text) await handleShared(text, open)
    } catch {
      /* plugin nativo ausente (build antigo): compartilhar simplesmente não faz nada */
    }
  }
  void tratar() // o que abriu o app
  const sub = ShareIntent.addListener('shareReceived', () => void tratar()).catch(() => null)
  return () => {
    void sub.then((h) => h?.remove())
  }
}
