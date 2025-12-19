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
  const factoryArtifact = JSON.parse(fs.readFileSync('./artifacts/contracts/unit0/WrappedTokenFactory.sol/WrappedTokenFactory.json'));
  
  // Deploy factory
  console.log('Deploying WrappedTokenFactory...');
  const Factory = new ethers.ContractFactory(factoryArtifact.abi, factoryArtifact.bytecode, wallet);
  const factory = await Factory.deploy(BRIDGE_ADDRESS);
  await factory.waitForDeployment();
  
  const factoryAddress = await factory.getAddress();
  console.log('WrappedTokenFactory deployed at:', factoryAddress);
  
  return factoryAddress;
}

main().catch(console.error);
