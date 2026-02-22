/**
 * dashboard.js — PokéWorld Dashboard Logic
 *
 * Protected page — redirects unauthenticated users to home.
 * Handles: profile, Pokemon display, settings, password change,
 *          account deletion, sidebar navigation.
 */

/* ============================================================
   AUTH GUARD — redirect if not logged in
   ============================================================ */

async function authGuard() {
  const { data: { session } } = await _supabase.auth.getSession();

  if (!session) {
    showToast('Please log in to access your dashboard.', 'warning', 3000);
    setTimeout(() => { window.location.href = APP_CONFIG.homeUrl; }, 1500);
    return null;
  }
  return session;
}

/* ============================================================
   PROFILE & STATS
   ============================================================ */

// Holds the current session so any panel can re-read user info
let _currentSession = null;

/**
 * Format a POKE balance so the display never exceeds 6 digits.
 * ≥ 1B → "1.0B", ≥ 1M → "1.0M", otherwise locale string (up to 999,999).
 */
function formatPokeBalance(n) {
  n = Number(n) || 0;
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  return n.toLocaleString();
}

async function loadProfile(session) {
  _currentSession = session;
  const user = session.user;
  const name = user.user_metadata?.display_name
            || user.user_metadata?.full_name
            || user.email?.split('@')[0]
            || 'Trainer';

  // Topbar & sidebar
  document.getElementById('topbarUsername').textContent = name;
  document.getElementById('profileName').textContent    = name;

  // Fetch trainer record from DB
  const { data: trainer, error } = await _supabase
    .from('trainer_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!error && trainer) {
    const rank = trainer.rank || 'Rookie Trainer';
    document.getElementById('profileRank').textContent  = rank;
    const el = document.getElementById('topbarRank');
    if (el) el.textContent = rank;
    const bal = formatPokeBalance(trainer.token_balance || 0);
    document.getElementById('tokenBalance').textContent = bal;
    document.getElementById('walletBalance').textContent = `${bal} POKÉ`;

    // Overview stats
    document.getElementById('totalBattles').textContent = trainer.battles_fought  || 0;
    document.getElementById('battleWins').textContent   = trainer.battles_won     || 0;
    document.getElementById('totalEarned').textContent  = trainer.total_earned    || 0;

    // Pre-fill settings
    document.getElementById('settingsUsername').value = trainer.username || name;
    document.getElementById('settingsEmail').value    = user.email || '';

  } else {
    // No profile yet — create one
    await createTrainerProfile(user);
    document.getElementById('settingsEmail').value = user.email || '';
    document.getElementById('settingsUsername').value = name;
  }
}

async function createTrainerProfile(user) {
  const username = user.user_metadata?.display_name
                || user.user_metadata?.full_name
                || user.email?.split('@')[0]
                || 'Trainer';

  const { error } = await _supabase
    .from('trainer_profiles')
    .insert([{
      user_id:        user.id,
      username:       username.slice(0, 30),
      rank:           'Rookie Trainer',
      token_balance:  100, // welcome bonus
      battles_fought: 0,
      battles_won:    0,
      total_earned:   0,
    }]);

  if (!error) {
    const el = document.getElementById('topbarRank');
    if (el) el.textContent = 'Rookie Trainer';
    document.getElementById('tokenBalance').textContent = '100';
    document.getElementById('walletBalance').textContent = '100 POKÉ';
    showToast('Welcome to PokéWorld! You received 100 POKÉ as a welcome bonus! 🎉', 'success', 5000);
  }
}

/* ============================================================
   STARTER POKEMON
   ============================================================ */

async function loadStarterPokemon(userId) {
  const grid    = document.getElementById('starterGrid');
  const totalEl = document.getElementById('totalPokemon');
  if (!grid) return;

  try {
    const { data: owned } = await _supabase
      .from('owned_pokemon')
      .select('id, pokemon_id, species, nickname, level, experience')
      .eq('user_id', userId)
      .limit(3);

    const allSameSpecies  = owned?.length > 0 && owned.every(r => r.species === owned[0].species);
    const isCorruptStarters = allSameSpecies && owned?.length === 3 && owned[0].species === 'Bulbasaur';

    if (isCorruptStarters) {
      await _supabase.from('owned_pokemon').delete().eq('user_id', userId);
      owned.length = 0;
    }

    if (!owned?.length) {
      const starterSpecies    = ['Bulbasaur', 'Charmander', 'Squirtle'];
      const starterPokedexIds = [1, 4, 7];
      const insertData = starterSpecies.map((species, i) => ({
        user_id: userId, pokemon_id: starterPokedexIds[i],
        species, nickname: null, level: 1, experience: 0, evolution_stage: 'base',
      }));
      const { data: inserted } = await _supabase
        .from('owned_pokemon').insert(insertData)
        .select('id, pokemon_id, species, nickname, level, experience');
      if (inserted) owned?.push(...inserted);
    }

    if (totalEl) totalEl.textContent = owned ? owned.length : 0;

    const starterNames = ['Bulbasaur','Charmander','Squirtle'];
    const rows = owned?.length
      ? owned.slice(0, 3)
      : starterNames.map((s, i) => ({ id: `starter-${i}`, species: s, nickname: null, level: 1, experience: 0 }));

    grid.innerHTML = '';
    for (const row of rows) {
      const species     = row.species || starterNames[0];
      const rowIdStr    = String(row.id);
      const colorIdx    = rowIdStr.split('').reduce((s, c) => s + c.charCodeAt(0), 0) % 6;
      const uniqueId    = rowIdStr.slice(-6).toUpperCase();
      const meta        = await PokéEvolution.fetchPokemonMeta(species);
      const attrs       = meta?.attributes || [];
      const hp   = PokéEvolution.getStat(attrs, 'HP')  || '—';
      const atk  = PokéEvolution.getStat(attrs, 'ATK') || '—';
      const def  = PokéEvolution.getStat(attrs, 'DEF') || '—';
      const spd  = PokéEvolution.getStat(attrs, 'SPD') || '—';
      const type   = PokéEvolution.getStat(attrs, 'Type')   || 'Normal';
      const rarity = PokéEvolution.getStat(attrs, 'Rarity') || 'Common';
      const gifSrc      = PokéEvolution.getGifPath(species);
      const displayName = sanitize(row.nickname || species);
      const level       = row.level || 1;
      const xpPct       = Math.min(100, Math.round(((row.experience || 0) % 1000) / 10));
      const { canEvolve, evolvesTo } = PokéEvolution.checkEvolution(species, level);

      const card = document.createElement('div');
      card.className       = 'mkt-card';
      card.dataset.rowId   = row.id;
      card.dataset.species = species;
      card.innerHTML = `
        <span class="mkt-card-id mkt-id-${colorIdx}">#${uniqueId}</span>
        <div class="mkt-card-img-wrap mkt-bg-${colorIdx}">
          <img class="mkt-card-gif" src="${gifSrc}" alt="${displayName}"
               onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png'" />
        </div>
        <div class="mkt-card-info">
          <span class="mkt-card-name">${displayName}</span>
          <div class="mkt-card-meta">
            <span class="mkt-card-level">Lv. ${level}</span>
            <span class="type-badge type-${type.toLowerCase()} mkt-badge-sm">${type}</span>
            <span class="stage-badge stage-${(PokéEvolution.SPECIES_STAGE[species]||'base').toLowerCase()} mkt-badge-sm">${rarity}</span>
          </div>
          <div class="mkt-card-stats">
            <span class="mkt-stat">H: <b>${hp}</b></span>
            <span class="mkt-stat">A: <b>${atk}</b></span>
            <span class="mkt-stat">D: <b>${def}</b></span>
            <span class="mkt-stat">S: <b>${spd}</b></span>
          </div>
          <div class="mkt-xp-bar" title="${xpPct}% XP">
            <div class="mkt-xp-fill" style="width:${xpPct}%"></div>
          </div>
        </div>
        <div class="mkt-card-footer mkt-footer-center">
          ${canEvolve
            ? `<button class="mkt-buy-btn evolve-btn"
                       data-row-id="${row.id}">✨ Evolve</button>`
            : `<span class="mkt-xp-hint">Lv. ${level} · ${xpPct}% XP</span>`
          }
        </div>
      `;

      if (canEvolve) {
        card.querySelector('.evolve-btn')?.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            const newSpecies = await PokéEvolution.performEvolution(row.id, userId, species, level);
            showToast(`✨ ${species} evolved into ${newSpecies}!`, 'success', 5000);
            await loadStarterPokemon(userId);
          } catch (err) {
            showToast(err.message || 'Evolution failed.', 'error');
          }
        });
      }

      card.addEventListener('click', (e) => {
        if (e.target.closest('.evolve-btn')) return;
        openPokemonDetailModal(species, row.nickname, level, row.experience || 0);
      });

      grid.appendChild(card);
    }

  } catch (err) {
    console.error('[Starters] Error:', err);
    grid.innerHTML = '<p class="poke-load-error">Failed to load Pokémon.</p>';
  }
}

/* ============================================================
   MY POKEMON PANEL
   ============================================================ */

async function loadMyPokemon(userId) {
  const grid = document.getElementById('myPokemonGrid');
  if (!grid) return;

  grid.innerHTML = '<div class="empty-state"><p>Loading your Pokémon...</p></div>';

  try {
    const { data: owned, error } = await _supabase
      .from('owned_pokemon')
      .select('id, pokemon_id, species, nickname, level, experience')
      .eq('user_id', userId)
      .order('id', { ascending: true });

    if (error || !owned?.length) {
      grid.innerHTML = '<div class="empty-state"><p>No Pokémon yet. Visit the Marketplace! 🛒</p></div>';
      return;
    }

    // Ensure species field is populated
    const pokedexToSpecies = { 1: 'Bulbasaur', 4: 'Charmander', 7: 'Squirtle' };
    for (const row of owned) {
      if (!row.species) row.species = pokedexToSpecies[row.pokemon_id] || 'Bulbasaur';
    }

    grid.innerHTML = '';
    for (const row of owned) {
      const species     = row.species || 'Bulbasaur';
      const rowIdStr    = String(row.id);
      const colorIdx    = rowIdStr.split('').reduce((s, c) => s + c.charCodeAt(0), 0) % 6;
      const uniqueId    = rowIdStr.slice(-6).toUpperCase();
      const meta        = await PokéEvolution.fetchPokemonMeta(species);
      const attrs       = meta?.attributes || [];
      const hp    = PokéEvolution.getStat(attrs, 'HP')  || '—';
      const atk   = PokéEvolution.getStat(attrs, 'ATK') || '—';
      const def   = PokéEvolution.getStat(attrs, 'DEF') || '—';
      const spd   = PokéEvolution.getStat(attrs, 'SPD') || '—';
      const type   = PokéEvolution.getStat(attrs, 'Type')   || 'Normal';
      const rarity = PokéEvolution.getStat(attrs, 'Rarity') || 'Common';
      const gifSrc      = PokéEvolution.getGifPath(species);
      const displayName = sanitize(row.nickname || species);
      const level       = row.level || 1;
      const xpPct       = Math.min(100, Math.round(((row.experience || 0) % 1000) / 10));
      const { canEvolve, evolvesTo } = PokéEvolution.checkEvolution(species, level);

      const card = document.createElement('div');
      card.className        = 'mkt-card';
      card.dataset.rowId    = row.id;
      card.dataset.species  = species;
      card.dataset.types    = type.toLowerCase();
      card.dataset.stage    = (PokéEvolution.SPECIES_STAGE[species] || 'base').toLowerCase();
      card.innerHTML = `
        <span class="mkt-card-id mkt-id-${colorIdx}">#${uniqueId}</span>
        <div class="mkt-card-img-wrap mkt-bg-${colorIdx}">
          <img class="mkt-card-gif" src="${gifSrc}" alt="${displayName}"
               onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png'" />
        </div>
        <div class="mkt-card-info">
          <span class="mkt-card-name">${displayName}</span>
          <div class="mkt-card-meta">
            <span class="mkt-card-level">Lv. ${level}</span>
            <span class="type-badge type-${type.toLowerCase()} mkt-badge-sm">${type}</span>
            <span class="stage-badge stage-${card.dataset.stage} mkt-badge-sm">${rarity}</span>
          </div>
          <div class="mkt-card-stats">
            <span class="mkt-stat">H: <b>${hp}</b></span>
            <span class="mkt-stat">A: <b>${atk}</b></span>
            <span class="mkt-stat">D: <b>${def}</b></span>
            <span class="mkt-stat">S: <b>${spd}</b></span>
          </div>
          <div class="mkt-xp-bar" title="${xpPct}% XP to next level">
            <div class="mkt-xp-fill" style="width:${xpPct}%"></div>
          </div>
        </div>
        <div class="mkt-card-footer mkt-footer-center">
          ${canEvolve
            ? `<button class="mkt-buy-btn evolve-btn"
                       data-row-id="${row.id}">✨ Evolve</button>`
            : `<span class="mkt-xp-hint">Lv. ${level} · ${xpPct}% XP</span>`
          }
        </div>
      `;

      // Evolve button handler
      if (canEvolve) {
        card.querySelector('.evolve-btn')?.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            const newSpecies = await PokéEvolution.performEvolution(row.id, userId, species, level);
            showToast(`✨ ${species} evolved into ${newSpecies}!`, 'success', 5000);
            await loadMyPokemon(userId);
          } catch (err) {
            showToast(err.message || 'Evolution failed.', 'error');
          }
        });
      }

      // Click card → detail modal
      card.addEventListener('click', (e) => {
        if (e.target.closest('.evolve-btn')) return;
        openPokemonDetailModal(species, row.nickname, level, row.experience || 0);
      });

      grid.appendChild(card);
    }

    // Search filter
    const searchEl = document.getElementById('pokemonSearch');
    if (searchEl && !searchEl.dataset.bound) {
      searchEl.dataset.bound = '1';
      searchEl.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        grid.querySelectorAll('.mkt-card').forEach(c => {
          const name = (c.querySelector('.mkt-card-name')?.textContent || '').toLowerCase();
          c.style.display = name.includes(query) ? '' : 'none';
        });
      });
    }

    // Type filter
    const filterEl = document.getElementById('pokemonFilter');
    if (filterEl && !filterEl.dataset.bound) {
      filterEl.dataset.bound = '1';
      filterEl.addEventListener('change', (e) => {
        const type = e.target.value;
        grid.querySelectorAll('.mkt-card').forEach(c => {
          c.style.display = (type === 'all' || (c.dataset.types || '').includes(type)) ? '' : 'none';
        });
      });
    }

  } catch (err) {
    console.error('[My Pokemon] Error:', err);
    grid.innerHTML = '<div class="empty-state"><p>Failed to load your Pokémon.</p></div>';
  }
}

/* ============================================================
   PANEL NAVIGATION HELPER
   Programmatically switch to any dashboard panel — mirrors what
   the sidebar link clicks do, so post-mint redirects work correctly.
   ============================================================ */

function navigateToPanel(panelId, userId) {
  const links  = document.querySelectorAll('.sidebar-link');
  const panels = document.querySelectorAll('.dash-panel');

  links.forEach(l => l.classList.toggle('active', l.dataset.panel === panelId));
  panels.forEach(p => p.classList.add('hidden'));
  document.getElementById(panelId)?.classList.remove('hidden');

  if (panelId === 'my-pokemon')  loadMyPokemon(userId);
  if (panelId === 'marketplace') { _marketplaceInited = false; initMarketplace(userId); }
}

/* ============================================================
   SIDEBAR NAVIGATION
   ============================================================ */

function initSidebarNav(userId) {
  const links  = document.querySelectorAll('.sidebar-link');
  const panels = document.querySelectorAll('.dash-panel');

  links.forEach(link => {
    link.addEventListener('click', (e) => {
      // Skip external links (e.g. Game opens in new tab)
      if (link.target === '_blank') return;

      e.preventDefault();
      const panelId = link.dataset.panel;
      if (!panelId) return;

      // Activate link
      links.forEach(l => l.classList.remove('active'));
      link.classList.add('active');

      // Show panel
      panels.forEach(p => p.classList.add('hidden'));
      const panel = document.getElementById(panelId);
      panel?.classList.remove('hidden');

      // Lazy-load panel data
      if (panelId === 'my-pokemon')  loadMyPokemon(userId);
      if (panelId === 'marketplace') initMarketplace(userId);
      if (panelId === 'settings')    refreshSettingsFields();

      // Close sidebar on mobile
      if (window.innerWidth < 768) {
        document.getElementById('sidebar')?.classList.remove('open');
        document.getElementById('sidebarToggle')?.setAttribute('aria-expanded', 'false');
      }
    });
  });
}

/* ============================================================
   PROFILE SETTINGS FORM
   ============================================================ */

/**
 * Re-populates the settings username/email fields from the
 * stored session + a fresh DB read. Safe to call any time.
 */
async function refreshSettingsFields() {
  const session = _currentSession;
  if (!session) return;
  const user = session.user;

  const emailEl    = document.getElementById('settingsEmail');
  const usernameEl = document.getElementById('settingsUsername');

  if (emailEl && user.email) emailEl.value = user.email;

  // Fetch latest username from DB
  const { data: trainer } = await _supabase
    .from('trainer_profiles')
    .select('username')
    .eq('user_id', user.id)
    .single();

  if (usernameEl) {
    usernameEl.value = trainer?.username
      || user.user_metadata?.display_name
      || user.user_metadata?.full_name
      || user.email?.split('@')[0]
      || '';
  }
}

function initProfileForm(userId) {
  const form = document.getElementById('profileForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('settingsUsername')?.value.trim();

    if (!username || !/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
      document.getElementById('settingsUsernameErr').textContent =
        'Username must be 3–30 characters: letters, numbers, underscore only.';
      return;
    }

    const btn = form.querySelector('button[type=submit]');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

    // Clear previous error
    const errEl = document.getElementById('profileError');
    if (errEl) { errEl.textContent = ''; errEl.classList.remove('show'); }

    try {
      // Update trainer_profiles table — do NOT sanitize here; sanitize is for HTML display only
      const { error: dbError } = await _supabase
        .from('trainer_profiles')
        .update({ username })
        .eq('user_id', userId);

      if (dbError) throw dbError;

      // Update user metadata
      await _supabase.auth.updateUser({
        data: { display_name: username },
      });

      document.getElementById('profileName').textContent = sanitize(username);
      document.getElementById('topbarUsername').textContent = sanitize(username);
      showToast('Profile updated successfully! ✅', 'success');

    } catch (err) {
      console.error('[Profile] Update error:', err);
      if (errEl) {
        errEl.textContent = err.message || 'Failed to update profile.';
        errEl.classList.add('show');
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
    }
  });
}

/* ============================================================
   PASSWORD CHANGE FORM
   ============================================================ */

function initPasswordForm() {
  const form = document.getElementById('passwordForm');
  if (!form) return;

  // Strength indicator
  document.getElementById('newPassword')?.addEventListener('input', (e) => {
    updatePwStrength(e.target.value, 'pwStrengthFill2', null);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPw  = document.getElementById('newPassword')?.value;
    const confPw = document.getElementById('confirmNewPassword')?.value;
    const errEl  = document.getElementById('confirmNewPwErr');

    if (!newPw || newPw.length < 8) {
      if (errEl) errEl.textContent = 'Password must be at least 8 characters.';
      return;
    }
    if (newPw !== confPw) {
      if (errEl) errEl.textContent = 'Passwords do not match.';
      return;
    }
    if (errEl) errEl.textContent = '';

    const btn = form.querySelector('button[type=submit]');
    if (btn) { btn.disabled = true; btn.textContent = 'Updating...'; }

    try {
      const { error } = await _supabase.auth.updateUser({ password: newPw });
      if (error) throw error;
      showToast('Password updated successfully! 🔐', 'success');
      form.reset();
    } catch (err) {
      const pe = document.getElementById('passwordError');
      if (pe) { pe.textContent = err.message || 'Failed to update password.'; pe.classList.add('show'); }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Update Password'; }
    }
  });
}

/* ============================================================
   ACCOUNT DELETION
   ============================================================ */

function initDeleteAccount(userId) {
  const deleteBtn  = document.getElementById('deleteAccountBtn');
  const modal      = document.getElementById('deleteModal');
  const cancelBtn  = document.getElementById('deleteCancelBtn');
  const confirmBtn = document.getElementById('deleteConfirmBtn');
  const input      = document.getElementById('deleteConfirmInput');

  deleteBtn?.addEventListener('click', () => {
    modal?.classList.remove('hidden');
    input?.focus();
  });

  cancelBtn?.addEventListener('click', () => {
    modal?.classList.add('hidden');
    if (input) input.value = '';
    if (confirmBtn) confirmBtn.disabled = true;
  });

  input?.addEventListener('input', () => {
    if (confirmBtn) confirmBtn.disabled = (input.value !== 'DELETE');
  });

  confirmBtn?.addEventListener('click', async () => {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Deleting...';

    try {
      // Delete owned data first (RLS-protected)
      await _supabase.from('owned_pokemon').delete().eq('user_id', userId);
      await _supabase.from('trainer_profiles').delete().eq('user_id', userId);

      // Sign out — actual user deletion via Supabase admin API / Edge Function
      await _supabase.auth.signOut();
      showToast('Account deleted. Goodbye, Trainer. 👋', 'info', 4000);
      setTimeout(() => { window.location.href = APP_CONFIG.homeUrl; }, 2000);
    } catch (err) {
      console.error('[Delete] Error:', err);
      showToast('Failed to delete account. Contact support.', 'error');
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Delete Forever';
    }
  });
}

/* ============================================================
   MOBILE SIDEBAR TOGGLE
   ============================================================ */

function initMobileSidebar() {
  const toggle  = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  const close   = document.getElementById('sidebarClose');

  toggle?.addEventListener('click', () => {
    const isOpen = sidebar?.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(!!isOpen));
  });

  close?.addEventListener('click', () => {
    sidebar?.classList.remove('open');
    toggle?.setAttribute('aria-expanded', 'false');
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (sidebar?.classList.contains('open') &&
        !sidebar.contains(e.target) &&
        !toggle?.contains(e.target)) {
      sidebar.classList.remove('open');
      toggle?.setAttribute('aria-expanded', 'false');
    }
  });
}

/* ============================================================
   WAITLIST BUTTONS (Ranked tab only)
   ============================================================ */

function initWaitlistButtons(userId) {
  document.getElementById('battlesWaitlistBtn')?.addEventListener('click', async () => {
    try {
      await _supabase.from('feature_waitlist').insert([{ user_id: userId, feature: 'ranked_battles' }]);
      showToast('You\'re on the ranked waitlist! 🔔', 'success');
    } catch (_) {
      showToast('You\'re already on the list! 🔔', 'info');
    }
  });
}

/* ============================================================
   WALLET PANEL
   ============================================================ */

/**
 * Fetches the real on-chain POKÉ ERC-20 balance for the connected wallet
 * and updates every balance element in the UI.
 */
async function refreshChainBalance(address) {
  try {
    if (!address || !window.PokéChain) return;
    const balance = await window.PokéChain.getPokeBalance(address);
    const formatted = formatPokeBalance(balance);
    const balEl = document.getElementById('tokenBalance');
    const walEl = document.getElementById('walletBalance');
    if (balEl) balEl.textContent = formatted;
    if (walEl) walEl.textContent = `${formatted} POKÉ`;
  } catch (err) {
    console.warn('[refreshChainBalance]', err);
  }
}

function initWalletPanel() {
  // Refresh on-chain balance whenever a wallet connects or is restored on page load
  window.PokéWallet?.on('connected', ({ address }) => refreshChainBalance(address));
  window.PokéWallet?.on('restored',  ({ address }) => refreshChainBalance(address));
  window.PokéWallet?.on('accountsChanged', ({ address }) => refreshChainBalance(address));

  // Wire up wallet option buttons
  document.querySelectorAll('.wallet-option-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const type = btn.dataset.wallet;
      const errEl = document.getElementById('walletError');
      if (errEl) { errEl.textContent = ''; errEl.classList.add('hidden'); }

      btn.disabled = true;
      const origText = btn.querySelector('span')?.textContent || '';
      if (btn.querySelector('span')) btn.querySelector('span').textContent = 'Connecting...';

      try {
        const { address, chainId } = await PokéWallet.connect(type);
        showToast(`✅ ${type.charAt(0).toUpperCase()+type.slice(1)} connected! ${PokéWallet.shortAddress(address)}`, 'success');
      } catch (err) {
        if (errEl) {
          errEl.textContent = err.message || 'Connection failed.';
          errEl.classList.remove('hidden');
        }
      } finally {
        btn.disabled = false;
        if (btn.querySelector('span')) btn.querySelector('span').textContent = origText;
      }
    });
  });

  // Disconnect button
  document.getElementById('disconnectWalletBtn')?.addEventListener('click', () => {
    PokéWallet.disconnect();
    showToast('Wallet disconnected.', 'info');
  });

  // Copy address
  document.getElementById('copyAddressBtn')?.addEventListener('click', () => {
    const addr = PokéWallet.getAddress();
    if (addr) {
      navigator.clipboard.writeText(addr).then(() => showToast('Address copied! 📋', 'info'));
    }
  });

  // Switch network toggle
  document.getElementById('switchNetworkBtn')?.addEventListener('click', () => {
    const sel = document.getElementById('networkSelector');
    sel?.classList.toggle('hidden');
  });

  // Network option buttons
  document.querySelectorAll('.network-opt').forEach(btn => {
    btn.addEventListener('click', async () => {
      const chainId = parseInt(btn.dataset.chainid);
      const provider = PokéWallet.getState().provider;
      if (!provider) return;
      try {
        await provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x' + chainId.toString(16) }],
        });
        document.getElementById('networkSelector')?.classList.add('hidden');
      } catch (err) {
        showToast('Network switch failed: ' + (err.message || ''), 'error');
      }
    });
  });
}

/* ============================================================
   BATCH MINT HELPERS
   ============================================================ */

const _batchSelected = new Set(); // species names selected for batch mint

function updateBatchBar() {
  const bar     = document.getElementById('batchMintBar');
  const countEl = document.getElementById('batchMintCount');
  if (!bar) return;
  if (_batchSelected.size > 0) {
    bar.classList.remove('hidden');
    countEl.textContent = `${_batchSelected.size} selected`;
  } else {
    bar.classList.add('hidden');
  }
}

function clearBatchSelection() {
  _batchSelected.clear();
  document.querySelectorAll('#shopGrid .shop-card').forEach(c => c.classList.remove('batch-selected'));
  updateBatchBar();
}

async function handleBatchMint(userId) {
  if (!_batchSelected.size) return;

  const walletState = window.PokéWallet?.getState?.();
  const inputAddr   = document.getElementById('batchMintAddress')?.value.trim();
  const toAddress   = (inputAddr && ethers.isAddress(inputAddr)) ? inputAddr : walletState?.address;

  if (!toAddress) { showToast('Enter a valid recipient address.', 'error'); return; }

  const btn = document.getElementById('batchMintBtn');
  btn.disabled    = true;
  btn.textContent = 'Minting…';

  const species = [..._batchSelected];
  let minted = 0, failed = 0;

  for (const s of species) {
    try {
      const result = await window.PokéChain.buyFromShop({ buyerAddress: toAddress, species: s });

      await _supabase.from('owned_pokemon').insert({
        user_id:         userId,
        species:         s,
        level:           1,
        experience:      0,
        evolution_stage: 'base',
      });

      btn.textContent = `Minting… ${++minted}/${species.length}`;
    } catch (err) {
      console.error(`[Batch Mint] ${s}:`, err);
      failed++;
    }
  }

  btn.disabled    = false;
  btn.textContent = '⚡ Batch Mint Selected';

  clearBatchSelection();

  const msg = failed
    ? `⚠️ Minted ${minted}/${species.length}. ${failed} failed — check console.`
    : `✅ All ${minted} Pokémon minted successfully!`;
  showToast(msg, failed ? 'warning' : 'success', 6000);

  if (minted > 0) {
    const countEl = document.getElementById('totalPokemon');
    if (countEl) countEl.textContent = (parseInt(countEl.textContent) || 0) + minted;
    setTimeout(() => navigateToPanel('my-pokemon', userId), 800);
  }
}

/* ============================================================
   RENDER SHOP GRID
   ============================================================ */
function renderShopGrid(userId) {
  const grid   = document.getElementById('shopGrid');
  const search = (document.getElementById('shopSearch')?.value  || '').toLowerCase();
  const type   = document.getElementById('shopTypeFilter')?.value  || 'all';
  const rarity = document.getElementById('shopRarityFilter')?.value || 'all';
  if (!grid) return;

  const chain = window.PokéChain;
  if (!chain) {
    grid.innerHTML = '<div class="empty-state"><p>Blockchain module loading...</p></div>';
    return;
  }

  const filtered = chain.SHOP_POKEMON.filter(p => {
    const matchQ = !search || p.species.toLowerCase().includes(search);
    const matchT = type   === 'all' || p.type   === type;
    const matchR = rarity === 'all' || p.rarity === rarity;
    return matchQ && matchT && matchR;
  });

  if (!filtered.length) {
    grid.innerHTML = '<div class="empty-state"><p>No Pokémon match your filters.</p></div>';
    return;
  }

  const rarityClass = { common: 'rarity-common', uncommon: 'rarity-rare', rare: 'rarity-legendary' };
  grid.innerHTML = '';
  for (const pkm of filtered) {
    const gif = window.PokéEvolution?.getGifPath?.(pkm.species) || `/assets/baseForm/${pkm.species}.gif`;
    const card = document.createElement('div');
    card.className = 'pokemon-card shop-card';
    card.dataset.species = pkm.species;
    card.dataset.type    = pkm.type;
    card.dataset.rarity  = pkm.rarity;
    card.innerHTML = `
      ${ _isAdminWallet ? `<input type="checkbox" class="batch-checkbox" title="Select for batch mint" />` : '' }
      <span class="card-rarity ${rarityClass[pkm.rarity] || 'rarity-common'}">${pkm.rarity}</span>
      <img src="${gif}" alt="${pkm.species}" class="card-img" loading="lazy" />
      <div class="card-name">${pkm.species}</div>
      <div class="card-types">
        <span class="type-badge type-${pkm.type}">${pkm.type}</span>
      </div>
      <div class="card-price">💰 ${chain.MINT_PRICE} POKÉ</div>
      <button class="btn btn-primary btn-sm shop-buy-btn"
              data-species="${pkm.species}">Mint Now</button>
    `;

    // Batch-select toggle (admin only)
    if (_isAdminWallet) {
      const cb = card.querySelector('.batch-checkbox');
      cb.addEventListener('change', () => {
        if (cb.checked) {
          _batchSelected.add(pkm.species);
          card.classList.add('batch-selected');
        } else {
          _batchSelected.delete(pkm.species);
          card.classList.remove('batch-selected');
        }
        updateBatchBar();
      });
    }

    grid.appendChild(card);
  }

  // Event delegation — one click handler for all Mint buttons
  grid.onclick = async (e) => {
    const btn = e.target.closest('.shop-buy-btn');
    if (!btn) return;
    await handleShopMint({ userId, species: btn.dataset.species, btn });
  };
}

async function handleShopMint({ userId, species, btn }) {
  const walletState = window.PokéWallet?.getState?.();
  if (!walletState?.address) {
    showToast('Connect your wallet first (Wallet panel).', 'warning', 4000);
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Minting...';

  try {
    const result = await window.PokéChain.buyFromShop({
      buyerAddress: walletState.address,
      species,
    });

    // Record in Supabase.
    // Try full insert first; if columns from later migrations are missing
    // (evolution_stage, experience) fall back to the original bare columns.
    let insertErr = null;

    ({ error: insertErr } = await _supabase
      .from('owned_pokemon')
      .insert({
        user_id:         userId,
        species:         species,
        level:           1,
        experience:      0,
        evolution_stage: 'base',
        // pokemon_id intentionally omitted — column is nullable for shop mints
      }));

    if (insertErr) {
      console.error('[Shop Mint] Supabase insert failed:', insertErr);
      showToast(
        `⚠️ ${species} minted on-chain (tx: ${result.txHash?.slice(0,10)}…) but failed to save in-game. ` +
        `Error: ${insertErr.message}`,
        'error', 10000
      );
      setTimeout(() => navigateToPanel('my-pokemon', userId), 1500);
      return;
    }

    // Deduct POKÉ from in-game balance
    const { data: trainer } = await _supabase
      .from('trainer_profiles')
      .select('token_balance')
      .eq('user_id', userId)
      .single();
    if (trainer) {
      await _supabase
        .from('trainer_profiles')
        .update({ token_balance: Math.max(0, trainer.token_balance - window.PokéChain.MINT_PRICE) })
        .eq('user_id', userId);

      // Refresh topbar balance
      const newBal = Math.max(0, trainer.token_balance - window.PokéChain.MINT_PRICE);
      document.getElementById('tokenBalance').textContent = formatPokeBalance(newBal);
      document.getElementById('walletBalance').textContent = `${formatPokeBalance(newBal)} POKÉ`;
    }

    // Update overview Pokémon count
    const countEl = document.getElementById('totalPokemon');
    if (countEl) countEl.textContent = (parseInt(countEl.textContent) || 0) + 1;

    showToast(`✅ ${species} minted! Redirecting to My Pokémon…`, 'success', 4000);

    // Navigate to My Pokémon so user sees their new NFT immediately
    setTimeout(() => navigateToPanel('my-pokemon', userId), 800);
  } catch (err) {
    console.error('[Shop Mint]', err);
    showToast(err.message || 'Mint failed. Make sure your wallet is on Sepolia.', 'error', 6000);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Mint Now';
  }
}

async function handlePackBuy(userId) {
  const walletState = window.PokéWallet?.getState?.();
  if (!walletState?.address) {
    showToast('Connect your wallet first (Wallet panel).', 'warning', 4000);
    return;
  }

  const btn = document.getElementById('buyPackBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Opening Pack...'; }

  try {
    const results = await window.PokéChain.buyRandomPack(walletState.address);

    // Record all Pokémon in Supabase in one batch insert
    const insertRows = results.map(pkm => ({
      user_id:         userId,
      species:         pkm.species,
      level:           1,
      experience:      0,
      evolution_stage: 'base',
    }));
    const { error: insertErr } = await _supabase.from('owned_pokemon').insert(insertRows);
    if (insertErr) console.error('[Pack] Supabase insert failed:', insertErr);

    // Deduct pack price
    const { data: trainer } = await _supabase
      .from('trainer_profiles').select('token_balance').eq('user_id', userId).single();
    if (trainer) {
      const newBal = Math.max(0, trainer.token_balance - window.PokéChain.PACK_PRICE);
      await _supabase.from('trainer_profiles')
        .update({ token_balance: newBal }).eq('user_id', userId);
      document.getElementById('tokenBalance').textContent = formatPokeBalance(newBal);
    }

    // Update overview Pokémon count
    const countEl = document.getElementById('totalPokemon');
    if (countEl) countEl.textContent = (parseInt(countEl.textContent) || 0) + results.length;

    const names = results.map(r => r.species).join(', ');
    showToast(`🎁 Pack opened! You got: ${names} — redirecting to My Pokémon…`, 'success', 5000);

    // Navigate to My Pokémon so user sees their new NFTs immediately
    setTimeout(() => navigateToPanel('my-pokemon', userId), 800);
  } catch (err) {
    console.error('[Pack]', err);
    showToast(err.message || 'Pack purchase failed.', 'error', 6000);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Buy Random Pack'; }
  }
}

/* ============================================================
   MARKETPLACE PANEL
   ============================================================ */

let _marketplaceInited = false;
let _isAdminWallet     = false;

async function initMarketplace(userId) {
  if (_marketplaceInited) return;
  _marketplaceInited = true;

  // Detect admin (minter wallet) — drives tab visibility
  _isAdminWallet = await window.PokéChain?.isConnectedWalletMinter?.() ?? false;

  // Show / hide admin-only tabs
  document.querySelectorAll('#marketplace .battle-tab[data-admin-only]').forEach(tab => {
    tab.style.display = _isAdminWallet ? '' : 'none';
  });

  // Set correct default active tab: Shop for admin, Buy P2P for regular users
  document.querySelectorAll('#marketplace .battle-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.market-pane').forEach(p => p.classList.add('hidden'));

  if (_isAdminWallet) {
    document.querySelector('#marketplace .battle-tab[data-tab="shop"]')?.classList.add('active');
    document.getElementById('marketTab-shop')?.classList.remove('hidden');
    renderShopGrid(userId);
  } else {
    document.querySelector('#marketplace .battle-tab[data-tab="buy"]')?.classList.add('active');
    document.getElementById('marketTab-buy')?.classList.remove('hidden');
  }

  // Shop filters (admin only)
  document.getElementById('shopSearch')?.addEventListener('input',  () => renderShopGrid(userId));
  document.getElementById('shopTypeFilter')?.addEventListener('change', () => renderShopGrid(userId));
  document.getElementById('shopRarityFilter')?.addEventListener('change', () => renderShopGrid(userId));

  // Pack buy button
  document.getElementById('buyPackBtn')?.addEventListener('click', () => handlePackBuy(userId));

  // Batch mint buttons
  document.getElementById('batchMintBtn')?.addEventListener('click', () => handleBatchMint(userId));
  document.getElementById('batchClearBtn')?.addEventListener('click', () => clearBatchSelection());

  // Tab switching
  document.querySelectorAll('#marketplace .battle-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#marketplace .battle-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.market-pane').forEach(p => p.classList.add('hidden'));
      tab.classList.add('active');
      const pane = document.getElementById('marketTab-' + tab.dataset.tab);
      pane?.classList.remove('hidden');
      if (tab.dataset.tab === 'sell')        loadSellPicker(userId);
      if (tab.dataset.tab === 'my-listings') loadMyListings(userId);
      if (tab.dataset.tab === 'buy')         loadMarketListings(userId);
      if (tab.dataset.tab === 'shop')        renderShopGrid(userId);
    });
  });

  await loadMarketListings(userId);

  // Search + filters
  document.getElementById('marketSearch')?.addEventListener('input', filterMarket);
  document.getElementById('marketTypeFilter')?.addEventListener('change', filterMarket);
  document.getElementById('marketStageFilter')?.addEventListener('change', filterMarket);
  document.getElementById('marketSortFilter')?.addEventListener('change', filterMarket);
}

async function loadMarketListings(userId) {
  const grid = document.getElementById('marketGrid');
  if (!grid) return;
  grid.innerHTML = '<div class="empty-state"><p>Loading listings...</p></div>';

  try {
    const { data: listings, error } = await _supabase
      .from('market_listings')
      .select('id, price, listed_at, owned_pokemon(id, species, nickname, level, experience, user_id)')
      .eq('status', 'active')
      .order('listed_at', { ascending: false })
      .limit(50);

    if (error || !listings?.length) {
      grid.innerHTML = '<div class="empty-state"><p>No listings yet. Be the first to sell! 🛒</p></div>';
      return;
    }

    grid.innerHTML = '';
    for (const listing of listings) {
      const pkm = listing.owned_pokemon;
      if (!pkm) continue;

      const species    = pkm.species || 'Bulbasaur';
      const isOwn      = pkm.user_id === userId;
      const pkmIdStr   = String(pkm.id);
      const colorIdx   = pkmIdStr.split('').reduce((s, c) => s + c.charCodeAt(0), 0) % 6;
      const nftId      = pkmIdStr.slice(-6).toUpperCase();
      const meta       = await PokéEvolution.fetchPokemonMeta(species);
      const attrs      = meta?.attributes || [];
      const hp  = PokéEvolution.getStat(attrs, 'HP')  || '—';
      const atk = PokéEvolution.getStat(attrs, 'ATK') || '—';
      const def = PokéEvolution.getStat(attrs, 'DEF') || '—';
      const spd = PokéEvolution.getStat(attrs, 'SPD') || '—';
      const type    = PokéEvolution.getStat(attrs, 'Type')   || 'Normal';
      const rarity  = PokéEvolution.getStat(attrs, 'Rarity') || 'Common';
      const gifSrc  = PokéEvolution.getGifPath(species);
      const displayName = sanitize(pkm.nickname || species);

      const card = document.createElement('div');
      card.className = 'mkt-card';
      card.dataset.species  = species;
      card.dataset.types    = type.toLowerCase();
      card.dataset.stage    = (PokéEvolution.SPECIES_STAGE[species] || 'base').toLowerCase();
      card.dataset.price    = listing.price;
      card.dataset.listedAt = listing.listed_at;
      card.innerHTML = `
        <span class="mkt-card-id mkt-id-${colorIdx}">#${nftId}</span>
        ${isOwn ? '<span class="mkt-card-own-badge">Yours</span>' : ''}
        <div class="mkt-card-img-wrap mkt-bg-${colorIdx}">
          <img class="mkt-card-gif" src="${gifSrc}" alt="${displayName}"
               onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png'" />
        </div>
        <div class="mkt-card-info">
          <span class="mkt-card-name">${displayName}</span>
          <div class="mkt-card-meta">
            <span class="mkt-card-level">Lv. ${pkm.level || 1}</span>
            <span class="type-badge type-${type.toLowerCase()} mkt-badge-sm">${type}</span>
            <span class="stage-badge stage-${card.dataset.stage} mkt-badge-sm">${rarity}</span>
          </div>
          <div class="mkt-card-stats">
            <span class="mkt-stat">H: <b>${hp}</b></span>
            <span class="mkt-stat">A: <b>${atk}</b></span>
            <span class="mkt-stat">D: <b>${def}</b></span>
            <span class="mkt-stat">S: <b>${spd}</b></span>
          </div>
        </div>
        <div class="mkt-card-footer">
          <span class="mkt-card-price">${listing.price.toLocaleString()} POKÉ</span>
          ${isOwn
            ? `<button class="mkt-buy-btn cancel cancel-listing-btn"
                       data-listing-id="${listing.id}">Delist</button>`
            : `<button class="mkt-buy-btn buy-btn"
                       data-listing-id="${listing.id}"
                       data-species="${sanitize(species)}"
                       data-price="${listing.price}"
                       data-nickname="${sanitize(pkm.nickname || species)}">Buy</button>`
          }
        </div>
      `;

      // Click card body → detail modal
      card.addEventListener('click', (e) => {
        if (e.target.closest('.buy-btn, .cancel-listing-btn, .mkt-buy-btn')) return;
        openPokemonDetailModal(species, pkm.nickname, pkm.level || 1, pkm.experience || 0);
      });

      grid.appendChild(card);
    }

    // Buy / cancel handlers (event delegation)
    grid.addEventListener('click', async (e) => {
      const buyBtn = e.target.closest('.buy-btn');
      if (buyBtn) {
        openBuyModal(
          buyBtn.dataset.listingId,
          buyBtn.dataset.species,
          buyBtn.dataset.nickname,
          parseInt(buyBtn.dataset.price),
          userId
        );
      }
      const cancelBtn = e.target.closest('.cancel-listing-btn');
      if (cancelBtn) cancelListing(cancelBtn.dataset.listingId, userId);
    });

  } catch (err) {
    console.error('[Market] Error:', err);
    grid.innerHTML = '<div class="empty-state"><p>Failed to load marketplace.</p></div>';
  }
}

function filterMarket() {
  const query = (document.getElementById('marketSearch')?.value || '').toLowerCase();
  const type  = document.getElementById('marketTypeFilter')?.value  || 'all';
  const stage = document.getElementById('marketStageFilter')?.value || 'all';
  const sort  = document.getElementById('marketSortFilter')?.value  || 'price-asc';

  const grid  = document.getElementById('marketGrid');
  if (!grid) return;

  const cards = [...grid.querySelectorAll('.mkt-card')];

  cards.forEach(card => {
    const name   = (card.querySelector('.mkt-card-name')?.textContent || '').toLowerCase();
    const cType  = card.dataset.types || '';
    const cStage = card.dataset.stage || '';

    const matchQ = !query || name.includes(query);
    const matchT = type  === 'all' || cType.includes(type);
    const matchS = stage === 'all' || cStage === stage;
    card.style.display = (matchQ && matchT && matchS) ? '' : 'none';
  });

  // Sort visible cards
  const visible = cards.filter(c => c.style.display !== 'none');
  visible.sort((a, b) => {
    if (sort === 'price-asc')   return parseInt(a.dataset.price)    - parseInt(b.dataset.price);
    if (sort === 'price-desc')  return parseInt(b.dataset.price)    - parseInt(a.dataset.price);
    if (sort === 'newest')      return new Date(b.dataset.listedAt) - new Date(a.dataset.listedAt);
    return 0;
  });
  visible.forEach(c => grid.appendChild(c));
}

async function loadSellPicker(userId) {
  const picker = document.getElementById('sellPicker');
  if (!picker || picker.dataset.loaded) return;
  picker.dataset.loaded = '1';

  picker.innerHTML = '<div class="empty-state"><p>Loading your Pokémon...</p></div>';

  const { data: owned } = await _supabase
    .from('owned_pokemon')
    .select('id, species, nickname, level, experience')
    .eq('user_id', userId)
    .is('listing_id', null);

  if (!owned?.length) {
    picker.innerHTML = '<div class="empty-state">No Pokémon available to sell.</div>';
    return;
  }

  picker.innerHTML = '';
  for (const row of owned) {
    const species   = row.species || 'Bulbasaur';
    const rowIdStr  = String(row.id);
    const colorIdx  = rowIdStr.split('').reduce((s, c) => s + c.charCodeAt(0), 0) % 6;
    const meta      = await PokéEvolution.fetchPokemonMeta(species);
    const attrs     = meta?.attributes || [];
    const hp   = PokéEvolution.getStat(attrs, 'HP')  || '—';
    const atk  = PokéEvolution.getStat(attrs, 'ATK') || '—';
    const def  = PokéEvolution.getStat(attrs, 'DEF') || '—';
    const spd  = PokéEvolution.getStat(attrs, 'SPD') || '—';
    const type   = PokéEvolution.getStat(attrs, 'Type')   || 'Normal';
    const rarity = PokéEvolution.getStat(attrs, 'Rarity') || 'Common';
    const gifSrc      = PokéEvolution.getGifPath(species);
    const displayName = sanitize(row.nickname || species);

    const card = document.createElement('div');
    card.className = 'mkt-card';
    card.dataset.rowId = row.id;
    card.style.cursor  = 'pointer';
    card.innerHTML = `
      <span class="mkt-card-id mkt-id-${colorIdx}">#${rowIdStr.slice(-6).toUpperCase()}</span>
      <div class="mkt-card-img-wrap mkt-bg-${colorIdx}">
        <img class="mkt-card-gif" src="${gifSrc}" alt="${displayName}"
             onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png'" />
      </div>
      <div class="mkt-card-info">
        <span class="mkt-card-name">${displayName}</span>
        <div class="mkt-card-meta">
          <span class="mkt-card-level">Lv. ${row.level || 1}</span>
          <span class="type-badge type-${type.toLowerCase()} mkt-badge-sm">${type}</span>
          <span class="stage-badge stage-${(PokéEvolution.SPECIES_STAGE[species]||'base').toLowerCase()} mkt-badge-sm">${rarity}</span>
        </div>
        <div class="mkt-card-stats">
          <span class="mkt-stat">H: <b>${hp}</b></span>
          <span class="mkt-stat">A: <b>${atk}</b></span>
          <span class="mkt-stat">D: <b>${def}</b></span>
          <span class="mkt-stat">S: <b>${spd}</b></span>
        </div>
      </div>
      <div class="mkt-card-footer mkt-footer-center">
        <span class="mkt-buy-btn mkt-select-btn">
          Select
        </span>
      </div>
    `;
    card.addEventListener('click', () => selectForSale(row, card, userId));
    picker.appendChild(card);
  }
}

let _selectedForSale = null;
function selectForSale(row, cardEl, userId) {
  document.querySelectorAll('#sellPicker .mkt-card').forEach(c => c.classList.remove('selected-for-sale'));
  cardEl.classList.add('selected-for-sale');
  _selectedForSale = row;

  const form = document.getElementById('sellForm');
  form?.classList.remove('hidden');

  const preview = document.getElementById('sellPreview');
  if (preview) {
    const gif = PokéEvolution.getGifPath(row.species || 'Bulbasaur');
    preview.innerHTML = `
      <img src="${gif}" class="sell-preview-gif" alt="${sanitize(row.nickname || row.species)}" />
      <strong>${sanitize(row.nickname || row.species)}</strong> &mdash; Lv. ${row.level}
    `;
  }

  // Clone buttons to remove any previously attached listeners before re-adding
  const confirmBtn = document.getElementById('confirmListBtn');
  const cancelBtn  = document.getElementById('cancelSellBtn');
  const freshConfirm = confirmBtn?.cloneNode(true);
  const freshCancel  = cancelBtn?.cloneNode(true);
  confirmBtn?.parentNode?.replaceChild(freshConfirm, confirmBtn);
  cancelBtn?.parentNode?.replaceChild(freshCancel,  cancelBtn);

  freshConfirm?.addEventListener('click', async () => {
    if (!_selectedForSale) return;
    const price    = parseInt(document.getElementById('sellPrice')?.value);
    const duration = parseInt(document.getElementById('sellDuration')?.value);
    if (!price || price < 1) { showToast('Enter a valid price.', 'error'); return; }

    freshConfirm.disabled = true;
    freshConfirm.textContent = 'Listing…';

    const expiresAt = new Date(Date.now() + duration * 86400000).toISOString();
    const { error } = await _supabase.from('market_listings').insert([{
      pokemon_id: _selectedForSale.id,
      seller_id:  userId,
      price,
      status:     'active',
      expires_at: expiresAt,
    }]);

    freshConfirm.disabled = false;
    freshConfirm.textContent = '🏷️ List for Sale';

    if (error) { showToast('Failed to list: ' + error.message, 'error'); return; }
    showToast(`${_selectedForSale.species || 'Pokémon'} listed for ${price} POKÉ! 🛒`, 'success');
    form?.classList.add('hidden');
    _selectedForSale = null;
    // Reload sell picker so the listed Pokémon disappears from the list
    const picker = document.getElementById('sellPicker');
    if (picker) {
      delete picker.dataset.loaded;
      picker.innerHTML = '<div class="empty-state"><p>Loading your Pokémon...</p></div>';
    }
    await loadSellPicker(userId);
  });

  freshCancel?.addEventListener('click', () => {
    form?.classList.add('hidden');
    _selectedForSale = null;
    cardEl.classList.remove('selected-for-sale');
  });
}

/* ============================================================
   POKÉMON DETAIL MODAL
   ============================================================ */

async function openPokemonDetailModal(species, nickname, level, experience) {
  const modal = document.getElementById('pokeDetailModal');
  if (!modal) return;

  // Reset
  document.getElementById('pokeDetailSkills').innerHTML =
    '<span class="poke-loading-text">Loading...</span>';
  modal.classList.remove('hidden');

  const meta  = await PokéEvolution.fetchPokemonMeta(species);
  const attrs = meta?.attributes || [];

  const hp     = PokéEvolution.getStat(attrs, 'HP');
  const atk    = PokéEvolution.getStat(attrs, 'ATK');
  const def    = PokéEvolution.getStat(attrs, 'DEF');
  const spd    = PokéEvolution.getStat(attrs, 'SPD');
  const type   = PokéEvolution.getStat(attrs, 'Type')            || 'Normal';
  const rarity = PokéEvolution.getStat(attrs, 'Rarity')          || 'Common';
  const stage  = PokéEvolution.getStat(attrs, 'Evolution Stage') || 'Base';

  const displayName = sanitize(nickname || species);
  const gifEl = document.getElementById('pokeDetailGif');
  gifEl.src = PokéEvolution.getGifPath(species);
  gifEl.alt = displayName;

  document.getElementById('pokeDetailTitle').textContent = displayName;
  document.getElementById('pokeDetailLevel').textContent = `Lv. ${level}`;

  const typeEl = document.getElementById('pokeDetailType');
  typeEl.textContent = type;
  typeEl.className   = `type-badge type-${type.toLowerCase()}`;

  const rarityEl = document.getElementById('pokeDetailRarity');
  rarityEl.textContent = rarity;
  rarityEl.className   = `rarity-badge rarity-badge-${rarity.toLowerCase()}`;

  const stageEl = document.getElementById('pokeDetailStage');
  stageEl.textContent = stage;
  stageEl.className   = `stage-badge stage-${stage.toLowerCase()}`;

  const xpCurrent = (experience || 0) % 1000;
  document.getElementById('pokeDetailXpFill').style.width = Math.min(100, Math.round(xpCurrent / 10)) + '%';
  document.getElementById('pokeDetailXpLbl').textContent  = `${xpCurrent}/1000 XP`;

  document.getElementById('pokeDetailHp').textContent  = hp  || '—';
  document.getElementById('pokeDetailAtk').textContent = atk || '—';
  document.getElementById('pokeDetailDef').textContent = def || '—';
  document.getElementById('pokeDetailSpd').textContent = spd || '—';

  // All 4 skills — rendered as gradient cards
  const skillsDiv = document.getElementById('pokeDetailSkills');
  skillsDiv.innerHTML = '';
  let skillCount = 0;
  for (let i = 1; i <= 4; i++) {
    const sName = PokéEvolution.getStat(attrs, `Skill ${i} Name`);
    const sPow  = PokéEvolution.getStat(attrs, `Skill ${i} Attack`);
    const sEff  = PokéEvolution.getStat(attrs, `Skill ${i} Effect`);
    if (!sName) continue;
    skillCount++;
    const card = document.createElement('div');
    card.className = 'skill-card';
    card.innerHTML = `
      <span class="skill-card-name">${sanitize(sName)}</span>
      <span class="skill-card-power">${sPow || '—'}</span>
      ${sEff ? `<span class="skill-card-effect">${sanitize(sEff)}</span>` : ''}
    `;
    skillsDiv.appendChild(card);
  }
  if (!skillCount) {
    skillsDiv.style.display = 'block';
    skillsDiv.innerHTML = '<span class="skill-empty-text">No skill data available.</span>';
  } else {
    skillsDiv.style.display = '';
  }

  // Evolution line
  const { canEvolve, evolvesTo, evolvesAtLevel } = PokéEvolution.checkEvolution(species, level);
  const evoDiv = document.getElementById('pokeDetailEvoLine');
  if (evolvesTo && evolvesAtLevel) {
    evoDiv.textContent = canEvolve
      ? `✨ Ready to evolve → ${evolvesTo}!`
      : `Evolves → ${evolvesTo} at Lv. ${evolvesAtLevel}`;
  } else {
    evoDiv.textContent = '🏆 Max Evolution Stage';
  }
}

function openBuyModal(listingId, species, nickname, price, userId) {
  const modal   = document.getElementById('buyModal');
  const content = document.getElementById('buyModalContent');
  if (!modal || !content) return;

  const gif = PokéEvolution.getGifPath(species);
  content.innerHTML = `
    <div class="buy-modal-body">
      <img src="${gif}" class="buy-modal-gif" alt="${sanitize(nickname)}" />
      <p>You are about to buy <strong>${sanitize(nickname)}</strong> for <strong>${price.toLocaleString()} POKÉ</strong>.</p>
      <p class="wallet-hint">Your balance will be deducted from your in-game POKÉ wallet.</p>
    </div>
  `;

  modal.classList.remove('hidden');

  document.getElementById('buyModalCancel')?.addEventListener('click', () => {
    modal.classList.add('hidden');
  }, { once: true });

  document.getElementById('buyModalConfirm')?.addEventListener('click', async () => {
    modal.classList.add('hidden');
    await executePurchase(listingId, price, userId);
  }, { once: true });
}

async function executePurchase(listingId, price, userId) {
  try {
    // Check balance
    const { data: trainer } = await _supabase
      .from('trainer_profiles')
      .select('token_balance')
      .eq('user_id', userId)
      .single();

    if (!trainer || trainer.token_balance < price) {
      showToast('Insufficient POKÉ balance! 💸', 'error'); return;
    }

    // Get listing details
    const { data: listing } = await _supabase
      .from('market_listings')
      .select('pokemon_id, seller_id, price')
      .eq('id', listingId)
      .single();

    if (!listing) { showToast('Listing not found.', 'error'); return; }

    // Transfer ownership
    await _supabase
      .from('owned_pokemon')
      .update({ user_id: userId })
      .eq('id', listing.pokemon_id);

    // Deduct buyer balance
    await _supabase
      .from('trainer_profiles')
      .update({ token_balance: trainer.token_balance - price })
      .eq('user_id', userId);

    // Credit seller
    const { data: seller } = await _supabase
      .from('trainer_profiles')
      .select('token_balance')
      .eq('user_id', listing.seller_id)
      .single();
    if (seller) {
      await _supabase
        .from('trainer_profiles')
        .update({ token_balance: seller.token_balance + price })
        .eq('user_id', listing.seller_id);
    }

    // Mark listing sold
    await _supabase
      .from('market_listings')
      .update({ status: 'sold' })
      .eq('id', listingId);

    showToast('Purchase successful! Pokémon added to your collection! 🎉', 'success', 5000);
    _marketplaceInited = false;
    await loadMarketListings(userId);

  } catch (err) {
    console.error('[Buy] Error:', err);
    showToast('Purchase failed. Try again.', 'error');
  }
}

async function cancelListing(listingId, userId) {
  const { error } = await _supabase
    .from('market_listings')
    .update({ status: 'cancelled' })
    .eq('id', listingId)
    .eq('seller_id', userId);
  if (!error) {
    showToast('Listing cancelled.', 'info');
    _marketplaceInited = false;
    await loadMarketListings(userId);
  }
}

async function loadMyListings(userId) {
  const grid = document.getElementById('myListingsGrid');
  if (!grid) return;

  grid.innerHTML = '<div class="empty-state"><p>Loading your listings...</p></div>';

  const { data: listings } = await _supabase
    .from('market_listings')
    .select('id, price, status, listed_at, owned_pokemon(id, species, nickname, level, experience)')
    .eq('seller_id', userId)
    .order('listed_at', { ascending: false });

  if (!listings?.length) {
    grid.innerHTML = '<div class="empty-state"><p>You have no listings yet.</p></div>';
    return;
  }

  grid.innerHTML = '';
  for (const listing of listings) {
    const pkm = listing.owned_pokemon;
    if (!pkm) continue;
    const species   = pkm.species || 'Bulbasaur';
    const pkmIdStr  = String(pkm.id);
    const colorIdx  = pkmIdStr.split('').reduce((s, c) => s + c.charCodeAt(0), 0) % 6;
    const meta      = await PokéEvolution.fetchPokemonMeta(species);
    const attrs     = meta?.attributes || [];
    const hp   = PokéEvolution.getStat(attrs, 'HP')  || '—';
    const atk  = PokéEvolution.getStat(attrs, 'ATK') || '—';
    const def  = PokéEvolution.getStat(attrs, 'DEF') || '—';
    const spd  = PokéEvolution.getStat(attrs, 'SPD') || '—';
    const type        = PokéEvolution.getStat(attrs, 'Type')   || 'Normal';
    const rarity      = PokéEvolution.getStat(attrs, 'Rarity') || 'Common';
    const gifSrc      = PokéEvolution.getGifPath(species);
    const displayName = sanitize(pkm.nickname || species);
    const isActive    = listing.status === 'active';

    const card = document.createElement('div');
    card.className = `mkt-card${isActive ? '' : ' mkt-card-dimmed'}`;
    card.innerHTML = `
      <span class="mkt-card-id mkt-id-${colorIdx}">#${pkmIdStr.slice(-6).toUpperCase()}</span>
      <span class="mkt-status-badge mkt-status-${listing.status}">${listing.status.toUpperCase()}</span>
      <div class="mkt-card-img-wrap mkt-bg-${colorIdx}">
        <img class="mkt-card-gif${isActive ? '' : ' mkt-img-dimmed'}" src="${gifSrc}" alt="${displayName}"
             onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png'" />
      </div>
      <div class="mkt-card-info">
        <span class="mkt-card-name">${displayName}</span>
        <div class="mkt-card-meta">
          <span class="mkt-card-level">Lv. ${pkm.level || 1}</span>
          <span class="type-badge type-${type.toLowerCase()} mkt-badge-sm">${type}</span>
          <span class="stage-badge stage-${(PokéEvolution.SPECIES_STAGE[species]||'base').toLowerCase()} mkt-badge-sm">${rarity}</span>
        </div>
        <div class="mkt-card-stats">
          <span class="mkt-stat">H: <b>${hp}</b></span>
          <span class="mkt-stat">A: <b>${atk}</b></span>
          <span class="mkt-stat">D: <b>${def}</b></span>
          <span class="mkt-stat">S: <b>${spd}</b></span>
        </div>
      </div>
      <div class="mkt-card-footer">
        <span class="mkt-card-price">${listing.price.toLocaleString()} POKÉ</span>
        ${isActive
          ? `<button class="mkt-buy-btn cancel cancel-listing-btn"
                     data-listing-id="${listing.id}">Delist</button>`
          : `<span class="mkt-listing-status-txt">${listing.status}</span>`
        }
      </div>
    `;
    grid.appendChild(card);
  }

  grid.addEventListener('click', (e) => {
    const b = e.target.closest('.cancel-listing-btn');
    if (b) cancelListing(b.dataset.listingId, userId);
  });
}

/* ============================================================
   PASSWORD STRENGTH (reused from auth.js pattern)
   ============================================================ */

function updatePwStrength(password, fillId) {
  if (!fillId) return;
  const fill = document.getElementById(fillId);
  if (!fill) return;

  let score = 0;
  if (password.length >= 8)        score++;
  if (password.length >= 12)       score++;
  if (/[A-Z]/.test(password))      score++;
  if (/[0-9]/.test(password))      score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const colors = ['transparent','#ff3b3b','#ff9800','#ffd500','#00e676','#00e676'];
  const widths  = ['0%','20%','45%','65%','85%','100%'];

  fill.style.width           = widths[Math.min(score,5)];
  fill.style.backgroundColor = colors[Math.min(score,5)];
}

/* ============================================================
   SANITIZE (mirror from auth.js for use in dashboard.js)
   ============================================================ */

function sanitize(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(String(str || '')));
  return div.innerHTML;
}

function showToast(message, type = 'info', duration = 4000) {
  authUtils?.showToast(message, type, duration);
}

/* ============================================================
   INIT
   ============================================================ */

(async function init() {
  const session = await authGuard();
  if (!session) return;

  const userId = session.user.id;

  initMobileSidebar();

  try { await loadProfile(session); }
  catch (e) { console.error('[init] loadProfile failed:', e); }

  try { await loadStarterPokemon(userId); }
  catch (e) { console.error('[init] loadStarterPokemon failed:', e); }

  initSidebarNav(userId);
  initProfileForm(userId);
  initPasswordForm();
  initDeleteAccount(userId);
  initWaitlistButtons(userId);
  initWalletPanel();

  // Pokémon detail modal — close on button or backdrop click
  const _pdm = document.getElementById('pokeDetailModal');
  document.getElementById('pokeDetailClose')?.addEventListener('click', () => _pdm?.classList.add('hidden'));
  _pdm?.addEventListener('click', (e) => { if (e.target === _pdm) _pdm.classList.add('hidden'); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') _pdm?.classList.add('hidden'); });

  // The 'restored' wallet event fires before initWalletPanel() registers
  // its listener (wallet.js boots before dashboard.js init runs).
  // Do a direct check here so the on-chain balance is shown immediately.
  const _ws = window.PokéWallet?.getState?.();
  if (_ws?.address) refreshChainBalance(_ws.address);

  // Logout buttons on dashboard
  ['dashLogoutBtn'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', authUtils.handleLogout);
  });

})();
