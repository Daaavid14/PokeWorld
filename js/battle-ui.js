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

    engine
      .on('stateChange',  snap => renderAll(snap))
      .on('cardPlayed',   ev   => _animateCardPlayed(ev))
      .on('faint',        ev   => _animateFaint(ev))
      .on('comboBreak',   ev   => _showComboBurst(ev))
      .on('statusTick',   ev   => _showStatusTick(ev))
      .on('roundStart',   ev   => _showRoundBanner(ev))
      .on('lastStand',    ev   => _showLastStand(ev))
      .on('lastStandEnd', ev   => _showLastStandEnd(ev))
      .on('crit',         ev   => _showCritBanner(ev))
      .on('battleEnd',    ev   => _onBattleEnd(ev));
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
      const shieldHtml = pk.shieldAbsorb > 0
        ? `<div class="hp-shield-badge">🛡️ ${pk.shieldAbsorb}</div>`
        : '';

      // Last Stand ticks badge
      const lastStandHtml = inLastStand
        ? `<div class="last-stand-badge">💜 Last Stand ×${pk.lastStand.ticks}</div>`
        : '';

      unit.innerHTML = `
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
      `;

      /* Click to target opponent units */
      if (side === 'opponent' && !isFainted) {
        unit.addEventListener('click', () => {
          $$('#field-opponent .field-unit').forEach(u => u.classList.remove('targeted-unit'));
          unit.classList.add('targeted-unit');
          _selectedTarget = idx;
        });
      }

      container.appendChild(unit);
    });

    /* Auto-highlight active opponent target */
    if (side === 'opponent') {
      const active = container.querySelector(`.field-unit[data-idx="${activeIdx}"]:not(.fainted-unit)`);
      if (active) {
        active.classList.add('targeted-unit');
        _selectedTarget = activeIdx;
      }
    }
  }

  /* ── Portrait strip in HUD — Axie-style speed-ordered ──────── */
  function _renderPortraitStrip(snap) {
    const strip = $('team-portraits');
    if (!strip) return;
    strip.innerHTML = '';

    // Build combined list sorted by HP (lowest first — attacks first)
    const all = [
      ...snap.playerTeam.map((pk, i) => ({ pk, side: 'player', idx: i })),
      ...snap.opponentTeam.map((pk, i) => ({ pk, side: 'opponent', idx: i })),
    ];

    // Sort by HP asc (lowest HP attacks first), then SPD desc, then Skill desc
    all.sort((a, b) => {
      if ((a.pk.hp || 0) !== (b.pk.hp || 0)) return (a.pk.hp || 0) - (b.pk.hp || 0);
      if ((b.pk.spd || 0) !== (a.pk.spd || 0)) return (b.pk.spd || 0) - (a.pk.spd || 0);
      return (b.pk.skill || 0) - (a.pk.skill || 0);
    });

    all.forEach((entry, orderNum) => {
      const { pk, side } = entry;
      const badge = document.createElement('div');
      const sideClass = side === 'player' ? 'player-side' : 'opponent-side';
      const lsClass = pk.lastStand ? ' last-stand-portrait' : '';
      badge.className = `portrait-badge ${sideClass}${pk.isFainted ? ' fainted' : ''}${lsClass}`;
      badge.innerHTML = `
        <img src="${_getGif(pk.species)}" alt="${pk.species}" />
        <span class="portrait-order">${orderNum + 1}</span>
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
        resolving:   '💚 Lowest HP attacks first…',
        round_end:   '⏳ Round End',
        ended:       '🏆 Battle Over',
        waiting:     '…',
      };
      phaseEl.textContent = labels[snap.phase] || snap.phase;
    }

    _renderPlayerEnergy(snap.energyPlayer, snap);
    _renderOpponentEnergy(snap.energyOpponent);
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
     CARD HAND — AXIE INFINITY STYLE
     ──────────────────────────────────────────────────────────────
     ALL skills from ALL alive Pokémon are shown (no random draw).
     Player clicks a card → it becomes "selected" (lifted + glowing).
     Click again → deselected. Queue tracks selection order.
     On End Turn → engine resolves all queued cards in speed order.
     ══════════════════════════════════════════════════════════════ */

  function _renderHand(snap) {
    const hand = $('skill-hand');
    if (!hand) return;
    hand.innerHTML = '';

    // Reset queue on new round
    if (snap.round !== _lastSnapRound) {
      _cardQueue = [];
      _lastSnapRound = snap.round;
    }

    if (snap.phase !== 'player_turn') {
      _renderQueueSection(snap);
      const msg = document.createElement('p');
      msg.style.cssText = 'color:rgba(255,255,255,0.3);font-family:var(--font-game);align-self:center;padding:0 16px;font-size:0.9rem';
      msg.textContent = snap.phase === 'resolving' ? '💚 Resolving — lowest HP first…' : '';
      hand.appendChild(msg);
      return;
    }

    // Compute total energy committed in queue
    const queuedEnergy = _cardQueue.reduce((sum, c) => sum + c.energyCost, 0);
    const availableEnergy = snap.energyPlayer - queuedEnergy;

    // Build card groups from ALL alive Pokémon
    const groups = {};
    snap.playerTeam.forEach((pk, pkIdx) => {
      if (pk.isFainted && !(pk.lastStand && pk.lastStand.ticks > 0)) return;
      const key = pkIdx;
      groups[key] = { species: pk.species, pkIdx, cards: [], pk };
      (pk.skillPool || []).forEach((skill, skillIdx) => {
        groups[key].cards.push({ ...skill, _ownerIdx: pkIdx, _ownerSpecies: pk.species, _skillIdx: skillIdx });
      });
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
        // Check if this specific card is already queued
        const queueIdx = _cardQueue.findIndex(q =>
          q.id === skill.id && q._ownerIdx === skill._ownerIdx && q._skillIdx === skill._skillIdx
        );
        const isQueued = queueIdx >= 0;

        const canAfford = skill.energyCost <= availableEnergy || isQueued; // can always un-queue
        const underLimit = _cardQueue.length < (BATTLE_DATA.ENERGY.MAX_CARDS_PER_TURN || 5) || isQueued;
        const canPlay = (canAfford && underLimit) || isQueued;
        const typeClr  = _typeColor(skill.type);
        const ownerGif = _getGif(skill._ownerSpecies);
        const dmgLabel = skill.rawAttack > 0 ? `${skill.rawAttack}` : (skill.dmgMulti > 0 ? `${Math.round(skill.dmgMulti * 10)}` : '—');
        const shieldLbl = skill.shieldAmt > 0 ? `${skill.shieldAmt}` : '—';

        const card = document.createElement('div');
        card.className = `skill-card type-${skill.type}${canPlay ? '' : ' sc-disabled'}${isQueued ? ' card-selected' : ''}`;
        card.style.setProperty('--type-glow', typeClr);
        card.dataset.skillId = skill.id;

        // Queue order badge for selected cards
        const queueBadgeHtml = isQueued
          ? `<div class="card-queue-badge">${queueIdx + 1}</div>`
          : '';

        card.innerHTML = `
          ${queueBadgeHtml}
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
            try {
              if (isQueued) {
                // Deselect — remove from queue
                _cardQueue.splice(queueIdx, 1);
                if (_engine) _engine.unqueueCard('player', queueIdx);
              } else if (canPlay) {
                // Select — add to queue
                const queueEntry = { ...skill, _handIdx: _cardQueue.length };
                _cardQueue.push(queueEntry);
                // Queue in engine too
                if (_engine) {
                  const result = _engine.queueCard('player', skill.id, _selectedTarget, skill._ownerIdx);
                  if (!result.ok) {
                    _cardQueue.pop(); // revert
                    console.warn('[BattleUI] queueCard failed:', result.reason, skill.id);
                  }
                }
              }
              // Single re-render with latest engine state
              if (_engine) {
                renderAll(_engine.toSnapshot());
              } else {
                _renderHand(snap);
              }
            } catch (err) {
              console.error('[BattleUI] Card click error:', err);
            }
          });
        }

        cardsRow.appendChild(card);
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

    _renderQueueSection(snap);
    _updateEndTurnBtn(snap);
  }

  /* ── Render the queued-cards strip ─────────────────────── */
  function _renderQueueSection(snap) {
    const section = $('card-queue-section');
    const queueEl = $('card-queue');
    const costEl  = $('queue-energy-cost');
    if (!section || !queueEl) return;

    queueEl.innerHTML = '';

    if (_cardQueue.length === 0) {
      section.classList.remove('has-cards');
      return;
    }

    section.classList.add('has-cards');

    _cardQueue.forEach((skill, qIdx) => {
      const gifPath = _getGif(skill._ownerSpecies);
      const typeClr = _typeColor(skill.type);

      const qCard = document.createElement('div');
      qCard.className = 'queue-card';
      qCard.style.setProperty('--type-glow', typeClr);
      qCard.innerHTML = `
        <span class="queue-card-num">${qIdx + 1}</span>
        <img src="${gifPath}" alt="${skill._ownerSpecies}" />
        <div class="queue-card-info">
          <span class="queue-card-name">${skill.name}</span>
          <span class="queue-card-owner">${skill._ownerSpecies}</span>
        </div>
        <span class="queue-card-energy">⚡${skill.energyCost}</span>
      `;

      // Click to remove from queue
      if (snap.phase === 'player_turn') {
        qCard.addEventListener('click', () => {
          _cardQueue.splice(qIdx, 1);
          if (_engine) _engine.unqueueCard('player', qIdx);
          _renderHand(snap);
        });
      }

      queueEl.appendChild(qCard);
    });

    const totalCost = _cardQueue.reduce((s, c) => s + c.energyCost, 0);
    if (costEl) costEl.textContent = `⚡ ${totalCost} total`;
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
    const banner = document.createElement('div');
    banner.className = 'round-banner';
    banner.textContent = `⚔️ Round ${ev.round} — ⚡+${BATTLE_DATA.ENERGY.REGEN_PER_ROUND} Energy`;
    ($('screen-battle') || document.body).appendChild(banner);
    setTimeout(() => banner.remove(), 1200);
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
