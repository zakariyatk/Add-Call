package com.adddots.call;

import android.Manifest;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;

/**
 * Call notifications for the app's JavaScript (src/calls/nativePush.ts):
 * the phone's Firebase token, the notification permission, and the
 * notification buttons that opened the app ("action" events).
 */
@CapacitorPlugin(
    name = "CallPush",
    permissions = {
        @Permission(alias = CallPushPlugin.NOTIFICATIONS, strings = { Manifest.permission.POST_NOTIFICATIONS }),
        @Permission(alias = CallPushPlugin.CALLS, strings = { Manifest.permission.RECORD_AUDIO, Manifest.permission.CAMERA }),
    }
)
public class CallPushPlugin extends Plugin {

    static final String NOTIFICATIONS = "notifications";
    /** Microphone and camera, asked with notifications so a call never stops for a permission prompt. */
    static final String CALLS = "calls";

    private static CallPushPlugin instance;
    /** A notification button that opened the app before the plugin loaded. */
    private static JSObject pendingAction;

    @Override
    public void load() {
        instance = this;
        CallNotifications.createChannels(getContext());
        if (pendingAction != null) {
            notifyListeners("action", pendingAction, true);
            pendingAction = null;
        }
    }

    /** Whether Firebase is set up (google-services.json was there when the app was built). */
    private boolean firebaseReady() {
        return !FirebaseApp.getApps(getContext()).isEmpty();
    }

    private boolean notificationsAllowed() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) return getPermissionState(NOTIFICATIONS) == PermissionState.GRANTED;
        return NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
    }

    private boolean canUseFullScreen() {
        if (Build.VERSION.SDK_INT < 34) return true;
        NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        return manager.canUseFullScreenIntent();
    }

    /** { available, permission: 'granted' | 'denied' | 'prompt', fullScreen } */
    @PluginMethod
    public void status(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", firebaseReady());
        String permission;
        if (notificationsAllowed()) permission = "granted";
        else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && getPermissionState(NOTIFICATIONS) != PermissionState.DENIED) permission = "prompt";
        else permission = "denied";
        result.put("permission", permission);
        result.put("fullScreen", canUseFullScreen());
        call.resolve(result);
    }

    /** Resolves { token }. With { prompt: true }, asks for the notification permission first if needed. */
    @PluginMethod
    public void register(PluginCall call) {
        if (!firebaseReady()) {
            call.reject("Call notifications aren't set up in this version of the app.", "unavailable");
            return;
        }
        boolean prompt = call.getBoolean("prompt", false);
        boolean askNotifications = !notificationsAllowed() && prompt && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU;
        boolean askCalls = prompt && getPermissionState(CALLS) != PermissionState.GRANTED;
        if (askNotifications && askCalls) requestPermissionForAliases(new String[] { NOTIFICATIONS, CALLS }, call, "afterPermission");
        else if (askNotifications) requestPermissionForAlias(NOTIFICATIONS, call, "afterPermission");
        else if (askCalls) requestPermissionForAlias(CALLS, call, "afterPermission");
        else afterPermission(call);
    }

    @PermissionCallback
    private void afterPermission(PluginCall call) {
        if (notificationsAllowed()) fetchToken(call);
        else call.reject("Notifications are turned off for this app.", "denied");
    }

    private void fetchToken(PluginCall call) {
        FirebaseMessaging.getInstance()
            .getToken()
            .addOnCompleteListener(task -> {
                if (!task.isSuccessful() || task.getResult() == null) {
                    call.reject("Could not turn on call notifications. Check your connection and try again.");
                    return;
                }
                JSObject result = new JSObject();
                result.put("token", task.getResult());
                call.resolve(result);
            });
    }

    /** Stops this phone receiving calls (the token is deleted; a new one comes with the next register). */
    @PluginMethod
    public void unregister(PluginCall call) {
        if (!firebaseReady()) {
            call.resolve();
            return;
        }
        FirebaseMessaging.getInstance().deleteToken().addOnCompleteListener(task -> call.resolve());
    }

    /** Stops an incoming call's notification ringing (the call was picked up or ended in the app). */
    @PluginMethod
    public void cancelCall(PluginCall call) {
        CallNotifications.cancelCall(getContext(), call.getString("callId"));
        call.resolve();
    }

    /** Android 14+: where people allow the incoming-call screen to fill a locked phone. */
    @PluginMethod
    public void openFullScreenSettings(PluginCall call) {
        Intent intent = Build.VERSION.SDK_INT >= 34
            ? new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + getContext().getPackageName()))
            : new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    /** Firebase replaced this phone's token: the app saves the new one. */
    static void tokenChanged(String token) {
        CallPushPlugin plugin = instance;
        if (plugin == null) return; // saved at the next start instead
        JSObject data = new JSObject();
        data.put("token", token);
        plugin.notifyListeners("token", data);
    }

    /** A notification (or one of its buttons) opened the app. */
    static void handleIntent(Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        String type;
        switch (intent.getAction()) {
            case CallNotifications.ACTION_ANSWER:
                type = "answer";
                break;
            case CallNotifications.ACTION_SHOW_CALL:
                type = "show";
                break;
            case CallNotifications.ACTION_OPEN_CHAT:
                type = "open-chat";
                break;
            default:
                return;
        }
        JSObject action = new JSObject();
        action.put("type", type);
        String callId = intent.getStringExtra(CallNotifications.EXTRA_CALL_ID);
        String conversationId = intent.getStringExtra(CallNotifications.EXTRA_CONVERSATION_ID);
        if (callId != null) action.put("callId", callId);
        if (conversationId != null) action.put("conversationId", conversationId);
        // Handled once: rotating the screen re-delivers the same intent.
        intent.setAction(Intent.ACTION_MAIN);
        CallPushPlugin plugin = instance;
        if (plugin != null) plugin.notifyListeners("action", action, true);
        else pendingAction = action;
    }
}
