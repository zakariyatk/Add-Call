package com.adddots.call;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;
import java.util.Arrays;
import java.util.Map;

/**
 * The system notifications the app shows when it isn't open: an incoming call
 * (full screen on a locked phone, ringing until answered, declined or 40s
 * pass), a missed call, and a new message. Sent by the call-push Edge
 * Function through Firebase (see CallMessagingService).
 */
final class CallNotifications {

    static final String ACTION_SHOW_CALL = "com.adddots.call.SHOW_CALL";
    static final String ACTION_ANSWER = "com.adddots.call.ANSWER";
    static final String ACTION_DECLINE = "com.adddots.call.DECLINE";
    static final String ACTION_OPEN_CHAT = "com.adddots.call.OPEN_CHAT";
    static final String EXTRA_CALL_ID = "callId";
    static final String EXTRA_CONVERSATION_ID = "conversationId";
    static final String EXTRA_DECLINE_TOKEN = "declineToken";
    static final String EXTRA_DECLINE_URL = "declineUrl";

    private static final String CHANNEL_CALLS = "calls";
    private static final String CHANNEL_MISSED = "missed_calls";
    private static final String CHANNEL_MESSAGES = "messages";
    private static final String TAG_CALL = "call";
    private static final String TAG_CHAT = "chat";
    /** Matches the database's ring_timeout(). */
    private static final long RING_MS = 40_000;

    private CallNotifications() {}

    static void createChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel calls = new NotificationChannel(CHANNEL_CALLS, "Incoming calls", NotificationManager.IMPORTANCE_HIGH);
        calls.setDescription("Rings when someone calls you.");
        calls.setSound(
            RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
            new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
        );
        calls.enableVibration(true);
        calls.setVibrationPattern(new long[] { 0, 1000, 1000 });
        calls.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);

        NotificationChannel missed = new NotificationChannel(CHANNEL_MISSED, "Missed calls", NotificationManager.IMPORTANCE_DEFAULT);
        NotificationChannel messages = new NotificationChannel(CHANNEL_MESSAGES, "Messages", NotificationManager.IMPORTANCE_HIGH);
        messages.setDescription("New messages while the app is closed.");

        manager(context).createNotificationChannels(Arrays.asList(calls, missed, messages));
    }

    static void showIncoming(Context context, Map<String, String> data) {
        String callId = data.get("callId");
        if (callId == null) return;
        long at = parseLong(data.get("at"), System.currentTimeMillis());
        long left = RING_MS - (System.currentTimeMillis() - at);
        if (left < 2_000) return; // it has stopped ringing already
        boolean video = "true".equals(data.get("video"));
        String name = nameOf(data);
        createChannels(context);

        PendingIntent show = openApp(context, ACTION_SHOW_CALL, callId, null);
        PendingIntent answer = openApp(context, ACTION_ANSWER, callId, null);
        Intent declineIntent = new Intent(context, CallActionReceiver.class)
            .setAction(ACTION_DECLINE)
            .putExtra(EXTRA_CALL_ID, callId)
            .putExtra(EXTRA_DECLINE_TOKEN, data.get("declineToken"))
            .putExtra(EXTRA_DECLINE_URL, data.get("declineUrl"));
        PendingIntent decline = PendingIntent.getBroadcast(context, requestCode(ACTION_DECLINE, callId), declineIntent, flags());

        Person caller = new Person.Builder().setName(name).setImportant(true).build();
        Notification notification = new NotificationCompat.Builder(context, CHANNEL_CALLS)
            .setSmallIcon(R.drawable.ic_stat_call)
            .setContentTitle(name)
            .setContentText(video ? "Incoming video call" : "Incoming call")
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setContentIntent(show)
            .setFullScreenIntent(show, true)
            .setTimeoutAfter(left)
            .setStyle(NotificationCompat.CallStyle.forIncomingCall(caller, decline, answer))
            .build();
        // Keep ringing (the channel's ringtone) until it's dealt with.
        notification.flags |= Notification.FLAG_INSISTENT;
        manager(context).notify(TAG_CALL, callId.hashCode(), notification);
    }

    static void showMissed(Context context, Map<String, String> data) {
        String callId = data.get("callId");
        if (callId == null) return;
        createChannels(context);
        boolean video = "true".equals(data.get("video"));
        Notification notification = new NotificationCompat.Builder(context, CHANNEL_MISSED)
            .setSmallIcon(R.drawable.ic_stat_call)
            .setContentTitle("Missed call")
            .setContentText(nameOf(data) + (video ? " tried to video call you." : " tried to call you."))
            .setCategory(NotificationCompat.CATEGORY_MISSED_CALL)
            .setAutoCancel(true)
            .setContentIntent(openApp(context, Intent.ACTION_MAIN, callId, null))
            .build();
        // Replaces the incoming call.
        manager(context).notify(TAG_CALL, callId.hashCode(), notification);
    }

    static void showMessage(Context context, Map<String, String> data) {
        String conversationId = data.get("conversationId");
        if (conversationId == null) return;
        createChannels(context);
        String preview = data.get("preview") == null ? "" : data.get("preview");
        Notification notification = new NotificationCompat.Builder(context, CHANNEL_MESSAGES)
            .setSmallIcon(R.drawable.ic_stat_call)
            .setContentTitle(nameOf(data))
            .setContentText(preview)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(preview))
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(openApp(context, ACTION_OPEN_CHAT, null, conversationId))
            .build();
        manager(context).notify(TAG_CHAT, conversationId.hashCode(), notification);
    }

    /** Stops an incoming call ringing (answered, declined, or picked up in the app). */
    static void cancelCall(Context context, String callId) {
        if (callId != null) manager(context).cancel(TAG_CALL, callId.hashCode());
    }

    private static PendingIntent openApp(Context context, String action, String callId, String conversationId) {
        Intent intent = new Intent(context, MainActivity.class)
            .setAction(action)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (callId != null) intent.putExtra(EXTRA_CALL_ID, callId);
        if (conversationId != null) intent.putExtra(EXTRA_CONVERSATION_ID, conversationId);
        String key = callId != null ? callId : conversationId;
        return PendingIntent.getActivity(context, requestCode(action, key), intent, flags());
    }

    private static int requestCode(String action, String key) {
        return (action + ":" + key).hashCode();
    }

    private static int flags() {
        return PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
    }

    private static String nameOf(Map<String, String> data) {
        String name = data.get("name");
        if (name != null && !name.isEmpty()) return name;
        String email = data.get("email");
        return email != null && !email.isEmpty() ? email : "Add Call";
    }

    private static long parseLong(String value, long fallback) {
        try {
            return value == null ? fallback : Long.parseLong(value);
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    private static NotificationManager manager(Context context) {
        return (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    }
}
