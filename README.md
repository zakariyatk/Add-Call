# Add Call

**Calls, simply added.** Add Call is a web calling app: create an account, see
who's online, and make **real peer-to-peer voice and video calls** in the browser
over WebRTC.

## Features

- **Accounts**: sign up and sign in with email and password, or **Continue
  with Google**. Sessions last 30 days and renew while you use the app. You can
  sign out, and changing your password signs out your other devices. Google
  users can add a password later.
- **Email verification**: new accounts confirm their address with an emailed
  link (expires in 24 hours, can be resent) before they can call or appear
  online. Google sign-ins and completed password resets count as verified, and
  accounts that existed before this feature were marked verified. It's only
  required when email is configured.
- **Forgot password**: get an emailed link to choose a new password (works
  once, expires after an hour). Resetting signs you in and signs out every
  other device, and a "password changed" notice is emailed to you.

- **Real calls (WebRTC)**: audio and video go directly between the two browsers.
  A small signaling server introduces them and relays the WebRTC handshake. It
  never sees the media.
- **People**: everyone signed in right now, with presence ("On a call"), plus a
  box to call anyone on Add Call by their email address.
- **Incoming calls**: full-screen ring with Accept, Accept with video and
  Decline, plus a ringtone (can be turned off). The tab title changes too.
- **In call**: live timer, mute, camera on/off mid-call (no reconnect needed),
  a mirrored self-view, and indicators when the other person mutes or turns
  their camera off. If the camera is unavailable the call falls back to voice.
- **Call outcomes**: declined, busy ("on another call"), offline, no answer
  (30s ring timeout), cancelled, connection lost.
- **Recents**: your real call history (incoming, outgoing, missed, video,
  duration), kept per account in this browser, with call-back.
- **Settings**: theme, noise suppression, start calls with video, ring sound,
  and connection status.
- Light and dark themes, responsive (sidebar on desktop, tab bar on phones),
  keyboard and screen-reader friendly.

## Develop

Requires Node 22.13+ (for the built-in SQLite).

```bash
npm install
npm run dev        # app + accounts API + signaling on http://localhost:5174
```

Development accounts are stored in `data/dev.db` (git-ignored; delete it to
start fresh). In development, emails such as password-reset links are
**printed in the terminal** running `npm run dev` instead of being sent, unless
you configure SMTP.

To try a call on one machine, open the app in **two different browsers** (or a
normal and a private window), **create two accounts**, and call one from the
other under **People**. On localhost the browser allows the camera and
microphone without HTTPS.

### Quality checks

```bash
npm run typecheck  # app, tooling and server (strict)
npm run lint
npm test           # Vitest: accounts API, password reset, SMTP delivery,
                   # Google sign-in (against a stand-in Google), password
                   # hashing, signaling server,
                   # call state machine, protocol, history, branding, formatting
npm run build      # dist/ (app) + build/ (server)
npm run test:e2e   # two real browsers call each other (needs `npm start` running
                   # and Playwright installed: npm i -D playwright)
```

The end-to-end test creates two accounts through the sign-up form, in separate
browser contexts with Chromium's fake camera and microphone. It places a video
call and checks that it connects and that live audio and video frames arrive on
both sides. It also covers mute, camera off and on, hang-up, call history, a
declined call, sign-out, a wrong password and signing back in.

## Run in production

```bash
npm ci
npm run build
PORT=8080 npm start            # app, accounts API (/api/auth/*) and signaling (/ws)
```

`GET /healthz` returns `{ ok, online, calls }`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8080` | HTTP port |
| `DATABASE_PATH` | `data/addcall.db` | SQLite file for accounts and sessions; keep it on persistent storage and back it up |
| `TRUST_PROXY` | off | Set to `1` behind a reverse proxy, to read the client IP (rate limiting) and HTTPS from `X-Forwarded-*` |
| `COOKIE_SECURE` | follows the request | Set to `1` to always mark the session cookie `Secure` (recommended in production) |
| `STATIC_DIR` | `dist` | Built app to serve |
| `STUN_URLS` | Google public STUN | Comma-separated STUN URLs |
| `TURN_URL` | none | Comma-separated TURN URLs, e.g. `turn:turn.example.com:3478,turns:turn.example.com:5349` |
| `TURN_USERNAME`, `TURN_CREDENTIAL` | none | TURN credentials |
| `PUBLIC_URL` | from the request | The app's public origin, e.g. `https://call.example.com`; used to build the Google callback URL |
| `SMTP_URL` | none | SMTP connection, e.g. `smtps://user:pass@smtp.example.com:465`; turns on "Forgot password?" |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` | port `587` | The same, as separate settings (`SMTP_SECURE=true` for port 465) |
| `MAIL_FROM` | none (required with SMTP) | Sender, e.g. `Add Call <no-reply@call.example.com>` |
| `MAIL_TRANSPORT` | SMTP | `console` prints emails to the server log instead of sending (testing only: the log will contain reset links) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | none | Turn on "Continue with Google" (see below) |
| `GOOGLE_REDIRECT_URI` | `PUBLIC_URL` + `/api/auth/google/callback` | Override the exact callback URL sent to Google |
| `ALLOWED_ORIGINS` | same host only | Extra origins allowed to call the API and open the WebSocket |

### Email (forgot password)

"Forgot password?" appears once email is set up. Any SMTP provider works:
Postmark, Amazon SES, SendGrid, Mailgun, Brevo, or Google Workspace.

1. Create SMTP credentials with your provider and **verify your sending domain**
   (add the SPF and DKIM DNS records it gives you). Without that, reset
   emails tend to land in spam.
2. Set `SMTP_URL` (or the `SMTP_HOST`… settings), `MAIL_FROM`, and
   **`PUBLIC_URL`**. Reset stays off without `PUBLIC_URL`, on purpose: the
   link must never be built from a request's `Host` header, or an attacker
   could get a real reset link sent to a victim pointing at the attacker's site.
3. Restart the server. The log warns if something is missing.

### Sign in with Google

The button appears only when both Google variables are set.

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   create or choose a project, then go to **APIs & Services**.
2. Under **OAuth consent screen**, choose *External*, set the app name to
   **Add Call**, and add your support email and logo. The scopes are `openid`,
   `email` and `profile` (no sensitive scopes, so no Google review is needed).
3. Under **Credentials → Create credentials → OAuth client ID**, pick
   **Web application** and add the **Authorized redirect URIs**:
   - production: `https://<your-domain>/api/auth/google/callback`
   - development: `http://localhost:5174/api/auth/google/callback`
4. Copy the client ID and secret into `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET`, and set `PUBLIC_URL` in production. For local
   development, start `npm run dev` with the same two variables set.
5. While the consent screen is in *Testing*, only the test users you list can
   sign in. **Publish** it when you're ready for everyone.

The secret belongs in your hosting provider's secret settings. Never commit it.

Requirements for real-world use:

- **HTTPS is required.** Browsers only grant camera and microphone on secure
  origins. Put the server behind a TLS proxy (nginx, Caddy, a cloud load
  balancer) that forwards WebSocket upgrades on `/ws`.
- **Use a TURN server.** STUN alone connects most home networks, but roughly
  10–20% of calls (corporate firewalls, symmetric NAT, some mobile carriers)
  need a relay. Run [coturn](https://github.com/coturn/coturn) or use a hosted
  TURN service, and set `TURN_URL` / `TURN_USERNAME` / `TURN_CREDENTIAL`.
- **One server instance.** Presence and calls are held in memory and accounts
  in a local SQLite file, so run a single instance (move to Postgres and a
  shared store such as Redis before scaling out).

## Security model and limits

**Accounts**
- Passwords are hashed with **scrypt** (salted, memory-hard); plaintext is never
  stored or logged. Hash parameters are versioned and upgraded on sign-in.
- Sessions are random 256-bit tokens in an **HttpOnly, SameSite=Lax** cookie
  (`Secure` on HTTPS). Only a SHA-256 of each token is stored, so a leaked
  database does not contain usable sessions. Sessions expire after 30 days of
  inactivity; sign-out deletes the session on the server.
- Sign-in failures always say "Email or password is incorrect", and unknown
  emails take the same time to check, so attackers can't probe which emails
  have accounts. (Sign-up does say when an email is already registered.)
- Rate limits: 30 sign-in/sign-up attempts per IP and 10 failed sign-ins per
  account, per 15 minutes.
- CSRF: the API accepts only JSON POSTs from the app's own origin.
- **Google**: OpenID Connect authorization-code flow with PKCE, a `state`
  bound to the browser by a short-lived HttpOnly cookie (blocks login CSRF and
  replay), and a `nonce`. The ID token's RS256 signature is checked against
  Google's published keys, along with issuer, audience, expiry and nonce. Only
  Google accounts with a **verified email** are accepted. The client secret
  never reaches the browser.
- **Password reset**: links carry a random 256-bit token; only its SHA-256 is
  stored. A link works once, expires after an hour, and requesting a new one
  cancels the old. The token sits in the URL fragment (`/#/reset/…`), which
  browsers never send to servers or in `Referer`, and the app removes it from
  the address bar on arrival. "Forgot password?" answers the same whether or
  not the email has an account, and sends the email in the background so
  timing doesn't reveal it either. Reset emails are limited to 3 per address
  per hour. A successful reset signs out all sessions and emails a notice.
- **Email verification**: the calling server refuses unverified accounts, so
  nobody can sign up with someone else's address and receive their calls. If
  someone registers an address they don't own, the real owner can take it back
  with "Forgot password?": the reset verifies the address and signs everyone
  else out. Links are single-use and stored hashed, a new link cancels the
  old, and resends are limited to 3 per hour.
- **Account linking**: a Google account is matched by its permanent Google ID.
  The first Google sign-in with an email that already has a password account
  links the two, because Google has verified that the person owns that email.
  An email already linked to a *different* Google account is refused.

**Calls**
- The signaling WebSocket is authenticated from the session cookie: you can only
  appear as the account you're signed in to, and signed-out or expired
  sessions are refused (401). Signing out, or changing your password, also
  closes that session's open connections.
- Everyone signed in sees who else is online (name and email) on the same
  server. That's fine for a team; add contacts or permissions for a public
  service.
- Media is encrypted end to end between the browsers (DTLS-SRTP, mandatory in
  WebRTC). The server only sees who calls whom.
- Messages are validated, size- and rate-limited, the WebSocket `Origin` is
  checked, and dead connections are dropped.

**Not included yet**
- Changing the email address on an account.
- Sign in with Apple, and two-factor authentication.
- Calls are one-to-one. Calling phone numbers would need a telephony provider
  (SIP / PSTN gateway).

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
    protocol.ts        signaling messages + validation (shared with the server)
    callMachine.ts     call lifecycle reducer (pure, tested)
    CallController.ts  signaling + media + peer connection → snapshots for React
    peer.ts            RTCPeerConnection wrapper (offer/answer, ICE, track swaps)
    signalingClient.ts WebSocket with reconnect
    history.ts, ringtone.ts, useCalling.ts
  branding/            brand.config.ts (edit this), logo.ts, theme.ts
  auth/api.ts          accounts API client
  components/, views/  UI (People, Recents, Settings, call screen, sign-in)
server/
  auth.ts              accounts API, sessions, rate limiting (tested)
  google.ts            Sign in with Google: OIDC + PKCE, ID-token verification (tested)
  mailer.ts, emails.ts SMTP sending and branded email templates (tested)
  passwords.ts         scrypt hashing (tested)
  db.ts                SQLite schema and queries
  signaling.ts         authenticated presence, invitations, SDP/ICE relay (tested)
  app.ts               wires accounts + signaling together
  index.ts             production HTTP server (static files, /api, /ws)
vite.brand.ts          injects branding into index.html, serves favicon + manifest
scripts/               generate-icons.ts, e2e-call.mjs
```

## Roadmap

- Change email address.
- Sign in with Apple; two-factor authentication.
- Saved contacts and server-side call history.
- Push notifications for incoming calls when the tab is closed.
- Group calls (needs an SFU such as LiveKit or mediasoup).
- Native Android, iOS and Windows apps are **out of scope for now**; this
  repository is the web application only.
