const { ethers } = require('ethers');
require('dotenv').config({ path: './validator/.env' });

const UNIT0_RPC = 'https://rpc.unit0.dev';
const BRIDGE_ADDRESS = '0xdb36bAdfc6620F33035FEc568E095f7Ee393Cf50';

// ABI for createWrappedToken function
const BRIDGE_ABI = [
  'function createWrappedToken(string wavesAssetId, string name, string symbol, uint8 wavesDecimals, uint8 unit0Decimals) external returns (address)',
  'function wavesToUnit0Token(string) external view returns (address)',
  'function owner() external view returns (address)'
];

async function main() {
  const provider = new ethers.JsonRpcProvider(UNIT0_RPC);
  const wallet = new ethers.Wallet(process.env.VALIDATOR_PRIVATE_KEY, provider);
  
  console.log('Wallet address:', wallet.address);
  
  const bridge = new ethers.Contract(BRIDGE_ADDRESS, BRIDGE_ABI, wallet);
  
  // Check if already registered
  const existingToken = await bridge.wavesToUnit0Token('WAVES');
  if (existingToken !== '0x0000000000000000000000000000000000000000') {
    console.log('Wrapped WAVES already exists at:', existingToken);
    return;
  }
  
  // Check owner
  const owner = await bridge.owner();
  console.log('Bridge owner:', owner);
  console.log('Is wallet owner?', owner.toLowerCase() === wallet.address.toLowerCase());
  
  if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
    console.error('Error: Wallet is not the bridge owner. Cannot create wrapped token.');
    return;
  }
  
  console.log('Creating wrapped WAVES token on Unit0...');
  
  const tx = await bridge.createWrappedToken(
    'WAVES',           // wavesAssetId
    'Wrapped WAVES',   // name
    'wWAVES',          // symbol
    8,                 // wavesDecimals
    8                  // unit0Decimals (keep same for simplicity)
  );
  
  console.log('Transaction sent:', tx.hash);
  const receipt = await tx.wait();
  console.log('Transaction confirmed!');
  
  // Get the new token address
  const wrappedWavesAddress = await bridge.wavesToUnit0Token('WAVES');
  console.log('Wrapped WAVES token deployed at:', wrappedWavesAddress);
}

main().catch(console.error);
