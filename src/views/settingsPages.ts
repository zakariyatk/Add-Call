const PAGES = ['invite', 'profile', 'appearance', 'calling', 'notifications', 'blocked', 'about', 'delete'] as const;

/** The pages Settings opens into (#/settings/<page>). */
export type SettingsPage = (typeof PAGES)[number];

export const isSettingsPage = (s: string): s is SettingsPage => (PAGES as readonly string[]).includes(s);
