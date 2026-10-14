import type { IconName } from './Icon';

export type ViewId = 'recents' | 'people' | 'settings';

export const NAV: { id: ViewId; label: string; icon: IconName }[] = [
  { id: 'recents', label: 'Calls', icon: 'phone' },
  { id: 'people', label: 'Contacts', icon: 'users' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];
