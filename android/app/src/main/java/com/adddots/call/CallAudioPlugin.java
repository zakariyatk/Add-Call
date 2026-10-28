package com.adddots.call;

import android.content.Context;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.os.Build;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Where a call's sound comes out, for the app's JavaScript (src/calls/audioRoute.ts):
 * the loudspeaker, or the earpiece (a headset or Bluetooth device when one is connected).
 */
@CapacitorPlugin(name = "CallAudio")
public class CallAudioPlugin extends Plugin {

    private AudioManager audio() {
        return (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
    }

    /** { speaker: boolean } — puts the phone in call mode and routes to the loudspeaker or the earpiece. */
    @PluginMethod
    public void setSpeaker(PluginCall call) {
        boolean speaker = call.getBoolean("speaker", false);
        AudioManager audio = audio();
        audio.setMode(AudioManager.MODE_IN_COMMUNICATION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (speaker) {
                for (AudioDeviceInfo device : audio.getAvailableCommunicationDevices()) {
                    if (device.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) {
                        audio.setCommunicationDevice(device);
                        break;
                    }
                }
            } else {
                audio.clearCommunicationDevice();
            }
        } else {
            audio.setSpeakerphoneOn(speaker);
        }
        call.resolve();
    }

    /** The call ended: back to normal sound. */
    @PluginMethod
    public void reset(PluginCall call) {
        AudioManager audio = audio();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) audio.clearCommunicationDevice();
        else audio.setSpeakerphoneOn(false);
        audio.setMode(AudioManager.MODE_NORMAL);
        call.resolve();
    }
}
