import { Capacitor } from '@capacitor/core';

/** True inside the Android / iOS app (Capacitor), false on the website. */
export const isNativeApp = Capacitor.isNativePlatform();
