// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title PokeMarketplace
 * @notice Peer-to-peer marketplace for trading PokéWorld NFTs using POKÉ tokens.
 *
 * Flow:
 *   1. Seller calls listNFT(tokenId, price) — NFT is escrowed in this contract.
 *   2. Buyer calls buyNFT(listingId)        — pays POKÉ, receives NFT.
 *   3. Platform fee (3 %) is sent to feeRecipient; rest goes to seller.
 *   4. Seller may call cancelListing(listingId) any time before a sale.
 *
 * Security:
 *   • Re-entrancy guard on all state-changing functions.
 *   • Checks-Effects-Interactions pattern throughout.
 *   • Listing price validated > 0.
 */

interface IERC721Minimal {
    function ownerOf(uint256 tokenId) external view returns (address);
    function transferFrom(address from, address to, uint256 tokenId) external;
    function getApproved(uint256 tokenId) external view returns (address);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
}

interface IERC20Minimal {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

contract PokeMarketplace {

    /* ─────────────────────────────────────────────────────────
       DATA STRUCTURES
    ───────────────────────────────────────────────────────── */
    enum ListingStatus { Active, Sold, Cancelled }

    struct Listing {
        uint256       listingId;
        address       seller;
        uint256       tokenId;
        uint256       price;       // in POKÉ (18 decimals)
        ListingStatus status;
        uint64        listedAt;
    }

    /* ─────────────────────────────────────────────────────────
       STATE
    ───────────────────────────────────────────────────────── */
    address public owner;
    IERC721Minimal public nftContract;
    IERC20Minimal  public pokeToken;

    /// @notice Platform fee in basis points (100 bp = 1%). Default: 300 = 3%.
    uint256 public feeBps = 300;

    /// @notice Address that collects platform fees.
    address public feeRecipient;

    uint256 private _listingIdCounter;

    // listingId → Listing
    mapping(uint256 => Listing) public listings;

    // tokenId → active listingId (0 = not listed)
    mapping(uint256 => uint256) public activeListingByToken;

    // re-entrancy lock
    bool private _locked;

    /* ─────────────────────────────────────────────────────────
       EVENTS
    ───────────────────────────────────────────────────────── */
    event Listed(
        uint256 indexed listingId,
        address indexed seller,
        uint256 indexed tokenId,
        uint256 price
    );
    event Sold(
        uint256 indexed listingId,
        address indexed buyer,
        uint256 indexed tokenId,
        uint256 price,
        uint256 fee
    );
    event Cancelled(uint256 indexed listingId, address indexed seller, uint256 indexed tokenId);
    event FeeBpsUpdated(uint256 oldBps, uint256 newBps);
    event FeeRecipientUpdated(address oldRecipient, address newRecipient);

    /* ─────────────────────────────────────────────────────────
       MODIFIERS
    ───────────────────────────────────────────────────────── */
    modifier onlyOwner() {
        require(msg.sender == owner, "Marketplace: not owner");
        _;
    }

    modifier noReentrant() {
        require(!_locked, "Marketplace: reentrant call");
        _locked = true;
        _;
        _locked = false;
    }

    /* ─────────────────────────────────────────────────────────
       CONSTRUCTOR
    ───────────────────────────────────────────────────────── */
    constructor(address _nftContract, address _pokeToken, address _feeRecipient) {
        require(_feeRecipient != address(0), "Marketplace: zero fee recipient");
        owner        = msg.sender;
        nftContract  = IERC721Minimal(_nftContract);
        pokeToken    = IERC20Minimal(_pokeToken);
        feeRecipient = _feeRecipient;
    }

    /* ─────────────────────────────────────────────────────────
       CORE: LIST
    ───────────────────────────────────────────────────────── */
    /**
     * @notice Escrow an NFT and create a listing.
     * @param tokenId  The ERC-721 token to sell.
     * @param price    Asking price in POKÉ (must be > 0).
     * @return listingId
     *
     * Requirements:
     *   - Caller must own the token.
     *   - Caller must have approved this contract on the NFT contract.
     *   - Token must not already be listed.
     */
    function listNFT(uint256 tokenId, uint256 price) external noReentrant returns (uint256) {
        require(price > 0, "Marketplace: price must be > 0");
        require(nftContract.ownerOf(tokenId) == msg.sender, "Marketplace: not token owner");
        require(
            nftContract.getApproved(tokenId) == address(this) ||
            nftContract.isApprovedForAll(msg.sender, address(this)),
            "Marketplace: contract not approved"
        );
        require(activeListingByToken[tokenId] == 0, "Marketplace: already listed");

        // Increment before storage so IDs start at 1
        _listingIdCounter++;
        uint256 listingId = _listingIdCounter;

        listings[listingId] = Listing({
            listingId: listingId,
            seller:    msg.sender,
            tokenId:   tokenId,
            price:     price,
            status:    ListingStatus.Active,
            listedAt:  uint64(block.timestamp)
        });

        activeListingByToken[tokenId] = listingId;

        // Transfer NFT into escrow
        nftContract.transferFrom(msg.sender, address(this), tokenId);

        emit Listed(listingId, msg.sender, tokenId, price);
        return listingId;
    }

    /* ─────────────────────────────────────────────────────────
       CORE: BUY
    ───────────────────────────────────────────────────────── */
    /**
     * @notice Purchase a listed NFT.
     * @param listingId  The listing to buy.
     *
     * Requirements:
     *   - Listing must be Active.
     *   - Buyer must have approved `listing.price` POKÉ to this contract.
     */
    function buyNFT(uint256 listingId) external noReentrant {
        Listing storage lst = listings[listingId];
        require(lst.status == ListingStatus.Active, "Marketplace: listing not active");
        require(lst.seller != msg.sender, "Marketplace: seller cannot buy own listing");

        // ── Effects ──────────────────────────────────────────
        lst.status = ListingStatus.Sold;
        activeListingByToken[lst.tokenId] = 0;

        uint256 price     = lst.price;
        uint256 fee       = (price * feeBps) / 10_000;
        uint256 sellerAmt = price - fee;
        address seller    = lst.seller;
        uint256 tokenId   = lst.tokenId;

        // ── Interactions ─────────────────────────────────────
        // Collect payment from buyer
        bool ok1 = pokeToken.transferFrom(msg.sender, address(this), price);
        require(ok1, "Marketplace: payment failed");

        // Pay seller
        bool ok2 = pokeToken.transfer(seller, sellerAmt);
        require(ok2, "Marketplace: seller transfer failed");

        // Pay platform fee
        if (fee > 0) {
            bool ok3 = pokeToken.transfer(feeRecipient, fee);
            require(ok3, "Marketplace: fee transfer failed");
        }

        // Deliver NFT to buyer
        nftContract.transferFrom(address(this), msg.sender, tokenId);

        emit Sold(listingId, msg.sender, tokenId, price, fee);
    }

    /* ─────────────────────────────────────────────────────────
       CORE: CANCEL
    ───────────────────────────────────────────────────────── */
    /**
     * @notice Cancel an active listing and recover the escrowed NFT.
     * @param listingId  The listing to cancel.
     */
    function cancelListing(uint256 listingId) external noReentrant {
        Listing storage lst = listings[listingId];
        require(lst.status == ListingStatus.Active, "Marketplace: listing not active");
        require(lst.seller == msg.sender || msg.sender == owner, "Marketplace: not authorized");

        // ── Effects ──────────────────────────────────────────
        lst.status = ListingStatus.Cancelled;
        activeListingByToken[lst.tokenId] = 0;

        uint256 tokenId = lst.tokenId;
        address seller  = lst.seller;

        // ── Interactions ─────────────────────────────────────
        nftContract.transferFrom(address(this), seller, tokenId);

        emit Cancelled(listingId, seller, tokenId);
    }

    /* ─────────────────────────────────────────────────────────
       READ HELPERS
    ───────────────────────────────────────────────────────── */
    function getListing(uint256 listingId) external view returns (Listing memory) {
        return listings[listingId];
    }

    function isListed(uint256 tokenId) external view returns (bool, uint256 listingId) {
        uint256 id = activeListingByToken[tokenId];
        return (id != 0, id);
    }

    function totalListings() external view returns (uint256) {
        return _listingIdCounter;
    }

    /* ─────────────────────────────────────────────────────────
       ADMIN
    ───────────────────────────────────────────────────────── */
    function setFeeBps(uint256 newBps) external onlyOwner {
        require(newBps <= 1000, "Marketplace: fee too high (max 10%)");
        emit FeeBpsUpdated(feeBps, newBps);
        feeBps = newBps;
    }

    function setFeeRecipient(address newRecipient) external onlyOwner {
        require(newRecipient != address(0), "Marketplace: zero address");
        emit FeeRecipientUpdated(feeRecipient, newRecipient);
        feeRecipient = newRecipient;
    }

    function setNFTContract(address _nft) external onlyOwner {
        nftContract = IERC721Minimal(_nft);
    }

    function setPokeToken(address _token) external onlyOwner {
        pokeToken = IERC20Minimal(_token);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Marketplace: zero address");
        owner = newOwner;
    }
}
