import { Contract, AbiCoder } from 'ethers';

const abi = AbiCoder.defaultAbiCoder();

/**
 * ERC-8004 IdentityRegistry — agent registration via NFT (ERC-721)
 */
export class ERC8004Identity {
  constructor(provider, address) {
    this.address = address;
    this.contract = new Contract(address, IDENTITY_ABI, provider);
  }

  /**
   * Register an agent with a URI (data URI, IPFS, or HTTPS)
   * @param {Signer} signer
   * @param {string} agentURI - registration file URI
   * @returns {{ tx, agentId }}
   */
  async register(signer, agentURI) {
    // Use explicit function signature to disambiguate
    const iface = this.contract.interface;
    const data = iface.encodeFunctionData('register(string)', [agentURI]);
    const tx = await signer.sendTransaction({ to: this.address, data });
    const receipt = await tx.wait();

    let agentId = null;
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed?.name === 'Transfer' && parsed.args.from === '0x0000000000000000000000000000000000000000') {
          agentId = parsed.args.tokenId.toString();
        }
        if (parsed?.name === 'Registered') {
          agentId = parsed.args.agentId.toString();
        }
      } catch {}
    }
    return { tx: receipt, agentId };
  }

  /**
   * Register an agent without URI (set later with setAgentURI)
   * @param {Signer} signer
   * @returns {{ tx, agentId }}
   */
  async registerEmpty(signer) {
    const iface = this.contract.interface;
    const data = iface.encodeFunctionData('register()');
    const tx = await signer.sendTransaction({ to: this.address, data });
    const receipt = await tx.wait();

    let agentId = null;
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed?.name === 'Transfer' && parsed.args.from === '0x0000000000000000000000000000000000000000') {
          agentId = parsed.args.tokenId.toString();
        }
      } catch {}
    }
    return { tx: receipt, agentId };
  }

  /**
   * Update agent URI
   */
  async setAgentURI(signer, agentId, newURI) {
    const contract = this.contract.connect(signer);
    const tx = await contract.setAgentURI(agentId, newURI);
    return tx.wait();
  }

  /**
   * Set on-chain metadata
   */
  async setMetadata(signer, agentId, key, value) {
    const contract = this.contract.connect(signer);
    const tx = await contract.setMetadata(agentId, key, value);
    return tx.wait();
  }

  /**
   * Get on-chain metadata
   */
  async getMetadata(agentId, key) {
    return this.contract.getMetadata(agentId, key);
  }

  /**
   * Get agent's payment wallet
   */
  async getAgentWallet(agentId) {
    return this.contract.getAgentWallet(agentId);
  }

  /**
   * Get agent URI (registration file)
   */
  async tokenURI(agentId) {
    return this.contract.tokenURI(agentId);
  }

  /**
   * Get agent owner
   */
  async ownerOf(agentId) {
    return this.contract.ownerOf(agentId);
  }

  /**
   * Get agent count for an address
   */
  async balanceOf(address) {
    const r = await this.contract.balanceOf(address);
    return Number(r);
  }

  /**
   * Get agent registration file (parsed JSON from URI)
   */
  async getAgentFile(agentId) {
    const uri = await this.tokenURI(agentId);
    if (uri.startsWith('data:application/json;base64,')) {
      const base64 = uri.split(',')[1];
      return JSON.parse(Buffer.from(base64, 'base64').toString());
    }
    // For HTTP/IPFS URIs, caller needs to fetch externally
    return { _uri: uri, _note: 'Fetch this URI externally' };
  }
}

/**
 * ERC-8004 ReputationRegistry — feedback and scoring
 */
export class ERC8004Reputation {
  constructor(provider, address) {
    this.address = address;
    this.contract = new Contract(address, REPUTATION_ABI, provider);
  }

  /**
   * Give feedback to an agent
   * @param {Signer} signer
   * @param {number} agentId
   * @param {number} value - fixed-point value
   * @param {number} valueDecimals - 0-18
   * @param {string} tag1 - optional tag
   * @param {string} tag2 - optional tag
   * @param {string} endpoint - optional endpoint
   * @param {string} feedbackURI - optional off-chain file URI
   * @param {string} feedbackHash - optional keccak256 hash
   */
  async giveFeedback(signer, agentId, value, valueDecimals = 0, tag1 = '', tag2 = '', endpoint = '', feedbackURI = '', feedbackHash = '0x0000000000000000000000000000000000000000000000000000000000000000') {
    const contract = this.contract.connect(signer);
    // Encode int128 value
    const encodedValue = BigInt(value);
    const tx = await contract.giveFeedback(agentId, encodedValue, valueDecimals, tag1, tag2, endpoint, feedbackURI, feedbackHash);
    return tx.wait();
  }

  /**
   * Revoke previously given feedback
   */
  async revokeFeedback(signer, agentId, feedbackIndex) {
    const contract = this.contract.connect(signer);
    const tx = await contract.revokeFeedback(agentId, feedbackIndex);
    return tx.wait();
  }

  /**
   * Get feedback details
   */
  async getFeedback(agentId, clientAddress, feedbackIndex) {
    const r = await this.contract.getFeedback(agentId, clientAddress, feedbackIndex);
    return {
      value: r.value ?? r[0],
      valueDecimals: Number(r.valueDecimals ?? r[1]),
      tag1: r.tag1 ?? r[2],
      tag2: r.tag2 ?? r[3],
      isRevoked: r.isRevoked ?? r[4],
    };
  }

  /**
   * Get agent's aggregate score
   */
  async getAgentScore(agentId) {
    const r = await this.contract.getAgentScore(agentId);
    return {
      score: r.score ?? r[0],
      decimals: Number(r.decimals ?? r[1]),
    };
  }

  /**
   * Get the IdentityRegistry address
   */
  async getIdentityRegistry() {
    return this.contract.getIdentityRegistry();
  }
}

// ─── ABIs ────────────────────────────────────────────────────
const IDENTITY_ABI = [
  'function register(string agentURI) external returns (uint256 agentId)',
  'function register() external returns (uint256 agentId)',
  'function ownerOf(uint256 tokenId) external view returns (address)',
  'function tokenURI(uint256 tokenId) external view returns (string)',
  'function totalSupply() external view returns (uint256)',
  'function balanceOf(address owner) external view returns (uint256)',
  'function getMetadata(uint256 agentId, string metadataKey) external view returns (bytes)',
  'function setMetadata(uint256 agentId, string metadataKey, bytes metadataValue) external',
  'function setAgentURI(uint256 agentId, string newURI) external',
  'function getAgentWallet(uint256 agentId) external view returns (address)',
  'function setAgentWallet(uint256 agentId, address newWallet, uint256 deadline, bytes signature) external',
  'event Registered(uint256 indexed agentId, string agentURI, address indexed owner)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
  'event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy)',
  'event MetadataSet(uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue)',
];

const REPUTATION_ABI = [
  'function getIdentityRegistry() external view returns (address)',
  'function giveFeedback(uint256 agentId, int128 value, uint8 valueDecimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash) external',
  'function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external',
  'function getFeedback(uint256 agentId, address clientAddress, uint64 feedbackIndex) external view returns (int128 value, uint8 valueDecimals, string tag1, string tag2, bool isRevoked)',
  'function getAgentScore(uint256 agentId) external view returns (int256 score, uint8 decimals)',
  'event NewFeedback(uint256 indexed agentId, address indexed clientAddress, uint64 feedbackIndex, int128 value, uint8 valueDecimals, string indexed indexedTag1, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 feedbackHash)',
];
