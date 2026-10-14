import { useState, type ReactNode } from 'react';
import { useAvatarUrl } from '../profile/avatars';
import { initials } from '../lib/format';
import { Icon } from './Icon';

/** Profile picture when the person has one (looked up by email), otherwise initials. */
export function Avatar({ name, email, size = 40 }: { name: string | null; email?: string | null; size?: number }) {
  const src = useAvatarUrl(email);
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden="true">
      {src && failed !== src ? (
        <img src={src} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setFailed(src)} />
      ) : name ? (
        initials(name)
      ) : (
        <Icon name="users" size={size * 0.45} />
      )}
    </span>
  );
}

export function CallButton({
  label,
  onClick,
  size = 'md',
  disabled,
}: {
  label: string;
  onClick: () => void;
  size?: 'md' | 'lg';
  disabled?: boolean;
}) {
  return (
    <button type="button" className={`call-btn call-btn-${size}`} onClick={onClick} aria-label={label} title={label} disabled={disabled}>
      <Icon name="phone" size={size === 'lg' ? 26 : 18} />
    </button>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="setting-row">
      <span>
        <span className="setting-label">{label}</span>
        {hint && <span className="setting-hint">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      {children}
    </header>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}
