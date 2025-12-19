const { ethers } = require('ethers');
require('dotenv').config({ path: './validator/.env' });

const UNIT0_RPC = process.env.UNIT0_RPC_URL;
const BRIDGE_ADDRESS = process.env.UNIT0_BRIDGE_ADDRESS;
const WAVES_NODE = process.env.WAVES_NODE_URL;
const WAVES_BRIDGE = process.env.WAVES_BRIDGE_ADDRESS;
const UNIT0_CHAIN_ID = parseInt(process.env.UNIT0_CHAIN_ID);

const BRIDGE_ABI = [
  'function releaseTokens(bytes32 wavesTransferId, address token, uint256 amount, address recipient, uint8 tokenType, uint256 tokenId, bytes[] calldata signatures) external',
  'function wavesToUnit0Token(string) external view returns (address)',
  'function processedTransfers(bytes32) external view returns (bool)',
  'function validatorThreshold() external view returns (uint256)'
];

async function main() {
  const provider = new ethers.JsonRpcProvider(UNIT0_RPC);
  const wallet = new ethers.Wallet(process.env.VALIDATOR_PRIVATE_KEY, provider);
  const bridge = new ethers.Contract(BRIDGE_ADDRESS, BRIDGE_ABI, wallet);
  
  console.log('Validator address:', wallet.address);
  console.log('Unit0 Chain ID:', UNIT0_CHAIN_ID);
  
  // Get wrapped WAVES token address
  const wrappedWaves = await bridge.wavesToUnit0Token('WAVES');
  console.log('Wrapped WAVES token:', wrappedWaves);
  
  // Fetch pending locks from WAVES
  const resp = await fetch(WAVES_NODE + '/addresses/data/' + WAVES_BRIDGE);
  const data = await resp.json();
  
  const locks = data.filter(d => d.key.startsWith('lock_'));
  console.log('\nFound', locks.length, 'lock(s) to process\n');
  
  for (const lock of locks) {
    const lockId = lock.key.replace('lock_', '');
    const parts = lock.value.split('|');
    
    // Parse: assetId|amount|sender|destination|timestamp|nonce|chainId
    const assetId = parts[0];
    const amount = BigInt(parts[1]);
    const destination = parts[3];
    
    console.log('Processing lock:', lockId);
    console.log('  Amount:', amount.toString(), '(', Number(amount) / 1e8, 'WAVES)');
    console.log('  Destination:', destination);
    
    // Convert lock ID to bytes32 (use the actual lock ID hash from WAVES)
    const wavesTransferId = ethers.keccak256(ethers.toUtf8Bytes(lockId));
    console.log('  Transfer ID (bytes32):', wavesTransferId);
    
    // Check if already processed
    const isProcessed = await bridge.processedTransfers(wavesTransferId);
    if (isProcessed) {
      console.log('  Already processed, skipping\n');
      continue;
    }
    
    // Get the token address
    const tokenAddress = assetId === 'WAVES' ? wrappedWaves : await bridge.wavesToUnit0Token(assetId);
    if (tokenAddress === '0x0000000000000000000000000000000000000000') {
      console.log('  Token not registered, skipping\n');
      continue;
    }
    
    // Create message hash for signing using solidityPacked (matches abi.encodePacked)
    const tokenType = 0; // ERC20
    const tokenId = 0n;
    
    // This must match the bridge's messageHash calculation:
    // keccak256(abi.encodePacked(wavesTransferId, token, amount, recipient, tokenType, tokenId, block.chainid))
    const messageHash = ethers.keccak256(
      ethers.solidityPacked(
        ['bytes32', 'address', 'uint256', 'address', 'uint8', 'uint256', 'uint256'],
        [wavesTransferId, tokenAddress, amount, destination, tokenType, tokenId, BigInt(UNIT0_CHAIN_ID)]
      )
    );
    
    console.log('  Message hash:', messageHash);
    
    // Sign the raw message hash (the contract will apply toEthSignedMessageHash)
    const signature = await wallet.signMessage(ethers.getBytes(messageHash));
    console.log('  Signature:', signature.slice(0, 20) + '...');
    
    // Submit release transaction
    try {
      console.log('  Submitting release transaction...');
      const tx = await bridge.releaseTokens(
        wavesTransferId,
        tokenAddress,
        amount,
        destination,
        tokenType,
        tokenId,
        [signature]
      );
      console.log('  TX Hash:', tx.hash);
      const receipt = await tx.wait();
      console.log('  Confirmed in block:', receipt.blockNumber);
      console.log('  SUCCESS!\n');
    } catch (error) {
      console.log('  ERROR:', error.reason || error.message, '\n');
      
      // Debug: try to recover the signer
      const ethSignedHash = ethers.hashMessage(ethers.getBytes(messageHash));
      const recovered = ethers.recoverAddress(ethSignedHash, signature);
      console.log('  Recovered signer:', recovered);
      console.log('  Expected signer:', wallet.address);
    }
  }
}

main().catch(console.error);
