import { useCallback, useEffect, useMemo, useState } from 'react';
import { createAuth, type Session } from './auth/session';
import { brand } from './branding/brand.config';
import { isActive } from './calls/callMachine';
import { addToHistory, loadHistory } from './calls/history';
import type { CallRecord, Peer } from './calls/types';
import { useCalling } from './calls/useCalling';
import { AppShell } from './components/AppShell';
import { NAV, type ViewId } from './components/nav';
import { browserStore } from './lib/storage';
import { applyTheme, loadSettings, saveSettings, type Settings } from './settings';
import { CallScreen } from './views/CallScreen';
import { LoginScreen } from './views/LoginScreen';
import { PeopleView } from './views/PeopleView';
import { RecentsView } from './views/RecentsView';
import { SettingsView } from './views/SettingsView';

const store = browserStore();
const auth = createAuth(store);

const viewFromHash = (): ViewId => {
  const id = window.location.hash.replace(/^#\/?/, '');
  return NAV.some((n) => n.id === id) ? (id as ViewId) : 'recents';
};

export default function App() {
  const [session, setSession] = useState<Session | null>(() => auth.current());
  const [settings, setSettings] = useState<Settings>(() => loadSettings(store));
  const [view, setView] = useState<ViewId>(viewFromHash);
  const [history, setHistory] = useState<CallRecord[]>(() => (session ? loadHistory(store, session.email) : []));
  const [now, setNow] = useState(() => Date.now());

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
  const calling = useCalling(session, prefs, addRecord);
  const { call, controller } = calling;
  const inCall = call.status !== 'idle';

  // Relative times ("5m ago") refresh every 30s; the in-call timer every second.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), call.status === 'connected' ? 1000 : 30_000);
    return () => window.clearInterval(id);
  }, [call.status]);

  const navigate = (v: ViewId) => {
    setView(v);
    if (window.location.hash !== `#/${v}`) window.history.pushState(null, '', `#/${v}`);
  };

  const missedCount = useMemo(() => history.filter((r) => r.direction === 'missed' && r.at > (session?.signedInAt ?? 0)).length, [history, session]);
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

  if (!session)
    return (
      <LoginScreen
        auth={auth}
        onSignedIn={(s) => {
          setHistory(loadHistory(store, s.email));
          setSession(s);
        }}
      />
    );

  const startCall = (peer: Peer, video?: boolean) => void controller.dial(peer, video ?? settings.startWithVideo);
  const signOut = () => {
    controller.disconnect();
    auth.signOut();
    setSession(null);
    setHistory([]);
  };

  return (
    <>
      <AppShell
        view={view}
        onNavigate={navigate}
        session={session}
        onSignOut={signOut}
        missedCount={missedCount}
        connection={calling.connection}
      >
        {calling.notice && (
          <div className="notice" role="status">
            <span>{calling.notice}</span>
            <button type="button" className="icon-btn" onClick={controller.dismissNotice} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}
        {view === 'recents' && <RecentsView recents={history} now={now} onCall={startCall} />}
        {view === 'people' && <PeopleView presence={calling.presence} history={history} connection={calling.connection} onCall={startCall} />}
        {view === 'settings' && (
          <SettingsView session={session} settings={settings} onChange={setSettings} onSignOut={signOut} connection={calling.connection} />
        )}
      </AppShell>
      {inCall && (
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
