// DEPLOYED CONTRACTS
export const CONTRACTS = {
  celoSepolia: {
    chainId: 11142220,
    rpc: 'https://rpc.ankr.com/celo_sepolia',
    explorer: 'https://celo-sepolia.blockscout.com',
    AgentRegistry:   '0xac7D9d7d6c0787a5D5f1090aB07B08A4B39469b7',
    AgentPayments:   '0xb085f38ac543a0F917224351F8E98C6C9926d387',
    AgentMessenger:  '0x0Ff690fC4a6f0bcF8F9e0E3d9c15abA0b71bE35a',
  },
  celoMainnet: {
    chainId: 42220,
    rpc: 'https://forno.celo.org',
    explorer: 'https://celoscan.io',
    AgentRegistry:   '0x6184a0e6fAFb21062fd7Ba66B39DdEf083075140',
    AgentPayments:   '0x7124b6e9510C035F3581E147B10dF6820e24F480',
    AgentMessenger:  '0xaD5c078E3796f785f6eDbF684c3D3037c543B8fb',
  },
};

// CELO STABLECOINS
export const TOKENS = {
  celoMainnet: {
    cUSD: '0x765DE816845861e75A25fCA122bb6898B8B1282a',
    cEUR: '0xD8763CBa276a3738E6DE85b4b3bF5FDed6D6cA73',
    USDT: '0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e',
    USDC: '0xcebA9300f2b948710d2653dD7B07f33A8B32118C',
  },
  celoSepolia: {
    cUSD: '0x874069Fa1Eb16D44d622F2e0Ca25eeA172369bC1',
    cEUR: '0x10C892a6Ec8622Fc734b82f0b2e30d7B2e8e1e3A',
  },
};

// MESSAGE TYPES
export const MessageType = {
  Request:  0,
  Response: 1,
  Signal:   2,
  Payment:  3,
  System:   4,
};

// INVOICE STATUS
export const InvoiceStatus = {
  Created:   0,
  Paid:      1,
  Completed: 2,
  Refunded:  3,
  Disputed:  4,
};

// ─── ERC-8004 REGISTRIES ────────────────────────────────────
export const ERC8004 = {
  celoSepolia: {
    IdentityRegistry:  '0x8004A818BFB912233c491871b3d84c89A494BD9e',
    ReputationRegistry: '0x8004B663056A597Dffe9eCcC1965A193B7388713',
  },
  celoMainnet: {
    IdentityRegistry:  '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
    ReputationRegistry: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63',
  },
};

// ─── DEFAULT NETWORK ────────────────────────────────────────
export const DEFAULT_NETWORK = 'celoSepolia';
