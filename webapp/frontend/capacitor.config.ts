import type { CapacitorConfig } from '@capacitor/cli'

// Configuração do Capacitor: a "casca" Android que mostra o webapp da Makima
// (docs/planos/app_android/etapa-2-capacitor-login.md, seção A).
//
// O app EMBUTE o `dist/` gerado pelo `npm run build` — as telas rodam do próprio aparelho,
// na origem `https://localhost` (padrão do Capacitor no Android). As chamadas ao backend
// saem com o endereço absoluto definido no build por `VITE_API_BASE_URL` (ver src/lib/api.ts).
//
// Fluxo de trabalho: `npm run android:install` (build + cap sync + APK via Gradle + instala no celular pelo adb),
// sem abrir o Android Studio — ver scripts/android-apk.mjs. `npm run android:apk` só gera o APK.
const config: CapacitorConfig = {
  // Identificador único do app no Android (não muda depois de publicado: é o "RG" do app).
  appId: 'br.com.gustavo.makima',
  appName: 'Makima',
  // Pasta que o `cap sync` copia para dentro do projeto Android.
  webDir: 'dist',
}

export default config
