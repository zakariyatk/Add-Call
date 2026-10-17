package com.adddots.call;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * Decline on the incoming-call notification: stops the ringing and ends the
 * call without opening the app. Like the website's notification, it proves
 * itself to the call-push function with the per-call token that came with
 * the push (there's no session here).
 */
public class CallActionReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!CallNotifications.ACTION_DECLINE.equals(intent.getAction())) return;
        String callId = intent.getStringExtra(CallNotifications.EXTRA_CALL_ID);
        String token = intent.getStringExtra(CallNotifications.EXTRA_DECLINE_TOKEN);
        String url = intent.getStringExtra(CallNotifications.EXTRA_DECLINE_URL);
        CallNotifications.cancelCall(context, callId);
        if (callId == null || token == null || url == null || !url.startsWith("https://")) return;

        PendingResult pending = goAsync();
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                JSONObject body = new JSONObject().put("action", "decline").put("callId", callId).put("token", token);
                connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setRequestMethod("POST");
                connection.setConnectTimeout(8_000);
                connection.setReadTimeout(8_000);
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                try (OutputStream out = connection.getOutputStream()) {
                    out.write(body.toString().getBytes(StandardCharsets.UTF_8));
                }
                connection.getResponseCode();
            } catch (Exception e) {
                // Offline: the caller's ring times out on its own.
            } finally {
                if (connection != null) connection.disconnect();
                pending.finish();
            }
        }).start();
    }
}
