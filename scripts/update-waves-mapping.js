/**
 * Update WAVES Token Mapping on WAVES Bridge
 *
 * This script updates the WAVES token mapping to point to the new Unit0 wrapped token address.
 */

const { invokeScript, broadcast, waitForTx } = require('@waves/waves-transactions');

const WAVES_NODE = 'https://nodes.wavesnodes.com';
const WAVES_BRIDGE = '3P8hdbRCjwTAK3SYk6ixfS3kknUcWpsr7WL';
const NEW_WRAPPED_WAVES = '0x4025A8Ee89DAead315de690f0C250caB5309a115';

// Bridge owner seed
const BRIDGE_SEED = 'vacant hope matrix runway slab useless history act flight finger grow pride diamond peanut twice';

async function checkCurrentMapping() {
  const response = await fetch(`${WAVES_NODE}/addresses/data/${WAVES_BRIDGE}/token_map_WAVES`);
  if (response.ok) {
    const data = await response.json();
    return data.value;
  }
  return null;
}

async function main() {
  console.log('='.repeat(60));
  console.log('Update WAVES Token Mapping');
  console.log('='.repeat(60));

  const currentMapping = await checkCurrentMapping();
  console.log('\nCurrent mapping:', currentMapping);
  console.log('New Unit0 address:', NEW_WRAPPED_WAVES);

  console.log('\nUpdating mapping...');

  try {
    const tx = invokeScript({
      dApp: WAVES_BRIDGE,
      call: {
        function: 'updateTokenMapping',
        args: [
          { type: 'string', value: 'WAVES' },           // wavesAssetId
          { type: 'string', value: NEW_WRAPPED_WAVES }, // unit0Address
          { type: 'integer', value: 8 },                // decimals
          { type: 'string', value: 'WAVES' },           // name
          { type: 'string', value: 'WAVES' }            // symbol
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

    // Verify
    const newMapping = await checkCurrentMapping();

    console.log('\n' + '='.repeat(60));
    console.log('WAVES Token Mapping Updated!');
    console.log('='.repeat(60));
    console.log('New mapping:', newMapping);
    console.log('Transaction:', `https://wavesexplorer.com/tx/${tx.id}`);

  } catch (error) {
    console.error('\nError:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);
