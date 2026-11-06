// Gera o ícone do app Android (launcher) a partir da arte da Makima (public/makima.png).
// Rodar uma vez (e de novo só se a arte mudar), em webapp/frontend:
//   node scripts/gen-android-icons.mjs
//
// Mesma arte e mesmo fundo claro do ícone da PWA (scripts/gen-pwa-icons.mjs), para o app e o site
// serem a mesma "cara". Saídas em android/app/src/main/res/ (versionadas):
//   mipmap-<densidade>/ic_launcher_foreground.png → camada da frente do ícone ADAPTATIVO (Android 8+):
//                                                   108dp com o rosto na zona segura central; o launcher
//                                                   recorta em círculo/quadrado/gota por cima do fundo
//   mipmap-<densidade>/ic_launcher.png            → ícone legado (Android 7), quadrado de cantos arredondados
//   mipmap-<densidade>/ic_launcher_round.png      → ícone legado redondo
//   values/ic_launcher_background.xml             → cor de fundo do ícone adaptativo

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import sharp from 'sharp'

const aqui = path.dirname(fileURLToPath(import.meta.url))
const origem = path.resolve(aqui, '..', 'public', 'makima.png')
const res = path.resolve(aqui, '..', 'android', 'app', 'src', 'main', 'res')

// Mesma cor de fundo do tema claro e do ícone da PWA (o PNG da Makima é transparente).
const FUNDO = '#fcf8fa'

// Recorte quadrado em volta do rosto dentro dos 413x604 da arte original (igual ao da PWA).
const RECORTE = { left: 5, top: 20, width: 400, height: 400 }

// Tamanho em px de cada densidade: ícone legado (48dp) e camada adaptativa (108dp).
const DENSIDADES = {
  mdpi: { legado: 48, adaptativo: 108 },
  hdpi: { legado: 72, adaptativo: 162 },
  xhdpi: { legado: 96, adaptativo: 216 },
  xxhdpi: { legado: 144, adaptativo: 324 },
  xxxhdpi: { legado: 192, adaptativo: 432 },
}

// O launcher mostra só o miolo de 72dp dos 108dp (66,7%) e o recorte pode ser um círculo: o rosto precisa
// caber nessa zona segura. 0,58 deixa folga para o cabelo e os ombros não serem cortados.
const ESCALA_ADAPTATIVA = 0.58

/** Rosto recortado e redimensionado para `lado` px, ainda com fundo transparente. */
const rosto = (lado) => sharp(origem).extract(RECORTE).resize(lado, lado).png().toBuffer()

/** Camada da frente do ícone adaptativo: transparente, com o rosto centralizado na zona segura. */
async function frente(tamanho) {
  const lado = Math.round(tamanho * ESCALA_ADAPTATIVA)
  const margem = Math.round((tamanho - lado) / 2)
  return sharp({ create: { width: tamanho, height: tamanho, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await rosto(lado), left: margem, top: margem }])
    .png()
    .toBuffer()
}

/** Ícone legado: o rosto ocupa tudo sobre o fundo claro e uma máscara (círculo ou quadrado arredondado) recorta. */
async function legado(tamanho, redondo) {
  const raio = redondo ? tamanho / 2 : tamanho * 0.22
  const mascara = Buffer.from(
    `<svg width="${tamanho}" height="${tamanho}"><rect width="${tamanho}" height="${tamanho}" rx="${raio}" ry="${raio}" fill="#fff"/></svg>`,
  )
  return sharp({ create: { width: tamanho, height: tamanho, channels: 4, background: FUNDO } })
    .composite([{ input: await rosto(tamanho) }, { input: mascara, blend: 'dest-in' }])
    .png()
    .toBuffer()
}

for (const [densidade, tam] of Object.entries(DENSIDADES)) {
  const pasta = path.join(res, `mipmap-${densidade}`)
  await sharp(await frente(tam.adaptativo)).toFile(path.join(pasta, 'ic_launcher_foreground.png'))
  await sharp(await legado(tam.legado, false)).toFile(path.join(pasta, 'ic_launcher.png'))
  await sharp(await legado(tam.legado, true)).toFile(path.join(pasta, 'ic_launcher_round.png'))
}

writeFileSync(
  path.join(res, 'values', 'ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${FUNDO.toUpperCase()}</color>\n</resources>\n`,
)
console.log('Ícones do Android gerados em', res)
