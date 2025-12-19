/**
 * Update WAVES Bridge Contract
 *
 * This script updates the WAVES bridge dApp with the latest Ride code
 * that includes the permissionless token registration function.
 *
 * Usage: node scripts/update-waves-bridge.js [--confirm]
 */

const { broadcast, setScript, waitForTx } = require('@waves/waves-transactions');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Configuration
const WAVES_NODE_URL = 'https://nodes.wavesnodes.com';
const WAVES_CHAIN_ID = 'W'; // Mainnet

// Bridge seed (from .env or input)
const BRIDGE_SEED = 'vacant hope matrix runway slab useless history act flight finger grow pride diamond peanut twice';

async function question(prompt) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(prompt, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

async function compileRideScript(rideCode) {
  // Use WAVES node to compile the Ride script
  // The API expects the raw Ride code as plain text
  const response = await fetch(`${WAVES_NODE_URL}/utils/script/compileCode`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
    },
    body: rideCode
  });

  const result = await response.json();

  if (result.error) {
    throw new Error(`Compilation failed: ${result.message || JSON.stringify(result)}`);
  }

  return result.script;
}

async function main() {
  const autoConfirm = process.argv.includes('--confirm');

  console.log('='.repeat(60));
  console.log('WAVES Bridge Contract Update');
  console.log('='.repeat(60));

  // Read the Ride contract
  const ridePath = path.join(__dirname, '..', 'contracts', 'waves', 'bridge.ride');
  const rideCode = fs.readFileSync(ridePath, 'utf8');

  console.log('\nContract file:', ridePath);
  console.log('Contract size:', rideCode.length, 'bytes');

  // Show what's new
  console.log('\n📋 Changes in this update:');
  console.log('  - Fixed UNIT0_CHAIN_ID to 88811');
  console.log('  - Added registerTokenPermissionless() function');
  console.log('    (allows anyone to register tokens for bridging)');

  // Confirm
  if (!autoConfirm) {
    const confirm = await question('\nProceed with update? (yes/no): ');
    if (confirm.toLowerCase() !== 'yes') {
      console.log('Cancelled.');
      process.exit(0);
    }
  } else {
    console.log('\n--confirm flag provided, proceeding automatically...');
  }

  console.log('\n⏳ Compiling Ride script...');

  try {
    // Compile the Ride script using the WAVES node
    const compiledScript = await compileRideScript(rideCode);
    console.log('✅ Script compiled successfully');
    console.log('Compiled size:', compiledScript.length, 'bytes (base64)');

    console.log('\n⏳ Deploying contract...');

    // Create setScript transaction with compiled script
    const tx = setScript({
      script: compiledScript,
      chainId: WAVES_CHAIN_ID,
    }, BRIDGE_SEED);

    console.log('Transaction ID:', tx.id);
    console.log('Broadcasting to', WAVES_NODE_URL);

    // Broadcast
    const result = await broadcast(tx, WAVES_NODE_URL);
    console.log('\n✅ Transaction broadcast successfully!');

    // Wait for confirmation
    console.log('⏳ Waiting for confirmation...');
    await waitForTx(tx.id, { apiBase: WAVES_NODE_URL });

    console.log('\n' + '='.repeat(60));
    console.log('✅ WAVES Bridge Contract Updated Successfully!');
    console.log('='.repeat(60));
    console.log('\nTransaction ID:', tx.id);
    console.log('Explorer:', `https://wavesexplorer.com/tx/${tx.id}`);

    console.log('\n📋 New Features Available:');
    console.log('  - registerTokenPermissionless(wavesAssetId, unit0Address, decimals, name, symbol)');
    console.log('    Anyone can now register tokens for bridging!');

    console.log('\n⚠️  Next Steps:');
    console.log('1. Re-register WAVES token on the new Unit0 bridge');
    console.log('2. Restart the validator service');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);
