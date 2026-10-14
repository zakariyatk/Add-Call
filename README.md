# Add Call

**Calls, simply added.** Add Call is a web calling app: create an account, see
who's online, and make **voice and video calls** in the browser.

Live at **https://call.adddots.com**.

| Part | Runs on |
| --- | --- |
| The app (React, static files) | **Hostinger**, `call.adddots.com` |
| Accounts, emails, who's online, ringing | **Supabase** (Auth, Postgres, Realtime) |
| Audio and video | **LiveKit Cloud** (one room per call) |
| Checks and deploys | **GitHub Actions** (every push to `main`) |

There is no server of our own to run.

## Features

- **Accounts** (Supabase Auth): sign up and sign in with email and password, or
  **Continue with Google**. Changing your password signs out your other
  devices; Google users can add a password later.
- **Email confirmation**: new accounts confirm their address with an emailed
  link before they can sign in. The link works on any device.
- **Forgot password**: an emailed link to choose a new password (works once,
  expires after an hour). Resetting signs you in and signs out every other
  device.
- **Calls**: audio and video go through LiveKit, so calls connect even behind
  strict firewalls and mobile networks. Media is encrypted in transit.
- **People**: everyone signed in right now, with presence ("On a call"), plus a
  box to call anyone on Add Call by their email address.
- **Incoming calls**: full-screen ring with Accept, Accept with video and
  Decline, plus a ringtone (can be turned off). It rings in every tab and
  device you're signed in on; answering on one stops the others. With
  notifications turned on (Settings → Calling) a call also shows a system
  notification while the tab is in the background; phones vibrate. The caller
  hears a ringback tone while it rings.
- **Rings even when Add Call is closed** (Web Push): with call notifications
  on, calling someone who isn't in the app sends their browsers an "Incoming
  call" notification with **Answer** and **Decline**, which re-alerts every few
  seconds while it rings. Answer opens the app and picks up; Decline ends the
  call without opening it. An unanswered call becomes "Missed call". Works on
  Android and desktop browsers (desktops: while the browser runs in the
  background) and on iPhone/iPad once Add Call is added to the Home Screen.
- **In call**: live timer, mute, camera on/off mid-call, a mirrored self-view,
  and indicators when the other person mutes or turns their camera off. If the
  camera is unavailable the call falls back to voice.
- **Call outcomes**: declined, busy ("on another call"), offline (not in the app
  and no call notifications), no answer
  (30s ring timeout), cancelled, connection lost, answered on another device.
- **Chats** (one-to-one, like a phone messenger): text, photos (shrunk before
  upload), files up to 25 MB and voice notes. Sent ✓ / delivered ✓✓ / read ✓✓
  ticks, "typing…" and "online", unread badges, delete your own message for
  everyone (within 2 days), and call or video call from the chat. People who
  aren't in the app get a notification (with call notifications on). Start a
  chat with + and an email, or from People and Calls.
- **Stickers and emoji**: the smiley button in a chat opens a panel (like
  WhatsApp's) with **Stickers** (tap to send; recently used first) and
  **Emoji** (tap to insert). Stickers show large without a bubble. Sticker art:
  [Microsoft Fluent Emoji](https://github.com/microsoft/fluentui-emoji) (3D),
  MIT licence, shipped in `public/stickers`.
- **Usernames** (like Instagram): everyone picks a unique @username (3–30
  letters, numbers, periods and underscores) after signing in, with a live
  "available / taken" check; change it in Settings. People find, call and
  message each other by exact @username (or email); there's no directory to
  browse.
- **My list**: People → find someone by @username → **Add to my list**. Your
  list (only you can see it) shows who's online, with message and call
  buttons; Edit removes people. Calls and messages also work with anyone not
  in your list, and chats with them offer an Add button.
- **Profile pictures**: Settings → Account → tap your picture for Take photo,
  Choose photo, View photo or Remove photo. A new photo opens a move-and-scale
  editor like WhatsApp's (drag to move, pinch / mouse wheel / slider to zoom,
  round frame); Done saves what's in the circle (up to 512 × 512). It shows
  everywhere: chats, calls, People and the call screen.
- **Recents**: your call history (incoming, outgoing, missed, video, duration),
  kept per account in this browser, with call-back.
- **Settings**: theme, noise suppression, start calls with video, ring sound,
  and connection status.
- Light and dark themes, responsive (sidebar on desktop, tab bar on phones),
  keyboard and screen-reader friendly.

## Develop

Requires Node 20+.

```bash
npm install
npm run dev        # http://localhost:5174, using the live Supabase project
```

The app talks to the Supabase project in [`src/lib/supabase.ts`](src/lib/supabase.ts)
(its URL and publishable key are public by design). To use another project, set
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in a `.env.local` file.

To try a call on one machine, open the app in **two different browsers** (or a
normal and a private window), sign in with two accounts, and call one from the
other under **People**. On localhost the browser allows the camera and
microphone without HTTPS.

```bash
npm run typecheck
npm run lint
npm test           # Vitest: call state machine, history, branding, formatting
npm run build      # dist/: upload this folder's contents to the web host
```

## Set up (one time)

The Supabase project **add-call** (`zqwuztvbpfifmkwtjyyk`, Mumbai) already has
the database ([`supabase/migrations`](supabase/migrations)) and the
`livekit-token` Edge Function ([`supabase/functions`](supabase/functions)).
What's left is accounts and settings only you can create:

### 1. LiveKit (audio and video)

1. Sign up at [cloud.livekit.io](https://cloud.livekit.io) (the free plan is
   enough to start) and create a project.
2. Under **Settings → Keys**, create an API key. Note the **WebSocket URL**
   (`wss://<project>.livekit.cloud`), the **API key** and the **API secret**.
3. In Supabase: **Edge Functions → Secrets**, add
   `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`.

The secret never reaches the browser: the Edge Function uses it to give the two
people in an accepted call a 2-hour pass to that call's room only.

### 2. Supabase Auth settings

In the Supabase dashboard for **add-call**:

1. **Authentication → URL Configuration**: set **Site URL** to
   `https://call.adddots.com`, and add `http://localhost:5174` to
   **Redirect URLs**.
2. **Authentication → Emails → SMTP Settings**: turn on custom SMTP. Supabase's
   built-in sender only emails members of your Supabase team, so real users
   won't get confirmation emails without this. With a Hostinger mailbox (for
   example `no-reply@adddots.com`, created in hPanel → Emails):
   host `smtp.hostinger.com`, port `465`, your mailbox address and password,
   sender name **Add Call**.
3. **Authentication → Emails → Templates**: replace two templates with the
   files in [`supabase/templates`](supabase/templates) (they send people to
   the app's own `#/verify/` and `#/reset/` pages):
   - **Confirm signup**: subject `Confirm your email for Add Call`, body
     `confirm-signup.html`
   - **Reset password**: subject `Reset your Add Call password`, body
     `reset-password.html`
   - Optional, under security notifications: **Password changed**, body
     `password-changed.html`

   Regenerate them after changing the branding with
   `npx vite-node scripts/generate-email-templates.ts`.
4. **Authentication → Providers → Email**: keep **Confirm email** on, and set the
   minimum password length to **8**.
5. **Realtime → Settings**: turn off **Allow public access**, so only signed-in
   users can join channels.

### 3. Sign in with Google (optional)

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   create an **OAuth client ID** (Web application). Under **Authorized redirect
   URIs** add `https://zqwuztvbpfifmkwtjyyk.supabase.co/auth/v1/callback`.
2. In Supabase: **Authentication → Providers → Google**, turn it on and paste
   the client ID and secret.

The "Continue with Google" button appears automatically once it's on.

### 4. Hostinger + GitHub deploys

1. In hPanel, create the subdomain **call.adddots.com** and make sure its free
   **SSL** certificate is active (calls need HTTPS).
2. In hPanel → **Files → FTP Accounts**, create an FTP account whose directory
   is the subdomain's folder (for example `public_html/call`).
3. In GitHub: **Settings → Secrets and variables → Actions**, add the secrets
   `FTP_SERVER` (the FTP host shown in hPanel), `FTP_USERNAME` and
   `FTP_PASSWORD`. If the FTP account opens somewhere else, also add a
   variable `FTP_SERVER_DIR` with the path to the subdomain folder, ending in `/`.

Every push to `main` then runs the checks, builds the app and uploads `dist/`
over FTPS ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)). The
uploaded [`.htaccess`](public/.htaccess) forces HTTPS and sets caching and
security headers.

### 5. Call notifications (ring when the app is closed)

1. Make a key pair once: `npx web-push generate-vapid-keys`.
2. In Supabase: **Edge Functions → Secrets**, add `VAPID_PUBLIC_KEY` and
   `VAPID_PRIVATE_KEY` from step 1 (and optionally `VAPID_SUBJECT`, e.g.
   `mailto:you@adddots.com`). Keep the private key secret; changing the keys
   later means everyone turns call notifications on again.
3. Apply [`20261014120000_call_push.sql`](supabase/migrations/20261014120000_call_push.sql)
   and deploy the function with JWT verification **off** (the notification's
   Decline button has no session; the function checks callers itself):
   `supabase db push` and `supabase functions deploy call-push --no-verify-jwt`.

People then turn it on per device under **Settings → Calling → Call
notifications**.

### 6. Chats and profile pictures

Apply [`20261015090000_chat_and_avatars.sql`](supabase/migrations/20261015090000_chat_and_avatars.sql)
(SQL Editor → paste → Run). It creates the tables, functions, the two Storage
buckets (`avatars`, public; `chat-media`, private) and their rules. Then
redeploy `call-push` (same code file, still with JWT verification off) so
messages can notify people who aren't in the app. The service worker ([`public/sw.js`](public/sw.js)) only
shows notifications: it caches nothing.

### 7. Usernames and my list

Apply [`20261016090000_usernames_and_contacts.sql`](supabase/migrations/20261016090000_usernames_and_contacts.sql)
(SQL Editor → paste → Run). Existing accounts are asked to choose a username
the next time they open the app.

### 8. Stickers

Apply [`20261017090000_stickers.sql`](supabase/migrations/20261017090000_stickers.sql)
(SQL Editor → paste → Run) and redeploy `call-push` (so notifications say
"Sticker").

## Security model and limits

**Accounts** (Supabase Auth)
- Passwords are hashed by Supabase; the app never stores them. Sessions are
  short-lived JWTs that refresh automatically.
- New addresses must be confirmed before signing in, so nobody can register
  someone else's email and receive their calls.
- Supabase rate-limits sign-ins, sign-ups and emails.

**Calls**
- Each call is a row in `public.calls`. Only the two people in it can read it
  (row-level security, which also filters the Realtime updates), and nobody can
  write the table directly: calls are started, answered and ended only through
  database functions that check who is asking. The caller can't answer their
  own call, and people can place at most 10 calls a minute.
- Other accounts can only be found by their exact email (`find_user`), so the
  member list can't be downloaded.
- "Who's online" is a private Realtime channel that only signed-in users can
  join. Everyone signed in sees who else is online (name and email). That's
  fine for a team; add contacts or permissions for a public service.
- LiveKit passes are issued only for accepted calls, only to their two
  participants, and only for that call's room.
- Push subscriptions can't be read or listed by anyone but the `call-push`
  function. It pushes a call only when asked by that call's caller, at most
  once as "incoming" and once as "missed". The Decline button works without a
  session through a per-call token that only the function can make, and only
  ends a call that's still ringing. Push messages are end-to-end encrypted to
  the browser (RFC 8291).
- Media is encrypted in transit (DTLS-SRTP) and routed through LiveKit's
  servers.

**Chats and pictures**
- Only the two people in a conversation can read its messages and files
  (row-level security on the tables and on Storage); nobody can write the
  tables directly: messages are sent, marked read and deleted only through
  database functions that check who is asking. At most 60 messages a minute.
- Attachments are private and opened through links that expire after an hour.
  Profile pictures are public files with unguessable names, and others can
  only look them up by the exact email (like calling).
- Messages are encrypted in transit and stored in Supabase; they are not
  end-to-end encrypted like WhatsApp.

**Not included yet**
- Changing the email address on an account.
- Sign in with Apple, and two-factor authentication.
- Calls are one-to-one. Calling phone numbers would need a telephony provider
  (LiveKit SIP).

## Branding

All branding lives in **[`src/branding/brand.config.ts`](src/branding/brand.config.ts)**:
the product name, tagline, description, logo colours, light and dark palettes,
accent, radius and font. The title, meta tags, `theme-color`, manifest, favicon,
colour tokens and every in-app use of the name are generated from it. See
**[docs/BRANDING.md](docs/BRANDING.md)**.

## Project layout

```
src/
  calls/
    CallController.ts  presence, ringing (call rows over Realtime), media, call state
    media.ts           LiveKit room for one call (loaded on demand)
    callMachine.ts     call lifecycle reducer (pure, tested)
    protocol.ts        shared call types
    push.ts, notify.ts call notifications (Web Push subscription, system notifications)
  chat/
    ChatController.ts  conversations, messages over Realtime, sending, uploads, ticks, typing
    format.ts          chat helpers (pure, tested); media.ts photos and voice notes
  profile/avatars.ts   profile pictures: upload, lookup by email, cache
    history.ts, ringtone.ts, useCalling.ts
  auth/api.ts          accounts, on Supabase Auth
  lib/supabase.ts      Supabase client
  branding/            brand.config.ts (edit this), logo.ts, theme.ts
  components/, views/  UI (Chats, People, Calls, Settings, call screen, sign-in)
supabase/
  migrations/          tables, row-level security, call functions, Realtime rules
  functions/livekit-token/  Edge Function: LiveKit passes for accepted calls
  functions/call-push/      Edge Function: Web Push for calls and messages
  templates/           branded auth emails (generated)
public/.htaccess       Hostinger: HTTPS, caching, security headers
public/sw.js           service worker: shows pushed calls (no caching)
vite.brand.ts          injects branding into index.html, serves favicon + manifest
scripts/               generate-icons.ts, generate-email-templates.ts
```

## Roadmap

- Load Recents from the `calls` table, so history follows you across devices.
- Change email address.
- Sign in with Apple; two-factor authentication.
- Push notifications for incoming calls when the tab is closed.
- Group calls (LiveKit rooms already support more than two people).
- Native Android, iOS and Windows apps are **out of scope for now**; this
  repository is the web application only.
