# Add Call brand guide

## Name

The product is **Add Call**: two words, both capitalised, with a space. Use it as
is in UI copy, titles and docs. Never write "AddCall" or "Addcall", and never
abbreviate it. `shortName` (used under home-screen icons) is also "Add Call".

## Logo

The mark is a **speech-bubble tile** (communication) holding a bold **"A"** whose
crossbar is a **"+"** (add). It reads as "A+", short for *Add*, inside a
conversation bubble.

| Element | Meaning | Light theme | Dark theme |
| --- | --- | --- | --- |
| Bubble tile | calling, conversation | `#0A0A0A` | `#FAFAFA` |
| "A" glyph | Add Call | `#FFFFFF` | `#0A0A0A` |
| "+" crossbar | add (the accent) | `#7B61FF` | `#5B3DF5` |

Variants (all generated from `src/branding/logo.ts`):

- **Mark**: the bubble on a transparent background. Used in the app, the
  favicon (`/favicon.svg` switches to the dark-theme colours when the browser is
  in dark mode) and the 32/192/512 px PNGs.
- **App icon**: a full-bleed square with the glyph inside the maskable safe zone.
  Used for the Apple touch icon and the maskable PWA icon.
- **Lockup**: the mark followed by the name "Add Call" in bold with tight tracking.
  Used in the sidebar, the mobile top bar, sign-in and Settings → About.

Keep clear space of at least ¼ of the mark's width around it. Don't recolour
the glyph, stretch the mark, or put the light-theme mark on a dark background
(the app does this switch automatically).

## Colour

A premium, minimal palette: black, white and neutral greys, plus **one accent,
Electric Violet**.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `background` | `#FAFAFA` | `#0A0A0A` | page |
| `surface` | `#FFFFFF` | `#141415` | cards, sidebar, inputs |
| `surfaceMuted` | `#F2F2F3` | `#1E1E20` | hover, keypad keys, segmented controls |
| `border` | `#E4E4E7` | `#2A2A2E` | hairlines |
| `text` | `#0A0A0A` | `#FAFAFA` | primary text |
| `textMuted` | `#62626A` | `#A1A1AA` | secondary text |
| `accent` | `#5B3DF5` | `#8C7BFF` | call buttons, primary actions, active nav, focus |
| `accentInk` | `#FFFFFF` | `#0A0A0A` | text/icons on the accent |
| `danger` | `#D93036` | `#F0545A` | end call, missed calls, errors (functional, not brand) |

The accent is reserved for *action*: anything you press to call, plus the
current selection. Everything else stays neutral. The sign-in hero and the call
screen always use the dark palette (`.always-dark`) in both themes.

Every pair above is checked by `src/branding/branding.test.ts`: body text ≥ 7:1,
muted text, accent and danger ≥ 4.5:1 (WCAG AA), and logo glyph contrast.

## Type

System UI sans-serif (Inter when installed), bold weights with tight negative
tracking for headings and the wordmark, tabular numerals for timers and numbers.

## Changing the branding

1. Edit `src/branding/brand.config.ts`.
2. If you changed logo colours: `npm run icons` to regenerate `public/icons/*.png`.
3. `npm test`: fails if a colour change breaks contrast, a metadata tag loses
   the name, or an icon the metadata points to is missing.
4. `npm run build`.

The title, meta tags, `theme-color`, `manifest.webmanifest`, `favicon.svg`, CSS
tokens and all in-app text pick up the change automatically.
