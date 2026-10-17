import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '../auth/api';
import type { ConnectionStatus } from '../calls/CallController';
import { brand } from '../branding/brand.config';
import { Icon } from './Icon';
import { Lockup } from './Logo';
import { NAV, type ViewId } from './nav';
import { Avatar } from './ui';
import { useUsername } from '../profile/avatars';
import { handle } from '../profile/username';

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  online: 'Online',
  connecting: 'Connecting…',
  offline: 'Offline',
};

/** How long a reconnect may take before it's worth mentioning (opening the app always takes a moment). */
const STATUS_GRACE_MS = 4000;

/** The connection as worth showing: 'online' until it has been down for STATUS_GRACE_MS. */
function useShownConnection(connection: ConnectionStatus): ConnectionStatus {
  const [shown, setShown] = useState<ConnectionStatus>('online');
  useEffect(() => {
    if (connection === 'online') {
      setShown('online');
      return;
    }
    const timer = setTimeout(() => setShown(connection), STATUS_GRACE_MS);
    return () => clearTimeout(timer);
  }, [connection]);
  return shown;
}

export function AppShell({
  view,
  onNavigate,
  session,
  onSignOut,
  badges,
  connection: actual,
  layout = 'page',
  children,
}: {
  view: ViewId;
  onNavigate: (v: ViewId) => void;
  session: Session;
  onSignOut: () => void;
  /** Counts shown on navigation items (missed calls, unread chats). */
  badges: Partial<Record<ViewId, number>>;
  connection: ConnectionStatus;
  /** page: centred column. split: full-width, full-height (chats). focus: a chat open full screen on phones. */
  layout?: 'page' | 'split' | 'focus';
  children: ReactNode;
}) {
  const connection = useShownConnection(actual);
  const navItems = (variant: 'side' | 'tab') =>
    NAV.map((item) => (
      <a
        key={item.id}
        href={`#/${item.id}`}
        className={`nav-item nav-item-${variant}`}
        aria-current={view === item.id ? 'page' : undefined}
        onClick={(e) => {
          e.preventDefault();
          onNavigate(item.id);
        }}
      >
        <span className="nav-icon">
          <Icon name={item.icon} size={variant === 'tab' ? 22 : 20} />
          {!!badges[item.id] && (
            <span className="badge" aria-label={item.id === 'recents' ? `${badges[item.id]} missed` : `${badges[item.id]} unread`}>
              {badges[item.id]! > 99 ? '99+' : badges[item.id]}
            </span>
          )}
        </span>
        <span className="nav-label">{item.label}</span>
      </a>
    ));

  const username = useUsername(session.email);

  return (
    <div className={`shell layout-${layout}`}>
      <aside className="sidebar">
        <a href="#/chats" className="sidebar-brand" aria-label={`${brand.name} home`} onClick={(e) => (e.preventDefault(), onNavigate('chats'))}>
          <Lockup size={32} />
        </a>
        <nav aria-label="Main">{navItems('side')}</nav>
        <div className="sidebar-user">
          <Avatar name={session.name} email={session.email} size={34} />
          <span className="sidebar-user-text">
            <span className="sidebar-user-name">{session.name}</span>
            <span className={`sidebar-user-email ${connection !== 'online' ? 'is-warning' : ''}`}>
              {connection !== 'online' ? STATUS_LABEL[connection] : handle(username, session.email)}
            </span>
          </span>
          <button type="button" className="icon-btn" onClick={onSignOut} aria-label="Sign out" title="Sign out">
            <Icon name="logout" size={18} />
          </button>
        </div>
      </aside>

      <header className="topbar">
        <Lockup size={28} />
        {/* Only shown when calls and messages can't get through. */}
        {connection !== 'online' && (
          <span className={`status-pill is-${connection}`} role="status">
            {STATUS_LABEL[connection]}
          </span>
        )}
      </header>

      <main className="content" id="main">
        {children}
      </main>

      <nav className="tabbar" aria-label="Main">
        {navItems('tab')}
      </nav>
    </div>
  );
}
