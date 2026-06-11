/**
 * @celo-agent-mesh/sdk
 * 
 * JavaScript SDK for Celo Agent Mesh — agent discovery, payments, and messaging on Celo.
 * Now with ERC-8004 support for agent identity and reputation.
 * 
 * Usage:
 *   import { CeloAgentMesh } from '@celo-agent-mesh/sdk';
 *   
 *   const mesh = new CeloAgentMesh({ network: 'celoSepolia' });
 *   
 *   // Read-only (no wallet needed)
 *   const agents = await mesh.registry.search('price-feed');
 *   
 *   // ERC-8004 — register agent identity
 *   const { agentId } = await mesh.erc8004.identity.register(signer, dataURI);
 *   
 *   // ERC-8004 — give feedback
 *   await mesh.erc8004.reputation.giveFeedback(signer, agentId, 95, 0, 'starred');
 */

import { JsonRpcProvider } from 'ethers';
import { AgentRegistry, setRegistryAbi } from './src/registry.js';
import { AgentPayments, setPaymentsAbi } from './src/payments.js';
import { AgentMessenger, setMessengerAbi } from './src/messenger.js';
import { ERC8004Identity, ERC8004Reputation } from './src/erc8004.js';
import { CONTRACTS, TOKENS, ERC8004, MessageType, InvoiceStatus, DEFAULT_NETWORK } from './src/constants.js';
import abis from './src/abis.json' with { type: 'json' };

// Set ABIs on classes
setRegistryAbi(abis.AgentRegistry);
setPaymentsAbi(abis.AgentPayments);
setMessengerAbi(abis.AgentMessenger);

export class CeloAgentMesh {
  /**
   * @param {Object} opts
   * @param {string} opts.network - 'celoSepolia' or 'celoMainnet' (default: 'celoSepolia')
   * @param {string} opts.rpcUrl - custom RPC URL (overrides network default)
   * @param {Object} opts.addresses - override contract addresses
   */
  constructor(opts = {}) {
    const network = opts.network || DEFAULT_NETWORK;
    const config = CONTRACTS[network];
    const erc8004Config = ERC8004[network];
    
    if (!config) throw new Error(`Unknown network: ${network}`);
    
    const rpcUrl = opts.rpcUrl || config.rpc;
    const addresses = opts.addresses || {
      AgentRegistry: config.AgentRegistry,
      AgentPayments: config.AgentPayments,
      AgentMessenger: config.AgentMessenger,
    };

    if (!addresses.AgentRegistry || !addresses.AgentPayments || !addresses.AgentMessenger) {
      throw new Error(`Contracts not deployed on ${network}. Pass custom addresses.`);
    }

    this.network = network;
    this.provider = new JsonRpcProvider(rpcUrl);
    this.addresses = addresses;

    // Celoom contracts
    this.registry = new AgentRegistry(this.provider, addresses.AgentRegistry);
    this.payments = new AgentPayments(this.provider, addresses.AgentPayments);
    this.messenger = new AgentMessenger(this.provider, addresses.AgentMessenger);

    // ERC-8004 registries
    if (erc8004Config) {
      this.erc8004 = {
        identity: new ERC8004Identity(this.provider, erc8004Config.IdentityRegistry),
        reputation: new ERC8004Reputation(this.provider, erc8004Config.ReputationRegistry),
      };
    }
  }

  /**
   * Get current block number
   */
  async getBlockNumber() {
    return this.provider.getBlockNumber();
  }

  /**
   * Get network info including ERC-8004 addresses
   */
  getNetworkInfo() {
    return {
      network: this.network,
      chainId: CONTRACTS[this.network].chainId,
      explorer: CONTRACTS[this.network].explorer,
      addresses: this.addresses,
      erc8004: ERC8004[this.network] || null,
    };
  }
}

// Re-export everything
export { AgentRegistry } from './src/registry.js';
export { AgentPayments } from './src/payments.js';
export { AgentMessenger } from './src/messenger.js';
export { ERC8004Identity, ERC8004Reputation } from './src/erc8004.js';
export { CONTRACTS, TOKENS, ERC8004, MessageType, InvoiceStatus, DEFAULT_NETWORK } from './src/constants.js';
export { default as abis } from './src/abis.json' with { type: 'json' };

export default CeloAgentMesh;
