import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Session } from '../auth/session';
import { CallController, type CallPreferences } from './CallController';
import type { CallRecord } from './types';

/** One CallController per app, connected while a user is signed in. */
export function useCalling(session: Session | null, prefs: CallPreferences, onRecord: (r: CallRecord) => void) {
  // The controller is created once; route records to the latest callback.
  const recordRef = useRef(onRecord);
  useEffect(() => {
    recordRef.current = onRecord;
  }, [onRecord]);
  const [controller] = useState(() => new CallController((r) => recordRef.current(r)));
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);

  useEffect(() => {
    if (!session) return;
    controller.connect({ email: session.email, name: session.displayName });
    return () => controller.disconnect();
  }, [controller, session]);

  useEffect(() => controller.setPreferences(prefs), [controller, prefs]);

  return { ...snapshot, controller };
}
