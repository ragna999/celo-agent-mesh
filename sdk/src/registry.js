import { Contract } from 'ethers';

/**
 * AgentRegistry — discover, register, and manage AI agents on Celo
 */
export class AgentRegistry {
  constructor(provider, address) {
    this.contract = new Contract(address, REGISTRY_ABI, provider);
  }

  // ─── WRITE (requires signer) ─────────────────────────────

  /**
   * Register your agent onchain
   * @param {Signer} signer - ethers signer
   * @param {string} name - human-readable agent name
   * @param {string[]} capabilities - e.g. ['price-feed', 'swap']
   * @param {string} endpoint - HTTP/MCP endpoint URL
   * @param {bigint} feePerRequest - fee in wei per request
   * @param {string} metadata - JSON string with extra info
   * @returns {tx receipt}
   */
  async register(signer, name, capabilities, endpoint, feePerRequest, metadata = '{}') {
    const contract = this.contract.connect(signer);
    const tx = await contract.register(name, capabilities, endpoint, feePerRequest, metadata);
    return tx.wait();
  }

  /**
   * Update agent details
   */
  async update(signer, capabilities, endpoint, feePerRequest, active, metadata = '{}') {
    const contract = this.contract.connect(signer);
    const tx = await contract.update(capabilities, endpoint, feePerRequest, active, metadata);
    return tx.wait();
  }

  /**
   * Deactivate your agent
   */
  async deactivate(signer) {
    const contract = this.contract.connect(signer);
    const tx = await contract.deactivate();
    return tx.wait();
  }

  // ─── READ ─────────────────────────────────────────────────

  /**
   * Find all active agents with a specific capability
   * @param {string} capability - e.g. 'price-feed'
   * @returns {string[]} array of agent addresses
   */
  async search(capability) {
    return this.contract.search(capability);
  }

  /**
   * Get agent details by address
   * @returns {{ name, capabilities, endpoint, feePerRequest, totalRequests, active, metadata }}
   */
  async getAgent(address) {
    const result = await this.contract.getAgent(address);
    return {
      name: result.name ?? result[0],
      capabilities: result.capabilities ?? result[1],
      endpoint: result.endpoint ?? result[2],
      feePerRequest: result.feePerRequest ?? result[3],
      totalRequests: result.totalRequests ?? result[4],
      active: result.active ?? result[5],
      metadata: result.metadata ?? result[6],
    };
  }

  /**
   * Get total number of registered agents
   */
  async totalAgents() {
    const result = await this.contract.totalAgents();
    return Number(result);
  }

  /**
   * Get all registered agent addresses
   */
  async getAllAgents() {
    return this.contract.getAllAgents();
  }

  /**
   * Check if an address is a registered active agent
   */
  async isAgent(address) {
    return this.contract.isAgent(address);
  }
}

// We import ABI at runtime via the abis.json file
let REGISTRY_ABI = null;

export function setRegistryAbi(abi) {
  REGISTRY_ABI = abi;
}
