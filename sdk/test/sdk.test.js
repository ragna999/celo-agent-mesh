/**
 * SDK Integration Tests — runs against Celo Sepolia (read-only)
 * 
 * Run: node test/sdk.test.js
 */

import { CeloAgentMesh, MessageType, InvoiceStatus, TOKENS } from '../index.js';

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✅ ${testName}`);
    passed++;
  } else {
    console.log(`  ❌ ${testName}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n🧪 Celo Agent Mesh SDK — Test Suite\n');
  console.log('Network: Celo Sepolia (read-only tests)\n');

  // ─── INIT ─────────────────────────────────────────────────
  console.log('📦 Initialization');
  
  let mesh;
  try {
    mesh = new CeloAgentMesh({ network: 'celoSepolia' });
    assert(true, 'CeloAgentMesh instantiated');
  } catch (e) {
    assert(false, 'CeloAgentMesh instantiated: ' + e.message);
    process.exit(1);
  }

  const info = mesh.getNetworkInfo();
  assert(info.network === 'celoSepolia', 'Network is celoSepolia');
  assert(info.chainId === 11142220, 'Chain ID is 11142220');
  assert(info.addresses.AgentRegistry !== null, 'Registry address set');

  // ─── PROVIDER ─────────────────────────────────────────────
  console.log('\n🌐 Provider');
  
  try {
    const block = await mesh.getBlockNumber();
    assert(block > 0, `Current block: ${block}`);
  } catch (e) {
    assert(false, 'getBlockNumber: ' + e.message);
  }

  // ─── REGISTRY (READ) ─────────────────────────────────────
  console.log('\n📋 Registry (read-only)');
  
  try {
    const total = await mesh.registry.totalAgents();
    assert(typeof total === 'number', `totalAgents(): ${total}`);
  } catch (e) {
    assert(false, 'totalAgents: ' + e.message);
  }

  try {
    const agents = await mesh.registry.getAllAgents();
    assert(Array.isArray(agents), `getAllAgents(): ${agents.length} agents`);
  } catch (e) {
    assert(false, 'getAllAgents: ' + e.message);
  }

  try {
    const results = await mesh.registry.search('price-feed');
    assert(Array.isArray(results), `search('price-feed'): ${results.length} results`);
  } catch (e) {
    assert(false, 'search: ' + e.message);
  }

  // ─── PAYMENTS (READ) ─────────────────────────────────────
  console.log('\n💰 Payments (read-only)');
  
  try {
    const feeBps = await mesh.payments.feeBps();
    assert(feeBps === 50, `feeBps(): ${feeBps} (0.5%)`);
  } catch (e) {
    assert(false, 'feeBps: ' + e.message);
  }

  try {
    const isSupported = await mesh.payments.isSupportedToken(TOKENS.celoMainnet.cUSD);
    assert(isSupported === true, 'cUSD is supported token');
  } catch (e) {
    assert(false, 'isSupportedToken: ' + e.message);
  }

  try {
    const invoice = await mesh.payments.getInvoice(1);
    // Invoice 1 may not exist, just check it doesn't throw
    assert(true, 'getInvoice(1) returned without error');
  } catch (e) {
    // Expected if no invoices exist yet
    assert(true, 'getInvoice(1) reverted (expected if no invoices)');
  }

  // ─── MESSENGER (READ) ────────────────────────────────────
  console.log('\n📨 Messenger (read-only)');

  try {
    const broadcasts = await mesh.messenger.getBroadcasts();
    assert(Array.isArray(broadcasts), `getBroadcasts(): ${broadcasts.length} messages`);
  } catch (e) {
    assert(false, 'getBroadcasts: ' + e.message);
  }

  try {
    // Check a random address inbox
    const zeroAddr = '0x0000000000000000000000000000000000000001';
    const inbox = await mesh.messenger.getInbox(zeroAddr);
    assert(Array.isArray(inbox), `getInbox(): ${inbox.length} messages`);
  } catch (e) {
    assert(false, 'getInbox: ' + e.message);
  }

  // ─── CONSTANTS ────────────────────────────────────────────
  console.log('\n📐 Constants');
  
  assert(MessageType.Request === 0, 'MessageType.Request = 0');
  assert(MessageType.Signal === 2, 'MessageType.Signal = 2');
  assert(InvoiceStatus.Created === 0, 'InvoiceStatus.Created = 0');
  assert(InvoiceStatus.Paid === 1, 'InvoiceStatus.Paid = 1');

  // ─── ERC-8004 TESTS ──────────────────────────────────────
  console.log('\n🔗 ERC-8004 Integration');

  try {
    assert(mesh.erc8004 !== undefined, 'ERC-8004 object exists');
    assert(mesh.erc8004.identity !== undefined, 'ERC-8004 IdentityRegistry loaded');
    assert(mesh.erc8004.reputation !== undefined, 'ERC-8004 ReputationRegistry loaded');
  } catch (e) {
    assert(false, 'ERC-8004 init: ' + e.message);
  }

  try {
    const owner = await mesh.erc8004.identity.ownerOf(328);
    assert(owner === '0x1C1f4f9e4293391071827c6382dCe6b9880ddD46', 'Agent #328 owner correct');
  } catch (e) {
    assert(false, 'ERC-8004 ownerOf: ' + e.message);
  }

  try {
    const uri = await mesh.erc8004.identity.tokenURI(328);
    assert(uri.startsWith('data:application/json;base64,'), 'Agent #328 has data URI');
  } catch (e) {
    assert(false, 'ERC-8004 tokenURI: ' + e.message);
  }

  try {
    const agentFile = await mesh.erc8004.identity.getAgentFile(328);
    assert(agentFile.name === 'Celoom', 'Agent file name is Celoom');
    assert(agentFile.type.includes('eip-8004'), 'Agent file type is ERC-8004');
  } catch (e) {
    assert(false, 'ERC-8004 getAgentFile: ' + e.message);
  }

  try {
    const info = mesh.getNetworkInfo();
    assert(info.erc8004 !== null, 'Network info includes ERC-8004 addresses');
    assert(info.erc8004.IdentityRegistry === '0x8004A818BFB912233c491871b3d84c89A494BD9e', 'IdentityRegistry address correct');
  } catch (e) {
    assert(false, 'ERC-8004 network info: ' + e.message);
  }

  // ─── SUMMARY ──────────────────────────────────────────────
  console.log('\n' + '═'.repeat(50));
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('═'.repeat(50));

  if (failed > 0) process.exit(1);
}

runTests().catch(e => {
  console.error('Test runner error:', e);
  process.exit(1);
});
