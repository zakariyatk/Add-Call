import type { ReactNode } from 'react';
import type { Session } from '../auth/session';
import { brand } from '../branding/brand.config';
import { Icon } from './Icon';
import { Lockup } from './Logo';
import { NAV, type ViewId } from './nav';
import { Avatar } from './ui';


export function AppShell({
  view,
  onNavigate,
  session,
  onSignOut,
  missedCount,
  children,
}: {
  view: ViewId;
  onNavigate: (v: ViewId) => void;
  session: Session;
  onSignOut: () => void;
  missedCount: number;
  children: ReactNode;
}) {
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
          <Icon name={item.icon} size={variant === 'tab' ? 22 : 19} />
          {item.id === 'recents' && missedCount > 0 && (
            <span className="badge" aria-label={`${missedCount} missed`}>
              {missedCount}
            </span>
          )}
        </span>
        <span className="nav-label">{item.label}</span>
      </a>
    ));

  return (
    <div className="shell">
      <aside className="sidebar">
        <a href="#/recents" className="sidebar-brand" aria-label={`${brand.name} home`} onClick={(e) => (e.preventDefault(), onNavigate('recents'))}>
          <Lockup size={32} />
        </a>
        <nav aria-label="Main">{navItems('side')}</nav>
        <div className="sidebar-user">
          <Avatar name={session.displayName} size={34} />
          <span className="sidebar-user-text">
            <span className="sidebar-user-name">{session.displayName}</span>
            <span className="sidebar-user-email">{session.email}</span>
          </span>
          <button type="button" className="icon-btn" onClick={onSignOut} aria-label="Sign out" title="Sign out">
            <Icon name="logout" size={18} />
          </button>
        </div>
      </aside>

      <header className="topbar">
        <Lockup size={28} />
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
