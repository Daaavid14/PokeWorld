/**
 * battle-data.js — PokéWorld Battle Game Constants
 *
 * Single source of truth for:
 *  - Energy system configuration
 *  - All 60 Pokémon skill definitions (20 chains × 3 stages × 4 skills)
 *  - Full 18-type effectiveness chart
 *  - Combo & Elemental Chain system rules
 *  - Status effect definitions
 *  - Species type mapping
 */

'use strict';

/* ============================================================
   ENERGY SYSTEM
   ============================================================ */
window.BATTLE_DATA = {};

BATTLE_DATA.ENERGY = {
  MAX:              10,  // max energy (Axie Infinity Classic v1: capped at 10)
  REGEN_PER_ROUND:  2,   // +2 per round (Axie standard)
  START_ENERGY:     3,   // energy both sides begin the first round with
  // No team-wide card cap — in Axie v1 you can play as many cards as
  // your energy allows.  A single Axie can play all 4 unique skills
  // (or even duplicates saved across rounds) in one turn.
};

/* ============================================================
   CARD DRAW SYSTEM  (Axie Infinity Classic v1)
   Deck = 2 copies of each skill per Axie → 8 cards/Axie → 24 total.
   Start: draw 6.  Each round: draw 3 more into hand (shared pool).
   Played cards → discard pile. Deck empty → reshuffle discards.
   Hand limit prevents hoarding.
   ============================================================ */
BATTLE_DATA.CARDS = {
  COPIES_PER_SKILL: 2,   // 2 copies of each skill per Axie (Axie v1 standard)
  INITIAL_DRAW:     6,   // cards drawn at battle start
  DRAW_PER_ROUND:   3,   // cards drawn each subsequent round
  HAND_LIMIT:      10,   // max cards in hand at any time
};

/* ============================================================
   COMBO SYSTEM
   ============================================================ */
BATTLE_DATA.COMBO = {
  // Axie-style: combo = multiple cards from the SAME Pokémon in one round
  // Each extra card beyond the first adds (caster.skill / SKILL_DIVISOR) bonus damage
  SKILL_DIVISOR:     10,   // bonus dmg per combo stack = caster.skill / 10
  BURST_THRESHOLD:    3,   // 3+ cards from same Pokémon → COMBO BURST
  BURST_MULTIPLIER: 1.5,   // burst bonus multiplier
  DECAY_ON_END_TURN: true,  // combo resets each round
};

/* ============================================================
   STATUS EFFECTS
   ============================================================ */
BATTLE_DATA.STATUS = {
  burn: {
    label: '🔥 Burn', icon: '🔥',
    tickDmg: 0.06,   // 6% max-HP per round
    duration: 3,
    stat: null,
  },
  paralyze: {
    label: '⚡ Paralyzed', icon: '⚡',
    tickDmg: 0,
    duration: 2,
    stat: 'spd', statMod: 0.5, // halves speed (unused in turn-based but affects ai priority)
  },
  freeze: {
    label: '❄️ Frozen', icon: '❄️',
    tickDmg: 0,
    duration: 2,
    chanceThaw: 0.25, // 25% chance each round to thaw early
    skipTurn: true,
  },
  confuse: {
    label: '😵 Confused', icon: '😵',
    tickDmg: 0,
    duration: 2,
    selfHitChance: 0.33, // 33% chance each action targets self
  },
  trap: {
    label: '🌀 Trapped', icon: '🌀',
    tickDmg: 0.03,   // 3% max-HP per round
    duration: 2,
    cantSwitch: true,
  },
  debuff_atk: {
    label: '📉 ATK -', icon: '📉',
    tickDmg: 0,
    duration: 3,
    stat: 'atk', stackable: true, maxStacks: 3, modPerStack: -0.10,
  },
  debuff_def: {
    label: '🛡️ DEF -', icon: '🛡️',
    tickDmg: 0,
    duration: 3,
    stat: 'def', stackable: true, maxStacks: 3, modPerStack: -0.10,
  },
  shield: {
    label: '🛡️ Shield', icon: '🛡️',
    tickDmg: 0,
    duration: 1,
    absorbPct: 0.30, // absorbs 30% of next incoming damage
  },
  stun: {
    label: '💫 Stunned', icon: '💫',
    tickDmg: 0,
    duration: 1,
    skipTurn: true,
  },
};

/* ============================================================
   MORALE & CRIT SYSTEM  (Axie Infinity)
   crit chance ≈ morale / 500,  crits deal 1.5× damage
   ============================================================ */
BATTLE_DATA.MORALE = {
  CRIT_DIVISOR:    500,  // crit chance = morale / 500 (e.g. morale 50 → 10%)
  CRIT_MULTIPLIER: 1.5,  // crits deal 1.5× damage
};

/* ============================================================
   LAST STAND  (Axie Infinity)
   When a Pokémon would faint, Morale converts to Last Stand
   ticks. It survives at 1 HP for ceil(morale / 100) rounds.
   ============================================================ */
BATTLE_DATA.LAST_STAND = {
  MORALE_DIVISOR: 100,   // last stand ticks = ceil(morale / DIVISOR)
  MIN_TICKS:        1,   // minimum 1 tick
  HP_DURING:        1,   // HP held at 1 during last stand
};

/* ============================================================
   TYPE EFFECTIVENESS CHART  (Gen 7 standard)
   BATTLE_DATA.getTypeMultiplier(atkType, defType) → number
   ============================================================ */
BATTLE_DATA.TYPE_CHART = {
  normal:   { rock:0.5, ghost:0, steel:0.5 },
  fire:     { fire:0.5, water:0.5, grass:2, ice:2, bug:2, rock:0.5, dragon:0.5, steel:2 },
  water:    { fire:2, water:0.5, grass:0.5, ground:2, rock:2, dragon:0.5 },
  grass:    { fire:0.5, water:2, grass:0.5, poison:0.5, ground:2, flying:0.5, bug:0.5, rock:2, dragon:0.5, steel:0.5 },
  electric: { water:2, electric:0.5, grass:0.5, ground:0, flying:2, dragon:0.5 },
  ice:      { fire:0.5, water:0.5, grass:2, ice:0.5, ground:2, flying:2, dragon:2, steel:0.5 },
  fighting: { normal:2, ice:2, poison:0.5, rock:2, dark:2, bug:0.5, psychic:0.5, flying:0.5, ghost:0, fairy:0.5, steel:2 },
  poison:   { grass:2, poison:0.5, ground:0.5, rock:0.5, ghost:0.5, steel:0, fairy:2 },
  ground:   { fire:2, electric:2, grass:0.5, poison:2, rock:2, bug:0.5, steel:2, flying:0 },
  flying:   { electric:0.5, grass:2, fighting:2, bug:2, rock:0.5, steel:0.5 },
  psychic:  { fighting:2, poison:2, psychic:0.5, dark:0, steel:0.5 },
  bug:      { fire:0.5, grass:2, fighting:0.5, flying:0.5, ghost:0.5, steel:0.5, psychic:2, dark:2, fairy:0.5 },
  rock:     { fire:2, ice:2, fighting:0.5, ground:0.5, flying:2, bug:2, steel:0.5 },
  ghost:    { normal:0, psychic:2, ghost:2, dark:0.5 },
  dragon:   { dragon:2, steel:0.5, fairy:0 },
  dark:     { fighting:0.5, psychic:2, ghost:2, dark:0.5, fairy:0.5 },
  steel:    { fire:0.5, water:0.5, electric:0.5, ice:2, rock:2, steel:0.5, fairy:2 },
  fairy:    { fire:0.5, fighting:2, poison:0.5, dragon:2, dark:2, steel:0.5 },
};

BATTLE_DATA.getTypeMultiplier = function (atkType, defType) {
  if (!atkType || !defType) return 1;
  const row = BATTLE_DATA.TYPE_CHART[atkType.toLowerCase()];
  if (!row) return 1;
  const val = row[defType.toLowerCase()];
  if (val === undefined) return 1;
  // Axie Infinity style: +15% for advantage, -15% for disadvantage
  if (val >= 2) return 1.15;    // super effective → +15%
  if (val > 1)  return 1.15;    // effective → +15%
  if (val === 0) return 0.85;   // immunity → treated as -15% (Axie has no immunities)
  if (val < 1)  return 0.85;    // not very effective → -15%
  return 1;
};

/* ============================================================
   SPECIES TYPE MAP
   ============================================================ */
BATTLE_DATA.SPECIES_TYPE = {
  // Grass line
  Bulbasaur:'grass',  Ivysaur:'grass',    Venasaur:'grass',
  // Fire line
  Charmander:'fire',  Charmeleon:'fire',   Charizard:'fire',
  // Water line
  Squirtle:'water',   Wartortle:'water',   Blastoise:'water',
  // Bug line 1
  Caterpie:'bug',     Metapod:'bug',       Butterfree:'bug',
  // Fire line 2
  Cyndaquil:'fire',   Quilava:'fire',      Typhlosion:'fire',
  // Dragon line
  Dratini:'dragon',   Dragonair:'dragon',  Dragonite:'dragon',
  // Fire line 3
  Eevee:'normal',     Flareon:'fire',      Jolteon:'electric',
  // Electric line
  Elekid:'electric',  Electabuzz:'electric', Electivire:'electric',
  // Ghost line
  Ghastly:'ghost',    Haunter:'ghost',     Gengar:'ghost',
  // Water line 2
  Horsea:'water',     Seadra:'water',      Kingdra:'water',
  // Rock line
  Larvitar:'rock',    Pupitar:'rock',      Tyranitar:'rock',
  // Fighting line
  Machop:'fighting',  Machoke:'fighting',  Machamp:'fighting',
  // Fire line 4
  Magby:'fire',       Magmar:'fire',       Magmortar:'fire',
  // Electric line 2
  Pichu:'electric',   Pikachu:'electric',  Raichu:'electric',
  // Normal/Flying line
  Pidgey:'flying',    Pidgeotto:'flying',  Pidgeot:'flying',
  // Water line 3
  Squirtle:'water',   Wartortle:'water',   Blastoise:'water',
  // Ice line
  Swinub:'ice',       Piloswine:'ice',     Mamoswine:'ice',
  // Fire line 5
  Torchic:'fire',     Combusken:'fire',    Blaziken:'fire',
  // Water line 4
  Totodile:'water',   Croconaw:'water',    Feraligatr:'water',
  // Bug line 2
  Weedle:'bug',       Kakuna:'bug',        Beedrill:'bug',
  // Normal line
  Whismur:'normal',   Loudred:'normal',    Exploud:'normal',
};

/* ============================================================
   SKILL DEFINITIONS
   All 20 Pokémon chains × 3 stages × 4 skills = 240 total
   Schema: { id, name, type, energyCost, dmgMulti, effect,
             effectChance, stackable, comboTrigger, icon, description }
   ============================================================ */
BATTLE_DATA.SKILLS = {

  /* ── Chain 01: Bulbasaur line ──── GRASS ─────────────── */
  Bulbasaur: [
    { id:'bul_tackle',    name:'Tackle',        type:'normal',  energyCost:1, dmgMulti:1.0, effect:null,         effectChance:0,   stackable:false, comboTrigger:false, icon:'🌿', description:'A physical charge dealing 100% ATK.' },
    { id:'bul_vinewhip',  name:'Vine Whip',     type:'grass',   energyCost:1, dmgMulti:1.2, effect:null,         effectChance:0,   stackable:false, comboTrigger:true,  icon:'🌱', description:'Strikes with vines. Triggers combo.' },
    { id:'bul_poisonpdr', name:'Poison Powder', type:'poison',  energyCost:1, dmgMulti:0,   effect:'burn',       effectChance:80,  stackable:true,  comboTrigger:false, icon:'🔮', description:'Coats foe in toxic spores. Stackable debuff.' },
    { id:'bul_razorleaf', name:'Razor Leaf',    type:'grass',   energyCost:2, dmgMulti:1.8, effect:'debuff_def', effectChance:30,  stackable:false, comboTrigger:true,  icon:'🍃', description:'Sharp leaves shred enemy DEF.' },
  ],
  Ivysaur: [
    { id:'ivy_vinewhip',  name:'Vine Whip',     type:'grass',   energyCost:1, dmgMulti:1.4, effect:null,         effectChance:0,   stackable:false, comboTrigger:true,  icon:'🌿', description:'Stronger vines.' },
    { id:'ivy_sleeppdr',  name:'Sleep Powder',  type:'grass',   energyCost:1, dmgMulti:0,   effect:'confuse',    effectChance:70,  stackable:false, comboTrigger:false, icon:'💤', description:'Puts foe in confused state.' },
    { id:'ivy_razorleaf', name:'Razor Leaf',    type:'grass',   energyCost:2, dmgMulti:1.8, effect:null,         effectChance:0,   stackable:true,  comboTrigger:true,  icon:'🍃', description:'Stackable: 2nd use = +30% dmg.' },
    { id:'ivy_solarbeam', name:'Solar Beam',    type:'grass',   energyCost:3, dmgMulti:3.0, effect:'debuff_def', effectChance:50,  stackable:false, comboTrigger:true,  icon:'☀️', description:'ULTIMATE — full solar blast fires instantly.' },
  ],
  Venasaur: [
    { id:'ven_solarbeam',  name:'Solar Beam',      type:'grass',   energyCost:2, dmgMulti:2.8, effect:null,         effectChance:0,   stackable:true,  comboTrigger:true,  icon:'☀️', description:'Stackable: consecutive beams hit harder.' },
    { id:'ven_petaldance', name:'Petal Dance',     type:'grass',   energyCost:2, dmgMulti:2.4, effect:'confuse',    effectChance:30,  stackable:false, comboTrigger:true,  icon:'🌺', description:'Spinning petals. May confuse on combo.' },
    { id:'ven_venoshock',  name:'Venoshock',       type:'poison',  energyCost:2, dmgMulti:2.2, effect:'burn',       effectChance:40,  stackable:false, comboTrigger:false, icon:'☠️', description:'Double damage if foe is already poisoned.' },
    { id:'ven_pinnmissle', name:'Petal Blizzard',  type:'grass',   energyCost:3, dmgMulti:4.0, effect:'debuff_def', effectChance:60,  stackable:false, comboTrigger:true,  icon:'🌸', description:'ULTIMATE — tornado of petals devastates foe.' },
  ],

  /* ── Chain 02: Caterpie line ──── BUG ─────────────────── */
  Caterpie: [
    { id:'cat_tackle',    name:'Tackle',        type:'normal',  energyCost:1, dmgMulti:0.9, effect:null,         effectChance:0,   stackable:false, comboTrigger:false, icon:'🐛', description:'Basic body charge.' },
    { id:'cat_strshot',   name:'String Shot',   type:'bug',     energyCost:1, dmgMulti:0,   effect:'debuff_atk', effectChance:100, stackable:true,  comboTrigger:false, icon:'🕸️', description:'Slows enemy with silk. Stackable 3×.' },
    { id:'cat_bugbite',   name:'Bug Bite',      type:'bug',     energyCost:1, dmgMulti:1.1, effect:null,         effectChance:0,   stackable:false, comboTrigger:true,  icon:'🐛', description:'Nibbles on foe. Triggers combo chain.' },
    { id:'cat_electnet',  name:'Electroweb',    type:'electric',energyCost:2, dmgMulti:1.4, effect:'paralyze',   effectChance:50,  stackable:false, comboTrigger:true,  icon:'🕸️', description:'Electrified web slows and shocks.' },
  ],
  Metapod: [
    { id:'met_harden',    name:'Harden',        type:'normal',  energyCost:1, dmgMulti:0,   effect:'shield',     effectChance:100, stackable:false, comboTrigger:false, icon:'🛡️', description:'Boosts own DEF with a protective shell.' },
    { id:'met_irondef',   name:'Iron Defense',  type:'steel',   energyCost:1, dmgMulti:0,   effect:'debuff_def', effectChance:0,   stackable:true,  comboTrigger:false, icon:'⚙️', description:'Stacks own shield layers.' },
    { id:'met_tackle',    name:'Tackle',        type:'normal',  energyCost:1, dmgMulti:1.0, effect:null,         effectChance:0,   stackable:false, comboTrigger:false, icon:'🔵', description:'Standard tackle.' },
    { id:'met_bugbite',   name:'Bug Bite',      type:'bug',     energyCost:2, dmgMulti:1.6, effect:null,         effectChance:0,   stackable:false, comboTrigger:true,  icon:'🐛', description:'Breaking free for a powerful bite.' },
  ],
  Butterfree: [
    { id:'bfr_psychic',   name:'Psych Up',      type:'psychic', energyCost:1, dmgMulti:1.2, effect:'confuse',    effectChance:30,  stackable:false, comboTrigger:true,  icon:'🔮', description:'Psychic dust confuses foe.' },
    { id:'bfr_airslash',  name:'Air Slash',     type:'flying',  energyCost:2, dmgMulti:2.0, effect:'paralyze',   effectChance:25,  stackable:false, comboTrigger:true,  icon:'💨', description:'Razor-sharp wings cut through air. Backdoor — flies past the front.', targeting:'backdoor' },
    { id:'bfr_sleeppdr',  name:'Sleep Powder',  type:'grass',   energyCost:1, dmgMulti:0,   effect:'freeze',     effectChance:70,  stackable:false, comboTrigger:false, icon:'💤', description:'Sleeping spores put foe to sleep.' },
    { id:'bfr_bugbuzz',   name:'Bug Buzz',      type:'bug',     energyCost:3, dmgMulti:3.5, effect:'debuff_def', effectChance:50,  stackable:false, comboTrigger:true,  icon:'🎵', description:'ULTIMATE — resonant buzz shreds armor.' },
  ],

  /* ── Chain 03: Charmander line ──── FIRE ─────────────── */
  Charmander: [
    { id:'ch_scratch',   name:'Scratch',       type:'normal',  energyCost:1, dmgMulti:1.0, effect:null,         effectChance:0,   stackable:false, comboTrigger:false, icon:'🔥', description:'Basic fire scratch.' },
    { id:'ch_ember',     name:'Ember',         type:'fire',    energyCost:1, dmgMulti:1.2, effect:'burn',       effectChance:20,  stackable:false, comboTrigger:true,  icon:'🔥', description:'Small flame burst. 20% burn.' },
    { id:'ch_growl',     name:'Growl',         type:'normal',  energyCost:1, dmgMulti:0,   effect:'debuff_atk', effectChance:100, stackable:true,  comboTrigger:false, icon:'📢', description:'Lowers enemy ATK. Stackable 3×.' },
    { id:'ch_firespin',  name:'Fire Spin',     type:'fire',    energyCost:2, dmgMulti:1.8, effect:'trap',       effectChance:100, stackable:false, comboTrigger:true,  icon:'🌀', description:'Traps enemy for 2 turns. Combo = +50% dmg.' },
  ],
  Charmeleon: [
    { id:'cm_slash',     name:'Slash',         type:'normal',  energyCost:1, dmgMulti:1.4, effect:null,         effectChance:0,   stackable:false, comboTrigger:false, icon:'⚔️', description:'Powerful slashing attack.' },
    { id:'cm_flamethrow',name:'Flamethrower',  type:'fire',    energyCost:2, dmgMulti:2.0, effect:'burn',       effectChance:30,  stackable:true,  comboTrigger:true,  icon:'🔥', description:'Stackable: 2nd cast = +40% bonus.' },
    { id:'cm_dragonclaw',name:'Dragon Claw',   type:'dragon',  energyCost:2, dmgMulti:1.6, effect:null,         effectChance:0,   stackable:false, comboTrigger:true,  icon:'🐉', description:'Razor-sharp draconic strike.' },
    { id:'cm_inferno',   name:'Inferno',       type:'fire',    energyCost:3, dmgMulti:3.2, effect:'burn',       effectChance:80,  stackable:false, comboTrigger:true,  icon:'☄️', description:'ULTIMATE — raging inferno. Combo = stun.' },
  ],
  Charizard: [
    { id:'cz_fireblast',  name:'Fire Blast',   type:'fire',    energyCost:2, dmgMulti:2.5, effect:'burn',       effectChance:40,  stackable:true,  comboTrigger:true,  icon:'💥', description:'Massive fire column. Stackable.' },
    { id:'cz_dragonrage', name:'Dragon Rage',  type:'dragon',  energyCost:2, dmgMulti:2.2, effect:null,         effectChance:0,   stackable:false, comboTrigger:true,  icon:'🐉', description:'Draconic fury is unstoppable. Backdoor — targets the back.', targeting:'backdoor' },
    { id:'cz_earthquake', name:'Earthquake',   type:'ground',  energyCost:3, dmgMulti:2.8, effect:'debuff_def', effectChance:60,  stackable:true,  comboTrigger:false, icon:'🌋', description:'Grounds shake foe to the core.' },
    { id:'cz_blastburn',  name:'Blast Burn',   type:'fire',    energyCost:3, dmgMulti:4.0, effect:'burn',       effectChance:100, stackable:false, comboTrigger:true,  icon:'☄️', description:'ULTIMATE — nuclear fire. Combo = AOE shockwave.' },
  ],

  /* ── Chain 04: Cyndaquil line ──── FIRE ──────────────── */
  Cyndaquil: [
    { id:'cyn_tackle',    name:'Tackle',        type:'normal',  energyCost:1, dmgMulti:0.9, effect:null,         effectChance:0,   stackable:false, comboTrigger:false, icon:'🔥', description:'Basic tackle.' },
    { id:'cyn_ember',     name:'Ember',         type:'fire',    energyCost:1, dmgMulti:1.1, effect:'burn',       effectChance:15,  stackable:false, comboTrigger:true,  icon:'🔥', description:'Weak flame. 15% burn.' },
    { id:'cyn_smokescreen',name:'Smokescreen',  type:'normal',  energyCost:1, dmgMulti:0,   effect:'debuff_atk', effectChance:100, stackable:true,  comboTrigger:false, icon:'💨', description:'Blinds enemy, lowering accuracy.' },
    { id:'cyn_flamewheel',name:'Flame Wheel',   type:'fire',    energyCost:2, dmgMulti:1.7, effect:'burn',       effectChance:25,  stackable:false, comboTrigger:true,  icon:'🌀', description:'Rolling fire wheel scorches on contact.' },
  ],
  Quilava: [
    { id:'qui_flamethrow',name:'Flamethrower',  type:'fire',    energyCost:2, dmgMulti:1.9, effect:'burn',       effectChance:30,  stackable:true,  comboTrigger:true,  icon:'🔥', description:'Steady flame stream.' },
    { id:'qui_quickattk', name:'Quick Attack',  type:'normal',  energyCost:1, dmgMulti:1.2, effect:null,         effectChance:0,   stackable:false, comboTrigger:false, icon:'💨', description:'Swift strike always goes first.' },
    { id:'qui_smokescreen',name:'Swift',        type:'normal',  energyCost:1, dmgMulti:1.3, effect:null,         effectChance:0,   stackable:false, comboTrigger:true,  icon:'⭐', description:'Stars never miss. Always hits.' },
    { id:'qui_eruption',  name:'Eruption',      type:'fire',    energyCost:3, dmgMulti:3.0, effect:'burn',       effectChance:60,  stackable:false, comboTrigger:true,  icon:'🌋', description:'ULTIMATE — volcanic eruption blast.' },
  ],
  Typhlosion: [
    { id:'typ_eruption',  name:'Eruption',      type:'fire',    energyCost:2, dmgMulti:3.0, effect:'burn',       effectChance:70,  stackable:true,  comboTrigger:true,  icon:'🌋', description:'Stackable eruptions intensify.' },
    { id:'typ_fblast',    name:'Fire Blast',    type:'fire',    energyCost:2, dmgMulti:2.6, effect:'burn',       effectChance:45,  stackable:false, comboTrigger:true,  icon:'💥', description:'Giant flame cross.' },
    { id:'typ_thunder_p', name:'Thunder Punch', type:'electric',energyCost:2, dmgMulti:2.0, effect:'paralyze',   effectChance:30,  stackable:false, comboTrigger:true,  icon:'⚡', description:'Shocking cross-elemental punch. Backdoor — targets the back.', targeting:'backdoor' },
    { id:'typ_blastburn', name:'Blast Burn',    type:'fire',    energyCost:3, dmgMulti:4.2, effect:'burn',       effectChance:100, stackable:false, comboTrigger:true,  icon:'☄️', description:'ULTIMATE — Johto fire deity ultimate.' },
  ],

  /* ── Chain 05: Dratini line ──── DRAGON ──────────────── */
  Dratini: [
    { id:'dra_wrap',      name:'Wrap',          type:'normal',  energyCost:1, dmgMulti:0.8, effect:'trap',       effectChance:100, stackable:false, comboTrigger:false, icon:'🐍', description:'Constricts foe for 2 turns.' },
    { id:'dra_twister',   name:'Twister',       type:'dragon',  energyCost:1, dmgMulti:1.1, effect:'confuse',    effectChance:20,  stackable:false, comboTrigger:true,  icon:'🌪️', description:'Dragon tornado. May confuse.' },
    { id:'dra_dragermge', name:'Dragon Rage',   type:'dragon',  energyCost:2, dmgMulti:1.5, effect:null,         effectChance:0,   stackable:false, comboTrigger:true,  icon:'🐉', description:'Raw draconic force.' },
    { id:'dra_agility',   name:'Agility',       type:'psychic', energyCost:1, dmgMulti:0,   effect:'shield',     effectChance:100, stackable:false, comboTrigger:false, icon:'💨', description:'Gains a defensive shield this round.' },
  ],
  Dragonair: [
    { id:'dai_tbolt',     name:'Thunderbolt',   type:'electric',energyCost:2, dmgMulti:1.8, effect:'paralyze',   effectChance:30,  stackable:false, comboTrigger:true,  icon:'⚡', description:'Electric bolt from the neck pearl.' },
    { id:'dai_icebeam',   name:'Ice Beam',      type:'ice',     energyCost:2, dmgMulti:1.8, effect:'freeze',     effectChance:20,  stackable:false, comboTrigger:true,  icon:'❄️', description:'Freezing beam. 20% freeze chance.' },
    { id:'dai_dragonrge', name:'Dragon Rage',   type:'dragon',  energyCost:1, dmgMulti:1.6, effect:null,         effectChance:0,   stackable:true,  comboTrigger:true,  icon:'🐉', description:'Stackable dragon outburst.' },
    { id:'dai_outrage',   name:'Outrage',       type:'dragon',  energyCost:3, dmgMulti:3.2, effect:'confuse',    effectChance:50,  stackable:false, comboTrigger:true,  icon:'🔥', description:'ULTIMATE — berserker dragon rage.' },
  ],
  Dragonite: [
    { id:'dnt_hurricane', name:'Hurricane',     type:'flying',  energyCost:2, dmgMulti:2.4, effect:'confuse',    effectChance:30,  stackable:false, comboTrigger:true,  icon:'🌪️', description:'Category 5 wing storm.' },
    { id:'dnt_tbolt',     name:'Thunderbolt',   type:'electric',energyCost:2, dmgMulti:2.2, effect:'paralyze',   effectChance:30,  stackable:true,  comboTrigger:true,  icon:'⚡', description:'Stackable electric surge.' },
    { id:'dnt_extremspd', name:'Extreme Speed', type:'normal',  energyCost:1, dmgMulti:1.8, effect:null,         effectChance:0,   stackable:false, comboTrigger:false, icon:'💨', description:'Fastest normal move. Backdoor — blitzes past the front.', targeting:'backdoor' },
    { id:'dnt_dragonrush',name:'Dragon Rush',   type:'dragon',  energyCost:3, dmgMulti:4.2, effect:'paralyze',   effectChance:60,  stackable:false, comboTrigger:true,  icon:'🐉', description:'ULTIMATE — flying dragon charge obliterates.' },
  ],

  /* ── Chain 06: Eevee line ──── NORMAL / FIRE / ELECTRIC ─ */
  Eevee: [
    { id:'eev_tackle',    name:'Tackle',        type:'normal',  energyCost:1, dmgMulti:1.0, effect:null,         effectChance:0,   stackable:false, comboTrigger:false, icon:'🦊', description:'Normal tackle.' },
    { id:'eev_growl',     name:'Growl',         type:'normal',  energyCost:1, dmgMulti:0,   effect:'debuff_atk', effectChance:100, stackable:true,  comboTrigger:false, icon:'📢', description:'ATK debuff.' },
    { id:'eev_quickattk', name:'Quick Attack',  type:'normal',  energyCost:1, dmgMulti:1.2, effect:null,         effectChance:0,   stackable:false, comboTrigger:true,  icon:'💨', description:'Swift strike.' },
    { id:'eev_last_rsor', name:'Last Resort',   type:'normal',  energyCost:2, dmgMulti:2.0, effect:null,         effectChance:0,   stackable:false, comboTrigger:true,  icon:'⭐', description:'Desperate final move — high power.' },
  ],
  Flareon: [
    { id:'fla_ember',     name:'Ember',         type:'fire',    energyCost:1, dmgMulti:1.3, effect:'burn',       effectChance:20,  stackable:false, comboTrigger:true,  icon:'🔥', description:'Flame flare.' },
    { id:'fla_flrfang',   name:'Fire Fang',     type:'fire',    energyCost:1, dmgMulti:1.5, effect:'burn',       effectChance:30,  stackable:true,  comboTrigger:true,  icon:'🦷', description:'Burning fangs. Stackable.' },
    { id:'fla_flamethrow',name:'Flamethrower',  type:'fire',    energyCost:2, dmgMulti:2.2, effect:'burn',       effectChance:35,  stackable:false, comboTrigger:true,  icon:'🔥', description:'Sustained flame stream.' },
    { id:'fla_overheat',  name:'Overheat',      type:'fire',    energyCost:3, dmgMulti:3.8, effect:'burn',       effectChance:90,  stackable:false, comboTrigger:true,  icon:'☄️', description:'ULTIMATE — heat explosion.' },
  ],
  Jolteon: [
    { id:'jol_tbolt',     name:'Thunderbolt',   type:'electric',energyCost:2, dmgMulti:2.0, effect:'paralyze',   effectChance:25,  stackable:true,  comboTrigger:true,  icon:'⚡', description:'Stackable lightning bolt.' },
    { id:'jol_pinmissle', name:'Pin Missile',   type:'bug',     energyCost:1, dmgMulti:1.4, effect:null,         effectChance:0,   stackable:false, comboTrigger:false, icon:'📌', description:'Multi-spike barrage. Backdoor — needles reach the back.', targeting:'backdoor' },
    { id:'jol_thunder',   name:'Thunder',       type:'electric',energyCost:2, dmgMulti:2.4, effect:'paralyze',   effectChance:30,  stackable:false, comboTrigger:true,  icon:'🌩️', description:'Supreme thunderstrike.' },
    { id:'jol_discharge', name:'Discharge',     type:'electric',energyCost:3, dmgMulti:3.6, effect:'paralyze',   effectChance:50,  stackable:false, comboTrigger:true,  icon:'⚡', description:'ULTIMATE — AoE electric discharge.' },
  ],

  /* ── Chain 07: Elekid line ──── ELECTRIC ─────────────── */
  Elekid: [
    { id:'elk_thundershk', name:'ThunderShock',  type:'electric',energyCost:1, dmgMulti:1.0, effect:'paralyze',   effectChance:15,  stackable:false, comboTrigger:true,  icon:'⚡', description:'Mild electric shock.' },
    { id:'elk_lowkick',    name:'Low Kick',      type:'fighting',energyCost:1, dmgMulti:1.1, effect:null,         effectChance:0,   stackable:false, comboTrigger:false, icon:'🦵', description:'Trips heavier foes.' },
    { id:'elk_quickattk',  name:'Quick Attack',  type:'normal',  energyCost:1, dmgMulti:1.0, effect:null,         effectChance:0,   stackable:false, comboTrigger:false, icon:'💨', description:'Always strikes first.' },
    { id:'elk_tbolt',      name:'Thunderbolt',   type:'electric',energyCost:2, dmgMulti:1.6, effect:'paralyze',   effectChance:25,  stackable:false, comboTrigger:true,  icon:'⚡', description:'Powerful lightning bolt.' },
  ],
  Electabuzz: [
    { id:'eba_tbolt',      name:'Thunderbolt',   type:'electric',energyCost:2, dmgMulti:2.0, effect:'paralyze',   effectChance:30,  stackable:true,  comboTrigger:true,  icon:'⚡', description:'Stackable high-voltage.' },
    { id:'eba_firepunch',  name:'Fire Punch',    type:'fire',    energyCost:1, dmgMulti:1.5, effect:'burn',       effectChance:25,  stackable:false, comboTrigger:true,  icon:'🥊', description:'Electro-fire combo punch.' },
    { id:'eba_icepunch',   name:'Ice Punch',     type:'ice',     energyCost:1, dmgMulti:1.5, effect:'freeze',     effectChance:10,  stackable:false, comboTrigger:true,  icon:'🥊', description:'Cryogenic power punch.' },
    { id:'eba_thunder',    name:'Thunder',       type:'electric',energyCost:3, dmgMulti:3.2, effect:'paralyze',   effectChance:40,  stackable:false, comboTrigger:true,  icon:'🌩️', description:'ULTIMATE — Thor-level lightning.' },
  ],
  Electivire: [
    { id:'evi_thunder',    name:'Thunder',       type:'electric',energyCost:2, dmgMulti:2.8, effect:'paralyze',   effectChance:40,  stackable:true,  comboTrigger:true,  icon:'🌩️', description:'Stackable divine thunder.' },
    { id:'evi_firepunch',  name:'Fire Punch',    type:'fire',    energyCost:2, dmgMulti:2.2, effect:'burn',       effectChance:30,  stackable:false, comboTrigger:true,  icon:'🥊', description:'Blazing power.' },
    { id:'evi_earthquake', name:'Earthquake',    type:'ground',  energyCost:3, dmgMulti:2.8, effect:'debuff_def', effectChance:40,  stackable:false, comboTrigger:false, icon:'🌋', description:'Ground-shattering attack.' },
    { id:'evi_wildcharge', name:'Wild Charge',   type:'electric',energyCost:3, dmgMulti:4.0, effect:'paralyze',   effectChance:60,  stackable:false, comboTrigger:true,  icon:'⚡', description:'ULTIMATE — suicidal electric charge.' },
  ],

  /* ── Chain 08: Ghastly line ──── GHOST ───────────────── */
  Ghastly: [
    { id:'gha_lick',      name:'Lick',          type:'ghost',   energyCost:1, dmgMulti:0.9, effect:'paralyze',   effectChance:30,  stackable:false, comboTrigger:false, icon:'👻', description:'Ghostly tongue causes paralysis.' },
    { id:'gha_nightshade',name:'Night Shade',   type:'ghost',   energyCost:1, dmgMulti:1.2, effect:null,         effectChance:0,   stackable:false, comboTrigger:true,  icon:'🌑', description:'Deals damage equal to level.' },
    { id:'gha_cursed',    name:'Curse',         type:'ghost',   energyCost:1, dmgMulti:0,   effect:'burn',       effectChance:100, stackable:true,  comboTrigger:false, icon:'👁️', description:'Haunting curse stacks on foe.' },
    { id:'gha_hypnosis',  name:'Hypnosis',      type:'psychic', energyCost:2, dmgMulti:0,   effect:'confuse',    effectChance:85,  stackable:false, comboTrigger:false, icon:'🌀', description:'Deep hypnosis confuses foe.' },
  ],
  Haunter: [
    { id:'hnt_shadowball', name:'Shadow Ball',   type:'ghost',   energyCost:2, dmgMulti:1.8, effect:'debuff_def', effectChance:20,  stackable:false, comboTrigger:true,  icon:'🌑', description:'Dark energy orb.' },
    { id:'hnt_hex',        name:'Hex',           type:'ghost',   energyCost:1, dmgMulti:1.4, effect:null,         effectChance:0,   stackable:true,  comboTrigger:true,  icon:'✡️', description:'Double damage vs afflicted foe.' },
    { id:'hnt_dreameat',   name:'Dream Eater',   type:'psychic', energyCost:2, dmgMulti:1.6, effect:'confuse',    effectChance:40,  stackable:false, comboTrigger:false, icon:'💤', description:'Drains dreaming foe.' },
    { id:'hnt_nightmare',  name:'Nightmare',     type:'ghost',   energyCost:3, dmgMulti:2.8, effect:'burn',       effectChance:100, stackable:false, comboTrigger:true,  icon:'💀', description:'ULTIMATE — induces lethal nightmare.' },
  ],
  Gengar: [
    { id:'gng_shadowball', name:'Shadow Ball',   type:'ghost',   energyCost:2, dmgMulti:2.4, effect:'debuff_def', effectChance:30,  stackable:true,  comboTrigger:true,  icon:'🌑', description:'Stackable ghost orb. Backdoor — phases through front.', targeting:'backdoor' },
    { id:'gng_sludgebomb', name:'Sludge Bomb',   type:'poison',  energyCost:2, dmgMulti:2.0, effect:'burn',       effectChance:50,  stackable:false, comboTrigger:true,  icon:'☠️', description:'Toxic explosion.' },
    { id:'gng_psych',      name:'Psychic',       type:'psychic', energyCost:2, dmgMulti:2.2, effect:'debuff_def', effectChance:35,  stackable:false, comboTrigger:true,  icon:'🔮', description:'Psychokinetic crushing force.' },
    { id:'gng_destbond',   name:'Shadow Pulse',  type:'ghost',   energyCost:3, dmgMulti:4.0, effect:'burn',       effectChance:80,  stackable:false, comboTrigger:true,  icon:'💀', description:'ULTIMATE — dimension-rending ghost pulse.' },
  ],

  /* ── Chain 09: Horsea line ──── WATER ────────────────── */
  Horsea: [
    { id:'hor_bubble',    name:'Bubble',        type:'water',   energyCost:1, dmgMulti:0.9, effect:'debuff_atk', effectChance:20,  stackable:false, comboTrigger:false, icon:'💧', description:'Water bubbles slow foe.' },
    { id:'hor_smokscr',   name:'Smokescreen',   type:'normal',  energyCost:1, dmgMulti:0,   effect:'debuff_atk', effectChance:100, stackable:true,  comboTrigger:false, icon:'💨', description:'Ink-cloud debuff.' },
    { id:'hor_watergun',  name:'Water Gun',     type:'water',   energyCost:1, dmgMulti:1.1, effect:null,         effectChance:0,   stackable:false, comboTrigger:true,  icon:'💦', description:'Pressurized water jet.' },
    { id:'hor_dragonbrth',name:'Dragon Breath', type:'dragon',  energyCost:2, dmgMulti:1.6, effect:'paralyze',   effectChance:30,  stackable:false, comboTrigger:true,  icon:'🐉', description:'Draconic breath shocks foe.' },
  ],
  Seadra: [
    { id:'sea_dragonbrth',name:'Dragon Breath', type:'dragon',  energyCost:1, dmgMulti:1.5, effect:'paralyze',   effectChance:25,  stackable:true,  comboTrigger:true,  icon:'🐉', description:'Stackable paralyzing breath.' },
    { id:'sea_hydropump', name:'Hydro Pump',    type:'water',   energyCost:2, dmgMulti:2.0, effect:null,         effectChance:0,   stackable:false, comboTrigger:true,  icon:'🌊', description:'High-pressure water cannon.' },
    { id:'sea_icywind',   name:'Icy Wind',      type:'ice',     energyCost:1, dmgMulti:1.3, effect:'debuff_atk', effectChance:100, stackable:false, comboTrigger:false, icon:'❄️', description:'Cold gale slows foe.' },
    { id:'sea_blizzard',  name:'Blizzard',      type:'ice',     energyCost:3, dmgMulti:3.0, effect:'freeze',     effectChance:30,  stackable:false, comboTrigger:true,  icon:'🌨️', description:'ULTIMATE — arctic storm.' },
  ],
  Kingdra: [
    { id:'kdr_hydropump', name:'Hydro Pump',    type:'water',   energyCost:2, dmgMulti:2.6, effect:null,         effectChance:0,   stackable:true,  comboTrigger:true,  icon:'🌊', description:'Stackable mega pump.' },
    { id:'kdr_dragonplse',name:'Dragon Pulse',  type:'dragon',  energyCost:2, dmgMulti:2.4, effect:null,         effectChance:0,   stackable:false, comboTrigger:true,  icon:'🐉', description:'Concentrated dragon energy.' },
    { id:'kdr_blizzard',  name:'Blizzard',      type:'ice',     energyCost:2, dmgMulti:2.2, effect:'freeze',     effectChance:30,  stackable:false, comboTrigger:false, icon:'🌨️', description:'Devastating arctic blizzard.' },
    { id:'kdr_hydrocnnon',name:'Hydro Cannon',  type:'water',   energyCost:3, dmgMulti:4.0, effect:'debuff_def', effectChance:60,  stackable:false, comboTrigger:true,  icon:'💦', description:'ULTIMATE — king-class water cannon.' },
  ],

  /* ── Chain 10: Larvitar line ──── ROCK ───────────────── */
  Larvitar: [
    { id:'lar_bite',      name:'Bite',          type:'dark',    energyCost:1, dmgMulti:1.0, effect:null,         effectChance:0,   stackable:false, comboTrigger:false, icon:'🦷', description:'Ferocious bite.' },
    { id:'lar_screech',   name:'Screech',       type:'normal',  energyCost:1, dmgMulti:0,   effect:'debuff_def', effectChance:100, stackable:true,  comboTrigger:false, icon:'🔊', description:'Ear-wrenching screech stacks DEF down.' },
    { id:'lar_rockslide', name:'Rock Throw',    type:'rock',    energyCost:1, dmgMulti:1.2, effect:null,         effectChance:0,   stackable:false, comboTrigger:true,  icon:'🪨', description:'Hurls heavy rocks.' },
    { id:'lar_crunch',    name:'Crunch',        type:'dark',    energyCost:2, dmgMulti:1.7, effect:'debuff_def', effectChance:30,  stackable:false, comboTrigger:true,  icon:'💥', description:'Bone-crushing bite.' },
  ],
  Pupitar: [
    { id:'pup_rockslide', name:'Rock Slide',    type:'rock',    energyCost:2, dmgMulti:1.8, effect:null,         effectChance:0,   stackable:true,  comboTrigger:true,  icon:'🪨', description:'Stackable avalanche of rocks.' },
    { id:'pup_crunch',    name:'Crunch',        type:'dark',    energyCost:1, dmgMulti:1.6, effect:'debuff_def', effectChance:25,  stackable:false, comboTrigger:true,  icon:'💥', description:'Armored crushing bite.' },
    { id:'pup_earthquake',name:'Earthquake',    type:'ground',  energyCost:2, dmgMulti:2.0, effect:'trap',       effectChance:40,  stackable:false, comboTrigger:false, icon:'🌍', description:'Seismic tremor traps foe.' },
    { id:'pup_ancpow',    name:'Ancient Power',  type:'rock',    energyCost:3, dmgMulti:2.8, effect:'shield',     effectChance:30,  stackable:false, comboTrigger:true,  icon:'💎', description:'Prehistoric power surge.' },
  ],
  Tyranitar: [
    { id:'tyr_crunch',    name:'Crunch',        type:'dark',    energyCost:2, dmgMulti:2.4, effect:'debuff_def', effectChance:40,  stackable:true,  comboTrigger:true,  icon:'💥', description:'Stackable titan crunch.' },
    { id:'tyr_rockslide', name:'Rock Slide',    type:'rock',    energyCost:2, dmgMulti:2.2, effect:'confuse',    effectChance:20,  stackable:false, comboTrigger:true,  icon:'🪨', description:'Mountainside avalanche.' },
    { id:'tyr_earthquake',name:'Earthquake',    type:'ground',  energyCost:3, dmgMulti:3.0, effect:'debuff_def', effectChance:50,  stackable:true,  comboTrigger:false, icon:'🌋', description:'World-ending tremor.' },
    { id:'tyr_hyprbeam',  name:'Hyper Beam',    type:'normal',  energyCost:3, dmgMulti:4.5, effect:null,         effectChance:0,   stackable:false, comboTrigger:true,  icon:'☄️', description:'ULTIMATE — the most powerful normal attack.' },
  ],

  /* ── Chain 11: Machop line ──── FIGHTING ─────────────── */
  Machop: [
    { id:'mcp_karatechp', name:'Karate Chop',   type:'fighting',energyCost:1, dmgMulti:1.0, effect:null,         effectChance:0,   stackable:false, comboTrigger:false, icon:'🥋', description:'Classic karate chop.' },
    { id:'mcp_lowkick',   name:'Low Kick',      type:'fighting',energyCost:1, dmgMulti:1.1, effect:null,         effectChance:0,   stackable:false, comboTrigger:true,  icon:'🦵', description:'Trips heavier foes.' },
    { id:'mcp_seismic',   name:'Seismic Toss',  type:'fighting',energyCost:1, dmgMulti:1.3, effect:null,         effectChance:0,   stackable:false, comboTrigger:true,  icon:'💪', description:'Strength-based throw.' },
    { id:'mcp_crosschop', name:'Cross Chop',    type:'fighting',energyCost:2, dmgMulti:1.8, effect:'debuff_def', effectChance:20,  stackable:false, comboTrigger:true,  icon:'✂️', description:'X-pattern chop crit rate.' },
  ],
  Machoke: [
    { id:'mke_crosschop', name:'Cross Chop',    type:'fighting',energyCost:2, dmgMulti:2.0, effect:null,         effectChance:0,   stackable:true,  comboTrigger:true,  icon:'✂️', description:'Stackable cross chop.' },
    { id:'mke_dypunch',   name:'Dynamic Punch', type:'fighting',energyCost:2, dmgMulti:1.8, effect:'confuse',    effectChance:70,  stackable:false, comboTrigger:true,  icon:'🥊', description:'Always confuses on hit.' },
    { id:'mke_submission',name:'Submission',    type:'fighting',energyCost:1, dmgMulti:1.6, effect:'trap',       effectChance:100, stackable:false, comboTrigger:false, icon:'🤼', description:'Submission hold traps foe.' },
    { id:'mke_vcegrip',   name:'Vice Grip',     type:'normal',  energyCost:3, dmgMulti:2.8, effect:'debuff_def', effectChance:40,  stackable:false, comboTrigger:true,  icon:'🦀', description:'Bone-crushing vice.' },
  ],
  Machamp: [
    { id:'mch_crosschop', name:'Cross Chop',    type:'fighting',energyCost:2, dmgMulti:2.6, effect:null,         effectChance:0,   stackable:true,  comboTrigger:true,  icon:'✂️', description:'Four-arm cross chop barrage.' },
    { id:'mch_dypunch',   name:'Dynamic Punch', type:'fighting',energyCost:2, dmgMulti:2.4, effect:'confuse',    effectChance:80,  stackable:false, comboTrigger:true,  icon:'🥊', description:'100% confusion force.' },
    { id:'mch_stoneedge', name:'Stone Edge',    type:'rock',    energyCost:2, dmgMulti:2.2, effect:null,         effectChance:0,   stackable:false, comboTrigger:false, icon:'🗡️', description:'Jagged rock spear.' },
    { id:'mch_closecmbt', name:'Close Combat',  type:'fighting',energyCost:3, dmgMulti:4.2, effect:'debuff_def', effectChance:100, stackable:false, comboTrigger:true,  icon:'💪', description:'ULTIMATE — full-force four-fisted assault.' },
  ],

  /* ── Chain 12: Magby line ──── FIRE ──────────────────── */
  Magby: [
    { id:'mgb_ember',     name:'Ember',         type:'fire',    energyCost:1, dmgMulti:1.0, effect:'burn',       effectChance:15,  stackable:false, comboTrigger:true,  icon:'🔥', description:'Weak fire flame.' },
    { id:'mgb_smokescreen',name:'Smog',         type:'poison',  energyCost:1, dmgMulti:0.8, effect:'burn',       effectChance:40,  stackable:false, comboTrigger:false, icon:'💨', description:'Toxic black smog.' },
    { id:'mgb_fist',      name:'Fire Punch',    type:'fire',    energyCost:1, dmgMulti:1.3, effect:'burn',       effectChance:20,  stackable:true,  comboTrigger:true,  icon:'🥊', description:'Burning fist attack.' },
    { id:'mgb_firespin',  name:'Fire Spin',     type:'fire',    energyCost:2, dmgMulti:1.6, effect:'trap',       effectChance:100, stackable:false, comboTrigger:true,  icon:'🌀', description:'Trapping fire vortex.' },
  ],
  Magmar: [
    { id:'mmr_flamethrow',name:'Flamethrower',  type:'fire',    energyCost:2, dmgMulti:1.9, effect:'burn',       effectChance:30,  stackable:true,  comboTrigger:true,  icon:'🔥', description:'Stackable fire stream.' },
    { id:'mmr_firepunch', name:'Fire Punch',    type:'fire',    energyCost:1, dmgMulti:1.7, effect:'burn',       effectChance:25,  stackable:false, comboTrigger:true,  icon:'🥊', description:'Lava-hot punches.' },
    { id:'mmr_confuseray',name:'Confuse Ray',   type:'ghost',   energyCost:1, dmgMulti:0,   effect:'confuse',    effectChance:90,  stackable:false, comboTrigger:false, icon:'✨', description:'Ray that always confuses.' },
    { id:'mmr_lavaplume', name:'Lava Plume',    type:'fire',    energyCost:3, dmgMulti:2.8, effect:'burn',       effectChance:70,  stackable:false, comboTrigger:true,  icon:'🌋', description:'ULTIMATE — AoE lava explosion.' },
  ],
  Magmortar: [
    { id:'mmt_lavaplume', name:'Lava Plume',    type:'fire',    energyCost:2, dmgMulti:2.8, effect:'burn',       effectChance:70,  stackable:true,  comboTrigger:true,  icon:'🌋', description:'Stackable lava waves.' },
    { id:'mmt_thunderblt',name:'Thunderbolt',   type:'electric',energyCost:2, dmgMulti:2.2, effect:'paralyze',   effectChance:25,  stackable:false, comboTrigger:true,  icon:'⚡', description:'Cross-elemental electric blast.' },
    { id:'mmt_psychic',   name:'Psychic',       type:'psychic', energyCost:2, dmgMulti:2.0, effect:'debuff_def', effectChance:30,  stackable:false, comboTrigger:false, icon:'🔮', description:'Mental force crush.' },
    { id:'mmt_blastburn', name:'Blast Burn',    type:'fire',    energyCost:3, dmgMulti:4.2, effect:'burn',       effectChance:100, stackable:false, comboTrigger:true,  icon:'☄️', description:'ULTIMATE — Magmortar ultimate conflagration.' },
  ],

  /* ── Chain 13: Pichu line ──── ELECTRIC ──────────────── */
  Pichu: [
    { id:'pch_thundershk', name:'ThunderShock', type:'electric',energyCost:1, dmgMulti:0.8, effect:'paralyze',   effectChance:10,  stackable:false, comboTrigger:false, icon:'⚡', description:'Tiny electric discharge.' },
    { id:'pch_charm',      name:'Charm',        type:'fairy',   energyCost:1, dmgMulti:0,   effect:'debuff_atk', effectChance:100, stackable:true,  comboTrigger:false, icon:'💖', description:'Stunning cuteness lowers ATK.' },
    { id:'pch_sweetkiss',  name:'Sweet Kiss',   type:'fairy',   energyCost:1, dmgMulti:0,   effect:'confuse',    effectChance:85,  stackable:false, comboTrigger:false, icon:'😚', description:'Angelic kiss bewilders foe.' },
    { id:'pch_tbolt',      name:'Thunderbolt',  type:'electric',energyCost:2, dmgMulti:1.4, effect:'paralyze',   effectChance:20,  stackable:false, comboTrigger:true,  icon:'⚡', description:'Overloaded for its size.' },
  ],
  Pikachu: [
    { id:'pka_tbolt',      name:'Thunderbolt',  type:'electric',energyCost:2, dmgMulti:2.0, effect:'paralyze',   effectChance:25,  stackable:true,  comboTrigger:true,  icon:'⚡', description:'Iconic lightning bolt.' },
    { id:'pka_quickattk',  name:'Quick Attack', type:'normal',  energyCost:1, dmgMulti:1.2, effect:null,         effectChance:0,   stackable:false, comboTrigger:false, icon:'💨', description:'Super-fast strike.' },
    { id:'pka_ironttail',  name:'Iron Tail',    type:'steel',   energyCost:1, dmgMulti:1.5, effect:'debuff_def', effectChance:30,  stackable:false, comboTrigger:true,  icon:'🔩', description:'Metallic tail slam.' },
    { id:'pka_thunder',    name:'Thunder',      type:'electric',energyCost:3, dmgMulti:3.4, effect:'paralyze',   effectChance:35,  stackable:false, comboTrigger:true,  icon:'🌩️', description:'ULTIMATE — world-famous thunder.' },
  ],
  Raichu: [
    { id:'rch_thunder',    name:'Thunder',      type:'electric',energyCost:2, dmgMulti:2.8, effect:'paralyze',   effectChance:35,  stackable:true,  comboTrigger:true,  icon:'🌩️', description:'Stackable thunder giant.' },
    { id:'rch_tbolt',      name:'Thunderbolt',  type:'electric',energyCost:2, dmgMulti:2.4, effect:'paralyze',   effectChance:25,  stackable:false, comboTrigger:true,  icon:'⚡', description:'Supercharged bolt.' },
    { id:'rch_focusblast', name:'Focus Blast',  type:'fighting',energyCost:2, dmgMulti:2.2, effect:'debuff_def', effectChance:35,  stackable:false, comboTrigger:true,  icon:'💥', description:'Fighting aura shockwave. Backdoor — targets the back.', targeting:'backdoor' },
    { id:'rch_discharge',  name:'Discharge',    type:'electric',energyCost:3, dmgMulti:4.0, effect:'paralyze',   effectChance:55,  stackable:false, comboTrigger:true,  icon:'⚡', description:'ULTIMATE — full-body electric surge.' },
  ],

  /* ── Chain 14: Pidgey line ──── FLYING ───────────────── */
  Pidgey: [
    { id:'pdg_gust',      name:'Gust',          type:'flying',  energyCost:1, dmgMulti:0.9, effect:null,         effectChance:0,   stackable:false, comboTrigger:false, icon:'💨', description:'Light gust attack.' },
    { id:'pdg_sandattk',  name:'Sand Attack',   type:'ground',  energyCost:1, dmgMulti:0,   effect:'debuff_atk', effectChance:100, stackable:true,  comboTrigger:false, icon:'🏜️', description:'Stackable sand blinds foe.' },
    { id:'pdg_quickattk', name:'Quick Attack',  type:'normal',  energyCost:1, dmgMulti:1.0, effect:null,         effectChance:0,   stackable:false, comboTrigger:false, icon:'💨', description:'Fast strike.' },
    { id:'pdg_wingattack',name:'Wing Attack',   type:'flying',  energyCost:2, dmgMulti:1.5, effect:null,         effectChance:0,   stackable:false, comboTrigger:true,  icon:'🦅', description:'Powerful wing slash.' },
  ],
  Pidgeotto: [
    { id:'pgt_wingattack',name:'Wing Attack',   type:'flying',  energyCost:1, dmgMulti:1.5, effect:null,         effectChance:0,   stackable:true,  comboTrigger:true,  icon:'🦅', description:'Stackable wing barrage.' },
    { id:'pgt_twister',   name:'Twister',       type:'dragon',  energyCost:1, dmgMulti:1.3, effect:'confuse',    effectChance:20,  stackable:false, comboTrigger:true,  icon:'🌪️', description:'Draconic twister.' },
    { id:'pgt_aerial',    name:'Aerial Ace',    type:'flying',  energyCost:2, dmgMulti:1.8, effect:null,         effectChance:0,   stackable:false, comboTrigger:true,  icon:'✈️', description:'Never misses.' },
    { id:'pgt_hurricane', name:'Hurricane',     type:'flying',  energyCost:3, dmgMulti:2.8, effect:'confuse',    effectChance:35,  stackable:false, comboTrigger:true,  icon:'🌪️', description:'Massive wind cyclone.' },
  ],
  Pidgeot: [
    { id:'pdt_hurricane', name:'Hurricane',     type:'flying',  energyCost:2, dmgMulti:2.6, effect:'confuse',    effectChance:35,  stackable:true,  comboTrigger:true,  icon:'🌪️', description:'Stackable Category 5 storm.' },
    { id:'pdt_aerialace', name:'Aerial Ace',    type:'flying',  energyCost:1, dmgMulti:2.0, effect:null,         effectChance:0,   stackable:false, comboTrigger:true,  icon:'✈️', description:'Supersonic strike. Backdoor — flies over the front line.', targeting:'backdoor' },
    { id:'pdt_airslash',  name:'Air Slash',     type:'flying',  energyCost:2, dmgMulti:2.4, effect:'paralyze',   effectChance:25,  stackable:false, comboTrigger:true,  icon:'💨', description:'Razor-sharp air blade.' },
    { id:'pdt_hyperbeam', name:'Hyper Beam',    type:'normal',  energyCost:3, dmgMulti:4.2, effect:null,         effectChance:0,   stackable:false, comboTrigger:true,  icon:'☄️', description:'ULTIMATE — king of the skies final attack.' },
  ],

  /* ── Chain 15: Squirtle line ──── WATER ──────────────── */
  Squirtle: [
    { id:'squ_bubble',    name:'Bubble',        type:'water',   energyCost:1, dmgMulti:0.9, effect:'debuff_atk', effectChance:15,  stackable:false, comboTrigger:false, icon:'💧', description:'Water bubbles.' },
    { id:'squ_withdraw',  name:'Withdraw',      type:'water',   energyCost:1, dmgMulti:0,   effect:'shield',     effectChance:100, stackable:false, comboTrigger:false, icon:'🛡️', description:'Shell shields absorb 30% damage.' },
    { id:'squ_watergun',  name:'Water Gun',     type:'water',   energyCost:1, dmgMulti:1.2, effect:null,         effectChance:0,   stackable:false, comboTrigger:true,  icon:'💦', description:'Standard water jet.' },
    { id:'squ_bitewater', name:'Bite',          type:'dark',    energyCost:2, dmgMulti:1.6, effect:'debuff_def', effectChance:20,  stackable:false, comboTrigger:true,  icon:'🦷', description:'Biting shell-crack.' },
  ],
  Wartortle: [
    { id:'war_watergun',  name:'Water Gun',     type:'water',   energyCost:1, dmgMulti:1.4, effect:null,         effectChance:0,   stackable:true,  comboTrigger:true,  icon:'💦', description:'Stackable water pressure.' },
    { id:'war_bitedark',  name:'Bite',          type:'dark',    energyCost:1, dmgMulti:1.5, effect:'debuff_def', effectChance:25,  stackable:false, comboTrigger:true,  icon:'🦷', description:'Shell-crushing bite.' },
    { id:'war_hydropump', name:'Hydro Pump',    type:'water',   energyCost:2, dmgMulti:2.2, effect:null,         effectChance:0,   stackable:false, comboTrigger:true,  icon:'🌊', description:'High-powered water cannon.' },
    { id:'war_raindnce',  name:'Rain Dance',    type:'water',   energyCost:3, dmgMulti:2.6, effect:'debuff_def', effectChance:0,   stackable:false, comboTrigger:true,  icon:'🌧️', description:'Storm powers up next water move.' },
  ],
  Blastoise: [
    { id:'bla_hydrocann', name:'Hydro Cannon',  type:'water',   energyCost:2, dmgMulti:3.0, effect:null,         effectChance:0,   stackable:true,  comboTrigger:true,  icon:'💦', description:'Stackable double-barrel blast.' },
    { id:'bla_hydropump', name:'Hydro Pump',    type:'water',   energyCost:2, dmgMulti:2.6, effect:'debuff_def', effectChance:30,  stackable:false, comboTrigger:true,  icon:'🌊', description:'Pressure warps the air.' },
    { id:'bla_icepunch',  name:'Ice Punch',     type:'ice',     energyCost:2, dmgMulti:2.0, effect:'freeze',     effectChance:15,  stackable:false, comboTrigger:true,  icon:'🥊', description:'Shell-cannon cross-elemental.' },
    { id:'bla_flashcann', name:'Flash Cannon',  type:'steel',   energyCost:3, dmgMulti:3.8, effect:'debuff_def', effectChance:60,  stackable:false, comboTrigger:true,  icon:'☄️', description:'ULTIMATE — steel-plated hyper cannon.' },
  ],

  /* ── Chain 16: Swinub line ──── ICE ──────────────────── */
  Swinub: [
    { id:'swn_tackle',    name:'Tackle',        type:'normal',  energyCost:1, dmgMulti:0.9, effect:null,         effectChance:0,   stackable:false, comboTrigger:false, icon:'🐷', description:'Basic pig tackle.' },
    { id:'swn_powdersnow',name:'Powder Snow',   type:'ice',     energyCost:1, dmgMulti:1.1, effect:'freeze',     effectChance:10,  stackable:false, comboTrigger:true,  icon:'❄️', description:'Chilled blast.' },
    { id:'swn_mudsport',  name:'Mud Sport',     type:'ground',  energyCost:1, dmgMulti:0,   effect:'debuff_atk', effectChance:100, stackable:true,  comboTrigger:false, icon:'🌍', description:'Mud weakens electricity-based ATK.' },
    { id:'swn_iceballsx', name:'Ice Shard',     type:'ice',     energyCost:2, dmgMulti:1.5, effect:null,         effectChance:0,   stackable:false, comboTrigger:true,  icon:'🧊', description:'Fast ice projectile.' },
  ],
  Piloswine: [
    { id:'pil_blizzard',  name:'Blizzard',      type:'ice',     energyCost:2, dmgMulti:1.8, effect:'freeze',     effectChance:20,  stackable:true,  comboTrigger:true,  icon:'🌨️', description:'Stackable blizzard.' },
    { id:'pil_earthquake',name:'Earthquake',    type:'ground',  energyCost:2, dmgMulti:2.0, effect:'trap',       effectChance:30,  stackable:false, comboTrigger:false, icon:'🌍', description:'Stomps cause earthquake.' },
    { id:'pil_iceshard',  name:'Ice Shard',     type:'ice',     energyCost:1, dmgMulti:1.5, effect:null,         effectChance:0,   stackable:false, comboTrigger:true,  icon:'🧊', description:'Ice shards always hit first.' },
    { id:'pil_ancpow',    name:'Ancient Power', type:'rock',    energyCost:3, dmgMulti:2.6, effect:'shield',     effectChance:30,  stackable:false, comboTrigger:true,  icon:'💎', description:'Prehistoric power surge.' },
  ],
  Mamoswine: [
    { id:'mam_earthquake',name:'Earthquake',    type:'ground',  energyCost:2, dmgMulti:2.8, effect:'debuff_def', effectChance:50,  stackable:true,  comboTrigger:false, icon:'🌋', description:'Mammoth-scale tremor.' },
    { id:'mam_blizzard',  name:'Blizzard',      type:'ice',     energyCost:2, dmgMulti:2.6, effect:'freeze',     effectChance:30,  stackable:false, comboTrigger:true,  icon:'🌨️', description:'Tundra cyclone.' },
    { id:'mam_iciclecrsh',name:'Icicle Crash',  type:'ice',     energyCost:2, dmgMulti:2.4, effect:'confuse',    effectChance:25,  stackable:false, comboTrigger:true,  icon:'🧊', description:'Massive spear of ice.' },
    { id:'mam_superpower',name:'Superpower',    type:'fighting',energyCost:3, dmgMulti:4.2, effect:'debuff_def', effectChance:100, stackable:false, comboTrigger:true,  icon:'💪', description:'ULTIMATE — mammoth stampede.' },
  ],

  /* ── Chain 17: Torchic line ──── FIRE / FIGHTING ──────── */
  Torchic: [
    { id:'tch_scratch',   name:'Scratch',       type:'normal',  energyCost:1, dmgMulti:1.0, effect:null,         effectChance:0,   stackable:false, comboTrigger:false, icon:'🐔', description:'Claw scratch.' },
    { id:'tch_ember',     name:'Ember',         type:'fire',    energyCost:1, dmgMulti:1.1, effect:'burn',       effectChance:15,  stackable:false, comboTrigger:true,  icon:'🔥', description:'Flame breath.' },
    { id:'tch_focusnergy',name:'Focus Energy',  type:'normal',  energyCost:1, dmgMulti:0,   effect:'shield',     effectChance:100, stackable:false, comboTrigger:false, icon:'🎯', description:'Concentrates for a shield.' },
    { id:'tch_peck',      name:'Peck',          type:'flying',  energyCost:1, dmgMulti:1.2, effect:null,         effectChance:0,   stackable:false, comboTrigger:true,  icon:'🐦', description:'Sharp beak peck.' },
  ],
  Combusken: [
    { id:'cbn_doublekick',name:'Double Kick',   type:'fighting',energyCost:1, dmgMulti:1.5, effect:null,         effectChance:0,   stackable:true,  comboTrigger:true,  icon:'🦵', description:'Stackable double kick.' },
    { id:'cbn_flamethrow',name:'Flamethrower',  type:'fire',    energyCost:2, dmgMulti:2.0, effect:'burn',       effectChance:30,  stackable:false, comboTrigger:true,  icon:'🔥', description:'Fire-breathing kick combo.' },
    { id:'cbn_bulkeup',   name:'Bulk Up',       type:'fighting',energyCost:1, dmgMulti:0,   effect:'shield',     effectChance:100, stackable:false, comboTrigger:false, icon:'💪', description:'Bulks up DEF shield.' },
    { id:'cbn_skyuppkick',name:'Sky Uppercut',  type:'fighting',energyCost:3, dmgMulti:2.8, effect:'confuse',    effectChance:30,  stackable:false, comboTrigger:true,  icon:'☁️', description:'ULTIMATE — uppercut that reaches clouds.' },
  ],
  Blaziken: [
    { id:'bzk_blazekick', name:'Blaze Kick',    type:'fire',    energyCost:2, dmgMulti:2.6, effect:'burn',       effectChance:50,  stackable:true,  comboTrigger:true,  icon:'🔥', description:'Stackable legendary kick.' },
    { id:'bzk_highjump',  name:'High Jump Kick',type:'fighting',energyCost:2, dmgMulti:2.4, effect:null,         effectChance:0,   stackable:false, comboTrigger:true,  icon:'🦵', description:'Soaring heel drop. Backdoor — leaps over the front.', targeting:'backdoor' },
    { id:'bzk_flamethrow',name:'Flamethrower',  type:'fire',    energyCost:2, dmgMulti:2.2, effect:'burn',       effectChance:35,  stackable:false, comboTrigger:true,  icon:'🔥', description:'Cross-combo flame stream.' },
    { id:'bzk_overheat',  name:'Overheat',      type:'fire',    energyCost:3, dmgMulti:4.2, effect:'burn',       effectChance:100, stackable:false, comboTrigger:true,  icon:'☄️', description:'ULTIMATE — nuclear blaziken explosion.' },
  ],

  /* ── Chain 18: Totodile line ──── WATER ──────────────── */
  Totodile: [
    { id:'tot_scratch',   name:'Scratch',       type:'normal',  energyCost:1, dmgMulti:1.0, effect:null,         effectChance:0,   stackable:false, comboTrigger:false, icon:'🐊', description:'Croc scratch.' },
    { id:'tot_watergun',  name:'Water Gun',     type:'water',   energyCost:1, dmgMulti:1.1, effect:null,         effectChance:0,   stackable:false, comboTrigger:true,  icon:'💦', description:'Basic water jet.' },
    { id:'tot_bite',      name:'Bite',          type:'dark',    energyCost:1, dmgMulti:1.3, effect:'debuff_def', effectChance:15,  stackable:false, comboTrigger:true,  icon:'🦷', description:'Powerful jaw bite.' },
    { id:'tot_headbutt',  name:'Headbutt',      type:'normal',  energyCost:2, dmgMulti:1.6, effect:'confuse',    effectChance:20,  stackable:false, comboTrigger:true,  icon:'💥', description:'Head-on charge.' },
  ],
  Croconaw: [
    { id:'crn_watergun',  name:'Water Gun',     type:'water',   energyCost:1, dmgMulti:1.4, effect:null,         effectChance:0,   stackable:true,  comboTrigger:true,  icon:'💦', description:'Stackable mid-stage burst.' },
    { id:'crn_bite',      name:'Crunch',        type:'dark',    energyCost:2, dmgMulti:1.8, effect:'debuff_def', effectChance:30,  stackable:false, comboTrigger:true,  icon:'🦷', description:'Jaw-crushing crunch.' },
    { id:'crn_hydropump', name:'Hydro Pump',    type:'water',   energyCost:2, dmgMulti:2.2, effect:null,         effectChance:0,   stackable:false, comboTrigger:true,  icon:'🌊', description:'Water cannon.' },
    { id:'crn_icepunch',  name:'Ice Punch',     type:'ice',     energyCost:2, dmgMulti:1.8, effect:'freeze',     effectChance:10,  stackable:false, comboTrigger:true,  icon:'🥊', description:'Cryogenic punch.' },
  ],
  Feraligatr: [
    { id:'fer_hydropump', name:'Hydro Pump',    type:'water',   energyCost:2, dmgMulti:2.8, effect:null,         effectChance:0,   stackable:true,  comboTrigger:true,  icon:'🌊', description:'Mega water tornado.' },
    { id:'fer_crunch',    name:'Crunch',        type:'dark',    energyCost:2, dmgMulti:2.4, effect:'debuff_def', effectChance:40,  stackable:false, comboTrigger:true,  icon:'🦷', description:'Prehistoric jaw force.' },
    { id:'fer_icefang',   name:'Ice Fang',      type:'ice',     energyCost:2, dmgMulti:2.0, effect:'freeze',     effectChance:20,  stackable:false, comboTrigger:true,  icon:'🧊', description:'Frozen fang pierce.' },
    { id:'fer_hydrocann', name:'Hydro Cannon',  type:'water',   energyCost:3, dmgMulti:4.2, effect:'debuff_def', effectChance:60,  stackable:false, comboTrigger:true,  icon:'💦', description:'ULTIMATE — leviathan water cannon.' },
  ],

  /* ── Chain 19: Weedle line ──── BUG / POISON ─────────── */
  Weedle: [
    { id:'wed_poison',    name:'Poison Sting',  type:'poison',  energyCost:1, dmgMulti:0.8, effect:'burn',       effectChance:30,  stackable:false, comboTrigger:false, icon:'🔮', description:'Venom sting.' },
    { id:'wed_strshot',   name:'String Shot',   type:'bug',     energyCost:1, dmgMulti:0,   effect:'debuff_atk', effectChance:100, stackable:true,  comboTrigger:false, icon:'🕸️', description:'Speed debuff silk.' },
    { id:'wed_bugbite',   name:'Bug Bite',      type:'bug',     energyCost:1, dmgMulti:1.0, effect:null,         effectChance:0,   stackable:false, comboTrigger:true,  icon:'🐛', description:'Bug munch.' },
    { id:'wed_electnet',  name:'Electroweb',    type:'electric',energyCost:2, dmgMulti:1.3, effect:'paralyze',   effectChance:40,  stackable:false, comboTrigger:true,  icon:'🕸️', description:'Electric web trap.' },
  ],
  Kakuna: [
    { id:'kak_harden',    name:'Harden',        type:'normal',  energyCost:1, dmgMulti:0,   effect:'shield',     effectChance:100, stackable:true,  comboTrigger:false, icon:'🛡️', description:'Stacks armor.' },
    { id:'kak_bugbite',   name:'Bug Bite',      type:'bug',     energyCost:1, dmgMulti:1.1, effect:null,         effectChance:0,   stackable:false, comboTrigger:false, icon:'🐛', description:'Solid pupa bite.' },
    { id:'kak_venom',     name:'Venoshock',     type:'poison',  energyCost:2, dmgMulti:1.5, effect:'burn',       effectChance:50,  stackable:false, comboTrigger:true,  icon:'☠️', description:'Toxic wound.' },
    { id:'kak_struggle',  name:'Struggle',      type:'normal',  energyCost:1, dmgMulti:1.2, effect:null,         effectChance:0,   stackable:false, comboTrigger:false, icon:'💪', description:'Last-resort attack.' },
  ],
  Beedrill: [
    { id:'bee_twinneedle',name:'Twin Needle',   type:'bug',     energyCost:2, dmgMulti:2.2, effect:'burn',       effectChance:40,  stackable:true,  comboTrigger:true,  icon:'🐝', description:'Stackable dual-sting.' },
    { id:'bee_sludgebmb', name:'Sludge Bomb',   type:'poison',  energyCost:2, dmgMulti:2.0, effect:'burn',       effectChance:50,  stackable:false, comboTrigger:true,  icon:'☠️', description:'Toxic payload explosion.' },
    { id:'bee_bugbuzz',   name:'Bug Buzz',      type:'bug',     energyCost:2, dmgMulti:2.4, effect:'debuff_def', effectChance:35,  stackable:false, comboTrigger:true,  icon:'🎵', description:'Resonant buzz shatters armor.' },
    { id:'bee_xscissor',  name:'X-Scissor',     type:'bug',     energyCost:3, dmgMulti:4.0, effect:'burn',       effectChance:60,  stackable:false, comboTrigger:true,  icon:'✂️', description:'ULTIMATE — scissor cross-cut finisher.' },
  ],

  /* ── Chain 20: Whismur line ──── NORMAL ──────────────── */
  Whismur: [
    { id:'whs_pound',     name:'Pound',         type:'normal',  energyCost:1, dmgMulti:0.9, effect:null,         effectChance:0,   stackable:false, comboTrigger:false, icon:'👊', description:'Basic pound.' },
    { id:'whs_uproar',    name:'Uproar',        type:'normal',  energyCost:1, dmgMulti:1.1, effect:'confuse',    effectChance:15,  stackable:false, comboTrigger:true,  icon:'📢', description:'Noisy uproar confuses.' },
    { id:'whs_supersonic',name:'Supersonic',    type:'normal',  energyCost:1, dmgMulti:0,   effect:'confuse',    effectChance:75,  stackable:false, comboTrigger:false, icon:'🔊', description:'Ultrasonic waves disorient.' },
    { id:'whs_echoed',    name:'Echoed Voice',  type:'normal',  energyCost:2, dmgMulti:1.5, effect:null,         effectChance:0,   stackable:true,  comboTrigger:true,  icon:'🎵', description:'Stackable: echoes grow louder each cast.' },
  ],
  Loudred: [
    { id:'lrd_uproar',    name:'Uproar',        type:'normal',  energyCost:1, dmgMulti:1.4, effect:'confuse',    effectChance:25,  stackable:true,  comboTrigger:true,  icon:'📢', description:'Stackable thunderous uproar.' },
    { id:'lrd_stomp',     name:'Stomp',         type:'normal',  energyCost:1, dmgMulti:1.5, effect:'confuse',    effectChance:20,  stackable:false, comboTrigger:true,  icon:'👣', description:'Stomping charge.' },
    { id:'lrd_screath',   name:'Screech',       type:'normal',  energyCost:1, dmgMulti:0,   effect:'debuff_def', effectChance:100, stackable:true,  comboTrigger:false, icon:'🔊', description:'Ear-splitting DEF down.' },
    { id:'lrd_hprvoice',  name:'Hyper Voice',   type:'normal',  energyCost:3, dmgMulti:2.6, effect:'debuff_def', effectChance:40,  stackable:false, comboTrigger:true,  icon:'🎙️', description:'ULTIMATE — hyper voice shockwave.' },
  ],
  Exploud: [
    { id:'exp_hprvoice',  name:'Hyper Voice',   type:'normal',  energyCost:2, dmgMulti:2.6, effect:'debuff_def', effectChance:40,  stackable:true,  comboTrigger:true,  icon:'🎙️', description:'Stackable hyper voice.' },
    { id:'exp_boomburst', name:'Boomburst',     type:'normal',  energyCost:3, dmgMulti:3.4, effect:'confuse',    effectChance:30,  stackable:false, comboTrigger:true,  icon:'💣', description:'Omnidirectional sonic explosion.' },
    { id:'exp_overheat',  name:'Fire Blast',    type:'fire',    energyCost:2, dmgMulti:2.4, effect:'burn',       effectChance:40,  stackable:false, comboTrigger:true,  icon:'🔥', description:'Mouth-cannon fire ball.' },
    { id:'exp_hyperbeam', name:'Hyper Beam',    type:'normal',  energyCost:3, dmgMulti:4.4, effect:null,         effectChance:0,   stackable:false, comboTrigger:true,  icon:'☄️', description:'ULTIMATE — hyper beam from sonic cannons.' },
  ],
};

/* ============================================================
   SPECIES → PRIMARY TYPE LOOKUP  (helper for AI & damage calc)
   ============================================================ */
BATTLE_DATA.getSpeciesType = function (species) {
  return BATTLE_DATA.SPECIES_TYPE[species] || 'normal';
};

/* ============================================================
   SKILL LOOKUP  (get a skill definition by id from any pool)
   ============================================================ */
BATTLE_DATA.getSkillById = function (skillId) {
  for (const pool of Object.values(BATTLE_DATA.SKILLS)) {
    const found = pool.find(s => s.id === skillId);
    if (found) return found;
  }
  return null;
};

/* ============================================================
   DEFAULT FALLBACK — any species not in SKILLS dict uses this
   ============================================================ */
BATTLE_DATA.DEFAULT_SKILLS = [
  { id:'def_tackle',  name:'Tackle',       type:'normal', energyCost:1, dmgMulti:1.0, effect:null,         effectChance:0,   stackable:false, comboTrigger:false, icon:'👊', description:'Basic tackle.' },
  { id:'def_growl',   name:'Growl',        type:'normal', energyCost:1, dmgMulti:0,   effect:'debuff_atk', effectChance:100, stackable:true,  comboTrigger:false, icon:'📢', description:'ATK debuff growl.' },
  { id:'def_quick',   name:'Quick Attack', type:'normal', energyCost:1, dmgMulti:1.2, effect:null,         effectChance:0,   stackable:false, comboTrigger:true,  icon:'💨', description:'Always goes first.' },
  { id:'def_hyper',   name:'Hyper Beam',   type:'normal', energyCost:3, dmgMulti:3.8, effect:null,         effectChance:0,   stackable:false, comboTrigger:true,  icon:'☄️', description:'ULTIMATE beam.' },
];

/* ============================================================
   SAME-CLASS BONUS  (Axie Infinity)
   Using a card type that matches the caster's type → +10% ATK & Shield
   ============================================================ */
BATTLE_DATA.SAME_CLASS = {
  ATK_BONUS:    0.10,   // +10% attack when card type === caster type
  SHIELD_BONUS: 0.10,   // +10% shield when card type === caster type
};

/* ============================================================
   CHAIN BONUS  (Axie Infinity)
   Playing cards of the same type across different Pokémon in
   one round triggers a small shield boost on each participant.
   ============================================================ */
BATTLE_DATA.CHAIN = {
  MIN_PARTICIPANTS: 2,   // need 2+ different Pokémon using same-type cards
  SHIELD_BONUS:     8,   // flat shield% bonus per chained action
};

/* ============================================================
   COMBO FORMULA  (Axie Infinity)
   Combo when 2+ cards on a single Axie in one turn.
   Bonus = (Card Attack × Skill) / 500  per extra card
   ============================================================ */
BATTLE_DATA.COMBO_FORMULA = {
  SKILL_DIVISOR: 500,   // bonus = (cardAtk * skill) / 500
};

/* ============================================================
   FORMATION SYSTEM  (Axie Infinity Front-Mid-Back)
   ──────────────────────────────────────────────────────────
   Positions:
     0 = FRONT  (Tank)   — absorbs hits, high HP & DEF
     1 = MID    (Support) — utility / bruiser mix
     2 = BACK   (Carry)  — high SPD & ATK, protected by front

   Enemies always target the front-most alive Pokémon first.
   Type hints map each Pokémon type to a preferred role so
   auto-formation places them sensibly.

   TARGETING SYSTEM:
     Default = always hit front-most alive enemy (FRONT → MID → BACK)
     'backdoor' = bypasses front, hits BACK-MOST alive enemy (BACK → MID → FRONT)
     Backdoor skills are marked with targeting:'backdoor' in SKILLS definitions.
   ============================================================ */
BATTLE_DATA.FORMATION = {
  POSITIONS: ['FRONT', 'MID', 'BACK'],
  LABELS:    { 0: '🛡️ FRONT', 1: '⚔️ MID', 2: '🎯 BACK' },
  SHORT:     { 0: 'FRONT', 1: 'MID', 2: 'BACK' },

  // Type → preferred position index (0 front, 1 mid, 2 back)
  TYPE_ROLE: {
    grass:     0,  // tanky / plant-like → front
    rock:      0,
    ground:    0,
    ice:       0,
    steel:     0,
    fighting:  1,  // bruiser → mid
    poison:    1,
    bug:       1,
    fairy:     1,
    normal:    1,
    fire:      2,  // attacker → back
    water:     2,
    electric:  2,
    flying:    2,
    psychic:   2,
    ghost:     2,
    dragon:    2,
    dark:      2,
  },
};

/* Freeze protection */
Object.freeze(BATTLE_DATA.ENERGY);
Object.freeze(BATTLE_DATA.COMBO);
Object.freeze(BATTLE_DATA.MORALE);
Object.freeze(BATTLE_DATA.LAST_STAND);
Object.freeze(BATTLE_DATA.SAME_CLASS);
Object.freeze(BATTLE_DATA.CHAIN);
Object.freeze(BATTLE_DATA.COMBO_FORMULA);
Object.freeze(BATTLE_DATA.FORMATION);
