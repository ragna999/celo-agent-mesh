/**
 * ERC-8004 Registration Script
 * 
 * Registers Celoom on the ERC-8004 IdentityRegistry on Celo Sepolia.
 * Uses data URI for fully on-chain metadata.
 * 
 * Run: node register.js
 */

import { Wallet, Contract, JsonRpcProvider } from 'ethers';
import { readFileSync } from 'fs';

// ─── CONFIG ─────────────────────────────────────────────────
const PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY;
const RPC_URL = 'https://rpc.ankr.com/celo_sepolia';

// ERC-8004 IdentityRegistry on Celo Sepolia
const IDENTITY_REGISTRY = '0x8004A818BFB912233c491871b3d84c89A494BD9e';

// Minimal ABI for register function
const IDENTITY_ABI = [
  'function register(string agentURI) external returns (uint256 agentId)',
  'function register() external returns (uint256 agentId)',
  'function ownerOf(uint256 tokenId) external view returns (address)',
  'function totalSupply() external view returns (uint256)',
  'function tokenURI(uint256 tokenId) external view returns (string)',
  'event Registered(uint256 indexed agentId, string agentURI, address indexed owner)',
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
];

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  ERC-8004 REGISTRATION — Celoom');
  console.log('═══════════════════════════════════════════════\n');

  const provider = new JsonRpcProvider(RPC_URL);
  const wallet = new Wallet(PRIVATE_KEY, provider);
  const registry = new Contract(IDENTITY_REGISTRY, IDENTITY_ABI, wallet);

  console.log(`  Wallet:    ${wallet.address}`);
  console.log(`  Registry:  ${IDENTITY_REGISTRY}`);
  console.log(`  Network:   Celo Sepolia\n`);

  // Check balance
  const balance = await provider.getBalance(wallet.address);
  console.log(`  Balance:   ${balance.toString()} wei\n`);

  // Load registration file
  const regFile = readFileSync('./erc8004/agent-registration.json', 'utf8');
  const regData = JSON.parse(regFile);

  // Create data URI (fully on-chain)
  const base64 = Buffer.from(regFile).toString('base64');
  const dataURI = `data:application/json;base64,${base64}`;

  console.log('  Registration file loaded');
  console.log(`  Name: ${regData.name}`);
  console.log(`  Description: ${regData.description.slice(0, 60)}...`);
  console.log(`  URI length: ${dataURI.length} chars\n`);

  // Check existing registrations
  try {
    const totalSupply = await registry.totalSupply();
    console.log(`  Current agents registered: ${totalSupply}\n`);
  } catch (e) {
    console.log('  Could not read totalSupply\n');
  }

  // Register
  console.log('  Registering on ERC-8004 IdentityRegistry...');
  
  try {
    const tx = await registry.register(dataURI);
    console.log(`  TX sent: ${tx.hash}`);
    console.log('  Waiting for confirmation...');
    
    const receipt = await tx.wait();
    console.log(`  ✅ Confirmed in block ${receipt.blockNumber}`);

    // Extract agentId from events
    let agentId = null;
    for (const log of receipt.logs) {
      try {
        const parsed = registry.interface.parseLog(log);
        if (parsed?.name === 'Registered') {
          agentId = parsed.args.agentId.toString();
          console.log(`  ✅ Agent ID: ${agentId}`);
          break;
        }
        if (parsed?.name === 'Transfer' && parsed.args.from === '0x0000000000000000000000000000000000000000') {
          agentId = parsed.args.tokenId.toString();
        }
      } catch {}
    }

    if (!agentId) {
      // Try to get from Transfer event
      for (const log of receipt.logs) {
        try {
          const parsed = registry.interface.parseLog(log);
          if (parsed?.name === 'Transfer') {
            agentId = parsed.args.tokenId.toString();
            break;
          }
        } catch {}
      }
    }

    console.log('\n═══════════════════════════════════════════════');
    console.log('  ERC-8004 REGISTRATION COMPLETE');
    console.log('═══════════════════════════════════════════════');
    console.log(`  Agent ID:     ${agentId || 'check explorer'}`);
    console.log(`  Agent URI:    data:application/json;base64,...`);
    console.log(`  TX Hash:      ${tx.hash}`);
    console.log(`  Explorer:     https://celo-sepolia.blockscout.com/tx/${tx.hash}`);
    console.log(`  Registry:     https://sepolia.celoscan.io/address/${IDENTITY_REGISTRY}`);
    console.log(`  8004 Format:  eip155:11142220:${IDENTITY_REGISTRY}:${agentId || '?'}`);
    console.log('');

    // Save result
    const result = {
      agentId,
      txHash: tx.hash,
      registry: IDENTITY_REGISTRY,
      agentRegistry: `eip155:11142220:${IDENTITY_REGISTRY}`,
      network: 'celo-sepolia',
      registeredAt: new Date().toISOString(),
    };
    
    const fs = await import('fs');
    fs.writeFileSync('./erc8004/registered.json', JSON.stringify(result, null, 2));
    console.log('  Saved to erc8004/registered.json');

  } catch (e) {
    console.error(`\n  ❌ Registration failed: ${e.message}`);
    
    if (e.message.includes('insufficient funds')) {
      console.log('  → Need more CELO for gas. Get from faucet.');
    }
  }
}

main().catch(console.error);
