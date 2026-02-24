/**
 * battle-ui.js — PokéWorld Battle UI Renderer  (Axie Infinity Full Update)
 *
 * Consumes BattleEngine events and updates the DOM.
 * All element IDs match battle.html.
 *
 * Axie Mechanics reflected in UI:
 *   🃏 ALL cards from alive Pokémon shown (no random draw)
 *   ✨ Card selection highlight — selected cards lift and glow
 *   🔥 Combo indicator — badge per Pokémon group shows combo count
 *   💥 Crit visual — "CRIT!" label on damage pop
 *   💜 Last Stand visual — purple glow + ticks badge
 *   🏃 Speed order portraits in HUD
 *
 * Public API (called from battle-main.js):
 *   BattleUI.init(engine)
 *   BattleUI.bindCardClick(fn)
 *   BattleUI.bindEndTurn(fn)
 *   BattleUI.showScreen(name)
 *   BattleUI.showMatchmaking(opponentName)
 *   BattleUI.showResult(winner, rewards, turns)
 *   BattleUI.renderAll(snapshot)
 */

'use strict';

const BattleUI = (() => {

  /* ── State ─────────────────────────────────────────────────── */
  let _engine         = null;
  let _onCardClick    = null;
  let _onEndTurn      = null;
  let _selectedTarget = 0;

  /* ── Card queue state (Axie-style: select cards from full hand) ── */
  let _cardQueue    = [];            // cards queued to play this turn
  let _lastSnapRound = 0;           // track round for resetting queue
  let _handBuilt     = false;       // true once the hand DOM has been built this round
  let _handPhase     = '';          // last rendered phase (avoid unnecessary rebuilds)
  let _playedUids    = new Set();   // UIDs of cards currently animating out

  /* ── DOM helper ─────────────────────────────────────────────── */
  const $  = id  => document.getElementById(id);
  const $$ = sel => document.querySelectorAll(sel);

  /* ══════════════════════════════════════════════════════════════
     SCREEN MANAGEMENT
     ══════════════════════════════════════════════════════════════ */
  function showScreen(name) {
    ['matchmaking', 'battle', 'result'].forEach(s => {
      const el = $(`screen-${s}`);
      if (el) el.classList.toggle('active', s === name);
    });
  }

  /* ══════════════════════════════════════════════════════════════
     ENGINE BINDING
     ══════════════════════════════════════════════════════════════ */
  function init(engine) {
    _engine = engine;
    _cardQueue = [];
    _lastSnapRound = 0;
    _handBuilt = false;
    _handPhase = '';
    _playedUids = new Set();

    engine
      .on('stateChange',     snap => renderAll(snap))
      .on('cardPlayed',      ev   => _animateCardPlayed(ev))
      .on('cardsDrawn',      ev   => _animateCardsDrawn(ev))
      .on('resolveOrder',    ev   => _showResolveOrder(ev))
      .on('actionResolving', ev   => _showActionBanner(ev))
      .on('faint',           ev   => _animateFaint(ev))
      .on('comboBreak',      ev   => _showComboBurst(ev))
      .on('statusTick',      ev   => _showStatusTick(ev))
      .on('roundStart',      ev   => _showRoundBanner(ev))
      .on('lastStand',       ev   => _showLastStand(ev))
      .on('lastStandEnd',    ev   => _showLastStandEnd(ev))
      .on('crit',            ev   => _showCritBanner(ev))
      .on('chainBonus',      ev   => _showChainBanner(ev))
      .on('battleEnd',       ev   => _onBattleEnd(ev));
  }

  function bindCardClick(fn) { _onCardClick = fn; }
  function bindEndTurn(fn)   { _onEndTurn   = fn; }

  /* ══════════════════════════════════════════════════════════════
     MATCHMAKING SCREEN
     ══════════════════════════════════════════════════════════════ */
  function showMatchmaking(opponentName) {
    showScreen('matchmaking');
    const el = $('opponent-name');
    if (el) el.textContent = opponentName || 'Wild Trainer';
    const mmName = $('mm-player-name');
    if (mmName) {
      const greeting = $('battle-greeting');
      if (greeting) mmName.textContent = greeting.textContent || 'You';
    }
  }

  /* ══════════════════════════════════════════════════════════════
     BATTLE SCREEN — FULL RENDER
     ══════════════════════════════════════════════════════════════ */
  function renderAll(snap) {
    if (!snap) return;
    _renderField(snap);
    _renderHUD(snap);
    _renderHand(snap);
    _renderComboHUD(snap);
    _updateEndTurnBtn(snap);
  }

  /* ── Both field halves ────────────────────────────────────────── */
  function _renderField(snap) {
    _renderTeamField('player',   snap.playerTeam,   snap.activePlayer);
    _renderTeamField('opponent', snap.opponentTeam, snap.activeOpponent);
    _renderPortraitStrip(snap);
  }

  /* ── Unit (Axie-style: sprite on ground + floating HP badge) ──── */
  function _renderTeamField(side, team, activeIdx) {
    const container = $(`field-${side}`);
    if (!container) return;
    container.innerHTML = '';

    team.forEach((pk, idx) => {
      const isActive  = idx === activeIdx;
      const isFainted = pk.isFainted || (pk.hp <= 0 && !pk.lastStand);
      const inLastStand = pk.lastStand && pk.lastStand.ticks > 0;
      const pct       = pk.maxHp > 0 ? Math.max(0, (pk.hp / pk.maxHp) * 100) : 0;
      const gifPath   = _getGif(pk.species);
      const hpClass   = inLastStand ? 'last-stand' : pct < 25 ? 'crit' : pct < 50 ? 'warn' : '';
      const stateClass = isFainted ? 'fainted-unit' : isActive ? 'active-unit' : 'benched-unit';
      const lastStandClass = inLastStand ? ' last-stand-unit' : '';

      const unit = document.createElement('div');
      unit.className = `field-unit ${stateClass}${lastStandClass}`;
      unit.dataset.side = side;
      unit.dataset.idx  = idx;

      const statusIcons = (pk.statusEffects || [])
        .map(se => `<span class="hp-status-icon" title="${se.key}">${BATTLE_DATA.STATUS[se.key]?.icon || '❓'}</span>`)
        .join('');

      const pkType = (pk.type || 'normal').toLowerCase();
      const typeEmoji = _typeEmoji(pkType);
      // Display shield HP (Axie flat shield) or legacy % absorb
      const shieldVal = pk.shieldHp || 0;
      const shieldHtml = shieldVal > 0
        ? `<div class="hp-shield-badge">🛡️ ${shieldVal}</div>`
        : (pk.shieldAbsorb > 0 ? `<div class="hp-shield-badge">🛡️ ${Math.round(pk.shieldAbsorb * 100)}%</div>` : '');

      // Last Stand ticks badge
      const lastStandHtml = inLastStand
        ? `<div class="last-stand-badge">💜 Last Stand ×${pk.lastStand.ticks}</div>`
        : '';

      // Build queued cards stack above Pokémon (only for player side)
      let queuedCardsHtml = '';
      if (side === 'player') {
        const queuedForThis = _cardQueue.filter(c => c._ownerIdx === idx);
        if (queuedForThis.length > 0) {
          const cardsHtml = queuedForThis.map((skill, qi) => {
            const typeClr = _typeColor(skill.type);
            return `<div class="field-queued-card" style="--type-glow:${typeClr}; --stack-offset:${qi}">
              <span class="fqc-order">${_cardQueue.indexOf(skill) + 1}</span>
              <span class="fqc-name">${skill.name}</span>
              <span class="fqc-energy">⚡${skill.energyCost}</span>
            </div>`;
          }).join('');
          queuedCardsHtml = `<div class="field-queued-stack">${cardsHtml}</div>`;
        }
      }

      // Formation position label
      const posLabels = BATTLE_DATA.FORMATION?.LABELS || { 0: '🛡️ FRONT', 1: '⚔️ MID', 2: '🎯 BACK' };
      const posLabel = posLabels[pk.position] || posLabels[idx] || '';
      const roleClass = pk.role || ['tank', 'support', 'carry'][idx] || 'support';

      unit.innerHTML = `
        ${queuedCardsHtml}
        <div class="unit-hp-badge">
          <div class="hp-badge-name">${pk.species}</div>
          <div class="hp-badge-top">
            <span class="hp-num-display">${Math.max(0, pk.hp)} / ${pk.maxHp}</span>
          </div>
          <div class="hp-bar-wrap">
            <div class="hp-bar ${hpClass}" style="width:${pct.toFixed(1)}%"></div>
          </div>
          ${shieldHtml}
          ${lastStandHtml}
          <div class="hp-status-row">${statusIcons}</div>
        </div>
        <div class="unit-type-badge type-${pkType}">${typeEmoji} ${pkType.toUpperCase()}</div>
        <img class="unit-sprite" src="${gifPath}" alt="${pk.species}" loading="lazy" />
        <div class="unit-shadow"></div>
        <div class="unit-position-badge role-${roleClass}">${posLabel}</div>
      `;

      /* Opponent units are NOT manually targetable — formation enforces targeting.
         Front-most is always the default target; backdoor cards auto-target back. */
      if (side === 'opponent' && !isFainted) {
        unit.style.cursor = 'default';
      }

      container.appendChild(unit);
    });

    /* Auto-highlight the front-most alive opponent (default target) */
    if (side === 'opponent') {
      // Find front-most alive
      let frontIdx = -1;
      for (let i = 0; i < team.length; i++) {
        const pk = team[i];
        if (pk && !pk.isFainted) { frontIdx = i; break; }
      }
      if (frontIdx >= 0) {
        const frontUnit = container.querySelector(`.field-unit[data-idx="${frontIdx}"]:not(.fainted-unit)`);
        if (frontUnit) {
          frontUnit.classList.add('targeted-unit');
          _selectedTarget = frontIdx;
        }
      }
    }
  }

  /* ── Portrait strip in HUD — Axie-style speed-ordered ──────── */
  function _renderPortraitStrip(snap) {
    const strip = $('team-portraits');
    if (!strip) return;
    strip.innerHTML = '';

    // Axie speed comparator
    const _spdCmp = (a, b) => {
      if ((a.pk.spd || 0) !== (b.pk.spd || 0)) return (b.pk.spd || 0) - (a.pk.spd || 0);
      if ((a.pk.hp || 0) !== (b.pk.hp || 0)) return (a.pk.hp || 0) - (b.pk.hp || 0);
      if ((a.pk.skill || 0) !== (b.pk.skill || 0)) return (b.pk.skill || 0) - (a.pk.skill || 0);
      return (b.pk.morale || 0) - (a.pk.morale || 0);
    };

    // Build & sort each side independently
    const pList = snap.playerTeam
      .map((pk, i) => ({ pk, side: 'player', idx: i }))
      .filter(e => !e.pk.isFainted || (e.pk.lastStand && e.pk.lastStand.ticks > 0))
      .sort(_spdCmp);
    const oList = snap.opponentTeam
      .map((pk, i) => ({ pk, side: 'opponent', idx: i }))
      .filter(e => !e.pk.isFainted || (e.pk.lastStand && e.pk.lastStand.ticks > 0))
      .sort(_spdCmp);

    // Side with fastest Pokémon leads
    const pSpd = pList[0]?.pk.spd || 0;
    const oSpd = oList[0]?.pk.spd || 0;
    const first  = pSpd >= oSpd ? pList : oList;
    const second = pSpd >= oSpd ? oList : pList;

    // Strict alternation: first[0], second[0], first[1], second[1] ...
    const interleaved = [];
    const maxLen = Math.max(first.length, second.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < first.length)  interleaved.push(first[i]);
      if (i < second.length) interleaved.push(second[i]);
    }

    // Add a "Round N" pill first
    const roundPill = document.createElement('div');
    roundPill.className = 'portrait-round-pill';
    roundPill.textContent = `Round ${snap.round}`;
    strip.appendChild(roundPill);

    interleaved.forEach((entry, orderNum) => {
      const { pk, side, idx } = entry;
      const badge = document.createElement('div');
      const sideClass = side === 'player' ? 'player-side' : 'opponent-side';
      const lsClass = pk.lastStand ? ' last-stand-portrait' : '';
      badge.className = `portrait-badge ${sideClass}${pk.isFainted ? ' fainted' : ''}${lsClass}`;
      badge.dataset.side = side;
      badge.dataset.idx  = idx;
      badge.innerHTML = `
        <img src="${_getGif(pk.species)}" alt="${pk.species}" />
        <span class="portrait-order">${orderNum + 1}</span>
        <span class="portrait-name">${pk.species}</span>
      `;
      strip.appendChild(badge);
    });
  }

  /* ── HUD row ────────────────────────────────────────────────── */
  function _renderHUD(snap) {
    const roundEl = $('round-counter');
    if (roundEl) roundEl.textContent = `Round ${snap.round}`;

    const phaseEl = $('turn-phase');
    if (phaseEl) {
      const labels = {
        player_turn: '⚔️ Your Turn — Select Cards',
        resolving:   '⚡ Resolving — fastest attacks first…',
        round_end:   '⏳ Round End',
        ended:       '🏆 Battle Over',
        waiting:     '…',
      };
      phaseEl.textContent = labels[snap.phase] || snap.phase;
    }

    _renderPlayerEnergy(snap.energyPlayer, snap);
    _renderOpponentEnergy(snap.energyOpponent);

    // Deck / Hand / Discard counters
    const deckEl = $('deck-count');
    const handCntEl = $('hand-count');
    const discardEl = $('discard-count');
    if (deckEl)    deckEl.textContent    = `🃏 ${(snap.playerDeck || []).length}`;
    if (handCntEl) handCntEl.textContent = `✋ ${(snap.playerHand || []).length}`;
    if (discardEl) discardEl.textContent = `♻️ ${(snap.playerDiscard || []).length}`;
  }

  function _renderPlayerEnergy(current, snap) {
    const numEl = $('energy-num');
    const denEl = $('energy-den');

    // Subtract queued energy so player sees available energy
    const queuedEnergy = _cardQueue.reduce((s, c) => s + c.energyCost, 0);
    const displayed = current - queuedEnergy;

    if (numEl) numEl.textContent = displayed;
    if (denEl) denEl.textContent = `/${BATTLE_DATA.ENERGY.MAX}`;

    const pipsEl = $('energy-pips');
    if (!pipsEl) return;
    pipsEl.innerHTML = '';
    for (let i = 0; i < BATTLE_DATA.ENERGY.MAX; i++) {
      const pip = document.createElement('div');
      pip.className = `energy-pip${i < displayed ? '' : ' empty'}`;
      pipsEl.appendChild(pip);
    }
  }

  function _renderOpponentEnergy(current) {
    const el = $('energy-opponent');
    if (!el) return;
    el.innerHTML = `⚡ ${current}`;
  }

  function _renderEnergyCrystals(side, current) {
    if (side === 'player') { _renderPlayerEnergy(current, null); return; }
    if (side === 'opponent') { _renderOpponentEnergy(current); return; }
  }

  /* ══════════════════════════════════════════════════════════════
     CARD HAND — AXIE INFINITY STYLE (Deck / Hand / Discard)
     ──────────────────────────────────────────────────────────────
     Start: 12-card deck (4 skills × 3 Pokémon), draw 6 initially.
     Each round: draw 3 more. Hand persists between rounds.
     Played cards → discard pile. Deck empty → reshuffle discard.
     Fainted Pokémon's cards are purged everywhere.
     ══════════════════════════════════════════════════════════════ */

  function _renderHand(snap) {
    const hand = $('skill-hand');
    if (!hand) return;

    // Reset queue on new round
    if (snap.round !== _lastSnapRound) {
      _cardQueue = [];
      _lastSnapRound = snap.round;
      _handBuilt = false;
      _playedUids.clear();
    }

    // ── During resolving / non-player phases: keep hand visible, just disable clicks ──
    if (snap.phase !== 'player_turn') {
      hand.classList.add('hand-no-interact');
      hand.classList.remove('hand-disabled');
      hand.querySelectorAll('.skill-card').forEach(c => c.classList.remove('card-selected'));
      hand.querySelectorAll('.card-queue-badge').forEach(b => b.remove());
      _handPhase = snap.phase;
      return;
    }

    hand.classList.remove('hand-disabled', 'hand-no-interact');

    // ── Build the hand structure from scratch only when needed ──
    const handCards = snap.playerHand || [];
    const currentUids = new Set(handCards.map(c => c._uid));

    // Check if we need a full rebuild (new round, first render, or cards changed significantly)
    const existingCards = hand.querySelectorAll('.skill-card[data-uid]');
    const existingUids = new Set();
    existingCards.forEach(c => existingUids.add(c.dataset.uid));

    const needsRebuild = !_handBuilt
      || _handPhase !== 'player_turn';

    _handPhase = snap.phase;

    if (needsRebuild) {
      // Full rebuild — but we'll still preserve structure where possible
      _fullBuildHand(hand, snap, handCards);
      _handBuilt = true;
      return;
    }

    // ── Incremental update — only toggle classes, remove played cards ──
    _incrementalUpdateHand(hand, snap, handCards, currentUids, existingUids);
  }

  /** Full rebuild of the hand DOM (first render of a round or after phase change) */
  function _fullBuildHand(hand, snap, handCards) {
    hand.innerHTML = '';

    const queuedEnergy = _cardQueue.reduce((sum, c) => sum + c.energyCost, 0);
    const availableEnergy = snap.energyPlayer - queuedEnergy;

    // Build card groups from shared hand (Axie-style deck/hand system)
    const groups = {};
    snap.playerTeam.forEach((pk, pkIdx) => {
      if (pk.isFainted && !(pk.lastStand && pk.lastStand.ticks > 0)) return;
      groups[pkIdx] = { species: pk.species, pkIdx, cards: [], pk };
    });

    // Group hand cards by their owner Pokémon
    handCards.forEach((card) => {
      const ownerIdx = card._ownerIdx;
      if (groups[ownerIdx]) {
        groups[ownerIdx].cards.push({ ...card });
      }
    });

    const groupArr = Object.values(groups);

    // Count queued cards per Pokémon for combo indicator
    const queuedByPk = {};
    _cardQueue.forEach(c => {
      queuedByPk[c._ownerIdx] = (queuedByPk[c._ownerIdx] || 0) + 1;
    });

    groupArr.forEach((group, gIdx) => {
      if (gIdx > 0) {
        const divider = document.createElement('div');
        divider.className = 'card-group-divider';
        hand.appendChild(divider);
      }

      const groupEl = document.createElement('div');
      groupEl.className = 'card-group';

      const gifPath = _getGif(group.species);
      const comboCount = queuedByPk[group.pkIdx] || 0;
      const comboBadge = comboCount > 1
        ? `<span class="combo-badge">🔥 Combo ×${comboCount}</span>`
        : '';

      const header = document.createElement('div');
      header.className = 'card-group-header';
      header.innerHTML = `<img src="${gifPath}" alt="${group.species}" /><span>${group.species}</span>${comboBadge}`;
      groupEl.appendChild(header);

      const cardsRow = document.createElement('div');
      cardsRow.className = 'card-group-cards';

      group.cards.forEach(skill => {
        const cardEl = _createCardElement(skill, snap, availableEnergy);
        cardsRow.appendChild(cardEl);
      });

      groupEl.appendChild(cardsRow);
      hand.appendChild(groupEl);
    });

    // If no groups (all fainted)
    if (groupArr.length === 0) {
      const msg = document.createElement('p');
      msg.style.cssText = 'color:rgba(255,255,255,0.35);font-family:var(--font-game);align-self:center;padding:0 16px;font-size:0.8rem;text-align:center';
      msg.textContent = '🃏 No Pokémon available';
      hand.appendChild(msg);
    }

    _updateEndTurnBtn(snap);
  }

  /** Create a single skill card DOM element */
  function _createCardElement(skill, snap, availableEnergy) {
    const queueIdx = _cardQueue.findIndex(q => q._uid === skill._uid);
    const isQueued = queueIdx >= 0;

    const canAfford = skill.energyCost <= availableEnergy || isQueued;
    const canPlay = canAfford || isQueued;
    const typeClr  = _typeColor(skill.type);
    const ownerGif = _getGif(skill._ownerSpecies);
    const dmgLabel = skill.rawAttack > 0 ? `${skill.rawAttack}` : (skill.dmgMulti > 0 ? `${Math.round(skill.dmgMulti * 10)}` : '—');
    const shieldLbl = skill.shieldAmt > 0 ? `${skill.shieldAmt}` : '—';

    const card = document.createElement('div');
    card.className = `skill-card type-${skill.type}${canPlay ? '' : ' sc-disabled'}${isQueued ? ' card-selected' : ''}`;
    // Add enter animation for newly drawn cards
    const pendingDrawn = _animateCardsDrawn._pending;
    if (pendingDrawn && pendingDrawn.has(skill._uid)) {
      card.classList.add('card-enter');
      pendingDrawn.delete(skill._uid);
      // Remove the class after animation so it doesn't replay
      card.addEventListener('animationend', () => card.classList.remove('card-enter'), { once: true });
    }
    card.style.setProperty('--type-glow', typeClr);
    card.dataset.skillId = skill.id;
    card.dataset.uid = skill._uid;

    const queueBadgeHtml = isQueued
      ? `<div class="card-queue-badge">${queueIdx + 1}</div>`
      : '';
    const backdoorBadgeHtml = skill.targeting === 'backdoor'
      ? `<div class="card-backdoor-badge">🎯 BACK</div>`
      : '';

    card.innerHTML = `
      ${queueBadgeHtml}
      ${backdoorBadgeHtml}
      <div class="sc-type-bar"></div>
      <div class="sc-energy">${skill.energyCost}</div>
      <div class="sc-art">
        <img class="sc-art-gif" src="${ownerGif}" alt="${skill._ownerSpecies}" loading="lazy"
             onerror="this.style.display='none';this.nextElementSibling.style.display='block'" />
        <span class="sc-art-icon" style="display:none">${skill.icon || '⚡'}</span>
      </div>
      <div class="sc-name">${skill.name}</div>
      <div class="sc-type-label">${skill.type.toUpperCase()}</div>
      <div class="sc-stats-row">
        <div class="sc-stat">
          <span class="sc-stat-val">⚔️ ${dmgLabel}</span>
          <span class="sc-stat-lbl">DMG</span>
        </div>
        <div class="sc-stat">
          <span class="sc-stat-val">🛡️ ${shieldLbl}</span>
          <span class="sc-stat-lbl">DEF</span>
        </div>
      </div>
    `;

    // Click toggles selection
    if (snap.phase === 'player_turn') {
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        _handleCardClick(skill, snap);
      });
    }

    return card;
  }

  /** Handle card click — queue/unqueue with animation */
  function _handleCardClick(skill, snap) {
    try {
      const queueIdx = _cardQueue.findIndex(q => q._uid === skill._uid);
      const isQueued = queueIdx >= 0;

      if (isQueued) {
        // Deselect — remove from queue
        _cardQueue.splice(queueIdx, 1);
        if (_engine) _engine.unqueueCard('player', queueIdx);
      } else {
        const queuedEnergy = _cardQueue.reduce((sum, c) => sum + c.energyCost, 0);
        const availableEnergy = (_engine?.state?.energyPlayer || 0) - queuedEnergy;
        const canAfford = skill.energyCost <= availableEnergy;
        if (!canAfford) return;

        // Select — add to queue with fly-up animation
        const cardEl = document.querySelector(`.skill-card[data-uid="${skill._uid}"]`);
        if (cardEl) {
          cardEl.classList.add('card-fly-up');
          // Remove the class after animation so it can be re-triggered
          setTimeout(() => cardEl.classList.remove('card-fly-up'), 300);
        }

        const queueEntry = { ...skill, _handIdx: _cardQueue.length };
        _cardQueue.push(queueEntry);
        if (_engine) {
          const result = _engine.queueCard('player', skill.id, _selectedTarget, skill._ownerIdx);
          if (!result.ok) {
            _cardQueue.pop();
            console.warn('[BattleUI] queueCard failed:', result.reason, skill.id);
            return;
          }
        }
      }

      // Incremental update instead of full re-render
      const latestSnap = _engine ? _engine.toSnapshot() : snap;
      _incrementalUpdateHand($('skill-hand'), latestSnap, latestSnap.playerHand || [], null, null);
      _renderTeamField('player', latestSnap.playerTeam, latestSnap.activePlayer);
      _renderHUD_energy(latestSnap);
      _updateEndTurnBtn(latestSnap);
    } catch (err) {
      console.error('[BattleUI] Card click error:', err);
    }
  }

  /** Incremental DOM update — only change classes/badges without rebuilding */
  function _incrementalUpdateHand(hand, snap, handCards) {
    if (!hand) return;
    const queuedEnergy = _cardQueue.reduce((sum, c) => sum + c.energyCost, 0);
    const availableEnergy = snap.energyPlayer - queuedEnergy;

    // Update combo badges on group headers
    const queuedByPk = {};
    _cardQueue.forEach(c => {
      queuedByPk[c._ownerIdx] = (queuedByPk[c._ownerIdx] || 0) + 1;
    });

    hand.querySelectorAll('.card-group').forEach(groupEl => {
      const comboBadge = groupEl.querySelector('.combo-badge');
      const headerSpan = groupEl.querySelector('.card-group-header span');
      if (!headerSpan) return;
      // Find pokémon index from the first card in this group
      const firstCard = groupEl.querySelector('.skill-card[data-uid]');
      if (!firstCard) return;
      const uid = firstCard.dataset.uid;
      const matchingCard = handCards.find(c => c._uid === uid);
      if (!matchingCard) return;
      const pkIdx = matchingCard._ownerIdx;
      const comboCount = queuedByPk[pkIdx] || 0;

      // Update or create combo badge
      const existingBadge = groupEl.querySelector('.combo-badge');
      if (comboCount > 1) {
        if (existingBadge) {
          existingBadge.textContent = `🔥 Combo ×${comboCount}`;
        } else {
          const badge = document.createElement('span');
          badge.className = 'combo-badge';
          badge.textContent = `🔥 Combo ×${comboCount}`;
          groupEl.querySelector('.card-group-header')?.appendChild(badge);
        }
      } else if (existingBadge) {
        existingBadge.remove();
      }
    });

    // Update each card's classes and badges
    hand.querySelectorAll('.skill-card[data-uid]').forEach(cardEl => {
      const uid = cardEl.dataset.uid;
      const queueIdx = _cardQueue.findIndex(q => q._uid === uid);
      const isQueued = queueIdx >= 0;
      const skill = handCards.find(c => c._uid === uid);
      if (!skill) return;

      const canAfford = skill.energyCost <= availableEnergy || isQueued;
      const canPlay = canAfford || isQueued;

      // Update selection state
      cardEl.classList.toggle('card-selected', isQueued);
      cardEl.classList.toggle('sc-disabled', !canPlay);

      // Update queue badge
      let badge = cardEl.querySelector('.card-queue-badge');
      if (isQueued) {
        if (badge) {
          badge.textContent = queueIdx + 1;
        } else {
          badge = document.createElement('div');
          badge.className = 'card-queue-badge';
          badge.textContent = queueIdx + 1;
          cardEl.insertBefore(badge, cardEl.firstChild);
        }
      } else if (badge) {
        badge.remove();
      }
    });
  }

  /** Update only the energy display (no full HUD rebuild) */
  function _renderHUD_energy(snap) {
    // Update energy number
    const numEl = document.querySelector('.energy-num');
    if (numEl) numEl.textContent = snap.energyPlayer;
    // Update pips
    const pipsEl = $('energy-pips');
    if (pipsEl) {
      const maxE = BATTLE_DATA?.ENERGY?.MAX || 10;
      const pips = pipsEl.querySelectorAll('.energy-pip');
      pips.forEach((pip, i) => {
        pip.classList.toggle('empty', i >= snap.energyPlayer);
      });
    }
  }

  /* ── Render the queued-cards (now shown above Pokémon on field) ── */
  function _renderQueueSection(snap) {
    // Queue cards are now rendered in _renderTeamField above each Pokémon.
    // Hide the old queue section.
    const section = $('card-queue-section');
    if (section) section.classList.remove('has-cards');
  }

  /* ── Combo HUD — shows per-Pokémon combo stacks ─────────────── */
  function _renderComboHUD(snap) {
    const hud = $('combo-hud');
    if (!hud) return;

    // Count queued cards per Pokémon
    const queuedByPk = {};
    _cardQueue.forEach(c => {
      queuedByPk[c._ownerIdx] = (queuedByPk[c._ownerIdx] || 0) + 1;
    });

    const maxCombo = Object.values(queuedByPk).reduce((max, v) => Math.max(max, v), 0);
    const threshold = BATTLE_DATA.COMBO?.BURST_THRESHOLD || 3;

    const fill  = hud.querySelector('.combo-fill');
    const label = hud.querySelector('.combo-label');
    if (fill)  fill.style.width = `${Math.min(100, (maxCombo / threshold) * 100)}%`;
    if (label) label.textContent = maxCombo > 0 ? `Combo ×${maxCombo}` : 'Combo';
  }

  /* ── End-turn button ────────────────────────────────────────── */
  function _updateEndTurnBtn(snap) {
    const btn = $('btn-end-turn');
    const hint = $('battle-hint');
    if (!btn) return;
    const isMyTurn = snap.phase === 'player_turn';
    btn.disabled    = !isMyTurn;
    if (isMyTurn) {
      const qCount = _cardQueue.length;
      if (qCount > 0) {
        btn.textContent = `⚔️ ATTACK! (${qCount})`;
        btn.style.background = 'linear-gradient(135deg, #ff4040, #cc2200)';
        btn.style.boxShadow  = '0 5px 0 #7a0000, 0 8px 18px rgba(255,0,0,0.3)';
        if (hint) hint.textContent = 'All cards resolve by Speed!';
      } else {
        btn.textContent = 'End Turn ▶';
        btn.style.background = '';
        btn.style.boxShadow  = '';
        if (hint) hint.textContent = '① Pick cards → ② Tap enemy → ③ Attack!';
      }
    } else if (snap.phase === 'resolving') {
      btn.textContent = '🏃 Resolving…';
      btn.style.background = 'linear-gradient(135deg, #8844cc, #6622aa)';
      btn.style.boxShadow  = '';
      if (hint) hint.textContent = 'Speed-based resolution in progress';
    } else {
      btn.textContent = '⏳ Waiting…';
      btn.style.background = '';
      btn.style.boxShadow  = '';
      if (hint) hint.textContent = '';
    }
  }

  /* ══════════════════════════════════════════════════════════════
     ANIMATIONS
     ══════════════════════════════════════════════════════════════ */

  function _highlightAttacker(ownerIdx, side = 'player') {
    if (ownerIdx === null || ownerIdx === undefined) return;
    const unit = document.querySelector(`#field-${side} .field-unit[data-idx="${ownerIdx}"]`);
    if (!unit) return;
    unit.classList.add('attacking-unit');
    setTimeout(() => unit.classList.remove('attacking-unit'), 700);
  }

  function _animateCardPlayed(ev) {
    // ── Animate card out of hand (real-time removal) ──
    if (ev.side === 'player' && ev._cardUid) {
      const cardEl = document.querySelector(`.skill-card[data-uid="${ev._cardUid}"]`);
      if (cardEl) {
        _playedUids.add(ev._cardUid);
        cardEl.classList.add('card-played-out');
        cardEl.addEventListener('animationend', () => {
          cardEl.remove();
          _playedUids.delete(ev._cardUid);
          // Clean up empty groups
          const hand = $('skill-hand');
          if (hand) {
            hand.querySelectorAll('.card-group').forEach(g => {
              if (g.querySelectorAll('.skill-card').length === 0) {
                // Remove group and its divider
                const prev = g.previousElementSibling;
                if (prev && prev.classList.contains('card-group-divider')) prev.remove();
                g.remove();
              }
            });
          }
        }, { once: true });
      }
    }

    if (!ev.target || ev.damage <= 0) return;

    // Highlight the attacking Pokémon
    if (ev.caster) {
      const casterSide = ev.side;
      const casterTeam = casterSide === 'player'
        ? _engine?.state?.playerTeam
        : _engine?.state?.opponentTeam;
      if (casterTeam) {
        const casterIdx = casterTeam.indexOf(ev.caster);
        if (casterIdx >= 0) _highlightAttacker(casterIdx, casterSide);
      }
    }

    const targetSide  = ev.side === 'player' ? 'opponent' : 'player';
    const targetTeam  = ev.side === 'player' ? _engine?.state?.opponentTeam : _engine?.state?.playerTeam;
    if (!targetTeam) return;

    const targetIdx   = targetTeam.indexOf(ev.target);
    const unitEl      = document.querySelector(`#field-${targetSide} .field-unit[data-idx="${targetIdx}"]`);
    if (!unitEl) return;

    const typeMulti = ev.typeMulti || 1;
    if (typeMulti > 1) unitEl.classList.add('te-flash');

    const shakeClass = ev.isCrit ? 'shake-heavy' : typeMulti >= 1.15 ? 'shake-heavy' : 'shake';
    unitEl.classList.add(shakeClass);

    _showDmgPop(unitEl, ev.damage, typeMulti, ev.isCrit, ev.comboStack, ev.comboBonusDmg);

    setTimeout(() => {
      unitEl.classList.remove(shakeClass, 'te-flash');
      unitEl.style.opacity = '';
    }, 600);
  }

  /** Animate newly drawn cards into the hand */
  function _animateCardsDrawn(ev) {
    if (ev.side !== 'player') return;
    // New cards will be rendered on next stateChange → _renderHand → _fullBuildHand
    // We mark them so _fullBuildHand can add the card-enter animation class
    if (!_animateCardsDrawn._pending) _animateCardsDrawn._pending = new Set();
    (ev.cards || []).forEach(c => _animateCardsDrawn._pending.add(c._uid));
  }

  function _showDmgPop(anchorEl, dmg, typeMulti, isCrit, comboStack, comboBonusDmg) {
    const pop = document.createElement('div');
    pop.className = 'dmg-float';

    let text = '';
    let extraClass = '';

    if (typeMulti === 0) {
      text = 'No Effect!';
      extraClass = 'immune';
    } else if (isCrit) {
      text = `💥 ${dmg} CRIT!`;
      extraClass = 'crit-hit';
    } else if (typeMulti > 1) {
      text = `${dmg} SUPER!`;
      extraClass = 'super';
    } else if (typeMulti < 1) {
      text = `${dmg} (weak)`;
    } else {
      text = `-${dmg}`;
    }

    // Combo bonus indicator
    if (comboStack > 0 && comboBonusDmg > 0) {
      text += ` +🔥${comboBonusDmg}`;
    }

    pop.textContent = text;
    if (extraClass) pop.classList.add(extraClass);

    anchorEl.style.position = 'relative';
    anchorEl.appendChild(pop);
    setTimeout(() => pop.remove(), 1200);
  }

  function _animateFaint(ev) {
    const unit = document.querySelector(`#field-${ev.side} .field-unit[data-idx="${ev.pkIdx}"]`);
    if (unit) {
      unit.classList.add('faint-anim');
      setTimeout(() => unit.classList.add('fainted-unit'), 900);
    }
  }

  function _showComboBurst(ev) {
    const banner = $('combo-burst-banner');
    if (!banner) return;
    banner.textContent = `🔥 COMBO BURST ×${ev.burstStacks}!`;
    banner.classList.add('visible');
    setTimeout(() => banner.classList.remove('visible'), 1500);
  }

  function _showStatusTick(ev) {
    const unit = document.querySelector(`#field-${ev.side} .field-unit[data-idx="${ev.pkIdx}"]`);
    if (unit && ev.dmg > 0) _showDmgPop(unit, ev.dmg, 1, false, 0, 0);
  }

  function _showRoundBanner(ev) {
    // Clean up active portrait highlight from previous round
    document.querySelectorAll('.portrait-active').forEach(p => p.classList.remove('portrait-active'));

    const banner = document.createElement('div');
    banner.className = 'round-banner';
    banner.textContent = `⚔️ Round ${ev.round} — ⚡+${BATTLE_DATA.ENERGY.REGEN_PER_ROUND} Energy`;
    ($('screen-battle') || document.body).appendChild(banner);
    setTimeout(() => banner.remove(), 1200);
  }

  /* _showResolveOrder / _showResolveStrip removed — portrait strip now shows
     the alternating play order from round start via _renderPortraitStrip */
  function _showResolveOrder(_ev) { /* no-op, order shown in portrait strip */ }

  /** Show a small action banner + highlight active portrait for each resolving card */
  function _showActionBanner(ev) {
    // Remove any previous action banner
    document.querySelectorAll('.action-banner').forEach(b => b.remove());
    const isPlayer = ev.side === 'player';
    const pos = ev.index + 1;
    const banner = document.createElement('div');
    banner.className = `action-banner ${isPlayer ? 'action-player' : 'action-opponent'}`;
    banner.textContent = `#${pos} ${isPlayer ? '🔵 YOU' : '🔴 ENEMY'} — ${ev.casterSpecies} uses ${ev.skillName}`;
    ($('screen-battle') || document.body).appendChild(banner);
    setTimeout(() => banner.remove(), 850);

    // Highlight the active portrait in the play-order strip
    const portraits = document.querySelectorAll('#team-portraits .portrait-badge');
    portraits.forEach(p => p.classList.remove('portrait-active'));
    if (portraits[ev.index]) portraits[ev.index].classList.add('portrait-active');
  }

  /* ── Last Stand visuals ─────────────────────────────────────── */
  function _showLastStand(ev) {
    const unit = document.querySelector(`#field-${ev.side} .field-unit[data-idx="${ev.pkIdx}"]`);
    if (unit) {
      unit.classList.add('last-stand-unit');
    }

    // Show Last Stand banner
    const banner = document.createElement('div');
    banner.className = 'round-banner last-stand-banner-anim';
    banner.textContent = `💜 LAST STAND! (${ev.ticks} ticks)`;
    banner.style.color = '#cc88ff';
    ($('screen-battle') || document.body).appendChild(banner);
    setTimeout(() => banner.remove(), 1500);
  }

  function _showLastStandEnd(ev) {
    const unit = document.querySelector(`#field-${ev.side} .field-unit[data-idx="${ev.pkIdx}"]`);
    if (unit) {
      unit.classList.remove('last-stand-unit');
    }
  }

  /* ── Crit banner ───────────────────────────────────────────── */
  function _showCritBanner(ev) {
    const banner = document.createElement('div');
    banner.className = 'round-banner crit-banner-anim';
    banner.textContent = `💥 CRITICAL HIT! ${ev.damage} dmg`;
    banner.style.color = '#ff3b30';
    ($('screen-battle') || document.body).appendChild(banner);
    setTimeout(() => banner.remove(), 1000);
  }

  /* ── Chain bonus banner ────────────────────────────────────── */
  function _showChainBanner(ev) {
    const sideLbl = ev.side === 'player' ? 'Your' : 'AI';
    const banner = document.createElement('div');
    banner.className = 'round-banner chain-banner-anim';
    banner.textContent = `🔗 ${sideLbl} ${ev.type.toUpperCase()} CHAIN! +${ev.shieldBonus} Shield (${ev.participants} Pokémon)`;
    banner.style.color = '#30d5c8';
    ($('screen-battle') || document.body).appendChild(banner);
    setTimeout(() => banner.remove(), 1200);
  }

  /* ══════════════════════════════════════════════════════════════
     RESULT SCREEN
     ══════════════════════════════════════════════════════════════ */
  function _onBattleEnd(ev) {
    setTimeout(() => showResult(ev.winner, ev.rewards, ev.turns), 600);
  }

  function showResult(winner, rewards, turns) {
    showScreen('result');

    const title = $('result-title');
    if (title) {
      title.textContent = winner === 'player' ? '🏆 Victory!' : '😞 Defeated';
      title.className   = winner === 'player' ? 'result-win'  : 'result-lose';
    }

    const rwEl = $('result-rewards');
    if (rwEl && rewards) {
      rwEl.innerHTML = `
        <p>🪙 POKÉ Earned: <strong>${rewards.pokeTokens}</strong></p>
        <p>⭐ XP Gained:   <strong>${rewards.xpGain}</strong></p>
        <p>⏱️ Turns:       <strong>${turns}</strong></p>
      `;
    }

    if (winner === 'player') _launchConfetti();
  }

  function _launchConfetti() {
    const arena = $('screen-result');
    if (!arena) return;
    for (let i = 0; i < 60; i++) {
      const c = document.createElement('div');
      c.className = 'confetti-piece';
      c.style.left             = `${Math.random() * 100}%`;
      c.style.background       = `hsl(${Math.random() * 360}, 80%, 60%)`;
      c.style.animationDelay    = `${Math.random() * 2}s`;
      c.style.animationDuration = `${1.5 + Math.random()}s`;
      arena.appendChild(c);
      setTimeout(() => c.remove(), 4000);
    }
  }

  /* ══════════════════════════════════════════════════════════════
     HELPERS
     ══════════════════════════════════════════════════════════════ */
  function _getGif(species) {
    if (window.PokéEvolution?.getGifPath) return PokéEvolution.getGifPath(species);
    const STAGE_MAP = {
      Bulbasaur:'baseForm', Caterpie:'baseForm', Charmander:'baseForm', Cyndaquil:'baseForm',
      Dratini:'baseForm', Eevee:'baseForm', Elekid:'baseForm', Ghastly:'baseForm',
      Horsea:'baseForm', Larvitar:'baseForm', Machop:'baseForm', Magby:'baseForm',
      Pichu:'baseForm', Pidgey:'baseForm', Squirtle:'baseForm', Swinub:'baseForm',
      Torchic:'baseForm', Totodile:'baseForm', Weedle:'baseForm', Whismur:'baseForm',
      Ivysaur:'secondForm', Metapod:'secondForm', Charmeleon:'secondForm', Quilava:'secondForm',
      Dragonair:'secondForm', Flareon:'secondForm', Electabuzz:'secondForm', Haunter:'secondForm',
      Seadra:'secondForm', Pupitar:'secondForm', Machoke:'secondForm', Magmar:'secondForm',
      Pikachu:'secondForm', Pidgeotto:'secondForm', Wartortle:'secondForm', Piloswine:'secondForm',
      Combusken:'secondForm', Croconaw:'secondForm', Kakuna:'secondForm', Loudred:'secondForm',
      Venasaur:'thirdForm', Butterfree:'thirdForm', Charizard:'thirdForm', Typhlosion:'thirdForm',
      Dragonite:'thirdForm', Jolteon:'thirdForm', Electivire:'thirdForm', Gengar:'thirdForm',
      Kingdra:'thirdForm', Tyranitar:'thirdForm', Machamp:'thirdForm', Magmortar:'thirdForm',
      Raichu:'thirdForm', Pidgeot:'thirdForm', Blastoise:'thirdForm', Mamoswine:'thirdForm',
      Blaziken:'thirdForm', Feraligatr:'thirdForm', Beedrill:'thirdForm', Exploud:'thirdForm',
    };
    const folder = STAGE_MAP[species] || 'baseForm';
    return `/assets/${folder}/${species}.gif`;
  }

  function _typeOf(species) {
    if (window.BATTLE_DATA?.getSpeciesType) return BATTLE_DATA.getSpeciesType(species);
    return 'normal';
  }

  const TYPE_COLORS = {
    fire:'#ff6030', water:'#4fc3f7', grass:'#56e66b', electric:'#ffe566',
    psychic:'#ff80ab', ice:'#aaeeff', fighting:'#e07040', poison:'#cc55cc',
    ground:'#c09a3a', flying:'#88aaee', bug:'#99cc33', rock:'#b8a038',
    ghost:'#7060b8', dragon:'#7038ec', dark:'#8c6040', steel:'#aab8c4',
    fairy:'#ee88bb', normal:'#a0a080',
  };

  function _typeColor(type) { return TYPE_COLORS[type] || '#888'; }

  const TYPE_EMOJI = {
    fire:'🔥', water:'💧', grass:'🌿', electric:'⚡', psychic:'🔮',
    ice:'❄️', fighting:'🥊', poison:'☠️', ground:'🌍', flying:'🕊️',
    bug:'🐛', rock:'🪨', ghost:'👻', dragon:'🐉', dark:'🌑',
    steel:'⚙️', fairy:'✨', normal:'⭐',
  };
  function _typeEmoji(type) { return TYPE_EMOJI[(type || '').toLowerCase()] || '⭐'; }

  /* ── Public API ──────────────────────────────────────────────── */
  return {
    init,
    bindCardClick,
    bindEndTurn,
    showScreen,
    showMatchmaking,
    showResult,
    renderAll,
    get selectedTarget() { return _selectedTarget; },
    getCardQueue()  { return _cardQueue.slice(); },
    clearCardQueue() { _cardQueue = []; },
  };

})();

window.BattleUI = BattleUI;
