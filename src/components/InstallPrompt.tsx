import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { brand } from '../branding/brand.config';
import { installMode, promptInstall, subscribeInstall } from '../lib/install';
import { storageKey } from '../lib/storage';
import { Icon } from './Icon';
import { LogoMark } from './Logo';

/** "Not now" hides the popup until the site is opened again (a new tab or visit). */
const DISMISSED = storageKey('installDismissed');
const wasDismissed = () => {
  try {
    return sessionStorage.getItem(DISMISSED) === '1';
  } catch {
    return false;
  }
};

/** Asks people to install the app each time the website opens, until they do. */
export function InstallPrompt() {
  const mode = useSyncExternalStore(subscribeInstall, installMode, () => 'none' as const);
  const [dismissed, setDismissed] = useState(wasDismissed);
  const [ready, setReady] = useState(false);
  const installRef = useRef<HTMLButtonElement>(null);
  const open = mode !== 'none' && !dismissed && ready;

  // A short pause so the popup doesn't flash in before the page has drawn.
  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), 800);
    return () => window.clearTimeout(id);
  }, []);

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISSED, '1');
    } catch {
      /* private mode: it just shows again next time */
    }
  };

  useEffect(() => {
    if (!open) return;
    installRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismiss();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div className="install-backdrop" onClick={(e) => e.target === e.currentTarget && dismiss()}>
      <div className="install-sheet" role="dialog" aria-modal="true" aria-labelledby="install-title" aria-describedby="install-text">
        <div className="install-head">
          <LogoMark size={52} />
          <div className="install-head-text">
            <h2 id="install-title">Install {brand.name}</h2>
            <p className="muted">{location.host || brand.name}</p>
          </div>
          <button type="button" className="icon-btn" onClick={dismiss} aria-label="Close">
            <Icon name="close" size={20} />
          </button>
        </div>

        <p id="install-text" className="install-text">
          Open {brand.name} from your home screen like a regular app: full screen, quicker to reach, with call and message
          notifications.
        </p>

        {mode === 'ios' ? (
          <>
            <ol className="install-steps">
              <li>
                <span className="install-step-icon">
                  <Icon name="share" size={20} />
                </span>
                <span>
                  Tap <strong>Share</strong> in the browser toolbar
                </span>
              </li>
              <li>
                <span className="install-step-icon">
                  <Icon name="plusSquare" size={20} />
                </span>
                <span>
                  Choose <strong>Add to Home Screen</strong>
                </span>
              </li>
            </ol>
            <button ref={installRef} type="button" className="btn btn-primary btn-block" onClick={dismiss}>
              Got it
            </button>
          </>
        ) : (
          <div className="install-actions">
            <button type="button" className="btn btn-secondary" onClick={dismiss}>
              Not now
            </button>
            <button ref={installRef} type="button" className="btn btn-primary" onClick={() => void promptInstall()}>
              <Icon name="download" size={18} />
              Install
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
