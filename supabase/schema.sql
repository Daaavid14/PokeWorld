-- ============================================================
-- PokéWorld Supabase Database Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ============================================================
-- TABLE: trainer_profiles
-- One row per authenticated user
-- ============================================================
CREATE TABLE IF NOT EXISTS public.trainer_profiles (
  id              UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  username        TEXT        NOT NULL,
  rank            TEXT        NOT NULL DEFAULT 'Rookie Trainer',
  token_balance   INTEGER     NOT NULL DEFAULT 100,
  battles_fought  INTEGER     NOT NULL DEFAULT 0,
  battles_won     INTEGER     NOT NULL DEFAULT 0,
  total_earned    INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT username_length   CHECK (char_length(username) BETWEEN 3 AND 30),
  CONSTRAINT username_chars    CHECK (username ~ '^[a-zA-Z0-9_]+$'),
  CONSTRAINT token_non_neg     CHECK (token_balance >= 0),
  CONSTRAINT battles_non_neg   CHECK (battles_fought >= 0),
  CONSTRAINT wins_non_neg      CHECK (battles_won >= 0),
  CONSTRAINT wins_lte_battles  CHECK (battles_won <= battles_fought),
  UNIQUE (user_id),
  UNIQUE (username)
);

-- Auto-update updated_at on any change
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trainer_profiles_updated_at ON public.trainer_profiles;
CREATE TRIGGER trainer_profiles_updated_at
  BEFORE UPDATE ON public.trainer_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ============================================================
-- TABLE: owned_pokemon
-- Each row = one Pokemon NFT owned by one trainer
-- ============================================================
CREATE TABLE IF NOT EXISTS public.owned_pokemon (
  id              UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pokemon_id      INTEGER     CHECK (pokemon_id BETWEEN 1 AND 898),
  nickname        TEXT        CHECK (char_length(nickname) <= 30),
  level           INTEGER     NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 100),
  acquired_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add columns introduced after initial deploy (safe to re-run)
ALTER TABLE public.owned_pokemon
  ADD COLUMN IF NOT EXISTS species         TEXT    NOT NULL DEFAULT 'Bulbasaur',
  ADD COLUMN IF NOT EXISTS evolution_stage TEXT    NOT NULL DEFAULT 'base',
  ADD COLUMN IF NOT EXISTS experience      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS listing_id      UUID;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'owned_pokemon_evolution_stage_check'
  ) THEN
    ALTER TABLE public.owned_pokemon
      ADD CONSTRAINT owned_pokemon_evolution_stage_check
      CHECK (evolution_stage IN ('base','second','third'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'owned_pokemon_experience_check'
  ) THEN
    ALTER TABLE public.owned_pokemon
      ADD CONSTRAINT owned_pokemon_experience_check
      CHECK (experience >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_owned_pokemon_user_id ON public.owned_pokemon(user_id);
CREATE INDEX IF NOT EXISTS idx_owned_pokemon_species ON public.owned_pokemon(species);


-- ============================================================
-- TABLE: waitlist
-- Landing page newsletter / waitlist sign-ups (public)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.waitlist (
  id         UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  email      TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$'),
  UNIQUE (email)
);


-- ============================================================
-- TABLE: feature_waitlist
-- Tracks interest in upcoming features per user
-- ============================================================
CREATE TABLE IF NOT EXISTS public.feature_waitlist (
  id         UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, feature)
);


-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Critical: enables per-user data isolation
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.trainer_profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owned_pokemon     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_waitlist  ENABLE ROW LEVEL SECURITY;

-- ---- trainer_profiles ----
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'trainer_profiles_select_own' AND tablename = 'trainer_profiles') THEN
    CREATE POLICY "trainer_profiles_select_own" ON public.trainer_profiles FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'trainer_profiles_insert_own' AND tablename = 'trainer_profiles') THEN
    CREATE POLICY "trainer_profiles_insert_own" ON public.trainer_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'trainer_profiles_update_own' AND tablename = 'trainer_profiles') THEN
    CREATE POLICY "trainer_profiles_update_own" ON public.trainer_profiles FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'trainer_profiles_delete_own' AND tablename = 'trainer_profiles') THEN
    CREATE POLICY "trainer_profiles_delete_own" ON public.trainer_profiles FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- ---- owned_pokemon ----
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'owned_pokemon_select_own' AND tablename = 'owned_pokemon') THEN
    CREATE POLICY "owned_pokemon_select_own" ON public.owned_pokemon FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'owned_pokemon_insert_own' AND tablename = 'owned_pokemon') THEN
    CREATE POLICY "owned_pokemon_insert_own" ON public.owned_pokemon FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'owned_pokemon_update_own' AND tablename = 'owned_pokemon') THEN
    CREATE POLICY "owned_pokemon_update_own" ON public.owned_pokemon FOR UPDATE USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'owned_pokemon_delete_own' AND tablename = 'owned_pokemon') THEN
    CREATE POLICY "owned_pokemon_delete_own" ON public.owned_pokemon FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- ---- waitlist (public insert, no read by anon) ----
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'waitlist_public_insert' AND tablename = 'waitlist') THEN
    CREATE POLICY "waitlist_public_insert" ON public.waitlist FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- ---- feature_waitlist ----
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'feature_waitlist_select_own' AND tablename = 'feature_waitlist') THEN
    CREATE POLICY "feature_waitlist_select_own" ON public.feature_waitlist FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'feature_waitlist_insert_own' AND tablename = 'feature_waitlist') THEN
    CREATE POLICY "feature_waitlist_insert_own" ON public.feature_waitlist FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;


-- ============================================================
-- TABLE: market_listings
-- Each row = one active/sold/cancelled NFT listing
-- ============================================================
CREATE TABLE IF NOT EXISTS public.market_listings (
  id          UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  pokemon_id  UUID        NOT NULL REFERENCES public.owned_pokemon(id) ON DELETE CASCADE,
  seller_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  price       INTEGER     NOT NULL CHECK (price >= 1),
  status      TEXT        NOT NULL DEFAULT 'active'
              CHECK (status IN ('active','sold','cancelled')),
  listed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ,
  sold_to     UUID        REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_market_listings_status    ON public.market_listings(status);
CREATE INDEX IF NOT EXISTS idx_market_listings_seller_id ON public.market_listings(seller_id);

ALTER TABLE public.market_listings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'market_listings_select_active' AND tablename = 'market_listings') THEN
    CREATE POLICY "market_listings_select_active" ON public.market_listings FOR SELECT USING (status = 'active' OR auth.uid() = seller_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'market_listings_insert_own' AND tablename = 'market_listings') THEN
    CREATE POLICY "market_listings_insert_own" ON public.market_listings FOR INSERT WITH CHECK (auth.uid() = seller_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'market_listings_update_own' AND tablename = 'market_listings') THEN
    CREATE POLICY "market_listings_update_own" ON public.market_listings FOR UPDATE USING (auth.uid() = seller_id OR auth.uid() = sold_to);
  END IF;
END $$;


-- ============================================================
-- ALTER trainer_profiles: add wallet columns
-- (safe to run multiple times — IF NOT EXISTS guards)
-- ============================================================
ALTER TABLE public.trainer_profiles
  ADD COLUMN IF NOT EXISTS wallet_address TEXT,
  ADD COLUMN IF NOT EXISTS wallet_type    TEXT;


-- ============================================================
-- Grants for new tables
-- ============================================================
GRANT ALL ON public.market_listings TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.market_listings TO authenticated;


-- ============================================================
-- AUTO-CREATE TRAINER PROFILE ON SIGNUP (Edge Function alternative)
-- This trigger fires when a new user is inserted in auth.users
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  username_val TEXT;
BEGIN
  -- Extract username from metadata, fall back to email prefix
  username_val := COALESCE(
    NEW.raw_user_meta_data->>'display_name',
    NEW.raw_user_meta_data->>'full_name',
    split_part(NEW.email, '@', 1)
  );

  -- Sanitize: keep only alphanumeric + underscore, truncate to 30
  username_val := regexp_replace(username_val, '[^a-zA-Z0-9_]', '', 'g');
  username_val := left(username_val, 30);

  -- Ensure minimum length
  IF char_length(username_val) < 3 THEN
    username_val := 'trainer_' || left(NEW.id::text, 8);
  END IF;

  -- Handle duplicate usernames
  IF EXISTS (SELECT 1 FROM public.trainer_profiles WHERE username = username_val) THEN
    username_val := username_val || '_' || floor(random() * 9000 + 1000)::text;
    username_val := left(username_val, 30);
  END IF;

  INSERT INTO public.trainer_profiles (user_id, username, token_balance)
  VALUES (NEW.id, username_val, 100)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ============================================================
-- SAMPLE GRANT for service_role (used by backend/edge functions)
-- ============================================================
GRANT ALL ON public.trainer_profiles TO service_role;
GRANT ALL ON public.owned_pokemon     TO service_role;
GRANT ALL ON public.waitlist          TO service_role;
GRANT ALL ON public.feature_waitlist  TO service_role;

-- Authenticated users (anon key, RLS enforced above)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trainer_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.owned_pokemon     TO authenticated;
GRANT INSERT                         ON public.waitlist          TO anon, authenticated;
GRANT SELECT, INSERT                 ON public.feature_waitlist  TO authenticated;
-- market_listings grants are above
