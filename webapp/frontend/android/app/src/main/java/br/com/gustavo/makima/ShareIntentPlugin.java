package br.com.gustavo.makima;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Entrega ao JavaScript o texto que outro app compartilhou com a Makima (menu Compartilhar do Android).
 *
 * <p>O texto chega por uma Intent ACTION_SEND: ou ao abrir o app (MainActivity.onCreate) ou com o app já
 * aberto (onNewIntent). Fica guardado em {@code pending} até o JavaScript pedir com {@code getPending()};
 * o evento {@code shareReceived} só avisa que há texto novo (sem carregar o texto, para ser lido uma vez só).
 */
@CapacitorPlugin(name = "ShareIntent")
public class ShareIntentPlugin extends Plugin {

    /** Estático: a MainActivity guarda o texto ANTES de a ponte do Capacitor existir. */
    private static String pending = null;

    /** Guarda o texto de uma Intent de compartilhamento (ignora qualquer outra). */
    static void capture(Intent intent) {
        if (intent == null) return;
        if (!Intent.ACTION_SEND.equals(intent.getAction()) || !"text/plain".equals(intent.getType())) return;
        String texto = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (texto != null && !texto.trim().isEmpty()) {
            pending = texto;
            // Evita tratar o mesmo compartilhamento de novo se a Activity for recriada com a mesma Intent.
            intent.setAction(Intent.ACTION_MAIN);
        }
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        capture(intent);
        if (pending != null) notifyListeners("shareReceived", new JSObject());
    }

    @PluginMethod
    public void getPending(PluginCall call) {
        JSObject res = new JSObject();
        res.put("text", pending);
        pending = null;
        call.resolve(res);
    }
}
