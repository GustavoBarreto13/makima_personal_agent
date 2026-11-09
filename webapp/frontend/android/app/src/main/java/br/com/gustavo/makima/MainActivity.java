package br.com.gustavo.makima;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins próprios precisam ser registrados ANTES do super.onCreate (que cria a ponte do Capacitor).
        registerPlugin(ShareIntentPlugin.class);
        registerPlugin(VoiceInputPlugin.class);
        // O app pode ter sido aberto pelo menu Compartilhar: guarda o texto para o JavaScript ler.
        ShareIntentPlugin.capture(getIntent());
        super.onCreate(savedInstanceState);
    }
}
