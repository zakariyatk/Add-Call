// Signs in the accounts Google Play (and later Apple) reviewers use. They
// can't read the emailed code, so these accounts also accept one fixed code.
//
//   POST { email, code } → { tokenHash } for supabase.auth.verifyOtp
//                          (type 'email'), when email is a review account
//                          and code is the review code; otherwise 404.
//
// The app only asks here after the normal code was wrong. Wrong review codes
// are counted (demo_sign_in_failures), and after 20 in an hour this stops
// answering for the rest of the hour, so the code can't be guessed.
//
// Each review account must exist first: sign in with it normally once.
//
// Deploy with JWT verification off (people aren't signed in yet):
//   supabase functions deploy demo-sign-in --no-verify-jwt
// Secrets (Supabase dashboard → Edge Functions → Secrets):
//   DEMO_EMAILS   the review accounts, comma-separated
//   DEMO_CODE     the code they accept: 6 digits, not shared anywhere else
// Without both secrets it does nothing.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';

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

const MAX_FAILURES_PER_HOUR = 20;

function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  const headers = { ...cors(req.headers.get('Origin')), 'Content-Type': 'application/json' };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed' });

  const demoCode = (Deno.env.get('DEMO_CODE') ?? '').trim();
  const demoEmails = (Deno.env.get('DEMO_EMAILS') ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const notFound = () => reply(404, { error: 'Not a review account.' });
  if (!/^\d{6}$/.test(demoCode) || !demoEmails.length) return notFound();

  let email: unknown, code: unknown;
  try {
    ({ email, code } = await req.json());
  } catch {
    return reply(400, { error: 'Invalid request' });
  }
  if (typeof email !== 'string' || typeof code !== 'string') return reply(400, { error: 'Invalid request' });
  const address = email.trim().toLowerCase();
  if (!demoEmails.includes(address)) return notFound();

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { count, error: countError } = await admin
    .from('demo_sign_in_failures')
    .select('at', { count: 'exact', head: true })
    .gt('at', new Date(Date.now() - 60 * 60 * 1000).toISOString());
  if (countError) {
    console.error('[demo-sign-in] count', countError.message);
    return reply(500, { error: 'Try again later.' });
  }
  if ((count ?? 0) >= MAX_FAILURES_PER_HOUR) return reply(429, { error: 'Too many attempts. Try again later.' });

  if (!sameString(code.trim(), demoCode)) {
    await admin.from('demo_sign_in_failures').insert({});
    return notFound();
  }

  const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: address });
  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) {
    console.error('[demo-sign-in] link', error?.message ?? 'no token');
    return reply(500, { error: 'Could not sign in. Sign in with this account normally once first.' });
  }
  return reply(200, { tokenHash });
});
