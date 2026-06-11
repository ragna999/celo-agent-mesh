import { Contract, formatUnits } from 'ethers';

/**
 * Format token amount with correct decimals
 * @param {bigint} amount 
 * @param {number} decimals - default 18
 */
function formatTokenAmount(amount, decimals = 18) {
  return formatUnits(amount, decimals);
}

// Known token decimals on Celo
const TOKEN_DECIMALS = {
  '0x765DE816845861e75A25fCA122bb6898B8B1282a': 18, // cUSD
  '0xD8763CBa276a3738E6DE85b4b3bF5FDed6D6cA73': 18, // cEUR
  '0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e': 6,  // USDT
  '0xcebA9300f2b948710d2653dD7B07f33A8B32118C': 6,  // USDC
  // Testnet
  '0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1': 18, // cUSD testnet
  '0x10C892a6Ec8622Fc734b82f0b2e30d7B2e8e1e3A': 18, // cEUR testnet
};

function getTokenDecimals(tokenAddress) {
  return TOKEN_DECIMALS[tokenAddress] || 18;
}

/**
 * AgentPayments — invoices, direct payments, and escrow between agents
 */
export class AgentPayments {
  constructor(provider, address) {
    this.contract = new Contract(address, PAYMENTS_ABI, provider);
  }

  // ─── INVOICES (WRITE) ─────────────────────────────────────

  /**
   * Create an invoice
   * @param {Signer} signer
   * @param {string} to - recipient address
   * @param {string} token - ERC-20 token address
   * @param {bigint} amount - amount in token's smallest unit
   * @param {string} description - invoice description
   * @returns {{ tx, invoiceId }}
   */
  async createInvoice(signer, to, token, amount, description) {
    const contract = this.contract.connect(signer);
    const tx = await contract.createInvoice(to, token, amount, description);
    const receipt = await tx.wait();
    // Extract invoiceId from event
    const event = receipt.logs.find(log => {
      try { return contract.interface.parseLog(log)?.name === 'InvoiceCreated'; }
      catch { return false; }
    });
    const parsed = event ? contract.interface.parseLog(event) : null;
    return { tx: receipt, invoiceId: parsed?.args?.id ?? null };
  }

  /**
   * Pay an invoice (requires token approval)
   */
  async payInvoice(signer, invoiceId) {
    const contract = this.contract.connect(signer);
    const tx = await contract.payInvoice(invoiceId);
    return tx.wait();
  }

  /**
   * Complete an invoice (recipient confirms service delivered)
   */
  async completeInvoice(signer, invoiceId) {
    const contract = this.contract.connect(signer);
    const tx = await contract.completeInvoice(invoiceId);
    return tx.wait();
  }

  /**
   * Refund an unpaid invoice
   */
  async refundInvoice(signer, invoiceId) {
    const contract = this.contract.connect(signer);
    const tx = await contract.refundInvoice(invoiceId);
    return tx.wait();
  }

  // ─── DIRECT PAYMENT (WRITE) ───────────────────────────────

  /**
   * Direct token transfer (requires approval)
   * @param {Signer} signer
   * @param {string} to - recipient
   * @param {string} token - ERC-20 address
   * @param {bigint} amount - amount
   */
  async pay(signer, to, token, amount) {
    const contract = this.contract.connect(signer);
    const tx = await contract.pay(to, token, amount);
    return tx.wait();
  }

  // ─── ESCROW (WRITE) ───────────────────────────────────────

  /**
   * Create an escrow (locks tokens in contract)
   * @param {Signer} signer
   * @param {string} to - beneficiary
   * @param {string} token - ERC-20 address
   * @param {bigint} amount - amount to escrow
   * @param {string} description
   * @param {number} releaseAfter - unix timestamp (0 = manual release only)
   * @returns {{ tx, escrowId }}
   */
  async createEscrow(signer, to, token, amount, description, releaseAfter = 0) {
    const contract = this.contract.connect(signer);
    const tx = await contract.createEscrow(to, token, amount, description, releaseAfter);
    const receipt = await tx.wait();
    const event = receipt.logs.find(log => {
      try { return contract.interface.parseLog(log)?.name === 'EscrowCreated'; }
      catch { return false; }
    });
    const parsed = event ? contract.interface.parseLog(event) : null;
    return { tx: receipt, escrowId: parsed?.args?.id ?? null };
  }

  /**
   * Release escrowed funds to beneficiary
   */
  async releaseEscrow(signer, escrowId) {
    const contract = this.contract.connect(signer);
    const tx = await contract.releaseEscrow(escrowId);
    return tx.wait();
  }

  /**
   * Refund escrow back to sender
   */
  async refundEscrow(signer, escrowId) {
    const contract = this.contract.connect(signer);
    const tx = await contract.refundEscrow(escrowId);
    return tx.wait();
  }

  // ─── READ ─────────────────────────────────────────────────

  /**
   * Get invoice details
   */
  async getInvoice(invoiceId) {
    const r = await this.contract.getInvoice(invoiceId);
    return {
      id: r.id ?? r[0],
      from: r.from ?? r[1],
      to: r.to ?? r[2],
      token: r.token ?? r[3],
      amount: r.amount ?? r[4],
      description: r.description ?? r[5],
      status: Number(r.status ?? r[6]),
      createdAt: r.createdAt ?? r[7],
      paidAt: r.paidAt ?? r[8],
      metadataHash: r.metadataHash ?? r[9],
    };
  }

  /**
   * Get escrow details
   */
  async getEscrow(escrowId) {
    const r = await this.contract.getEscrow(escrowId);
    return {
      id: r.id ?? r[0],
      from: r.from ?? r[1],
      to: r.to ?? r[2],
      token: r.token ?? r[3],
      amount: r.amount ?? r[4],
      description: r.description ?? r[5],
      released: r.released ?? r[6],
      refunded: r.refunded ?? r[7],
      createdAt: r.createdAt ?? r[8],
      releaseAfter: r.releaseAfter ?? r[9],
    };
  }

  /**
   * Get invoice IDs sent by an agent
   */
  async getSentInvoices(address) {
    const ids = await this.contract.getSentInvoices(address);
    return ids.map(Number);
  }

  /**
   * Get invoice IDs received by an agent
   */
  async getReceivedInvoices(address) {
    const ids = await this.contract.getReceivedInvoices(address);
    return ids.map(Number);
  }

  /**
   * Check if a token is supported
   */
  async isSupportedToken(token) {
    return this.contract.supportedTokens(token);
  }

  /**
   * Get current fee in BPS
   */
  async feeBps() {
    const r = await this.contract.feeBps();
    return Number(r);
  }
}

let PAYMENTS_ABI = null;

export function setPaymentsAbi(abi) {
  PAYMENTS_ABI = abi;
}
