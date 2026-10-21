// PocketTiles Studio — Supabase cloud config
// Fill in your Supabase project URL, anon key, and bucket name to enable
// one-click cloud publishing. The anon key is safe to commit — it can only
// access what your Row Level Security policies allow.
//
// Setup:
//   1. Create a Supabase project at https://supabase.com
//   2. Create a public Storage bucket (e.g. "pocket-maps")
//   3. Add a storage policy allowing INSERT for anon users (or authenticated)
//   4. Copy your Project URL and anon key from Settings → API

export const SUPABASE_URL    = '';   // e.g. 'https://xxxx.supabase.co'
export const SUPABASE_ANON   = '';   // anon/public key
export const STORAGE_BUCKET  = 'pocket-maps';

export const supabaseConfigured = () =>
    Boolean(SUPABASE_URL && SUPABASE_ANON);
