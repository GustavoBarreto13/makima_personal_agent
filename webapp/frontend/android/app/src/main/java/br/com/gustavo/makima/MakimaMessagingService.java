package br.com.gustavo.makima;

import android.annotation.SuppressLint;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/**
 * Recebe os pushes do Firebase.
 *
 * <p>Lembretes de tarefa chegam como "só dados" (kind = task_actions): o Android NÃO desenha nada
 * sozinho, então este serviço monta a notificação com os botões Concluir / Adiar 1h / Amanhã.
 * Qualquer outra mensagem segue para o plugin do Capacitor, exatamente como antes.
 */
public class MakimaMessagingService extends MessagingService {

    /** Chaves usadas entre o serviço e o receptor dos botões. */
    static final String EXTRA_TOKEN = "token";
    static final String EXTRA_ACTION = "action";
    static final String EXTRA_NOTIFICATION_ID = "notification_id";
    static final String EXTRA_TITLE = "title";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        Map<String, String> dados = message.getData();
        if ("task_actions".equals(dados.get("kind"))) {
            mostrarComBotoes(dados);
            return;
        }
        super.onMessageReceived(message);
    }

    /** Desenha a notificação da tarefa com os botões pedidos pelo servidor. */
    @SuppressLint("MissingPermission") // sem a permissão (Android 13+) o aviso é simplesmente ignorado
    private void mostrarComBotoes(Map<String, String> dados) {
        Context ctx = getApplicationContext();
        String canal = valor(dados, "channel_id", "kaguya");
        String titulo = valor(dados, "title", "Makima");
        String texto = valor(dados, "body", "");
        String token = valor(dados, "token", "");
        String link = valor(dados, "link", "makima://kaguya");
        int id = idDaTarefa(dados);

        garantirCanal(ctx, canal);

        // Tocar no corpo da notificação abre a tarefa (deep link tratado pelo NativeBridge).
        Intent abrir = new Intent(Intent.ACTION_VIEW, Uri.parse(link));
        abrir.setPackage(ctx.getPackageName());
        abrir.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent aoTocar = PendingIntent.getActivity(
            ctx, id, abrir, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, canal)
            .setSmallIcon(R.drawable.ic_stat_makima)
            .setContentTitle(titulo)
            .setContentText(texto)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(aoTocar);
        if ("1".equals(dados.get("private"))) {
            b.setVisibility(NotificationCompat.VISIBILITY_PRIVATE);
        }

        String[] acoes = valor(dados, "actions", "").split(",");
        for (int i = 0; i < acoes.length; i++) {
            String rotulo = rotulo(acoes[i]);
            if (rotulo == null || token.isEmpty()) continue;
            Intent it = new Intent(ctx, PushActionReceiver.class);
            it.putExtra(EXTRA_TOKEN, token);
            it.putExtra(EXTRA_ACTION, acoes[i]);
            it.putExtra(EXTRA_NOTIFICATION_ID, id);
            it.putExtra(EXTRA_TITLE, titulo);
            // requestCode único por tarefa e botão: senão o Android reaproveitaria o PendingIntent de outra tarefa.
            PendingIntent pi = PendingIntent.getBroadcast(
                ctx, id * 10 + i, it, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            b.addAction(0, rotulo, pi);
        }

        NotificationManagerCompat.from(ctx).notify(id, b.build());
    }

    /** Texto do botão; {@code null} para ação desconhecida (o app ignora). */
    private static String rotulo(String acao) {
        switch (acao) {
            case "complete": return "Concluir";
            case "snooze_1h": return "Adiar 1h";
            case "tomorrow": return "Amanhã";
            default: return null;
        }
    }

    /** Id estável por tarefa: um novo aviso da mesma tarefa substitui o anterior em vez de empilhar. */
    private static int idDaTarefa(Map<String, String> dados) {
        try {
            return Integer.parseInt(valor(dados, "task_id", "0"));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    /** O JS cria os canais ao iniciar o push; se o aparelho recebeu antes disso, cria o canal aqui. */
    static void garantirCanal(Context ctx, String canal) {
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm != null && nm.getNotificationChannel(canal) == null) {
            nm.createNotificationChannel(
                new NotificationChannel(canal, canal, NotificationManager.IMPORTANCE_HIGH));
        }
    }

    private static String valor(Map<String, String> dados, String chave, String padrao) {
        String v = dados.get(chave);
        return v == null ? padrao : v;
    }
}
