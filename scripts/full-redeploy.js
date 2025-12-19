const { ethers } = require('ethers');
require('dotenv').config({ path: './validator/.env' });

const UNIT0_RPC = 'https://rpc.unit0.dev';

async function main() {
  const provider = new ethers.JsonRpcProvider(UNIT0_RPC);
  const wallet = new ethers.Wallet(process.env.VALIDATOR_PRIVATE_KEY, provider);
  
  console.log('Deploying from:', wallet.address);
  console.log('Balance:', ethers.formatEther(await provider.getBalance(wallet.address)), 'UNIT0');
  
  const fs = require('fs');
  
  // 1. Deploy ERC20 implementation
  console.log('\n1. Deploying WrappedERC20 implementation...');
  const wrappedArtifact = JSON.parse(fs.readFileSync('./artifacts/contracts/unit0/WrappedERC20.sol/WrappedERC20.json'));
  const WrappedToken = new ethers.ContractFactory(wrappedArtifact.abi, wrappedArtifact.bytecode, wallet);
  const erc20Impl = await WrappedToken.deploy();
  await erc20Impl.waitForDeployment();
  const erc20ImplAddress = await erc20Impl.getAddress();
  console.log('   ERC20 Implementation:', erc20ImplAddress);
  
  // 2. Deploy Factory with implementation
  console.log('\n2. Deploying WrappedTokenFactory...');
  const factoryArtifact = JSON.parse(fs.readFileSync('./artifacts/contracts/unit0/WrappedTokenFactory.sol/WrappedTokenFactory.json'));
  const Factory = new ethers.ContractFactory(factoryArtifact.abi, factoryArtifact.bytecode, wallet);
  const factory = await Factory.deploy(erc20ImplAddress);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log('   Factory:', factoryAddress);
  
  // 3. Deploy Bridge with factory
  console.log('\n3. Deploying WavesUnit0Bridge...');
  const bridgeArtifact = JSON.parse(fs.readFileSync('./artifacts/contracts/unit0/WavesUnit0Bridge.sol/WavesUnit0Bridge.json'));
  const Bridge = new ethers.ContractFactory(bridgeArtifact.abi, bridgeArtifact.bytecode, wallet);
  const bridge = await Bridge.deploy(
    wallet.address,     // treasury
    factoryAddress,     // tokenFactory
    1                   // threshold
  );
  await bridge.waitForDeployment();
  const bridgeAddress = await bridge.getAddress();
  console.log('   Bridge:', bridgeAddress);
  
  // 4. Set bridge in factory
  console.log('\n4. Setting bridge in factory...');
  const factoryContract = new ethers.Contract(factoryAddress, factoryArtifact.abi, wallet);
  await (await factoryContract.setBridge(bridgeAddress)).wait();
  console.log('   Done');
  
  // 5. Add validator
  console.log('\n5. Adding validator...');
  const bridgeContract = new ethers.Contract(bridgeAddress, bridgeArtifact.abi, wallet);
  await (await bridgeContract.addValidator(wallet.address)).wait();
  console.log('   Validator added:', wallet.address);
  
  // 6. Create wrapped WAVES token
  console.log('\n6. Creating Wrapped WAVES token...');
  const createTx = await bridgeContract.createWrappedToken(
    'WAVES',           // wavesAssetId
    'Wrapped WAVES',   // name
    'wWAVES',          // symbol
    8,                 // wavesDecimals
    8                  // unit0Decimals
  );
  await createTx.wait();
  const wrappedWaves = await bridgeContract.wavesToUnit0Token('WAVES');
  console.log('   Wrapped WAVES:', wrappedWaves);
  
  console.log('\n=== DEPLOYMENT COMPLETE ===');
  console.log('ERC20 Implementation:', erc20ImplAddress);
  console.log('Token Factory:       ', factoryAddress);
  console.log('Bridge:              ', bridgeAddress);
  console.log('Wrapped WAVES:       ', wrappedWaves);
  console.log('\n!!! UPDATE YOUR .env FILES !!!');
  console.log('UNIT0_BRIDGE_ADDRESS=' + bridgeAddress);
}

main().catch(console.error);
