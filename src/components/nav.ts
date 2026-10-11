import type { IconName } from './Icon';

export type ViewId = 'recents' | 'people' | 'settings';

export const NAV: { id: ViewId; label: string; icon: IconName }[] = [
  { id: 'recents', label: 'Recents', icon: 'clock' },
  { id: 'people', label: 'People', icon: 'users' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];
