# Add Call

**Calls, simply added.** Add Call is a web calling app: sign in, browse recent
calls and contacts, dial from a keypad, and place voice or video calls from the
browser.

> **Status: web preview.** The interface is complete. Calling is **simulated**
> (dial → ringing → connected → ended, with a live timer and call controls) and
> sign-in is a **demo** (any email with a password of 6+ characters). Both are
> isolated so a real backend can replace them without UI changes. See
> [Roadmap](#roadmap).

## Features

- **Sign in** with a branded split-screen login.
- **Recents**: call history with incoming / outgoing / missed, video calls,
  durations and a *Missed* filter. The nav shows a badge for missed calls.
- **Contacts**: alphabetical, searchable by name or number, one-tap voice or video call.
- **Keypad**: on-screen dial pad (also works from the keyboard). It matches
  typed numbers to contacts.
- **Call screen**: full-screen call view with mute, speaker, video and end call.
  Finished calls are added to Recents.
- **Settings**: account, theme (System / Light / Dark), calling preferences, About.
- Light and dark themes, responsive layout (sidebar on desktop, tab bar on
  phones), keyboard and screen-reader friendly.

## Branding

All branding lives in **[`src/branding/brand.config.ts`](src/branding/brand.config.ts)**:
product name, tagline, description, logo colours, light and dark palettes,
the accent colour, corner radius and font. The page title, meta tags,
`theme-color`, web app manifest, favicon, colour tokens and every in-app use of
the name are generated from it.

See **[docs/BRANDING.md](docs/BRANDING.md)** for the logo concept, colour system
and how to change them.

## Develop

Requires Node 20+.

```bash
npm install
npm run dev        # http://localhost:5174
```

### Quality checks

```bash
npm run typecheck  # TypeScript, strict
npm run lint       # ESLint
npm test           # Vitest: branding, contrast, metadata, auth, call logic, formatting
npm run build      # production build into dist/
npm run preview    # serve the production build locally
```

`npm run icons` regenerates the PNG app icons in `public/icons/` after you change
logo colours.

## Project layout

```
src/
  branding/      brand.config.ts (edit this), logo.ts, theme.ts (+ tests)
  auth/          demo sign-in and session storage
  calls/         call state machine, simulated call driver, sample data
  components/    app shell, logo, icons, shared UI
  views/         login, recents, contacts, keypad, settings, call screen
  styles/        app.css (uses only brand tokens)
vite.brand.ts    injects branding into index.html, serves favicon + manifest
scripts/         generate-icons.ts
public/icons/    PNG app icons (generated)
docs/            BRANDING.md
```

## Roadmap

- Real calling: replace `src/calls/useSimulatedCall.ts` with a WebRTC / SIP /
  CPaaS driver that dispatches the same actions to `callReducer`.
- Real authentication: replace `createAuth().signIn` in `src/auth/session.ts`
  with an API call; the rest of the app only uses the `Session` shape.
- Contacts and call history from a backend instead of `src/calls/sampleData.ts`.
- Native Android, iOS and Windows apps are **out of scope for now**; this
  repository is the web application only.
