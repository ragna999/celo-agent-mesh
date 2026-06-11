#!/usr/bin/env node

/**
 * Celo Agent Mesh — Live Demo Script
 * 
 * Demonstrates the full agent workflow on Celo Sepolia:
 *   1. Network status
 *   2. Register two agents (PriceBot + SwapBot)
 *   3. Search agents by capability
 *   4. Get agent details
 *   5. Send message between agents
 *   6. Broadcast signal
 *   7. Check inbox
 * 
 * Run: node demo.js
 */

import { JsonRpcProvider, Wallet, AbiCoder, parseEther, formatEther } from 'ethers';
import { CeloAgentMesh, MessageType } from '../sdk/index.js';

// ─── CONFIG ─────────────────────────────────────────────────
const PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY;
const NETWORK = 'celoSepolia';

const mesh = new CeloAgentMesh({ network: NETWORK });
const signer = new Wallet(PRIVATE_KEY, mesh.provider);

const abi = AbiCoder.defaultAbiCoder();

// ─── HELPERS ────────────────────────────────────────────────
function banner(text) {
  console.log('\n' + '═'.repeat(60));
  console.log(`  ${text}`);
  console.log('═'.repeat(60));
}

function step(n, text) {
  console.log(`\n  [${n}] ${text}`);
}

function ok(text) {
  console.log(`      ✅ ${text}`);
}

function info(label, value) {
  console.log(`      ${label}: ${value}`);
}

// ─── DEMO ───────────────────────────────────────────────────
async function runDemo() {
  banner('CELO AGENT MESH — LIVE DEMO');
  console.log(`  Network: ${NETWORK}`);
  console.log(`  Wallet:  ${signer.address}`);
  
  const balance = await mesh.provider.getBalance(signer.address);
  console.log(`  Balance: ${formatEther(balance)} CELO`);

  // ─── 1. NETWORK STATUS ─────────────────────────────────
  banner('1. NETWORK STATUS');
  
  const block = await mesh.getBlockNumber();
  const netInfo = mesh.getNetworkInfo();
  const totalAgents = await mesh.registry.totalAgents();
  
  info('Chain ID', netInfo.chainId);
  info('Block', block);
  info('Explorer', netInfo.explorer);
  info('Registered agents', totalAgents);
  info('Registry', netInfo.addresses.AgentRegistry);
  info('Payments', netInfo.addresses.AgentPayments);
  info('Messenger', netInfo.addresses.AgentMessenger);

  // ─── 2. REGISTER AGENTS ────────────────────────────────
  banner('2. REGISTER AGENTS');
  
  // Check if already registered
  const isAlreadyAgent = await mesh.registry.isAgent(signer.address);
  
  if (!isAlreadyAgent) {
    step('2a', 'Registering PriceBot...');
    try {
      const tx1 = await mesh.registry.register(
        signer,
        'PriceBot',
        ['price-feed', 'oracle', 'market-data'],
        'https://api.pricebot.io/mcp',
        parseEther('0.001'),
        JSON.stringify({ version: '1.0', chain: 'celo', model: 'gpt-4' })
      );
      ok(`PriceBot registered! tx: ${tx1.hash}`);
      ok(`Explorer: https://celo-sepolia.blockscout.com/tx/${tx1.hash}`);
    } catch (e) {
      ok(`Register failed (may already exist): ${e.message.slice(0, 80)}`);
    }
  } else {
    step('2a', 'PriceBot already registered, updating...');
    try {
      const tx1 = await mesh.registry.update(
        signer,
        ['price-feed', 'oracle', 'market-data', 'real-time'],
        'https://api.pricebot.io/mcp/v2',
        parseEther('0.002'),
        true,
        JSON.stringify({ version: '2.0', chain: 'celo', updated: new Date().toISOString() })
      );
      ok(`PriceBot updated! tx: ${tx1.hash}`);
    } catch (e) {
      ok(`Update failed: ${e.message.slice(0, 80)}`);
    }
  }

  // ─── 3. SEARCH AGENTS ──────────────────────────────────
  banner('3. SEARCH AGENTS BY CAPABILITY');
  
  const capabilities = ['price-feed', 'oracle', 'market-data', 'swap'];
  
  for (const cap of capabilities) {
    const agents = await mesh.registry.search(cap);
    const count = agents.length;
    const marker = count > 0 ? '🟢' : '⚪';
    console.log(`      ${marker} "${cap}" → ${count} agent(s)`);
    
    if (count > 0) {
      for (const addr of agents) {
        try {
          const agent = await mesh.registry.getAgent(addr);
          console.log(`         └─ ${agent.name} (${addr.slice(0, 10)}...)`);
          console.log(`            Caps: ${agent.capabilities.join(', ')}`);
          console.log(`            Fee:  ${formatEther(agent.feePerRequest)} CELO/req`);
          console.log(`            Reqs: ${agent.totalRequests}`);
        } catch {}
      }
    }
  }

  // ─── 4. GET AGENT DETAILS ──────────────────────────────
  banner('4. AGENT DETAILS');
  
  try {
    const agent = await mesh.registry.getAgent(signer.address);
    info('Name', agent.name);
    info('Owner', signer.address);
    info('Capabilities', agent.capabilities.join(', '));
    info('Endpoint', agent.endpoint);
    info('Fee/request', formatEther(agent.feePerRequest) + ' CELO');
    info('Total requests', agent.totalRequests.toString());
    info('Active', agent.active);
    info('Metadata', agent.metadata);
  } catch (e) {
    console.log(`      Could not fetch agent: ${e.message}`);
  }

  // ─── 5. SEND MESSAGE ───────────────────────────────────
  banner('5. ONCHAIN MESSAGING');
  
  // Encode a price request payload
  const payload = abi.encode(
    ['string', 'uint256', 'address'],
    ['ETH/USD', 180000000000, signer.address]  // $1800 with 8 decimals
  );

  step('5a', 'Sending price request message...');
  try {
    const { tx, messageId } = await mesh.messenger.sendMessage(
      signer,
      signer.address,  // sending to self for demo
      MessageType.Request,
      payload,
      'Price check: ETH/USD',
      0
    );
    ok(`Message sent! ID: ${messageId}, tx: ${tx.hash}`);
  } catch (e) {
    ok(`Message failed: ${e.message.slice(0, 80)}`);
  }

  // ─── 6. BROADCAST SIGNAL ───────────────────────────────
  step('5b', 'Broadcasting market signal...');
  
  const signal = abi.encode(
    ['string', 'uint256', 'string'],
    ['whale-alert', 50000, 'Large CELO transfer detected on chain']
  );

  try {
    const { tx, messageId } = await mesh.messenger.broadcast(
      signer,
      signal,
      '🚨 Whale Alert: 50,000 CELO moved'
    );
    ok(`Broadcast sent! ID: ${messageId}, tx: ${tx.hash}`);
  } catch (e) {
    ok(`Broadcast failed: ${e.message.slice(0, 80)}`);
  }

  // ─── 7. CHECK INBOX ────────────────────────────────────
  banner('6. INBOX STATUS');
  
  try {
    const inbox = await mesh.messenger.getInbox(signer.address);
    const unread = await mesh.messenger.getUnreadCount(signer.address);
    const sent = await mesh.messenger.getSentMessages(signer.address);
    const broadcasts = await mesh.messenger.getBroadcasts();
    
    info('Inbox messages', inbox.length);
    info('Unread', unread);
    info('Sent messages', sent.length);
    info('Total broadcasts', broadcasts.length);

    if (inbox.length > 0) {
      console.log('\n      Latest messages:');
      for (const id of inbox.slice(-3)) {
        try {
          const msg = await mesh.messenger.getMessage(id);
          const typeNames = ['Request', 'Response', 'Signal', 'Payment', 'System'];
          console.log(`        #${id} [${typeNames[msg.msgType]}] "${msg.subject}"`);
          console.log(`           From: ${msg.from.slice(0, 10)}... | Read: ${msg.read}`);
        } catch {}
      }
    }
  } catch (e) {
    console.log(`      Inbox error: ${e.message}`);
  }

  // ─── SUMMARY ───────────────────────────────────────────
  banner('DEMO COMPLETE');
  
  const finalBlock = await mesh.getBlockNumber();
  const finalTotal = await mesh.registry.totalAgents();
  
  console.log(`
  📊 RESULTS
  ─────────────────────────────────────────────────────────────
    Network:         ${NETWORK} (Chain ${netInfo.chainId})
    Blocks elapsed:  ${finalBlock - block}
    Agents on mesh:  ${finalTotal}
    Wallet:          ${signer.address}
    
  📦 PROJECT STRUCTURE
  ─────────────────────────────────────────────────────────────
    contracts/       Solidity smart contracts (deployed)
    sdk/             JavaScript SDK (@celo-agent-mesh/sdk)
    mcp/             MCP Server (@celo-agent-mesh/mcp) — 26 tools
    
  🔗 LINKS
  ─────────────────────────────────────────────────────────────
    GitHub:    https://github.com/ragna999/celo-agent-mesh
    Explorer:  https://celo-sepolia.blockscout.com
    Registry:  ${netInfo.addresses.AgentRegistry}
  `);
}

runDemo().catch(e => {
  console.error('\n❌ Demo error:', e.message);
  process.exit(1);
});
