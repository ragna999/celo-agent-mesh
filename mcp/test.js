/**
 * MCP Server Test — validates tool listing via stdio
 * 
 * Run: node test.js
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, 'index.js');

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

async function testMcpServer() {
  console.log('\n🧪 Celo Agent Mesh MCP Server — Test Suite\n');

  return new Promise((resolve) => {
    const child = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, CELO_NETWORK: 'celoSepolia' },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    // Send initialize request
    const initMsg = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' },
      },
    });

    child.stdin.write(initMsg + '\n');

    setTimeout(() => {
      // Send initialized notification
      const notif = JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      });
      child.stdin.write(notif + '\n');

      setTimeout(() => {
        // Request tool list
        const listMsg = JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
          params: {},
        });
        child.stdin.write(listMsg + '\n');

        setTimeout(() => {
          // Parse response
          try {
            const lines = stdout.trim().split('\n').filter(l => l.startsWith('{'));
            let toolList = null;
            for (const line of lines) {
              try {
                const parsed = JSON.parse(line);
                if (parsed.id === 2 && parsed.result?.tools) {
                  toolList = parsed.result.tools;
                  break;
                }
              } catch {}
            }

            assert(toolList !== null, 'Got tool list response');
            
            if (toolList) {
              const toolNames = toolList.map(t => t.name);
              
              // Read tools
              assert(toolNames.includes('mesh_search_agents'), 'Has mesh_search_agents');
              assert(toolNames.includes('mesh_get_agent'), 'Has mesh_get_agent');
              assert(toolNames.includes('mesh_total_agents'), 'Has mesh_total_agents');
              assert(toolNames.includes('mesh_get_all_agents'), 'Has mesh_get_all_agents');
              assert(toolNames.includes('mesh_is_agent'), 'Has mesh_is_agent');
              assert(toolNames.includes('mesh_get_invoice'), 'Has mesh_get_invoice');
              assert(toolNames.includes('mesh_get_escrow'), 'Has mesh_get_escrow');
              assert(toolNames.includes('mesh_get_inbox'), 'Has mesh_get_inbox');
              assert(toolNames.includes('mesh_get_message'), 'Has mesh_get_message');
              assert(toolNames.includes('mesh_get_unread_count'), 'Has mesh_get_unread_count');
              assert(toolNames.includes('mesh_get_thread'), 'Has mesh_get_thread');
              assert(toolNames.includes('mesh_get_broadcasts'), 'Has mesh_get_broadcasts');
              assert(toolNames.includes('mesh_network_info'), 'Has mesh_network_info');
              assert(toolNames.includes('mesh_block_number'), 'Has mesh_block_number');
              
              // Write tools
              assert(toolNames.includes('mesh_register_agent'), 'Has mesh_register_agent');
              assert(toolNames.includes('mesh_update_agent'), 'Has mesh_update_agent');
              assert(toolNames.includes('mesh_deactivate_agent'), 'Has mesh_deactivate_agent');
              assert(toolNames.includes('mesh_create_invoice'), 'Has mesh_create_invoice');
              assert(toolNames.includes('mesh_pay_invoice'), 'Has mesh_pay_invoice');
              assert(toolNames.includes('mesh_pay'), 'Has mesh_pay');
              assert(toolNames.includes('mesh_create_escrow'), 'Has mesh_create_escrow');
              assert(toolNames.includes('mesh_release_escrow'), 'Has mesh_release_escrow');
              assert(toolNames.includes('mesh_send_message'), 'Has mesh_send_message');
              assert(toolNames.includes('mesh_send_request'), 'Has mesh_send_request');
              assert(toolNames.includes('mesh_reply'), 'Has mesh_reply');
              assert(toolNames.includes('mesh_broadcast'), 'Has mesh_broadcast');
              assert(toolNames.includes('erc8004_register'), 'Has erc8004_register');
              assert(toolNames.includes('erc8004_get_agent'), 'Has erc8004_get_agent');
              assert(toolNames.includes('erc8004_get_score'), 'Has erc8004_get_score');
              assert(toolNames.includes('erc8004_give_feedback'), 'Has erc8004_give_feedback');
              assert(toolNames.includes('erc8004_network_info'), 'Has erc8004_network_info');

              assert(toolNames.length >= 31, `Total tools: ${toolNames.length}`);
            }

            assert(stderr.includes('MCP server running'), 'Server logs startup message');
            assert(stderr.includes('READ-only mode'), 'Server in read-only mode (no private key)');

          } catch (e) {
            assert(false, 'Parse response: ' + e.message);
          }

          console.log('\n' + '═'.repeat(50));
          console.log(`  Results: ${passed} passed, ${failed} failed`);
          console.log('═'.repeat(50));

          child.kill();
          resolve();
        }, 2000);
      }, 500);
    }, 2000);

    child.on('error', (e) => {
      console.error('Spawn error:', e.message);
      resolve();
    });
  });
}

testMcpServer().then(() => {
  if (failed > 0) process.exit(1);
});
