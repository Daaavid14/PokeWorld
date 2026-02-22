# PokeWorld — Full Battle Game Implementation Prompt

## Project Context

You are building the **Battle Game** feature for **PokeWorld**, a Pokémon NFT game on the Sepolia
testnet. The existing stack is:

- **Frontend** — Vanilla HTML / CSS / JS (no framework)
- **Auth & DB** — Supabase (`_supabase` is already available globally via `config.js`)
- **Blockchain** — Ethers v6, Sepolia testnet via `blockchain.js` (`window.PokéChain`)
- **NFT Struct** — `PokeWorldNFT` contract at `0xAd05685373ab184EBc2876b25918aAd148462B86`
- **UI Gateway** — `dashboard.html` has a **"Game"** sidebar link (`data-panel="battles"`)
- **Assets** — Animated GIFs in `/assets/baseForm/`, `/assets/secondForm/`, `/assets/thirdForm/`
- **Evolution** — `window.PokéEvolution` exposes `getStat()`, `buildPokemonCard()`, `EVOLUTION_CHAINS`

---

## Goal

Replace the placeholder Quick-Battle UI in `dashboard.html` with a single **"Enter Battle Arena"**
button that opens `battle.html` **in a new browser tab** (`target="_blank"`). All real gameplay
lives in `battle.html` — a full-screen, standalone battle experience.

---

## Part 1 — Dashboard Hook (small change)

### `dashboard.html` — battles panel

Replace the entire `<!-- ---- PANEL: BATTLES ---- -->` section with:

```html
<!-- ---- PANEL: BATTLES ---- -->
<section class="dash-panel hidden" id="battles" aria-labelledby="battlesTitle">
  <h1 class="dash-title" id="battlesTitle">Battle Arena ⚔️</h1>

  <div class="battle-gateway">
    <div class="gateway-visual">
      <!-- looping pokeball / arena background animation defined in CSS -->
      <div class="gateway-orb" aria-hidden="true"></div>
    </div>
    <h2 class="gateway-headline">3v3 Energy-Combo Battles</h2>
    <p class="gateway-sub">
      Pick 3 of your Pokémon NFTs, build energy, chain combos, and destroy the enemy team.<br/>
      Inspired by Axie Infinity's card-style skill system.
    </p>
    <div class="gateway-stats-row">
      <div class="gstat"><span class="gstat-val" id="gwTotalBattles">—</span><span class="gstat-lbl">Battles</span></div>
      <div class="gstat"><span class="gstat-val" id="gwWins">—</span><span class="gstat-lbl">Wins</span></div>
      <div class="gstat"><span class="gstat-val" id="gwWinRate">—</span><span class="gstat-lbl">Win %</span></div>
    </div>
    <a id="enterBattleBtn"
       class="btn btn-primary btn-xl battle-enter-btn"
       href="/battle.html"
       target="_blank"
       rel="noopener noreferrer">
      ⚔️ Enter Battle Arena
    </a>
    <p class="gateway-hint">Opens in a new tab — your NFT team awaits.</p>
  </div>
</section>
```

In `dashboard.js`, when the battles panel activates, populate `gwTotalBattles`, `gwWins`,
`gwWinRate` from the trainer's Supabase `trainer_profiles` row.

---

## Part 2 — `battle.html` (new file, full-screen game)

### Page Shell

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Battle Arena | PokéWorld</title>
  <link rel="icon" href="/assets/pokeball.svg" />
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@300;400;600;700&display=swap" rel="stylesheet" />
  <!-- Supabase, Ethers -->
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="https://cdn.jsdelivr.net/npm/ethers@6/dist/ethers.umd.min.js"></script>
  <!-- Existing shared helpers -->
  <script src="/js/config.js"></script>
  <script src="/js/wallet.js"></script>
  <script src="/js/blockchain.js"></script>
  <script src="/js/evolution.js"></script>
  <!-- Battle-specific -->
  <link rel="stylesheet" href="/css/battle.css" />
  <script src="/js/battle-data.js" defer></script>
  <script src="/js/battle-engine.js" defer></script>
  <script src="/js/battle-ui.js" defer></script>
  <script src="/js/battle-main.js" defer></script>
</head>
<body class="battle-body">

  <!-- ══════════════ SCREEN 1 — TEAM SELECT ══════════════ -->
  <div id="screen-teamselect" class="battle-screen active">
    <header class="battle-header">
      <a href="/dashboard.html" class="back-link">← Dashboard</a>
      <h1 class="battle-logo">⚔️ PokéWorld Battle</h1>
      <div class="header-energy">
        <span class="energy-crystal" id="headerEnergy">0</span> ⚡ Energy
      </div>
    </header>

    <div class="teamselect-body">
      <h2 class="ts-title">Select Your Battle Team <span class="ts-counter" id="tsCounter">0 / 3</span></h2>
      <p class="ts-hint">Choose exactly 3 Pokémon from your NFT collection. Order matters — front goes first.</p>

      <div class="ts-order-row" id="tsOrderRow">
        <div class="ts-slot" data-slot="0"><span class="slot-label">Slot 1 — Front</span></div>
        <div class="ts-slot" data-slot="1"><span class="slot-label">Slot 2 — Mid</span></div>
        <div class="ts-slot" data-slot="2"><span class="slot-label">Slot 3 — Rear</span></div>
      </div>

      <div class="ts-collection-grid" id="tsCollectionGrid">
        <!-- NFT cards injected here -->
      </div>

      <div class="ts-actions">
        <button class="btn btn-ghost" id="tsRandomBtn">🎲 Random Team</button>
        <button class="btn btn-primary btn-xl" id="tsStartBtn" disabled>⚔️ Find Opponent</button>
      </div>
    </div>
  </div>

  <!-- ══════════════ SCREEN 2 — LOADING / MATCHMAKING ══════════════ -->
  <div id="screen-matchmaking" class="battle-screen hidden">
    <div class="mm-center">
      <div class="mm-spinner"></div>
      <h2 class="mm-title">Searching for Opponent…</h2>
      <p class="mm-sub" id="mmSub">Connecting to battle server</p>
      <button class="btn btn-ghost" id="mmCancelBtn">Cancel</button>
    </div>
  </div>

  <!-- ══════════════ SCREEN 3 — BATTLE ARENA ══════════════ -->
  <div id="screen-battle" class="battle-screen hidden">

    <!-- ─── FIELD HEADER ─── -->
    <div class="field-header">
      <div class="field-turn-badge" id="fieldTurnBadge">Round 1</div>
      <div class="field-phase-label" id="fieldPhaseLabel">Your Turn</div>
      <div class="field-timer" id="fieldTimer">30</div>
    </div>

    <!-- ─── MAIN FIELD (3 v 3) ─── -->
    <div class="battle-field">

      <!-- OPPONENT TEAM (top) -->
      <div class="field-row opponent-row" id="opponentRow">
        <!-- 3 × .field-pokemon-card injected by JS -->
      </div>

      <!-- BATTLEFIELD FX LAYER -->
      <div class="battlefield-fx" id="battlefieldFx" aria-hidden="true">
        <div class="field-bg-anim"></div>
      </div>

      <!-- PLAYER TEAM (bottom) -->
      <div class="field-row player-row" id="playerRow">
        <!-- 3 × .field-pokemon-card injected by JS -->
      </div>
    </div>

    <!-- ─── ENERGY BAR ─── -->
    <div class="energy-hud">
      <span class="energy-label">⚡ ENERGY</span>
      <div class="energy-crystals" id="energyCrystals">
        <!-- 10 crystal orbs injected by JS, fill = gained -->
      </div>
      <span class="energy-count" id="energyCount">0 / 10</span>
      <span class="energy-regen-hint">+2 per round</span>
    </div>

    <!-- ─── COMBO INDICATOR ─── -->
    <div class="combo-hud hidden" id="comboHud">
      <span class="combo-label">COMBO</span>
      <span class="combo-count" id="comboCount">x0</span>
      <div class="combo-decay-bar">
        <div class="combo-decay-fill" id="comboDecayFill"></div>
      </div>
    </div>

    <!-- ─── SKILL HAND ─── -->
    <div class="skill-hand-wrap" id="skillHandWrap">
      <div class="skill-hand" id="skillHand">
        <!-- Up to 6 skill cards drawn from active Pokémon's pool each round -->
      </div>
      <button class="btn btn-ghost btn-sm end-turn-btn" id="endTurnBtn">End Turn ▶</button>
    </div>

    <!-- ─── BATTLE LOG ─── -->
    <div class="battle-log-wrap">
      <div class="battle-log" id="battleLog" aria-live="polite"></div>
    </div>

    <!-- ─── ACTIVE POKEMON PORTRAIT (bottom-left) ─── -->
    <div class="active-portrait" id="activePortrait">
      <!-- replaced dynamically when player taps a field card -->
    </div>

  </div><!-- /screen-battle -->

  <!-- ══════════════ SCREEN 4 — RESULT ══════════════ -->
  <div id="screen-result" class="battle-screen hidden">
    <div class="result-center">
      <div class="result-icon" id="resultIcon">🏆</div>
      <h1 class="result-title" id="resultTitle">Victory!</h1>
      <p class="result-sub" id="resultSub">You defeated the opponent's team.</p>
      <div class="result-rewards" id="resultRewards"></div>
      <div class="result-actions">
        <button class="btn btn-primary" id="playAgainBtn">⚔️ Play Again</button>
        <a href="/dashboard.html" class="btn btn-ghost">← Dashboard</a>
      </div>
    </div>
  </div>

</body>
</html>
```

---

## Part 3 — `battle-data.js` (game constants & skill definitions)

Create `/js/battle-data.js`. This is the single source of truth for all skill definitions,
type chart, status effects, and combo thresholds.

### Energy System Rules (Axie Infinity-inspired)

```js
window.BATTLE_DATA = {};

BATTLE_DATA.ENERGY = {
  MAX: 10,           // max energy crystals
  REGEN_PER_ROUND: 2, // auto-gained at round start
  MAX_CARDS_PER_TURN: 5, // max skill cards playable per turn before End Turn
};
```

### Skill Card Schema

Each Pokémon has **4 skills** from `battle-data.js`. A skill card costs **1–3 energy**:

```js
// Full skill card structure
{
  id:          'charmander_scratch',
  name:        'Scratch',
  type:        'normal',        // matches Pokémon type chart
  energyCost:  1,
  dmgMulti:    1.0,             // × attacker's ATK stat
  effect:      null,            // or 'burn' | 'paralyze' | 'freeze' | 'confuse' | 'shield'
  effectChance: 0,              // 0–100
  stackable:   false,           // if true, playing same card twice multiplies damage
  comboTrigger: false,          // if true, activating this card while combo > 0 adds bonus dmg
  description: 'A basic scratch dealing 100% ATK damage.',
  icon:        '🔥',
}
```

### All 20 Pokémon — 4 skills each

Define skills for every species across all evolution stages. **Higher-stage Pokémon** get higher
`dmgMulti`, lower `energyCost`, and `stackable: true` on at least one skill. Example:

```js
BATTLE_DATA.SKILLS = {
  // ── FIRE LINE ──────────────────────────────────────────────
  Charmander: [
    { id:'ch_scratch',   name:'Scratch',       energyCost:1, dmgMulti:1.0, effect:null,    comboTrigger:false, stackable:false, icon:'🔥', description:'Basic fire scratch.' },
    { id:'ch_ember',     name:'Ember',         energyCost:1, dmgMulti:1.2, effect:'burn',  effectChance:20,    comboTrigger:true,  stackable:false, icon:'🔥', description:'Small flame burst. 20% burn.' },
    { id:'ch_growl',     name:'Growl',         energyCost:1, dmgMulti:0,   effect:'debuff_atk', effectChance:100, comboTrigger:false, stackable:true, icon:'📢', description:'Lowers enemy ATK by 10% per stack (max 3).' },
    { id:'ch_firespin',  name:'Fire Spin',     energyCost:2, dmgMulti:1.8, effect:'trap',  effectChance:100,   comboTrigger:true,  stackable:false, icon:'🌀', description:'Traps enemy for 2 turns. Combo triggers +50% dmg.' },
  ],
  Charmeleon: [
    { id:'cm_slash',     name:'Slash',         energyCost:1, dmgMulti:1.4, effect:null,    comboTrigger:false, stackable:false, icon:'🔥' },
    { id:'cm_flamethrower', name:'Flamethrower', energyCost:2, dmgMulti:2.0, effect:'burn', effectChance:30,  comboTrigger:true,  stackable:true,  icon:'🔥', description:'Stackable: 2nd cast = +40% extra.' },
    { id:'cm_dragonclaw',name:'Dragon Claw',   energyCost:2, dmgMulti:1.6, effect:null,    comboTrigger:true,  stackable:false, icon:'🐉' },
    { id:'cm_inferno',   name:'Inferno',       energyCost:3, dmgMulti:3.2, effect:'burn',  effectChance:80,    comboTrigger:true,  stackable:false, icon:'☄️', description:'ULTIMATE — massive fire. Combo = stun 1 turn.' },
  ],
  Charizard: [
    { id:'cz_fireblast',  name:'Fire Blast',   energyCost:2, dmgMulti:2.5, effect:'burn',  effectChance:40,   comboTrigger:true,  stackable:true,  icon:'💥' },
    { id:'cz_dragonrage', name:'Dragon Rage',  energyCost:2, dmgMulti:2.2, effect:null,    comboTrigger:true,  stackable:false, icon:'🐉' },
    { id:'cz_earthquake', name:'Earthquake',   energyCost:3, dmgMulti:2.8, effect:'debuff_def', effectChance:60, comboTrigger:false, stackable:true, icon:'🌋' },
    { id:'cz_blastburn',  name:'Blast Burn',   energyCost:3, dmgMulti:4.0, effect:'burn',  effectChance:100,  comboTrigger:true,  stackable:false, icon:'☄️', description:'ULTIMATE — nuclear fire. Stackable Earthquake combo = AOE.' },
  ],

  // ── Continue all 20 lines × 3 stages = 60 Pokémon × 4 skills ──
  // (Pattern: base → energyCost 1-2, multi 1.0-1.8 | second → 1-2, 1.4-2.0 | third → 2-3, 2.2-4.0)
  // At minimum define skills for every species in window.PokéEvolution.EVOLUTION_CHAINS
};
```

### Type Effectiveness Chart (18 types, same as Gen VII)

```js
BATTLE_DATA.TYPE_CHART = {
  fire:     { grass:2.0, water:0.5, fire:0.5, rock:0.5, ice:2.0, bug:2.0, steel:2.0, dragon:0.5, normal:1 },
  water:    { fire:2.0, grass:0.5, water:0.5, rock:2.0, ground:2.0, dragon:0.5, normal:1 },
  grass:    { water:2.0, fire:0.5, grass:0.5, rock:2.0, ground:2.0, flying:0.5, bug:0.5, dragon:0.5, normal:1 },
  electric: { water:2.0, grass:0.5, electric:0.5, flying:2.0, ground:0, dragon:0.5, normal:1 },
  ghost:    { ghost:2.0, normal:0, fighting:0, psychic:2.0, dark:0.5, normal:1 },
  dragon:   { dragon:2.0, steel:0.5, fairy:0, normal:1 },
  fighting: { normal:2.0, rock:2.0, steel:2.0, ghost:0, psychic:0.5, flying:0.5, bug:0.5, fairy:0.5 },
  bug:      { grass:2.0, fire:0.5, flying:0.5, fighting:0.5, ghost:0.5, steel:0.5, normal:1 },
  normal:   { rock:0.5, ghost:0, steel:0.5 },
  ice:      { grass:2.0, fire:0.5, water:0.5, ice:0.5, ground:2.0, flying:2.0, dragon:2.0 },
  // ... full 18-type matrix
};

BATTLE_DATA.getTypeMultiplier = function(atkType, defType) {
  const row = BATTLE_DATA.TYPE_CHART[atkType] || {};
  return row[defType] ?? 1;
};
```

### Combo System

```js
BATTLE_DATA.COMBO = {
  // Using the same TYPE consecutively within a single turn stacks the combo
  SAME_TYPE_COMBO_BONUS: 0.15,  // +15% dmg per stack on same-type skill chain
  // Playing a comboTrigger skill when combo >= threshold deals Burst damage
  BURST_THRESHOLD: 3,           // 3 consecutive same-type skills = COMBO BURST
  BURST_MULTIPLIER: 2.0,        // burst hit = 2× normal damage
  // Cross-type chaining (different type each card) = "Elemental Chain"
  ELEMENTAL_CHAIN_BONUS: 0.10,  // +10% per unique type in chain this turn
  // Decay: combo resets to 0 if End Turn pressed without spending it
  DECAY_ON_END_TURN: true,
};
```

### Status Effects

```js
BATTLE_DATA.STATUS = {
  burn:        { label:'🔥 Burn',     tickDmg: 0.06, duration: 3, stat: null },   // 6% max-HP / round
  paralyze:    { label:'⚡ Paralyzed', tickDmg: 0,    duration: 2, stat: 'spd', statMod: 0.5 },
  freeze:      { label:'❄️ Frozen',    tickDmg: 0,    duration: 2, chance_thaw: 0.25 },
  confuse:     { label:'😵 Confused',  tickDmg: 0,    duration: 2, self_hit_chance: 0.33 },
  trap:        { label:'🌀 Trapped',   tickDmg: 0.03, duration: 2, cant_switch: true },
  debuff_atk:  { label:'📉 ATK-',      tickDmg: 0,    duration: 3, stat: 'atk', stackable: true, maxStacks: 3, modPerStack: -0.10 },
  debuff_def:  { label:'📉 DEF-',      tickDmg: 0,    duration: 3, stat: 'def', stackable: true, maxStacks: 3, modPerStack: -0.10 },
  shield:      { label:'🛡️ Shield',    tickDmg: 0,    duration: 1, absorbPct: 0.30 },
};
```

---

## Part 4 — `battle-engine.js` (pure game logic, no DOM)

Create `/js/battle-engine.js`. This is a self-contained state machine with no DOM calls.

### State Object

```js
class BattleEngine {
  constructor(playerTeam, opponentTeam) {
    this.state = {
      round:    1,
      phase:    'player_turn', // 'player_turn' | 'opponent_turn' | 'end_round' | 'ended'
      winner:   null,          // null | 'player' | 'opponent'

      player: {
        team:     playerTeam,   // Array<PokemonInstance> length 3
        energy:   2,            // starts at 2 energy
        combo:    0,            // current combo count
        lastType: null,         // last skill type used (for combo chain)
        comboTypes: [],         // unique types used this turn (for elemental chain)
        cardsPlayed: 0,         // cards played this turn
        hand:     [],           // Array<SkillCard> drawn at turn start
      },

      opponent: {
        team:     opponentTeam,
        energy:   2,
        combo:    0,
        lastType: null,
        comboTypes: [],
        cardsPlayed: 0,
        hand:     [],
      },

      log: [],  // Array<BattleLogEntry>
    };
  }

  /* ── Core Methods ───────────────────────────────────────── */

  startRound() { /* regen energy, draw hands, set phase to player_turn */ }

  drawHand(side) {
    // Pull 1 skill from each pokemon on the team (3 cards) +
    // random 3 extras from any team member's skill pool
    // = 6 cards total per hand, shuffle, return
  }

  playCard(side, cardId, targetIndex) {
    // 1. Validate energy, turn ownership
    // 2. Deduct energy
    // 3. Compute raw damage: pokemon.atk × card.dmgMulti
    // 4. Apply type multiplier via BATTLE_DATA.getTypeMultiplier
    // 5. Apply combo bonus (same-type chain)
    // 6. Check BURST_THRESHOLD → trigger burst if met
    // 7. Apply elemental chain bonus (if multiple unique types this turn)
    // 8. Apply target DEF reduction
    // 9. Apply status effects on target
    // 10. Update combo state
    // 11. Update target HP (cannot go below 0)
    // 12. If target HP = 0 → mark as fainted, emit 'pokemon_fainted'
    // 13. Check win condition: all 3 opponent Pokémon fainted → 'ended'
    // 14. Push log entry
    // 15. Return BattleEvent object for UI to animate
  }

  endTurn(side) {
    // decay combo, switch phase
    // if side === 'player' → run opponent AI turn
  }

  runOpponentAI() {
    // Simple greedy AI:
    // 1. Sort hand by (dmgMulti × typeMultiplier vs current front enemy)
    // 2. Play highest-value card while energy > 0
    // 3. Prefer type-effective combos → stack combos
    // 4. Always end turn when energy = 0 or no cards left
    // 5. HARD mode: additionally tries to set up Combo Burst on 3rd card
  }

  checkWin() {
    const allOpponentFainted = this.state.opponent.team.every(p => p.currentHp <= 0);
    const allPlayerFainted   = this.state.player.team.every(p => p.currentHp <= 0);
    if (allOpponentFainted) this.state.winner = 'player';
    if (allPlayerFainted)   this.state.winner = 'opponent';
    return this.state.winner;
  }

  toSnapshot() {
    /* return a deep-cloned version of this.state for UI rendering */
  }
}
```

### `PokemonInstance` factory

```js
function createPokemonInstance(nftData) {
  // nftData comes from PokéChain.getOwnedPokemon() → { species, stage, level, … }
  const meta  = PokéEvolution.getStat;
  const baseHp  = meta(nftData.species, 'hp',  nftData.level);
  const baseAtk = meta(nftData.species, 'atk', nftData.level);
  const baseDef = meta(nftData.species, 'def', nftData.level);
  const baseSpd = meta(nftData.species, 'spd', nftData.level);

  return {
    nftId:     nftData.tokenId,
    species:   nftData.species,
    stage:     nftData.stage,
    level:     nftData.level,
    type:      nftData.type,
    gifSrc:    PokéEvolution.getGifPath(nftData.species),
    maxHp:     baseHp,
    currentHp: baseHp,
    atk:       baseAtk,
    def:       baseDef,
    spd:       baseSpd,
    skills:    BATTLE_DATA.SKILLS[nftData.species] || BATTLE_DATA.SKILLS['Charmander'],
    statMods:  { atk: 1, def: 1, spd: 1 },  // multipliers from buffs/debuffs
    status:    null,       // active status effect name
    statusStacks: 0,
    statusTurnsLeft: 0,
    isFainted: false,
  };
}
```

---

## Part 5 — `battle-ui.js` (DOM rendering and animations)

Create `/js/battle-ui.js`. Subscribes to `BattleEngine` events and redraws the DOM.

### Field Pokemon Card (`.field-pokemon-card`)

Each of the 6 cards on the battlefield:

```html
<div class="field-pokemon-card {player|opponent} {active|fainted}" data-idx="0">
  <div class="fpc-name">Charizard <span class="fpc-level">Lv.45</span></div>
  <div class="fpc-hp-bar">
    <div class="fpc-hp-fill" style="width: 87%"></div>
  </div>
  <div class="fpc-hp-text">348 / 400</div>
  <img class="fpc-gif" src="/assets/thirdForm/Charizard.gif" alt="Charizard" />
  <div class="fpc-status">🔥 Burn</div>
  <div class="fpc-combo-badge hidden">COMBO x3</div>
  <div class="fpc-type-badge fire">fire</div>
</div>
```

Rules:
- The **active** (front-line) Pokémon card is **larger** and displayed in the center of each row.
- Fainted Pokémon show a **greyscale + shatter** CSS animation.
- HP bar color: green > 50%, yellow 25–50%, red < 25%. Transitions with CSS `transition: width 0.4s`.
- Status effect icon pulses with a CSS `@keyframes pulse-status`.

### Skill Card (`.skill-card`)

```html
<div class="skill-card {disabled}" data-card-id="cz_blastburn" draggable="true">
  <div class="sc-cost">3 ⚡</div>
  <div class="sc-icon">☄️</div>
  <div class="sc-name">Blast Burn</div>
  <div class="sc-type fire">fire</div>
  <div class="sc-desc">ULTIMATE — nuclear fire.</div>
  <div class="sc-dmg">4.0× ATK</div>
  <!-- Animated shine sweep on hover (CSS only) -->
</div>
```

Rules:
- Cards that cost more energy than the player has left are `.disabled` (greyed out, pointer-events: none).
- When dragged onto a field Pokémon card (opponent side), `playCard()` fires. Also supports click-to-target.
- Play animation: card "flies" from hand to target (CSS `@keyframes card-fly`).

### Combo HUD

- Fills from left to right as combo stacks.
- At BURST_THRESHOLD: full glow, shake screen, "COMBO BURST!" overlay text in Orbitron font.

### Energy Crystals

10 individual `<div class="energy-crystal {full|empty}">` orbs.
When energy is gained: stagger-fill animation left-to-right.
When energy is spent: remove fill with "drain" animation.

### Battle Animations

| Event | Animation |
|---|---|
| Skill hit (normal) | Target card shakes for 0.3s |
| Type-effective hit | Target card shakes × 2, yellow flash |
| COMBO BURST | Screen-wide orange flash + "COMBO BURST!" banner |
| Pokémon faints | Greyscale fade + explode particle burst (CSS only, no canvas) |
| Status applied | Icon swoops in from off-screen onto target card |
| Victory | Confetti CSS keyframe + fireworks overlay |
| Defeat | Screen darkens, "Defeated..." overlay |

---

## Part 6 — `battle-main.js` (orchestration)

```js
// 1. Auth guard — redirect to / if no Supabase session
// 2. Load player's NFTs from PokéChain.getOwnedPokemon()
// 3. Render team-select screen with NFT collection
// 4. On "Find Opponent" → show matchmaking screen
//    → generate AI opponent team from seeded random using opponent trainer_id hash
//    → transition to battle screen after 2–4s fake matchmaking delay
// 5. Instantiate BattleEngine(playerTeam, opponentTeam)
// 6. Subscribe to engine events → BattleUI updates
// 7. On battle end:
//    a. Save result to Supabase (battles_fought++, battles_won++ if win, total_earned += reward)
//    b. Award POKÉ: win = +50, loss = +10
//    c. Award XP to each participating NFT: win = +200 each, loss = +50 each
//    d. If XP crosses 1000 threshold → auto-trigger evolution check
//    e. Show result screen
```

---

## Part 7 — `battle.css` (full design system)

Create `/css/battle.css`. Design theme: **dark arena** with neon accents.

### Core Variables

```css
:root {
  --bg-arena:       #0a0a1a;
  --bg-field:       #0d1b2a;
  --bg-card:        #12213a;
  --bg-card-hover:  #1a2e50;
  --accent-energy:  #00e5ff;
  --accent-fire:    #ff6b35;
  --accent-water:   #0096ff;
  --accent-grass:   #39d353;
  --accent-electric:#ffe135;
  --accent-ghost:   #9b59b6;
  --accent-dragon:  #d35400;
  --accent-normal:  #95a5a6;
  --accent-combo:   #ff9f00;
  --accent-burst:   #ff3c00;
  --hp-green:       #2ecc71;
  --hp-yellow:      #f39c12;
  --hp-red:         #e74c3c;
  --text-primary:   #e8f4fd;
  --text-secondary: #8098b0;
  --font-game:      'Orbitron', sans-serif;
  --font-body:      'Rajdhani', sans-serif;
  --border-glow:    0 0 12px var(--accent-energy);
  --skill-radius:   12px;
  --card-radius:    16px;
  --transition:     all 0.2s ease;
}
```

### Layout

```
body.battle-body
  → full viewport, background: var(--bg-arena), overflow hidden when in battle
  
#screen-battle
  display: grid
  grid-template-rows: 48px 1fr 60px 140px 80px
  rows: field-header | battle-field | energy-hud | skill-hand | battle-log

.battle-field
  display: flex
  flex-direction: column
  justify-content: space-between
  padding: 12px 0
  background: radial-gradient(ellipse at center, #0d2040 0%, #050810 100%)
  border: 1px solid rgba(0,229,255,0.10)
  border-radius: 24px

.field-row
  display: flex
  justify-content: center
  gap: 16px
  align-items: flex-{end for player|start for opponent}

.field-pokemon-card
  width: 160px → 200px for active
  background: var(--bg-card)
  border-radius: var(--card-radius)
  border: 2px solid transparent
  transition: var(--transition)
  &.active: border-color = type accent color, box-shadow = type glow
  &.fainted: filter: grayscale(1) opacity(0.4)

.skill-hand
  display: flex
  gap: 10px
  justify-content: center
  overflow-x: auto → snap scroll on mobile

.skill-card
  width: 110px, height: 160px
  background: linear-gradient(145deg, var(--bg-card), var(--bg-card-hover))
  border-radius: var(--skill-radius)
  cursor: pointer
  transition: transform 0.15s, box-shadow 0.15s
  &:hover: translateY(-12px), box-shadow = type glow
  &.disabled: opacity 0.4, cursor not-allowed
  /* Inner shine on hover: ::after pseudo with gradient sweep animation */

.energy-crystal
  width: 28px, height: 28px, border-radius: 50%
  background: var(--bg-card)
  border: 2px solid var(--accent-energy)
  transition: background 0.3s
  &.full: background: var(--accent-energy), box-shadow: 0 0 8px var(--accent-energy)
```

### Key Animations

```css
@keyframes card-fly {
  0%   { transform: translate(0,0) scale(1); opacity: 1; }
  50%  { transform: translate(var(--fly-x), var(--fly-y)) scale(0.8); opacity: 0.7; }
  100% { transform: translate(var(--fly-x), var(--fly-y)) scale(0.3); opacity: 0; }
}

@keyframes shake {
  0%,100% { transform: translateX(0); }
  20%      { transform: translateX(-8px); }
  40%      { transform: translateX(8px); }
  60%      { transform: translateX(-5px); }
  80%      { transform: translateX(5px); }
}

@keyframes combo-burst-flash {
  0%   { background: transparent; }
  30%  { background: rgba(255,60,0,0.35); }
  100% { background: transparent; }
}

@keyframes faint-shatter {
  0%   { transform: scale(1); filter: grayscale(0); opacity: 1; }
  40%  { transform: scale(1.1) rotate(3deg); filter: grayscale(0.5); }
  100% { transform: scale(0) rotate(20deg); filter: grayscale(1); opacity: 0; }
}

@keyframes energy-fill {
  0%   { transform: scale(0.3); opacity: 0; }
  70%  { transform: scale(1.3); }
  100% { transform: scale(1); opacity: 1; }
}

@keyframes victory-confetti {
  /* Use 40 pseudo-random CSS particles via :nth-child tricks */
}
```

---

## Part 8 — Supabase Schema Updates

Add/extend `supabase/schema.sql`:

```sql
-- Battle results table
CREATE TABLE IF NOT EXISTS battle_results (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  opponent_id   UUID,                      -- null = AI
  result        TEXT CHECK (result IN ('win','loss','draw')),
  player_team   JSONB,                     -- [{tokenId, species, stage, hpLeft}]
  opponent_team JSONB,
  rounds_played INTEGER DEFAULT 0,
  poke_earned   INTEGER DEFAULT 0,
  xp_earned     INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE trainer_profiles
  ADD COLUMN IF NOT EXISTS battles_fought  INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS battles_won     INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_earned    INTEGER DEFAULT 0;

-- RLS: users can only read/insert their own battle_results
ALTER TABLE battle_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own battles" ON battle_results
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

---

## Part 9 — NFT XP & Evolution Integration

After every battle in `battle-main.js`:

```js
async function applyPostBattleRewards(playerTeam, didWin) {
  const xpGain = didWin ? 200 : 50;
  for (const pokemon of playerTeam) {
    // 1. Update nft_pokemon row XP in Supabase
    const { data } = await _supabase
      .from('nft_pokemon')
      .select('experience, level, species')
      .eq('token_id', pokemon.nftId)
      .single();

    const newXp = (data.experience || 0) + xpGain;
    const newLevel = Math.floor(newXp / 1000) + 1; // 1000 XP per level
    await _supabase.from('nft_pokemon').update({ experience: newXp, level: newLevel })
      .eq('token_id', pokemon.nftId);

    // 2. Check evolution threshold using existing PokéEvolution helpers
    const evo = PokéEvolution.checkEvolution(pokemon.species, newLevel);
    if (evo.canEvolve) {
      await PokéEvolution.performEvolution(userId, pokemon.nftId, pokemon.species, newLevel);
      showEvolutionCutscene(pokemon.species, evo.evolvesTo); // modal overlay
    }
  }
}
```

---

## Part 10 — AI Opponent Team Generation

The AI opponent's team is always deterministically generated so there's no server needed:

```js
function generateAITeam(seed) {
  const rng = seededRandom(seed); // simple LCG seeded by Date.now() for demo
  const speciesList = Object.keys(PokéEvolution.EVOLUTION_CHAINS);
  const chosen = [];
  while (chosen.length < 3) {
    const pick = speciesList[Math.floor(rng() * speciesList.length)];
    if (!chosen.includes(pick)) chosen.push(pick);
  }
  return chosen.map(species => {
    const chain = PokéEvolution.EVOLUTION_CHAINS[species];
    const level = 20 + Math.floor(rng() * 30); // AI levels 20–50
    return createPokemonInstance({ tokenId: -1, species, stage: chain.stage, level, type: getSpeciesType(species) });
  });
}
```

---

## Implementation Order

1. `battle.css` — full stylesheet
2. `battle-data.js` — all skills, type chart, combo/status constants
3. `battle-engine.js` — `BattleEngine` class + `createPokemonInstance`
4. `battle-ui.js` — DOM builder + animation handlers
5. `battle-main.js` — orchestration, auth guard, NFT load, result save
6. `battle.html` — final HTML shell wiring all scripts
7. `dashboard.html` patch — replace battles panel with gateway button
8. `dashboard.js` patch — populate gateway stats
9. `supabase/schema.sql` — new table + column migrations

---

## Quality Checklist

- [ ] Auth guard on `battle.html` — unauthenticated users redirected to `/`
- [ ] NFT collection loads from **both** Supabase `nft_pokemon` table AND on-chain `getOwnedTokens`; Supabase is primary, on-chain is fallback
- [ ] Energy system enforced: no card played if `energyCost > currentEnergy`
- [ ] Combo decay on End Turn
- [ ] Fainted Pokémon cannot be targeted; battle auto-advances to next alive Pokémon
- [ ] AI opponent never plays cards with 0 dmgMulti first (prioritizes damage)
- [ ] All skill GIFs/animations are CSS-only (no canvas, no heavy libraries)
- [ ] Mobile responsive: skill hand wraps to 2 rows on < 480px; field cards shrink to 100px
- [ ] `vercel.json` rewrites include `/battle` → `battle.html` (add route)
- [ ] No console.log leaks in production (all wrapped in `if (DEBUG)` flag)
- [ ] Post-battle rewards saved before result screen shown (no data loss on tab close)

---

## Expected File Tree After Implementation

```
battle.html                     ← new
css/
  battle.css                    ← new
js/
  battle-data.js                ← new
  battle-engine.js              ← new
  battle-ui.js                  ← new
  battle-main.js                ← new
  dashboard.js                  ← patched (gateway stats)
dashboard.html                  ← patched (battles panel → gateway)
supabase/
  schema.sql                    ← patched (battle_results table)
vercel.json                     ← patched (add /battle route)
```

---

*This prompt is self-contained. Feed it to an AI coding agent or a developer to produce the entire
PokeWorld battle system from scratch. All constants, schema, architecture decisions, and design
tokens are defined above — no guessing required.*
