/**
 * blockchain.js — PokéWorld On-Chain Interface
 *
 * Wraps all ethers.js interactions with the deployed Sepolia contracts.
 * Exposed as window.PokéChain
 *
 * Requires:
 *  - ethers v6 loaded before this script
 *  - window.CHAIN_CONFIG (from config.js)
 *  - window.PokéWallet   (from wallet.js)
 *
 * Contract interaction model:
 *  - READ calls  → use a static JsonRpcProvider (no wallet needed)
 *  - WRITE calls → use the connected wallet's provider (MetaMask etc.)
 *
 * Mint flow (admin-side):
 *  Since the deployer wallet is the minter, minting is handled by a
 *  Supabase Edge Function that signs & sends the mint tx server-side.
 *  The frontend just records intent in Supabase and polls for completion.
 *
 * For the demo / testnet phase, the frontend calls the contract directly
 * using the connected wallet IF that wallet is the minter (deployer).
 * For production, swap `_mintViaWallet` for `_mintViaEdgeFunction`.
 */

(function () {
  'use strict';

  /* ============================================================
     MINIMAL ABIs (only functions we call from the frontend)
     ============================================================ */
  const NFT_ABI = [
    'function mint(address to, string calldata species, uint8 stage, uint8 level, string calldata metadataURI) external returns (uint256)',
    'function getOwnedTokens(address owner) external view returns (uint256[])',
    'function getPokemonData(uint256 tokenId) external view returns (tuple(string species, uint8 stage, uint8 level, uint16 experience, string metadataURI))',
    'function approve(address to, uint256 tokenId) external',
    'function setApprovalForAll(address operator, bool approved) external',
    'function isApprovedForAll(address owner, address operator) external view returns (bool)',
    'function totalSupply() external view returns (uint256)',
    'function isMinter(address account) external view returns (bool)',
    'event Minted(address indexed to, uint256 indexed tokenId, string species, uint8 stage)',
  ];

  const TOKEN_ABI = [
    'function balanceOf(address account) external view returns (uint256)',
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function allowance(address owner, address spender) external view returns (uint256)',
    'function transfer(address to, uint256 amount) external returns (bool)',
    'function transferFrom(address from, address to, uint256 amount) external returns (bool)',
    'function mint(address to, uint256 amount) external',
    'function isMinter(address account) external view returns (bool)',
  ];

  const MARKETPLACE_ABI = [
    'function listNFT(uint256 tokenId, uint256 price) external returns (uint256)',
    'function buyNFT(uint256 listingId) external',
    'function cancelListing(uint256 listingId) external',
    'function getListing(uint256 listingId) external view returns (tuple(uint256 listingId, address seller, uint256 tokenId, uint256 price, uint8 status, uint64 listedAt))',
    'function totalListings() external view returns (uint256)',
    'function isListed(uint256 tokenId) external view returns (bool, uint256)',
    'event Listed(uint256 indexed listingId, address indexed seller, uint256 indexed tokenId, uint256 price)',
    'event Sold(uint256 indexed listingId, address indexed buyer, uint256 indexed tokenId, uint256 price, uint256 fee)',
    'event Cancelled(uint256 indexed listingId, address indexed seller, uint256 indexed tokenId)',
  ];

  /* ============================================================
     ALL 20 BASE POKEMON AVAILABLE IN THE SHOP
     ============================================================ */
  const SHOP_POKEMON = [
    { species: 'Bulbasaur',  type: 'grass',    rarity: 'common'   },
    { species: 'Charmander', type: 'fire',     rarity: 'common'   },
    { species: 'Squirtle',   type: 'water',    rarity: 'common'   },
    { species: 'Pichu',      type: 'electric', rarity: 'common'   },
    { species: 'Pidgey',     type: 'normal',   rarity: 'common'   },
    { species: 'Weedle',     type: 'bug',      rarity: 'common'   },
    { species: 'Caterpie',   type: 'bug',      rarity: 'common'   },
    { species: 'Machop',     type: 'fighting', rarity: 'uncommon' },
    { species: 'Horsea',     type: 'water',    rarity: 'uncommon' },
    { species: 'Ghastly',    type: 'ghost',    rarity: 'uncommon' },
    { species: 'Elekid',     type: 'electric', rarity: 'uncommon' },
    { species: 'Magby',      type: 'fire',     rarity: 'uncommon' },
    { species: 'Eevee',      type: 'normal',   rarity: 'uncommon' },
    { species: 'Swinub',     type: 'ice',      rarity: 'uncommon' },
    { species: 'Whismur',    type: 'normal',   rarity: 'uncommon' },
    { species: 'Cyndaquil',  type: 'fire',     rarity: 'rare'     },
    { species: 'Totodile',   type: 'water',    rarity: 'rare'     },
    { species: 'Torchic',    type: 'fire',     rarity: 'rare'     },
    { species: 'Dratini',    type: 'dragon',   rarity: 'rare'     },
    { species: 'Larvitar',   type: 'rock',     rarity: 'rare'     },
  ];

  const MINT_PRICE = 100; // POKÉ per base NFT
  const PACK_PRICE = 250; // POKÉ for a random pack (3 random base Pokémon)

  /* ============================================================
     PROVIDER HELPERS
     ============================================================ */
  function _readProvider() {
    return new ethers.JsonRpcProvider(window.CHAIN_CONFIG.rpcUrl);
  }

  function _writeProvider() {
    const walletState = window.PokéWallet?.getState?.();
    if (!walletState?.provider) throw new Error('No wallet connected');
    return new ethers.BrowserProvider(walletState.provider);
  }

  function _nftRead()  { return new ethers.Contract(window.CHAIN_CONFIG.contracts.PokeWorldNFT,    NFT_ABI,         _readProvider()); }
  function _tokenRead(){ return new ethers.Contract(window.CHAIN_CONFIG.contracts.PokeToken,       TOKEN_ABI,       _readProvider()); }
  function _mktRead()  { return new ethers.Contract(window.CHAIN_CONFIG.contracts.PokeMarketplace, MARKETPLACE_ABI, _readProvider()); }

  async function _nftWrite()   { const p = _writeProvider(); const s = await p.getSigner(); return new ethers.Contract(window.CHAIN_CONFIG.contracts.PokeWorldNFT,    NFT_ABI,         s); }
  async function _tokenWrite() { const p = _writeProvider(); const s = await p.getSigner(); return new ethers.Contract(window.CHAIN_CONFIG.contracts.PokeToken,       TOKEN_ABI,       s); }
  async function _mktWrite()   { const p = _writeProvider(); const s = await p.getSigner(); return new ethers.Contract(window.CHAIN_CONFIG.contracts.PokeMarketplace, MARKETPLACE_ABI, s); }

  /* ============================================================
     NETWORK GUARD — ensure user is on Sepolia before any tx
     ============================================================ */
  async function ensureSepolia() {
    const walletState = window.PokéWallet?.getState?.();
    if (!walletState?.address) throw new Error('Connect your wallet first.');
    if (walletState.chainId !== window.CHAIN_CONFIG.chainId) {
      // Request Sepolia switch
      try {
        await walletState.provider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x' + window.CHAIN_CONFIG.chainId.toString(16) }],
        });
      } catch (switchErr) {
        if (switchErr.code === 4902) {
          await walletState.provider.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0x' + window.CHAIN_CONFIG.chainId.toString(16),
              chainName: window.CHAIN_CONFIG.chainName,
              rpcUrls: [window.CHAIN_CONFIG.rpcUrl],
              nativeCurrency: window.CHAIN_CONFIG.nativeCurrency,
              blockExplorerUrls: [window.CHAIN_CONFIG.blockExplorer],
            }],
          });
        } else {
          throw new Error('Please switch to Sepolia Testnet in your wallet.');
        }
      }
    }
  }

  /* ============================================================
     TOKEN BALANCE
     ============================================================ */
  async function getPokeBalance(address) {
    try {
      const token = _tokenRead();
      const raw = await token.balanceOf(address);
      return Number(ethers.formatUnits(raw, 18));
    } catch {
      return 0;
    }
  }

  /* ============================================================
     CHECK IF CONNECTED WALLET IS THE MINTER (deployer)
     ============================================================ */
  async function isConnectedWalletMinter() {
    try {
      const walletState = window.PokéWallet?.getState?.();
      if (!walletState?.address) return false;
      const nft = _nftRead();
      return await nft.isMinter(walletState.address);
    } catch {
      return false;
    }
  }

  /* ============================================================
     MINT A BASE POKEMON (called from the shop)
     The connected wallet must be the minter (deployer wallet).
     In production this would be a server-side Edge Function call.
     ============================================================ */
  async function mintPokemon({ toAddress, species, metadataURI }) {
    await ensureSepolia();

    const nft = await _nftWrite();
    const uri = metadataURI || `https://raw.githubusercontent.com/PokeWorld/metadata/main/baseForm/${species}.json`;

    const tx = await nft.mint(toAddress, species, 0, 1, uri);
    const receipt = await tx.wait();

    // Parse Minted event to get tokenId
    const mintedEvent = receipt.logs
      .map(log => { try { return nft.interface.parseLog(log); } catch { return null; } })
      .find(e => e?.name === 'Minted');

    const tokenId = mintedEvent ? Number(mintedEvent.args.tokenId) : null;
    return { txHash: receipt.hash, tokenId };
  }

  /* ============================================================
     MINT POKEMON VIA POKÉ TOKEN PAYMENT
     Flow:
       1. Check user has enough POKÉ
       2. Transfer POKÉ from user to deployer (payment)
       3. Deployer (connected wallet) mints NFT to user
     This requires the deployer wallet to be connected for step 3.
     ============================================================ */
  async function buyFromShop({ buyerAddress, species }) {
    await ensureSepolia();

    const priceWei = ethers.parseUnits(String(MINT_PRICE), 18);
    const token = await _tokenWrite();

    // Check balance
    const balance = await _tokenRead().balanceOf(buyerAddress);
    if (balance < priceWei) {
      throw new Error(`Insufficient POKÉ balance. Need ${MINT_PRICE} POKÉ.`);
    }

    // Step 1: transfer POKÉ as payment (buyer → fee recipient = CHAIN_CONFIG owner)
    // For testnet: just burn it (transfer to zero-like address or deployer)
    // This tx is signed by the buyer's wallet
    const feeAddr = '0x4F249a7B92d3Ada886c23db015174c6BAe9a88B2'; // deployer/treasury
    const payTx = await token.transfer(feeAddr, priceWei);
    await payTx.wait();

    // Step 2: mint NFT to buyer (requires minter wallet — deployer in testnet)
    // In testnet the deployer wallet must be connected.
    // In production this step is a server-side call.
    const isMinter = await isConnectedWalletMinter();
    if (!isMinter) {
      throw new Error(
        'Payment received, but minting requires the admin wallet. ' +
        'Please connect the deployer wallet to complete the mint, or wait for the server to process it.'
      );
    }

    return await mintPokemon({
      toAddress: buyerAddress,
      species,
      metadataURI: `/metadata/baseForm/${species}.json`,
    });
  }

  /* ============================================================
     BUY A RANDOM PACK (3 random base Pokémon)
     ============================================================ */
  async function buyRandomPack(buyerAddress) {
    await ensureSepolia();

    const packPriceWei = ethers.parseUnits(String(PACK_PRICE), 18);
    const token = await _tokenWrite();

    const balance = await _tokenRead().balanceOf(buyerAddress);
    if (balance < packPriceWei) {
      throw new Error(`Insufficient POKÉ balance. Need ${PACK_PRICE} POKÉ for a pack.`);
    }

    // Transfer payment
    const feeAddr = '0x4F249a7B92d3Ada886c23db015174c6BAe9a88B2';
    const payTx = await token.transfer(feeAddr, packPriceWei);
    await payTx.wait();

    // Pick 3 random unique species
    const shuffled = [...SHOP_POKEMON].sort(() => Math.random() - 0.5);
    const picks = shuffled.slice(0, 3);

    const isMinter = await isConnectedWalletMinter();
    if (!isMinter) {
      throw new Error(
        'Pack paid! Waiting for admin wallet to mint. Reconnect with deployer wallet to complete.'
      );
    }

    const results = [];
    for (const pick of picks) {
      const result = await mintPokemon({
        toAddress: buyerAddress,
        species: pick.species,
        metadataURI: `/metadata/baseForm/${pick.species}.json`,
      });
      results.push({ ...pick, ...result });
    }
    return results;
  }

  /* ============================================================
     FETCH ON-CHAIN LISTINGS
     ============================================================ */
  async function fetchListings() {
    try {
      const mkt = _mktRead();
      const nft = _nftRead();
      const total = Number(await mkt.totalListings());
      const listings = [];

      for (let i = 1; i <= total; i++) {
        try {
          const lst = await mkt.getListing(i);
          if (lst.status !== 0n) continue; // only Active (0)

          const pkData = await nft.getPokemonData(lst.tokenId);
          listings.push({
            listingId:  Number(lst.listingId),
            seller:     lst.seller,
            tokenId:    Number(lst.tokenId),
            price:      Number(ethers.formatUnits(lst.price, 18)),
            species:    pkData.species,
            stage:      pkData.stage,
            level:      pkData.level,
            experience: pkData.experience,
            listedAt:   Number(lst.listedAt),
          });
        } catch { /* skip bad listing */ }
      }
      return listings;
    } catch (err) {
      console.error('[Blockchain] fetchListings error:', err);
      return [];
    }
  }

  /* ============================================================
     LIST AN NFT ON THE MARKETPLACE (sell flow)
     ============================================================ */
  async function listNFT(tokenId, pricePoké) {
    await ensureSepolia();

    const walletState = window.PokéWallet?.getState?.();
    const priceWei = ethers.parseUnits(String(pricePoké), 18);

    // Step 1: approve marketplace to transfer the NFT
    const nft = await _nftWrite();
    const mktAddr = window.CHAIN_CONFIG.contracts.PokeMarketplace;

    const approveTx = await nft.approve(mktAddr, tokenId);
    await approveTx.wait();

    // Step 2: list
    const mkt = await _mktWrite();
    const tx = await mkt.listNFT(tokenId, priceWei);
    const receipt = await tx.wait();

    // Parse Listed event
    const listedEvent = receipt.logs
      .map(log => { try { return mkt.interface.parseLog(log); } catch { return null; } })
      .find(e => e?.name === 'Listed');

    return {
      txHash:    receipt.hash,
      listingId: listedEvent ? Number(listedEvent.args.listingId) : null,
    };
  }

  /* ============================================================
     BUY A LISTED NFT
     ============================================================ */
  async function buyListing(listingId, pricePoké) {
    await ensureSepolia();

    const priceWei = ethers.parseUnits(String(pricePoké), 18);
    const mktAddr  = window.CHAIN_CONFIG.contracts.PokeMarketplace;

    // Step 1: approve POKÉ spend
    const token = await _tokenWrite();
    const approveTx = await token.approve(mktAddr, priceWei);
    await approveTx.wait();

    // Step 2: buy
    const mkt = await _mktWrite();
    const tx = await mkt.buyNFT(listingId);
    const receipt = await tx.wait();

    return { txHash: receipt.hash };
  }

  /* ============================================================
     CANCEL A LISTING
     ============================================================ */
  async function cancelListing(listingId) {
    await ensureSepolia();

    const mkt = await _mktWrite();
    const tx = await mkt.cancelListing(listingId);
    const receipt = await tx.wait();
    return { txHash: receipt.hash };
  }

  /* ============================================================
     GET ON-CHAIN TOKENS OWNED BY AN ADDRESS
     ============================================================ */
  async function getOwnedTokens(address) {
    try {
      const nft = _nftRead();
      const tokenIds = await nft.getOwnedTokens(address);
      const tokens = [];
      for (const id of tokenIds) {
        const data = await nft.getPokemonData(id);
        tokens.push({
          tokenId:    Number(id),
          species:    data.species,
          stage:      Number(data.stage),
          level:      Number(data.level),
          experience: Number(data.experience),
        });
      }
      return tokens;
    } catch {
      return [];
    }
  }

  /* ============================================================
     PUBLIC API
     ============================================================ */
  window.PokéChain = {
    SHOP_POKEMON,
    MINT_PRICE,
    PACK_PRICE,
    getPokeBalance,
    isConnectedWalletMinter,
    mintPokemon,
    buyFromShop,
    buyRandomPack,
    fetchListings,
    listNFT,
    buyListing,
    cancelListing,
    getOwnedTokens,
    ensureSepolia,
  };

})();
