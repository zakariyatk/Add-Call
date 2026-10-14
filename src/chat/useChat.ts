import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Session } from '../auth/api';
import { ChatController } from './ChatController';

/** One ChatController per app, connected while a user is signed in. */
export function useChat(session: Session | null) {
  const [controller] = useState(() => new ChatController());
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);

  useEffect(() => {
    if (!session) return;
    controller.connect({ id: session.id, email: session.email, name: session.name });
    return () => controller.disconnect();
  }, [controller, session]);

  return { ...snapshot, controller };
}
