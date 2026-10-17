package com.adddots.call;

import androidx.annotation.NonNull;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/**
 * Receives the call-push Edge Function's Firebase messages, even when the app
 * is closed. While the app is on screen it rings and shows messages itself,
 * so incoming calls and messages are left to it then.
 */
public class CallMessagingService extends FirebaseMessagingService {

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        Map<String, String> data = message.getData();
        String type = data.get("type");
        if (type == null) return;
        switch (type) {
            case "incoming":
                if (!MainActivity.isInFront()) CallNotifications.showIncoming(this, data);
                break;
            case "missed":
                CallNotifications.showMissed(this, data);
                break;
            case "message":
                if (!MainActivity.isInFront()) CallNotifications.showMessage(this, data);
                break;
            default:
                break;
        }
    }

    @Override
    public void onNewToken(@NonNull String token) {
        // The app saves it for the signed-in account the next time it starts.
        CallPushPlugin.tokenChanged(token);
    }
}
