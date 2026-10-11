import type { IconName } from './Icon';

export type ViewId = 'recents' | 'contacts' | 'keypad' | 'settings';

export const NAV: { id: ViewId; label: string; icon: IconName }[] = [
  { id: 'recents', label: 'Recents', icon: 'clock' },
  { id: 'contacts', label: 'Contacts', icon: 'users' },
  { id: 'keypad', label: 'Keypad', icon: 'keypad' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];
