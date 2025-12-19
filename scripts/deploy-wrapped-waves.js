const { ethers } = require('ethers');
require('dotenv').config({ path: './validator/.env' });

const UNIT0_RPC = 'https://rpc.unit0.dev';
const BRIDGE_ADDRESS = '0xdb36bAdfc6620F33035FEc568E095f7Ee393Cf50';

async function main() {
  const provider = new ethers.JsonRpcProvider(UNIT0_RPC);
  const wallet = new ethers.Wallet(process.env.VALIDATOR_PRIVATE_KEY, provider);
  
  console.log('Deploying from:', wallet.address);
  
  // Get compiled contract
  const fs = require('fs');
  const wrappedArtifact = JSON.parse(fs.readFileSync('./artifacts/contracts/unit0/WrappedERC20.sol/WrappedERC20.json'));
  
  // Deploy wrapped WAVES token (no constructor args)
  console.log('Deploying Wrapped WAVES token...');
  const WrappedToken = new ethers.ContractFactory(wrappedArtifact.abi, wrappedArtifact.bytecode, wallet);
  const wrappedWaves = await WrappedToken.deploy();
  await wrappedWaves.waitForDeployment();
  
  const tokenAddress = await wrappedWaves.getAddress();
  console.log('Wrapped WAVES deployed at:', tokenAddress);
  
  // Initialize the token
  console.log('Initializing token...');
  const initTx = await wrappedWaves.initialize(
    'Wrapped WAVES',   // name
    'wWAVES',          // symbol
    8,                 // decimals
    BRIDGE_ADDRESS     // bridge
  );
  await initTx.wait();
  console.log('Token initialized');
  
  console.log('\n=== DEPLOYMENT COMPLETE ===');
  console.log('Wrapped WAVES Token:', tokenAddress);
  console.log('\nNow we need to register this token in the bridge.');
  
  return tokenAddress;
}

main().catch(console.error);
