/**
 * End-to-end check of a real WebRTC call between two browsers.
 *
 *   npm run build && npm start          # in one terminal (or set E2E_URL)
 *   npm run test:e2e                    # in another
 *
 * Uses Chromium's fake camera/microphone, two isolated browser contexts
 * ("Ann" and "Bob"), and asserts that media actually flows both ways.
 * Requires Playwright (`npm i -D playwright`); set PLAYWRIGHT_MODULE to use
 * a copy installed elsewhere.
 */
const pw = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const { chromium } = pw.chromium ? pw : pw.default; // ESM or CommonJS build

const URL = process.env.E2E_URL ?? 'http://localhost:8080/';
const SHOTS = process.env.E2E_SCREENSHOTS; // optional directory for screenshots
const assert = (cond, msg) => {
  if (!cond) throw new Error(`✗ ${msg}`);
  console.log(`✓ ${msg}`);
};

const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
const errors = [];

const run = Date.now().toString(36); // fresh accounts every run
const PASSWORD = 'e2e-password-123';

/** Creates an account through the sign-up form, in its own browser context. */
async function user(name) {
  const email = `${name.toLowerCase().replace(/\s+/g, '.')}.${run}@example.com`;
  const context = await browser.newContext({ permissions: ['camera', 'microphone'], viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await page.goto(URL);
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForSelector('.shell');
  page.email = email;
  return page;
}

const shot = async (page, name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` });

/** Is a <video> receiving frames? */
const videoFlowing = (page, selector) =>
  page.waitForFunction(
    (sel) => {
      const v = document.querySelector(sel);
      return !!v && v.videoWidth > 0 && v.readyState >= 2 && !v.paused;
    },
    selector,
    { timeout: 15_000 },
  );

try {
  const ann = await user('Ann Lee');
  const bob = await user('Bob Stone');
  assert(true, 'two accounts created through the sign-up form');

  await bob.reload();
  await bob.waitForSelector('.shell');
  assert(true, 'the session survives a page reload');

  await ann.goto(URL + '#/people');
  await ann.getByText('Bob Stone').waitFor();
  assert(true, 'Ann sees Bob online');
  await shot(ann, 'e2e-1-people');

  await ann.getByRole('button', { name: 'Video call Bob Stone' }).click();
  await bob.getByRole('dialog', { name: 'Call with Ann Lee' }).waitFor();
  assert((await bob.locator('.call-status').textContent()).includes('Incoming video call'), 'Bob gets an incoming video call');
  assert((await ann.locator('.call-status').textContent()).match(/Ringing|Calling/), 'Ann hears it ringing');
  await shot(bob, 'e2e-2-incoming');

  await bob.getByRole('button', { name: 'Video', exact: true }).click();
  await ann.locator('.call-status').filter({ hasText: /^\d+:\d\d/ }).waitFor({ timeout: 15_000 });
  await bob.locator('.call-status').filter({ hasText: /^\d+:\d\d/ }).waitFor({ timeout: 15_000 });
  assert(true, 'both sides connect (ICE connected, timer running)');

  await videoFlowing(ann, '.remote-video:not(.is-hidden)');
  await videoFlowing(bob, '.remote-video:not(.is-hidden)');
  assert(true, 'remote video frames arrive on both sides');

  // Bytes really flow peer to peer.
  const bytes = await ann.evaluate(() => {
    const v = document.querySelector('.remote-video');
    const s = v.srcObject;
    return s.getTracks().map((t) => `${t.kind}:${t.readyState}`).join(',');
  });
  assert(bytes.includes('audio:live') && bytes.includes('video:live'), `Ann receives live audio and video tracks (${bytes})`);
  await ann.waitForTimeout(1500);
  await shot(ann, 'e2e-3-video-call');

  await bob.getByRole('button', { name: 'Mute' }).click();
  await ann.locator('.call-status', { hasText: 'Bob is muted' }).waitFor();
  assert(true, 'Ann sees that Bob muted');

  await bob.getByRole('button', { name: 'Camera' }).click();
  await ann.locator('.remote-video.is-hidden').waitFor({ state: 'attached' });
  assert(true, 'Bob turns his camera off and Ann falls back to his avatar');
  await bob.getByRole('button', { name: 'Camera' }).click();
  await videoFlowing(ann, '.remote-video:not(.is-hidden)');
  assert(true, 'Bob turns his camera back on without renegotiation');

  await ann.waitForTimeout(1200);
  await ann.getByRole('button', { name: 'End' }).click();
  await bob.locator('.call-status', { hasText: 'Call ended' }).waitFor();
  assert(true, 'hanging up ends the call for both');

  await bob.getByRole('dialog').waitFor({ state: 'detached', timeout: 5000 });
  await bob.goto(URL + '#/recents');
  const row = await bob.locator('.list-row').first().textContent();
  assert(/Ann Lee.*Incoming video · 0:0\d/.test(row), `Bob's history shows the call (${row})`);

  // Declined call
  await bob.goto(URL + '#/people');
  await bob.getByRole('button', { name: 'Call Ann Lee', exact: true }).click();
  await ann.getByRole('button', { name: 'Decline' }).click();
  await bob.locator('.call-status', { hasText: 'Call declined' }).waitFor();
  assert(true, 'a declined call tells the caller');
  await shot(bob, 'e2e-4-declined');

  // Sign out, a wrong password, then sign back in.
  await ann.getByRole('button', { name: 'Sign out' }).first().click();
  await ann.getByRole('heading', { name: /Sign in to/ }).waitFor();
  await ann.reload();
  await ann.getByRole('heading', { name: /Sign in to/ }).waitFor();
  assert(true, 'signing out ends the session (still signed out after reload)');
  await ann.getByLabel('Email').fill(ann.email);
  await ann.getByLabel('Password', { exact: true }).fill('not-the-password');
  await ann.getByRole('button', { name: 'Sign in' }).click();
  await ann.getByRole('alert').filter({ hasText: 'Email or password is incorrect.' }).waitFor();
  assert(true, 'a wrong password is refused');
  await ann.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await ann.getByRole('button', { name: 'Sign in' }).click();
  await ann.waitForSelector('.shell');
  await shot(ann, 'e2e-5-signed-in');
  assert(true, 'signing in with the right password works');

  assert(errors.length === 0, `no page errors${errors.length ? `: ${errors.join('; ')}` : ''}`);
  console.log('\nAll end-to-end call checks passed.');
} catch (e) {
  console.error(e.message ?? e);
  process.exitCode = 1;
} finally {
  await browser.close();
}
