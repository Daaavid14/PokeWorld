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
      .select('id, pokemon_id, species, nickname, level, experience')
      .eq('user_id', userId)
      .limit(3);

    let ids;
    // Check if all owned rows are using the default species (corrupt starter insert)
    const allSameSpecies = owned?.length > 0 && owned.every(r => r.species === owned[0].species);
    const starterDefaults = ['Bulbasaur', 'Charmander', 'Squirtle'];
    const isCorruptStarters = allSameSpecies && owned?.length === 3 && owned[0].species === 'Bulbasaur';

    if (owned && owned.length > 0 && !isCorruptStarters) {
      ids = owned.map(r => r.pokemon_id || r.id);
    } else {
      // Delete corrupt starter rows if they exist so we can re-insert correctly
      if (isCorruptStarters) {
        await _supabase.from('owned_pokemon').delete().eq('user_id', userId);
        owned.length = 0;
      }
      // Assign the 3 classic starters if none owned
      const starterSpecies  = ['Bulbasaur', 'Charmander', 'Squirtle'];
      const starterPokedexIds = [1, 4, 7]; // Bulbasaur=1, Charmander=4, Squirtle=7
      ids = starterSpecies;
      const insertData = starterSpecies.map((species, i) => ({
        user_id:         userId,
        pokemon_id:      starterPokedexIds[i],
        species:         species,
        nickname:        null,
        level:           1,
        experience:      0,
        evolution_stage: 'base',
      }));
      const { data: inserted } = await _supabase
        .from('owned_pokemon')
        .insert(insertData)
        .select('id, pokemon_id, species, nickname, level, experience');
      if (inserted) owned?.push(...inserted);
    }

    if (totalEl) totalEl.textContent = owned ? owned.length : ids.length;

    // Use local metadata + GIF assets via evolution engine
    grid.innerHTML = '';

    // Build default starter rows list if we just assigned them
    const starterNames = ['Bulbasaur','Charmander','Squirtle'];
    const rows = owned?.length
      ? owned.slice(0, 3)
      : starterNames.map((s, i) => ({ id: `starter-${i}`, species: s, nickname: null, level: 1, experience: 0 }));

    for (const row of rows) {
      const species = row.species || starterNames[0];
      const card = await PokéEvolution.buildPokemonCard({
        nftId:      row.id,
        species,
        nickname:   row.nickname,
        level:      row.level || 1,
        experience: row.experience || 0,
        userId,
        onEvolved: async (nftId, newSpecies, level) => {
          showToast(`✨ ${species} evolved into ${newSpecies}!`, 'success', 5000);
          await loadStarterPokemon(userId);
        },
      });
      grid.appendChild(card);
    }

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
      .select('id, pokemon_id, species, nickname, level, experience')
      .eq('user_id', userId)
      .order('id', { ascending: true });

    if (error || !owned?.length) {
      grid.innerHTML = '<div class="empty-state"><p>No Pokémon yet. Visit the Marketplace! 🛒</p></div>';
      return;
    }

    // Ensure species field is populated (fallback using pokemon_id mapping)
    const pokedexToSpecies = { 1: 'Bulbasaur', 4: 'Charmander', 7: 'Squirtle' };
    for (const row of owned) {
      if (!row.species) row.species = pokedexToSpecies[row.pokemon_id] || 'Bulbasaur';
    }

    grid.innerHTML = '';
    for (const row of owned) {
      const species = row.species || 'Bulbasaur';
      const card = await PokéEvolution.buildPokemonCard({
        nftId:      row.id,
        species,
        nickname:   row.nickname,
        level:      row.level || 1,
        experience: row.experience || 0,
        userId,
        onEvolved: async (nftId, newSpecies) => {
          showToast(`✨ ${species} evolved into ${newSpecies}!`, 'success', 5000);
          await loadMyPokemon(userId);
        },
      });
      grid.appendChild(card);
    }

    // Pokemon search filter
    document.getElementById('pokemonSearch')?.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      grid.querySelectorAll('.nft-card').forEach(c => {
        const name = c.querySelector('.card-name')?.textContent.toLowerCase() || '';
        c.style.display = name.includes(query) ? '' : 'none';
      });
    });

    // Type filter
    document.getElementById('pokemonFilter')?.addEventListener('change', (e) => {
      const type = e.target.value;
      grid.querySelectorAll('.nft-card').forEach(c => {
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
      if (panelId === 'my-pokemon')  loadMyPokemon(userId);
      if (panelId === 'marketplace') initMarketplace(userId);
      if (panelId === 'battles')     initBattlePanel(userId);

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

function initWalletPanel() {
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
   MARKETPLACE — SHOP (Mint new base Pokémon)
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

    // Record in Supabase
    await _supabase.from('owned_pokemon').insert([{
      user_id:         userId,
      pokemon_id:      null,        // on-chain tokenId stored separately if needed
      species:         species,
      nickname:        null,
      level:           1,
      experience:      0,
      evolution_stage: 'base',
    }]);

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
      document.getElementById('tokenBalance').textContent = newBal.toLocaleString();
      document.getElementById('walletBalance').textContent = `${newBal.toLocaleString()} POKÉ`;
    }

    showToast(`✅ ${species} minted! Tx: ${result.txHash?.slice(0,10)}…`, 'success', 6000);
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

    // Record each in Supabase
    for (const pkm of results) {
      await _supabase.from('owned_pokemon').insert([{
        user_id:         userId,
        species:         pkm.species,
        nickname:        null,
        level:           1,
        experience:      0,
        evolution_stage: 'base',
      }]);
    }

    // Deduct pack price
    const { data: trainer } = await _supabase
      .from('trainer_profiles').select('token_balance').eq('user_id', userId).single();
    if (trainer) {
      const newBal = Math.max(0, trainer.token_balance - window.PokéChain.PACK_PRICE);
      await _supabase.from('trainer_profiles')
        .update({ token_balance: newBal }).eq('user_id', userId);
      document.getElementById('tokenBalance').textContent = newBal.toLocaleString();
    }

    const names = results.map(r => r.species).join(', ');
    showToast(`🎁 Pack opened! You got: ${names}`, 'success', 7000);
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

async function initMarketplace(userId) {
  if (_marketplaceInited) return;
  _marketplaceInited = true;

  // Render shop immediately on first load
  renderShopGrid(userId);

  // Shop filters
  document.getElementById('shopSearch')?.addEventListener('input',  () => renderShopGrid(userId));
  document.getElementById('shopTypeFilter')?.addEventListener('change', () => renderShopGrid(userId));
  document.getElementById('shopRarityFilter')?.addEventListener('change', () => renderShopGrid(userId));

  // Pack buy button
  document.getElementById('buyPackBtn')?.addEventListener('click', () => handlePackBuy(userId));

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

      const species = pkm.species || 'Bulbasaur';
      const isOwn   = pkm.user_id === userId;
      const card    = await PokéEvolution.buildPokemonCard({
        nftId:      pkm.id,
        species,
        nickname:   pkm.nickname,
        level:      pkm.level || 1,
        experience: pkm.experience || 0,
        userId,
        onEvolved:  null,  // no evolving from marketplace
      });

      // Add market overlay
      const overlay = document.createElement('div');
      overlay.className = 'market-overlay';
      overlay.innerHTML = `
        <div class="market-price">💰 ${listing.price.toLocaleString()} POKÉ</div>
        ${isOwn
          ? `<button class="btn btn-danger-outline btn-sm cancel-listing-btn"
                     data-listing-id="${listing.id}">Cancel Listing</button>`
          : `<button class="btn btn-primary btn-sm buy-btn"
                     data-listing-id="${listing.id}"
                     data-species="${sanitize(species)}"
                     data-price="${listing.price}"
                     data-nickname="${sanitize(pkm.nickname || species)}">Buy Now</button>`
        }
      `;
      card.appendChild(overlay);
      grid.appendChild(card);
    }

    // Buy handlers (event delegation)
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
  const type  = document.getElementById('marketTypeFilter')?.value || 'all';
  const stage = document.getElementById('marketStageFilter')?.value || 'all';

  document.querySelectorAll('#marketGrid .nft-card').forEach(card => {
    const name  = (card.querySelector('.nft-card-header .card-name, .card-name')?.textContent || '').toLowerCase();
    const cType = card.dataset.types || '';
    const cStage= card.dataset.stage || '';

    const matchQ = !query || name.includes(query);
    const matchT = type  === 'all' || cType.includes(type);
    const matchS = stage === 'all' || cStage.includes(stage);
    card.style.display = (matchQ && matchT && matchS) ? '' : 'none';
  });
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
    .is('listing_id', null);  // not already listed

  if (!owned?.length) {
    picker.innerHTML = '<div class="empty-state">No Pokémon available to sell.</div>';
    return;
  }

  picker.innerHTML = '';
  for (const row of owned) {
    const species = row.species || 'Bulbasaur';
    const card    = await PokéEvolution.buildPokemonCard({
      nftId: row.id, species, nickname: row.nickname,
      level: row.level || 1, experience: row.experience || 0,
      userId, onEvolved: null,
    });
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => selectForSale(row, card));
    picker.appendChild(card);
  }
}

let _selectedForSale = null;
function selectForSale(row, cardEl) {
  document.querySelectorAll('#sellPicker .nft-card').forEach(c => c.classList.remove('selected-for-sale'));
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

  document.getElementById('confirmListBtn')?.addEventListener('click', async () => {
    if (!_selectedForSale) return;
    const price    = parseInt(document.getElementById('sellPrice')?.value);
    const duration = parseInt(document.getElementById('sellDuration')?.value);
    if (!price || price < 1) { showToast('Enter a valid price.', 'error'); return; }

    const expiresAt = new Date(Date.now() + duration * 86400000).toISOString();
    const { error } = await _supabase.from('market_listings').insert([{
      pokemon_id: _selectedForSale.id,
      seller_id:  userId,
      price,
      status:     'active',
      expires_at: expiresAt,
    }]);

    if (error) { showToast('Failed to list: ' + error.message, 'error'); return; }
    showToast(`${_selectedForSale.species || 'Pokémon'} listed for ${price} POKÉ! 🛒`, 'success');
    form?.classList.add('hidden');
    delete document.getElementById('sellPicker').dataset.loaded;
  }, { once: true });

  document.getElementById('cancelSellBtn')?.addEventListener('click', () => {
    form?.classList.add('hidden');
    _selectedForSale = null;
    cardEl.classList.remove('selected-for-sale');
  }, { once: true });
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

  const { data: listings } = await _supabase
    .from('market_listings')
    .select('id, price, status, listed_at, owned_pokemon(id, species, nickname, level, experience)')
    .eq('seller_id', userId)
    .order('listed_at', { ascending: false });

  if (!listings?.length) {
    grid.innerHTML = '<div class="empty-state"><p>You have no active listings.</p></div>';
    return;
  }

  grid.innerHTML = '';
  for (const listing of listings) {
    const pkm = listing.owned_pokemon;
    if (!pkm) continue;
    const species = pkm.species || 'Bulbasaur';
    const card = await PokéEvolution.buildPokemonCard({
      nftId: pkm.id, species, nickname: pkm.nickname,
      level: pkm.level || 1, experience: pkm.experience || 0,
      userId, onEvolved: null,
    });
    const badge = document.createElement('div');
    badge.className = `market-overlay status-${listing.status}`;
    badge.innerHTML = `
      <div class="market-price">💰 ${listing.price.toLocaleString()} POKÉ</div>
      <span class="listing-status-badge">${listing.status.toUpperCase()}</span>
      ${listing.status === 'active'
        ? `<button class="btn btn-danger-outline btn-sm cancel-listing-btn" data-listing-id="${listing.id}">Cancel</button>`
        : ''}
    `;
    card.appendChild(badge);
    grid.appendChild(card);
  }

  grid.addEventListener('click', (e) => {
    const b = e.target.closest('.cancel-listing-btn');
    if (b) cancelListing(b.dataset.listingId, userId);
  });
}

/* ============================================================
   BATTLE PANEL (simulated quick battle)
   ============================================================ */

let _battleInited = false;
let _battleState  = null;

async function initBattlePanel(userId) {
  if (_battleInited) return;
  _battleInited = true;

  // Tab switching
  document.querySelectorAll('#battles .battle-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#battles .battle-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.battle-pane').forEach(p => p.classList.add('hidden'));
      tab.classList.add('active');
      document.getElementById('battleTab-' + tab.dataset.tab)?.classList.remove('hidden');
    });
  });

  await loadBattleRoster(userId);

  document.getElementById('startBattleBtn')?.addEventListener('click', () => startQuickBattle(userId));
}

async function loadBattleRoster(userId) {
  const roster = document.getElementById('battleRoster');
  if (!roster) return;

  const { data: owned } = await _supabase
    .from('owned_pokemon')
    .select('id, species, nickname, level, experience')
    .eq('user_id', userId)
    .limit(6);

  if (!owned?.length) {
    roster.innerHTML = '<p style="color:var(--text-muted)">No Pokémon available.</p>';
    return;
  }

  roster.innerHTML = '';
  for (const row of owned) {
    const species = row.species || 'Bulbasaur';
    const meta    = await PokéEvolution.fetchPokemonMeta(species);
    const attrs   = meta?.attributes || [];
    const gif     = PokéEvolution.getGifPath(species);
    const hp      = PokéEvolution.getStat(attrs, 'HP');

    const chip = document.createElement('div');
    chip.className   = 'roster-chip';
    chip.dataset.nftId  = row.id;
    chip.dataset.species= species;
    chip.dataset.hp     = hp;
    chip.dataset.level  = row.level || 1;
    chip.dataset.atk    = PokéEvolution.getStat(attrs, 'ATK');
    chip.dataset.def    = PokéEvolution.getStat(attrs, 'DEF');
    // Grab skills
    for (let i = 1; i <= 4; i++) {
      chip.dataset['skill'+i+'Name']  = PokéEvolution.getStat(attrs, `Skill ${i} Name`);
      chip.dataset['skill'+i+'Atk']   = PokéEvolution.getStat(attrs, `Skill ${i} Attack`);
      chip.dataset['skill'+i+'Eff']   = PokéEvolution.getStat(attrs, `Skill ${i} Effect`);
    }
    chip.innerHTML = `
      <img src="${gif}" class="roster-gif" alt="${sanitize(row.nickname || species)}" />
      <span class="roster-name">${sanitize(row.nickname || species)}</span>
      <span class="roster-level">Lv.${row.level || 1}</span>
    `;
    chip.addEventListener('click', () => selectBattlePokemon(chip, owned.map(r => r.id).indexOf(row.id)));
    roster.appendChild(chip);
  }
}

function selectBattlePokemon(chip, idx) {
  document.querySelectorAll('.roster-chip').forEach(c => c.classList.remove('selected'));
  chip.classList.add('selected');

  const slot  = document.getElementById('playerSlot');
  const hpBar = document.getElementById('playerHpBar');
  const hpTxt = document.getElementById('playerHpText');
  const gif   = PokéEvolution.getGifPath(chip.dataset.species);

  slot.innerHTML = `
    <img src="${gif}" class="battle-gif battle-gif-player"
         alt="${sanitize(chip.dataset.species)}" />
    <span class="battle-pokemon-name">${sanitize(chip.dataset.species)}</span>
    <span class="battle-pokemon-level">Lv. ${chip.dataset.level}</span>
  `;

  const hp = parseInt(chip.dataset.hp) || 100;
  hpBar.style.width = '100%';
  hpTxt.textContent = `${hp} / ${hp} HP`;

  document.getElementById('startBattleBtn').disabled = false;

  _battleState = {
    playerSpecies: chip.dataset.species,
    playerHp:      hp, playerMaxHp: hp,
    playerAtk:     parseInt(chip.dataset.atk) || 50,
    playerDef:     parseInt(chip.dataset.def) || 50,
    skills: [
      { name: chip.dataset.skill1Name, atk: parseInt(chip.dataset.skill1Atk)||40, eff: chip.dataset.skill1Eff },
      { name: chip.dataset.skill2Name, atk: parseInt(chip.dataset.skill2Atk)||50, eff: chip.dataset.skill2Eff },
      { name: chip.dataset.skill3Name, atk: parseInt(chip.dataset.skill3Atk)||30, eff: chip.dataset.skill3Eff },
      { name: chip.dataset.skill4Name, atk: parseInt(chip.dataset.skill4Atk)||60, eff: chip.dataset.skill4Eff },
    ],
  };
}

// Simple random opponent selection from the metadata pool
const OPPONENT_POOL = [
  'Charmander','Squirtle','Bulbasaur','Pikachu','Eevee',
  'Pidgey','Ghastly','Dratini','Machop','Horsea',
];

async function startQuickBattle(userId) {
  if (!_battleState) return;
  const startBtn = document.getElementById('startBattleBtn');
  startBtn.disabled = true;
  startBtn.textContent = '⏳ Searching...';

  const oppSpecies = OPPONENT_POOL[Math.floor(Math.random() * OPPONENT_POOL.length)];
  const oppMeta    = await PokéEvolution.fetchPokemonMeta(oppSpecies);
  const oppAttrs   = oppMeta?.attributes || [];
  const oppHpMax   = PokéEvolution.getStat(oppAttrs, 'HP') || 180;
  const oppAtk     = PokéEvolution.getStat(oppAttrs, 'ATK') || 45;
  const oppDef     = PokéEvolution.getStat(oppAttrs, 'DEF') || 45;
  const oppGif     = PokéEvolution.getGifPath(oppSpecies);

  document.getElementById('opponentSlot').innerHTML = `
    <img src="${oppGif}" class="battle-gif battle-gif-opp" alt="${sanitize(oppSpecies)}" />
    <span class="battle-pokemon-name">${sanitize(oppSpecies)}</span>
  `;
  const oppHpBar = document.getElementById('opponentHpBar');
  const oppHpTxt = document.getElementById('opponentHpText');
  oppHpBar.style.width = '100%';
  oppHpTxt.textContent = `${oppHpMax} / ${oppHpMax} HP`;

  let oppHp = oppHpMax;
  let plHp  = _battleState.playerHp;
  const plHpBar = document.getElementById('playerHpBar');
  const plHpTxt = document.getElementById('playerHpText');

  const log = document.getElementById('battleLog');
  log.innerHTML = '<p class="log-entry">Battle started! Choose your skill!</p>';

  // Show skills
  const skillsDiv = document.getElementById('battleSkills');
  skillsDiv.classList.remove('hidden');
  _battleState.skills.forEach((skill, i) => {
    const btn = document.getElementById(`skill${i+1}Btn`);
    if (btn) {
      btn.textContent = skill.name ? `⚡ ${skill.name} (${skill.atk})` : `Attack ${i+1}`;
      btn.onclick = () => doPlayerTurn(skill, i);
    }
  });

  startBtn.textContent = '⚔️ Battle in progress...';

  function logEntry(msg) {
    const p = document.createElement('p');
    p.className = 'log-entry';
    p.textContent = msg;
    log.appendChild(p);
    log.scrollTop = log.scrollHeight;
  }

  function updateBars() {
    const pPct = Math.max(0, (plHp  / _battleState.playerMaxHp)  * 100);
    const oPct = Math.max(0, (oppHp / oppHpMax) * 100);
    plHpBar.style.width  = pPct  + '%';
    oppHpBar.style.width = oPct  + '%';
    plHpTxt.textContent  = `${Math.max(0,plHp)}  / ${_battleState.playerMaxHp} HP`;
    oppHpTxt.textContent = `${Math.max(0,oppHp)} / ${oppHpMax} HP`;
  }

  function disableSkills() {
    skillsDiv.querySelectorAll('.skill-btn').forEach(b => { b.disabled = true; });
  }
  function enableSkills() {
    skillsDiv.querySelectorAll('.skill-btn').forEach(b => { b.disabled = false; });
  }

  async function doPlayerTurn(skill) {
    disableSkills();

    // Player attacks
    const pDmg = Math.max(1, Math.round(skill.atk * (100 / (100 + oppDef)) * (0.85 + Math.random() * 0.3)));
    oppHp -= pDmg;
    logEntry(`${_battleState.playerSpecies} used ${skill.name}! Dealt ${pDmg} damage.`);
    updateBars();

    if (oppHp <= 0) {
      await endBattle(true, userId);
      return;
    }

    // Small delay then opponent attacks
    await new Promise(r => setTimeout(r, 800));

    const oppSkillAtk = PokéEvolution.getStat(oppAttrs, 'Skill 1 Attack') || oppAtk;
    const oDmg = Math.max(1, Math.round(oppSkillAtk * (100 / (100 + _battleState.playerDef)) * (0.85 + Math.random() * 0.3)));
    plHp -= oDmg;
    logEntry(`${oppSpecies} counter-attacked! Dealt ${oDmg} damage.`);
    updateBars();

    if (plHp <= 0) {
      await endBattle(false, userId);
      return;
    }

    enableSkills();
  }

  async function endBattle(playerWon, userId) {
    disableSkills();
    skillsDiv.classList.add('hidden');

    const xpGained = playerWon ? 120 : 30;
    const pokeGain = playerWon ? Math.floor(Math.random() * 50) + 20 : 0;

    logEntry(playerWon
      ? `🏆 You won! +${xpGained} XP, +${pokeGain} POKÉ earned!`
      : `💀 You lost! +${xpGained} XP for effort.`);

    // Update Supabase stats + XP
    try {
      const { data: t } = await _supabase.from('trainer_profiles').select('token_balance,battles_fought,battles_won,total_earned').eq('user_id', userId).single();
      if (t) {
        await _supabase.from('trainer_profiles').update({
          battles_fought: (t.battles_fought || 0) + 1,
          battles_won:    (t.battles_won    || 0) + (playerWon ? 1 : 0),
          token_balance:  (t.token_balance  || 0) + pokeGain,
          total_earned:   (t.total_earned   || 0) + pokeGain,
        }).eq('user_id', userId);

        // Refresh token display
        document.getElementById('tokenBalance').textContent = ((t.token_balance || 0) + pokeGain).toLocaleString();
        document.getElementById('walletBalance').textContent = `${((t.token_balance || 0) + pokeGain).toLocaleString()} POKÉ`;
      }

      // Award + check evolution
      if (_battleState.nftId) {
        const { data: pkm } = await _supabase.from('owned_pokemon').select('experience, level, species').eq('id', _battleState.nftId).single();
        if (pkm) {
          const newXp  = (pkm.experience || 0) + xpGained;
          const newLvl = Math.min(100, pkm.level + Math.floor(newXp / 1000));
          await _supabase.from('owned_pokemon').update({ experience: newXp % 1000, level: newLvl }).eq('id', _battleState.nftId);

          const { canEvolve, evolvesTo } = PokéEvolution.checkEvolution(pkm.species, newLvl);
          if (canEvolve) showToast(`✨ ${pkm.species} is ready to evolve into ${evolvesTo}! Visit My Pokémon.`, 'success', 6000);
        }
      }

    } catch (_) {}

    startBtn.disabled  = false;
    startBtn.textContent = '⚔️ Battle Again';
    startBtn.onclick   = () => startQuickBattle(userId);
  }
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
  initWalletPanel();

  // Logout buttons on dashboard
  ['dashLogoutBtn'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', authUtils.handleLogout);
  });

})();
