# Add Call

**Calls, simply added.** Add Call is a web calling app: sign in, see who's online,
and make **real peer-to-peer voice and video calls** in the browser over WebRTC.

## Features

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

Requires Node 20.19+.

```bash
npm install
npm run dev        # app + signaling on http://localhost:5174
```

To try a call on one machine, open the app in **two different browsers** (or a
normal and a private window), sign in with two different email addresses, and
call one from the other under **People**. On localhost the browser allows the
camera and microphone without HTTPS.

### Quality checks

```bash
npm run typecheck  # app, tooling and server (strict)
npm run lint
npm test           # Vitest: call state machine, signaling server, protocol,
                   # history, branding/contrast/metadata, auth, formatting
npm run build      # dist/ (app) + build/ (server)
npm run test:e2e   # two real browsers call each other (needs `npm start` running
                   # and Playwright installed: npm i -D playwright)
```

The end-to-end test signs in two users in separate browser contexts with
Chromium's fake camera and microphone. It places a video call and checks that
it connects and that live audio and video frames arrive on both sides. It also
covers mute, camera off and on, hang-up, call history and a declined call.

## Run in production

```bash
npm ci
npm run build
PORT=8080 npm start            # serves dist/ and the signaling socket at /ws
```

`GET /healthz` returns `{ ok, online, calls }`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8080` | HTTP port |
| `STATIC_DIR` | `dist` | Built app to serve |
| `STUN_URLS` | Google public STUN | Comma-separated STUN URLs |
| `TURN_URL` | none | Comma-separated TURN URLs, e.g. `turn:turn.example.com:3478,turns:turn.example.com:5349` |
| `TURN_USERNAME`, `TURN_CREDENTIAL` | none | TURN credentials |
| `ALLOWED_ORIGINS` | same host only | Extra origins allowed to open the WebSocket |

Requirements for real-world use:

- **HTTPS is required.** Browsers only grant camera and microphone on secure
  origins. Put the server behind a TLS proxy (nginx, Caddy, a cloud load
  balancer) that forwards WebSocket upgrades on `/ws`.
- **Use a TURN server.** STUN alone connects most home networks, but roughly
  10–20% of calls (corporate firewalls, symmetric NAT, some mobile carriers)
  need a relay. Run [coturn](https://github.com/coturn/coturn) or use a hosted
  TURN service, and set `TURN_URL` / `TURN_USERNAME` / `TURN_CREDENTIAL`.
- **One server instance.** Presence and calls are held in memory, so run a
  single instance (or add a shared store such as Redis before scaling out).

## Security model and limits

- **Sign-in is still a demo.** Any email with a 6+ character password signs in,
  and the signaling server trusts the address the browser presents. Anyone can
  therefore appear as any address. Before going public, add real accounts and
  have `hello` carry a session token that `server/signaling.ts` verifies.
- **Everyone online is visible** to everyone signed in on the same server
  (name and email). Fine for a team or a demo; add contacts or permissions for
  a public service.
- Media is encrypted end to end between the browsers (DTLS-SRTP, mandatory in
  WebRTC). The server only sees who calls whom.
- The server validates every message, limits message size (64 KB) and rate,
  checks the WebSocket `Origin`, drops dead connections with heartbeats, and
  serves static files with path-traversal protection and security headers.
- Calls are one-to-one. Calling phone numbers would need a telephony provider
  (SIP / PSTN gateway); that is not included.

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
  auth/                demo sign-in
  components/, views/  UI (People, Recents, Settings, call screen, sign-in)
server/
  signaling.ts         presence, invitations, SDP/ICE relay (tested)
  index.ts             production HTTP server (static files + /ws)
vite.brand.ts          injects branding into index.html, serves favicon + manifest
scripts/               generate-icons.ts, e2e-call.mjs
```

## Roadmap

- Real accounts and authenticated signaling (see Security model).
- Saved contacts and server-side call history.
- Push notifications for incoming calls when the tab is closed.
- Group calls (needs an SFU such as LiveKit or mediasoup).
- Native Android, iOS and Windows apps are **out of scope for now**; this
  repository is the web application only.
