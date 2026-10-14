import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { authApi, takeAuthError, takeResetToken, takeVerifyToken, type Session } from './auth/api';
import { brand } from './branding/brand.config';
import { isActive } from './calls/callMachine';
import { addToHistory, loadHistory } from './calls/history';
import type { CallRecord, Peer } from './calls/types';
import { useCalling } from './calls/useCalling';
import { AppShell } from './components/AppShell';
import { Icon } from './components/Icon';
import { LogoMark } from './components/Logo';
import { NAV, type ViewId } from './components/nav';
import { browserStore, storageKey } from './lib/storage';
import { watchForUpdates } from './lib/updates';
import { applyTheme, loadSettings, saveSettings, type Settings } from './settings';
import { CallScreen } from './views/CallScreen';
import { LoginScreen } from './views/LoginScreen';
import { PeopleView } from './views/PeopleView';
import { RecentsView } from './views/RecentsView';
import { ResetPasswordScreen } from './views/ResetPasswordScreen';
import { VerifyEmailLink, VerifyEmailPending } from './views/VerifyEmailScreen';
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
  const [verifyToken, setVerifyToken] = useState(takeVerifyToken);
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

  /** True while this tab is signing out on purpose (so it isn't reported as "signed out elsewhere"). */
  const signingOut = useRef(false);
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    authApi.me().then(enter, () => {
      setSignedOutNotice(`Can't reach ${brand.name} right now.`);
      enter(null);
    });
    // Sign-ins and sign-outs in other tabs, emailed links, and sessions that expired.
    return authApi.onChange((s) => {
      if (s) return enter(s);
      const prev = sessionRef.current;
      if (prev && !prev.id) return; // keep a "confirm your email" screen up
      if (prev && !signingOut.current) setSignedOutNotice('You were signed out. Sign in again to continue.');
      signingOut.current = false;
      enter(null);
    });
  }, [enter]);

  // Accounts that haven't opened their emailed link can't sign in or call yet.
  const needsVerification = session?.emailVerified === false;

  useEffect(() => {
    applyTheme(settings.theme);
    saveSettings(store, settings);
  }, [settings]);

  useEffect(() => {
    const onHash = () => {
      // An emailed link pasted into an already-open tab only changes the hash.
      const verify = takeVerifyToken();
      if (verify) return setVerifyToken(verify);
      const reset = takeResetToken();
      if (reset) return setResetToken(reset);
      setView(viewFromHash());
    };
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
  const calling = useCalling(session && !needsVerification ? session : null, prefs, addRecord);
  const { call, controller, connection } = calling;

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
    document.title = resetToken
      ? `Reset password · ${brand.name}`
      : verifyToken || needsVerification
        ? `Confirm your email · ${brand.name}`
        : !session
          ? `Sign in · ${brand.name}`
          : call.status === 'incoming'
            ? `Incoming call · ${brand.name}`
            : isActive(call.status)
              ? `In call · ${brand.name}`
              : `${label} · ${brand.name}`;
  }, [resetToken, verifyToken, needsVerification, session, label, call.status]);

  // Pick up new releases, but never in the middle of a call.
  const callStatus = useRef(call.status);
  useEffect(() => {
    callStatus.current = call.status;
  }, [call.status]);
  useEffect(() => watchForUpdates(() => !isActive(callStatus.current)), []);

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
        key={resetToken}
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

  if (verifyToken)
    return (
      <VerifyEmailLink
        // A fresh screen per link: each token is checked once, and a second link
        // opened in this tab must not reuse the first one's result.
        key={verifyToken}
        token={verifyToken}
        session={session}
        onContinue={(s) => {
          setVerifyToken(null);
          if (s) enter(s);
        }}
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

  if (needsVerification)
    return (
      <VerifyEmailPending
        session={session}
        onVerified={enter}
        onSignOut={() => {
          signingOut.current = true;
          void authApi.signOut().catch(() => {});
          enter(null);
        }}
      />
    );

  const startCall = (peer: Peer, video?: boolean) => void controller.dial(peer, video ?? settings.startWithVideo);
  const signOut = async () => {
    controller.disconnect();
    signingOut.current = true;
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
              <Icon name="close" size={18} />
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
          facing={calling.facing}
          onSwitchCamera={() => void controller.switchCamera()}
        />
      )}
    </>
  );
}
