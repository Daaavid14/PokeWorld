/**
 * battle-main.js — PokéWorld Battle Page Orchestrator
 *
 * Responsibilities:
 *  1. Auth guard (redirect to index if not logged in)
 *  2. Load player's NFT Pokémon from Supabase
 *  3. Resolve pre-selected team from lobby (sessionStorage) or auto-pick
 *  4. Start matchmaking → generate AI team
 *  5. Wire BattleEngine + BattleUI together
 *  6. Handle End Turn button
 *  7. Post-battle: save XP, POKÉ tokens, battle_results to Supabase
 */

'use strict';

(async function BATTLE_MAIN() {

  /* ── Constants ──────────────────────────────────────────── */
  const REDIRECT_URL = '/';

  /* ── Supabase session check ──────────────────────────────── */
  async function getSession() {
    if (!window._supabase) return null;
    const { data } = await _supabase.auth.getSession();
    return data?.session || null;
  }

  /* ── Wait for Supabase to be ready ──────────────────────── */
  function waitForSupabase(timeout = 5000) {
    return new Promise((resolve, reject) => {
      if (window._supabase) return resolve(window._supabase);
      const start = Date.now();
      const iv = setInterval(() => {
        if (window._supabase) { clearInterval(iv); resolve(window._supabase); }
        if (Date.now() - start > timeout) { clearInterval(iv); reject(new Error('Supabase timeout')); }
      }, 100);
    });
  }

  /* ── Wait for PokéEvolution ──────────────────────────────── */
  function waitForEvolution(timeout = 5000) {
    return new Promise((resolve) => {
      if (window.PokéEvolution) return resolve();
      const start = Date.now();
      const iv = setInterval(() => {
        if (window.PokéEvolution) { clearInterval(iv); resolve(); }
        if (Date.now() - start > timeout) { clearInterval(iv); resolve(); }
      }, 100);
    });
  }

  /* ════════════════════════════════════════════════════════
     MAIN INIT
     ════════════════════════════════════════════════════════ */
  try {
    await waitForSupabase();
    await waitForEvolution();

    const session = await getSession();
    if (!session) {
      window.location.href = REDIRECT_URL;
      return;
    }

    const userId = session.user.id;
    const userEmail = session.user.email;

    // Show greeting
    const greetEl = document.getElementById('battle-greeting');
    if (greetEl) greetEl.textContent = userEmail?.split('@')[0] || 'Trainer';

    // Add logout handler
    const logoutBtn = document.getElementById('btn-battle-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        await _supabase.auth.signOut();
        window.location.href = REDIRECT_URL;
      });
    }

    /* ── Read pre-selected team from lobby ──────────────────── */
    const lobbyTeamRaw = sessionStorage.getItem('lobbyTeam');
    let lobbyTeam = null;
    if (lobbyTeamRaw) {
      try { lobbyTeam = JSON.parse(lobbyTeamRaw); } catch (_) {}
      sessionStorage.removeItem('lobbyTeam');   // one-time use
    }

    /* ── Load player's Pokémon from DB ──────────────────────── */
    const myPokemon = await loadPlayerPokemon(userId);
    if (!myPokemon.length) {
      showError('You have no Pokémon yet! Mint some on the dashboard first.');
      return;
    }

    /* ── Resolve team and go straight to matchmaking ────────── */
    let selected = [];

    if (lobbyTeam && lobbyTeam.length === 3) {
      // Match lobby selections to loaded instances by DB id
      const lobbyIds = lobbyTeam.map(p => p.id);
      selected = lobbyIds
        .map(id => myPokemon.find(pk => pk.nftId === id))
        .filter(Boolean);
    }

    // Fallback: if lobby didn't provide a valid team, auto-pick first 3
    if (selected.length !== 3) {
      selected = myPokemon.slice(0, 3);
    }

    if (selected.length < 3) {
      showError('You need at least 3 Pokémon to battle! Mint more on the dashboard.');
      return;
    }

    await startMatchmaking(userId, selected);

    // Play again button on result screen
    const playAgainBtn = document.getElementById('btn-play-again');
    if (playAgainBtn) {
      playAgainBtn.addEventListener('click', () => window.location.reload());
    }

  } catch (err) {
    console.error('[BattleMain] Init error:', err);
    showError('Failed to load battle page. Please try again.');
  }

  /* ════════════════════════════════════════════════════════
     LOAD PLAYER POKÉMON
     ════════════════════════════════════════════════════════ */
  async function loadPlayerPokemon(userId) {
    const { data, error } = await _supabase
      .from('owned_pokemon')
      .select('id, species, nickname, level, experience, evolution_stage')
      .eq('user_id', userId)
      .order('level', { ascending: false });

    if (error) { console.error('[BattleMain] DB error:', error); return []; }
    if (!data?.length) return [];

    // Map text evolution_stage → numeric stage for stat calculations
    const stageMap = { base: 1, second: 2, third: 3 };

    const instances = [];
    for (const row of data) {
      // Attrs always come from metadata JSON (no column in DB)
      let attrs = [];
      if (window.PokéEvolution?.fetchPokemonMeta) {
        try {
          const meta = await PokéEvolution.fetchPokemonMeta(row.species);
          attrs = meta?.attributes || [];
        } catch (_) { attrs = []; }
      }

      const numericStage = stageMap[row.evolution_stage] || 1;

      instances.push(createPokemonInstance({
        id:              row.id,
        species:         row.species || 'Bulbasaur',
        level:           row.level   || 1,
        attrs,
        evolution_stage: numericStage,
      }));
    }
    return instances;
  }

  /* ════════════════════════════════════════════════════════
     MATCHMAKING → BATTLE START
     ════════════════════════════════════════════════════════ */
  async function startMatchmaking(userId, playerInstances) {
    BattleUI.showMatchmaking('Wild AI Trainer');

    // Brief matchmaking delay for UX
    await sleep(2000);

    // Generate AI seed from userId + timestamp
    const seed = _hashCode(userId + Date.now());
    const aiTeam = generateAITeam(seed, playerInstances);

    // Enrich AI team with metadata-based skills (same as player)
    for (const pk of aiTeam) {
      if (window.PokéEvolution?.fetchPokemonMeta) {
        try {
          const meta = await PokéEvolution.fetchPokemonMeta(pk.species);
          const attrs = meta?.attributes || [];
          if (attrs.length > 0) {
            const metaSkills = window.buildSkillsFromMetadata?.(attrs, pk.species, pk.type);
            if (metaSkills && metaSkills.length > 0) pk.skillPool = metaSkills;
          }
        } catch (_) {}
      }
    }

    // Display opponent in matchmaking
    const aiNameEl = document.getElementById('opponent-name');
    if (aiNameEl) aiNameEl.textContent = `AI Trainer [${aiTeam[0]?.species}]`;

    await sleep(500);

    // Wire up engine
    const engine = new BattleEngine(playerInstances, aiTeam);

    BattleUI.init(engine);
    BattleUI.showScreen('battle');
    renderBattleControlPanel(engine, userId, playerInstances);

    engine.startBattle();
  }

  /* ── Render end-turn + target selection panel ─────────────── */
  function renderBattleControlPanel(engine, userId, playerInstances) {

    /* Card click is now handled by the queue system in BattleUI.
       We still bind it so the queue can be flushed on End Turn. */
    /* Cards are queued directly by battle-ui.js via engine.queueCard().
       bindCardClick is no longer the primary card-selection path,
       but we keep the binding for any edge-case fallback.            */
    BattleUI.bindCardClick((cardId, targetIdx, casterIdx) => {
      const result = engine.queueCard('player', cardId, targetIdx, casterIdx);
      if (!result.ok) {
        _showInlineNotice(result.reason);
      }
    });

    BattleUI.bindEndTurn(() => engine.endTurn('player'));

    const endBtn = document.getElementById('btn-end-turn');
    if (endBtn) {
      endBtn.addEventListener('click', () => {
        if (engine.state.phase !== 'player_turn') return;

        // Cards are already queued in the engine via queueCard().
        // End Turn triggers: AI selection → speed-based resolution.
        BattleUI.clearCardQueue();
        engine.endTurn('player');
      });
    }

    // Battle end → save rewards
    engine.on('battleEnd', async (ev) => {
      await applyPostBattleRewards(userId, ev.winner, ev.rewards, playerInstances, engine.state);
    });
  }

  /* ════════════════════════════════════════════════════════
     POST-BATTLE REWARDS
     ════════════════════════════════════════════════════════ */
  async function applyPostBattleRewards(userId, winner, rewards, playerInstances, finalState) {
    const didWin = winner === 'player';

    try {
      // 1. Update each player Pokémon XP
      for (const pk of playerInstances) {
        const xpGained = pk.xpEarned + (didWin ? 100 : 20);
        const newXp    = (pk.xpEarned || 0) + xpGained;

        // Check evolution
        let newSpecies = pk.species;
        let newStage   = pk.stage;
        if (window.PokéEvolution?.checkEvolution) {
          const evo = PokéEvolution.checkEvolution(pk.species, pk.level + Math.floor(newXp / 100));
          if (evo?.canEvolve) {
            newSpecies = evo.evolvesTo;
            newStage   = pk.stage + 1;
          }
        }

        await _supabase
          .from('owned_pokemon')
          .update({
            experience:      newXp,
            level:           Math.min(100, pk.level + Math.floor(newXp / 200)),
            species:         newSpecies,
            evolution_stage: newStage,
          })
          .eq('id', pk.nftId)
          .eq('user_id', userId);
      }

      // 2. Add POKÉ tokens to trainer_profiles
      const { data: profile } = await _supabase
        .from('trainer_profiles')
        .select('token_balance, battles_fought, battles_won, total_earned')
        .eq('user_id', userId)
        .single();

      if (profile) {
        await _supabase
          .from('trainer_profiles')
          .update({
            token_balance:  (profile.token_balance  || 0) + rewards.pokeTokens,
            battles_fought: (profile.battles_fought || 0) + 1,
            battles_won:    (profile.battles_won    || 0) + (didWin ? 1 : 0),
            total_earned:   (profile.total_earned   || 0) + rewards.pokeTokens,
          })
          .eq('user_id', userId);
      }

      // 3. Insert battle_results record
      await _supabase.from('battle_results').insert({
        user_id:     userId,
        outcome:     didWin ? 'win' : 'loss',
        poke_earned: rewards.pokeTokens,
        xp_earned:   rewards.xpGain,
        team_used:   JSON.stringify(playerInstances.map(p => ({ species: p.species, level: p.level }))),
        played_at:   new Date().toISOString(),
      });

    } catch (err) {
      console.warn('[BattleMain] Reward save failed:', err);
    }
  }

  /* ════════════════════════════════════════════════════════
     UTILITY HELPERS
     ════════════════════════════════════════════════════════ */
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function _hashCode(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = (h << 5) + h + str.charCodeAt(i);
    return h >>> 0;
  }

  function showError(msg) {
    const el = document.getElementById('battle-error');
    if (el) { el.textContent = msg; el.style.display = 'block'; }
    else alert(msg);
  }

  function _showInlineNotice(reason) {
    const notices = {
      insufficient_energy: "Not enough energy! ⚡",
      card_limit_reached:  "Card limit reached! End your turn.",
      wrong_phase:         "It's not your turn.",
      status_skip:         "Your Pokémon can't move!",
      no_target:           "No valid target.",
    };
    const msg = notices[reason] || reason;
    const el  = document.getElementById('battle-notice');
    if (el) {
      el.textContent = msg;
      el.classList.add('visible');
      setTimeout(() => el.classList.remove('visible'), 2000);
    }
  }

})();
