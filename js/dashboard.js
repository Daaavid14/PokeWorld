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

async function loadProfile(session) {
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
    document.getElementById('profileRank').textContent = trainer.rank  || 'Rookie Trainer';
    document.getElementById('tokenBalance').textContent = (trainer.token_balance || 0).toLocaleString();
    document.getElementById('walletBalance').textContent = `${(trainer.token_balance || 0).toLocaleString()} POKÉ`;

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
    document.getElementById('tokenBalance').textContent = '100';
    document.getElementById('walletBalance').textContent = '100 POKÉ';
    showToast('Welcome to PokéWorld! You received 100 POKÉ as a welcome bonus! 🎉', 'success', 5000);
  }
}

/* ============================================================
   STARTER POKEMON
   ============================================================ */

async function loadStarterPokemon(userId) {
  const grid     = document.getElementById('starterGrid');
  const totalEl  = document.getElementById('totalPokemon');
  if (!grid) return;

  try {
    // Fetch owned Pokemon from DB
    const { data: owned } = await _supabase
      .from('owned_pokemon')
      .select('pokemon_id, nickname, level')
      .eq('user_id', userId)
      .limit(3);

    let ids;
    if (owned && owned.length > 0) {
      ids = owned.map(r => r.pokemon_id);
    } else {
      // Assign the 3 classic starters if none owned
      ids = APP_CONFIG.starterPokemon;
      await _supabase.from('owned_pokemon').insert(
        ids.map(id => ({ user_id: userId, pokemon_id: id, nickname: null, level: 1 }))
      );
    }

    if (totalEl) totalEl.textContent = ids.length;

    // Fetch from PokeAPI
    const POKE_API = 'https://pokeapi.co/api/v2';
    const pokemons = await Promise.all(
      ids.map(id => fetch(`${POKE_API}/pokemon/${id}`).then(r => r.json()).catch(() => null))
    );

    grid.innerHTML = '';
    pokemons.filter(Boolean).forEach((p, i) => {
      const ownerData = owned?.[i];
      const nickname  = ownerData?.nickname || p.name;
      const level     = ownerData?.level || 1;
      const imgUrl    = p.sprites?.other?.['official-artwork']?.front_default
                     || p.sprites?.front_default || '';

      const card = document.createElement('div');
      card.className = 'pokemon-card';
      card.innerHTML = `
        <img class="card-img" src="${imgUrl}" alt="${sanitize(p.name)}" loading="lazy" />
        <span class="card-name">${sanitize(nickname)}</span>
        <span class="card-number">Lv. ${level}</span>
        <div class="card-types">
          ${p.types.map(t => `<span class="type-badge type-${t.type.name}">${t.type.name}</span>`).join('')}
        </div>
      `;
      grid.appendChild(card);
    });

  } catch (err) {
    console.error('[Starters] Error:', err);
    grid.innerHTML = '<p style="color:var(--text-muted)">Failed to load Pokémon.</p>';
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
      .select('pokemon_id, nickname, level')
      .eq('user_id', userId)
      .order('pokemon_id', { ascending: true });

    if (error || !owned?.length) {
      grid.innerHTML = '<div class="empty-state"><p>No Pokémon yet. Visit the Marketplace! 🛒</p></div>';
      return;
    }

    const POKE_API = 'https://pokeapi.co/api/v2';
    const pokemons = await Promise.all(
      owned.map(r => fetch(`${POKE_API}/pokemon/${r.pokemon_id}`).then(res => res.json()).catch(() => null))
    );

    grid.innerHTML = '';
    pokemons.filter(Boolean).forEach((p, i) => {
      const { nickname, level } = owned[i];
      const imgUrl = p.sprites?.other?.['official-artwork']?.front_default || '';

      const card = document.createElement('div');
      card.className = 'pokemon-card';
      card.dataset.types = p.types.map(t => t.type.name).join(',');
      card.innerHTML = `
        <img class="card-img" src="${imgUrl}" alt="${sanitize(p.name)}" loading="lazy" />
        <span class="card-name">${sanitize(nickname || p.name)}</span>
        <span class="card-number">Lv. ${level} · #${String(p.id).padStart(3,'0')}</span>
        <div class="card-types">
          ${p.types.map(t => `<span class="type-badge type-${t.type.name}">${t.type.name}</span>`).join('')}
        </div>
      `;
      grid.appendChild(card);
    });

    // Pokemon search filter
    document.getElementById('pokemonSearch')?.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      grid.querySelectorAll('.pokemon-card').forEach(c => {
        const name = c.querySelector('.card-name')?.textContent.toLowerCase() || '';
        c.style.display = name.includes(query) ? '' : 'none';
      });
    });

    // Type filter
    document.getElementById('pokemonFilter')?.addEventListener('change', (e) => {
      const type = e.target.value;
      grid.querySelectorAll('.pokemon-card').forEach(c => {
        c.style.display = (type === 'all' || c.dataset.types?.includes(type)) ? '' : 'none';
      });
    });

  } catch (err) {
    console.error('[My Pokemon] Error:', err);
    grid.innerHTML = '<div class="empty-state"><p>Failed to load your Pokémon.</p></div>';
  }
}

/* ============================================================
   SIDEBAR NAVIGATION
   ============================================================ */

function initSidebarNav(userId) {
  const links  = document.querySelectorAll('.sidebar-link');
  const panels = document.querySelectorAll('.dash-panel');

  links.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const panelId = link.dataset.panel;

      // Activate link
      links.forEach(l => l.classList.remove('active'));
      link.classList.add('active');

      // Show panel
      panels.forEach(p => p.classList.add('hidden'));
      const panel = document.getElementById(panelId);
      panel?.classList.remove('hidden');

      // Lazy-load panel data
      if (panelId === 'my-pokemon') loadMyPokemon(userId);

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

    try {
      // Update trainer_profiles table
      const { error: dbError } = await _supabase
        .from('trainer_profiles')
        .update({ username: sanitize(username) })
        .eq('user_id', userId);

      // Update user metadata
      await _supabase.auth.updateUser({
        data: { display_name: sanitize(username) },
      });

      if (dbError) throw dbError;

      document.getElementById('profileName').textContent = username;
      document.getElementById('topbarUsername').textContent = username;
      showToast('Profile updated successfully! ✅', 'success');

    } catch (err) {
      console.error('[Profile] Update error:', err);
      document.getElementById('profileError').textContent = 'Failed to update profile.';
      document.getElementById('profileError').classList.add('show');
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
   WAITLIST BUTTONS (Coming Soon panels)
   ============================================================ */

function initWaitlistButtons(userId) {
  ['battlesWaitlistBtn', 'marketWaitlistBtn'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', async () => {
      try {
        await _supabase.from('feature_waitlist').insert([{ user_id: userId, feature: id }]);
        showToast('You\'re on the list! We\'ll notify you when it\'s ready. 🔔', 'success');
      } catch (e) {
        showToast('You\'re already on the list! 🔔', 'info');
      }
    });
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
  await loadProfile(session);
  await loadStarterPokemon(userId);
  initSidebarNav(userId);
  initProfileForm(userId);
  initPasswordForm();
  initDeleteAccount(userId);
  initWaitlistButtons(userId);

  // Logout buttons on dashboard
  ['dashLogoutBtn'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', authUtils.handleLogout);
  });

})();
