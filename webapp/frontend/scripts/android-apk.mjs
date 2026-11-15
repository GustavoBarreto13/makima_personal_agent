// Gera o APK sem abrir o Android Studio e, com --install, instala no celular via adb.
// Uso: `npm run android:apk` (só gera) · `npm run android:install` (gera + instala + abre).
//
// Qual APK: se a chave de release estiver disponível (android/keystore.properties ou MAKIMA_KEYSTORE_FILE),
// gera o de RELEASE, assinado com ela — o mesmo que o GitHub Actions gera. Sem a chave, cai no de
// depuração e avisa: o Android não instala um por cima do outro (assinaturas diferentes).
// Sempre roda o `npm run android:sync` antes (build das telas + cap sync): o APK EMBUTE as telas, e um APK
// gerado sem isso sai com telas velhas — aconteceu em 15/nov/2026. `--no-sync` pula (só para quem sabe o que faz).
//
// Java: usa o JAVA_HOME; senão um JDK 21 instalado; por último o Java do Android Studio (jbr).
// SDK: usa o ANDROID_HOME/ANDROID_SDK_ROOT se existir; senão a pasta padrão do Windows/macOS/Linux.
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const isWin = process.platform === 'win32'
const androidDir = resolve(import.meta.dirname, '..', 'android')
const install = process.argv.includes('--install')

function firstExisting(paths) {
  return paths.find((p) => p && existsSync(p))
}

// O Gradle do projeto (8.14) roda em Java 17–24: o Java 25 que o Android Studio passou a trazer
// quebra o build ("Unsupported class file major version 69"). Por isso o JDK 21 avulso vem antes.
function jdk21() {
  const bases = isWin
    ? ['C:\\Program Files\\Microsoft', 'C:\\Program Files\\Eclipse Adoptium', 'C:\\Program Files\\Java']
    : ['/usr/lib/jvm', '/Library/Java/JavaVirtualMachines']
  for (const base of bases) {
    if (!existsSync(base)) continue
    const dir = readdirSync(base).filter((d) => /^(jdk-?21|temurin-21|java-21|openjdk-21)/i.test(d)).sort().pop()
    if (dir) return process.platform === 'darwin' ? join(base, dir, 'Contents', 'Home') : join(base, dir)
  }
}

const javaHome = firstExisting([
  process.env.JAVA_HOME,
  jdk21(),
  isWin && 'C:\\Program Files\\Android\\Android Studio\\jbr',
  process.platform === 'darwin' && '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
  '/opt/android-studio/jbr',
])
if (!javaHome) {
  console.error('Java não encontrado: defina JAVA_HOME (JDK 21) ou instale o Android Studio.')
  process.exit(1)
}

const sdk = firstExisting([
  process.env.ANDROID_HOME,
  process.env.ANDROID_SDK_ROOT,
  isWin && join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk'),
  join(homedir(), 'Library', 'Android', 'sdk'),
  join(homedir(), 'Android', 'Sdk'),
])

const env = { ...process.env, JAVA_HOME: javaHome, ...(sdk ? { ANDROID_HOME: sdk } : {}) }

function run(cmd, args) {
  // .bat no Windows precisa de shell; aspas porque o caminho pode ter espaços.
  const r = spawnSync(isWin ? `"${cmd}"` : cmd, args, { cwd: androidDir, env, stdio: 'inherit', shell: isWin })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

if (!process.argv.includes('--no-sync')) {
  const r = spawnSync('npm', ['run', 'android:sync'], { cwd: resolve(androidDir, '..'), env, stdio: 'inherit', shell: isWin })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

const release = Boolean(process.env.MAKIMA_KEYSTORE_FILE) || existsSync(join(androidDir, 'keystore.properties'))
if (!release) {
  console.warn(
    '\n⚠ Sem android/keystore.properties: gerando APK de DEPURAÇÃO. Se o celular tem o app de release,' +
      ' o Android vai recusar instalar por cima (ver docs/planos/app_android/etapa-2-capacitor-login.md, seção E).\n',
  )
}
const variant = release ? 'release' : 'debug'
run(join(androidDir, isWin ? 'gradlew.bat' : 'gradlew'), [release ? 'assembleRelease' : 'assembleDebug', '--console=plain'])
const apk = join(androidDir, 'app', 'build', 'outputs', 'apk', variant, `app-${variant}.apk`)
if (!existsSync(apk)) {
  console.error(`APK não encontrado em ${apk} (a chave de release está certa no keystore.properties?).`)
  process.exit(1)
}
console.log(`\nAPK (${variant}): ${apk}`)

if (install) {
  const adb = sdk && firstExisting([join(sdk, 'platform-tools', isWin ? 'adb.exe' : 'adb')])
  if (!adb) {
    console.error('adb não encontrado (SDK/platform-tools). Instale o APK manualmente.')
    process.exit(1)
  }
  const serial = findPhone(adb)
  run(adb, ['-s', serial, 'install', '-r', apk])
  run(adb, ['-s', serial, 'shell', 'monkey', '-p', 'br.com.gustavo.makima', '-c', 'android.intent.category.LAUNCHER', '1'])
}

// Acha o celular: pelo cabo ou pela "Depuração por Wi-Fi" (Wireless debugging). Se nada estiver conectado,
// procura na rede um celular já pareado (`adb mdns services`) e conecta sozinho — a porta muda a cada vez
// que o Wireless debugging liga, então não dá para guardar IP:porta. Parear é uma vez só (adb pair).
function findPhone(adb) {
  const out = (args) => spawnSync(adb, args, { env, encoding: 'utf8' }).stdout ?? ''
  const connected = () =>
    out(['devices'])
      .split(/\r?\n/)
      .map((l) => l.split('\t'))
      .filter(([serial, state]) => serial && state === 'device')
      .map(([serial]) => serial)

  let phones = connected()
  if (phones.length === 0) {
    const announced = [...out(['mdns', 'services']).matchAll(/_adb-tls-connect\._tcp\.?\s+(\S+:\d+)/g)].map((m) => m[1])
    for (const addr of announced) {
      console.log(`Conectando pelo Wi-Fi em ${addr}…`)
      out(['connect', addr])
    }
    phones = connected()
  }
  if (phones.length === 0) {
    console.error(
      '\nNenhum celular encontrado. Ligue o cabo USB, ou no celular: Settings → Developer options →' +
        ' Wireless debugging ligado (mesma rede Wi-Fi do PC). Primeira vez por Wi-Fi: parear com' +
        ' "Pair device with pairing code" + `adb pair IP:porta` (ver docs/referencia/APP_ANDROID_BUILD.md).',
    )
    process.exit(1)
  }
  // Cabo e Wi-Fi ao mesmo tempo = o mesmo celular duas vezes; qualquer um serve.
  return phones[0]
}
