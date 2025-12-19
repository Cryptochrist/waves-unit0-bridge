import { ethers, Contract, Wallet } from 'ethers';
import { TransferEvent, SignedAttestation, ChainType, TokenType, ValidatorConfig } from '../types/index.js';
import { Logger } from 'winston';
import { invokeScript, broadcast, waitForTx } from '@waves/waves-transactions';
import { publicKey } from '@waves/ts-lib-crypto';

// Bridge ABI for relaying transactions
const BRIDGE_ABI = [
  'function releaseTokens(bytes32 wavesTransferId, address token, uint256 amount, address recipient, uint8 tokenType, uint256 tokenId, bytes[] calldata signatures) external',
  'function releaseNFT(bytes32 transferId, address token, address recipient, uint256 tokenId, bytes[] calldata signatures) external',
  'function getTransferStatus(bytes32 transferId) view returns (uint8)',
  'function activeValidatorCount() view returns (uint256)',
  'function validatorThreshold() view returns (uint256)',
  'function isValidator(address) view returns (bool)',
  'function wavesToUnit0Token(string) view returns (address)',
  'function processedTransfers(bytes32) view returns (bool)',
];

// WAVES chain ID mapping
const WAVES_CHAIN_ID: Record<string, number> = {
  'W': 87, // Mainnet
  'T': 84, // Testnet
};

/**
 * Relayer service that submits transactions with collected signatures
 */
export class Relayer {
  private config: ValidatorConfig;
  private logger: Logger;
  private wallet: Wallet;
  private bridgeContract: Contract;
  private wavesSeed: string | null = null;
  private wavesPublicKey: string | null = null;

  // Transaction tracking
  private pendingTransactions: Map<string, { txHash: string; timestamp: number }> = new Map();
  private completedTransfers: Set<string> = new Set();

  constructor(config: ValidatorConfig, wallet: Wallet, logger: Logger) {
    this.config = config;
    this.logger = logger;
    this.wallet = wallet;

    // Connect wallet to provider
    const provider = new ethers.JsonRpcProvider(config.unit0RpcUrl);
    this.wallet = wallet.connect(provider);

    // Initialize bridge contract
    this.bridgeContract = new ethers.Contract(
      config.unit0BridgeAddress,
      BRIDGE_ABI,
      this.wallet
    );

    // Initialize WAVES credentials if seed is provided
    if (config.wavesSeed) {
      this.wavesSeed = config.wavesSeed;
      try {
        this.wavesPublicKey = publicKey(config.wavesSeed);
        this.logger.info(`WAVES relayer initialized with public key: ${this.wavesPublicKey}`);
      } catch (error) {
        this.logger.error('Failed to initialize WAVES credentials:', error);
      }
    } else {
      this.logger.warn('WAVES_SEED not configured - WAVES relay disabled');
    }
  }

  /**
   * Relay a transfer to Unit0 (release tokens on EVM side)
   */
  async relayToUnit0(
    transfer: TransferEvent,
    signatures: string[]
  ): Promise<string | null> {
    // Check if already processed
    if (this.completedTransfers.has(transfer.transferId)) {
      this.logger.debug(`Transfer ${transfer.transferId} already completed`);
      return null;
    }

    // Check if already pending
    if (this.pendingTransactions.has(transfer.transferId)) {
      this.logger.debug(`Transfer ${transfer.transferId} already pending`);
      return null;
    }

    try {
      // Convert WAVES transfer ID to bytes32
      const transferIdBytes32 = this.transferIdToBytes32(transfer.transferId);

      // Check if transfer already processed on-chain
      const alreadyProcessed = await this.bridgeContract.processedTransfers(transferIdBytes32);
      if (alreadyProcessed) {
        this.logger.info(`Transfer ${transfer.transferId} already processed on chain`);
        this.completedTransfers.add(transfer.transferId);
        return null;
      }

      // Check if we have enough signatures
      const threshold = await this.bridgeContract.validatorThreshold();
      if (signatures.length < Number(threshold)) {
        this.logger.warn(
          `Not enough signatures for ${transfer.transferId}: ${signatures.length}/${threshold}`
        );
        return null;
      }

      // Look up Unit0 token address for the WAVES asset
      const unit0TokenAddress = await this.getUnit0TokenAddress(transfer.token);
      if (unit0TokenAddress === ethers.ZeroAddress) {
        this.logger.error(`No Unit0 token registered for WAVES asset: ${transfer.token}`);
        return null;
      }

      this.logger.info(`Relaying transfer ${transfer.transferId} to Unit0`, {
        wavesAsset: transfer.token,
        unit0Token: unit0TokenAddress,
        amount: transfer.amount.toString(),
        recipient: transfer.recipient,
      });

      // Estimate gas first
      let tx;
      if (transfer.tokenType === TokenType.ERC721) {
        const gasEstimate = await this.bridgeContract.releaseNFT.estimateGas(
          transferIdBytes32,
          unit0TokenAddress,
          transfer.recipient,
          transfer.tokenId || 0,
          signatures
        );

        tx = await this.bridgeContract.releaseNFT(
          transferIdBytes32,
          unit0TokenAddress,
          transfer.recipient,
          transfer.tokenId || 0,
          signatures,
          { gasLimit: gasEstimate * BigInt(120) / BigInt(100) } // 20% buffer
        );
      } else {
        const gasEstimate = await this.bridgeContract.releaseTokens.estimateGas(
          transferIdBytes32,
          unit0TokenAddress,
          transfer.amount,
          transfer.recipient,
          this.tokenTypeToNumber(transfer.tokenType),
          transfer.tokenId || 0,
          signatures
        );

        tx = await this.bridgeContract.releaseTokens(
          transferIdBytes32,
          unit0TokenAddress,
          transfer.amount,
          transfer.recipient,
          this.tokenTypeToNumber(transfer.tokenType),
          transfer.tokenId || 0,
          signatures,
          { gasLimit: gasEstimate * BigInt(120) / BigInt(100) }
        );
      }

      // Track pending transaction
      this.pendingTransactions.set(transfer.transferId, {
        txHash: tx.hash,
        timestamp: Date.now(),
      });

      this.logger.info(`Transaction submitted: ${tx.hash}`);

      // Wait for confirmation
      const receipt = await tx.wait();

      if (receipt && receipt.status === 1) {
        this.completedTransfers.add(transfer.transferId);
        this.pendingTransactions.delete(transfer.transferId);
        this.logger.info(`Transfer ${transfer.transferId} completed successfully`);
        return tx.hash;
      } else {
        this.logger.error(`Transaction failed for ${transfer.transferId}`);
        this.pendingTransactions.delete(transfer.transferId);
        return null;
      }
    } catch (error) {
      this.logger.error(`Error relaying to Unit0:`, error);
      this.pendingTransactions.delete(transfer.transferId);
      return null;
    }
  }

  /**
   * Relay a transfer to WAVES (release tokens on WAVES side)
   */
  async relayToWaves(
    transfer: TransferEvent,
    signatures: string[],
    publicKeys: string[]
  ): Promise<string | null> {
    // Check if WAVES relay is configured
    if (!this.wavesSeed) {
      this.logger.warn('WAVES relay not configured - WAVES_SEED required');
      return null;
    }

    // Check if already processed
    if (this.completedTransfers.has(transfer.transferId)) {
      this.logger.debug(`Transfer ${transfer.transferId} already completed`);
      return null;
    }

    // Check if already pending
    if (this.pendingTransactions.has(transfer.transferId)) {
      this.logger.debug(`Transfer ${transfer.transferId} already pending`);
      return null;
    }

    try {
      this.logger.info(`Relaying transfer ${transfer.transferId} to WAVES`, {
        token: transfer.token,
        amount: transfer.amount.toString(),
        recipient: transfer.recipient,
        signaturesCount: signatures.length,
      });

      // Signatures from SignatureEngine.signTransferForWaves are base58 encoded
      // The WAVES transaction library expects base64 for binary type
      const signatureArgs = signatures.map(sig => ({
        type: 'binary' as const,
        value: sig.startsWith('0x') ? this.hexToBase64(sig) : this.base58ToBase64(sig),
      }));

      // Public keys are WAVES base58 format from SignatureEngine
      // Need to convert base58 to base64 for the binary arg type
      const publicKeyArgs = publicKeys.map(pk => {
        if (pk.startsWith('0x')) {
          return { type: 'binary' as const, value: this.hexToBase64(pk) };
        }
        // Convert base58 public key to base64
        return { type: 'binary' as const, value: this.base58ToBase64(pk) };
      });

      // Get the WAVES asset ID from the transfer
      // For Unit0->WAVES, transfer.token is the Unit0 ERC20 address
      // We need to resolve it to the WAVES asset ID
      const wavesAssetId = await this.getWavesAssetId(transfer.token);
      if (!wavesAssetId) {
        this.logger.error(`No WAVES asset mapping for Unit0 token: ${transfer.token}`);
        return null;
      }

      // Build the invoke script transaction
      const tx = invokeScript({
        dApp: this.config.wavesBridgeAddress,
        call: {
          function: 'releaseTokens',
          args: [
            { type: 'string', value: transfer.transferId },
            { type: 'string', value: transfer.recipient },
            { type: 'string', value: wavesAssetId },
            { type: 'integer', value: Number(transfer.amount) },
            { type: 'list', value: signatureArgs },
            { type: 'list', value: publicKeyArgs },
          ],
        },
        chainId: WAVES_CHAIN_ID[this.config.wavesChainId] || 87,
        fee: 500000, // 0.005 WAVES
      }, this.wavesSeed);

      // Track pending transaction
      this.pendingTransactions.set(transfer.transferId, {
        txHash: tx.id || '',
        timestamp: Date.now(),
      });

      this.logger.info(`Broadcasting WAVES transaction: ${tx.id}`);

      // Broadcast the transaction
      const result = await broadcast(tx, this.config.wavesNodeUrl);

      this.logger.info(`WAVES transaction broadcast successful: ${result.id}`);

      // Wait for confirmation
      try {
        await waitForTx(result.id, {
          apiBase: this.config.wavesNodeUrl,
          timeout: 60000, // 60 seconds timeout
        });

        this.completedTransfers.add(transfer.transferId);
        this.pendingTransactions.delete(transfer.transferId);
        this.logger.info(`Transfer ${transfer.transferId} completed on WAVES: ${result.id}`);
        return result.id;
      } catch (waitError) {
        this.logger.warn(`Transaction broadcast but confirmation pending: ${result.id}`, waitError);
        // Still return the tx ID since it was broadcast
        return result.id;
      }
    } catch (error: any) {
      this.logger.error(`Error relaying to WAVES:`, error);
      this.pendingTransactions.delete(transfer.transferId);

      // Check for specific error types
      if (error.message?.includes('already processed')) {
        this.completedTransfers.add(transfer.transferId);
        this.logger.info(`Transfer ${transfer.transferId} already processed on WAVES`);
      }

      return null;
    }
  }

  /**
   * Get WAVES asset ID for a Unit0 token address
   * This is the reverse lookup of wavesToUnit0Token
   */
  async getWavesAssetId(unit0TokenAddress: string): Promise<string | null> {
    // For now, we'll need to query the WAVES bridge contract state
    // to find the asset ID that maps to this Unit0 token
    try {
      const response = await fetch(
        `${this.config.wavesNodeUrl}/addresses/data/${this.config.wavesBridgeAddress}?matches=token_map_.*`
      );

      if (!response.ok) {
        this.logger.error(`Failed to query WAVES bridge state: ${response.status}`);
        return null;
      }

      const data = await response.json() as Array<{ key: string; value: string }>;

      // Token mapping format in WAVES: unit0Address|decimals|name|symbol
      for (const entry of data) {
        if (entry.key.startsWith('token_map_')) {
          const parts = entry.value.split('|');
          if (parts[0].toLowerCase() === unit0TokenAddress.toLowerCase()) {
            // Return the asset ID from the key
            return entry.key.replace('token_map_', '');
          }
        }
      }

      this.logger.warn(`No WAVES asset found for Unit0 token: ${unit0TokenAddress}`);
      return null;
    } catch (error) {
      this.logger.error(`Error looking up WAVES asset ID:`, error);
      return null;
    }
  }

  /**
   * Convert hex string to base64 for WAVES binary args
   */
  private hexToBase64(hex: string): string {
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
    }
    // Convert to base64
    return btoa(String.fromCharCode(...bytes));
  }

  /**
   * Convert base58 string to base64 for WAVES binary args
   */
  private base58ToBase64(base58Str: string): string {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const ALPHABET_MAP: { [key: string]: number } = {};
    for (let i = 0; i < ALPHABET.length; i++) {
      ALPHABET_MAP[ALPHABET[i]] = i;
    }

    // Decode base58 to bytes
    let bytes: number[] = [0];
    for (let i = 0; i < base58Str.length; i++) {
      const c = base58Str[i];
      const value = ALPHABET_MAP[c];
      if (value === undefined) {
        throw new Error(`Invalid base58 character: ${c}`);
      }
      for (let j = 0; j < bytes.length; j++) {
        bytes[j] *= 58;
      }
      bytes[0] += value;
      let carry = 0;
      for (let j = 0; j < bytes.length; j++) {
        bytes[j] += carry;
        carry = bytes[j] >> 8;
        bytes[j] &= 0xff;
      }
      while (carry) {
        bytes.push(carry & 0xff);
        carry >>= 8;
      }
    }
    // Handle leading zeros
    for (let i = 0; i < base58Str.length && base58Str[i] === '1'; i++) {
      bytes.push(0);
    }
    bytes.reverse();

    // Convert to base64
    return btoa(String.fromCharCode(...bytes));
  }

  /**
   * Convert token type to number
   */
  private tokenTypeToNumber(tokenType: TokenType): number {
    switch (tokenType) {
      case TokenType.ERC20:
        return 0;
      case TokenType.ERC721:
        return 1;
      case TokenType.ERC1155:
        return 2;
      default:
        return 0;
    }
  }

  /**
   * Convert hex string to bytes
   */
  private hexToBytes(hex: string): Uint8Array {
    const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
    const bytes = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
    }
    return bytes;
  }

  /**
   * Check if a transfer is pending
   */
  isTransferPending(transferId: string): boolean {
    return this.pendingTransactions.has(transferId);
  }

  /**
   * Check if a transfer is completed
   */
  isTransferCompleted(transferId: string): boolean {
    return this.completedTransfers.has(transferId);
  }

  /**
   * Get pending transaction info
   */
  getPendingTransaction(transferId: string): { txHash: string; timestamp: number } | undefined {
    return this.pendingTransactions.get(transferId);
  }

  /**
   * Get all pending transfers
   */
  getPendingTransfers(): string[] {
    return Array.from(this.pendingTransactions.keys());
  }

  /**
   * Get validator threshold from contract
   */
  async getValidatorThreshold(): Promise<number> {
    return Number(await this.bridgeContract.validatorThreshold());
  }

  /**
   * Get active validator count from contract
   */
  async getActiveValidatorCount(): Promise<number> {
    return Number(await this.bridgeContract.activeValidatorCount());
  }

  /**
   * Check if address is a validator
   */
  async isValidator(address: string): Promise<boolean> {
    return this.bridgeContract.isValidator(address);
  }

  /**
   * Get wallet balance
   */
  async getBalance(): Promise<bigint> {
    return this.wallet.provider!.getBalance(this.wallet.address);
  }

  /**
   * Get Unit0 token address for a WAVES asset
   */
  async getUnit0TokenAddress(wavesAssetId: string): Promise<string> {
    return this.bridgeContract.wavesToUnit0Token(wavesAssetId);
  }

  /**
   * Convert WAVES transfer ID to bytes32 format
   * Uses keccak256 hash of the string to get deterministic bytes32
   */
  transferIdToBytes32(transferId: string): string {
    return ethers.keccak256(ethers.toUtf8Bytes(transferId));
  }

  /**
   * Check if a transfer has been processed on-chain
   */
  async isTransferProcessedOnChain(transferId: string): Promise<boolean> {
    const bytes32Id = this.transferIdToBytes32(transferId);
    return this.bridgeContract.processedTransfers(bytes32Id);
  }

  /**
   * Clear old completed transfers from memory
   */
  pruneCompletedTransfers(maxAge: number = 24 * 60 * 60 * 1000): void {
    // Keep last 1000 completed transfers
    if (this.completedTransfers.size > 1000) {
      const entries = Array.from(this.completedTransfers);
      const toKeep = entries.slice(-500);
      this.completedTransfers = new Set(toKeep);
    }
  }
}
