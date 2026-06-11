#!/usr/bin/env node

/**
 * @celo-agent-mesh/mcp
 * 
 * MCP server that exposes Celo Agent Mesh as tools for AI agents.
 * 
 * Tools (read-only — no wallet needed):
 *   - mesh_search_agents     — find agents by capability
 *   - mesh_get_agent         — get agent details
 *   - mesh_total_agents      — count registered agents
 *   - mesh_get_all_agents    — list all agent addresses
 *   - mesh_is_agent          — check if address is registered
 *   - mesh_get_invoice       — get invoice details
 *   - mesh_get_escrow        — get escrow details
 *   - mesh_get_inbox         — get inbox message IDs
 *   - mesh_get_message       — get message by ID
 *   - mesh_get_unread_count  — unread messages count
 *   - mesh_get_thread        — thread between two agents
 *   - mesh_get_broadcasts    — all broadcast message IDs
 *   - mesh_network_info      — network and contract info
 *   - mesh_block_number      — current block number
 * 
 * Tools (write — needs AGENT_PRIVATE_KEY env):
 *   - mesh_register_agent    — register your agent onchain
 *   - mesh_update_agent      — update agent details
 *   - mesh_deactivate_agent  — deactivate your agent
 *   - mesh_create_invoice    — create payment invoice
 *   - mesh_pay_invoice       — pay an invoice
 *   - mesh_pay               — direct payment
 *   - mesh_create_escrow     — create escrow
 *   - mesh_release_escrow    — release escrow funds
 *   - mesh_send_message      — send message to agent
 *   - mesh_send_request      — send request to agent
 *   - mesh_reply             — reply to a message
 *   - mesh_broadcast         — broadcast signal
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Wallet, parseEther, formatEther, formatUnits } from 'ethers';
import { CeloAgentMesh, TOKENS, MessageType, InvoiceStatus } from '@celo-agent-mesh/sdk';

// ─── CONFIG ─────────────────────────────────────────────────
const NETWORK = process.env.CELO_NETWORK || 'celoSepolia';
const PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY || null;

let mesh;
let signer = null;

try {
  mesh = new CeloAgentMesh({ network: NETWORK });
  if (PRIVATE_KEY) {
    signer = new Wallet(PRIVATE_KEY, mesh.provider);
    console.error(`[celo-agent-mesh] Wallet: ${signer.address}`);
  }
  console.error(`[celo-agent-mesh] Network: ${NETWORK}`);
} catch (e) {
  console.error(`[celo-agent-mesh] Init error: ${e.message}`);
  process.exit(1);
}

// ─── HELPERS ────────────────────────────────────────────────
function ok(text) {
  return { content: [{ type: 'text', text: typeof text === 'string' ? text : JSON.stringify(text, null, 2) }] };
}

function err(msg) {
  return { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true };
}

function requireSigner() {
  if (!signer) throw new Error('Set AGENT_PRIVATE_KEY env to use write operations');
  return signer;
}

// ─── SERVER ─────────────────────────────────────────────────
const server = new McpServer({
  name: 'celo-agent-mesh',
  version: '0.1.0',
});

// ═══════════════════════════════════════════════════════════
// READ TOOLS
// ═══════════════════════════════════════════════════════════

server.tool(
  'mesh_search_agents',
  'Find all active agents with a specific capability (e.g. "price-feed", "swap", "data-analysis")',
  {
    capability: z.string().describe('Capability to search for'),
  },
  async ({ capability }) => {
    try {
      const addresses = await mesh.registry.search(capability);
      const agents = [];
      for (const addr of addresses) {
        const agent = await mesh.registry.getAgent(addr);
        agents.push({ address: addr, ...agent });
      }
      return ok({ capability, count: agents.length, agents });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'mesh_get_agent',
  'Get detailed info about a registered agent by address',
  {
    address: z.string().describe('Agent wallet address (0x...)'),
  },
  async ({ address }) => {
    try {
      const agent = await mesh.registry.getAgent(address);
      return ok({ address, ...agent });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'mesh_total_agents',
  'Get the total number of registered agents in the mesh',
  {},
  async () => {
    try {
      const total = await mesh.registry.totalAgents();
      return ok({ totalAgents: total });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'mesh_get_all_agents',
  'Get all registered agent addresses',
  {},
  async () => {
    try {
      const addresses = await mesh.registry.getAllAgents();
      const agents = [];
      for (const addr of addresses) {
        try {
          const agent = await mesh.registry.getAgent(addr);
          agents.push({ address: addr, name: agent.name, active: agent.active, capabilities: agent.capabilities });
        } catch {
          agents.push({ address: addr, error: 'could not fetch' });
        }
      }
      return ok({ count: agents.length, agents });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'mesh_is_agent',
  'Check if a wallet address is a registered active agent',
  {
    address: z.string().describe('Wallet address to check'),
  },
  async ({ address }) => {
    try {
      const isAgent = await mesh.registry.isAgent(address);
      return ok({ address, isAgent });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'mesh_get_invoice',
  'Get invoice details by ID',
  {
    invoiceId: z.number().describe('Invoice ID'),
  },
  async ({ invoiceId }) => {
    try {
      const invoice = await mesh.payments.getInvoice(invoiceId);
      const statusNames = ['Created', 'Paid', 'Completed', 'Refunded', 'Disputed'];
      invoice.statusName = statusNames[invoice.status] || 'Unknown';
      // Use correct decimals based on token address
      const tokenDecimals = { '0x765DE816845861e75A25fCA122bb6898B8B1282a': 18, '0xD8763CBa276a3738E6DE85b4b3bF5FDed6D6cA73': 18, '0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e': 6, '0xcebA9300f2b948710d2653dD7B07f33A8B32118C': 6 };
      const decimals = tokenDecimals[invoice.token] || 18;
      invoice.amountFormatted = formatUnits(invoice.amount, decimals) + ' tokens';
      return ok(invoice);
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'mesh_get_escrow',
  'Get escrow details by ID',
  {
    escrowId: z.number().describe('Escrow ID'),
  },
  async ({ escrowId }) => {
    try {
      const escrow = await mesh.payments.getEscrow(escrowId);
      const escrowTokenDecimals = { '0x765DE816845861e75A25fCA122bb6898B8B1282a': 18, '0xD8763CBa276a3738E6DE85b4b3bF5FDed6D6cA73': 18, '0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e': 6, '0xcebA9300f2b948710d2653dD7B07f33A8B32118C': 6 };
      const escrowDecimals = escrowTokenDecimals[escrow.token] || 18;
      escrow.amountFormatted = formatUnits(escrow.amount, escrowDecimals) + ' tokens';
      return ok(escrow);
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'mesh_get_inbox',
  'Get inbox message IDs for an agent address',
  {
    address: z.string().describe('Agent address'),
  },
  async ({ address }) => {
    try {
      const ids = await mesh.messenger.getInbox(address);
      const unread = await mesh.messenger.getUnreadCount(address);
      return ok({ address, messageCount: ids.length, unreadCount: unread, messageIds: ids });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'mesh_get_message',
  'Get a message by its ID',
  {
    messageId: z.number().describe('Message ID'),
  },
  async ({ messageId }) => {
    try {
      const msg = await mesh.messenger.getMessage(messageId);
      const typeNames = ['Request', 'Response', 'Signal', 'Payment', 'System'];
      msg.typeName = typeNames[msg.msgType] || 'Unknown';
      return ok(msg);
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'mesh_get_unread_count',
  'Get unread message count for an agent',
  {
    address: z.string().describe('Agent address'),
  },
  async ({ address }) => {
    try {
      const count = await mesh.messenger.getUnreadCount(address);
      return ok({ address, unreadCount: count });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'mesh_get_thread',
  'Get message thread between two agents',
  {
    addressA: z.string().describe('First agent address'),
    addressB: z.string().describe('Second agent address'),
  },
  async ({ addressA, addressB }) => {
    try {
      const ids = await mesh.messenger.getThread(addressA, addressB);
      return ok({ agents: [addressA, addressB], messageCount: ids.length, messageIds: ids });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'mesh_get_broadcasts',
  'Get all broadcast message IDs',
  {},
  async () => {
    try {
      const ids = await mesh.messenger.getBroadcasts();
      return ok({ broadcastCount: ids.length, messageIds: ids });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'mesh_network_info',
  'Get network info, contract addresses, and supported tokens',
  {},
  async () => {
    try {
      const info = mesh.getNetworkInfo();
      info.supportedTokens = TOKENS[NETWORK] || TOKENS.celoMainnet;
      return ok(info);
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'mesh_block_number',
  'Get current block number on the connected network',
  {},
  async () => {
    try {
      const block = await mesh.getBlockNumber();
      return ok({ network: NETWORK, blockNumber: block });
    } catch (e) {
      return err(e.message);
    }
  }
);

// ═══════════════════════════════════════════════════════════
// WRITE TOOLS (need AGENT_PRIVATE_KEY)
// ═══════════════════════════════════════════════════════════

server.tool(
  'mesh_register_agent',
  'Register your agent onchain. Requires AGENT_PRIVATE_KEY env.',
  {
    name: z.string().describe('Agent name'),
    capabilities: z.array(z.string()).describe('Capabilities array, e.g. ["price-feed", "swap"]'),
    endpoint: z.string().describe('HTTP/MCP endpoint URL'),
    feePerRequest: z.string().describe('Fee per request in ETH units (e.g. "0.01")'),
    metadata: z.string().optional().describe('JSON metadata string'),
  },
  async ({ name, capabilities, endpoint, feePerRequest, metadata }) => {
    try {
      const s = requireSigner();
      const fee = parseEther(feePerRequest);
      const tx = await mesh.registry.register(s, name, capabilities, endpoint, fee, metadata || '{}');
      return ok({
        success: true,
        txHash: tx.hash,
        agent: s.address,
        name,
        capabilities,
        endpoint,
        feePerRequest,
      });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'mesh_update_agent',
  'Update your agent details onchain. Requires AGENT_PRIVATE_KEY env.',
  {
    capabilities: z.array(z.string()).describe('New capabilities array'),
    endpoint: z.string().describe('New endpoint URL'),
    feePerRequest: z.string().describe('New fee in ETH units'),
    active: z.boolean().describe('Whether agent is active'),
    metadata: z.string().optional().describe('JSON metadata'),
  },
  async ({ capabilities, endpoint, feePerRequest, active, metadata }) => {
    try {
      const s = requireSigner();
      const fee = parseEther(feePerRequest);
      const tx = await mesh.registry.update(s, capabilities, endpoint, fee, active, metadata || '{}');
      return ok({ success: true, txHash: tx.hash });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'mesh_deactivate_agent',
  'Deactivate your agent onchain. Requires AGENT_PRIVATE_KEY env.',
  {},
  async () => {
    try {
      const s = requireSigner();
      const tx = await mesh.registry.deactivate(s);
      return ok({ success: true, txHash: tx.hash, agent: s.address });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'mesh_create_invoice',
  'Create a payment invoice. Requires AGENT_PRIVATE_KEY env.',
  {
    to: z.string().describe('Recipient address'),
    token: z.string().describe('Token address (use mesh_network_info for supported tokens)'),
    amount: z.string().describe('Amount in ETH units (e.g. "1.5")'),
    description: z.string().describe('Invoice description'),
  },
  async ({ to, token, amount, description }) => {
    try {
      const s = requireSigner();
      const amountWei = parseEther(amount);
      const { tx, invoiceId } = await mesh.payments.createInvoice(s, to, token, amountWei, description);
      return ok({ success: true, txHash: tx.hash, invoiceId: invoiceId?.toString() });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'mesh_pay_invoice',
  'Pay an invoice. Requires token approval first. Requires AGENT_PRIVATE_KEY env.',
  {
    invoiceId: z.number().describe('Invoice ID to pay'),
  },
  async ({ invoiceId }) => {
    try {
      const s = requireSigner();
      const tx = await mesh.payments.payInvoice(s, invoiceId);
      return ok({ success: true, txHash: tx.hash, invoiceId });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'mesh_pay',
  'Direct payment to an agent. Requires token approval. Requires AGENT_PRIVATE_KEY env.',
  {
    to: z.string().describe('Recipient address'),
    token: z.string().describe('Token address'),
    amount: z.string().describe('Amount in ETH units'),
  },
  async ({ to, token, amount }) => {
    try {
      const s = requireSigner();
      const amountWei = parseEther(amount);
      const tx = await mesh.payments.pay(s, to, token, amountWei);
      return ok({ success: true, txHash: tx.hash, from: s.address, to, amount });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'mesh_create_escrow',
  'Create an escrow (locks tokens). Requires AGENT_PRIVATE_KEY env.',
  {
    to: z.string().describe('Beneficiary address'),
    token: z.string().describe('Token address'),
    amount: z.string().describe('Amount in ETH units'),
    description: z.string().describe('Escrow description'),
    releaseAfter: z.number().optional().describe('Unix timestamp for auto-release (0 = manual)'),
  },
  async ({ to, token, amount, description, releaseAfter }) => {
    try {
      const s = requireSigner();
      const amountWei = parseEther(amount);
      const { tx, escrowId } = await mesh.payments.createEscrow(s, to, token, amountWei, description, releaseAfter || 0);
      return ok({ success: true, txHash: tx.hash, escrowId: escrowId?.toString() });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'mesh_release_escrow',
  'Release escrowed funds to beneficiary. Requires AGENT_PRIVATE_KEY env.',
  {
    escrowId: z.number().describe('Escrow ID'),
  },
  async ({ escrowId }) => {
    try {
      const s = requireSigner();
      const tx = await mesh.payments.releaseEscrow(s, escrowId);
      return ok({ success: true, txHash: tx.hash, escrowId });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'mesh_send_message',
  'Send a message to another agent. Requires AGENT_PRIVATE_KEY env.',
  {
    to: z.string().describe('Recipient address'),
    msgType: z.number().describe('Message type: 0=Request, 1=Response, 2=Signal, 3=Payment, 4=System'),
    payload: z.string().describe('Message payload (hex-encoded bytes)'),
    subject: z.string().describe('Human-readable subject'),
    replyTo: z.number().optional().describe('Message ID to reply to (0 or omit for new message)'),
  },
  async ({ to, msgType, payload, subject, replyTo }) => {
    try {
      const s = requireSigner();
      const { tx, messageId } = await mesh.messenger.sendMessage(s, to, msgType, payload, subject, replyTo || 0);
      return ok({ success: true, txHash: tx.hash, messageId: messageId?.toString() });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'mesh_send_request',
  'Send a request message to another agent. Requires AGENT_PRIVATE_KEY env.',
  {
    to: z.string().describe('Recipient agent address'),
    payload: z.string().describe('Request payload (hex-encoded bytes)'),
    subject: z.string().describe('Request subject'),
  },
  async ({ to, payload, subject }) => {
    try {
      const s = requireSigner();
      const { tx, messageId } = await mesh.messenger.sendRequest(s, to, payload, subject);
      return ok({ success: true, txHash: tx.hash, messageId: messageId?.toString() });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'mesh_reply',
  'Reply to a message. Requires AGENT_PRIVATE_KEY env.',
  {
    replyToId: z.number().describe('Message ID to reply to'),
    payload: z.string().describe('Reply payload (hex-encoded bytes)'),
    subject: z.string().describe('Reply subject'),
  },
  async ({ replyToId, payload, subject }) => {
    try {
      const s = requireSigner();
      const { tx, messageId } = await mesh.messenger.reply(s, replyToId, payload, subject);
      return ok({ success: true, txHash: tx.hash, messageId: messageId?.toString() });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'mesh_broadcast',
  'Broadcast a signal to all agents. Requires AGENT_PRIVATE_KEY env.',
  {
    payload: z.string().describe('Signal payload (hex-encoded bytes)'),
    subject: z.string().describe('Signal subject'),
  },
  async ({ payload, subject }) => {
    try {
      const s = requireSigner();
      const { tx, messageId } = await mesh.messenger.broadcast(s, payload, subject);
      return ok({ success: true, txHash: tx.hash, messageId: messageId?.toString() });
    } catch (e) {
      return err(e.message);
    }
  }
);

// ═══════════════════════════════════════════════════════════
// ERC-8004 TOOLS
// ═══════════════════════════════════════════════════════════

server.tool(
  'erc8004_register',
  'Register agent on ERC-8004 IdentityRegistry (get an agentId NFT). Requires AGENT_PRIVATE_KEY env.',
  {
    agentURI: z.string().describe('Agent registration file URI (data:application/json;base64,... or https://...)'),
  },
  async ({ agentURI }) => {
    try {
      const s = requireSigner();
      const { tx, agentId } = await mesh.erc8004.identity.register(s, agentURI);
      return ok({ success: true, txHash: tx.hash, agentId, format: `eip155:${mesh.getNetworkInfo().chainId}:${mesh.erc8004.identity.address}:${agentId}` });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'erc8004_get_agent',
  'Get ERC-8004 agent details by agentId (owner, URI, metadata)',
  {
    agentId: z.number().describe('ERC-8004 agentId'),
  },
  async ({ agentId }) => {
    try {
      const owner = await mesh.erc8004.identity.ownerOf(agentId);
      const uri = await mesh.erc8004.identity.tokenURI(agentId);
      let agentFile = null;
      try { agentFile = await mesh.erc8004.identity.getAgentFile(agentId); } catch {}
      return ok({ agentId, owner, uri: uri.slice(0, 100) + '...', agentFile });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'erc8004_get_score',
  'Get agent reputation score from ERC-8004 ReputationRegistry',
  {
    agentId: z.number().describe('ERC-8004 agentId'),
  },
  async ({ agentId }) => {
    try {
      const score = await mesh.erc8004.reputation.getAgentScore(agentId);
      return ok({ agentId, score: score.score.toString(), decimals: score.decimals });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'erc8004_give_feedback',
  'Give reputation feedback to an agent. Requires AGENT_PRIVATE_KEY env.',
  {
    agentId: z.number().describe('ERC-8004 agentId'),
    value: z.number().describe('Feedback value (e.g. 95 for 95/100 rating)'),
    valueDecimals: z.number().optional().describe('Decimal places (default 0)'),
    tag1: z.string().optional().describe('Tag (e.g. "starred", "reachable", "uptime")'),
    tag2: z.string().optional().describe('Second tag'),
  },
  async ({ agentId, value, valueDecimals, tag1, tag2 }) => {
    try {
      const s = requireSigner();
      const tx = await mesh.erc8004.reputation.giveFeedback(s, agentId, value, valueDecimals || 0, tag1 || '', tag2 || '');
      return ok({ success: true, txHash: tx.hash });
    } catch (e) {
      return err(e.message);
    }
  }
);

server.tool(
  'erc8004_network_info',
  'Get ERC-8004 contract addresses for the current network',
  {},
  async () => {
    try {
      const info = mesh.getNetworkInfo();
      return ok({ network: info.network, erc8004: info.erc8004 });
    } catch (e) {
      return err(e.message);
    }
  }
);

// ─── START ──────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[celo-agent-mesh] MCP server running on stdio');
  console.error(`[celo-agent-mesh] ${signer ? 'WRITE mode (private key set)' : 'READ-only mode (no private key)'}`);
}

main().catch(e => {
  console.error(`[celo-agent-mesh] Fatal: ${e.message}`);
  process.exit(1);
});
