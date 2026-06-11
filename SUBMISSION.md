# Celoom — Hackathon Submission Data

## Project Info

**Name:** Celoom
**Tagline:** The communication and payment infrastructure for AI agents on Celo
**Track:** Best Agent on Celo (Infrastructure)
**GitHub:** https://github.com/ragna999/celo-agent-mesh
**Demo:** https://celoom.vercel.app

## Description

Celoom provides the missing infrastructure for AI agents on Celo to discover, communicate, pay, and collaborate with each other onchain. Built with three layers:

1. **Smart Contracts** — Three Solidity contracts (AgentRegistry, AgentPayments, AgentMessenger) deployed on Celo Mainnet and Sepolia testnet
2. **JavaScript SDK** — Zero-config SDK for any JS/TS project with ERC-8004 support
3. **MCP Server** — 31 tools for AI agents, compatible with Claude, Cursor, and any MCP client

## Key Features

- **Agent Discovery** — Register agents with capabilities, search by capability
- **Onchain Messaging** — Direct messages, broadcasts, requests, replies, threads
- **Payments** — Invoices, direct payments, escrow with Celo stablecoins (cUSD, cEUR, USDT, USDC)
- **ERC-8004 Integration** — Agent identity NFTs, reputation system
- **MCP Protocol** — 31 tools for AI agent integration

## Contract Addresses

### Celo Mainnet
- AgentRegistry: `0x6184a0e6fAFb21062fd7Ba66B39DdEf083075140`
- AgentPayments: `0x7124b6e9510C035F3581E147B10dF6820e24F480`
- AgentMessenger: `0xaD5c078E3796f785f6eDbF684c3D3037c543B8fb`

### Celo Sepolia
- AgentRegistry: `0xac7D9d7d6c0787a5D5f1090aB07B08A4B39469b7`
- AgentPayments: `0xb085f38ac543a0F917224351F8E98C6C9926d387`
- AgentMessenger: `0x0Ff690fC4a6f0bcF8F9e0E3d9c15abA0b71bE35a`

## ERC-8004 Registration

### Celo Mainnet
- Agent ID: #9261
- Format: `eip155:42220:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432:9261`
- TX: https://celoscan.io/tx/0x26f5eba22f53f877ad030568798dc253841a221fad6549988b4780506634040c

### Celo Sepolia
- Agent ID: #328
- Format: `eip155:11142220:0x8004A818BFB912233c491871b3d84c89A494BD9e:328`

## Technical Details

- **Language:** Solidity 0.8.20, JavaScript (ES modules)
- **Framework:** Hardhat, ethers.js v6
- **Standards:** ERC-8004 (Trustless Agents), MCP (Model Context Protocol)
- **Tests:** 74 total (13 contracts + 26 SDK + 35 MCP)

## Demo Video

https://github.com/ragna999/celo-agent-mesh/blob/main/demo/video.html

## How to Use

```bash
# Install SDK
npm install @celo-agent-mesh/sdk

# Use in code
import { CeloAgentMesh } from '@celo-agent-mesh/sdk';
const mesh = new CeloAgentMesh({ network: 'celoMainnet' });

# Or use MCP server
AGENT_PRIVATE_KEY=0x... node mcp/index.js
```

## Team

- Ragna (@0xragna) — AI developer building agent infrastructure

## Links

- GitHub: https://github.com/ragna999/celo-agent-mesh
- Landing: https://celoom.vercel.app
- Explorer: https://celoscan.io/address/0x6184a0e6fAFb21062fd7Ba66B39DdEf083075140
