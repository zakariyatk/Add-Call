import { createClient } from '@supabase/supabase-js';

/*
 * The Supabase project behind Add Call (accounts, calls, who's online).
 * Both values are public by design: the publishable key only allows what the
 * database's row-level security and functions allow. Override them with
 * VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY to point at another project.
 */
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? 'https://zqwuztvbpfifmkwtjyyk.supabase.co';
export const SUPABASE_KEY: string = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? 'sb_publishable_Fbq7nPSUye9pQk-ogc0ybg_0l9YAENi';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    // Google sign-in returns with ?code=…, which works alongside the app's #/ routes.
    flowType: 'pkce',
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  },
});
