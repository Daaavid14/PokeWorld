/* ============================================================
   GAME LOBBY — Standalone Page Logic
   ============================================================ */

// ── State ──
let _lobbySelectedSlots = [null, null, null];
let _lobbyPokemonList   = [];
let _activePickerSlot   = -1;

// ── Toast helper ──
function showToast(msg, type = 'info', duration = 4000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 350); }, duration);
}

// ── Sanitize ──
function sanitize(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(String(str || '')));
  return d.innerHTML;
}

// ── Type helpers ──
const TYPE_MAP = {
  Bulbasaur:'grass', Ivysaur:'grass', Venasaur:'grass',
  Charmander:'fire', Charmeleon:'fire', Charizard:'fire',
  Squirtle:'water', Wartortle:'water', Blastoise:'water',
  Pichu:'electric', Pikachu:'electric', Raichu:'electric',
  Caterpie:'bug', Metapod:'bug', Butterfree:'bug',
  Weedle:'bug', Kakuna:'bug', Beedrill:'bug',
  Pidgey:'flying', Pidgeotto:'flying', Pidgeot:'flying',
  Ghastly:'ghost', Haunter:'ghost', Gengar:'ghost',
  Machop:'fighting', Machoke:'fighting', Machamp:'fighting',
  Dratini:'dragon', Dragonair:'dragon', Dragonite:'dragon',
  Eevee:'normal', Flareon:'fire', Jolteon:'electric',
  Cyndaquil:'fire', Quilava:'fire', Typhlosion:'fire',
  Totodile:'water', Croconaw:'water', Feraligatr:'water',
  Torchic:'fire', Combusken:'fire', Blaziken:'fire',
  Larvitar:'rock', Pupitar:'rock', Tyranitar:'rock',
  Elekid:'electric', Electabuzz:'electric', Electivire:'electric',
  Magby:'fire', Magmar:'fire', Magmortar:'fire',
  Horsea:'water', Seadra:'water', Kingdra:'water',
  Swinub:'ice', Piloswine:'ice', Mamoswine:'ice',
  Whismur:'normal', Loudred:'normal', Exploud:'normal',
};
const TYPE_COLORS = {
  fire:'#ff6030', water:'#4fc3f7', grass:'#56e66b', electric:'#ffe566',
  psychic:'#ff80ab', ice:'#aaeeff', fighting:'#e07040', poison:'#cc55cc',
  ground:'#c09a3a', flying:'#88aaee', bug:'#99cc33', rock:'#b8a038',
  ghost:'#7060b8', dragon:'#7038ec', dark:'#8c6040', steel:'#aab8c4',
  fairy:'#ee88bb', normal:'#a0a080',
};
function getType(species)      { return TYPE_MAP[species] || 'normal'; }
function getTypeColor(type)    { return TYPE_COLORS[type] || '#888'; }

// ── Load Pokémon from Supabase ──
async function loadLobbyPokemon(userId) {
  try {
    const { data: owned } = await _supabase
      .from('owned_pokemon')
      .select('id, species, nickname, level, experience, evolution_stage')
      .eq('user_id', userId)
      .order('level', { ascending: false });

    _lobbyPokemonList = owned || [];
    _lobbyPokemonList.slice(0, 3).forEach((pk, i) => {
      _lobbySelectedSlots[i] = pk;
    });
    renderLobbySlots();
  } catch (err) {
    console.error('[Lobby] Failed to load Pokémon:', err);
  }
}

// ── Render team slots ──
function renderLobbySlots() {
  for (let i = 0; i < 3; i++) {
    const slot = document.getElementById(`lobbySlot${i}`);
    if (!slot) continue;
    const pk = _lobbySelectedSlots[i];

    if (pk) {
      const gifPath = window.PokéEvolution?.getGifPath?.(pk.species) || `/assets/baseForm/${pk.species}.gif`;
      const type    = getType(pk.species);
      const typeClr = getTypeColor(type);
      slot.classList.add('slot-filled');
      slot.innerHTML = `
        <div class="lobby-slot-content">
          <img src="${gifPath}" alt="${pk.species}"
               onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png'" />
          <span class="lobby-slot-name">${pk.nickname || pk.species}</span>
          <span class="lobby-slot-lv">Lv. ${pk.level || 1}</span>
          <span class="lobby-slot-type-badge" style="background:${typeClr}">${type.toUpperCase()}</span>
        </div>
        <button class="lobby-slot-remove" onclick="event.stopPropagation(); removeLobbySlot(${i})">✕</button>
      `;
    } else {
      slot.classList.remove('slot-filled');
      slot.innerHTML = `
        <div class="lobby-slot-placeholder">
          <span class="slot-plus">+</span>
          <span class="slot-label-lobby">Slot ${i + 1}</span>
        </div>
      `;
    }
  }

  const hint = document.getElementById('lobbySyncHint');
  const filled = _lobbySelectedSlots.filter(Boolean).length;
  if (hint) {
    if (filled === 3) {
      hint.innerHTML = '<span class="sync-icon">✅</span><span>Team ready! Enter the Battle Arena!</span>';
    } else {
      hint.innerHTML = `<span class="sync-icon">🔄</span><span>Select ${3 - filled} more Pokémon for your team!</span>`;
    }
  }
}

function removeLobbySlot(index) {
  _lobbySelectedSlots[index] = null;
  renderLobbySlots();
  refreshPickerSelection();
}
window.removeLobbySlot = removeLobbySlot;

// ── Picker ──
function openPicker(slotIdx) {
  _activePickerSlot = slotIdx;
  const picker = document.getElementById('lobbyCollectionPicker');
  if (!picker) return;
  picker.classList.remove('hidden');
  renderPickerGrid();
}

function closePicker() {
  const picker = document.getElementById('lobbyCollectionPicker');
  if (picker) picker.classList.add('hidden');
  _activePickerSlot = -1;
}

function renderPickerGrid() {
  const grid = document.getElementById('lobbyPickerGrid');
  if (!grid) return;
  grid.innerHTML = '';

  if (!_lobbyPokemonList.length) {
    grid.innerHTML = '<p class="picker-loading">No Pokémon found. Mint some on the Shop first!</p>';
    return;
  }

  const selectedIds = _lobbySelectedSlots.filter(Boolean).map(p => p.id);

  _lobbyPokemonList.forEach((pk) => {
    const isSelected = selectedIds.includes(pk.id);
    const gifPath = window.PokéEvolution?.getGifPath?.(pk.species) || `/assets/baseForm/${pk.species}.gif`;
    const type    = getType(pk.species);
    const typeClr = getTypeColor(type);

    const card = document.createElement('div');
    card.className = `picker-card${isSelected ? ' selected' : ''}`;
    card.dataset.pkId = pk.id;
    card.innerHTML = `
      <img src="${gifPath}" alt="${pk.species}"
           onerror="this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png'" />
      <span class="picker-card-name">${pk.nickname || pk.species}</span>
      <span class="picker-card-lv">Lv. ${pk.level || 1}</span>
      <span class="picker-card-type" style="background:${typeClr}">${type.toUpperCase()}</span>
      <div class="picker-check">✓</div>
    `;
    card.addEventListener('click', () => pickPokemonForSlot(pk));
    grid.appendChild(card);
  });
}

function pickPokemonForSlot(pk) {
  if (_activePickerSlot < 0 || _activePickerSlot > 2) return;
  for (let i = 0; i < 3; i++) {
    if (_lobbySelectedSlots[i]?.id === pk.id) {
      _lobbySelectedSlots[i] = null;
    }
  }
  _lobbySelectedSlots[_activePickerSlot] = pk;
  renderLobbySlots();
  closePicker();
}

function refreshPickerSelection() {
  const grid = document.getElementById('lobbyPickerGrid');
  if (!grid) return;
  const selectedIds = _lobbySelectedSlots.filter(Boolean).map(p => p.id);
  grid.querySelectorAll('.picker-card').forEach(card => {
    const id = card.dataset.pkId;
    card.classList.toggle('selected', selectedIds.includes(id));
  });
}

// ── Bottom Nav ──
function initBottomNav() {
  const btns = document.querySelectorAll('.lobby-bnav-btn');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      const nav = btn.dataset.bnav;
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      document.querySelectorAll('.lobby-subpanel').forEach(p => p.classList.add('hidden'));

      if (nav !== 'home') {
        const panel = document.getElementById(`lobbySubpanel-${nav}`);
        if (panel) panel.classList.remove('hidden');
      }
    });
  });

  document.querySelectorAll('[data-close-subpanel]').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.lobby-subpanel')?.classList.add('hidden');
      document.querySelectorAll('.lobby-bnav-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('.lobby-bnav-btn[data-bnav="home"]')?.classList.add('active');
    });
  });
}

// ── Game Mode Buttons ──
function initGameModeButtons() {
  const adventureBtn = document.getElementById('btnModeAdventure');
  const arenaBtn     = document.getElementById('btnModeArena');

  if (adventureBtn) {
    adventureBtn.addEventListener('click', () => {
      adventureBtn.classList.add('active-mode');
      arenaBtn?.classList.remove('active-mode');
      showToast('Adventure mode coming soon! 🗺️', 'info', 3000);
    });
  }
  if (arenaBtn) {
    arenaBtn.addEventListener('click', () => {
      arenaBtn.classList.add('active-mode');
      adventureBtn?.classList.remove('active-mode');
    });
  }
}

// ── Battle Log ──
async function loadBattleLog(userId) {
  const logList = document.getElementById('battleLogList');
  if (!logList) return;

  try {
    const { data: logs } = await _supabase
      .from('battle_results')
      .select('outcome, poke_earned, xp_earned, team_used, played_at')
      .eq('user_id', userId)
      .order('played_at', { ascending: false })
      .limit(20);

    if (!logs?.length) {
      logList.innerHTML = '<div class="log-empty">No battles recorded yet. Start battling!</div>';
      return;
    }

    logList.innerHTML = '';
    logs.forEach(log => {
      const entry = document.createElement('div');
      entry.className = 'log-entry';
      const team = parseBattleTeam(log.team_used);
      const date = new Date(log.played_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      entry.innerHTML = `
        <span class="log-outcome ${log.outcome}">${log.outcome.toUpperCase()}</span>
        <span class="log-team">${team}</span>
        <span class="log-reward">+${log.poke_earned || 0} POKÉ</span>
        <span class="log-date">${date}</span>
      `;
      logList.appendChild(entry);
    });
  } catch (err) {
    console.warn('[BattleLog] Load failed:', err);
  }
}

function parseBattleTeam(teamJson) {
  try {
    const team = typeof teamJson === 'string' ? JSON.parse(teamJson) : teamJson;
    if (Array.isArray(team)) return team.map(p => p.species || '?').join(', ');
  } catch (_) {}
  return '—';
}

// ── Leaderboard ──
async function loadLeaderboard() {
  const body = document.getElementById('leaderboardBody');
  if (!body) return;

  try {
    const { data: leaders } = await _supabase
      .from('trainer_profiles')
      .select('username, battles_won, battles_fought')
      .order('battles_won', { ascending: false })
      .limit(15);

    if (!leaders?.length) return;

    const list = body.querySelector('.leaderboard-list');
    if (!list) return;

    const empty = list.querySelector('.lb-empty');
    if (empty) empty.remove();

    leaders.forEach((t, i) => {
      const row = document.createElement('div');
      row.className = 'lb-row';
      const rating = t.battles_fought > 0 ? Math.round((t.battles_won / t.battles_fought) * 1000) : 0;
      const medals = ['🥇', '🥈', '🥉'];
      row.innerHTML = `
        <span class="lb-rank">${i < 3 ? medals[i] : i + 1}</span>
        <span class="lb-name">${sanitize(t.username || 'Trainer')}</span>
        <span class="lb-wins">${t.battles_won || 0}</span>
        <span class="lb-rating">${rating}</span>
      `;
      list.appendChild(row);
    });
  } catch (err) {
    console.warn('[Leaderboard] Load failed:', err);
  }
}

/* ============================================================
   INIT — Auth guard & boot lobby
   ============================================================ */
(async function init() {
  // Auth guard — redirect if no session
  const { data: { session } } = await _supabase.auth.getSession();
  if (!session) {
    window.location.href = '/';
    return;
  }

  const userId = session.user.id;

  // Load trainer stats
  try {
    const { data: profile } = await _supabase
      .from('trainer_profiles')
      .select('battles_fought, battles_won')
      .eq('user_id', userId)
      .single();

    const fought = profile?.battles_fought || 0;
    const won    = profile?.battles_won    || 0;
    const rate   = fought > 0 ? Math.round((won / fought) * 100) : 0;

    const gwTotal   = document.getElementById('gwTotalBattles');
    const gwWins    = document.getElementById('gwWins');
    const gwWinRate = document.getElementById('gwWinRate');
    if (gwTotal)   gwTotal.textContent   = fought;
    if (gwWins)    gwWins.textContent    = won;
    if (gwWinRate) gwWinRate.textContent = rate + '%';
  } catch (e) {
    console.warn('[Lobby] stat load failed:', e);
  }

  // Load team Pokémon
  await loadLobbyPokemon(userId);

  // Wire team slot clicks
  for (let i = 0; i < 3; i++) {
    const slot = document.getElementById(`lobbySlot${i}`);
    if (slot) slot.addEventListener('click', () => openPicker(i));
  }

  // Wire picker close
  document.getElementById('pickerCloseBtn')?.addEventListener('click', () => closePicker());

  // Wire bottom nav & game mode buttons
  initBottomNav();
  initGameModeButtons();

  // Wire "Enter Battle Arena" — store team in sessionStorage before navigating
  const battleBtn = document.getElementById('lobbyBattleBtn');
  if (battleBtn) {
    battleBtn.addEventListener('click', (e) => {
      const team = _lobbySelectedSlots.filter(Boolean);
      if (team.length !== 3) {
        e.preventDefault();
        showToast('Select 3 Pokémon before entering the arena!', 'error', 3000);
        return;
      }
      // Store minimal team data for battle-main.js to consume
      const payload = team.map(pk => ({
        id:              pk.id,
        species:         pk.species,
        nickname:        pk.nickname || null,
        level:           pk.level || 1,
        experience:      pk.experience || 0,
        evolution_stage: pk.evolution_stage || 'base',
      }));
      sessionStorage.setItem('lobbyTeam', JSON.stringify(payload));
      // Allow default <a> navigation to /battle.html
    });
  }

  // Load data
  loadBattleLog(userId);
  loadLeaderboard();
})();
