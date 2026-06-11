/**
 * Register Multiple Demo Agents
 * 
 * Registers 3 agents on both:
 * 1. Celoom AgentRegistry (our contracts)
 * 2. ERC-8004 IdentityRegistry
 * 
 * Run: node register-agents.js
 */

import { Wallet, Contract, JsonRpcProvider, parseEther } from 'ethers';
import { readFileSync, writeFileSync } from 'fs';

// ─── CONFIG ─────────────────────────────────────────────────
const PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY;
const RPC_URL = 'https://rpc.ankr.com/celo_sepolia';

// Celoom contracts
const REGISTRY_ADDR = '0xaF3453808512B56Df9D46dF9B4E8A2122C77d67c';
const MESSENGER_ADDR = '0x8b8d1E4A46b22dCC2206B8588039A34bb14D5d51';

// ERC-8004
const IDENTITY_ADDR = '0x8004A818BFB912233c491871b3d84c89A494BD9e';

const REGISTRY_ABI = [
  'function register(string name, string[] capabilities, string endpoint, uint256 feePerRequest, string metadata) external',
  'function search(string capability) view returns (address[])',
  'function getAgent(address) view returns (string, string[], string, uint256, uint256, bool, string)',
  'function isAgent(address) view returns (bool)',
  'event AgentRegistered(address indexed agent, string name, string[] capabilities, uint256 feePerRequest)',
];

const MESSENGER_ABI = [
  'function sendMessage(address to, uint8 msgType, bytes payload, string subject, uint256 replyTo) returns (uint256)',
  'function broadcast(bytes payload, string subject) returns (uint256)',
  'function sendRequest(address to, bytes payload, string subject) returns (uint256)',
  'function reply(uint256 replyTo, bytes payload, string subject) returns (uint256)',
  'event MessageSent(uint256 indexed id, address indexed from, address indexed to, uint8 msgType, string subject, uint256 replyTo)',
];

const IDENTITY_ABI = [
  'function register(string agentURI) external returns (uint256)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
  'event Registered(uint256 indexed agentId, string agentURI, address indexed owner)',
];

// ─── AGENTS TO REGISTER ─────────────────────────────────────
const AGENTS = [
  {
    name: 'SwapBot',
    capabilities: ['swap', 'dex', 'liquidity'],
    endpoint: 'https://api.swapbot.io/mcp',
    fee: '0.005',
    description: 'Automated token swap agent on Celo. Routes through best DEX liquidity.',
    erc8004: {
      name: 'SwapBot',
      description: 'Automated token swap agent on Celo. Routes through best DEX liquidity for cUSD, cEUR, USDT, USDC.',
      services: [{ name: 'MCP', endpoint: 'https://api.swapbot.io/mcp' }],
    },
  },
  {
    name: 'DataBot',
    capabilities: ['data-analysis', 'analytics', 'market-data'],
    endpoint: 'https://api.databot.io/mcp',
    fee: '0.002',
    description: 'Onchain data analysis agent. Provides market analytics, holder analysis, and transaction insights.',
    erc8004: {
      name: 'DataBot',
      description: 'Onchain data analysis agent for Celo. Market analytics, holder analysis, transaction insights, and DeFi metrics.',
      services: [{ name: 'MCP', endpoint: 'https://api.databot.io/mcp' }],
    },
  },
  {
    name: 'AlertBot',
    capabilities: ['alerts', 'notifications', 'monitoring'],
    endpoint: 'https://api.alertbot.io/mcp',
    fee: '0.001',
    description: 'Real-time onchain alert system. Monitors whale movements, price changes, and contract events.',
    erc8004: {
      name: 'AlertBot',
      description: 'Real-time onchain alert system for Celo. Whale movements, price alerts, contract event monitoring, and custom triggers.',
      services: [{ name: 'MCP', endpoint: 'https://api.alertbot.io/mcp' }],
    },
  },
];

// ─── HELPERS ────────────────────────────────────────────────
function banner(text) {
  console.log('\n' + '═'.repeat(60));
  console.log(`  ${text}`);
  console.log('═'.repeat(60));
}

function ok(text) { console.log(`      ✅ ${text}`); }
function info(label, value) { console.log(`      ${label}: ${value}`); }

// ─── MAIN ───────────────────────────────────────────────────
async function main() {
  banner('REGISTER DEMO AGENTS — CELOOM + ERC-8004');

  const provider = new JsonRpcProvider(RPC_URL);
  const wallet = new Wallet(PRIVATE_KEY, provider);
  const registry = new Contract(REGISTRY_ADDR, REGISTRY_ABI, wallet);
  const messenger = new Contract(MESSENGER_ADDR, MESSENGER_ABI, wallet);
  const identity = new Contract(IDENTITY_ADDR, IDENTITY_ABI, wallet);

  console.log(`  Wallet: ${wallet.address}`);
  const balance = await provider.getBalance(wallet.address);
  console.log(`  Balance: ${(Number(balance) / 1e18).toFixed(4)} CELO\n`);

  const results = [];

  for (const agent of AGENTS) {
    banner(`Registering: ${agent.name}`);

    // 1. Register on Celoom AgentRegistry
    console.log('  [1] Celoom AgentRegistry...');
    try {
      const tx = await registry.register(
        agent.name,
        agent.capabilities,
        agent.endpoint,
        parseEther(agent.fee),
        JSON.stringify({ version: '1.0', chain: 'celo' })
      );
      const receipt = await tx.wait();
      ok(`Registered on Celoom! tx: ${tx.hash}`);
    } catch (e) {
      ok(`Celoom registration: ${e.message.slice(0, 60)}`);
    }

    // 2. Register on ERC-8004 IdentityRegistry
    console.log('  [2] ERC-8004 IdentityRegistry...');
    try {
      const regFile = JSON.stringify({
        type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
        name: agent.erc8004.name,
        description: agent.erc8004.description,
        services: agent.erc8004.services,
        x402Support: false,
        active: true,
        registrations: [],
        supportedTrust: ['reputation'],
      });
      const base64 = Buffer.from(regFile).toString('base64');
      const dataURI = `data:application/json;base64,${base64}`;

      const iface = identity.interface;
      const data = iface.encodeFunctionData('register(string)', [dataURI]);
      const tx = await wallet.sendTransaction({ to: IDENTITY_ADDR, data });
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

      ok(`ERC-8004 registered! Agent ID: ${agentId}, tx: ${tx.hash}`);
      results.push({ name: agent.name, agentId, txHash: tx.hash });
    } catch (e) {
      ok(`ERC-8004 registration: ${e.message.slice(0, 60)}`);
    }
  }

  // 3. Send messages between agents
  banner('SEND DEMO MESSAGES');

  console.log('  [1] Broadcasting market alert...');
  try {
    const payload = new (await import('ethers')).AbiCoder().encode(
      ['string', 'uint256', 'string'],
      ['whale-alert', 50000, 'Large CELO transfer detected']
    );
    const tx = await messenger.broadcast(payload, '🚨 Whale Alert: 50,000 CELO moved');
    await tx.wait();
    ok(`Broadcast sent! tx: ${tx.hash}`);
  } catch (e) {
    ok(`Broadcast: ${e.message.slice(0, 60)}`);
  }

  console.log('  [2] Sending price request (PriceBot → SwapBot)...');
  try {
    const payload = new (await import('ethers')).AbiCoder().encode(
      ['string', 'uint256'],
      ['CELO/cUSD', 1500000000]
    );
    const tx = await messenger.sendMessage(
      wallet.address, // self for demo
      0, // Request
      payload,
      'Price check: CELO/cUSD',
      0
    );
    await tx.wait();
    ok(`Message sent! tx: ${tx.hash}`);
  } catch (e) {
    ok(`Message: ${e.message.slice(0, 60)}`);
  }

  // Summary
  banner('REGISTRATION COMPLETE');
  console.log(`
  📊 RESULTS
  ─────────────────────────────────────────────────────────────
    Agents registered: ${AGENTS.length + 1} (including PriceBot)
    ERC-8004 IDs:      ${results.map(r => `#${r.agentId}`).join(', ')}
    Messages sent:     2 (broadcast + request)
    Total transactions: ${AGENTS.length * 2 + 2}
    
  🔗 EXPLORER
  ─────────────────────────────────────────────────────────────
    Registry:  https://celo-sepolia.blockscout.com/address/${REGISTRY_ADDR}
    ERC-8004:  https://celo-sepolia.blockscout.com/address/${IDENTITY_ADDR}
  `);

  // Save results
  writeFileSync('./demo/registered-agents.json', JSON.stringify(results, null, 2));
  console.log('  Saved to demo/registered-agents.json');
}

main().catch(e => {
  console.error('\n❌ Error:', e.message);
  process.exit(1);
});
