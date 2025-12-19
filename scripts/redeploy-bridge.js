const { ethers } = require('ethers');
require('dotenv').config({ path: './validator/.env' });

const UNIT0_RPC = 'https://rpc.unit0.dev';
const FACTORY_ADDRESS = '0x48bd3584C9adD75961Ad511c982B3B40BEe5907A';

async function main() {
  const provider = new ethers.JsonRpcProvider(UNIT0_RPC);
  const wallet = new ethers.Wallet(process.env.VALIDATOR_PRIVATE_KEY, provider);
  
  console.log('Deploying from:', wallet.address);
  
  // Get compiled contract
  const fs = require('fs');
  const bridgeArtifact = JSON.parse(fs.readFileSync('./artifacts/contracts/unit0/WavesUnit0Bridge.sol/WavesUnit0Bridge.json'));
  
  // Deploy bridge with correct factory
  console.log('Deploying new WavesUnit0Bridge...');
  const Bridge = new ethers.ContractFactory(bridgeArtifact.abi, bridgeArtifact.bytecode, wallet);
  const bridge = await Bridge.deploy(
    wallet.address,     // treasury
    FACTORY_ADDRESS,    // tokenFactory
    1                   // threshold
  );
  await bridge.waitForDeployment();
  
  const bridgeAddress = await bridge.getAddress();
  console.log('New Bridge deployed at:', bridgeAddress);
  
  // Add validator
  console.log('Adding validator...');
  const addValTx = await bridge.addValidator(wallet.address);
  await addValTx.wait();
  console.log('Validator added');
  
  // Update factory to point to new bridge
  console.log('Updating factory bridge address...');
  const factoryArtifact = JSON.parse(fs.readFileSync('./artifacts/contracts/unit0/WrappedTokenFactory.sol/WrappedTokenFactory.json'));
  const factory = new ethers.Contract(FACTORY_ADDRESS, factoryArtifact.abi, wallet);
  const setBridgeTx = await factory.setBridge(bridgeAddress);
  await setBridgeTx.wait();
  console.log('Factory updated');
  
  // Create wrapped WAVES token
  console.log('Creating Wrapped WAVES token...');
  const createTx = await bridge.createWrappedToken(
    'WAVES',           // wavesAssetId
    'Wrapped WAVES',   // name
    'wWAVES',          // symbol
    8,                 // wavesDecimals
    8                  // unit0Decimals
  );
  const receipt = await createTx.wait();
  console.log('Wrapped WAVES created');
  
  // Get the wrapped token address
  const wrappedWaves = await bridge.wavesToUnit0Token('WAVES');
  console.log('Wrapped WAVES address:', wrappedWaves);
  
  console.log('\n=== DEPLOYMENT COMPLETE ===');
  console.log('New Bridge:', bridgeAddress);
  console.log('Wrapped WAVES:', wrappedWaves);
  console.log('\nUpdate your .env files with the new bridge address!');
  
  return { bridgeAddress, wrappedWaves };
}

main().catch(console.error);
