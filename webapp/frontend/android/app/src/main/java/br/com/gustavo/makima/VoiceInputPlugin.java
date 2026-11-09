package br.com.gustavo.makima;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.speech.RecognizerIntent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;

/**
 * Entrada por voz: abre a janela de reconhecimento de voz do próprio Android ("Fale agora") e devolve o texto.
 *
 * <p>Usa a Intent do sistema (ACTION_RECOGNIZE_SPEECH), então o app NÃO precisa da permissão de microfone —
 * quem ouve é o serviço de voz do Google. Cancelar a janela devolve texto vazio (não é erro).
 */
@CapacitorPlugin(name = "VoiceInput")
public class VoiceInputPlugin extends Plugin {

    @PluginMethod
    public void listen(PluginCall call) {
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pt-BR");
        intent.putExtra(RecognizerIntent.EXTRA_PROMPT, call.getString("prompt", "Fale agora"));
        try {
            startActivityForResult(call, intent, "onSpeechResult");
        } catch (ActivityNotFoundException e) {
            call.reject("Reconhecimento de voz indisponível neste aparelho.");
        }
    }

    @ActivityCallback
    private void onSpeechResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject res = new JSObject();
        String texto = "";
        if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
            ArrayList<String> frases = result.getData().getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            // A primeira é a que o reconhecedor considera mais provável.
            if (frases != null && !frases.isEmpty()) texto = frases.get(0);
        }
        res.put("text", texto);
        call.resolve(res);
    }
}
