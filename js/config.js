/**
 * config.js — PokéWorld Supabase Configuration
 *
 * SECURITY NOTES:
 * - The "anon" key is safe to expose in frontend code per Supabase design.
 *   It is NOT a secret. Real security is enforced via Row Level Security (RLS)
 *   policies on the Supabase dashboard, NOT by hiding this key.
 * - Never expose your service_role key in frontend code.
 * - All sensitive operations must go through Supabase RLS or Edge Functions.
 */

// ============================================================
// REPLACE THESE VALUES with your own Supabase project credentials
// Found at: https://app.supabase.com → Project → Settings → API
// ============================================================
const SUPABASE_URL  = 'https://mthmskaxpmwjntahutpe.supabase.co';
const SUPABASE_ANON = 'sb_publishable_MryKpCqBeThpal3TyKucGw_r3VrvGsI';

// ============================================================
// Initialize Supabase client
// ============================================================
const { createClient } = supabase;

const _supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession:    true,          // keep session in localStorage
    autoRefreshToken:  true,          // auto-refresh JWT before expiry
    detectSessionInUrl: true,         // handle OAuth redirect & email confirm links
    storageKey:        'pokeworld-auth',
  },
  global: {
    headers: {
      'X-Client-Info': 'pokeworld-web/1.0',
    },
  },
});

// ============================================================
// App-wide constants
// ============================================================
const APP_CONFIG = {
  appName:       'PokéWorld',
  dashboardUrl:  '/dashboard.html',
  homeUrl:       '/',
  tokenSymbol:   'POKÉ',
  starterPokemon: [1, 4, 7],           // Bulbasaur, Charmander, Squirtle (PokeAPI IDs)
  maxUsernameLen: 30,
  minPasswordLen: 8,
};

// Make available globally
window._supabase  = _supabase;
window.APP_CONFIG = APP_CONFIG;
