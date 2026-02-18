// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title PokeWorldNFT
 * @notice ERC-721 contract for PokéWorld Pokémon NFTs.
 *
 * Each token represents one Pokémon with:
 *   • species name  (e.g. "Bulbasaur")
 *   • evolution stage (0 = Base, 1 = Second, 2 = Third)
 *   • level         (1 – 100)
 *   • experience    (0 – 999)
 *   • IPFS metadata URI (points to JSON in /metadata/)
 *
 * The PokeEvolution contract is granted the EVOLVER role so it
 * can update a token's species/stage/level after evolution.
 *
 * Supports ERC-721 + ERC-721Metadata + ERC-165.
 * Implements safeTransferFrom with re-entrancy guard.
 */
contract PokeWorldNFT {

    /* ─────────────────────────────────────────────────────────
       ERC-165 / INTERFACE IDs
    ───────────────────────────────────────────────────────── */
    bytes4 private constant _INTERFACE_ID_ERC165    = 0x01ffc9a7;
    bytes4 private constant _INTERFACE_ID_ERC721    = 0x80ac58cd;
    bytes4 private constant _INTERFACE_ID_ERC721MD  = 0x5b5e139f; // ERC721Metadata

    /* ─────────────────────────────────────────────────────────
       TOKEN DATA
    ───────────────────────────────────────────────────────── */
    struct PokemonData {
        string  species;        // "Bulbasaur", "Ivysaur", …
        uint8   stage;          // 0 = Base, 1 = Second, 2 = Third
        uint8   level;          // 1 – 100
        uint16  experience;     // 0 – 999 (resets each level)
        string  metadataURI;    // ipfs://… or https://…
    }

    /* ─────────────────────────────────────────────────────────
       ERC-721 STORAGE
    ───────────────────────────────────────────────────────── */
    string  public constant name   = "PokeWorld NFT";
    string  public constant symbol = "PKWLD";

    uint256 public totalSupply;
    uint256 private _nextTokenId = 1;

    mapping(uint256 => address)             private _ownerOf;
    mapping(address => uint256)             private _balanceOf;
    mapping(uint256 => address)             private _tokenApprovals;
    mapping(address => mapping(address => bool)) private _isApprovedForAll;
    mapping(uint256 => PokemonData)         private _tokenData;

    /* ─────────────────────────────────────────────────────────
       ACCESS CONTROL
    ───────────────────────────────────────────────────────── */
    address public owner;
    mapping(address => bool) public isMinter;
    address public evolver;   // PokeEvolution contract

    /* ─────────────────────────────────────────────────────────
       REENTRANCY GUARD
    ───────────────────────────────────────────────────────── */
    uint256 private _reentrancyStatus = 1;
    modifier nonReentrant() {
        require(_reentrancyStatus == 1, "PokeWorldNFT: reentrant call");
        _reentrancyStatus = 2;
        _;
        _reentrancyStatus = 1;
    }

    /* ─────────────────────────────────────────────────────────
       EVENTS
    ───────────────────────────────────────────────────────── */
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner_, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner_, address indexed operator, bool approved);
    event Minted(address indexed to, uint256 indexed tokenId, string species, uint8 stage);
    event Evolved(uint256 indexed tokenId, string fromSpecies, string toSpecies, uint8 toStage);
    event LevelUp(uint256 indexed tokenId, uint8 newLevel, uint16 newExperience);

    /* ─────────────────────────────────────────────────────────
       MODIFIERS
    ───────────────────────────────────────────────────────── */
    modifier onlyOwner() {
        require(msg.sender == owner, "PokeWorldNFT: not owner");
        _;
    }
    modifier onlyMinter() {
        require(isMinter[msg.sender] || msg.sender == owner, "PokeWorldNFT: not minter");
        _;
    }
    modifier onlyEvolver() {
        require(msg.sender == evolver || msg.sender == owner, "PokeWorldNFT: not evolver");
        _;
    }

    /* ─────────────────────────────────────────────────────────
       CONSTRUCTOR
    ───────────────────────────────────────────────────────── */
    constructor() {
        owner = msg.sender;
    }

    /* ─────────────────────────────────────────────────────────
       ERC-165
    ───────────────────────────────────────────────────────── */
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == _INTERFACE_ID_ERC165   ||
               interfaceId == _INTERFACE_ID_ERC721   ||
               interfaceId == _INTERFACE_ID_ERC721MD;
    }

    /* ─────────────────────────────────────────────────────────
       ERC-721 CORE
    ───────────────────────────────────────────────────────── */
    function balanceOf(address _owner) external view returns (uint256) {
        require(_owner != address(0), "PokeWorldNFT: zero address");
        return _balanceOf[_owner];
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        address tokenOwner = _ownerOf[tokenId];
        require(tokenOwner != address(0), "PokeWorldNFT: token does not exist");
        return tokenOwner;
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        require(_ownerOf[tokenId] != address(0), "PokeWorldNFT: nonexistent token");
        return _tokenData[tokenId].metadataURI;
    }

    function approve(address to, uint256 tokenId) external {
        address tokenOwner = ownerOf(tokenId);
        require(
            msg.sender == tokenOwner || _isApprovedForAll[tokenOwner][msg.sender],
            "PokeWorldNFT: not authorized"
        );
        _tokenApprovals[tokenId] = to;
        emit Approval(tokenOwner, to, tokenId);
    }

    function getApproved(uint256 tokenId) external view returns (address) {
        require(_ownerOf[tokenId] != address(0), "PokeWorldNFT: nonexistent token");
        return _tokenApprovals[tokenId];
    }

    function setApprovalForAll(address operator, bool approved) external {
        require(operator != msg.sender, "PokeWorldNFT: self approval");
        _isApprovedForAll[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function isApprovedForAll(address _owner, address operator) external view returns (bool) {
        return _isApprovedForAll[_owner][operator];
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        require(_isApprovedOrOwner(msg.sender, tokenId), "PokeWorldNFT: not approved");
        _transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external nonReentrant {
        safeTransferFrom(from, to, tokenId, "");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data)
        public nonReentrant
    {
        require(_isApprovedOrOwner(msg.sender, tokenId), "PokeWorldNFT: not approved");
        _transfer(from, to, tokenId);
        _checkOnERC721Received(from, to, tokenId, data);
    }

    /* ─────────────────────────────────────────────────────────
       MINTING
    ───────────────────────────────────────────────────────── */
    /**
     * @notice Mint a new Pokémon NFT to `to`.
     * @param to          Receiving address.
     * @param species     Species name exactly as in metadata (e.g. "Bulbasaur").
     * @param stage       0 = Base, 1 = Second, 2 = Third.
     * @param level       Starting level (1–100).
     * @param metadataURI IPFS URI pointing to the JSON metadata file.
     */
    function mint(
        address to,
        string  calldata species,
        uint8   stage,
        uint8   level,
        string  calldata metadataURI
    ) external onlyMinter returns (uint256 tokenId) {
        require(to     != address(0),       "PokeWorldNFT: mint to zero");
        require(stage  <= 2,                "PokeWorldNFT: invalid stage");
        require(level  >= 1 && level <= 100,"PokeWorldNFT: invalid level");
        require(bytes(species).length > 0,  "PokeWorldNFT: empty species");

        tokenId = _nextTokenId++;
        _ownerOf[tokenId]  = to;
        _balanceOf[to]++;
        totalSupply++;

        _tokenData[tokenId] = PokemonData({
            species:     species,
            stage:       stage,
            level:       level,
            experience:  0,
            metadataURI: metadataURI
        });

        emit Transfer(address(0), to, tokenId);
        emit Minted(to, tokenId, species, stage);
    }

    /* ─────────────────────────────────────────────────────────
       GAME MECHANICS (called by PokeEvolution contract)
    ───────────────────────────────────────────────────────── */
    /**
     * @notice Evolve a token to its next form.
     *         Only callable by the designated evolver contract (or owner).
     */
    function evolve(
        uint256 tokenId,
        string  calldata newSpecies,
        uint8   newStage,
        uint8   evolvedLevel,
        string  calldata newMetadataURI
    ) external onlyEvolver {
        require(_ownerOf[tokenId] != address(0), "PokeWorldNFT: nonexistent token");
        require(newStage > _tokenData[tokenId].stage, "PokeWorldNFT: stage must increase");
        require(newStage <= 2, "PokeWorldNFT: max stage is Third (2)");

        string memory prevSpecies = _tokenData[tokenId].species;
        _tokenData[tokenId].species     = newSpecies;
        _tokenData[tokenId].stage       = newStage;
        _tokenData[tokenId].level       = evolvedLevel;
        _tokenData[tokenId].experience  = 0;
        _tokenData[tokenId].metadataURI = newMetadataURI;

        emit Evolved(tokenId, prevSpecies, newSpecies, newStage);
    }

    /**
     * @notice Award XP and level-up a token.
     *         Called by the battle contract or the evolver.
     */
    function addExperience(uint256 tokenId, uint16 xpAmount) external onlyEvolver {
        require(_ownerOf[tokenId] != address(0), "PokeWorldNFT: nonexistent token");
        PokemonData storage pd = _tokenData[tokenId];

        uint16 newXp  = pd.experience + xpAmount;
        uint8  newLvl = pd.level;

        // Each 1000 XP = 1 level (max level 100)
        while (newXp >= 1000 && newLvl < 100) {
            newXp  -= 1000;
            newLvl++;
        }
        pd.experience = newXp;
        pd.level      = newLvl;

        emit LevelUp(tokenId, newLvl, newXp);
    }

    /* ─────────────────────────────────────────────────────────
       READ HELPERS
    ───────────────────────────────────────────────────────── */
    function getPokemonData(uint256 tokenId) external view returns (PokemonData memory) {
        require(_ownerOf[tokenId] != address(0), "PokeWorldNFT: nonexistent token");
        return _tokenData[tokenId];
    }

    function getOwnedTokens(address _owner) external view returns (uint256[] memory) {
        uint256 balance  = _balanceOf[_owner];
        uint256[] memory tokens = new uint256[](balance);
        uint256 index;
        for (uint256 i = 1; i < _nextTokenId && index < balance; i++) {
            if (_ownerOf[i] == _owner) {
                tokens[index++] = i;
            }
        }
        return tokens;
    }

    /* ─────────────────────────────────────────────────────────
       ADMIN
    ───────────────────────────────────────────────────────── */
    function setMinter(address account, bool status) external onlyOwner {
        isMinter[account] = status;
    }

    function setEvolver(address evolverContract) external onlyOwner {
        evolver = evolverContract;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "PokeWorldNFT: zero address");
        owner = newOwner;
    }

    /* ─────────────────────────────────────────────────────────
       INTERNAL HELPERS
    ───────────────────────────────────────────────────────── */
    function _isApprovedOrOwner(address spender, uint256 tokenId) internal view returns (bool) {
        address tokenOwner = ownerOf(tokenId);
        return (
            spender == tokenOwner ||
            _isApprovedForAll[tokenOwner][spender] ||
            _tokenApprovals[tokenId] == spender
        );
    }

    function _transfer(address from, address to, uint256 tokenId) internal {
        require(ownerOf(tokenId) == from, "PokeWorldNFT: wrong owner");
        require(to != address(0),          "PokeWorldNFT: transfer to zero");

        // Clear approval
        delete _tokenApprovals[tokenId];

        _balanceOf[from]--;
        _balanceOf[to]++;
        _ownerOf[tokenId] = to;

        emit Transfer(from, to, tokenId);
    }

    function _checkOnERC721Received(
        address from,
        address to,
        uint256 tokenId,
        bytes memory data
    ) private {
        if (_isContract(to)) {
            // bytes4(keccak256("onERC721Received(address,address,uint256,bytes)")) = 0x150b7a02
            (bool success, bytes memory returndata) = to.call(
                abi.encodeWithSelector(0x150b7a02, msg.sender, from, tokenId, data)
            );
            require(
                success &&
                returndata.length == 32 &&
                abi.decode(returndata, (bytes4)) == bytes4(0x150b7a02),
                "PokeWorldNFT: unsafe recipient"
            );
        }
    }

    function _isContract(address account) internal view returns (bool) {
        uint256 size;
        assembly { size := extcodesize(account) }
        return size > 0;
    }
}
