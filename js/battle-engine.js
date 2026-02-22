/**
 * battle-engine.js — PokéWorld Battle Engine (Axie Infinity Mechanics)
 *
 * No DOM code. Emits events via BattleEngine.on(event, fn).
 *
 * Axie Infinity Mechanics:
 *   ⚡ Energy: Start 3, +2/round, max 9
 *   🃏 Cards: Each alive Pokémon exposes all its skill cards
 *   🔥 Combo: Multiple cards from same Pokémon → Skill/10 bonus per extra card
 *   🏃 Speed-Order: Actions resolve fastest-first; ties by HP (lower), then Skill
 *   💜 Last Stand: Morale → ticks to survive at 1 HP after lethal hit
 *   🎯 Morale & Crits: crit chance ≈ morale/500, crits = 1.5× damage
 *   🔺 Type Advantage: ±15% damage multiplier
 *
 * Public API:
 *   new BattleEngine(playerTeam, opponentTeam)
 *   engine.startBattle()
 *   engine.queueCard(side, cardId, targetIdx, casterIdx)
 *   engine.unqueueCard(side, queueIndex)
 *   engine.endTurn(side)
 *   engine.toSnapshot()
 *   engine.on(event, fn)
 *
 * Events:
 *   'stateChange'   → (snapshot)
 *   'cardPlayed'    → { side, caster, target, skill, damage, effectApplied,
 *                        typeMulti, comboStack, isCrit, comboBonusDmg }
 *   'roundStart'    → { round, energyPlayer, energyOpponent }
 *   'turnEnd'       → { side }
 *   'comboBreak'    → { side, burstDamage }
 *   'statusTick'    → { side, pkIdx, status, dmg }
 *   'faint'         → { side, pkIdx }
 *   'lastStand'     → { side, pkIdx, ticks }
 *   'lastStandEnd'  → { side, pkIdx }
 *   'crit'          → { side, caster, damage }
 *   'resolveStart'  → { actions }
 *   'battleEnd'     → { winner, turns, rewards }
 *
 * Teams are arrays of Pokémon instances built by createPokemonInstance().
 */

'use strict';

/* ============================================================
   LCG SEEDED RANDOM  (deterministic AI)
   ============================================================ */
function seededRandom(seed) {
  let s = seed >>> 0;
  return function () {
    s = Math.imul(1664525, s) + 1013904223 >>> 0;
    return s / 4294967296;
  };
}

/* ============================================================
   HELPERS — read metadata attributes
   ============================================================ */
function _getAttr(attrs, traitType) {
  if (!attrs || !Array.isArray(attrs)) return null;
  const entry = attrs.find(a => a.trait_type === traitType);
  return entry?.value ?? null;
}

const _TYPE_ICONS = {
  fire:'🔥', water:'💧', grass:'🌿', electric:'⚡', psychic:'🔮',
  ice:'❄️', fighting:'🥊', poison:'☠️', ground:'🌍', flying:'🕊️',
  bug:'🐛', rock:'🪨', ghost:'👻', dragon:'🐉', dark:'🌑',
  steel:'⚙️', fairy:'✨', normal:'⭐',
};
function _typeIcon(t) { return _TYPE_ICONS[(t || '').toLowerCase()] || '⭐'; }

/* ============================================================
   BUILD SKILL POOL FROM METADATA ATTRIBUTES
   Reads "Skill N Name/Attack/Shield/Cost/Effect" from attrs.
   Falls back to BATTLE_DATA.SKILLS if metadata has no skills.
   ============================================================ */
function buildSkillsFromMetadata(attrs, species, pkType) {
  if (!attrs || !Array.isArray(attrs)) return null;
  const skills = [];
  const existing = window.BATTLE_DATA?.SKILLS?.[species] || [];

  for (let i = 1; i <= 4; i++) {
    const name = _getAttr(attrs, `Skill ${i} Name`);
    if (!name) continue;
    const rawAtk   = Number(_getAttr(attrs, `Skill ${i} Attack`)) || 0;
    const shield   = Number(_getAttr(attrs, `Skill ${i} Shield`)) || 0;
    const cost     = Number(_getAttr(attrs, `Skill ${i} Cost`))   || 1;
    const effectRaw = (_getAttr(attrs, `Skill ${i} Effect`) || 'none').toLowerCase();
    const effect    = effectRaw === 'none' ? null : effectRaw;

    // Try to match an existing BATTLE_DATA skill by name for type / icon / extras
    const match = existing.find(s => s.name.toLowerCase() === name.toLowerCase());
    const skillType = match?.type || pkType || 'normal';

    skills.push({
      id:            `${species.toLowerCase()}_meta_${i}`,
      name,
      type:          skillType,
      energyCost:    cost,
      dmgMulti:      match?.dmgMulti || 0,        // only used if rawAttack is 0
      rawAttack:     rawAtk,                       // direct damage from metadata
      shieldAmt:     shield,                       // shield value from metadata
      effect,
      effectChance:  match?.effectChance || (effect ? 60 : 0),
      stackable:     match?.stackable || false,
      comboTrigger:  match?.comboTrigger || (i % 2 === 0),
      icon:          match?.icon || _typeIcon(skillType),
      description:   match?.description || `${name} — ${species}'s move.`,
    });
  }
  return skills.length > 0 ? skills : null;
}

/* ============================================================
   POKEMON INSTANCE FACTORY
   nftData = { id, species, level, attrs, evolution_stage }
   attrs  = metadata attributes array from PokéEvolution.fetchPokemonMeta
   ============================================================ */
function createPokemonInstance(nftData) {
  const { id, species, level, attrs, evolution_stage } = nftData;
  const stage = evolution_stage || 1;

  // Read stats from metadata attributes, falling back to level-scaled defaults
  const baseHp     = Number(_getAttr(attrs, 'HP'))  || (80 + level * 2 + stage * 20);
  const baseAtk    = Number(_getAttr(attrs, 'ATK')) || (40 + level     + stage * 10);
  const baseDef    = Number(_getAttr(attrs, 'DEF')) || (35 + level     + stage * 8);
  const baseSpd    = Number(_getAttr(attrs, 'SPD')) || (30 + level     + stage * 5);
  const baseMorale = 30 + level + stage * 8;   // morale has no metadata field yet
  const baseSkill  = 25 + level + stage * 6;   // skill has no metadata field yet

  // Determine type from metadata or BATTLE_DATA
  const metaType = (_getAttr(attrs, 'Type') || '').toLowerCase() || null;
  const pkType   = metaType
    || (window.BATTLE_DATA?.getSpeciesType?.(species))
    || 'normal';

  // Build skill pool: prefer metadata → fall back to BATTLE_DATA hardcoded skills
  const metaSkills = buildSkillsFromMetadata(attrs, species, pkType);
  const skillPool  = metaSkills
    || (window.BATTLE_DATA?.SKILLS?.[species])
    || window.BATTLE_DATA?.DEFAULT_SKILLS
    || [];

  return {
    // Identity
    nftId:   id,
    species,
    level,
    stage,
    type: pkType,

    // Stats  (Axie 6-stat: HP, ATK, DEF, SPD, Morale, Skill)
    maxHp:   baseHp,
    hp:      baseHp,
    atk:     baseAtk,
    def:     baseDef,
    spd:     baseSpd,
    morale:  baseMorale,
    skill:   baseSkill,

    // Battle-only mutable state
    statusEffects: [],   // [{ key, turnsLeft, stacks }]
    shieldAbsorb:  0,    // remaining % absorb from shield status
    isFainted:     false,

    // Axie Last Stand state
    lastStand: null,     // null | { ticks, maxTicks }

    // Combo tracking (cards played by this Pokémon this resolution phase)
    cardsPlayedThisRound: 0,

    // Legacy combo fields (kept for compat)
    comboStack:    0,
    lastCardType:  null,

    // Skills available (full pool)
    skillPool,

    // XP bookkeeping
    xpEarned: 0,
  };
}

/* ============================================================
   AI TEAM GENERATOR
   seed  — number (use trainer wallet address hash or Date.now())
   pool  — array of { species, level, attrs, evolution_stage } from DB
   ============================================================ */
function generateAITeam(seed, playerTeam) {
  const rng = seededRandom(seed);

  const allChains = [
    ['Bulbasaur','Ivysaur','Venasaur'],
    ['Caterpie','Metapod','Butterfree'],
    ['Charmander','Charmeleon','Charizard'],
    ['Cyndaquil','Quilava','Typhlosion'],
    ['Dratini','Dragonair','Dragonite'],
    ['Eevee','Flareon','Jolteon'],
    ['Elekid','Electabuzz','Electivire'],
    ['Ghastly','Haunter','Gengar'],
    ['Horsea','Seadra','Kingdra'],
    ['Larvitar','Pupitar','Tyranitar'],
    ['Machop','Machoke','Machamp'],
    ['Magby','Magmar','Magmortar'],
    ['Pichu','Pikachu','Raichu'],
    ['Pidgey','Pidgeotto','Pidgeot'],
    ['Squirtle','Wartortle','Blastoise'],
    ['Swinub','Piloswine','Mamoswine'],
    ['Torchic','Combusken','Blaziken'],
    ['Totodile','Croconaw','Feraligatr'],
    ['Weedle','Kakuna','Beedrill'],
    ['Whismur','Loudred','Exploud'],
  ];

  const playerSpecies = new Set(playerTeam.map(p => p.species));
  const available = allChains.filter(chain => !chain.some(s => playerSpecies.has(s)));

  // Shuffle
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }

  // Balance: cap AI stage to player's average stage
  const avgPlayerStage = playerTeam.reduce((s, p) => s + (p.stage || 1), 0) / playerTeam.length;
  const maxAIStageIdx  = Math.min(2, Math.ceil(avgPlayerStage) - 1);
  const avgPlayerLevel = playerTeam.reduce((s, p) => s + p.level, 0) / playerTeam.length;

  const team = [];
  for (let i = 0; i < 3; i++) {
    const chain  = available[i] || allChains[i];
    const stage  = Math.min(Math.floor(rng() * 3), maxAIStageIdx);
    const species = chain[stage];

    const aiLevel = Math.max(1, Math.min(100, Math.round(avgPlayerLevel + (rng() * 6 - 3))));

    team.push(createPokemonInstance({
      id: `ai_${i}`,
      species,
      level: aiLevel,
      attrs: [],
      evolution_stage: stage + 1,
    }));
  }
  return team;
}

/* ============================================================
   DAMAGE FORMULA  (Axie Infinity style)
   base = caster.atk × skill.dmgMulti
   defence reduction = def / (def + 100)
   type chart: ±15%
   combo bonus: comboStack × (caster.skill / 10)
   crit: morale / 500 chance → 1.5× damage
   ============================================================ */
function calcDamage(caster, target, skill, comboStack) {
  // Support rawAttack (metadata) or dmgMulti (BATTLE_DATA fallback)
  const hasRaw = skill.rawAttack != null && skill.rawAttack > 0;
  const hasMul = skill.dmgMulti != null && skill.dmgMulti > 0;
  if (!hasRaw && !hasMul) return { dmg: 0, isCrit: false, typeMulti: 1, comboBonusDmg: 0 };

  const BD = hasRaw ? skill.rawAttack : (caster.atk * skill.dmgMulti);
  const defMod = target.def / (target.def + 100);  // 0-1 reduction
  let dmg = BD * (1 - defMod);

  // Type effectiveness (Axie ±15%)
  const typeMulti = window.BATTLE_DATA
    ? BATTLE_DATA.getTypeMultiplier(skill.type, target.type)
    : 1;
  dmg *= typeMulti;

  // Axie Combo bonus: extra cards from same Pokémon add Skill/10 per stack
  let comboBonusDmg = 0;
  if (comboStack > 0 && caster.skill) {
    comboBonusDmg = comboStack * (caster.skill / (BATTLE_DATA.COMBO?.SKILL_DIVISOR || 10));
    dmg += comboBonusDmg;
  }

  // Crit check (Morale-based)
  const M = BATTLE_DATA.MORALE || { CRIT_DIVISOR: 500, CRIT_MULTIPLIER: 1.5 };
  const critChance = (caster.morale || 0) / M.CRIT_DIVISOR;
  const isCrit = Math.random() < critChance;
  if (isCrit) {
    dmg *= M.CRIT_MULTIPLIER;
  }

  // Active debuff multipliers on target
  for (const se of target.statusEffects) {
    if (se.key === 'debuff_def') {
      dmg *= 1 + (Math.abs(BATTLE_DATA.STATUS.debuff_def.modPerStack) * (se.stacks || 1));
    }
  }

  // Shield absorption
  if (target.shieldAbsorb > 0) {
    const absorbed = dmg * target.shieldAbsorb;
    dmg -= absorbed;
    target.shieldAbsorb = 0;
  }

  return {
    dmg: Math.max(1, Math.round(dmg)),
    isCrit,
    typeMulti,
    comboBonusDmg: Math.round(comboBonusDmg),
  };
}

/* ============================================================
   BATTLE ENGINE CLASS
   ============================================================ */
class BattleEngine {
  constructor(playerTeam, opponentTeam) {
    this._listeners = {};

    this.state = {
      phase: 'waiting',   // waiting | player_turn | resolving | round_end | ended
      round: 0,
      energyPlayer:   BATTLE_DATA.ENERGY.START_ENERGY,
      energyOpponent: BATTLE_DATA.ENERGY.START_ENERGY,
      cardsPlayedThisTurn: { player: 0, opponent: 0 },

      playerTeam:   playerTeam.map(p => Object.assign({}, p)),
      opponentTeam: opponentTeam.map(p => Object.assign({}, p)),
      activePlayer:   0,   // index of "front" Pokémon
      activeOpponent: 0,

      // Axie: action queues for speed-based resolution
      playerActions:   [],   // [{ cardId, targetIdx, casterIdx, skill, casterNftId, side }]
      opponentActions: [],

      turnLog: [],
      winner: null,
      totalTurns: 0,
    };
  }

  /* ── Event bus ─────────────────────────────────────────── */
  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    return this;
  }
  _emit(event, data) {
    (this._listeners[event] || []).forEach(fn => fn(data));
  }

  /* ── Helpers ───────────────────────────────────────────── */
  _getSide(side) {
    return side === 'player'
      ? { team: this.state.playerTeam,   active: this.state.activePlayer,   energyKey: 'energyPlayer' }
      : { team: this.state.opponentTeam, active: this.state.activeOpponent, energyKey: 'energyOpponent' };
  }
  _getEnemySide(side) { return this._getSide(side === 'player' ? 'opponent' : 'player'); }

  _activePokemon(side) {
    const s = this._getSide(side);
    return s.team[s.active];
  }

  _isAlive(pk) { return pk && (pk.hp > 0 || (pk.lastStand && pk.lastStand.ticks > 0)) && !pk.isFainted; }

  _nextAlive(team, currentIdx) {
    for (let i = currentIdx + 1; i < team.length; i++) {
      if (this._isAlive(team[i])) return i;
    }
    for (let i = 0; i <= currentIdx; i++) {
      if (this._isAlive(team[i])) return i;
    }
    return -1;
  }

  _checkTeamWiped(team) {
    return team.every(p => !this._isAlive(p));
  }

  /* ── Start battle ──────────────────────────────────────── */
  startBattle() {
    this.state.phase = 'player_turn';
    this.state.round = 1;
    this._emitRoundStart();
    this._emit('stateChange', this.toSnapshot());
  }

  _emitRoundStart() {
    this._emit('roundStart', {
      round:          this.state.round,
      energyPlayer:   this.state.energyPlayer,
      energyOpponent: this.state.energyOpponent,
    });
  }

  /* ══════════════════════════════════════════════════════════
     CARD QUEUE SYSTEM  (Axie: select cards → resolve all at once)
     ══════════════════════════════════════════════════════════ */

  /** Queue a card to be played this round (does not resolve yet). */
  queueCard(side, cardId, targetIdx = 0, casterIdx = null) {
    if (this.state.winner) return { ok: false, reason: 'battle_ended' };
    if (side === 'player' && this.state.phase !== 'player_turn') return { ok: false, reason: 'wrong_phase' };

    const s = this._getSide(side);
    const actionsKey = side === 'player' ? 'playerActions' : 'opponentActions';
    const energyKey  = s.energyKey;

    // Energy already committed in queue
    const queuedEnergy = this.state[actionsKey].reduce((sum, a) => sum + a.skill.energyCost, 0);

    // Find caster
    let caster;
    if (casterIdx !== null && casterIdx >= 0 && casterIdx < s.team.length && this._isAlive(s.team[casterIdx])) {
      caster = s.team[casterIdx];
    } else {
      caster = s.team.find(pk => this._isAlive(pk));
    }
    if (!caster || !this._isAlive(caster)) return { ok: false, reason: 'caster_fainted' };

    // Find skill
    let skill = caster.skillPool.find(sk => sk.id === cardId);
    if (!skill) {
      for (const pk of s.team) {
        if (this._isAlive(pk)) {
          const found = pk.skillPool.find(sk => sk.id === cardId);
          if (found) { skill = found; caster = pk; casterIdx = s.team.indexOf(pk); break; }
        }
      }
    }
    if (!skill) return { ok: false, reason: 'skill_not_found' };

    // Energy check
    if (queuedEnergy + skill.energyCost > this.state[energyKey]) {
      return { ok: false, reason: 'insufficient_energy' };
    }

    // Card per turn cap
    if (this.state[actionsKey].length >= BATTLE_DATA.ENERGY.MAX_CARDS_PER_TURN) {
      return { ok: false, reason: 'card_limit_reached' };
    }

    const action = {
      cardId,
      targetIdx,
      casterIdx: casterIdx !== null ? casterIdx : s.team.indexOf(caster),
      skill: { ...skill },
      casterNftId: caster.nftId,
      side,
    };

    this.state[actionsKey].push(action);
    // NOTE: stateChange is NOT emitted here — the UI re-renders locally
    // after queue changes to avoid mid-click DOM destruction.
    return { ok: true, action };
  }

  /** Remove a queued card by index. */
  unqueueCard(side, queueIndex) {
    const actionsKey = side === 'player' ? 'playerActions' : 'opponentActions';
    if (queueIndex >= 0 && queueIndex < this.state[actionsKey].length) {
      this.state[actionsKey].splice(queueIndex, 1);
      return { ok: true };
    }
    return { ok: false, reason: 'invalid_index' };
  }

  /* ── Resolve a single card during the resolution phase ── */
  _resolveCard(side, cardId, targetIdx, casterIdx, comboStack) {
    const s = this._getSide(side);

    let atk;
    if (casterIdx !== null && casterIdx >= 0 && casterIdx < s.team.length) {
      atk = s.team[casterIdx];
    } else {
      atk = s.team.find(pk => this._isAlive(pk));
    }
    if (!atk || !this._isAlive(atk)) return { ok: false, reason: 'caster_fainted' };

    // Skill lookup
    let skill = atk.skillPool.find(sk => sk.id === cardId);
    if (!skill) {
      for (const pk of s.team) {
        if (this._isAlive(pk)) {
          const found = pk.skillPool.find(sk => sk.id === cardId);
          if (found) { skill = found; atk = pk; break; }
        }
      }
    }
    if (!skill) return { ok: false, reason: 'skill_not_found' };

    // Status: frozen / stunned check
    const skipStatuses = ['freeze', 'stun'];
    for (const se of atk.statusEffects) {
      if (skipStatuses.includes(se.key)) {
        if (se.key === 'freeze' && Math.random() < BATTLE_DATA.STATUS.freeze.chanceThaw) {
          atk.statusEffects = atk.statusEffects.filter(x => x !== se);
        } else {
          return { ok: false, reason: 'status_skip', status: se.key };
        }
      }
    }

    // Confused: self-hit chance
    let isSelfHit = false;
    const confuse = atk.statusEffects.find(se => se.key === 'confuse');
    if (confuse && Math.random() < BATTLE_DATA.STATUS.confuse.selfHitChance) {
      isSelfHit = true;
    }

    // Deduct energy
    const energyKey = side === 'player' ? 'energyPlayer' : 'energyOpponent';
    this.state[energyKey] -= skill.energyCost;

    // Determine target Pokémon
    const enemySide = this._getEnemySide(side);
    let targetPk;
    if (isSelfHit) {
      targetPk = atk;
    } else {
      if (targetIdx >= 0 && targetIdx < enemySide.team.length && this._isAlive(enemySide.team[targetIdx])) {
        targetPk = enemySide.team[targetIdx];
      } else {
        targetPk = enemySide.team.find(p => this._isAlive(p)) || null;
      }
    }
    const hasDmg = (skill.rawAttack > 0) || (skill.dmgMulti > 0);
    if (!targetPk && hasDmg) return { ok: false, reason: 'no_target' };

    // === DAMAGE (Axie: with combo bonus + crit) ===
    let finalDmg = 0;
    let isCrit = false;
    let typeMulti = 1;
    let comboBonusDmg = 0;

    const skillHasDmg = (skill.rawAttack > 0) || (skill.dmgMulti > 0);
    if (skillHasDmg && targetPk) {
      const result = calcDamage(atk, targetPk, skill, comboStack);
      finalDmg = result.dmg;
      isCrit = result.isCrit;
      typeMulti = result.typeMulti;
      comboBonusDmg = result.comboBonusDmg;
      targetPk.hp = Math.max(0, targetPk.hp - finalDmg);
    }

    // === SHIELD from metadata (applies to caster, like Axie card shield) ===
    if (skill.shieldAmt > 0 && !isSelfHit) {
      atk.shieldAbsorb = Math.min(1, (skill.shieldAmt || 0) / 100);
    }

    // === STATUS EFFECT APPLICATION ===
    let effectApplied = null;
    if (skill.effect && !isSelfHit && targetPk && (!skillHasDmg || Math.random() < skill.effectChance / 100)) {
      effectApplied = skill.effect;
      this._applyStatus(targetPk, skill.effect, skill.stackable);
    }

    // Stackable skill dmg bonus
    if (skill.stackable && !isSelfHit && targetPk) {
      const existingStack = targetPk.statusEffects.find(se => se.key === skill.effect);
      if (existingStack) {
        const bonus = Math.round(finalDmg * 0.10 * (existingStack.stacks || 1));
        targetPk.hp = Math.max(0, targetPk.hp - bonus);
        finalDmg += bonus;
      }
    }

    // === FAINT / LAST STAND CHECK ===
    if (targetPk && targetPk.hp <= 0 && !targetPk.isFainted) {
      this._handleFaintOrLastStand(targetPk, side, enemySide, atk);
    }

    const playedEvent = {
      side, caster: atk, target: targetPk, skill,
      damage: finalDmg, effectApplied, typeMulti,
      comboStack, isCrit, comboBonusDmg,
      burstOccurred: false, isSelfHit,
    };
    this.state.turnLog.push(playedEvent);
    this._emit('cardPlayed', playedEvent);

    if (isCrit && finalDmg > 0) {
      this._emit('crit', { side, caster: atk, damage: finalDmg });
    }

    this._emit('stateChange', this.toSnapshot());
    return { ok: true, ...playedEvent };
  }

  /* ── Axie Last Stand check ─────────────────────────────── */
  _handleFaintOrLastStand(pk, attackerSide, enemySide, attacker) {
    const LS = BATTLE_DATA.LAST_STAND || { MORALE_DIVISOR: 100, MIN_TICKS: 1, HP_DURING: 1 };

    // If already in Last Stand, tick down or faint
    if (pk.lastStand) {
      pk.lastStand.ticks--;
      if (pk.lastStand.ticks <= 0) {
        pk.hp = 0;
        pk.isFainted = true;
        pk.lastStand = null;
        const faintSide = attackerSide === 'player' ? 'opponent' : 'player';
        const faintIdx = enemySide.team.indexOf(pk);
        attacker.xpEarned += Math.round(10 + pk.level * 2);
        this._emit('lastStandEnd', { side: faintSide, pkIdx: faintIdx });
        this._emit('faint', { side: faintSide, pkIdx: faintIdx });
        this._advanceActiveAfterFaint(faintSide, faintIdx);
        this._checkWin(attackerSide);
      } else {
        pk.hp = LS.HP_DURING;
      }
      return;
    }

    // Check if Pokémon enters Last Stand (morale-based)
    const ticks = Math.max(LS.MIN_TICKS, Math.ceil((pk.morale || 0) / LS.MORALE_DIVISOR));

    if ((pk.morale || 0) > 0) {
      // Enter Last Stand!
      pk.lastStand = { ticks, maxTicks: ticks };
      pk.hp = LS.HP_DURING;
      const standSide = attackerSide === 'player' ? 'opponent' : 'player';
      const standIdx = enemySide.team.indexOf(pk);
      this._emit('lastStand', { side: standSide, pkIdx: standIdx, ticks });
    } else {
      // No morale → instant faint
      pk.hp = 0;
      pk.isFainted = true;
      const faintSide = attackerSide === 'player' ? 'opponent' : 'player';
      const faintIdx = enemySide.team.indexOf(pk);
      attacker.xpEarned += Math.round(10 + pk.level * 2);
      this._emit('faint', { side: faintSide, pkIdx: faintIdx });
      this._advanceActiveAfterFaint(faintSide, faintIdx);
      this._checkWin(attackerSide);
    }
  }

  _advanceActiveAfterFaint(faintedSide, faintedIdx) {
    if (faintedSide === 'player') {
      if (this.state.activePlayer === faintedIdx) {
        const next = this._nextAlive(this.state.playerTeam, this.state.activePlayer);
        if (next >= 0) this.state.activePlayer = next;
      }
    } else {
      if (this.state.activeOpponent === faintedIdx) {
        const next = this._nextAlive(this.state.opponentTeam, this.state.activeOpponent);
        if (next >= 0) this.state.activeOpponent = next;
      }
    }
  }

  _checkWin(attackerSide) {
    const defenderTeam = attackerSide === 'player' ? this.state.opponentTeam : this.state.playerTeam;
    if (this._checkTeamWiped(defenderTeam)) {
      this._endBattle(attackerSide);
    }
  }

  /* ── Apply status effect ───────────────────────────────── */
  _applyStatus(pk, key, stackable) {
    const def = BATTLE_DATA.STATUS[key];
    if (!def) return;

    const existing = pk.statusEffects.find(se => se.key === key);
    if (existing) {
      existing.turnsLeft = def.duration;
      if (stackable && def.stackable) {
        existing.stacks = Math.min((existing.stacks || 1) + 1, def.maxStacks || 3);
      }
    } else {
      pk.statusEffects.push({
        key,
        turnsLeft: def.duration,
        stacks: 1,
      });
      if (key === 'shield') {
        pk.shieldAbsorb = def.absorbPct;
      }
    }
  }

  /* ══════════════════════════════════════════════════════════
     END TURN → SPEED-BASED RESOLUTION  (Axie Infinity core)
     Both sides' queued cards merge → sort by Speed → resolve
     ══════════════════════════════════════════════════════════ */
  endTurn(side) {
    if (this.state.winner) return;

    if (side === 'player') {
      this.state.phase = 'resolving';
      this._emit('turnEnd', { side: 'player' });
      this._emit('stateChange', this.toSnapshot());

      // AI selects its cards, then resolve all actions in speed order
      setTimeout(() => {
        this._aiSelectCards();
        this._resolveAllActions();
      }, 600);
    }
  }

  /* ── AI card selection (Axie-style: from ALL alive Pokémon) ── */
  _aiSelectCards() {
    if (this.state.winner) return;

    const aiTeam = this.state.opponentTeam;
    let remainingEnergy = this.state.energyOpponent;

    // Gather all playable skills
    const allSkills = [];
    aiTeam.forEach((pk, idx) => {
      if (!this._isAlive(pk)) return;
      pk.skillPool.forEach(sk => {
        allSkills.push({ skill: sk, pkIdx: idx, pk });
      });
    });

    // AI strategy: prioritize highest damage (rawAttack or dmgMulti)
    allSkills.sort((a, b) => {
      const dmgA = a.skill.rawAttack || (a.skill.dmgMulti * (a.pk.atk || 50)) || 0;
      const dmgB = b.skill.rawAttack || (b.skill.dmgMulti * (b.pk.atk || 50)) || 0;
      return dmgB - dmgA;
    });

    const selected = [];

    for (const entry of allSkills) {
      if (selected.length >= BATTLE_DATA.ENERGY.MAX_CARDS_PER_TURN) break;
      if (entry.skill.energyCost > remainingEnergy) continue;

      // Target: lowest HP alive player Pokémon
      const alivePlayerIdxs = this.state.playerTeam
        .map((p, i) => this._isAlive(p) ? i : -1).filter(i => i >= 0);
      if (alivePlayerIdxs.length === 0) break;

      const targetIdx = alivePlayerIdxs.reduce((best, idx) =>
        this.state.playerTeam[idx].hp < this.state.playerTeam[best].hp ? idx : best
      , alivePlayerIdxs[0]);

      selected.push({
        cardId: entry.skill.id,
        targetIdx,
        casterIdx: entry.pkIdx,
        skill: { ...entry.skill },
        casterNftId: entry.pk.nftId,
        side: 'opponent',
      });

      remainingEnergy -= entry.skill.energyCost;
    }

    this.state.opponentActions = selected;
  }

  /* ── Resolve all queued actions in speed order ─────────── */
  async _resolveAllActions() {
    if (this.state.winner) return;

    // Merge player + opponent actions
    const allActions = [
      ...this.state.playerActions.map(a => ({ ...a, side: 'player' })),
      ...this.state.opponentActions.map(a => ({ ...a, side: 'opponent' })),
    ];

    // Attach caster references for sorting
    allActions.forEach(a => {
      const team = a.side === 'player' ? this.state.playerTeam : this.state.opponentTeam;
      a._caster = team[a.casterIdx];
    });

    // 💚 HP-based sort: lowest HP attacks first, ties by highest SPD, then Skill
    allActions.sort((a, b) => {
      const hpA = a._caster?.hp || 0;
      const hpB = b._caster?.hp || 0;
      if (hpA !== hpB) return hpA - hpB;               // lowest HP first
      const spdA = a._caster?.spd || 0;
      const spdB = b._caster?.spd || 0;
      if (spdB !== spdA) return spdB - spdA;           // fastest next
      const skillA = a._caster?.skill || 0;
      const skillB = b._caster?.skill || 0;
      return skillB - skillA;                            // highest skill first
    });

    this._emit('resolveStart', { actions: allActions.length });

    // Track cards played per Pokémon for combo calculation
    const cardCountByPokemon = {};

    // Resolve each action with delay for visual feedback
    for (let i = 0; i < allActions.length; i++) {
      if (this.state.winner) break;

      const action = allActions[i];
      const caster = action._caster;

      // Skip if caster is now dead (fainted during resolution, not Last Stand)
      if (!caster || caster.isFainted) continue;

      // Calculate combo stack for this Pokémon
      const comboStack = cardCountByPokemon[action.casterNftId] || 0;
      cardCountByPokemon[action.casterNftId] = comboStack + 1;

      // Check for combo burst
      const C = BATTLE_DATA.COMBO;
      if (comboStack + 1 >= C.BURST_THRESHOLD) {
        this._emit('comboBreak', { side: action.side, burstStacks: comboStack + 1 });
      }

      // Update active index to show who's attacking
      if (action.side === 'player') {
        this.state.activePlayer = action.casterIdx;
      } else {
        this.state.activeOpponent = action.casterIdx;
      }

      // Resolve the card
      this._resolveCard(
        action.side,
        action.cardId,
        action.targetIdx,
        action.casterIdx,
        comboStack
      );

      // Delay between cards for animation
      if (i < allActions.length - 1 && !this.state.winner) {
        await this._delay(650);
      }
    }

    // Clear action queues
    this.state.playerActions = [];
    this.state.opponentActions = [];

    // Reset per-Pokémon card counts
    [...this.state.playerTeam, ...this.state.opponentTeam].forEach(pk => {
      pk.cardsPlayedThisRound = 0;
    });

    // Proceed to round end
    if (!this.state.winner) {
      await this._delay(300);
      this._endRound();
    }
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /* ── Round end ─────────────────────────────────────────── */
  _endRound() {
    this.state.round++;
    this.state.totalTurns++;

    // Status ticks on all Pokémon
    [...this.state.playerTeam, ...this.state.opponentTeam].forEach((pk, globalIdx) => {
      if (!this._isAlive(pk)) return;
      const side = globalIdx < this.state.playerTeam.length ? 'player' : 'opponent';
      const pkIdx = globalIdx < this.state.playerTeam.length
        ? globalIdx
        : globalIdx - this.state.playerTeam.length;

      pk.statusEffects = pk.statusEffects.filter(se => {
        const def = BATTLE_DATA.STATUS[se.key];
        if (!def) return false;

        // Damage tick
        if (def.tickDmg > 0) {
          const dmg = Math.round(pk.maxHp * def.tickDmg);
          pk.hp = Math.max(0, pk.hp - dmg);
          this._emit('statusTick', { side, pkIdx, status: se.key, dmg });
        }

        se.turnsLeft--;
        if (se.turnsLeft <= 0) return false;

        // Thaw
        if (se.key === 'freeze' && Math.random() < BATTLE_DATA.STATUS.freeze.chanceThaw) return false;
        return true;
      });

      // Faint check after status ticks
      if (pk.hp <= 0 && !pk.isFainted) {
        if (pk.lastStand) {
          pk.lastStand.ticks--;
          if (pk.lastStand.ticks <= 0) {
            pk.hp = 0;
            pk.isFainted = true;
            pk.lastStand = null;
            this._emit('lastStandEnd', { side, pkIdx });
            this._emit('faint', { side, pkIdx });
          } else {
            pk.hp = BATTLE_DATA.LAST_STAND.HP_DURING;
          }
        } else {
          const LS = BATTLE_DATA.LAST_STAND;
          const ticks = Math.max(LS.MIN_TICKS, Math.ceil((pk.morale || 0) / LS.MORALE_DIVISOR));
          if ((pk.morale || 0) > 0) {
            pk.lastStand = { ticks, maxTicks: ticks };
            pk.hp = LS.HP_DURING;
            this._emit('lastStand', { side, pkIdx, ticks });
          } else {
            pk.hp = 0;
            pk.isFainted = true;
            this._emit('faint', { side, pkIdx });
          }
        }
      }

      // Last Stand tick-down each round (even if not damaged this round)
      if (pk.lastStand && pk.hp > 0) {
        pk.lastStand.ticks--;
        if (pk.lastStand.ticks <= 0) {
          pk.hp = 0;
          pk.isFainted = true;
          pk.lastStand = null;
          this._emit('lastStandEnd', { side, pkIdx });
          this._emit('faint', { side, pkIdx });
        }
      }
    });

    // Win check after status ticks
    if (this._checkTeamWiped(this.state.playerTeam))   { this._endBattle('opponent'); return; }
    if (this._checkTeamWiped(this.state.opponentTeam)) { this._endBattle('player');   return; }

    // Energy regeneration (Axie: +2 per round, max 9)
    const E = BATTLE_DATA.ENERGY;
    this.state.energyPlayer   = Math.min(E.MAX, this.state.energyPlayer   + E.REGEN_PER_ROUND);
    this.state.energyOpponent = Math.min(E.MAX, this.state.energyOpponent + E.REGEN_PER_ROUND);

    // Reset turn counters
    this.state.cardsPlayedThisTurn = { player: 0, opponent: 0 };

    // New round
    this.state.phase = 'player_turn';
    this._emitRoundStart();
    this._emit('stateChange', this.toSnapshot());
  }

  /* ── Battle end ────────────────────────────────────────── */
  _endBattle(winner) {
    if (this.state.winner) return;
    this.state.winner = winner;
    this.state.phase  = 'ended';

    const survived = winner === 'player'
      ? this.state.playerTeam.filter(p => this._isAlive(p)).length
      : 0;
    const baseReward = 50;
    const rewards = {
      pokeTokens: winner === 'player' ? baseReward + survived * 10 : 5,
      xpGain:     winner === 'player' ? 200 : 50,
    };

    this._emit('battleEnd', { winner, turns: this.state.totalTurns, rewards });
    this._emit('stateChange', this.toSnapshot());
  }

  /* ── Legacy playCard API (for backward compat with battle-main) ── */
  playCard(side, cardId, targetIdx = 0, casterIdx = null) {
    return this.queueCard(side, cardId, targetIdx, casterIdx);
  }

  /* ── Serialise ─────────────────────────────────────────── */
  toSnapshot() {
    return JSON.parse(JSON.stringify(this.state));
  }
}

/* ============================================================
   EXPORTS
   ============================================================ */
window.BattleEngine           = BattleEngine;
window.createPokemonInstance   = createPokemonInstance;
window.generateAITeam         = generateAITeam;
window.buildSkillsFromMetadata = buildSkillsFromMetadata;
