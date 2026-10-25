/* Store screenshots, step 2: the layouts.

   Takes the real app screens capture.mjs saved in out/raw and lays each one
   out as a store image: a headline, the screen in a laptop or phone, a
   round icon badge and, for some, a zoomed-in card of the part that matters.
   Writes PNGs to out/microsoft-store (1920 x 1080) and out/google-play
   (1080 x 1920 phone screenshots and the 1024 x 500 feature graphic). */
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'out');
const raw = join(out, 'raw');
const html = join(out, 'html');
for (const d of [html, join(out, 'microsoft-store'), join(out, 'google-play')]) mkdirSync(d, { recursive: true });

const LOGO = pathToFileURL(join(here, '../../public/icons/icon-512.png')).href;
const img = (n) => pathToFileURL(join(raw, n + '.png')).href;

/* ---------------- icons for the round badges ---------------- */
const I = (d) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
const ICON = {
  phone: I('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z"/>'),
  video: I('<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>'),
  chat: I('<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>'),
  smile: I('<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0"/><path d="M9 9.5h.01M15 9.5h.01"/>'),
  clock: I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  people: I('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.6"/><path d="M16 14.2a5 5 0 0 1 5.5 4.8"/>'),
  moon: I('<path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z"/>'),
  shield: I('<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-4.5"/>')
};

/* ---------------- the look ---------------- */
const BLUE = '#5B3DF5';
const BASE_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=block');
* { box-sizing: border-box; margin: 0; padding: 0 }
html, body { width: var(--w); height: var(--h); overflow: hidden }
body { font-family: Inter, 'Segoe UI', Arial, sans-serif; -webkit-font-smoothing: antialiased; position: relative }
.dark { background: #07080B; color: #fff }
.dark .glow { position: absolute; inset: 0; background:
  radial-gradient(60% 55% at 50% 72%, rgba(91,61,245,.34), rgba(91,61,245,0) 70%),
  radial-gradient(40% 40% at 88% 8%, rgba(91,61,245,.16), rgba(91,61,245,0) 70%) }
.dark .grid { position: absolute; inset: 0; opacity: .5;
  background-image: linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px);
  background-size: 64px 64px; -webkit-mask-image: radial-gradient(70% 70% at 50% 40%, #000, transparent) }
.light { background: #F4F6FA; color: #0A0B0F }
.light .glow { position: absolute; inset: 0; background:
  radial-gradient(60% 55% at 50% 78%, rgba(91,61,245,.20), rgba(91,61,245,0) 70%),
  linear-gradient(180deg, #FFFFFF 0%, #EEF1F7 100%) }
.light .grid { position: absolute; inset: 0; opacity: .7;
  background-image: linear-gradient(rgba(10,11,15,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(10,11,15,.04) 1px, transparent 1px);
  background-size: 64px 64px; -webkit-mask-image: radial-gradient(70% 70% at 50% 40%, #000, transparent) }
.brand { display: inline-flex; align-items: center; gap: 12px; font-weight: 700; letter-spacing: .02em }
.brand svg { display: block; border-radius: 22% }
.dark .brand svg rect { fill: #000 } .dark .brand svg { box-shadow: 0 0 0 1.5px rgba(255,255,255,.25) }
h1 { font-weight: 800; letter-spacing: -.035em; line-height: 1.02 }
h1 em { font-style: normal; color: ${BLUE} }
.dark h1 em { color: #8C7BFF }
.sub { font-weight: 500; letter-spacing: -.005em }
.dark .sub { color: #A9B0C0 } .light .sub { color: #4A5163 }
.badge { position: absolute; border-radius: 50%; display: flex; align-items: center; justify-content: center; z-index: 5 }
.dark .badge { background: #fff; color: #07080B; box-shadow: 0 0 0 10px rgba(91,61,245,.22), 0 24px 60px rgba(0,0,0,.55) }
.light .badge { background: #0A0B0F; color: #fff; box-shadow: 0 0 0 10px rgba(91,61,245,.18), 0 24px 60px rgba(10,20,60,.30) }
.badge svg { width: 52%; height: 52% }
.badge::after { content: ''; position: absolute; right: 6%; bottom: 6%; width: 18%; height: 18%; border-radius: 50%; background: ${BLUE};
  box-shadow: 0 0 0 5px var(--bgc) }
.dark { --bgc: #07080B } .light { --bgc: #F4F6FA }
.card { position: absolute; z-index: 6; border-radius: 18px; overflow: hidden; background-repeat: no-repeat; background-color: #fff;
  box-shadow: 0 2px 0 rgba(255,255,255,.6) inset, 0 30px 80px rgba(5,10,30,.45), 0 0 0 1px rgba(10,11,15,.08) }
.dark .card { box-shadow: 0 40px 100px rgba(0,0,0,.7), 0 0 0 1px rgba(255,255,255,.12), 0 0 0 7px rgba(91,61,245,.25) }
.light .card { box-shadow: 0 40px 90px rgba(10,20,60,.28), 0 0 0 1px rgba(10,11,15,.08), 0 0 0 7px rgba(91,61,245,.14) }
.pill { display: inline-flex; align-items: center; gap: 10px; padding: 9px 18px 9px 14px; border-radius: 999px; font-weight: 600; font-size: 20px; letter-spacing: .01em }
.dark .pill { background: rgba(255,255,255,.07); border: 1px solid rgba(255,255,255,.14); color: #DCE3F5 }
.light .pill { background: #fff; border: 1px solid rgba(10,11,15,.10); color: #2A3040; box-shadow: 0 6px 18px rgba(10,20,60,.06) }
.pill i { width: 9px; height: 9px; border-radius: 50%; background: ${BLUE}; box-shadow: 0 0 0 4px rgba(91,61,245,.22) }
`;

/* a crop of a raw screen as a card: box in CSS px of the capture, which is
   at `dpr` device pixels per CSS px; shown `k` times its CSS size */
function card(name, box, dpr, rawW, rawH, k, pos) {
  const w = box.w * k, h = box.h * k;
  const bw = rawW / dpr * k, bh = rawH / dpr * k;
  return `<div class="card" style="left:${pos.x}px;top:${pos.y}px;width:${w}px;height:${h}px;
    background-image:url('${img(name)}');background-size:${bw}px ${bh}px;background-position:${-box.x * k}px ${-box.y * k}px"></div>`;
}
function cardImg(name, w, h, pos) {
  return `<div class="card" style="left:${pos.x}px;top:${pos.y}px;width:${w}px;height:${h}px;background:#fff url('${img(name)}') 0 0 / ${w}px ${h}px no-repeat"></div>`;
}
function closeUp(name, w, pos) {
  return `<img class="card" src="${img(name)}" style="left:${pos.x}px;top:${pos.y}px;width:${w}px;height:auto" alt="">`;
}
const badge = (icon, x, y, d) => `<div class="badge" style="left:${x}px;top:${y}px;width:${d}px;height:${d}px">${ICON[icon]}</div>`;

/* ---------------- Microsoft Store: 1920 x 1080, a laptop ---------------- */

function laptop(screen, x, y, w) {
  const sw = w, sh = w * 10 / 16, bez = 18;
  return `
  <div style="position:absolute;left:${x}px;top:${y}px;width:${sw + bez * 2}px;z-index:2">
    <div style="background:linear-gradient(180deg,#24262C,#0E0F12);border-radius:26px 26px 6px 6px;padding:${bez}px ${bez}px ${bez + 8}px;
      box-shadow:0 0 0 1.5px #3A3D45 inset, 0 50px 120px rgba(0,0,0,.45)">
      <div style="width:${sw}px;height:${sh}px;border-radius:6px;overflow:hidden;background:#fff url('${img(screen)}') 0 0 / ${sw}px ${sh}px no-repeat"></div>
    </div>
    <div style="margin:0 -${Math.round(w * 0.07)}px;height:26px;border-radius:2px 2px 22px 22px;
      background:linear-gradient(180deg,#E9ECF2 0%,#C9CED8 55%,#9EA4B0 100%);box-shadow:0 18px 40px rgba(0,0,0,.35)">
      <div style="width:16%;height:9px;margin:0 auto;border-radius:0 0 10px 10px;background:#B4BAC6"></div>
    </div>
  </div>`;
}

function deskSlide(o) {
  const head = `
    <div style="position:absolute;left:0;right:0;top:62px;text-align:center;z-index:3">
      <div class="pill"><i></i>${o.eyebrow}</div>
      <h1 style="font-size:${o.hsize || 76}px;margin-top:22px">${o.title}</h1>
      ${o.sub ? '<p class="sub" style="font-size:27px;margin-top:16px">' + o.sub + '</p>' : ''}
    </div>`;
  const body = o.body || laptop(o.screen, 412, 318, 1060);
  return page(1920, 1080, o.theme, head + body + (o.extra || ''));
}

function page(w, h, theme, inner) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>:root{--w:${w}px;--h:${h}px}${BASE_CSS}</style></head>
  <body class="${theme}"><div class="glow"></div><div class="grid"></div>${inner}</body></html>`;
}

const DESK = [
  { file: '01-calls-simply-added', theme: 'dark', screen: 'd2-chat', eyebrow: 'Add Call',
    title: 'Calls, <em>simply added.</em>', sub: 'Voice and video calls and chat with the people you add.',
    extra: badge('phone', 300, 500, 168) },
  { file: '02-rings-like-a-phone', theme: 'light', screen: 'd7-incoming', eyebrow: 'Incoming calls',
    title: 'Rings like a <em>phone call.</em>', sub: 'Full screen, with Accept, Video and Decline. Even when the app is closed.',
    extra: badge('video', 300, 500, 168) },
  { file: '03-stickers', theme: 'dark', screen: 'd6-stickers', eyebrow: 'Chats',
    title: 'Photos, voice notes <em>and stickers.</em>', sub: 'Chat like you do on your phone, with read ticks and typing.',
    extra: badge('smile', 300, 500, 168) },
  { file: '04-online', theme: 'light', screen: 'd4-people', eyebrow: 'People',
    title: 'See who’s <em>online.</em>', sub: 'Add people by @username. No phone number needed.',
    extra: badge('people', 300, 500, 168) },
  { file: '05-call-history', theme: 'dark', screen: 'd3-calls', eyebrow: 'Calls',
    title: 'Every call, <em>one tap to call back.</em>', sub: 'Incoming, outgoing and missed, voice and video.',
    extra: badge('clock', 300, 500, 168) },
  { file: '06-dark-mode', theme: 'light', screen: 'd8-dark-chat', eyebrow: 'Dark mode',
    title: 'Easy on the eyes, <em>day or night.</em>', sub: 'Light and dark themes, or follow your system.',
    extra: badge('moon', 300, 500, 168) },
  { file: '07-your-account', theme: 'dark', screen: 'd5-settings', eyebrow: 'Settings',
    title: 'Your account, <em>your control.</em>', sub: 'Block people, choose your ringtone, or delete your account any time.',
    extra: badge('shield', 300, 500, 168) }
];

/* ---------------- Google Play: 1080 x 1920, a phone ---------------- */

function phone(screen, x, y, w) {
  const sh = w * 2402 / 1082, bez = 16, SB = 46;
  return `
  <div style="position:absolute;left:${x}px;top:${y}px;width:${w + bez * 2}px;padding:${bez}px;border-radius:78px;z-index:2;
    background:linear-gradient(160deg,#2A2D35,#0B0C0F 60%);box-shadow:0 0 0 2px #3E424C inset, 0 0 0 1px rgba(255,255,255,.08), 0 60px 140px rgba(0,0,0,.5)">
    <div style="position:relative;width:${w}px;height:${sh}px;border-radius:62px;overflow:hidden;background:#F3F4F8 url('${img(screen)}') 0 ${SB}px / ${w}px ${sh}px no-repeat">
      <div style="position:absolute;left:0;right:0;top:0;height:${SB}px;background:#F3F4F8;display:flex;align-items:center;justify-content:space-between;
        padding:4px 44px 0 50px;font:600 19px Inter,'Segoe UI',sans-serif;color:#0A0B0F">
        <span>9:41</span>
        <span style="display:flex;gap:7px;align-items:center">
          <svg width="20" height="14" viewBox="0 0 20 14"><rect x="0" y="9" width="3.5" height="5" rx="1" fill="#0A0B0F"/><rect x="5.5" y="6" width="3.5" height="8" rx="1" fill="#0A0B0F"/><rect x="11" y="3" width="3.5" height="11" rx="1" fill="#0A0B0F"/><rect x="16.5" y="0" width="3.5" height="14" rx="1" fill="#0A0B0F"/></svg>
          <svg width="18" height="14" viewBox="0 0 18 14"><path d="M9 13.5l3-3.6a4.6 4.6 0 0 0-6 0zM2.6 6.9a9.6 9.6 0 0 1 12.8 0l-1.9 2.3a6.7 6.7 0 0 0-9 0zM0 3.8a13.6 13.6 0 0 1 18 0l-1.9 2.2a10.7 10.7 0 0 0-14.2 0z" fill="#0A0B0F"/></svg>
          <svg width="28" height="14" viewBox="0 0 28 14"><rect x=".5" y=".5" width="23" height="13" rx="3.5" fill="none" stroke="#0A0B0F" opacity=".45"/><rect x="2.5" y="2.5" width="16" height="9" rx="2" fill="#0A0B0F"/><rect x="25" y="4.5" width="2" height="5" rx="1" fill="#0A0B0F" opacity=".45"/></svg>
        </span>
      </div>
      <div style="position:absolute;left:50%;top:13px;width:22px;height:22px;margin-left:-11px;border-radius:50%;background:#0B0C0F;box-shadow:0 0 0 3px #1B1D22"></div>
    </div>
  </div>`;
}

function phoneSlide(o) {
  const head = `
    <div style="position:absolute;left:70px;right:70px;top:110px;z-index:3">
      <div class="pill" style="font-size:26px;padding:11px 22px 11px 16px"><i></i>${o.eyebrow}</div>
      <h1 style="font-size:${o.hsize || 98}px;margin-top:30px">${o.title}</h1>
      <p class="sub" style="font-size:36px;margin-top:22px;line-height:1.35">${o.sub}</p>
    </div>`;
  return page(1080, 1920, o.theme, head + phone(o.screen, 230, o.top || 640, 588) + (o.extra || ''));
}

const PHONE = [
  { file: '01-rings-like-a-phone', theme: 'dark', screen: 'p7-incoming', eyebrow: 'Add Call', title: 'Rings like a<br><em>phone call.</em>',
    sub: 'Even when the app is closed.', extra: badge('phone', 92, 1040, 168) },
  { file: '02-chat', theme: 'light', screen: 'p2-chat', eyebrow: 'Chats', title: 'Chat with the<br><em>people you add.</em>',
    sub: 'Photos, voice notes and files.', extra: badge('chat', 92, 1040, 168) },
  { file: '03-stickers', theme: 'dark', screen: 'p6-stickers', eyebrow: 'Stickers', title: 'Say it with<br><em>stickers.</em>',
    sub: 'Big, bright 3D stickers and emoji.', extra: badge('smile', 92, 1040, 168) },
  { file: '04-online', theme: 'light', screen: 'p4-people', eyebrow: 'People', title: 'See who’s<br><em>online.</em>',
    sub: 'Add people by @username. No phone number.', extra: badge('people', 92, 1040, 168) },
  { file: '05-call-history', theme: 'dark', screen: 'p3-calls', eyebrow: 'Calls', title: 'One tap to<br><em>call back.</em>',
    sub: 'Your voice and video call history.', extra: badge('clock', 92, 1040, 168) },
  { file: '06-chats', theme: 'light', screen: 'p1-chats', eyebrow: 'Messages', title: 'Never miss<br><em>a message.</em>',
    sub: 'Unread badges, read ticks and typing.', extra: badge('chat', 92, 1040, 168) },
  { file: '07-dark-mode', theme: 'dark', screen: 'p8-dark-chat', eyebrow: 'Dark mode', title: 'Easy on the eyes,<br><em>day or night.</em>',
    sub: 'Light and dark themes.', extra: badge('moon', 92, 1040, 168) },
  { file: '08-your-account', theme: 'light', screen: 'p5-settings', eyebrow: 'Settings', title: 'Your account,<br><em>your control.</em>',
    sub: 'Block, report, or delete your account.', extra: badge('shield', 92, 1040, 168) }
];

/* ---------------- Google Play feature graphic: 1024 x 500 ---------------- */

function feature() {
  const inner = `
    <div style="position:absolute;left:64px;top:90px;z-index:3;width:420px">
      <div class="brand" style="font-size:22px;gap:14px"><img src="${LOGO}" width="58" height="58" style="border-radius:14px" alt=""><span>Add Call</span></div>
      <h1 style="font-size:46px;margin-top:28px;white-space:nowrap">Calls, simply<br><em>added.</em></h1>
      <p class="sub" style="font-size:20px;margin-top:18px;max-width:370px;line-height:1.4">Voice and video calls and chat with the people you add.</p>
    </div>
    <div style="position:absolute;left:520px;top:70px;width:620px;height:400px;border-radius:16px;overflow:hidden;z-index:2;
      background:#fff url('${img('d2-chat')}') 0 0 / 640px 400px no-repeat;box-shadow:0 0 0 1px rgba(255,255,255,.14), 0 40px 90px rgba(0,0,0,.6)"></div>
    <div style="position:absolute;left:478px;top:150px;width:170px;padding:8px;border-radius:30px;z-index:4;
      background:linear-gradient(160deg,#2A2D35,#0B0C0F 60%);box-shadow:0 0 0 1.5px #3E424C inset, 0 30px 70px rgba(0,0,0,.6)">
      <div style="width:154px;height:${154 * 2402 / 1082}px;border-radius:23px;background:#fff url('${img('p7-incoming')}') 0 0 / 154px ${154 * 2402 / 1082}px no-repeat"></div>
    </div>`;
  return page(1024, 500, 'dark', inner);
}

/* ---------------- render ---------------- */

const browser = await chromium.launch({ channel: 'msedge' });
async function render(htmlText, w, h, to) {
  const f = join(html, to.split(/[\\/]/).pop().replace('.png', '.html'));
  writeFileSync(f, htmlText);
  const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await p.goto(pathToFileURL(f).href, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(300);
  await p.screenshot({ path: to });
  await p.close();
  console.log('wrote', to);
}
for (const s of DESK) await render(deskSlide(s), 1920, 1080, join(out, 'microsoft-store', s.file + '.png'));
for (const s of PHONE) await render(phoneSlide(s), 1080, 1920, join(out, 'google-play', 'phone-' + s.file + '.png'));
await render(feature(), 1024, 500, join(out, 'google-play', 'feature-graphic.png'));
await browser.close();
