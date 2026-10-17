# Publishing Add Call on Google Play

What to do, in order, to get the Android app (`com.adddots.call`) onto Google
Play, and what to answer in each Play Console form. iOS comes later.

## 1. Developer account (one time)

1. Sign up at [play.google.com/console](https://play.google.com/console) as a
   **Personal** account and pay the one-time US$25 fee.
2. Verify your identity, email address and phone number. Google also asks you
   to sign in to the Play Console app on an Android phone.
3. **Create app**: name *Add Call*, default language English, **App**, **Free**.

New personal accounts must run a **closed test with at least 12 testers, opted
in for 14 days in a row**, before they can publish to everyone (step 6). Line
up 12 people with Android phones and Google accounts early.

## 2. Server changes (one time)

Do README → Set up → **9. Block, report, delete account**: the database
migration, the `delete-account` and `demo-sign-in` functions, the support
mailbox, and a **review account** with `DEMO_EMAILS` / `DEMO_CODE`.

Check that these open: https://call.adddots.com/privacy and
https://call.adddots.com/delete-account (they go live with the next deploy of
`main`).

## 3. Build

README → Android app → **Release build for Google Play**: make the upload key,
then either build on your computer (`android/keystore.properties`, then
`npm run android:bundle`) or let GitHub build it (**Actions → Android
release**, after adding the signing secrets). Upload
`android/app/build/outputs/bundle/release/app-release.aab`. Accept **Play App
Signing** when asked.

## 4. Store listing

**Grow → Store presence → Main store listing**

The text and images are ready in **[docs/store](store/LISTING.md)**: copy
the text from `LISTING.md` and upload the PNGs next to it.

| Field | Value |
| --- | --- |
| App name | Add Call |
| Short description (80) | Voice and video calls and chat with the people you add. No phone number needed. |
| Full description | In `docs/store/LISTING.md` |
| App icon | `docs/store/app-icon-512.png` (512 × 512) |
| Feature graphic | `docs/store/feature-graphic.png` (1024 × 500) |
| Phone screenshots | `docs/store/screenshot-1.png` … `screenshot-4.png` (1080 × 1920) |
| Category | Communication |
| Contact email | `support@adddots.com` (the `supportEmail` in the branding config) |
| Website | https://call.adddots.com |
| Privacy policy | https://call.adddots.com/privacy |

## 5. App content forms

**Policy → App content**

- **Privacy policy**: https://call.adddots.com/privacy
- **App access**: *All or some functionality is restricted*. Add instructions:
  "Enter `<review email>`, tap Send code, then type `<DEMO_CODE>`. To try a
  call, sign in on a second device or browser with another account and find
  each other by @username in People."
- **Ads**: No.
- **Content rating**: questionnaire, category *Communication*. Users can
  interact and exchange content (chat, photos, calls): **Yes**. Shares
  location: No. Digital purchases: No.
- **Target audience**: 13 and over (not designed for children).
- **News app**: No. **Health**: No. **Financial features**: none.
- **Government app**: No.
- **Data safety** (see below).
- **Full-screen intent** (asked because the app shows incoming calls full
  screen): choose *Calling and video calling*, and add a short screen
  recording of an incoming call ringing on a locked phone.
- **Account deletion**: in-app deletion available; URL
  https://call.adddots.com/delete-account

### Data safety answers

- Does the app collect or share user data? **Yes, collects.** Shared with third
  parties: **No** (Supabase, LiveKit and Hostinger are service providers, which
  Google doesn't count as sharing).
- Encrypted in transit: **Yes**.
- Users can request deletion: **Yes** (in the app, and the URL above).

| Data type | Collected | Optional? | Purposes |
| --- | --- | --- | --- |
| Personal info → Name | Yes | Required | App functionality, Account management |
| Personal info → Email address | Yes | Required | App functionality, Account management |
| Personal info → User IDs | Yes | Required | App functionality, Account management |
| Photos and videos → Photos | Yes | Optional | App functionality (profile picture, photos in chats) |
| Audio → Voice or sound recordings | Yes | Optional | App functionality (voice messages) |
| Files and docs | Yes | Optional | App functionality (files in chats) |
| Messages → Other in-app messages | Yes | Optional | App functionality |
| App activity → Other user-generated content | Yes | Optional | App functionality, Fraud prevention, security and compliance (reports) |
| Device or other IDs | Yes | Optional | App functionality (the phone's notification token, to ring it) |
| App info and performance | No | | |
| Location, Contacts (phone), Financial, Health, Web history | No | | |

Call audio and video pass through LiveKit to the other person and are not
stored, so they aren't "collected".

## 6. Testing, then production

1. **Testing → Internal testing**: create a release with the .aab, add
   yourself, install from the link, and check sign-in, calls, chat, block,
   report and delete account on a real phone.
2. **Testing → Closed testing**: add the 12+ testers (a Google Group or an
   email list), share the opt-in link, and keep them opted in for **14 days**.
   Fix what they report; each new upload needs a higher `versionCode`.
3. **Production → Apply for production** (shown after the 14 days): answer
   Google's questions about the test, then create the production release.
   Review usually takes from a day to a week.

## Before every update

- Run **Actions → Android release** with the new version name (the
  `versionCode` goes up by itself), upload the new .aab, write release notes.
- If the app starts collecting something new, update the privacy policy
  (`src/branding/legal.ts`, `privacyUpdated`) and the Data safety form.
