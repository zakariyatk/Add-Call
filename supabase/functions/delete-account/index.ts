// Deletes the signed-in person's account and everything in it: their profile,
// list, blocks, call history, push subscriptions, profile picture, and every
// chat they're in (messages and files, for both people). Reports about them
// are kept, for safety.
//
// The database removes rows on its own when the account goes (foreign keys
// cascade from auth.users); files in Storage have to be removed here first.
//
// Deploy with JWT verification on (the default): only signed-in people can
// call it, and it only ever deletes the account the JWT belongs to.
//   supabase functions deploy delete-account
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';

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

const PAGE = 1000;

/** Every file under a folder, down to `depth` folders deep. */
async function filesUnder(admin: SupabaseClient, bucket: string, folder: string, depth: number): Promise<string[]> {
  const files: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.storage.from(bucket).list(folder, { limit: PAGE, offset });
    if (error) throw new Error(`list ${bucket}/${folder}: ${error.message}`);
    for (const item of data ?? []) {
      const path = `${folder}/${item.name}`;
      // Folders come back without an id.
      if (item.id) files.push(path);
      else if (depth > 0) files.push(...(await filesUnder(admin, bucket, path, depth - 1)));
    }
    if (!data || data.length < PAGE) return files;
  }
}

async function removeFiles(admin: SupabaseClient, bucket: string, paths: string[]) {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
    if (error) throw new Error(`remove from ${bucket}: ${error.message}`);
  }
}

Deno.serve(async (req) => {
  const headers = { ...cors(req.headers.get('Origin')), 'Content-Type': 'application/json' };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  });
  const { data: auth } = await asUser.auth.getUser();
  const user = auth.user;
  if (!user) return reply(401, { error: 'Sign in again to delete your account.' });

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  try {
    // Chat files live under <conversation id>/<sender id>/<file>.
    const { data: conversations, error } = await admin.from('conversations').select('id').or(`user_a.eq.${user.id},user_b.eq.${user.id}`);
    if (error) throw new Error(`conversations: ${error.message}`);
    for (const c of conversations ?? []) await removeFiles(admin, 'chat-media', await filesUnder(admin, 'chat-media', c.id, 1));
    // Profile pictures live under <user id>/<file>.
    await removeFiles(admin, 'avatars', await filesUnder(admin, 'avatars', user.id, 0));

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw new Error(`delete user: ${deleteError.message}`);
  } catch (err) {
    console.error('[delete-account]', user.id, err);
    return reply(500, { error: 'Could not delete your account right now. Please try again.' });
  }
  return reply(200, { deleted: true });
});
