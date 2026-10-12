/*
 * Keeps open tabs on the latest release. Calls depend on the browser code and
 * the database agreeing, so a tab left open across a deploy can stop ringing.
 * Every few minutes (and when the tab comes back into view) we fetch the page
 * and compare its script with the one this tab is running; if a new release
 * is live, the tab reloads as soon as it isn't in a call.
 */

const CHECK_EVERY_MS = 5 * 60_000;

const scriptOf = (html: string) => /<script[^>]+type="module"[^>]+src="([^"]+)"/.exec(html)?.[1] ?? null;

export function watchForUpdates(canReload: () => boolean): () => void {
  if (import.meta.env.DEV) return () => {};
  const running = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.getAttribute('src');
  if (!running) return () => {};

  let outdated = false;
  const check = async () => {
    if (!outdated) {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}?v=${Date.now()}`, { cache: 'no-store' });
        const latest = res.ok ? scriptOf(await res.text()) : null;
        outdated = !!latest && latest !== running;
      } catch {
        return; // offline: try again later
      }
    }
    if (outdated && canReload()) window.location.reload();
  };

  const onVisible = () => document.visibilityState === 'visible' && void check();
  const timer = window.setInterval(check, CHECK_EVERY_MS);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onVisible);
  };
}
