import { useCallback, useEffect, useMemo, useState } from 'react';
import { createAuth, type Session } from './auth/session';
import { brand } from './branding/brand.config';
import { SAMPLE_CONTACTS, sampleRecents } from './calls/sampleData';
import type { CallRecord, Peer } from './calls/types';
import { useSimulatedCall } from './calls/useSimulatedCall';
import { AppShell } from './components/AppShell';
import { NAV, type ViewId } from './components/nav';
import { browserStore } from './lib/storage';
import { applyTheme, loadSettings, saveSettings, type Settings } from './settings';
import { CallScreen } from './views/CallScreen';
import { ContactsView } from './views/ContactsView';
import { KeypadView } from './views/KeypadView';
import { LoginScreen } from './views/LoginScreen';
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
  const [recents, setRecents] = useState<CallRecord[]>(() => sampleRecents(Date.now()));
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

  // Keep relative times ("5m ago") fresh.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const navigate = (v: ViewId) => {
    setView(v);
    if (window.location.hash !== `#/${v}`) window.history.pushState(null, '', `#/${v}`);
  };

  const addRecord = useCallback((r: CallRecord) => {
    setRecents((rs) => (rs.some((x) => x.id === r.id) ? rs : [r, ...rs]));
    setNow(Date.now());
  }, []);
  const call = useSimulatedCall(addRecord);
  const startCall = (peer: Peer, video?: boolean) => call.start(peer, video ?? settings.startWithVideo);

  const missedCount = useMemo(() => recents.filter((r) => r.direction === 'missed').length, [recents]);
  const label = NAV.find((n) => n.id === view)?.label;

  useEffect(() => {
    document.title = !session ? `Sign in · ${brand.name}` : call.state.peer ? `In call · ${brand.name}` : `${label} · ${brand.name}`;
  }, [session, label, call.state.peer]);

  if (!session) return <LoginScreen auth={auth} onSignedIn={setSession} />;

  const signOut = () => {
    if (call.state.status !== 'idle') call.hangUp();
    auth.signOut();
    setSession(null);
  };

  return (
    <>
      <AppShell view={view} onNavigate={navigate} session={session} onSignOut={signOut} missedCount={missedCount}>
        {view === 'recents' && <RecentsView recents={recents} now={now} onCall={startCall} />}
        {view === 'contacts' && <ContactsView contacts={SAMPLE_CONTACTS} onCall={startCall} />}
        {view === 'keypad' && <KeypadView contacts={SAMPLE_CONTACTS} onCall={startCall} />}
        {view === 'settings' && <SettingsView session={session} settings={settings} onChange={setSettings} onSignOut={signOut} />}
      </AppShell>
      {call.state.status !== 'idle' && <CallScreen state={call.state} now={call.now} onToggle={call.toggle} onHangUp={call.hangUp} />}
    </>
  );
}
