/**
 * Register WAVES Token on WAVES Bridge
 *
 * This script registers the native WAVES token on the WAVES bridge
 * to enable bridging to Unit0.
 */

const { invokeScript, broadcast, waitForTx } = require('@waves/waves-transactions');

const WAVES_NODE = 'https://nodes.wavesnodes.com';
const WAVES_BRIDGE = '3P8hdbRCjwTAK3SYk6ixfS3kknUcWpsr7WL';
const WRAPPED_WAVES_ON_UNIT0 = '0x4025A8Ee89DAead315de690f0C250caB5309a115';

// Bridge owner seed
const BRIDGE_SEED = 'vacant hope matrix runway slab useless history act flight finger grow pride diamond peanut twice';

async function checkIfRegistered() {
  const response = await fetch(`${WAVES_NODE}/addresses/data/${WAVES_BRIDGE}/token_map_WAVES`);
  if (response.ok) {
    const data = await response.json();
    return data.value;
  }
  return null;
}

async function main() {
  console.log('='.repeat(60));
  console.log('Register WAVES Token on WAVES Bridge');
  console.log('='.repeat(60));

  // Check if already registered
  const existing = await checkIfRegistered();
  if (existing) {
    console.log('\nWAVES token is already registered on WAVES bridge!');
    console.log('Mapping:', existing);
    return;
  }

  console.log('\nBridge Address:', WAVES_BRIDGE);
  console.log('Unit0 Wrapped WAVES:', WRAPPED_WAVES_ON_UNIT0);

  console.log('\nRegistering WAVES token...');

  try {
    // Use owner's registerToken function (not permissionless)
    const tx = invokeScript({
      dApp: WAVES_BRIDGE,
      call: {
        function: 'registerToken',
        args: [
          { type: 'string', value: 'WAVES' },                    // wavesAssetId
          { type: 'string', value: WRAPPED_WAVES_ON_UNIT0 },     // unit0Address
          { type: 'boolean', value: false },                     // isWrapped (native token)
          { type: 'integer', value: 8 },                         // decimals
          { type: 'string', value: 'WAVES' },                    // name
          { type: 'string', value: 'WAVES' }                     // symbol
        ]
      },
      fee: 500000,
      chainId: 'W'
    }, BRIDGE_SEED);

    console.log('Transaction ID:', tx.id);
    console.log('Broadcasting...');

    await broadcast(tx, WAVES_NODE);
    console.log('Waiting for confirmation...');

    await waitForTx(tx.id, { apiBase: WAVES_NODE });

    console.log('\n' + '='.repeat(60));
    console.log('WAVES Token Registered Successfully!');
    console.log('='.repeat(60));
    console.log('Transaction:', `https://wavesexplorer.com/tx/${tx.id}`);

  } catch (error) {
    console.error('\nError:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);
