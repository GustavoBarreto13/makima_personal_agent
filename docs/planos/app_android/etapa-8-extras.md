# Etapa 8 — Extras avançados (sob demanda)

**Dificuldade:** ⭐⭐⭐–⭐⭐⭐⭐ · Cada item é independente; fazer só os que fizerem sentido.

| Extra | O que faz | Como | Cuidado |
|---|---|---|---|
| **Lembrete por lugar** | "Lembrar de comprar pilha ao chegar no mercado" (Kaguya/Yato) | Geofence nativo + `@capacitor/geolocation` | Gasta bateria; permissão de localização "o tempo todo" |
| **Sono (Health Connect)** | "Dormiu 5h — dia mais leve?" em `capacity.py` (Kaguya) e `violet_context.py` | Plugin Health Connect | Dado de saúde: opt-in, nunca sair do servidor próprio |
| **Notificação do banco → gasto** | Sugere lançamento na Nami | `NotificationListenerService` (Kotlin) | Permissão muito sensível; só sideload; sempre **sugestão para confirmar** |
| **Importar contatos** | Cadastra pessoas na Komi | `@capacitor-community/contacts` + `komi.integration.resolve_person` (regra 0/1/2+) | Nunca vincular sem confirmação |
| **APK automático** | Build assinado a cada push | GitHub Actions + Firebase App Distribution | Guardar a keystore como segredo do GitHub |
| **Live update da interface** | Deploy no VPS vale no celular sem reinstalar | Capacitor live update ou carregar do servidor | Versões incompatíveis com o APK |
