const { ethers } = require('ethers');
const readline = require('readline');
require('dotenv').config({ path: './validator/.env' });

const UNIT0_RPC = process.env.UNIT0_RPC_URL;
const BRIDGE_ADDRESS = process.env.UNIT0_BRIDGE_ADDRESS;
const WAVES_NODE = process.env.WAVES_NODE_URL;
const WAVES_BRIDGE = process.env.WAVES_BRIDGE_ADDRESS;

const BRIDGE_ABI = [
  'function registerToken(string wavesAssetId, string name, string symbol, uint8 wavesDecimals, uint8 unit0Decimals) external returns (address)',
  'function wavesToUnit0Token(string) external view returns (address)'
];

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function getWavesAssetInfo(assetId) {
  if (assetId === 'WAVES') {
    return { name: 'WAVES', decimals: 8, description: 'Native WAVES token' };
  }
  
  const response = await fetch(`${WAVES_NODE}/assets/details/${assetId}`);
  if (!response.ok) {
    throw new Error(`Asset not found: ${assetId}`);
  }
  return response.json();
}

async function registerOnWaves(signer, assetId, unit0Address, decimals, name, symbol) {
  const tx = await signer.invoke({
    dApp: WAVES_BRIDGE,
    call: {
      function: 'registerTokenPermissionless',
      args: [
        { type: 'string', value: assetId },
        { type: 'string', value: unit0Address },
        { type: 'integer', value: decimals },
        { type: 'string', value: name },
        { type: 'string', value: symbol }
      ]
    },
    fee: 500000
  }).broadcast();

  return tx[0].id;
}

async function main() {
  console.log('==========================================');
  console.log('   Register Token for Bridging');
  console.log('   (Permissionless - Anyone Can Use)');
  console.log('==========================================\n');

  // Get asset ID
  const assetId = await prompt('Enter WAVES Asset ID: ');
  
  if (!assetId || assetId.length < 1) {
    console.error('Error: Asset ID is required');
    process.exit(1);
  }

  // Connect to Unit0
  const provider = new ethers.JsonRpcProvider(UNIT0_RPC);
  
  // Check if already registered on Unit0
  const bridge = new ethers.Contract(BRIDGE_ADDRESS, BRIDGE_ABI, provider);
  const existingToken = await bridge.wavesToUnit0Token(assetId);
  
  if (existingToken !== '0x0000000000000000000000000000000000000000') {
    console.log('\nToken already registered on Unit0!');
    console.log('Wrapped token address:', existingToken);
    process.exit(0);
  }

  // Fetch asset info from WAVES
  console.log('\nFetching asset info from WAVES...');
  let assetInfo;
  try {
    assetInfo = await getWavesAssetInfo(assetId);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }

  console.log('Asset Name:', assetInfo.name);
  console.log('Decimals:', assetInfo.decimals);
  if (assetInfo.description) {
    console.log('Description:', assetInfo.description.slice(0, 100));
  }

  // Get custom name/symbol or use defaults
  const defaultSymbol = assetInfo.name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toUpperCase();
  const name = await prompt(`Token name [${assetInfo.name}]: `) || assetInfo.name;
  const symbol = await prompt(`Token symbol [${defaultSymbol}]: `) || defaultSymbol;
  const decimals = parseInt(await prompt(`Decimals on Unit0 [${assetInfo.decimals}]: `)) || assetInfo.decimals;

  console.log('\n--- Registration Summary ---');
  console.log('WAVES Asset ID:', assetId);
  console.log('Name:', name);
  console.log('Symbol: w' + symbol);
  console.log('WAVES Decimals:', assetInfo.decimals);
  console.log('Unit0 Decimals:', decimals);

  const confirm = await prompt('\nProceed with registration? (yes/no): ');
  if (confirm.toLowerCase() !== 'yes') {
    console.log('Cancelled.');
    process.exit(0);
  }

  // Get user's private key for Unit0
  const privateKey = await prompt('\nEnter your Unit0 private key (to pay gas): ');
  const wallet = new ethers.Wallet(privateKey, provider);
  const bridgeWithSigner = new ethers.Contract(BRIDGE_ADDRESS, BRIDGE_ABI, wallet);

  console.log('\nUsing address:', wallet.address);
  const balance = await provider.getBalance(wallet.address);
  console.log('Balance:', ethers.formatEther(balance), 'UNIT0');

  if (balance === 0n) {
    console.error('Error: No UNIT0 balance for gas');
    process.exit(1);
  }

  // Step 1: Create wrapped token on Unit0
  console.log('\n1. Creating wrapped token on Unit0...');
  try {
    const tx = await bridgeWithSigner.registerToken(
      assetId,
      `Wrapped ${name}`,
      `w${symbol}`,
      assetInfo.decimals,
      decimals
    );
    console.log('   TX Hash:', tx.hash);
    await tx.wait();
    
    const wrappedToken = await bridge.wavesToUnit0Token(assetId);
    console.log('   Wrapped token created:', wrappedToken);

    // Step 2: Register on WAVES
    console.log('\n2. Registering token on WAVES bridge...');
    console.log('   You will need WAVES Keeper or a seed phrase.');
    
    const wavesMethod = await prompt('   Use (1) Seed phrase or (2) Skip WAVES registration? [1]: ');
    
    if (wavesMethod !== '2') {
      const { Signer } = require('@waves/signer');
      const { ProviderSeed } = require('@waves/provider-seed');
      
      const seedPhrase = await prompt('   Enter your WAVES seed phrase: ');
      
      const signer = new Signer({ NODE_URL: WAVES_NODE });
      signer.setProvider(new ProviderSeed(seedPhrase));
      
      const wavesTxId = await registerOnWaves(signer, assetId, wrappedToken, assetInfo.decimals, name, symbol);
      console.log('   WAVES TX:', wavesTxId);
    } else {
      console.log('\n   To complete registration, call registerTokenPermissionless on WAVES:');
      console.log('   dApp:', WAVES_BRIDGE);
      console.log('   Function: registerTokenPermissionless');
      console.log('   Args:');
      console.log('     - wavesAssetId:', assetId);
      console.log('     - unit0Address:', wrappedToken);
      console.log('     - decimals:', assetInfo.decimals);
      console.log('     - name:', name);
      console.log('     - symbol:', symbol);
    }

    console.log('\n==========================================');
    console.log('   Token Registration Complete!');
    console.log('==========================================');
    console.log('WAVES Asset ID:', assetId);
    console.log('Unit0 Wrapped Token:', wrappedToken);
    console.log('Symbol: w' + symbol);

  } catch (error) {
    console.error('Error:', error.reason || error.message);
    process.exit(1);
  }
}

main().catch(console.error);
