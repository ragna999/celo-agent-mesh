// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title AgentPayments
 * @notice Payment router for agent-to-agent transactions on Celo
 * @dev Handles invoices, direct payments, and escrow
 *      Supports cUSD, cEUR, USDT, USDC (all ERC-20 on Celo)
 */
contract AgentPayments is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── TYPES ────────────────────────────────────────────────

    enum InvoiceStatus {
        Created,
        Paid,
        Completed,
        Refunded,
        Disputed
    }

    struct Invoice {
        uint256 id;
        address from;
        address to;
        address token;
        uint256 amount;
        string description;
        InvoiceStatus status;
        uint256 createdAt;
        uint256 paidAt;
        bytes32 metadataHash;
    }

    struct Escrow {
        uint256 id;
        address from;
        address to;
        address token;
        uint256 amount;
        string description;
        bool released;
        bool refunded;
        uint256 createdAt;
        uint256 releaseAfter;
    }

    // ─── STATE ────────────────────────────────────────────────

    uint256 public nextInvoiceId;
    uint256 public nextEscrowId;

    mapping(uint256 => Invoice) public invoices;
    mapping(uint256 => Escrow) public escrows;

    mapping(address => uint256[]) public sentInvoices;
    mapping(address => uint256[]) public receivedInvoices;

    // Track escrowed amounts per token (separate from fees)
    mapping(address => uint256) public escrowedAmounts;

    uint256 public totalFees;
    uint256 public feeBps;
    address public feeRecipient;
    address public owner;

    mapping(address => bool) public supportedTokens;

    // ─── EVENTS ───────────────────────────────────────────────

    event InvoiceCreated(uint256 indexed id, address indexed from, address indexed to, address token, uint256 amount, string description);
    event InvoicePaid(uint256 indexed id, address indexed from, address indexed to, address token, uint256 amount, uint256 fee);
    event InvoiceCompleted(uint256 indexed id);
    event InvoiceRefunded(uint256 indexed id);
    event EscrowCreated(uint256 indexed id, address indexed from, address indexed to, address token, uint256 amount);
    event EscrowReleased(uint256 indexed id, address indexed to, uint256 amount);
    event EscrowRefunded(uint256 indexed id, address indexed from, uint256 amount);
    event DirectPayment(address indexed from, address indexed to, address token, uint256 amount, uint256 fee);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ─── CONSTRUCTOR ──────────────────────────────────────────

    constructor(address _feeRecipient, address _registry) {
        require(_feeRecipient != address(0), "Invalid fee recipient");
        // registry param kept for interface compat, not stored
        owner = msg.sender;
        feeRecipient = _feeRecipient;
        feeBps = 50; // 0.5%

        nextInvoiceId = 1;
        nextEscrowId = 1;

        // Celo stablecoins
        supportedTokens[0x765DE816845861e75A25fCA122bb6898B8B1282a] = true; // cUSD
        supportedTokens[0xD8763CBa276a3738E6DE85b4b3bF5FDed6D6cA73] = true; // cEUR
        supportedTokens[0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e] = true; // USDT
        supportedTokens[0xcebA9300f2b948710d2653dD7B07f33A8B32118C] = true; // USDC
    }

    // ─── INVOICE FUNCTIONS ────────────────────────────────────

    function createInvoice(
        address _to,
        address _token,
        uint256 _amount,
        string calldata _description
    ) external returns (uint256) {
        require(supportedTokens[_token], "Token not supported");
        require(_amount > 0, "Amount must be > 0");
        require(_to != address(0), "Invalid recipient");
        require(_to != msg.sender, "Cannot invoice yourself");

        uint256 id = nextInvoiceId++;

        invoices[id] = Invoice({
            id: id,
            from: msg.sender,
            to: _to,
            token: _token,
            amount: _amount,
            description: _description,
            status: InvoiceStatus.Created,
            createdAt: block.timestamp,
            paidAt: 0,
            metadataHash: bytes32(0)
        });

        sentInvoices[msg.sender].push(id);
        receivedInvoices[_to].push(id);

        emit InvoiceCreated(id, msg.sender, _to, _token, _amount, _description);
        return id;
    }

    function payInvoice(uint256 _id) external nonReentrant {
        Invoice storage inv = invoices[_id];
        require(inv.status == InvoiceStatus.Created, "Invoice not payable");
        require(msg.sender == inv.from, "Only invoice creator can pay");

        uint256 fee = (inv.amount * feeBps) / 10000;
        uint256 netAmount = inv.amount - fee;

        // SafeERC20 handles return values
        IERC20(inv.token).safeTransferFrom(msg.sender, inv.to, netAmount);

        if (fee > 0) {
            IERC20(inv.token).safeTransferFrom(msg.sender, feeRecipient, fee);
            totalFees += fee;
        }

        inv.status = InvoiceStatus.Paid;
        inv.paidAt = block.timestamp;

        emit InvoicePaid(_id, msg.sender, inv.to, inv.token, inv.amount, fee);
    }

    function completeInvoice(uint256 _id) external {
        Invoice storage inv = invoices[_id];
        require(inv.status == InvoiceStatus.Paid, "Invoice not paid");
        require(msg.sender == inv.to, "Only recipient can complete");

        inv.status = InvoiceStatus.Completed;
        emit InvoiceCompleted(_id);
    }

    function refundInvoice(uint256 _id) external {
        Invoice storage inv = invoices[_id];
        require(inv.status == InvoiceStatus.Created, "Cannot refund");
        require(msg.sender == inv.from, "Only sender can refund");

        inv.status = InvoiceStatus.Refunded;
        emit InvoiceRefunded(_id);
    }

    // ─── DIRECT PAYMENT ──────────────────────────────────────

    function pay(
        address _to,
        address _token,
        uint256 _amount
    ) external nonReentrant {
        require(supportedTokens[_token], "Token not supported");
        require(_amount > 0, "Amount must be > 0");
        require(_to != address(0), "Invalid recipient");
        require(_to != msg.sender, "Cannot pay yourself");

        uint256 fee = (_amount * feeBps) / 10000;
        uint256 netAmount = _amount - fee;

        IERC20(_token).safeTransferFrom(msg.sender, _to, netAmount);

        if (fee > 0) {
            IERC20(_token).safeTransferFrom(msg.sender, feeRecipient, fee);
            totalFees += fee;
        }

        emit DirectPayment(msg.sender, _to, _token, _amount, fee);
    }

    // ─── ESCROW FUNCTIONS ─────────────────────────────────────

    function createEscrow(
        address _to,
        address _token,
        uint256 _amount,
        string calldata _description,
        uint256 _releaseAfter
    ) external nonReentrant returns (uint256) {
        require(supportedTokens[_token], "Token not supported");
        require(_amount > 0, "Amount must be > 0");
        require(_to != address(0), "Invalid recipient");
        require(_to != msg.sender, "Cannot escrow to yourself");

        uint256 id = nextEscrowId++;

        // Lock tokens in contract
        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
        escrowedAmounts[_token] += _amount;

        escrows[id] = Escrow({
            id: id,
            from: msg.sender,
            to: _to,
            token: _token,
            amount: _amount,
            description: _description,
            released: false,
            refunded: false,
            createdAt: block.timestamp,
            releaseAfter: _releaseAfter
        });

        emit EscrowCreated(id, msg.sender, _to, _token, _amount);
        return id;
    }

    function releaseEscrow(uint256 _id) external nonReentrant {
        Escrow storage esc = escrows[_id];
        require(!esc.released, "Already released");
        require(!esc.refunded, "Already refunded");
        require(
            msg.sender == esc.from ||
            (esc.releaseAfter > 0 && block.timestamp >= esc.releaseAfter),
            "Not authorized"
        );

        esc.released = true;
        escrowedAmounts[esc.token] -= esc.amount;

        uint256 fee = (esc.amount * feeBps) / 10000;
        uint256 netAmount = esc.amount - fee;

        IERC20(esc.token).safeTransfer(esc.to, netAmount);

        if (fee > 0) {
            IERC20(esc.token).safeTransfer(feeRecipient, fee);
            totalFees += fee;
        }

        emit EscrowReleased(_id, esc.to, netAmount);
    }

    function refundEscrow(uint256 _id) external nonReentrant {
        Escrow storage esc = escrows[_id];
        require(!esc.released, "Already released");
        require(!esc.refunded, "Already refunded");
        require(msg.sender == esc.from, "Only sender can refund");

        esc.refunded = true;
        escrowedAmounts[esc.token] -= esc.amount;

        IERC20(esc.token).safeTransfer(esc.from, esc.amount);

        emit EscrowRefunded(_id, esc.from, esc.amount);
    }

    // ─── READ FUNCTIONS ───────────────────────────────────────

    function getInvoice(uint256 _id) external view returns (Invoice memory) {
        return invoices[_id];
    }

    function getEscrow(uint256 _id) external view returns (Escrow memory) {
        return escrows[_id];
    }

    function getSentInvoices(address _agent) external view returns (uint256[] memory) {
        return sentInvoices[_agent];
    }

    function getReceivedInvoices(address _agent) external view returns (uint256[] memory) {
        return receivedInvoices[_agent];
    }

    // ─── ADMIN ────────────────────────────────────────────────

    function setFee(uint256 _feeBps) external {
        require(msg.sender == owner, "Only owner");
        require(_feeBps <= 500, "Fee too high (max 5%)");
        feeBps = _feeBps;
    }

    function setSupportedToken(address _token, bool _supported) external {
        require(msg.sender == owner, "Only owner");
        require(_token != address(0), "Invalid token");
        supportedTokens[_token] = _supported;
    }

    function setFeeRecipient(address _recipient) external {
        require(msg.sender == owner, "Only owner");
        require(_recipient != address(0), "Invalid recipient");
        feeRecipient = _recipient;
    }

    function transferOwnership(address _newOwner) external {
        require(msg.sender == owner, "Only owner");
        require(_newOwner != address(0), "Invalid new owner");
        emit OwnershipTransferred(owner, _newOwner);
        owner = _newOwner;
    }

    /**
     * @notice Withdraw accumulated fees (NOT escrowed funds)
     */
    function withdrawFees(address _token) external {
        require(msg.sender == owner, "Only owner");
        uint256 balance = IERC20(_token).balanceOf(address(this));
        uint256 escrowed = escrowedAmounts[_token];
        // Only withdraw fees, not escrowed funds
        uint256 withdrawable = balance > escrowed ? balance - escrowed : 0;
        require(withdrawable > 0, "No fees to withdraw");
        IERC20(_token).safeTransfer(feeRecipient, withdrawable);
    }
}
