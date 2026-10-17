package com.adddots.call;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /** The app is on screen: it rings and shows messages itself. */
    private static volatile boolean inFront;

    static boolean isInFront() {
        return inFront;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CallPushPlugin.class);
        registerPlugin(GoogleAuthPlugin.class);
        super.onCreate(savedInstanceState);
        handleCallIntent(getIntent());
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleCallIntent(intent);
    }

    @Override
    public void onResume() {
        super.onResume();
        inFront = true;
    }

    @Override
    public void onPause() {
        super.onPause();
        inFront = false;
    }

    @Override
    public void onStop() {
        super.onStop();
        showOverLockScreen(false);
    }

    /** An incoming call opened the app: show it over the lock screen and let the app ring instead. */
    private void handleCallIntent(Intent intent) {
        String action = intent == null ? null : intent.getAction();
        if (CallNotifications.ACTION_SHOW_CALL.equals(action) || CallNotifications.ACTION_ANSWER.equals(action)) {
            showOverLockScreen(true);
            CallNotifications.cancelCall(this, intent.getStringExtra(CallNotifications.EXTRA_CALL_ID));
        }
        CallPushPlugin.handleIntent(intent);
    }

    private void showOverLockScreen(boolean show) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(show);
            setTurnScreenOn(show);
        } else {
            int flags = WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON;
            if (show) getWindow().addFlags(flags);
            else getWindow().clearFlags(flags);
        }
    }
}
