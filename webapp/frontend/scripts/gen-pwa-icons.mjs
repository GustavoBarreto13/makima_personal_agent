// Gera os ícones do PWA/app a partir da arte da Makima (public/makima.png).
// Rodar uma vez (e de novo só se a arte mudar):  node scripts/gen-pwa-icons.mjs
//
// Saídas em public/ (são arquivos versionados — o build só os copia):
//   pwa-192.png / pwa-512.png      → ícones "any" (aparecem como estão)
//   pwa-maskable-512.png           → ícone "maskable": o Android recorta em círculo/quadrado/gota,
//                                    então o rosto fica no miolo (zona segura = 80% central)
//   apple-touch-icon.png (180)     → atalho na tela inicial do iOS/Safari
//
// Por que partir de makima.png e não do favicon.png: o favicon tem só 256px; esticá-lo para 512
// deixaria o ícone borrado. A arte original (413x604) permite recortar o rosto em boa resolução.

import { fileURLToPath } from 'node:url'
import path from 'node:path'
import sharp from 'sharp'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.resolve(aqui, '..', 'public')
const origem = path.join(publicDir, 'makima.png')

// Mesma cor de fundo do tema claro (theme_color do manifesto) — o PNG da Makima é transparente.
const FUNDO = '#fcf8fa'

// Recorte quadrado em volta do rosto (x, y, lado) dentro dos 413x604 da arte original.
const RECORTE = { left: 5, top: 20, width: 400, height: 400 }

/** Rosto recortado e redimensionado para `lado` px, ainda com fundo transparente. */
async function rosto(lado) {
  return sharp(origem).extract(RECORTE).resize(lado, lado).png().toBuffer()
}

/** Ícone "any": o rosto ocupa o quadrado inteiro, sobre o fundo claro. */
async function iconeAny(tamanho, arquivo) {
  await sharp({ create: { width: tamanho, height: tamanho, channels: 4, background: FUNDO } })
    .composite([{ input: await rosto(tamanho) }])
    .png()
    .toFile(path.join(publicDir, arquivo))
}

/** Ícone "maskable": rosto a 70% do tamanho, centralizado, para sobreviver a qualquer recorte. */
async function iconeMaskable(tamanho, arquivo) {
  const lado = Math.round(tamanho * 0.7)
  const margem = Math.round((tamanho - lado) / 2)
  await sharp({ create: { width: tamanho, height: tamanho, channels: 4, background: FUNDO } })
    .composite([{ input: await rosto(lado), left: margem, top: margem }])
    .png()
    .toFile(path.join(publicDir, arquivo))
}

await iconeAny(192, 'pwa-192.png')
await iconeAny(512, 'pwa-512.png')
await iconeMaskable(512, 'pwa-maskable-512.png')
await iconeAny(180, 'apple-touch-icon.png')
console.log('Ícones gerados em', publicDir)
