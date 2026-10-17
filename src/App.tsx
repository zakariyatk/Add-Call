import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { authApi, sameSession, takeAuthError, takeVerifyToken, type Session } from './auth/api';
import { brand } from './branding/brand.config';
import { isActive } from './calls/callMachine';
import { addToHistory, loadHistory } from './calls/history';
import { disablePush, onWorkerMessage, registerWorker, syncPush, takeLaunchAction } from './calls/push';
import type { CallRecord, Peer } from './calls/types';
import { useCalling } from './calls/useCalling';
import { AppShell } from './components/AppShell';
import { Icon } from './components/Icon';
import { LogoMark } from './components/Logo';
import { NAV, type ViewId } from './components/nav';
import { browserStore, storageKey } from './lib/storage';
import { keepRealtimeAwake } from './lib/supabase';
import { watchForUpdates } from './lib/updates';
import { applyTheme, loadSettings, saveSettings, type Settings } from './settings';
import { CallScreen } from './views/CallScreen';
import { LoginScreen } from './views/LoginScreen';
import { PeopleView } from './views/PeopleView';
import { RecentsView } from './views/RecentsView';
import { VerifyEmailLink } from './views/VerifyEmailScreen';
import { SettingsView } from './views/SettingsView';
import { isSettingsPage, type SettingsPage } from './views/settingsPages';
import { ChatsView } from './views/ChatsView';
import { useChat } from './chat/useChat';
import { resetAvatars } from './profile/avatars';
import { findPerson, loadMyProfile } from './profile/username';
import { useBlocks } from './people/blocks';
import { useContacts } from './people/contacts';
import { isEmail } from './calls/protocol';
import { ChooseUsernameScreen } from './views/ChooseUsernameScreen';

const store = browserStore();
const seenKey = (email: string) => storageKey(`recentsSeen.${email}`);

const CHAT_ROUTE = /^chats\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

const SETTINGS_ROUTE = /^settings\/([a-z]+)$/;

/** #/recents → recents; #/chats/<id> → that chat; #/settings/<page> → a settings page; anything else → the chat list. */
const routeFromHash = (): { view: ViewId; chatId: string | null; settingsPage: SettingsPage | null } => {
  const path = window.location.hash.replace(/^#\/?/, '');
  const chat = CHAT_ROUTE.exec(path);
  if (chat) return { view: 'chats', chatId: chat[1].toLowerCase(), settingsPage: null };
  const settings = SETTINGS_ROUTE.exec(path);
  if (settings && isSettingsPage(settings[1])) return { view: 'settings', chatId: null, settingsPage: settings[1] };
  return { view: NAV.some((n) => n.id === path) ? (path as ViewId) : 'chats', chatId: null, settingsPage: null };
};

export default function App() {
  /** undefined while we ask the server whether a session exists. */
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [signedOutNotice, setSignedOutNotice] = useState<string | null>(null);
  const [authError] = useState(takeAuthError);
  const [verifyToken, setVerifyToken] = useState(takeVerifyToken);
  const [settings, setSettings] = useState<Settings>(() => loadSettings(store));
  const [route, setRoute] = useState(routeFromHash);
  const { view, chatId, settingsPage } = route;
  const [history, setHistory] = useState<CallRecord[]>([]);
  const [recentsSeen, setRecentsSeen] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  // Supabase reports the same sign-in again on every token refresh, from other
  // tabs, and when the app comes back to the front. Keeping the same session
  // object then keeps calls and chats connected instead of rebuilding them.
  const enter = useCallback((s: Session | null) => {
    setSession((prev) => (prev !== undefined && sameSession(prev, s) ? prev : s));
  }, []);

  /** An emailed sign-in link was opened: it signed in (or had expired). */
  const finishLink = useCallback(
    (s: Session | null) => {
      setVerifyToken(null);
      if (s) enter(s);
    },
    [enter],
  );

  // Call history and the missed-call badge belong to the account's email.
  const accountEmail = session?.email ?? null;
  useEffect(() => {
    setHistory(accountEmail ? loadHistory(store, accountEmail) : []);
    setRecentsSeen(accountEmail ? Number(store.getItem(seenKey(accountEmail)) ?? 0) : 0);
  }, [accountEmail]);

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
      if (prev && !signingOut.current) setSignedOutNotice('You were signed out. Sign in again to continue.');
      signingOut.current = false;
      enter(null);
    });
  }, [enter]);


  useEffect(() => {
    applyTheme(settings.theme);
    saveSettings(store, settings);
  }, [settings]);

  useEffect(() => {
    const onHash = () => {
      // An emailed link pasted into an already-open tab only changes the hash.
      const verify = takeVerifyToken();
      if (verify) return setVerifyToken(verify);
      setRoute(routeFromHash());
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
  const prefs = useMemo(
    () => ({ noiseSuppression: settings.noiseSuppression, ringSound: settings.ringSound, ringtone: settings.ringtone }),
    [settings],
  );
  const calling = useCalling(session ?? null, prefs, addRecord);
  const { call, controller, connection } = calling;
  const signedInId = session ? session.id : null;
  const chat = useChat(session ?? null);
  const chatController = chat.controller;

  useEffect(
    () =>
      keepRealtimeAwake(() => {
        controller.wake();
        chatController.wake();
      }),
    [controller, chatController],
  );

  // Messages only push to people who aren't in the app right now.
  const presence = calling.presence;
  useEffect(() => {
    chatController.setOnlineLookup((id) => presence.some((p) => p.id === id));
  }, [chatController, presence]);
  useEffect(() => {
    chatController.setActive(view === 'chats' ? chatId : null);
  }, [chatController, view, chatId]);
  // Pictures are looked up per account.
  useEffect(() => resetAvatars(), [signedInId]);

  // Your @username: undefined while loading, null when not chosen yet ('' if it
  // couldn't be loaded, which never blocks the app).
  const [myUsername, setMyUsername] = useState<string | null | undefined>(undefined);
  const myEmail = session?.email ?? '';
  useEffect(() => {
    setMyUsername(undefined);
    if (!signedInId) return;
    let live = true;
    loadMyProfile(signedInId, myEmail).then(
      (p) => live && setMyUsername(p.username),
      () => live && setMyUsername(''),
    );
    return () => {
      live = false;
    };
  }, [signedInId, myEmail]);
  const contacts = useContacts(signedInId);
  const blocks = useBlocks(signedInId);

  // Call notifications: the service worker rings this browser even with no tab
  // open; its Answer / Decline buttons come back here.
  useEffect(() => {
    void registerWorker();
    const launch = takeLaunchAction();
    if (launch) controller.handleNotificationAction(launch);
    return onWorkerMessage((m) => {
      if (m.type === 'open-chat' && m.conversationId) navigate('chats', m.conversationId);
      else controller.handleNotificationAction(m);
    });
  }, [controller]);
  useEffect(() => {
    if (signedInId) void syncPush();
  }, [signedInId]);

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

  function navigate(v: ViewId, id: string | null = null) {
    setRoute({ view: v, chatId: v === 'chats' ? id : null, settingsPage: v === 'settings' && id && isSettingsPage(id) ? id : null });
    const hash = id ? `#/${v}/${id}` : `#/${v}`;
    if (window.location.hash !== hash) window.history.pushState({ from: window.location.hash }, '', hash);
  }

  /** Back from a settings page: the way the person came (so the phone's back button agrees), else to Settings. */
  function settingsBack() {
    if ((window.history.state as { from?: string } | null)?.from === '#/settings') window.history.back();
    else navigate('settings');
  }

  const missedCount = useMemo(() => history.filter((r) => r.direction === 'missed' && r.at > recentsSeen).length, [history, recentsSeen]);
  const openChat = chatId ? chat.conversations.find((c) => c.id === chatId) : undefined;
  const label = openChat ? openChat.peer.name : NAV.find((n) => n.id === view)?.label;
  const unreadChats = chat.unreadTotal;

  useEffect(() => {
    document.title = verifyToken
      ? `Signing in · ${brand.name}`
      : !session
          ? `Sign in · ${brand.name}`
        : call.status === 'incoming'
          ? `Incoming call · ${brand.name}`
          : isActive(call.status)
            ? `In call · ${brand.name}`
            : `${unreadChats ? `(${unreadChats}) ` : ''}${label} · ${brand.name}`;
  }, [verifyToken, session, label, call.status, unreadChats]);

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

  // An emailed sign-in link wins over everything else, signed in or not.
  if (verifyToken)
    return (
      <VerifyEmailLink
        // A fresh screen per link: each token is checked once.
        key={verifyToken}
        token={verifyToken}
        onContinue={finishLink}
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

  const signOutFromGate = () => {
    signingOut.current = true;
    void authApi.signOut().catch(() => {});
    enter(null);
  };
  if (myUsername === null)
    return <ChooseUsernameScreen session={session} onDone={setMyUsername} onSignOut={signOutFromGate} />;

  const startCall = (peer: Peer, video?: boolean) => void controller.dial(peer, video ?? settings.startWithVideo);
  /** Opens the chat with someone by @username or email; resolves to an error message, or null. */
  const startChat = async (query: string) => {
    try {
      let email = query.trim().toLowerCase();
      if (!isEmail(email)) {
        const person = await findPerson(query);
        if (!person) return `No one on ${brand.name} has that username.`;
        email = person.email;
      }
      navigate('chats', await chatController.openWith(email));
    } catch (err) {
      return err instanceof Error ? err.message : 'Could not open this chat.';
    }
    return null;
  };
  const signOut = async () => {
    // This browser stops ringing for the account it's signing out of.
    await disablePush({ keepBrowser: true }).catch(() => {});
    controller.disconnect();
    signingOut.current = true;
    await authApi.signOut().catch(() => {});
    setSignedOutNotice(null);
    enter(null);
  };
  /** Deletes the account for good (Settings → Account); throws if it couldn't. */
  const deleteAccount = async () => {
    signingOut.current = true;
    try {
      await authApi.deleteAccount();
    } catch (err) {
      signingOut.current = false;
      throw err;
    }
    controller.disconnect();
    setSignedOutNotice('Your account and everything in it were deleted.');
    enter(null);
  };

  return (
    <>
      <AppShell
        view={view}
        onNavigate={(v) => navigate(v)}
        session={session}
        onSignOut={signOut}
        badges={{ recents: missedCount, chats: unreadChats }}
        connection={connection}
        layout={view !== 'chats' ? 'page' : chatId ? 'focus' : 'split'}
      >
        {calling.notice && (
          <div className="notice" role="status">
            <span>{calling.notice}</span>
            <button type="button" className="icon-btn" onClick={controller.dismissNotice} aria-label="Dismiss">
              <Icon name="close" size={18} />
            </button>
          </div>
        )}
        {view === 'chats' && (
          <ChatsView
            me={session}
            chat={chat}
            chatId={chatId}
            now={now}
            presenceOf={(id) => {
              const p = presence.find((x) => x.id === id);
              return p ? (p.busy ? 'busy' : 'online') : 'offline';
            }}
            onOpen={(id) => navigate('chats', id)}
            onBack={() => navigate('chats')}
            onStart={startChat}
            isContact={contacts.isContact}
            isBlocked={blocks.isBlocked}
            onCall={startCall}
          />
        )}
        {view === 'recents' && <RecentsView recents={history} now={now} onCall={startCall} onMessage={(p) => void startChat(p.email)} />}
        {view === 'people' && (
          <PeopleView
            me={session}
            presence={calling.presence}
            contacts={contacts.contacts}
            contactsLoaded={contacts.loaded}
            onCall={startCall}
            onMessage={(p) => void startChat(p.email)}
          />
        )}
        {view === 'settings' && (
          <SettingsView
            page={settingsPage}
            onOpen={(p) => navigate('settings', p)}
            onBack={settingsBack}
            session={session}
            settings={settings}
            onChange={setSettings}
            onSignOut={signOut}
            connection={connection}
            username={myUsername || null}
            onUsername={setMyUsername}
            blocked={blocks.blocked}
            onDeleteAccount={deleteAccount}
          />
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
