// Rings people whose browser is closed, with Web Push.
//
//   GET                                   → { publicKey } for PushManager.subscribe
//   POST { action: 'ring',    callId }    caller, right after start_call: "Incoming call"
//   POST { action: 'missed',  callId }    caller, after cancelling or a timeout: "Missed call"
//   POST { action: 'decline', callId, token }
//        the callee's service worker, from the notification's Decline button.
//        It has no session, so it proves itself with the token that came in
//        the push (an HMAC of the call id only this function can make).
//
// ring and missed check the caller's own JWT and read the call with it, so
// row-level security decides whether they're part of it. Each call is pushed
// at most once per kind (calls.ring_pushed_at / missed_pushed_at).
//
// Deploy with JWT verification off (the service worker has no JWT):
//   supabase functions deploy call-push --no-verify-jwt
// Secrets (Supabase dashboard → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY   (npx web-push generate-vapid-keys)
//   VAPID_SUBJECT                         optional, e.g. mailto:you@example.com
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import webpush from 'npm:web-push@3.6.7';

const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? 'https://call.adddots.com,http://localhost:5174')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  Vary: 'Origin',
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Matches the database's ring_timeout(): a push for an older call is pointless. */
const RING_WINDOW_MS = 40_000;

const b64url = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

async function declineToken(callId: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(`call-push:${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`decline:${callId}`)));
}

function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

interface CallRow {
  id: string;
  caller_id: string;
  callee_id: string;
  caller_name: string;
  caller_email: string;
  video: boolean;
  status: string;
  end_reason: string | null;
  created_at: string;
  answered_at: string | null;
}

Deno.serve(async (req) => {
  const headers = { ...cors(req.headers.get('Origin')), 'Content-Type': 'application/json' };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === 'OPTIONS') return new Response(null, { headers });

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!publicKey || !privateKey) return reply(503, { error: 'Call notifications are not set up yet (VAPID secrets missing).' });
  if (req.method === 'GET') return reply(200, { publicKey });
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed' });

  let body: { action?: unknown; callId?: unknown; token?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'Invalid request' });
  }
  const { action, callId, token } = body;
  if (typeof callId !== 'string' || !UUID.test(callId)) return reply(400, { error: 'Invalid call' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  if (action === 'decline') {
    if (typeof token !== 'string' || !sameString(token, await declineToken(callId, privateKey))) return reply(403, { error: 'Not allowed' });
    await admin
      .from('calls')
      .update({ status: 'ended', end_reason: 'declined', ended_at: new Date().toISOString() })
      .eq('id', callId)
      .eq('status', 'ringing');
    return reply(200, { ok: true });
  }
  if (action !== 'ring' && action !== 'missed') return reply(400, { error: 'Invalid action' });

  // The caller, checked with their own session.
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data: auth } = await asUser.auth.getUser();
  if (!auth.user) return reply(401, { error: 'Sign in again to continue.' });
  const { data: call } = await asUser
    .from('calls')
    .select('id, caller_id, callee_id, caller_name, caller_email, video, status, end_reason, created_at, answered_at')
    .eq('id', callId)
    .maybeSingle<CallRow>();
  if (!call || call.caller_id !== auth.user.id) return reply(404, { error: 'Call not found' });

  const now = Date.now();
  const recent = now - Date.parse(call.created_at) < RING_WINDOW_MS + 30_000;
  if (action === 'ring' && (call.status !== 'ringing' || now - Date.parse(call.created_at) > RING_WINDOW_MS)) return reply(200, { sent: 0 });
  const unanswered = call.status === 'ended' && !call.answered_at && (call.end_reason === 'cancelled' || call.end_reason === 'timeout');
  if (action === 'missed' && (!unanswered || !recent)) return reply(200, { sent: 0 });

  // Claim the push, so asking twice never sends twice.
  const column = action === 'ring' ? 'ring_pushed_at' : 'missed_pushed_at';
  const { data: claimed } = await admin
    .from('calls')
    .update({ [column]: new Date().toISOString() })
    .eq('id', callId)
    .is(column, null)
    .select('id');
  if (!claimed?.length) return reply(200, { sent: 0 });

  const { data: subs } = await admin.from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', call.callee_id);
  if (!subs?.length) return reply(200, { sent: 0 });

  const payload = JSON.stringify(
    action === 'ring'
      ? {
          type: 'incoming',
          callId,
          name: call.caller_name,
          email: call.caller_email,
          video: call.video,
          at: Date.parse(call.created_at),
          declineToken: await declineToken(callId, privateKey),
          declineUrl: `${url}/functions/v1/call-push`,
        }
      : { type: 'missed', callId, name: call.caller_name, email: call.caller_email, video: call.video },
  );
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'https://call.adddots.com', publicKey, privateKey);
  const options = {
    TTL: action === 'ring' ? Math.max(1, Math.round((RING_WINDOW_MS - (now - Date.parse(call.created_at))) / 1000)) : 24 * 3600,
    urgency: 'high' as const,
    // A "missed" push replaces an "incoming" one that hasn't been delivered yet.
    topic: callId.replace(/-/g, ''),
  };

  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, options);
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // The browser unsubscribed or the subscription expired: forget it.
        if (status === 404 || status === 410) await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
        else console.warn('[call-push]', status ?? '', (err as Error).message);
      }
    }),
  );
  return reply(200, { sent });
});
