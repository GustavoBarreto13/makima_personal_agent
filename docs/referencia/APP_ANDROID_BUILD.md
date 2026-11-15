# App Android: chave de assinatura, build e recuperação

> **Doc viva.** Descreve como o APK do app Makima é gerado e assinado hoje, e o que fazer se algo se
> perder. Plano geral do app: [`docs/planos/app_android/`](../planos/app_android/README.md).
> Montado em 15/nov/2026.

## Resumo em 30 segundos

- O app é o webapp embrulhado pelo Capacitor. Ele **carrega uma cópia das telas dentro do APK**, então
  mudança de tela só chega ao celular com **APK novo**. Mudança só de backend vale na hora.
- Todo APK é **assinado** com uma chave. O Android só aceita atualizar o app com um APK assinado pela
  **mesma chave**. Se ela se perder, nunca mais dá pra atualizar: só desinstalando e começando do zero.
- A chave definitiva (`makima-release.jks`) existe desde 15/nov/2026. Ela tem **3 cópias**: o PC, o
  Bitwarden e o Google Drive (trancada com senha).
- O APK sai de dois jeitos: **no PC**, com `npm run android:install`, ou **no GitHub Actions**, sozinho a
  cada push. O segundo não depende de PC nenhum.

## Onde está cada peça

| Peça | Para que serve | Onde está | No git? |
|---|---|---|---|
| `makima-release.jks` | A chave que assina o app (alias `makima`) | `C:\Users\gusta\makima-release.jks` · anexo no Bitwarden (item **"Makima — keystore Android"**) · `G:\Meu Drive\Backups\makima-keystore.7z` | ❌ nunca |
| Senha da chave | Abre a keystore. É a mesma senha pro arquivo, pra chave e pro `.7z` | Bitwarden, mesmo item | ❌ nunca |
| `android/keystore.properties` | Diz ao Gradle do PC onde está a chave e qual é a senha | `webapp/frontend/android/` (só neste PC) | ❌ ignorado |
| `android/app/google-services.json` | Liga o app ao Firebase (push) | `webapp/frontend/android/app/` · baixável no console do Firebase | ❌ ignorado |
| Secrets do GitHub | A chave, a senha e o `google-services.json` pro Actions | Repositório → Settings → Secrets and variables → Actions | — |
| Credencial OAuth "Makima Android (release)" | Deixa o login do Google funcionar no APK de release (pelo SHA-1 da chave) | Google Cloud → APIs e serviços → Credenciais | — |
| Credencial OAuth Android de depuração | Mesmo papel, pro APK de depuração deste PC | Google Cloud, mesma tela. **Não apagar** | — |
| `.env.android` | Endereço da API e client ID web, usados no build. Nada secreto | `webapp/frontend/` | ✅ |

**SHA-1 da chave de release:** `98:3F:98:76:3C:8C:7F:0F:C2:73:CB:32:5A:59:BB:E2:56:E2:02:6F`. Não é
secreto. Ele está aqui pra conferir se o Google Cloud está com o valor certo.

## O que foi feito, e como

### 1. A chave (15/nov/2026, feito à mão)
1. A senha foi gerada no Bitwarden **antes** de criar a chave (letras e números, cerca de 20 caracteres).
2. A chave foi criada com o `keytool` (RSA 4096, validade de 100 anos):
   ```bash
   & "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" -genkeypair -v -keystore "$HOME\makima-release.jks" -alias makima -keyalg RSA -keysize 4096 -validity 36500
   ```
3. Backups:
   - **Drive:** um `.7z` com senha e nomes escondidos (`-mhe=on`), testado com `7z t`.
   - **Bitwarden:** o `.jks` anexado no item.
4. **SHA-1** lido com o `keytool -list -v` (ver "Pegadinhas" abaixo) e cadastrado como credencial OAuth
   **Android** nova no Google Cloud (pacote `br.com.gustavo.makima`), **ao lado** da de depuração.

### 2. O código (commit `180084e`)
- **`android/app/build.gradle`:**
  - **Assinatura:** o release é assinado com a chave lida de `android/keystore.properties` (no PC) ou das
    variáveis `MAKIMA_KEYSTORE_FILE` e `MAKIMA_KEYSTORE_PASSWORD` (no CI). Sem nenhum dos dois, o APK sai
    sem assinatura.
  - **Versão:** `versionName` é a versão do `package.json`. O `versionCode` é calculado por
    `MAJOR*1000000 + MINOR*100 + PATCH`: a 0.61.0 vira 6100, a 0.62.3 vira 6203. Sobe sozinho a cada
    release do Makima.
- **`webapp/frontend/scripts/android-apk.mjs`**, chamado por `npm run android:apk` e `npm run android:install`:
  - **Java:** acha sozinho, na ordem `JAVA_HOME`, depois um JDK 21 instalado, depois o Java do Android Studio.
  - **SDK do Android:** também acha sozinho.
  - **Qual APK:** gera o de **release** se encontrar a chave; senão gera o de depuração e avisa.
  - **Com `--install`:** instala pelo `adb` e abre o app.
- **`.github/workflows/android-apk.yml`:**
  - **Quando roda:** em push na `master` que mexe em `webapp/frontend/**`, ou pelo botão "Run workflow".
    **Nunca** em pull request, que não pode ver a chave.
  - **O que faz:** monta a chave e o `google-services.json` a partir dos secrets, roda o
    `./gradlew assembleRelease` e publica o APK como artefato `makima-<versão>-<sha>`, guardado por 30 dias.
  - **Limpeza:** no fim, apaga a chave do runner.
- **`android/.gitignore`:** ignora `keystore.properties`, `*.jks` e `*.keystore`.

### 3. Secrets do GitHub (feito à mão)
| Nome | Valor | Como gerar o valor (PowerShell, já copia pro Ctrl+V) |
|---|---|---|
| `ANDROID_KEYSTORE_PASSWORD` | a senha | copiar do Bitwarden |
| `ANDROID_KEYSTORE_BASE64` | a chave em texto base64 | `[Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\makima-release.jks")) \| Set-Clipboard` |
| `GOOGLE_SERVICES_JSON` | o conteúdo do json | `Get-Content -Raw "<repo>\webapp\frontend\android\app\google-services.json" \| Set-Clipboard` |

### 4. JDK 21 no PC
O Android Studio se atualizou e passou a trazer o **Java 25**, que o Gradle do projeto (8.14) não aceita
(erro `Unsupported class file major version 69`). Foi instalado o **Microsoft OpenJDK 21** e o script
usa ele primeiro:

```bash
winget install --id Microsoft.OpenJDK.21 -e
```

## Dia a dia: atualizar o app no celular

**Com o PC, sem cabo:** celular e PC na mesma rede Wi-Fi, com **Settings → Developer options → Wireless
debugging** ligado no celular. O celular foi pareado com o PC em 15/nov/2026. O pareamento é uma vez só e
precisa ser refeito só em PC novo ou se o celular "esquecer" o PC:
1. No celular: **Wireless debugging → Pair device with pairing code**.
2. No PC: `& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" pair <IP:porta da janelinha>` e digitar o código.

Não precisa dar `adb connect`: o script acha sozinho na rede o celular já pareado (`adb mdns services`) e
conecta. A porta muda a cada vez, então não adianta guardar IP:porta.

**Com o PC e cabo**, ou sem cabo depois do pareamento acima. Rode isto em `webapp/frontend`:

```bash
npm run android:install
```

Ele faz o build das telas, o `cap sync`, o APK assinado, instala e abre o app. Não precisa abrir o
Android Studio. Se só quiser o arquivo: `npm run android:apk` (sai em `android/app/build/outputs/apk/release/`).

**Sem PC:**
1. github.com → repositório → **Actions** → **APK Android**.
2. Abra a última execução verde e baixe o artefato (vem um `.zip` com o `app-release.apk` dentro).
3. Passe o APK pro celular e instale. Ele instala **por cima**, sem perder o login.

Pra gerar um APK sem ter mudado nada: Actions → APK Android → **Run workflow**.

## Se precisar fazer de novo

### Perdi o PC (ou PC novo)
1. Instale o Node 22+, o JDK 21 (`winget install --id Microsoft.OpenJDK.21 -e`) e o SDK do Android. O SDK
   vem com o Android Studio; dá pra instalar o Studio só pra isso e nunca mais abrir.
2. `git clone` do repositório, depois `npm ci` em `webapp/frontend`.
3. Restaure a chave: baixe o anexo do Bitwarden (ou o `.7z` do Drive) e coloque em `C:\Users\<você>\makima-release.jks`.
4. Baixe o `google-services.json`: console do Firebase → projeto **Makima** → ⚙ Configurações do projeto
   → app Android `br.com.gustavo.makima` → baixar. Coloque em `webapp/frontend/android/app/`.
5. Crie o `webapp/frontend/android/keystore.properties` assim:
   ```
   storeFile=C:/Users/<você>/makima-release.jks
   storePassword=<senha do Bitwarden>
   keyAlias=makima
   ```
   Use barras `/` no caminho, não `\`.
6. `npm run android:install`. Ele instala por cima do app que já está no celular, porque a chave é a mesma.

> Se você só quer atualizar o app, nem precisa do PC: o APK sai pronto no Actions.

### Perdi o celular
Instale o APK (do Actions ou do PC) no celular novo e faça login. Os dados estão no servidor. Depois,
revogue o aparelho velho em `/api/devices`.

### Os secrets do GitHub sumiram, ou é preciso trocar
Refaça a tabela da seção 3 (Settings → Secrets and variables → Actions → **New repository secret**, ou
**Update** em um que já existe). O GitHub não mostra o valor de volta, isso é normal.

### O login do Google parou de funcionar no APK de release
Confira se a credencial **"Makima Android (release)"** ainda existe no Google Cloud com o SHA-1 desta doc.
Se não existir, crie de novo: Credenciais → **+ Criar credenciais** → ID do cliente OAuth → **Android** →
pacote `br.com.gustavo.makima` + SHA-1.

### Conferir se o backup do Drive ainda abre
```bash
& "C:\Program Files\7-Zip\7z.exe" t "G:\Meu Drive\Backups\makima-keystore.7z"
```
Tem que aparecer `Everything is Ok`. Vale testar uma vez por ano.

### Trocar o celular de APK de depuração para release (feito uma vez só)
Release e depuração têm assinaturas diferentes, então o Android não instala um por cima do outro.
1. Abra o app com internet e confira que **não** aparece "N aguardam a internet". As escritas offline
   pendentes somem junto com o app.
2. Desinstale o Makima.
3. Instale o de release e faça login de novo.

## Pegadinhas já encontradas

- **`keytool -list -v` em português quebra** (`MissingFormatArgumentException '%2$s'`). É um bug de
  tradução do Java. Peça a saída em inglês, **com aspas** (sem aspas o PowerShell quebra o argumento no ponto):
  ```bash
  & "C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe" "-J-Duser.language=en" -list -v -keystore "$HOME\makima-release.jks" -alias makima
  ```
- **Java 25 quebra o Gradle 8.14.** Use o JDK 21 (o script já prefere ele). Isso só acaba quando o
  projeto subir o Gradle pra 9.x.
- **"INSTALL_FAILED_UPDATE_INCOMPATIBLE" no `adb install`** significa assinatura diferente da do app
  instalado (release × depuração, ou chave errada). Não "resolva" criando uma chave nova.
- **Perfis do Samsung (Perfil de trabalho, Pasta Segura):** a assinatura vale pro celular inteiro. Um
  Makima antigo esquecido noutro perfil também bloqueia a instalação. Pra achar e remover:
  `adb shell pm list packages --user 10 | grep makima` e depois `adb shell pm uninstall --user 10 br.com.gustavo.makima`.
  O `adb` não tem acesso à Pasta Segura (user 150): ali só dá pra desinstalar pelo próprio celular.
- **APK com telas velhas** (15/nov/2026: o "Não ditos" não apareceu): o APK foi gerado sem rodar antes o
  `npm run android:sync`, então foi com a cópia de telas antiga. Agora o `scripts/android-apk.mjs`
  **sempre** roda o sync antes. O CI roda o sync no próprio workflow.
- **Sem `keystore.properties`**, o script gera o APK de **depuração** e avisa. No celular com o de
  release, ele não instala.
- **Repositório público:** os secrets ficam escondidos, mas o APK do Actions pode ser baixado por quem
  estiver logado no GitHub. Ele não tem nada secreto (o login só aceita o `ALLOWED_EMAIL`).

## Nunca faça

- Commitar a keystore, a senha ou o `keystore.properties`.
- Guardar a chave num lugar só.
- Criar uma keystore nova "porque perdeu a senha". O app instalado nunca mais atualiza.
- Apagar a credencial OAuth de release no Google Cloud.
- Rodar o workflow em pull request de terceiros.
