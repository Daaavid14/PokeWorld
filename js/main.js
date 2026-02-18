/**
 * main.js — PokéWorld Landing Page Logic
 *
 * Features:
 *  - Animated counter stats
 *  - PokeAPI card fetch with type filtering
 *  - Scroll reveal animations
 *  - Particle background
 *  - Navbar scroll behaviour
 *  - Pagination (load more)
 *  - Smooth scroll
 */

/* ============================================================
   CONFIGURATION
   ============================================================ */

const POKE_API_BASE = 'https://pokeapi.co/api/v2';

// Mapping of Pokemon IDs to rarity tiers for demo purposes
const RARITY_MAP = {
  legendary: [144, 145, 146, 150, 151, 243, 244, 245, 249, 250, 382, 383, 384, 643, 644, 646, 716, 717, 718],
  epic:      [6, 9, 3, 65, 94, 149, 248, 248, 257, 260, 282, 445, 448],
  rare:      [25, 39, 52, 54, 58, 79, 113, 129, 133, 137, 143, 196, 197],
};

function getRarity(id) {
  if (RARITY_MAP.legendary.includes(id)) return 'legendary';
  if (RARITY_MAP.epic.includes(id))      return 'epic';
  if (RARITY_MAP.rare.includes(id))      return 'rare';
  return 'common';
}

function getPriceByRarity(rarity) {
  const prices = { legendary: '5,000–50,000', epic: '500–4,999', rare: '50–499', common: '10–49' };
  return prices[rarity];
}

/* ============================================================
   1. NAVBAR SCROLL BEHAVIOUR
   ============================================================ */

(function initNavbar() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;

  let lastScroll = 0;

  window.addEventListener('scroll', () => {
    const currentScroll = window.scrollY;
    navbar.classList.toggle('scrolled', currentScroll > 20);
    lastScroll = currentScroll;
  }, { passive: true });
})();

/* ============================================================
   2. SMOOTH SCROLL FOR ANCHOR LINKS
   ============================================================ */

document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', (e) => {
    const target = document.querySelector(link.getAttribute('href'));
    if (!target) return;
    e.preventDefault();
    const offset = 80; // navbar height compensation
    const top = target.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: 'smooth' });

    // Close mobile menu if open
    const hamburger = document.getElementById('hamburger');
    if (hamburger?.classList.contains('open')) hamburger.click();
  });
});

/* ============================================================
   3. ANIMATED COUNTER STATS
   ============================================================ */

function animateCounter(el, target, duration = 2000) {
  const start     = 0;
  const startTime = performance.now();
  const isLarge   = target >= 1000;

  const step = (currentTime) => {
    const elapsed  = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Ease-out cubic
    const eased    = 1 - Math.pow(1 - progress, 3);
    const value    = Math.round(start + (target - start) * eased);

    el.textContent = isLarge ? value.toLocaleString() : value;

    if (progress < 1) requestAnimationFrame(step);
    else el.textContent = target.toLocaleString();
  };

  requestAnimationFrame(step);
}

function initCounters() {
  const counters = document.querySelectorAll('.stat-number[data-target]');
  if (!counters.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !entry.target.dataset.counted) {
        entry.target.dataset.counted = 'true';
        animateCounter(entry.target, parseInt(entry.target.dataset.target, 10));
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  counters.forEach(c => observer.observe(c));
}

/* ============================================================
   4. HERO PARTICLE BACKGROUND
   ============================================================ */

function initParticles() {
  const container = document.getElementById('heroParticles');
  if (!container) return;

  const PARTICLE_COUNT = 35;
  const colors = ['#ffd500', '#00e5ff', '#ff4db3', '#a78bfa', '#ffffff'];

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const p   = document.createElement('div');
    p.className = 'particle';
    const size     = Math.random() * 5 + 2;
    const color    = colors[Math.floor(Math.random() * colors.length)];
    const left     = Math.random() * 100;
    const delay    = Math.random() * 8;
    const duration = Math.random() * 6 + 5;

    p.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      background: ${color};
      left: ${left}%;
      bottom: ${Math.random() * 30}%;
      animation-delay: ${delay}s;
      animation-duration: ${duration}s;
      opacity: ${Math.random() * 0.6 + 0.2};
    `;

    container.appendChild(p);
  }
}

/* ============================================================
   5. SCROLL REVEAL ANIMATION
   ============================================================ */

function initScrollReveal() {
  // Add reveal class to elements that should animate on scroll
  const targets = [
    { selector: '.step-card',       cls: 'reveal'       },
    { selector: '.team-card',       cls: 'reveal'       },
    { selector: '.timeline-item',  cls: 'reveal-left'  },
    { selector: '.section-header', cls: 'reveal'       },
    { selector: '.footer-brand',   cls: 'reveal'       },
    { selector: '.pokemon-card',   cls: 'reveal'       },
  ];

  targets.forEach(({ selector, cls }) => {
    document.querySelectorAll(selector).forEach((el, i) => {
      el.classList.add(cls);
      if (i < 4) el.classList.add(`reveal-delay-${i + 1}`);
    });
  });

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  document.querySelectorAll('.reveal, .reveal-left, .reveal-right')
    .forEach(el => revealObserver.observe(el));
}

/* ============================================================
   6. POKEMON API — CARD SHOWCASE
   ============================================================ */

let currentPage        = 1;
const CARDS_PER_PAGE   = 12;
let currentFilter      = 'all';
let allLoadedPokemon   = [];

/**
 * Fetch a single Pokemon's data from PokeAPI
 */
async function fetchPokemon(idOrName) {
  try {
    const res = await fetch(`${POKE_API_BASE}/pokemon/${idOrName}`);
    if (!res.ok) throw new Error(`Pokemon not found: ${idOrName}`);
    return await res.json();
  } catch (err) {
    console.warn('[PokeAPI] Fetch failed:', err);
    return null;
  }
}

/**
 * Build a Pokemon card DOM element
 */
function buildPokemonCard(pokemon) {
  const id      = pokemon.id;
  const name    = pokemon.name;
  const types   = pokemon.types.map(t => t.type.name);
  const rarity  = getRarity(id);
  const price   = getPriceByRarity(rarity);
  const imgUrl  = pokemon.sprites?.other?.['official-artwork']?.front_default
               || pokemon.sprites?.front_default
               || '';

  const card = document.createElement('div');
  card.className   = 'pokemon-card reveal';
  card.dataset.types = types.join(',');
  card.setAttribute('role', 'listitem');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `${name} - ${rarity}`);

  card.innerHTML = `
    <span class="card-rarity rarity-${rarity}">${rarity}</span>
    <img class="card-img"
         src="${imgUrl}"
         alt="${name} Pokémon artwork"
         loading="lazy"
         onerror="this.src='/assets/fallback-pokemon.png'" />
    <span class="card-number">#${String(id).padStart(3, '0')}</span>
    <span class="card-name">${name}</span>
    <div class="card-types">
      ${types.map(t => `<span class="type-badge type-${t}">${t}</span>`).join('')}
    </div>
    <span class="card-price">${price} POKÉ</span>
  `;

  // Click / keyboard navigation
  const openCard = () => {
    authUtils.showToast(`${name.charAt(0).toUpperCase() + name.slice(1)} — Marketplace coming in Q2 2026!`, 'info');
  };
  card.addEventListener('click', openCard);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCard(); }
  });

  return card;
}

/**
 * Fetch and render the showcase grid with featured Pokemon IDs
 */
async function loadShowcaseCards() {
  const grid = document.getElementById('cardsGrid');
  if (!grid) return;

  // Featured Pokemon — a diverse, visually interesting set
  const featuredIds = [
    6, 9, 3, 25, 39, 52, 65, 94, 129, 130, 131, 132,
    133, 137, 143, 144, 145, 146, 149, 150, 151,
    196, 197, 245, 248, 249, 250, 282, 384, 448,
  ];

  // Show skeletons
  grid.innerHTML = Array(Math.min(CARDS_PER_PAGE, featuredIds.length))
    .fill('<div class="card-skeleton" aria-hidden="true"></div>')
    .join('');

  try {
    // Fetch in parallel batches of 6
    const batch     = featuredIds.slice(0, CARDS_PER_PAGE);
    const promises  = batch.map(id => fetchPokemon(id));
    const pokemons  = (await Promise.all(promises)).filter(Boolean);

    allLoadedPokemon = pokemons;
    renderCards(pokemons, grid);

    // Initialize scroll reveal for newly added cards
    initScrollReveal();
  } catch (err) {
    console.error('[Showcase] Error loading cards:', err);
    grid.innerHTML = `<p style="color:var(--text-secondary); text-align:center; grid-column: 1/-1;">
      Failed to load Pokémon. Check your connection.
    </p>`;
  }
}

/**
 * Render card array into a grid
 */
function renderCards(pokemons, grid) {
  grid.innerHTML = '';

  if (!pokemons.length) {
    grid.innerHTML = `<p style="color:var(--text-secondary); text-align:center; grid-column:1/-1; padding: 40px 0;">
      No Pokémon found for this type. Try another filter!
    </p>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  pokemons.forEach(p => fragment.appendChild(buildPokemonCard(p)));
  grid.appendChild(fragment);

  // After DOM insertion, trigger reveal
  requestAnimationFrame(() => {
    grid.querySelectorAll('.pokemon-card.reveal').forEach((el, i) => {
      setTimeout(() => el.classList.add('visible'), i * 60);
    });
  });
}

/**
 * Type filter logic
 */
function initTypeFilters() {
  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      currentFilter = btn.dataset.type;
      const grid    = document.getElementById('cardsGrid');

      if (currentFilter === 'all') {
        renderCards(allLoadedPokemon, grid);
      } else {
        const filtered = allLoadedPokemon.filter(p =>
          p.types.some(t => t.type.name === currentFilter)
        );
        renderCards(filtered, grid);
      }

      // Scroll to top of showcase
      document.getElementById('showcase')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

/**
 * Load More button — fetches next batch of random Pokemon
 */
async function initLoadMore() {
  const btn  = document.getElementById('loadMoreBtn');
  const grid = document.getElementById('cardsGrid');
  if (!btn || !grid) return;

  btn.addEventListener('click', async () => {
    btn.disabled    = true;
    btn.textContent = 'Loading...';

    try {
      // Fetch 6 more random Pokemon (IDs 1–898)
      const newIds = Array.from({ length: 6 }, () =>
        Math.floor(Math.random() * 898) + 1
      );
      const newPokemon = (await Promise.all(newIds.map(id => fetchPokemon(id)))).filter(Boolean);
      allLoadedPokemon = [...allLoadedPokemon, ...newPokemon];

      // If filter active, only show matching
      const toAdd = currentFilter === 'all'
        ? newPokemon
        : newPokemon.filter(p => p.types.some(t => t.type.name === currentFilter));

      const fragment = document.createDocumentFragment();
      toAdd.forEach(p => fragment.appendChild(buildPokemonCard(p)));
      grid.appendChild(fragment);

      // Animate new cards
      requestAnimationFrame(() => {
        grid.querySelectorAll('.pokemon-card:not(.visible)').forEach((el, i) => {
          setTimeout(() => el.classList.add('visible'), i * 80);
        });
      });

    } catch (err) {
      authUtils.showToast('Failed to load more Pokémon.', 'error');
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Load More Pokémon';
    }
  });
}

/* ============================================================
   7. ACTIVE NAV LINK ON SCROLL
   ============================================================ */

function initActiveNav() {
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-link');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        navLinks.forEach(l => l.classList.remove('active'));
        const active = document.querySelector(`.nav-link[href="#${entry.target.id}"]`);
        active?.classList.add('active');
      }
    });
  }, { threshold: 0.4 });

  sections.forEach(s => observer.observe(s));
}

/* ============================================================
   8. INIT
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initParticles();
  initCounters();
  initScrollReveal();
  initTypeFilters();
  initActiveNav();
  loadShowcaseCards().then(() => {
    initLoadMore();
  });
});
