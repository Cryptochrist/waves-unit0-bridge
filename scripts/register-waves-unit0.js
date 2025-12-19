/**
 * Register WAVES Token on Unit0 Bridge
 *
 * This script registers the native WAVES token on the Unit0 bridge
 * so it can be bridged between WAVES and Unit0.
 */

const { ethers } = require('ethers');
require('dotenv').config({ path: './validator/.env' });

const UNIT0_RPC = process.env.UNIT0_RPC_URL;
const BRIDGE_ADDRESS = process.env.UNIT0_BRIDGE_ADDRESS;
const VALIDATOR_PRIVATE_KEY = process.env.VALIDATOR_PRIVATE_KEY;

const BRIDGE_ABI = [
  'function registerToken(string wavesAssetId, string name, string symbol, uint8 wavesDecimals, uint8 unit0Decimals) external returns (address)',
  'function wavesToUnit0Token(string) external view returns (address)',
  'event TokenRegistered(string wavesAssetId, address unit0Token)'
];

async function main() {
  console.log('='.repeat(60));
  console.log('Register WAVES Token on Unit0 Bridge');
  console.log('='.repeat(60));

  const provider = new ethers.JsonRpcProvider(UNIT0_RPC);
  const wallet = new ethers.Wallet(VALIDATOR_PRIVATE_KEY, provider);
  const bridge = new ethers.Contract(BRIDGE_ADDRESS, BRIDGE_ABI, wallet);

  console.log('\nBridge Address:', BRIDGE_ADDRESS);
  console.log('Wallet:', wallet.address);

  const balance = await provider.getBalance(wallet.address);
  console.log('Balance:', ethers.formatEther(balance), 'UNIT0');

  // Check if WAVES is already registered
  const existingToken = await bridge.wavesToUnit0Token('WAVES');
  if (existingToken !== '0x0000000000000000000000000000000000000000') {
    console.log('\nWAVES token is already registered!');
    console.log('Wrapped WAVES address:', existingToken);
    return;
  }

  console.log('\nRegistering WAVES token...');

  try {
    const tx = await bridge.registerToken(
      'WAVES',           // wavesAssetId
      'Wrapped WAVES',   // name
      'wWAVES',          // symbol
      8,                 // wavesDecimals
      8                  // unit0Decimals
    );

    console.log('Transaction sent:', tx.hash);
    console.log('Waiting for confirmation...');

    const receipt = await tx.wait();
    console.log('Transaction confirmed in block:', receipt.blockNumber);

    // Get the wrapped token address
    const wrappedWaves = await bridge.wavesToUnit0Token('WAVES');
    console.log('\n' + '='.repeat(60));
    console.log('WAVES Token Registered Successfully!');
    console.log('='.repeat(60));
    console.log('Wrapped WAVES (wWAVES):', wrappedWaves);
    console.log('Explorer:', `https://explorer.unit0.dev/address/${wrappedWaves}`);

  } catch (error) {
    console.error('\nError registering token:', error.reason || error.message);
    process.exit(1);
  }
}

main().catch(console.error);
