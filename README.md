# Add Call

**Calls, simply added.** Add Call is a calling app for the web and Android:
create an account, find people by @username, and make **voice and video
calls** and chat.

Live at **https://call.adddots.com**.

| Part | Runs on |
| --- | --- |
| The app (React, static files) | **Hostinger**, `call.adddots.com` |
| Accounts, emails, who's online, ringing | **Supabase** (Auth, Postgres, Realtime) |
| Audio and video | **LiveKit Cloud** (one room per call) |
| Checks and deploys | **GitHub Actions** (every push to `main`) |

There is no server of our own to run.

## Features

- **Accounts** (Supabase Auth), no passwords: enter your email, then the
  6-digit code emailed to you (phones offer it above the keyboard, and the app
  signs in as soon as the code is complete). A new address gets an account
  automatically. The email also has a **Sign in** button that signs in on
  whichever device opens it. Or **Continue with Google**.
- **Calls**: audio and video go through LiveKit, so calls connect even behind
  strict firewalls and mobile networks. Media is encrypted in transit.
- **People**: find anyone on Add Call by their exact @username (or email) and
  call, message or add them to your list, which shows who's online or on a
  call. There's no list of everyone who's signed in.
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
  connection status, blocked people, the privacy policy, and **Delete
  account**.
- **Block and report**: in a chat, ⋮ → **Block** stops calls and messages both
  ways (and takes them off your list), until you unblock them (there or in
  Settings → Privacy and safety). ⋮ → **Report**, or press and hold one of their
  messages → **Report**, sends a report with a reason to the team, with the
  option to block at the same time. They're never told.
- **Privacy policy and account deletion pages** at
  [/privacy](https://call.adddots.com/privacy) and
  [/delete-account](https://call.adddots.com/delete-account), generated from the
  branding config (`src/branding/legal.ts`). Google Play asks for both links.
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
   files in [`supabase/templates`](supabase/templates). Both show the sign-in
   code (`{{ .Token }}`); new addresses get the first, existing accounts the
   second:
   - **Confirm signup**: subject `{{ .Token }} is your Add Call code`, body
     `confirm-signup.html`
   - **Magic link**: subject `{{ .Token }} is your Add Call code`, body
     `magic-link.html`

   Regenerate them after changing the branding with
   `npx vite-node scripts/generate-email-templates.ts`.
4. **Authentication → Providers → Email**: keep **Email** on and **Email OTP
   Length** at **6** (it must match `CODE_LENGTH` in `src/auth/api.ts`).
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

### 9. Block, report, delete account (needed for Google Play)

1. Apply [`20261018090000_safety.sql`](supabase/migrations/20261018090000_safety.sql)
   (SQL Editor → paste → Run).
2. Deploy the new functions, and `call-push` again (it now also answers the
   Android app):
   ```bash
   supabase functions deploy delete-account
   supabase functions deploy demo-sign-in --no-verify-jwt
   supabase functions deploy call-push --no-verify-jwt
   ```
3. Create the mailbox in `supportEmail` in
   [`brand.config.ts`](src/branding/brand.config.ts) (`support@adddots.com`;
   hPanel → Emails), or change it to an address you read. The privacy policy
   and account deletion pages tell people to write there.
4. **Reports** arrive in Supabase → **Table Editor → reports** (newest open
   ones first with a filter on `status = open`). Each has the reason, details
   and, for a reported message, a copy of it. Set `status` to `reviewed`,
   `actioned` or `dismissed` and keep notes in `notes`. To remove someone's
   account, delete their user under **Authentication → Users**: their rows go
   with it, while files they uploaded stay in **Storage** until you delete
   them there.

**Sign-in for app reviewers.** Google Play's reviewers can't read emailed
codes, so a review account also accepts one fixed code:

1. Make a review account: sign in once, normally, with an address you own
   (for example a `+review` alias of your Gmail), and choose a username.
2. In Supabase → **Edge Functions → Secrets**, add `DEMO_EMAILS` (that address;
   several can be separated with commas) and `DEMO_CODE` (6 random digits used
   nowhere else).
3. In Play Console → **App content → App access**, give reviewers the address
   and the code: "Enter the email, tap Send code, then type this code."

A wrong review code counts against a limit of 20 an hour, so it can't be
guessed. Other accounts aren't affected.

### 10. Ring the Android app when it's closed (Firebase)

1. In the [Firebase console](https://console.firebase.google.com), **Add
   project** (Google Analytics is optional), then **Add app → Android** with
   package name `com.adddots.call`. Download **`google-services.json`** and put
   it in `android/app/` (it's safe to commit: it only names the project).
2. **Project settings → Service accounts → Generate new private key**. In
   Supabase → **Edge Functions → Secrets**, add `FCM_SERVICE_ACCOUNT` with the
   whole JSON file as its value. Keep the file itself private and delete it
   afterwards.
3. Apply [`20261019090000_android_push.sql`](supabase/migrations/20261019090000_android_push.sql)
   (SQL Editor → paste → Run) and deploy `call-push` again
   (`supabase functions deploy call-push --no-verify-jwt`).
4. Build the app again (`npm run android`).

The app asks for notification, microphone and camera permission at the first
sign-in (so calls never stop for a prompt) and then rings
like a phone call: full screen on a locked phone, with **Answer** and
**Decline**, until it's answered, declined or 40 seconds pass. Missed calls and
messages show as notifications. On Android 14 and later, people allow the full
screen call in Settings → Calling → Incoming call screen (Google Play grants it
to calling apps, declared in Play Console → App content → Full-screen intent).

### 11. Continue with Google in the Android app

The app can't use Google's web page (Google blocks it inside apps), so it uses
Android's Google account sheet and hands the token to Supabase. Needs step 3
(Google sign-in on the website) first.

1. In [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials),
   in the same project as the website's OAuth client, **Create credentials →
   OAuth client ID → Android**: package name `com.adddots.call`, and the
   **SHA-1** of your upload key (`keytool -list -v -keystore
   android/add-call-upload.jks -alias upload`). After the first upload to
   Google Play, make a second Android client with the SHA-1 from Play Console →
   **Setup → App signing → App signing key certificate** (apps installed from
   Play are signed with that one).
2. Copy the **Web application** client's ID (the one in Supabase → Auth →
   Providers → Google). In GitHub → Settings → Secrets and variables → Actions
   → **Variables**, add `GOOGLE_WEB_CLIENT_ID` with it. Local builds read
   `VITE_GOOGLE_WEB_CLIENT_ID` from `.env.local`.
3. Run **Actions → Android release** again. The app's sign-in screen now
   shows **Continue with Google**.

## Android app

The same app, wrapped with [Capacitor](https://capacitorjs.com) (`android/`,
app id `com.adddots.call`). It uses the same accounts, Supabase project and
LiveKit as the website. Sign-in is with the emailed code, or **Continue with
Google** through Android's own Google account sheet once it's set up (Set up →
11).

One time: install [Android Studio](https://developer.android.com/studio) (it
includes Java and the Android SDK).

```bash
npm run android    # build the web app, copy it into android/, open Android Studio
```

In Android Studio, connect your phone with USB debugging on (or start an
emulator) and press **Run**. After changing the web code, run
`npm run android:sync` and press Run again. `npm run icons` also refreshes the
launcher icons.

Calls ring while the app is open, and when it's closed once Firebase is set
up (Set up → 10).

### Release build for Google Play

Google Play takes an **.aab** file signed with your **upload key**. Make the
key once and keep it safe, with its passwords, outside the repository (a
password manager and a backup). With Play App Signing, Google holds the final
signing key, and a lost upload key can be replaced through Play Console
support.

```bash
keytool -genkeypair -v -keystore android/add-call-upload.jks -alias upload \
  -keyalg RSA -keysize 2048 -validity 10000
```

Then create `android/keystore.properties` (ignored by git, like the `.jks`):

```properties
storeFile=add-call-upload.jks
storePassword=the store password
keyAlias=upload
keyPassword=the key password
```

and build:

```bash
npm run android:bundle   # → android/app/build/outputs/bundle/release/app-release.aab
```

**Or let GitHub build it** (no Android Studio needed):

1. Make the upload key once with the `keytool` command above (it comes with
   Java; install [Temurin 21](https://adoptium.net) if you don't have it).
2. Turn it into text: `base64 -w0 android/add-call-upload.jks` on Linux,
   `base64 -i android/add-call-upload.jks` on a Mac, or
   `[Convert]::ToBase64String([IO.File]::ReadAllBytes("android\add-call-upload.jks"))`
   in Windows PowerShell.
3. In GitHub → **Settings → Secrets and variables → Actions**, add
   `ANDROID_KEYSTORE_BASE64` (that text), `ANDROID_STORE_PASSWORD`,
   `ANDROID_KEY_ALIAS` (`upload`) and `ANDROID_KEY_PASSWORD`. If
   `google-services.json` isn't committed, add its contents as
   `GOOGLE_SERVICES_JSON`.
4. **Actions → Android release → Run workflow**, type the version (for
   example `1.0.1`), and download the `.aab` (for Google Play) and `.apk` (to
   install directly) from the finished run's **Artifacts**.

Each run gets a higher `versionCode` automatically, as Google Play requires.
Local builds use `versionCode` 1 unless `ANDROID_VERSION_CODE` is set. The
whole Play Store checklist is in **[docs/PLAY_STORE.md](docs/PLAY_STORE.md)**.

## Security model and limits

**Accounts** (Supabase Auth)
- There are no passwords: signing in takes a single-use code sent to the
  address (or Google), so nobody can use someone else's email and receive
  their calls. Codes expire after an hour. Sessions are short-lived JWTs that
  refresh automatically.
- Supabase rate-limits sign-ins, sign-ups and emails.

**Calls**
- Each call is a row in `public.calls`. Only the two people in it can read it
  (row-level security, which also filters the Realtime updates), and nobody can
  write the table directly: calls are started, answered and ended only through
  database functions that check who is asking. The caller can't answer their
  own call, and people can place at most 10 calls a minute.
- Other accounts can only be found by their exact @username or email
  (`find_person`), so the member list can't be downloaded.
- "Who's online" is a private Realtime channel that only signed-in users can
  join. It carries only account ids and an "on a call" flag, never names or
  emails; the app matches ids to people you already know (your list, your
  chats).
- Blocking is enforced in the database (a trigger on `calls` and `messages`),
  both ways, whichever function inserts the row. Reports can't be read through
  the API at all; only the dashboard sees them.
- Deleting an account (`delete-account` function) removes its Storage files
  (picture, and every file in its chats) and then the user; the database
  removes the rest through cascading foreign keys. Reports about the person
  are kept, with their email copied in.
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
  branding/            brand.config.ts (edit this), logo.ts, theme.ts, legal.ts (privacy / delete-account pages)
  people/              contacts.ts (my list), blocks.ts (block, report)
  components/, views/  UI (Chats, People, Calls, Settings, call screen, sign-in)
supabase/
  migrations/          tables, row-level security, call functions, Realtime rules
  functions/livekit-token/  Edge Function: LiveKit passes for accepted calls
  functions/call-push/      Edge Function: Web Push and FCM (Android) for calls and messages
  functions/delete-account/ Edge Function: deletes the signed-in account, its files and chats
  functions/demo-sign-in/   Edge Function: fixed code for app store reviewers' accounts
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
- Google Play release of the Android app (see
  [docs/PLAY_STORE.md](docs/PLAY_STORE.md)).
- Android: native Google sign-in, and emailed sign-in links that open the app.
- Group calls (LiveKit rooms already support more than two people).
- iOS app (later).
