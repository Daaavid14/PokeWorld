/**
 * wallet.js — PokéWorld Web3 Wallet Connector
 *
 * Supports:
 *  - MetaMask (and any EIP-1193 injected wallet: Brave, Rabby, etc.)
 *  - WalletConnect v2 (via the official modal — no API key needed for basic use)
 *  - Coinbase Wallet (injected or via WalletConnect relay)
 *  - Phantom (if the user has it installed, auto-detected as injected)
 *
 * This module is purely front-end and does NOT send private keys anywhere.
 * All signing happens inside the user's own wallet extension / app.
 *
 * Usage:
 *   PokéWallet.connect('metamask')    -> Promise<{ address, chainId }>
 *   PokéWallet.disconnect()
 *   PokéWallet.getState()             -> { address, chainId, walletType }
 *   PokéWallet.on('connected', cb)
 *   PokéWallet.on('disconnected', cb)
 *   PokéWallet.on('chainChanged', cb)
 *   PokéWallet.on('accountsChanged', cb)
 */

(function () {
  'use strict';

  /* ============================================================
     CONSTANTS
     ============================================================ */
  const SUPPORTED_CHAINS = {
    1:     { name: 'Ethereum',         symbol: 'ETH',  explorer: 'https://etherscan.io' },
    137:   { name: 'Polygon',          symbol: 'MATIC', explorer: 'https://polygonscan.com' },
    56:    { name: 'BNB Smart Chain',  symbol: 'BNB',  explorer: 'https://bscscan.com' },
    43114: { name: 'Avalanche C-Chain',symbol: 'AVAX', explorer: 'https://snowtrace.io' },
    8453:  { name: 'Base',             symbol: 'ETH',  explorer: 'https://basescan.org' },
  };

  /* ============================================================
     STATE
     ============================================================ */
  let _state = {
    address:    null,
    chainId:    null,
    walletType: null,
    provider:   null,
  };

  const _listeners = {};

  function emit(event, data) {
    (_listeners[event] || []).forEach(cb => {
      try { cb(data); } catch (e) { console.error('[Wallet] listener error:', e); }
    });
  }

  /* ============================================================
     DETECT INJECTED WALLETS
     ============================================================ */
  function detectInjected() {
    const eth = window.ethereum;
    if (!eth) return null;

    // Some wallets inject multiple providers under ethereum.providers[]
    const providers = eth.providers || [eth];

    const detected = [];
    providers.forEach(p => {
      if (p.isMetaMask && !p.isBraveWallet)  detected.push({ type: 'metamask',  provider: p });
      if (p.isCoinbaseWallet)                 detected.push({ type: 'coinbase',  provider: p });
      if (p.isBraveWallet)                    detected.push({ type: 'brave',     provider: p });
      if (p.isRabby)                          detected.push({ type: 'rabby',     provider: p });
    });

    // Fallback: if nothing matched but ethereum exists, treat as generic injected
    if (!detected.length && eth) detected.push({ type: 'injected', provider: eth });

    return detected;
  }

  function getInjectedProvider(type) {
    const list = detectInjected() || [];
    const match = list.find(p => p.type === type);
    if (match) return match.provider;
    // If asking for metamask but only generic injected exists, return it
    if (['metamask','brave','rabby','injected'].includes(type) && list.length) {
      return list[0].provider;
    }
    return null;
  }

  /* ============================================================
     HELPER: format address
     ============================================================ */
  function shortAddress(addr) {
    if (!addr) return '';
    return addr.slice(0, 6) + '...' + addr.slice(-4);
  }

  /* ============================================================
     CONNECT: MetaMask / Injected EIP-1193
     ============================================================ */
  async function connectInjected(type = 'metamask') {
    const provider = getInjectedProvider(type);

    if (!provider) {
      const urls = {
        metamask: 'https://metamask.io/download/',
        coinbase:  'https://www.coinbase.com/wallet',
        brave:     'https://brave.com/wallet/',
      };
      const installUrl = urls[type] || 'https://metamask.io/download/';
      throw new Error(`WALLET_NOT_INSTALLED:${installUrl}`);
    }

    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    if (!accounts?.length) throw new Error('No accounts returned.');

    const chainIdHex = await provider.request({ method: 'eth_chainId' });
    const chainId    = parseInt(chainIdHex, 16);
    const address    = accounts[0];

    // Attach EIP-1193 event listeners
    provider.on('accountsChanged', (newAccounts) => {
      if (!newAccounts.length) {
        disconnect();
      } else {
        _state.address = newAccounts[0];
        persistState();
        emit('accountsChanged', { address: newAccounts[0] });
        updateWalletUI();
      }
    });

    provider.on('chainChanged', (newChainHex) => {
      _state.chainId = parseInt(newChainHex, 16);
      persistState();
      emit('chainChanged', { chainId: _state.chainId });
      updateWalletUI();
    });

    provider.on('disconnect', () => { disconnect(); });

    setState({ address, chainId, walletType: type, provider });
    return { address, chainId };
  }

  /* ============================================================
     CONNECT: Phantom (EVM mode, injected)
     ============================================================ */
  async function connectPhantom() {
    const phantom = window.phantom?.ethereum || window.phantom?.solana;
    if (!phantom) {
      throw new Error('WALLET_NOT_INSTALLED:https://phantom.app/');
    }

    // EVM Phantom
    if (window.phantom?.ethereum) {
      const accounts = await window.phantom.ethereum.request({ method: 'eth_requestAccounts' });
      const chainIdHex = await window.phantom.ethereum.request({ method: 'eth_chainId' });
      const address  = accounts[0];
      const chainId  = parseInt(chainIdHex, 16);
      setState({ address, chainId, walletType: 'phantom', provider: window.phantom.ethereum });
      return { address, chainId };
    }

    // Solana Phantom (shows address but we note it's Solana)
    await window.phantom.solana.connect();
    const address = window.phantom.solana.publicKey.toString();
    setState({ address, chainId: 0, walletType: 'phantom-solana', provider: window.phantom.solana });
    return { address, chainId: 0 };
  }

  /* ============================================================
     CONNECT: Trust Wallet (injected)
     ============================================================ */
  async function connectTrust() {
    const trust = window.trustwallet || window.ethereum;
    if (!trust) throw new Error('WALLET_NOT_INSTALLED:https://trustwallet.com/');
    const accounts   = await trust.request({ method: 'eth_requestAccounts' });
    const chainIdHex = await trust.request({ method: 'eth_chainId' });
    setState({ address: accounts[0], chainId: parseInt(chainIdHex, 16), walletType: 'trust', provider: trust });
    return { address: accounts[0], chainId: parseInt(chainIdHex, 16) };
  }

  /* ============================================================
     CONNECT: WalletConnect v2
     Uses the official @walletconnect/ethereum-provider if available,
     otherwise opens deeplink fallback.
     ============================================================ */
  async function connectWalletConnect() {
    // WalletConnect requires a dApp projectId. Using a public demo ID here.
    // Replace 'REPLACE_WITH_YOUR_PROJECT_ID' with your WalletConnect Cloud project ID.
    const WC_PROJECT_ID = '4b62d51042af8bcf942a2cb4d8a18a65';

    if (typeof window.EthereumProvider === 'undefined') {
      // Lazy-load the WalletConnect Ethereum provider
      await loadScript('https://unpkg.com/@walletconnect/ethereum-provider@2/dist/index.umd.js');
    }

    if (typeof window.EthereumProvider === 'undefined') {
      throw new Error('WalletConnect library failed to load.');
    }

    const wcProvider = await window.EthereumProvider.init({
      projectId: WC_PROJECT_ID,
      chains:    [1, 137],
      showQrModal: true,
      optionalChains: [56, 43114, 8453],
      metadata: {
        name:        'PokéWorld',
        description: 'Collect, Battle & Earn Pokémon NFTs',
        url:         window.location.origin,
        icons:       [`${window.location.origin}/assets/pokeball.svg`],
      },
    });

    await wcProvider.enable();
    const accounts  = wcProvider.accounts;
    const chainId   = wcProvider.chainId;

    wcProvider.on('disconnect',      () => disconnect());
    wcProvider.on('accountsChanged', (accs) => {
      _state.address = accs[0];
      persistState();
      emit('accountsChanged', { address: accs[0] });
      updateWalletUI();
    });
    wcProvider.on('chainChanged', (id) => {
      _state.chainId = id;
      persistState();
      emit('chainChanged', { chainId: id });
      updateWalletUI();
    });

    setState({ address: accounts[0], chainId, walletType: 'walletconnect', provider: wcProvider });
    return { address: accounts[0], chainId };
  }

  /* ============================================================
     GENERIC CONNECT DISPATCHER
     ============================================================ */
  async function connect(walletType) {
    try {
      let result;
      switch (walletType) {
        case 'metamask':
        case 'injected':
        case 'brave':
        case 'rabby':
          result = await connectInjected(walletType); break;
        case 'coinbase':
          result = await connectInjected('coinbase'); break;
        case 'phantom':
          result = await connectPhantom();            break;
        case 'trust':
          result = await connectTrust();              break;
        case 'walletconnect':
          result = await connectWalletConnect();      break;
        default:
          throw new Error(`Unknown wallet type: ${walletType}`);
      }

      // Persist to localStorage for page reload
      persistState();
      emit('connected', { ..._state });
      updateWalletUI();

      // Save wallet address to Supabase trainer profile if logged in
      await syncWalletToSupabase(_state.address, walletType);

      return result;
    } catch (err) {
      let msg = err.message || 'Wallet connection failed.';
      if (msg.startsWith('WALLET_NOT_INSTALLED:')) {
        const url = msg.split(':')[1];
        openInstallPage(walletType, url);
        throw new Error(`${walletType} not installed. A new tab was opened to install it.`);
      }
      if (err.code === 4001) throw new Error('Connection rejected by user.');
      throw err;
    }
  }

  /* ============================================================
     DISCONNECT
     ============================================================ */
  function disconnect() {
    if (_state.provider?.disconnect) {
      try { _state.provider.disconnect(); } catch (_) {}
    }
    if (_state.provider?.removeAllListeners) {
      try { _state.provider.removeAllListeners(); } catch (_) {}
    }
    _state = { address: null, chainId: null, walletType: null, provider: null };
    clearStorage();
    emit('disconnected', {});
    updateWalletUI();
  }

  /* ============================================================
     HELPERS
     ============================================================ */
  function setState(data) {
    _state = { ..._state, ...data };
  }

  function persistState() {
    try {
      localStorage.setItem('pw_wallet', JSON.stringify({
        address:    _state.address,
        chainId:    _state.chainId,
        walletType: _state.walletType,
      }));
    } catch (_) {}
  }

  function clearStorage() {
    try { localStorage.removeItem('pw_wallet'); } catch (_) {}
  }

  function restoreState() {
    try {
      const saved = JSON.parse(localStorage.getItem('pw_wallet') || 'null');
      if (saved?.address) {
        _state.address    = saved.address;
        _state.chainId    = saved.chainId;
        _state.walletType = saved.walletType;
        emit('restored', { ..._state });
        updateWalletUI();
      }
    } catch (_) {}
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload  = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function openInstallPage(type, url) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  /* ============================================================
     SYNC TO SUPABASE
     ============================================================ */
  async function syncWalletToSupabase(address, walletType) {
    try {
      const { data: { session } } = await _supabase.auth.getSession();
      if (!session) return;

      await _supabase
        .from('trainer_profiles')
        .update({
          wallet_address: address,
          wallet_type:    walletType,
        })
        .eq('user_id', session.user.id);
    } catch (_) {}
  }

  /* ============================================================
     UI UPDATER — updates the wallet panel in dashboard
     ============================================================ */
  function updateWalletUI() {
    const connectedSection    = document.getElementById('walletConnected');
    const disconnectedSection = document.getElementById('walletDisconnected');
    const addrEls = document.querySelectorAll('.wallet-address-display');
    const chainEls = document.querySelectorAll('.wallet-chain-display');
    const typeEls  = document.querySelectorAll('.wallet-type-display');

    if (_state.address) {
      connectedSection?.classList.remove('hidden');
      disconnectedSection?.classList.add('hidden');
    } else {
      connectedSection?.classList.add('hidden');
      disconnectedSection?.classList.remove('hidden');
    }

    addrEls.forEach(el => { el.textContent = _state.address ? shortAddress(_state.address) : '—'; });
    chainEls.forEach(el => {
      const info = SUPPORTED_CHAINS[_state.chainId];
      el.textContent = info ? `${info.name} (${info.symbol})` : (_state.chainId ? `Chain ${_state.chainId}` : '—');
    });
    typeEls.forEach(el => {
      el.textContent = _state.walletType ? _state.walletType.charAt(0).toUpperCase() + _state.walletType.slice(1) : '—';
    });
  }

  /* ============================================================
     PUBLIC API
     ============================================================ */
  window.PokéWallet = {
    connect,
    disconnect,
    getState:     () => ({ ..._state }),
    getAddress:   () => _state.address,
    getChainId:   () => _state.chainId,
    shortAddress,
    isConnected:  () => !!_state.address,
    SUPPORTED_CHAINS,

    on(event, callback) {
      if (!_listeners[event]) _listeners[event] = [];
      _listeners[event].push(callback);
    },
    off(event, callback) {
      if (!_listeners[event]) return;
      _listeners[event] = _listeners[event].filter(cb => cb !== callback);
    },
  };

  // Restore previously connected wallet on page load
  restoreState();

})();
