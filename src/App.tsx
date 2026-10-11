import { useCallback, useEffect, useMemo, useState } from 'react';
import { authApi, takeAuthError, takeResetToken, type Session } from './auth/api';
import { brand } from './branding/brand.config';
import { isActive } from './calls/callMachine';
import { addToHistory, loadHistory } from './calls/history';
import type { CallRecord, Peer } from './calls/types';
import { useCalling } from './calls/useCalling';
import { AppShell } from './components/AppShell';
import { LogoMark } from './components/Logo';
import { NAV, type ViewId } from './components/nav';
import { browserStore, storageKey } from './lib/storage';
import { applyTheme, loadSettings, saveSettings, type Settings } from './settings';
import { CallScreen } from './views/CallScreen';
import { LoginScreen } from './views/LoginScreen';
import { PeopleView } from './views/PeopleView';
import { RecentsView } from './views/RecentsView';
import { ResetPasswordScreen } from './views/ResetPasswordScreen';
import { SettingsView } from './views/SettingsView';

const store = browserStore();
const seenKey = (email: string) => storageKey(`recentsSeen.${email}`);

const viewFromHash = (): ViewId => {
  const id = window.location.hash.replace(/^#\/?/, '');
  return NAV.some((n) => n.id === id) ? (id as ViewId) : 'recents';
};

export default function App() {
  /** undefined while we ask the server whether a session exists. */
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [signedOutNotice, setSignedOutNotice] = useState<string | null>(null);
  const [authError] = useState(takeAuthError);
  const [resetToken, setResetToken] = useState(takeResetToken);
  const [settings, setSettings] = useState<Settings>(() => loadSettings(store));
  const [view, setView] = useState<ViewId>(viewFromHash);
  const [history, setHistory] = useState<CallRecord[]>([]);
  const [recentsSeen, setRecentsSeen] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const enter = useCallback((s: Session | null) => {
    setSession(s);
    setHistory(s ? loadHistory(store, s.email) : []);
    setRecentsSeen(s ? Number(store.getItem(seenKey(s.email)) ?? 0) : 0);
  }, []);

  useEffect(() => {
    authApi.me().then(enter, () => {
      setSignedOutNotice(`Can't reach ${brand.name} right now.`);
      enter(null);
    });
  }, [enter]);

  useEffect(() => {
    applyTheme(settings.theme);
    saveSettings(store, settings);
  }, [settings]);

  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const addRecord = useCallback(
    (r: CallRecord) => {
      if (session) setHistory((h) => addToHistory(store, session.email, h, r));
    },
    [session],
  );
  const prefs = useMemo(() => ({ noiseSuppression: settings.noiseSuppression, ringSound: settings.ringSound }), [settings]);
  const calling = useCalling(session ?? null, prefs, addRecord);
  const { call, controller, connection } = calling;

  // The server ended this session (signed out elsewhere, password changed).
  useEffect(() => {
    if (connection !== 'signed-out') return;
    setSignedOutNotice('You were signed out. Sign in again to continue.');
    enter(null);
  }, [connection, enter]);

  // If the call connection drops, check the session is still valid.
  useEffect(() => {
    if (connection !== 'offline' || !session) return;
    authApi.me().then((s) => {
      if (!s) {
        setSignedOutNotice('Your session expired. Sign in again to continue.');
        enter(null);
      }
    }, () => {});
  }, [connection, session, enter]);

  // Opening Recents clears the missed-call badge.
  useEffect(() => {
    if (view !== 'recents' || !session) return;
    const t = Date.now();
    store.setItem(seenKey(session.email), String(t));
    setRecentsSeen(t);
  }, [view, session, history]);

  // Relative times ("5m ago") refresh every 30s; the in-call timer every second.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), call.status === 'connected' ? 1000 : 30_000);
    return () => window.clearInterval(id);
  }, [call.status]);

  const navigate = (v: ViewId) => {
    setView(v);
    if (window.location.hash !== `#/${v}`) window.history.pushState(null, '', `#/${v}`);
  };

  const missedCount = useMemo(() => history.filter((r) => r.direction === 'missed' && r.at > recentsSeen).length, [history, recentsSeen]);
  const label = NAV.find((n) => n.id === view)?.label;

  useEffect(() => {
    document.title = !session
      ? `Sign in · ${brand.name}`
      : call.status === 'incoming'
        ? `Incoming call · ${brand.name}`
        : isActive(call.status)
          ? `In call · ${brand.name}`
          : `${label} · ${brand.name}`;
  }, [session, label, call.status]);

  // Warn before closing the tab mid-call.
  useEffect(() => {
    if (!isActive(call.status)) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [call.status]);

  // A reset link wins over everything else, signed in or not.
  if (resetToken)
    return (
      <ResetPasswordScreen
        token={resetToken}
        onDone={(s) => {
          setResetToken(null);
          setSignedOutNotice(null);
          navigate('recents');
          enter(s);
        }}
        onCancel={() => setResetToken(null)}
      />
    );

  if (session === undefined)
    return (
      <div className="splash" aria-busy="true" aria-label={`Loading ${brand.name}`}>
        <LogoMark size={56} />
      </div>
    );

  if (!session)
    return (
      <LoginScreen
        notice={signedOutNotice}
        error={authError}
        onSignedIn={(s) => {
          setSignedOutNotice(null);
          enter(s);
        }}
      />
    );

  const startCall = (peer: Peer, video?: boolean) => void controller.dial(peer, video ?? settings.startWithVideo);
  const signOut = async () => {
    controller.disconnect();
    await authApi.signOut().catch(() => {});
    setSignedOutNotice(null);
    enter(null);
  };

  return (
    <>
      <AppShell view={view} onNavigate={navigate} session={session} onSignOut={signOut} missedCount={missedCount} connection={connection}>
        {calling.notice && (
          <div className="notice" role="status">
            <span>{calling.notice}</span>
            <button type="button" className="icon-btn" onClick={controller.dismissNotice} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}
        {view === 'recents' && <RecentsView recents={history} now={now} onCall={startCall} />}
        {view === 'people' && <PeopleView presence={calling.presence} history={history} connection={connection} onCall={startCall} />}
        {view === 'settings' && (
          <SettingsView session={session} settings={settings} onChange={setSettings} onSignOut={signOut} connection={connection} />
        )}
      </AppShell>
      {call.status !== 'idle' && (
        <CallScreen
          state={call}
          now={now}
          localStream={calling.localStream}
          remoteStream={calling.remoteStream}
          onAccept={(video) => void controller.accept(video)}
          onDecline={controller.decline}
          onHangUp={controller.hangUp}
          onToggleMute={controller.toggleMute}
          onToggleVideo={() => void controller.toggleVideo()}
        />
      )}
    </>
  );
}
