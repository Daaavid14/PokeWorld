// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title PokeEvolution
 * @notice Manages the complete 3-stage evolution system for all 20 PokéWorld chains.
 *
 * Evolution Rules:
 *   • A trainer must own the NFT (via PokeWorldNFT).
 *   • The NFT's current level must be >= the required evolution level.
 *   • Evolution burns a small POKÉ fee (evolutionFee) to prevent spam.
 *   • After evolution the NFT species, stage, level, and metadataURI are updated.
 *
 * All 20 chains (60 Pokémon) are registered in the constructor:
 *   Base Form  → Second Form  → Third Form
 *   ──────────────────────────────────────
 *   Bulbasaur  → Ivysaur      → Venasaur
 *   Caterpie   → Metapod      → Butterfree
 *   Charmander → Charmeleon   → Charizard
 *   Cyndaquil  → Quilava      → Typhlosion
 *   Dratini    → Dragonair    → Dragonite
 *   Eevee      → Flareon      → Jolteon
 *   Elekid     → Electabuzz   → Electivire
 *   Ghastly    → Haunter      → Gengar
 *   Horsea     → Seadra       → Kingdra
 *   Larvitar   → Pupitar      → Tyranitar
 *   Machop     → Machoke      → Machamp
 *   Magby      → Magmar       → Magmortar
 *   Pichu      → Pikachu      → Raichu
 *   Pidgey     → Pidgeotto    → Pidgeot
 *   Squirtle   → Wartortle    → Blastoise
 *   Swinub     → Piloswine    → Mamoswine
 *   Torchic    → Combusken    → Blaziken
 *   Totodile   → Croconaw     → Feraligatr
 *   Weedle     → Kakuna       → Beedrill
 *   Whismur    → Loudred      → Exploud
 */

interface IPokeWorldNFT {
    struct PokemonData {
        string  species;
        uint8   stage;
        uint8   level;
        uint16  experience;
        string  metadataURI;
    }
    function ownerOf(uint256 tokenId) external view returns (address);
    function getPokemonData(uint256 tokenId) external view returns (PokemonData memory);
    function evolve(uint256 tokenId, string calldata newSpecies, uint8 newStage, uint8 evolvedLevel, string calldata newMetadataURI) external;
    function addExperience(uint256 tokenId, uint16 xpAmount) external;
}

interface IPokeToken {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function burn(uint256 amount) external;
    function balanceOf(address account) external view returns (uint256);
}

contract PokeEvolution {

    /* ─────────────────────────────────────────────────────────
       DATA STRUCTURES
    ───────────────────────────────────────────────────────── */
    struct EvolutionStep {
        string  nextSpecies;      // Target species name after evolution
        uint8   requiredLevel;    // Minimum level to evolve
        uint8   nextStage;        // 1 = Second, 2 = Third
        string  nextMetadataBase; // IPFS CID prefix; full URI = base + ".json" built off-chain
    }

    /* ─────────────────────────────────────────────────────────
       STATE
    ───────────────────────────────────────────────────────── */
    address public owner;
    IPokeWorldNFT public nftContract;
    IPokeToken    public pokeToken;

    // species name (keccak256 hash) → evolution data
    mapping(bytes32 => EvolutionStep) public evolutionData;

    // POKÉ fee burned on each evolution (default: 10 POKÉ)
    uint256 public evolutionFee = 10 * 10 ** 18;

    // Base IPFS URI prefix applied when no specific URI is provided
    // e.g.  "ipfs://bafybeig..." — set by admin after pinning metadata
    string  public baseMetadataURI;

    /* ─────────────────────────────────────────────────────────
       EVENTS
    ───────────────────────────────────────────────────────── */
    event EvolutionPerformed(
        address indexed trainer,
        uint256 indexed tokenId,
        string  fromSpecies,
        string  toSpecies,
        uint8   newStage
    );
    event EvolutionRegistered(string fromSpecies, string toSpecies, uint8 requiredLevel);
    event FeeUpdated(uint256 oldFee, uint256 newFee);

    /* ─────────────────────────────────────────────────────────
       MODIFIERS
    ───────────────────────────────────────────────────────── */
    modifier onlyOwner() {
        require(msg.sender == owner, "PokeEvolution: not owner");
        _;
    }

    /* ─────────────────────────────────────────────────────────
       CONSTRUCTOR — registers all 20 chains
    ───────────────────────────────────────────────────────── */
    constructor(address _nftContract, address _pokeToken) {
        owner       = msg.sender;
        nftContract = IPokeWorldNFT(_nftContract);
        pokeToken   = IPokeToken(_pokeToken);

        // ── Chain 01: Bulbasaur ───────────────────────────────
        _register("Bulbasaur",   "Ivysaur",    15, 1, "");
        _register("Ivysaur",     "Venasaur",   30, 2, "");

        // ── Chain 02: Caterpie ────────────────────────────────
        _register("Caterpie",    "Metapod",    15, 1, "");
        _register("Metapod",     "Butterfree", 30, 2, "");

        // ── Chain 03: Charmander ──────────────────────────────
        _register("Charmander",  "Charmeleon", 15, 1, "");
        _register("Charmeleon",  "Charizard",  30, 2, "");

        // ── Chain 04: Cyndaquil ───────────────────────────────
        _register("Cyndaquil",   "Quilava",    15, 1, "");
        _register("Quilava",     "Typhlosion", 30, 2, "");

        // ── Chain 05: Dratini ─────────────────────────────────
        _register("Dratini",     "Dragonair",  15, 1, "");
        _register("Dragonair",   "Dragonite",  30, 2, "");

        // ── Chain 06: Eevee ───────────────────────────────────
        _register("Eevee",       "Flareon",    15, 1, "");
        _register("Flareon",     "Jolteon",    30, 2, "");

        // ── Chain 07: Elekid ──────────────────────────────────
        _register("Elekid",      "Electabuzz", 15, 1, "");
        _register("Electabuzz",  "Electivire", 30, 2, "");

        // ── Chain 08: Ghastly ─────────────────────────────────
        _register("Ghastly",     "Haunter",    15, 1, "");
        _register("Haunter",     "Gengar",     30, 2, "");

        // ── Chain 09: Horsea ──────────────────────────────────
        _register("Horsea",      "Seadra",     15, 1, "");
        _register("Seadra",      "Kingdra",    30, 2, "");

        // ── Chain 10: Larvitar ────────────────────────────────
        _register("Larvitar",    "Pupitar",    15, 1, "");
        _register("Pupitar",     "Tyranitar",  30, 2, "");

        // ── Chain 11: Machop ──────────────────────────────────
        _register("Machop",      "Machoke",    15, 1, "");
        _register("Machoke",     "Machamp",    30, 2, "");

        // ── Chain 12: Magby ───────────────────────────────────
        _register("Magby",       "Magmar",     15, 1, "");
        _register("Magmar",      "Magmortar",  30, 2, "");

        // ── Chain 13: Pichu ───────────────────────────────────
        _register("Pichu",       "Pikachu",    15, 1, "");
        _register("Pikachu",     "Raichu",     30, 2, "");

        // ── Chain 14: Pidgey ──────────────────────────────────
        _register("Pidgey",      "Pidgeotto",  15, 1, "");
        _register("Pidgeotto",   "Pidgeot",    30, 2, "");

        // ── Chain 15: Squirtle ────────────────────────────────
        _register("Squirtle",    "Wartortle",  15, 1, "");
        _register("Wartortle",   "Blastoise",  30, 2, "");

        // ── Chain 16: Swinub ──────────────────────────────────
        _register("Swinub",      "Piloswine",  15, 1, "");
        _register("Piloswine",   "Mamoswine",  30, 2, "");

        // ── Chain 17: Torchic ─────────────────────────────────
        _register("Torchic",     "Combusken",  15, 1, "");
        _register("Combusken",   "Blaziken",   30, 2, "");

        // ── Chain 18: Totodile ────────────────────────────────
        _register("Totodile",    "Croconaw",   15, 1, "");
        _register("Croconaw",    "Feraligatr", 30, 2, "");

        // ── Chain 19: Weedle ──────────────────────────────────
        _register("Weedle",      "Kakuna",     15, 1, "");
        _register("Kakuna",      "Beedrill",   30, 2, "");

        // ── Chain 20: Whismur ─────────────────────────────────
        _register("Whismur",     "Loudred",    15, 1, "");
        _register("Loudred",     "Exploud",    30, 2, "");
    }

    /* ─────────────────────────────────────────────────────────
       CORE: EVOLVE
    ───────────────────────────────────────────────────────── */
    /**
     * @notice Evolve a Pokémon NFT to its next form.
     * @param tokenId  The ERC-721 token to evolve.
     *
     * Requirements:
     *   - Caller must own the token.
     *   - Token's current level >= required evolution level.
     *   - Caller must have approved `evolutionFee` POKÉ to this contract.
     */
    function evolve(uint256 tokenId) external {
        // 1. Ownership check
        require(
            nftContract.ownerOf(tokenId) == msg.sender,
            "PokeEvolution: caller does not own this token"
        );

        // 2. Fetch current data
        IPokeWorldNFT.PokemonData memory pd = nftContract.getPokemonData(tokenId);

        // 3. Look up evolution step
        bytes32 key = keccak256(bytes(pd.species));
        EvolutionStep memory step = evolutionData[key];
        require(bytes(step.nextSpecies).length > 0, "PokeEvolution: species cannot evolve");
        require(pd.level >= step.requiredLevel,     "PokeEvolution: level too low");

        // 4. Burn evolution fee
        if (evolutionFee > 0) {
            bool ok = pokeToken.transferFrom(msg.sender, address(this), evolutionFee);
            require(ok, "PokeEvolution: fee transfer failed");
            pokeToken.burn(evolutionFee);
        }

        // 5. Build new metadata URI
        //    If a specific URI was registered, use it; otherwise build from base.
        string memory newURI = bytes(step.nextMetadataBase).length > 0
            ? step.nextMetadataBase
            : string(abi.encodePacked(baseMetadataURI, step.nextSpecies, ".json"));

        // 6. Apply evolution on the NFT contract
        nftContract.evolve(tokenId, step.nextSpecies, step.nextStage, step.requiredLevel, newURI);

        emit EvolutionPerformed(msg.sender, tokenId, pd.species, step.nextSpecies, step.nextStage);
    }

    /* ─────────────────────────────────────────────────────────
       CORE: ADD EXPERIENCE (called by battle contract / admin)
    ───────────────────────────────────────────────────────── */
    function addExperience(uint256 tokenId, uint16 xpAmount) external {
        require(
            msg.sender == owner ||
            nftContract.ownerOf(tokenId) == msg.sender,
            "PokeEvolution: not authorized"
        );
        nftContract.addExperience(tokenId, xpAmount);
    }

    /* ─────────────────────────────────────────────────────────
       READ HELPERS
    ───────────────────────────────────────────────────────── */
    /**
     * @notice Returns evolution info for a given species.
     */
    function getEvolutionStep(string calldata species)
        external view
        returns (EvolutionStep memory)
    {
        return evolutionData[keccak256(bytes(species))];
    }

    /**
     * @notice Returns true if a given token can evolve right now.
     */
    function canEvolve(uint256 tokenId) external view returns (bool, string memory nextSpecies, uint8 requiredLevel) {
        IPokeWorldNFT.PokemonData memory pd = nftContract.getPokemonData(tokenId);
        EvolutionStep memory step = evolutionData[keccak256(bytes(pd.species))];
        bool ready = bytes(step.nextSpecies).length > 0 && pd.level >= step.requiredLevel;
        return (ready, step.nextSpecies, step.requiredLevel);
    }

    /* ─────────────────────────────────────────────────────────
       ADMIN
    ───────────────────────────────────────────────────────── */
    /**
     * @notice Register or update an evolution step.
     *         Useful for adding new Pokémon after launch.
     */
    function registerEvolution(
        string calldata fromSpecies,
        string calldata toSpecies,
        uint8  requiredLevel,
        uint8  nextStage,
        string calldata metadataBase
    ) external onlyOwner {
        _register(fromSpecies, toSpecies, requiredLevel, nextStage, metadataBase);
    }

    function setEvolutionFee(uint256 newFee) external onlyOwner {
        emit FeeUpdated(evolutionFee, newFee);
        evolutionFee = newFee;
    }

    function setBaseMetadataURI(string calldata uri) external onlyOwner {
        baseMetadataURI = uri;
    }

    function setNFTContract(address _nft) external onlyOwner {
        nftContract = IPokeWorldNFT(_nft);
    }

    function setPokeToken(address _token) external onlyOwner {
        pokeToken = IPokeToken(_token);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "PokeEvolution: zero address");
        owner = newOwner;
    }

    /* ─────────────────────────────────────────────────────────
       INTERNAL
    ───────────────────────────────────────────────────────── */
    function _register(
        string memory fromSpecies,
        string memory toSpecies,
        uint8  requiredLevel,
        uint8  nextStage,
        string memory metadataBase
    ) internal {
        bytes32 key = keccak256(bytes(fromSpecies));
        evolutionData[key] = EvolutionStep({
            nextSpecies:      toSpecies,
            requiredLevel:    requiredLevel,
            nextStage:        nextStage,
            nextMetadataBase: metadataBase
        });
        emit EvolutionRegistered(fromSpecies, toSpecies, requiredLevel);
    }
}
