# Security Audit Report — Celo Agent Mesh Contracts
## Date: 2026-06-10
## Contracts: AgentRegistry.sol, AgentPayments.sol, AgentMessenger.sol
## Compiler: Solidity ^0.8.20

---

## Summary

| Severity    | Count |
|-------------|-------|
| Critical    | 3     |
| High        | 4     |
| Medium      | 5     |
| Low         | 4     |
| Informational | 5   |

---

## CRITICAL FINDINGS

### C-1: Unchecked ERC-20 Return Values (AgentPayments.sol)

**Lines:** 202, 206, 260, 263, 295, 332, 335, 354, 399

**Description:** `IERC20.transfer()` and `IERC20.transferFrom()` are called without checking return values. Many ERC-20 tokens (including USDT on Celo) return `false` on failure instead of reverting. This means transfers can silently fail while the contract updates its internal state (status, volume, fees) as if the transfer succeeded.

**Impact:** Funds can be lost. An invoice can be marked "Paid" without tokens actually moving. Escrow can be marked "Released" while tokens remain in the contract.

**Recommendation:** Use OpenZeppelin's `SafeERC20` library:
```solidity
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
using SafeERC20 for IERC20;
// Then use: IERC20(token).safeTransfer(...)
```

---

### C-2: recordRequest() Has No Access Control (AgentRegistry.sol)

**Line:** 237-241

**Description:** `recordRequest(address _agent)` is `external` with no access control. The comment says "Only callable by registered contracts (payment router)" but there is no `require` enforcing this. Any address can inflate any agent's `totalRequests` counter.

**Impact:** Agents can fake popularity/reputation metrics. This undermines the trust model of the entire registry.

**Recommendation:** Add an authorized caller check:
```solidity
address public paymentRouter;
modifier onlyPaymentRouter() {
    require(msg.sender == paymentRouter, "Only payment router");
    _;
}
function recordRequest(address _agent) external onlyPaymentRouter { ... }
```

---

### C-3: Escrow Funds Can Be Stolen via re-entrancy on Non-bool Tokens (AgentPayments.sol)

**Lines:** 317-342 (releaseEscrow)

**Description:** While `nonReentrant` is applied, there is a subtler issue: `esc.released = true` is set BEFORE the transfer (good — checks-effects-interactions). However, the `IERC20.transfer()` return value is not checked (see C-1). If the transfer silently fails, the escrow is permanently marked as released but the beneficiary receives nothing. The funds remain locked in the contract with no recovery path.

**Impact:** Permanent loss of escrowed funds.

**Recommendation:** Use `SafeERC20.safeTransfer()` AND consider a dispute/recovery mechanism.

---

## HIGH FINDINGS

### H-1: Escrow releaseEscrow() — Anyone Can Release After Timestamp (AgentPayments.sol)

**Lines:** 321-325

**Description:** The authorization check is:
```solidity
require(
    msg.sender == esc.from || 
    (esc.releaseAfter > 0 && block.timestamp >= esc.releaseAfter),
    "Not authorized"
);
```
After `releaseAfter`, ANY address can call `releaseEscrow()` and release funds to `esc.to`. While this may be intentional for auto-release, it means a third party (or even `esc.to` themselves) can trigger release the instant the timestamp passes, removing the sender's ability to dispute.

**Impact:** The escrow sender loses control over dispute timing.

**Recommendation:** Consider restricting post-timestamp release to `esc.to` or `esc.from` only, or add a dispute mechanism with an arbiter.

---

### H-2: withdrawFees() Accounting Bug (AgentPayments.sol)

**Lines:** 395-401

**Description:** The fee withdrawal calculates:
```solidity
uint256 balance = IERC20(_token).balanceOf(address(this)) - totalVolume[_token];
```
This assumes `totalVolume[token]` equals the total amount of tokens held in escrow. However, `totalVolume` tracks the original `amount` (including fees), while the contract actually holds `amount` for escrows. The math works for escrowed funds, BUT if anyone sends tokens directly to the contract (not via createEscrow), those tokens become unrecoverable. Conversely, if fee accounting drifts, this underflows and reverts (Solidity 0.8+), making fees permanently stuck.

**Impact:** Fee tokens can become permanently locked.

**Recommendation:** Track escrowed amounts separately from fees. Maintain a dedicated `feeBalance` mapping incremented on each fee collection.

---

### H-3: allAgents Array Never Removes Deactivated Agents (AgentRegistry.sol)

**Lines:** 114-117, 154-158

**Description:** `deactivate()` sets `active = false` but never removes the agent from `allAgents`. Similarly, re-registration checks `registeredAt == 0` to decide whether to push to `allAgents`, but after the first registration `registeredAt` is already set to `block.timestamp` (non-zero) in the same transaction at line 103, so the check at line 115 always fails for re-registrations — the agent is never re-added (which is correct for duplicates, but the logic is confusing).

**Impact:** `getAllAgents()` returns stale data including deactivated agents. `totalAgents()` is misleading.

**Recommendation:** Either remove agents from `allAgents` on deactivation (expensive) or provide a separate `getActiveAgents()` function that filters.

---

### H-4: capabilityIndex Grows Unbounded for Re-registrations (AgentRegistry.sol)

**Lines:** 93-95, 110-112

**Description:** When an agent re-registers, `_removeFromCapabilities()` is called to clean up old entries. However, if the agent registers with the SAME capabilities, the remove-then-add pattern works correctly. The issue is `_removeFromCapabilities()` has O(n*m) complexity (nested loops). If a capability has many agents, this can hit the block gas limit, permanently bricking the agent's ability to re-register.

**Impact:** Denial of service for agents trying to update if their capability lists are popular.

**Recommendation:** Consider using mapping-based indexes (mapping(capability => mapping(address => bool))) instead of arrays for O(1) removal.

---

## MEDIUM FINDINGS

### M-1: No Validation on _to == address(0) in pay() and createInvoice() (AgentPayments.sol)

**Lines:** 165, 255

**Description:** `createInvoice` checks `_to != address(0)` but `pay()` does not. Sending tokens to `address(0)` burns them irrecoverably.

**Impact:** Accidental permanent loss of funds.

**Recommendation:** Add `require(_to != address(0))` in `pay()`.

---

### M-2: markAllRead() Can Be Griefed (AgentMessenger.sol)

**Lines:** 229-238

**Description:** `markAllRead()` iterates over the entire inbox array. If an agent receives a very large number of messages (e.g., via spam broadcasts), this function will run out of gas and become uncallable, permanently showing an incorrect unread count.

**Impact:** Denial of service on the mark-read functionality.

**Recommendation:** Add pagination: `markReadBatch(uint256 offset, uint256 limit)`.

---

### M-3: Unbounded inbox/sentMessages Arrays (AgentMessenger.sol)

**Lines:** 111, 118, 119, 130-131

**Description:** `inbox[_to]`, `sentMessages[msg.sender]`, and `broadcasts` grow indefinitely. Functions like `getInbox()` and `getBroadcasts()` that return these arrays will eventually exceed gas limits for view calls, making them unusable.

**Impact:** Off-chain indexers and front-ends relying on these view functions will break.

**Recommendation:** Add pagination to all array-returning view functions.

---

### M-4: Owner Can Change feeRecipient to Zero Address (AgentPayments.sol)

**Lines:** N/A (missing validation)

**Description:** There is no validation that `feeRecipient` is not `address(0)`. If set to zero, all fees are burned. The `setRegistry` function also lacks validation.

**Impact:** Permanent loss of fee revenue.

**Recommendation:** Add `require(_addr != address(0))` checks in setters.

---

### M-5: No Ownership Transfer Mechanism (All Contracts)

**Description:** All three contracts use a simple `owner = msg.sender` pattern with no transfer/renounce mechanism. If the owner key is compromised or lost, there is no recovery.

**Impact:** Single point of failure for admin operations.

**Recommendation:** Inherit `Ownable2Step` from OpenZeppelin for safe ownership transfers.

---

## LOW FINDINGS

### L-1: Front-Running on Invoice Creation and Payment (AgentPayments.sol)

**Description:** Invoice creation and payment are separate transactions. A malicious actor watching the mempool could front-run `payInvoice()` by calling `refundInvoice()` first (since both require `msg.sender == inv.from`). However, this is self-inflicted (same sender), so the risk is limited to the sender's own MEV bots or compromised wallets.

---

### L-2: String Comparison in capabilityIndex Uses Storage (AgentRegistry.sol)

**Line:** 168

**Description:** `capabilityIndex[_capability]` uses string keys in mappings. String hashing is implicit but long capability strings increase gas costs for storage reads.

**Recommendation:** Document gas implications or use bytes32 for capability identifiers.

---

### L-3: No Event for Owner/Admin Actions (All Contracts)

**Description:** `pause()`, `unpause()`, `setFee()`, `setSupportedToken()`, `setRegistry()` do not emit events. This makes off-chain monitoring of admin actions impossible.

**Recommendation:** Add events for all state-changing admin functions.

---

### L-4: Missing Zero-Address Check in createEscrow() (AgentPayments.sol)

**Line:** 282-312

**Description:** No check that `_to != address(0)`. Escrow created to address(0) would lock funds permanently on release.

---

## INFORMATIONAL

### I-1: Solidity Version ^0.8.20 Is Recent and Safe
The pragma uses 0.8.20+ which has built-in overflow/underflow protection. No integer overflow/underflow issues found.

### I-2: Reentrancy Protection Is Properly Applied
AgentPayments.sol correctly inherits `ReentrancyGuard` and applies `nonReentrant` to all external state-modifying functions that handle token transfers.

### I-3: No Flash Loan Attack Surface
None of the contracts rely on spot prices, token balances, or oracle data that could be manipulated via flash loans.

### I-4: Storage Collision Not Applicable
No proxy/upgradeable patterns are used, so storage collision is not a concern.

### I-5: AgentMessenger Has No Access Control (By Design)
Anyone can send messages. This is intentional for an open messaging layer but could be abused for spam. Consider optional rate-limiting or staking requirements.

---

## Recommendations Priority

1. **Immediate (deploy-blocking):** Fix C-1 (SafeERC20), C-2 (recordRequest access control)
2. **Before mainnet:** Fix H-1, H-2, H-4, M-1
3. **Soon after launch:** M-2, M-3, M-5, L-3
4. **Nice to have:** Remaining items
