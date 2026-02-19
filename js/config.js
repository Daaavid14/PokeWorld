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
// SUPABASE
// ============================================================
const SUPABASE_URL  = 'https://mthmskaxpmwjntahutpe.supabase.co';
const SUPABASE_ANON = 'sb_publishable_MryKpCqBeThpal3TyKucGw_r3VrvGsI';

// ============================================================
// BLOCKCHAIN — Sepolia Testnet (chainId: 11155111)
// Contract addresses deployed 2026-02-18
// ============================================================
const CHAIN_CONFIG = {
  chainId:        11155111,
  chainName:      'Sepolia Testnet',
  // Primary RPC. Fallbacks are tried automatically by blockchain.js if this fails.
  rpcUrl:         'https://sepolia.drpc.org',
  rpcFallbacks: [
    'https://ethereum-sepolia-rpc.publicnode.com',
    'https://sepolia.gateway.tenderly.co',
    'https://rpc2.sepolia.org',
    'https://rpc.sepolia.org',
  ],
  blockExplorer:  'https://sepolia.etherscan.io',
  nativeCurrency: { name: 'Sepolia ETH', symbol: 'ETH', decimals: 18 },

  contracts: {
    PokeToken:       '0xF7dda35d8f16E71ad39894Eb65F30D6a4E92B67D',
    PokeWorldNFT:    '0xAd05685373ab184EBc2876b25918aAd148462B86',
    PokeEvolution:   '0x67FC80b89FD07d96417b8fA12FD32f0AAb6A9162',
    PokeMarketplace: '0x9d151541901ff436Ba01cBC19bFb29BC95ED8725',
  },
};

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
  starterPokemon: ['Bulbasaur', 'Charmander', 'Squirtle'],
  maxUsernameLen: 30,
  minPasswordLen: 8,
};

// Make available globally
window._supabase   = _supabase;
window.APP_CONFIG  = APP_CONFIG;
window.CHAIN_CONFIG = CHAIN_CONFIG;
