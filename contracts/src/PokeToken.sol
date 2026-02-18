// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title PokeToken
 * @notice ERC-20 utility token for the PokéWorld ecosystem.
 *         Symbol : POKÉ
 *         Supply : 1,000,000,000 tokens minted to the deployer.
 *         Used   : Battle rewards, marketplace currency, evolution fees.
 *
 * Implements ERC-20 + ERC-20 Permit (EIP-2612) for gasless approvals.
 * Includes a minter role so the Battle / Evolution contracts can award tokens.
 */
contract PokeToken {

    /* ─────────────────────────────────────────────────────────
       ERC-20 STORAGE
    ───────────────────────────────────────────────────────── */
    string  public constant name     = "PokeToken";
    string  public constant symbol   = "POKE";
    uint8   public constant decimals = 18;

    uint256 public totalSupply;

    mapping(address => uint256)                     public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    /* ─────────────────────────────────────────────────────────
       EIP-2612 PERMIT STORAGE
    ───────────────────────────────────────────────────────── */
    bytes32 public immutable DOMAIN_SEPARATOR;
    // keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)")
    bytes32 public constant PERMIT_TYPEHASH =
        0x6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c9;
    mapping(address => uint256) public nonces;

    /* ─────────────────────────────────────────────────────────
       ACCESS CONTROL
    ───────────────────────────────────────────────────────── */
    address public owner;
    mapping(address => bool) public isMinter;

    /* ─────────────────────────────────────────────────────────
       EVENTS
    ───────────────────────────────────────────────────────── */
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner_, address indexed spender, uint256 value);
    event MinterSet(address indexed account, bool status);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /* ─────────────────────────────────────────────────────────
       MODIFIERS
    ───────────────────────────────────────────────────────── */
    modifier onlyOwner() {
        require(msg.sender == owner, "PokeToken: not owner");
        _;
    }
    modifier onlyMinter() {
        require(isMinter[msg.sender] || msg.sender == owner, "PokeToken: not minter");
        _;
    }

    /* ─────────────────────────────────────────────────────────
       CONSTRUCTOR
    ───────────────────────────────────────────────────────── */
    constructor() {
        owner = msg.sender;

        // Build EIP-712 domain separator
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );

        // Mint 1 billion tokens to deployer (max supply)
        uint256 initialSupply = 1_000_000_000 * 10 ** decimals;
        _mint(msg.sender, initialSupply);
    }

    /* ─────────────────────────────────────────────────────────
       ERC-20 CORE
    ───────────────────────────────────────────────────────── */
    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        _approve(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 currentAllowance = allowance[from][msg.sender];
        require(currentAllowance >= amount, "PokeToken: insufficient allowance");
        unchecked { allowance[from][msg.sender] = currentAllowance - amount; }
        _transfer(from, to, amount);
        return true;
    }

    /* ─────────────────────────────────────────────────────────
       EIP-2612 PERMIT
    ───────────────────────────────────────────────────────── */
    function permit(
        address owner_,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8   v,
        bytes32 r,
        bytes32 s
    ) external {
        require(block.timestamp <= deadline, "PokeToken: permit expired");
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(abi.encode(PERMIT_TYPEHASH, owner_, spender, value, nonces[owner_]++, deadline))
            )
        );
        address recoveredAddress = ecrecover(digest, v, r, s);
        require(recoveredAddress != address(0) && recoveredAddress == owner_, "PokeToken: invalid signature");
        _approve(owner_, spender, value);
    }

    /* ─────────────────────────────────────────────────────────
       MINTING (minter role only — used by game contracts)
    ───────────────────────────────────────────────────────── */
    /// @notice Mint reward tokens to a trainer (called by battle / evolution contracts).
    function mint(address to, uint256 amount) external onlyMinter {
        _mint(to, amount);
    }

    /// @notice Burn tokens from caller's balance.
    function burn(uint256 amount) external {
        require(balanceOf[msg.sender] >= amount, "PokeToken: burn exceeds balance");
        unchecked { balanceOf[msg.sender] -= amount; }
        totalSupply -= amount;
        emit Transfer(msg.sender, address(0), amount);
    }

    /* ─────────────────────────────────────────────────────────
       ADMIN
    ───────────────────────────────────────────────────────── */
    function setMinter(address account, bool status) external onlyOwner {
        isMinter[account] = status;
        emit MinterSet(account, status);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "PokeToken: zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /* ─────────────────────────────────────────────────────────
       INTERNAL HELPERS
    ───────────────────────────────────────────────────────── */
    function _transfer(address from, address to, uint256 amount) internal {
        require(from != address(0), "PokeToken: transfer from zero");
        require(to   != address(0), "PokeToken: transfer to zero");
        require(balanceOf[from] >= amount, "PokeToken: insufficient balance");
        unchecked {
            balanceOf[from] -= amount;
            balanceOf[to]   += amount;
        }
        emit Transfer(from, to, amount);
    }

    function _approve(address owner_, address spender, uint256 amount) internal {
        require(owner_   != address(0), "PokeToken: approve from zero");
        require(spender != address(0), "PokeToken: approve to zero");
        allowance[owner_][spender] = amount;
        emit Approval(owner_, spender, amount);
    }

    function _mint(address to, uint256 amount) internal {
        require(to != address(0), "PokeToken: mint to zero");
        totalSupply     += amount;
        balanceOf[to]   += amount;
        emit Transfer(address(0), to, amount);
    }
}
