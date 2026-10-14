import type { IconName } from './Icon';

export type ViewId = 'chats' | 'recents' | 'people' | 'settings';

export const NAV: { id: ViewId; label: string; icon: IconName }[] = [
  { id: 'chats', label: 'Chats', icon: 'message' },
  { id: 'recents', label: 'Calls', icon: 'clock' },
  { id: 'people', label: 'People', icon: 'users' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];
