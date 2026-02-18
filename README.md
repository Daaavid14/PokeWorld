# 🎮 PokéWorld — Play to Earn Pokemon Universe

> A full-stack Pokemon-themed play-to-earn landing page inspired by Axie Infinity.
> Built with HTML5 · CSS3 · Vanilla JS · Supabase · Deployed on Vercel.

---

## 📁 Project Structure

```
pokemon-world/
├── index.html              ← Landing page (public)
├── dashboard.html          ← Protected trainer dashboard
├── reset-password.html     ← Password reset page (auth redirect)
├── vercel.json             ← Vercel config + security headers
│
├── css/
│   ├── style.css           ← Main styles (dark neon theme)
│   ├── animations.css      ← Keyframes & scroll reveal
│   └── dashboard.css       ← Dashboard-specific styles
│
├── js/
│   ├── config.js           ← Supabase client + app constants
│   ├── auth.js             ← Login, Signup, Google OAuth, Password Reset
│   ├── main.js             ← Landing page logic (PokeAPI, particles, counters)
│   └── dashboard.js        ← Dashboard logic (profile, pokemon, settings)
│
├── assets/
│   ├── pokeball.svg        ← Logo
│   └── poke-token.svg      ← POKÉ token icon
│
└── supabase/
    └── schema.sql          ← Full DB schema with RLS policies
```

---

## 🚀 Quick Setup Guide

### Step 1 — Create a Supabase Project

1. Go to [https://app.supabase.com](https://app.supabase.com) → **New Project**
2. Choose a name (e.g. `pokeworld`) and a strong database password
3. Select the region closest to your users

### Step 2 — Run the Database Schema

1. In your Supabase project → **SQL Editor** → **New Query**
2. Paste the entire contents of `supabase/schema.sql`
3. Click **Run** — this creates all tables, RLS policies, and triggers

### Step 3 — Configure Authentication

In your Supabase project settings:

#### Email Auth
- Go to **Authentication → Providers → Email**
- Enable **Email confirmations** ✅
- Set **Site URL** to your Vercel domain (e.g. `https://pokeworld.vercel.app`)
- Add redirect URLs:
  - `https://pokeworld.vercel.app/dashboard`
  - `https://pokeworld.vercel.app/reset-password`

#### Google OAuth
- Go to **Authentication → Providers → Google**
- Enable it ✅
- Create a Google OAuth app at [https://console.cloud.google.com](https://console.cloud.google.com)
  - Authorized redirect URI: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
- Paste Client ID and Secret into Supabase

### Step 4 — Update `js/config.js`

Open `js/config.js` and replace the placeholder values:

```js
const SUPABASE_URL  = 'https://YOUR_PROJECT_REF.supabase.co';
const SUPABASE_ANON = 'YOUR_ANON_PUBLIC_KEY';
```

Find these values at: **Supabase → Project Settings → API**

> ✅ The `anon` key is safe for frontend use — Supabase RLS enforces security.
> ❌ NEVER use the `service_role` key in frontend code.

### Step 5 — Deploy to Vercel

#### Option A — Vercel CLI (recommended)
```bash
npm install -g vercel
cd pokemon-world
vercel
```
- Framework: **Other**
- Root directory: `./`
- Follow prompts — your site goes live in ~1 minute

#### Option B — Vercel Dashboard (GitHub)
1. Push this folder to a GitHub repo
2. Go to [https://vercel.com](https://vercel.com) → **New Project**
3. Import your GitHub repo
4. Framework: **Other** (no build required)
5. Root directory: `./`
6. Click **Deploy**

#### Option C — Run Locally
```bash
# Using Python
python -m http.server 8080

# Using Node.js
npx serve .

# Using VS Code
# Install "Live Server" extension → Right-click index.html → Open with Live Server
```

---

## 🔒 Security Features

| Feature | Implementation |
|---|---|
| Row Level Security | All Supabase tables have RLS enabled — users can only access their own data |
| Input Sanitization | All user input is sanitized via `createTextNode()` to prevent XSS |
| Client Validation | Email regex, username pattern, password strength enforced before submission |
| HTTPS | Enforced via Vercel + HSTS header (`Strict-Transport-Security`) |
| CSP Header | `Content-Security-Policy` blocks inline scripts and unknown sources |
| X-Frame-Options | Set to `DENY` — prevents clickjacking |
| Auth Redirect | Dashboard redirects unauthenticated users to home |
| Token Security | Supabase JWT auto-refreshed; session stored in localStorage with secure key |
| Password Reset | Uses Supabase's built-in email + token-based reset flow |
| Rate Limiting | Supabase applies built-in rate limiting on auth endpoints |
| No `service_role` Key | Never exposed in frontend code |

---

## 🧾 Supabase Database Tables

| Table | Purpose |
|---|---|
| `trainer_profiles` | One row per user — username, rank, token balance, battle stats |
| `owned_pokemon` | Each Pokemon owned by a trainer |
| `waitlist` | Newsletter/waitlist emails (public insert) |
| `feature_waitlist` | Per-user interest in upcoming features |

---

## 🎨 Features

- **Dark Neon Theme** — Axie Infinity-inspired with Pokemon yellow + cyan
- **Pokemon Showcase** — Live data from PokeAPI with type filters and load-more
- **Type Badges** — Color-coded badges for all 18 Pokemon types
- **Rarity System** — Common / Rare / Epic / Legendary tiers
- **Animated Hero** — Floating Pokemon silhouettes, particle background, counter stats
- **Scroll Reveal** — Elements animate into view as you scroll
- **Auth Modal** — Slide-up modal with tabbed Login/Signup
- **Google OAuth** — One-click Google sign-in
- **Email Verification** — Supabase sends confirm email on signup
- **Password Reset** — Email-based reset with dedicated page
- **Trainer Dashboard** — Profile, Starter Pokémon, settings, password change
- **Mobile Responsive** — Full responsive design, mobile sidebar
- **Accessible** — ARIA roles, keyboard navigation, focus management

---

## 📅 Roadmap

- [x] Q1 2026 — Landing page, Auth, Supabase integration
- [ ] Q2 2026 — PvP Battle System + Marketplace
- [ ] Q3 2026 — Gen II Pokémon + Guilds
- [ ] Q4 2026 — Mobile App (iOS/Android)

---

## ⚠️ Disclaimer

PokéWorld is a fan project. Not affiliated with Nintendo, Game Freak, or The Pokémon Company.
Pokémon names and images are property of their respective owners.
Pokémon data sourced from [PokéAPI](https://pokeapi.co) (open API, fair use).

---

## 📄 License

MIT License — free to use, modify, and distribute.
