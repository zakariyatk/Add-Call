import { registerPlugin } from '@capacitor/core';
import { isNativeApp } from '../lib/platform';

/*
 * Loudspeaker or earpiece during a call. Only the Android app can choose
 * (CallAudioPlugin); browsers give a web page no way to pick the earpiece,
 * so the website has no Speaker button.
 */

interface CallAudioPlugin {
  setSpeaker(options: { speaker: boolean }): Promise<void>;
  reset(): Promise<void>;
}

const CallAudio = registerPlugin<CallAudioPlugin>('CallAudio');

export const canChooseSpeaker = isNativeApp;

export function setSpeaker(speaker: boolean) {
  if (canChooseSpeaker) void CallAudio.setSpeaker({ speaker }).catch((err) => console.warn('[call] could not switch speaker', err));
}

export function resetCallAudio() {
  if (canChooseSpeaker) void CallAudio.reset().catch(() => {});
}
