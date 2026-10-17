import type { BrandConfig } from './brand.config';
import { themeCss } from './theme';

/*
 * The privacy policy (/privacy) and account deletion page (/delete-account):
 * plain pages outside the React app, so they open quickly from the app
 * stores' listings and from inside the apps. Generated from the branding
 * config at build time (see vite.brand.ts).
 *
 * Keep them true: when the app starts collecting or sharing something new,
 * update the text here and `privacyUpdated` in the config.
 */

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);

const CSS = `
*{box-sizing:border-box}
body{margin:0;background:var(--background);color:var(--text);font:16px/1.6 var(--font);-webkit-text-size-adjust:100%}
main{max-width:720px;margin:0 auto;padding:40px 16px 64px}
header{display:flex;align-items:center;gap:12px;margin-bottom:32px}
header img{width:40px;height:40px}
header a{color:inherit;text-decoration:none;font-weight:700;font-size:20px;letter-spacing:-.01em}
h1{font-size:32px;line-height:1.2;letter-spacing:-.02em;margin:0 0 8px}
h2{font-size:20px;line-height:1.3;margin:36px 0 8px}
p,ul,ol{margin:0 0 14px}
ul,ol{padding-left:22px}
li{margin:4px 0}
.muted{color:var(--text-muted)}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px;margin:20px 0}
a{color:var(--accent)}
footer{margin-top:48px;padding-top:20px;border-top:1px solid var(--border);color:var(--text-muted);font-size:14px}
`;

function page(b: BrandConfig, title: string, description: string, body: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(title)} · ${esc(b.name)}</title>
    <meta name="description" content="${esc(description)}" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <style>${themeCss(b)}${CSS}</style>
  </head>
  <body>
    <main>
      <header>
        <img src="/favicon.svg" alt="" />
        <a href="/">${esc(b.name)}</a>
      </header>
      ${body}
      <footer>
        <a href="/privacy">Privacy policy</a> · <a href="/delete-account">Delete your account</a> ·
        <a href="mailto:${esc(b.supportEmail)}">${esc(b.supportEmail)}</a>
      </footer>
    </main>
  </body>
</html>
`;
}

const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

export function privacyPage(b: BrandConfig): string {
  const n = esc(b.name);
  const mail = `<a href="mailto:${esc(b.supportEmail)}">${esc(b.supportEmail)}</a>`;
  return page(
    b,
    'Privacy policy',
    `How ${b.name} handles your information.`,
    `<h1>Privacy policy</h1>
      <p class="muted">Last updated ${longDate(b.privacyUpdated)}</p>
      <p>${n} lets you make voice and video calls and send messages to other people on ${n}, on the web
        (<a href="${esc(b.website)}">${esc(b.website.replace(/^https:\/\//, ''))}</a>) and in our Android app. It is run by
        ${esc(b.operator)} ("we"). This policy explains what we collect, why, who helps us run the service, and the choices you have.
        We don't sell your information, show ads, or use tracking or analytics tools.</p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account:</strong> your email address, your name (from your email or your Google account, if you sign in with Google),
          the @username you choose, and your profile picture if you add one.</li>
        <li><strong>Messages:</strong> the texts, photos, files, voice messages and stickers you send and receive, with when they were sent,
          delivered and read.</li>
        <li><strong>Calls:</strong> who called whom, when, whether it was a video call, how it ended and how long it lasted. The audio and
          video of calls are never recorded or stored.</li>
        <li><strong>People:</strong> the people you add to your list, the people you block, and any reports you send.</li>
        <li><strong>Notifications:</strong> if you turn on call notifications, a notification address for your device or browser, so
          calls and messages can reach you when ${n} is closed.</li>
        <li><strong>Online status:</strong> while ${n} is open, whether you're online or on a call. This is not stored.</li>
        <li><strong>Permissions:</strong> the microphone and camera are used only during calls and voice messages, and photos and files
          only when you choose to send them. Your call history in Recents is kept on your device.</li>
      </ul>

      <h2>How we use it</h2>
      <p>Only to run ${n}: to sign you in, connect your calls, deliver your messages and notifications, let people find you by your
        @username or email, keep the service safe (for example, acting on reports and preventing abuse), and answer you when you contact us.</p>

      <h2>Who can see it</h2>
      <ul>
        <li>People you call or message see your name, @username, email address and profile picture, and whether you're online or on a call.</li>
        <li>Anyone on ${n} who types your exact @username or email address can find you, call you and message you. There is no
          directory of users. You can block anyone.</li>
        <li>Your messages and files are visible only to you and the person you're chatting with. Your list, the people you block and
          your reports are visible only to you (and reports to us).</li>
      </ul>

      <h2>Service providers</h2>
      <p>We use these companies to run ${n}. They process information only on our behalf:</p>
      <ul>
        <li><strong>Supabase</strong>: accounts, the database, file storage and real-time updates (servers in Mumbai, India).</li>
        <li><strong>LiveKit</strong>: relays the audio and video of calls between the two people in the call.</li>
        <li><strong>Hostinger</strong>: hosts the website and sends our sign-in emails.</li>
        <li><strong>Google</strong>: if you choose "Continue with Google". Browser and phone makers (Google, Apple, Mozilla, Microsoft) deliver
          notifications to your device.</li>
      </ul>
      <p>We may also share information if the law requires it, or to protect people from harm.</p>

      <h2>Security</h2>
      <p>Everything is sent over encrypted connections (HTTPS and TLS), and calls are encrypted in transit. Messages and files are stored
        on our servers, encrypted at rest, and protected by access rules so that only the people in a chat can read it. Messages are not
        end-to-end encrypted. No system is perfectly secure, but we work to protect your information.</p>

      <h2>How long we keep it</h2>
      <p>We keep your information while you have an account. A message you delete for everyone is removed straight away. When you delete
        your account, everything listed under "What we collect" is deleted straight away, except reports other people made about you,
        which we keep as long as needed to keep ${n} safe. Copies in backups are removed within 30 days.</p>

      <h2>Your choices</h2>
      <ul>
        <li>Change your picture or @username, remove people from your list, block and unblock people, and turn notifications off,
          in the app at any time.</li>
        <li>Delete your account in the app: <strong>Settings → Account → Delete account</strong>.
          See <a href="/delete-account">how to delete your account</a> for other ways.</li>
        <li>Ask us for a copy of your information, or to correct it, by writing to ${mail}.</li>
      </ul>

      <h2>Children</h2>
      <p>${n} is not meant for children under 13, and we don't knowingly collect information from them. If you believe a child under 13
        has an account, write to ${mail} and we'll delete it.</p>

      <h2>Changes</h2>
      <p>If we change this policy, we'll update the date at the top, and tell you in the app if the change is important.</p>

      <h2>Contact</h2>
      <p>Questions or requests about your privacy: ${mail}.</p>`,
  );
}

export function deleteAccountPage(b: BrandConfig): string {
  const n = esc(b.name);
  const mail = `<a href="mailto:${esc(b.supportEmail)}?subject=${encodeURIComponent(`Delete my ${b.name} account`)}">${esc(b.supportEmail)}</a>`;
  return page(
    b,
    'Delete your account',
    `How to delete your ${b.name} account and what happens to your information.`,
    `<h1>Delete your ${n} account</h1>
      <p>You can delete your ${n} account at any time, from the app or the website.</p>

      <div class="card">
        <h2 style="margin-top:0">In the app or on the website</h2>
        <ol>
          <li>Open ${n} (or <a href="${esc(b.website)}">${esc(b.website.replace(/^https:\/\//, ''))}</a>) and sign in.</li>
          <li>Go to <strong>Settings</strong>.</li>
          <li>Under <strong>Account</strong>, tap <strong>Delete account</strong> and confirm.</li>
        </ol>
        <p style="margin-bottom:0">Your account is deleted straight away.</p>
      </div>

      <h2>Can't sign in?</h2>
      <p>Email ${mail} from the address you use for ${n}, with the subject "Delete my ${n} account". We'll delete it within 30 days and let you know.</p>

      <h2>What is deleted</h2>
      <ul>
        <li>Your account: email address, name, @username and profile picture.</li>
        <li>All your chats, for both people: messages, photos, files and voice messages.</li>
        <li>Your call records, your list, the people you blocked, and your notification settings.</li>
      </ul>

      <h2>What is kept</h2>
      <ul>
        <li>Reports other people made about you, as long as needed to keep ${n} safe.</li>
        <li>Copies in backups, until they're removed within 30 days.</li>
        <li>Your call history in Recents on your own devices, until you clear the browser's or app's data, or uninstall the app.</li>
      </ul>
      <p>See the <a href="/privacy">privacy policy</a> for more.</p>`,
  );
}
