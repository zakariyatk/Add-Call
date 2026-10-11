# Add Call

**Calls, simply added.** Add Call is a web calling app: create an account, see
who's online, and make **real peer-to-peer voice and video calls** in the browser
over WebRTC.

## Features

- **Accounts**: sign up and sign in with email and password. Sessions last 30
  days and renew while you use the app. You can sign out, and changing your
  password signs out your other devices.

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
start fresh).

To try a call on one machine, open the app in **two different browsers** (or a
normal and a private window), **create two accounts**, and call one from the
other under **People**. On localhost the browser allows the camera and
microphone without HTTPS.

### Quality checks

```bash
npm run typecheck  # app, tooling and server (strict)
npm run lint
npm test           # Vitest: accounts API, password hashing, signaling server,
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
| `ALLOWED_ORIGINS` | same host only | Extra origins allowed to call the API and open the WebSocket |

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
- Password reset and email verification. Both need an email-sending service
  (e.g. SMTP, Postmark, SES). Until then, a forgotten password must be reset
  by an operator in the database.
- Sign-in with Google/Apple and two-factor authentication.
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
  passwords.ts         scrypt hashing (tested)
  db.ts                SQLite schema and queries
  signaling.ts         authenticated presence, invitations, SDP/ICE relay (tested)
  app.ts               wires accounts + signaling together
  index.ts             production HTTP server (static files, /api, /ws)
vite.brand.ts          injects branding into index.html, serves favicon + manifest
scripts/               generate-icons.ts, e2e-call.mjs
```

## Roadmap

- Password reset and email verification (needs an email provider).
- Sign in with Google / Apple; two-factor authentication.
- Saved contacts and server-side call history.
- Push notifications for incoming calls when the tab is closed.
- Group calls (needs an SFU such as LiveKit or mediasoup).
- Native Android, iOS and Windows apps are **out of scope for now**; this
  repository is the web application only.
