/**
 * evolution.js — PokéWorld Evolution Engine
 *
 * Maps every Pokémon in the local metadata to its evolution chain
 * and provides helpers to:
 *  - determine if a Pokémon is ready to evolve
 *  - perform the evolution (update Supabase row + swap GIF/metadata)
 *  - render an evolution-aware card that shows the GIF asset
 */

/* ============================================================
   EVOLUTION CHAIN MAP
   Ordered by chain: Base Form → Second Form → Third Form.
   All 20 chains match exactly the assets in /assets/ and /metadata/.

   Chain #  Base           → Second         → Third
   ──────────────────────────────────────────────────────────
   01       Bulbasaur      → Ivysaur        → Venasaur
   02       Caterpie       → Metapod        → Butterfree
   03       Charmander     → Charmeleon     → Charizard
   04       Cyndaquil      → Quilava        → Typhlosion
   05       Dratini        → Dragonair      → Dragonite
   06       Eevee          → Flareon        → Jolteon
   07       Elekid         → Electabuzz     → Electivire
   08       Ghastly        → Haunter        → Gengar
   09       Horsea         → Seadra         → Kingdra
   10       Larvitar       → Pupitar        → Tyranitar
   11       Machop         → Machoke        → Machamp
   12       Magby          → Magmar         → Magmortar
   13       Pichu          → Pikachu        → Raichu
   14       Pidgey         → Pidgeotto      → Pidgeot
   15       Squirtle       → Wartortle      → Blastoise
   16       Swinub         → Piloswine      → Mamoswine
   17       Torchic        → Combusken      → Blaziken
   18       Totodile       → Croconaw       → Feraligatr
   19       Weedle         → Kakuna         → Beedrill
   20       Whismur        → Loudred        → Exploud
   ============================================================ */
const EVOLUTION_CHAINS = {

  // ── Chain 01: Bulbasaur line ──────────────────────────────
  Bulbasaur:   { evolvesTo: 'Ivysaur',    evolvesAtLevel: 15, stage: 'base'   },
  Ivysaur:     { evolvesTo: 'Venasaur',   evolvesAtLevel: 30, stage: 'second' },
  Venasaur:    { evolvesTo: null,         evolvesAtLevel: null, stage: 'third' },

  // ── Chain 02: Caterpie line ──────────────────────────────
  Caterpie:    { evolvesTo: 'Metapod',    evolvesAtLevel: 15, stage: 'base'   },
  Metapod:     { evolvesTo: 'Butterfree', evolvesAtLevel: 30, stage: 'second' },
  Butterfree:  { evolvesTo: null,         evolvesAtLevel: null, stage: 'third' },

  // ── Chain 03: Charmander line ─────────────────────────────
  Charmander:  { evolvesTo: 'Charmeleon', evolvesAtLevel: 15, stage: 'base'   },
  Charmeleon:  { evolvesTo: 'Charizard',  evolvesAtLevel: 30, stage: 'second' },
  Charizard:   { evolvesTo: null,         evolvesAtLevel: null, stage: 'third' },

  // ── Chain 04: Cyndaquil line ──────────────────────────────
  Cyndaquil:   { evolvesTo: 'Quilava',    evolvesAtLevel: 15, stage: 'base'   },
  Quilava:     { evolvesTo: 'Typhlosion', evolvesAtLevel: 30, stage: 'second' },
  Typhlosion:  { evolvesTo: null,         evolvesAtLevel: null, stage: 'third' },

  // ── Chain 05: Dratini line ────────────────────────────────
  Dratini:     { evolvesTo: 'Dragonair',  evolvesAtLevel: 15, stage: 'base'   },
  Dragonair:   { evolvesTo: 'Dragonite',  evolvesAtLevel: 30, stage: 'second' },
  Dragonite:   { evolvesTo: null,         evolvesAtLevel: null, stage: 'third' },

  // ── Chain 06: Eevee line ──────────────────────────────────
  Eevee:       { evolvesTo: 'Flareon',    evolvesAtLevel: 15, stage: 'base'   },
  Flareon:     { evolvesTo: 'Jolteon',    evolvesAtLevel: 30, stage: 'second' },
  Jolteon:     { evolvesTo: null,         evolvesAtLevel: null, stage: 'third' },

  // ── Chain 07: Elekid line ─────────────────────────────────
  Elekid:      { evolvesTo: 'Electabuzz', evolvesAtLevel: 15, stage: 'base'   },
  Electabuzz:  { evolvesTo: 'Electivire', evolvesAtLevel: 30, stage: 'second' },
  Electivire:  { evolvesTo: null,         evolvesAtLevel: null, stage: 'third' },

  // ── Chain 08: Ghastly line ────────────────────────────────
  Ghastly:     { evolvesTo: 'Haunter',    evolvesAtLevel: 15, stage: 'base'   },
  Haunter:     { evolvesTo: 'Gengar',     evolvesAtLevel: 30, stage: 'second' },
  Gengar:      { evolvesTo: null,         evolvesAtLevel: null, stage: 'third' },

  // ── Chain 09: Horsea line ─────────────────────────────────
  Horsea:      { evolvesTo: 'Seadra',     evolvesAtLevel: 15, stage: 'base'   },
  Seadra:      { evolvesTo: 'Kingdra',    evolvesAtLevel: 30, stage: 'second' },
  Kingdra:     { evolvesTo: null,         evolvesAtLevel: null, stage: 'third' },

  // ── Chain 10: Larvitar line ───────────────────────────────
  Larvitar:    { evolvesTo: 'Pupitar',    evolvesAtLevel: 15, stage: 'base'   },
  Pupitar:     { evolvesTo: 'Tyranitar',  evolvesAtLevel: 30, stage: 'second' },
  Tyranitar:   { evolvesTo: null,         evolvesAtLevel: null, stage: 'third' },

  // ── Chain 11: Machop line ─────────────────────────────────
  Machop:      { evolvesTo: 'Machoke',    evolvesAtLevel: 15, stage: 'base'   },
  Machoke:     { evolvesTo: 'Machamp',    evolvesAtLevel: 30, stage: 'second' },
  Machamp:     { evolvesTo: null,         evolvesAtLevel: null, stage: 'third' },

  // ── Chain 12: Magby line ──────────────────────────────────
  Magby:       { evolvesTo: 'Magmar',     evolvesAtLevel: 15, stage: 'base'   },
  Magmar:      { evolvesTo: 'Magmortar',  evolvesAtLevel: 30, stage: 'second' },
  Magmortar:   { evolvesTo: null,         evolvesAtLevel: null, stage: 'third' },

  // ── Chain 13: Pichu line ──────────────────────────────────
  Pichu:       { evolvesTo: 'Pikachu',    evolvesAtLevel: 15, stage: 'base'   },
  Pikachu:     { evolvesTo: 'Raichu',     evolvesAtLevel: 30, stage: 'second' },
  Raichu:      { evolvesTo: null,         evolvesAtLevel: null, stage: 'third' },

  // ── Chain 14: Pidgey line ─────────────────────────────────
  Pidgey:      { evolvesTo: 'Pidgeotto',  evolvesAtLevel: 15, stage: 'base'   },
  Pidgeotto:   { evolvesTo: 'Pidgeot',    evolvesAtLevel: 30, stage: 'second' },
  Pidgeot:     { evolvesTo: null,         evolvesAtLevel: null, stage: 'third' },

  // ── Chain 15: Squirtle line ───────────────────────────────
  Squirtle:    { evolvesTo: 'Wartortle',  evolvesAtLevel: 15, stage: 'base'   },
  Wartortle:   { evolvesTo: 'Blastoise',  evolvesAtLevel: 30, stage: 'second' },
  Blastoise:   { evolvesTo: null,         evolvesAtLevel: null, stage: 'third' },

  // ── Chain 16: Swinub line ─────────────────────────────────
  Swinub:      { evolvesTo: 'Piloswine',  evolvesAtLevel: 15, stage: 'base'   },
  Piloswine:   { evolvesTo: 'Mamoswine',  evolvesAtLevel: 30, stage: 'second' },
  Mamoswine:   { evolvesTo: null,         evolvesAtLevel: null, stage: 'third' },

  // ── Chain 17: Torchic line ────────────────────────────────
  Torchic:     { evolvesTo: 'Combusken',  evolvesAtLevel: 15, stage: 'base'   },
  Combusken:   { evolvesTo: 'Blaziken',   evolvesAtLevel: 30, stage: 'second' },
  Blaziken:    { evolvesTo: null,         evolvesAtLevel: null, stage: 'third' },

  // ── Chain 18: Totodile line ───────────────────────────────
  Totodile:    { evolvesTo: 'Croconaw',   evolvesAtLevel: 15, stage: 'base'   },
  Croconaw:    { evolvesTo: 'Feraligatr', evolvesAtLevel: 30, stage: 'second' },
  Feraligatr:  { evolvesTo: null,         evolvesAtLevel: null, stage: 'third' },

  // ── Chain 19: Weedle line ─────────────────────────────────
  Weedle:      { evolvesTo: 'Kakuna',     evolvesAtLevel: 15, stage: 'base'   },
  Kakuna:      { evolvesTo: 'Beedrill',   evolvesAtLevel: 30, stage: 'second' },
  Beedrill:    { evolvesTo: null,         evolvesAtLevel: null, stage: 'third' },

  // ── Chain 20: Whismur line ────────────────────────────────
  Whismur:     { evolvesTo: 'Loudred',    evolvesAtLevel: 15, stage: 'base'   },
  Loudred:     { evolvesTo: 'Exploud',    evolvesAtLevel: 30, stage: 'second' },
  Exploud:     { evolvesTo: null,         evolvesAtLevel: null, stage: 'third' },
};

/* Stage → folder name mapping */
const STAGE_FOLDER = {
  base:   'baseForm',
  second: 'secondForm',
  third:  'thirdForm',
};

/* Derive SPECIES_STAGE directly from the chain map — no manual list needed */
const SPECIES_STAGE = {};
Object.entries(EVOLUTION_CHAINS).forEach(([name, data]) => {
  SPECIES_STAGE[name] = data.stage;
});

/**
 * Returns the GIF path for a given species name.
 * Falls back gracefully if the asset doesn't exist.
 */
function getGifPath(speciesName) {
  const stage = SPECIES_STAGE[speciesName] || 'base';
  const folder = STAGE_FOLDER[stage] || 'baseForm';
  return `/assets/${folder}/${speciesName}.gif`;
}

/**
 * Returns the metadata JSON path for a given species name.
 */
function getMetaPath(speciesName) {
  const stage = SPECIES_STAGE[speciesName] || 'base';
  const folder = STAGE_FOLDER[stage] || 'baseForm';
  return `/metadata/${folder}/${speciesName}.json`;
}

/**
 * Loads metadata for a species from the local JSON files.
 * Returns null on failure.
 */
async function fetchPokemonMeta(speciesName) {
  try {
    const res = await fetch(getMetaPath(speciesName), { cache: 'no-cache' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Returns the stat value from a metadata attributes array.
 */
function getStat(attributes, traitType) {
  return attributes?.find(a => a.trait_type === traitType)?.value ?? 0;
}

/**
 * Determines whether a Pokémon is ready to evolve.
 * @param {string} speciesName
 * @param {number} level
 * @returns {{ canEvolve: boolean, evolvesTo: string|null, evolvesAtLevel: number|null }}
 */
function checkEvolution(speciesName, level) {
  const chain = EVOLUTION_CHAINS[speciesName];
  if (!chain) return { canEvolve: false, evolvesTo: null, evolvesAtLevel: null };
  const canEvolve = level >= chain.evolvesAtLevel;
  return { canEvolve, evolvesTo: chain.evolvesTo, evolvesAtLevel: chain.evolvesAtLevel };
}

/**
 * Performs the evolution in Supabase:
 *  - Updates the owned_pokemon row: species, level reset reset to evolution level
 *  - Returns the new species name or null on error.
 *
 * @param {string} userId
 * @param {string} nftId         — the row id in owned_pokemon
 * @param {string} currentName
 * @param {number} currentLevel
 * @returns {Promise<string|null>}
 */
async function performEvolution(userId, nftId, currentName, currentLevel) {
  const { canEvolve, evolvesTo, evolvesAtLevel } = checkEvolution(currentName, currentLevel);
  if (!canEvolve || !evolvesTo) return null;

  try {
    const { error } = await _supabase
      .from('owned_pokemon')
      .update({
        species:         evolvesTo,
        evolution_stage: SPECIES_STAGE[evolvesTo] || 'second',
        level:           evolvesAtLevel,  // keep at the trigger level
      })
      .eq('id', nftId)
      .eq('user_id', userId);

    if (error) { console.error('[Evolution] DB error:', error); return null; }
    return evolvesTo;
  } catch (err) {
    console.error('[Evolution] Error:', err);
    return null;
  }
}

/**
 * Builds and returns a fully-rendered Pokémon card element
 * that uses the local GIF asset and shows an evolve button
 * when the Pokémon has reached the required level.
 *
 * @param {object} opts
 *   nftId, species, nickname, level, experience, userId, onEvolved (callback)
 */
async function buildPokemonCard(opts) {
  const { nftId, species, nickname, level, experience = 0, userId, onEvolved } = opts;
  const meta = await fetchPokemonMeta(species);
  const attrs = meta?.attributes || [];

  const hp  = getStat(attrs, 'HP');
  const atk = getStat(attrs, 'ATK');
  const def = getStat(attrs, 'DEF');
  const spd = getStat(attrs, 'SPD');
  const type     = getStat(attrs, 'Type')            || 'Normal';
  const rarity   = getStat(attrs, 'Rarity')          || 'Common';
  const stage    = getStat(attrs, 'Evolution Stage') || 'Base';
  const skill1   = getStat(attrs, 'Skill 1 Name')    || '—';
  const skill1Atk= getStat(attrs, 'Skill 1 Attack')  || 0;
  const gifSrc   = getGifPath(species);

  const { canEvolve, evolvesTo, evolvesAtLevel } = checkEvolution(species, level);

  const card = document.createElement('div');
  card.className = `pokemon-card nft-card rarity-${rarity.toLowerCase()}`;
  card.dataset.species  = species;
  card.dataset.nftId    = nftId;
  card.dataset.types    = type.toLowerCase();
  card.dataset.stage    = stage.toLowerCase();

  // XP bar percentage (capped at 100)
  const xpPercent = Math.min(100, Math.round((experience % 1000) / 10));

  card.innerHTML = `
    <div class="nft-card-badge rarity-badge-${rarity.toLowerCase()}">${rarity}</div>
    <div class="nft-gif-wrap">
      <img class="nft-gif" src="${gifSrc}"
           alt="${sanitize(nickname || species)}"
           onerror="this.onerror=null;this.src='https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${species.toLowerCase()}.png';"
           loading="lazy" />
    </div>
    <div class="nft-card-body">
      <div class="nft-card-header">
        <span class="card-name">${sanitize(nickname || species)}</span>
        <span class="stage-badge stage-${stage.toLowerCase()}">${stage}</span>
      </div>
      <div class="nft-level-row">
        <span class="level-lbl">Lv. ${level}</span>
        <span class="type-badge type-${type.toLowerCase()}">${type}</span>
      </div>
      <div class="xp-wrap" title="${experience} XP">
        <div class="xp-bar"><div class="xp-fill" style="width:${xpPercent}%"></div></div>
        <span class="xp-lbl">${experience % 1000}/1000 XP</span>
      </div>
      <div class="nft-stats-row">
        <span title="HP">❤️ ${hp}</span>
        <span title="ATK">⚔️ ${atk}</span>
        <span title="DEF">🛡️ ${def}</span>
        <span title="SPD">💨 ${spd}</span>
      </div>
      <div class="nft-skills-row">
        <span class="skill-chip">⚡ ${sanitize(skill1)} (${skill1Atk})</span>
      </div>
      ${canEvolve ? `
      <button class="btn btn-evolve btn-primary evolve-btn"
              data-nft-id="${nftId}"
              data-species="${species}"
              data-level="${level}"
              title="Evolve to ${evolvesTo}!">
        ✨ Evolve → ${evolvesTo}
      </button>` : evolvesAtLevel ? `
        <div class="evolve-hint">Evolves → ${evolvesTo} at Lv. ${evolvesAtLevel}</div>
      ` : `<div class="evolve-hint max-stage">Max Evolution Stage 🏆</div>`}
    </div>
  `;

  // Attach evolve handler
  const evolveBtn = card.querySelector('.evolve-btn');
  if (evolveBtn && onEvolved) {
    evolveBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      evolveBtn.disabled = true;
      evolveBtn.textContent = '✨ Evolving...';

      const newSpecies = await performEvolution(userId, nftId, species, level);
      if (newSpecies) {
        onEvolved(nftId, newSpecies, level);
      } else {
        evolveBtn.disabled = false;
        evolveBtn.textContent = `✨ Evolve → ${evolvesTo}`;
      }
    });
  }

  return card;
}

/* Expose globally */
window.PokéEvolution = {
  EVOLUTION_CHAINS,
  SPECIES_STAGE,
  getGifPath,
  getMetaPath,
  fetchPokemonMeta,
  checkEvolution,
  performEvolution,
  buildPokemonCard,
  getStat,
};
