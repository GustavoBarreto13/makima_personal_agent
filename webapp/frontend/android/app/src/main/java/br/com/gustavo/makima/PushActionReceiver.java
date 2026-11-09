package br.com.gustavo.makima;

import android.annotation.SuppressLint;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * Trata o toque nos botões da notificação (Concluir / Adiar 1h / Amanhã).
 *
 * <p>Chama {@code POST /api/push/action} com o token assinado que veio no push. Esse token vale só
 * para aquela tarefa, então o receptor não precisa da sessão do usuário (que gira a cada uso).
 * Deu certo: fecha a notificação. Deu errado: troca por um aviso "toque para abrir".
 */
public class PushActionReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context ctx, Intent intent) {
        final String token = intent.getStringExtra(MakimaMessagingService.EXTRA_TOKEN);
        final String acao = intent.getStringExtra(MakimaMessagingService.EXTRA_ACTION);
        final int id = intent.getIntExtra(MakimaMessagingService.EXTRA_NOTIFICATION_ID, 0);
        final String titulo = intent.getStringExtra(MakimaMessagingService.EXTRA_TITLE);
        if (token == null || acao == null) return;

        // goAsync: a rede não pode rodar na thread principal, mas o Android só deixa o receptor
        // "vivo" por alguns segundos — a thread avisa que terminou com finish().
        final PendingResult pendente = goAsync();
        final Context app = ctx.getApplicationContext();
        new Thread(() -> {
            try {
                String erro = enviar(token, acao);
                if (erro == null) {
                    NotificationManagerCompat.from(app).cancel(id);
                } else {
                    mostrarFalha(app, id, titulo, erro);
                }
            } catch (Exception e) {
                mostrarFalha(app, id, titulo, "Sem conexão — toque para abrir.");
            } finally {
                pendente.finish();
            }
        }).start();
    }

    /** Faz o POST. Devolve {@code null} se deu certo, ou o texto do erro para mostrar ao usuário. */
    private static String enviar(String token, String acao) throws Exception {
        URL url = new URL(BuildConfig.API_BASE_URL + "/api/push/action");
        HttpURLConnection c = (HttpURLConnection) url.openConnection();
        try {
            c.setRequestMethod("POST");
            c.setConnectTimeout(8000);
            c.setReadTimeout(8000);
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json");
            JSONObject corpo = new JSONObject();
            corpo.put("token", token);
            corpo.put("action", acao);
            try (OutputStream os = c.getOutputStream()) {
                os.write(corpo.toString().getBytes(StandardCharsets.UTF_8));
            }
            int status = c.getResponseCode();
            if (status >= 200 && status < 300) return null;
            // 409 (subtarefas abertas), 401 (botão vencido)...: o servidor manda o motivo em "detail".
            InputStream es = c.getErrorStream();
            if (es != null) {
                // readAllBytes só existe a partir do Android 13: leitura manual para valer em qualquer versão.
                java.io.ByteArrayOutputStream buf = new java.io.ByteArrayOutputStream();
                byte[] bloco = new byte[1024];
                int n;
                while ((n = es.read(bloco)) != -1) buf.write(bloco, 0, n);
                String txt = new String(buf.toByteArray(), StandardCharsets.UTF_8);
                String detalhe = new JSONObject(txt).optString("detail", "");
                if (!detalhe.isEmpty()) return detalhe;
            }
            return "Não consegui — toque para abrir.";
        } finally {
            c.disconnect();
        }
    }

    /** Troca a notificação por um aviso de falha; tocar nele abre o app. */
    @SuppressLint("MissingPermission")
    private static void mostrarFalha(Context ctx, int id, String titulo, String texto) {
        Intent abrir = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
        PendingIntent aoTocar = PendingIntent.getActivity(
            ctx, id, abrir, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        MakimaMessagingService.garantirCanal(ctx, "kaguya");
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, "kaguya")
            .setSmallIcon(R.drawable.ic_stat_makima)
            .setContentTitle(titulo == null ? "Makima" : titulo)
            .setContentText(texto)
            .setAutoCancel(true)
            .setContentIntent(aoTocar);
        NotificationManagerCompat.from(ctx).notify(id, b.build());
    }
}
