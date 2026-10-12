// Gives the two people in an accepted call a short-lived pass to its LiveKit
// room. The caller must be signed in (Supabase checks the JWT before this
// runs); the call row is read with their own token, so row-level security
// decides whether they are part of it.
//
// Secrets (Supabase dashboard → Edge Functions → Secrets):
//   LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
import { AccessToken } from 'npm:livekit-server-sdk@2.19.1';

// The website, plus the Android and iOS apps (Capacitor serves them from these origins).
const APP_ORIGINS = ['https://localhost', 'capacitor://localhost'];
const ALLOWED_ORIGINS = [
  ...(Deno.env.get('ALLOWED_ORIGINS') ?? 'https://call.adddots.com,http://localhost:5174')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  ...APP_ORIGINS,
];

const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const headers = { ...cors(req.headers.get('Origin')), 'Content-Type': 'application/json' };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed' });

  const url = Deno.env.get('LIVEKIT_URL');
  const apiKey = Deno.env.get('LIVEKIT_API_KEY');
  const apiSecret = Deno.env.get('LIVEKIT_API_SECRET');
  if (!url || !apiKey || !apiSecret) return reply(503, { error: 'Calling is not set up yet (LiveKit secrets missing).' });

  let callId: unknown;
  try {
    ({ callId } = await req.json());
  } catch {
    return reply(400, { error: 'Invalid request' });
  }
  if (typeof callId !== 'string' || !UUID.test(callId)) return reply(400, { error: 'Invalid call' });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return reply(401, { error: 'Sign in again to continue.' });

  const { data: call } = await supabase.from('calls').select('id, status, caller_id, caller_name, callee_name').eq('id', callId).maybeSingle();
  if (!call) return reply(404, { error: 'Call not found' });
  if (call.status !== 'accepted') return reply(409, { error: 'This call has ended.' });

  const token = new AccessToken(apiKey, apiSecret, {
    identity: user.id,
    name: user.id === call.caller_id ? call.caller_name : call.callee_name,
    ttl: '2h',
  });
  token.addGrant({ room: `call-${call.id}`, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: false });
  return reply(200, { url, token: await token.toJwt() });
});
