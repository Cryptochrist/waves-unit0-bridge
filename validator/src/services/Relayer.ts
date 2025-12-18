import { ethers, Contract, Wallet } from 'ethers';
import { TransferEvent, SignedAttestation, ChainType, TokenType, ValidatorConfig } from '../types';
import { Logger } from 'winston';

// Bridge ABI for relaying transactions
const BRIDGE_ABI = [
  'function releaseTokens(bytes32 wavesTransferId, address token, uint256 amount, address recipient, uint8 tokenType, uint256 tokenId, bytes[] calldata signatures) external',
  'function releaseNFT(bytes32 transferId, address token, address recipient, uint256 tokenId, bytes[] calldata signatures) external',
  'function getTransferStatus(bytes32 transferId) view returns (uint8)',
  'function activeValidatorCount() view returns (uint256)',
  'function validatorThreshold() view returns (uint256)',
  'function isValidator(address) view returns (bool)',
];

// WAVES transaction builder types
interface WavesInvokeParams {
  dApp: string;
  call: {
    function: string;
    args: Array<{ type: string; value: string | number | Uint8Array }>;
  };
  payment?: Array<{ assetId: string | null; amount: number }>;
  chainId: string;
}

/**
 * Relayer service that submits transactions with collected signatures
 */
export class Relayer {
  private config: ValidatorConfig;
  private logger: Logger;
  private wallet: Wallet;
  private bridgeContract: Contract;

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
      // Check transfer status on chain
      const status = await this.bridgeContract.getTransferStatus(transfer.transferId);
      if (status !== 0) { // 0 = pending, 1 = completed, 2 = refunded
        this.logger.info(`Transfer ${transfer.transferId} already processed on chain (status: ${status})`);
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

      this.logger.info(`Relaying transfer ${transfer.transferId} to Unit0`);

      // Estimate gas first
      let tx;
      if (transfer.tokenType === TokenType.ERC721) {
        const gasEstimate = await this.bridgeContract.releaseNFT.estimateGas(
          transfer.transferId,
          transfer.token,
          transfer.recipient,
          transfer.tokenId || 0,
          signatures
        );

        tx = await this.bridgeContract.releaseNFT(
          transfer.transferId,
          transfer.token,
          transfer.recipient,
          transfer.tokenId || 0,
          signatures,
          { gasLimit: gasEstimate * BigInt(120) / BigInt(100) } // 20% buffer
        );
      } else {
        const gasEstimate = await this.bridgeContract.releaseTokens.estimateGas(
          transfer.transferId,
          transfer.token,
          transfer.amount,
          transfer.recipient,
          this.tokenTypeToNumber(transfer.tokenType),
          transfer.tokenId || 0,
          signatures
        );

        tx = await this.bridgeContract.releaseTokens(
          transfer.transferId,
          transfer.token,
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
    // Check if already processed
    if (this.completedTransfers.has(transfer.transferId)) {
      this.logger.debug(`Transfer ${transfer.transferId} already completed`);
      return null;
    }

    try {
      this.logger.info(`Relaying transfer ${transfer.transferId} to WAVES`);

      // Build WAVES invoke script transaction
      const invokeParams: WavesInvokeParams = {
        dApp: this.config.wavesBridgeAddress,
        call: {
          function: 'releaseTokens',
          args: [
            { type: 'string', value: transfer.transferId },
            { type: 'string', value: transfer.recipient },
            { type: 'string', value: transfer.token },
            { type: 'integer', value: Number(transfer.amount) },
            {
              type: 'list',
              value: signatures.map(s => ({
                type: 'binary',
                value: this.hexToBytes(s),
              })),
            } as any,
            {
              type: 'list',
              value: publicKeys.map(pk => ({
                type: 'binary',
                value: this.hexToBytes(pk),
              })),
            } as any,
          ],
        },
        chainId: this.config.wavesChainId,
      };

      // Note: Actual WAVES transaction signing would require @waves/waves-transactions
      // This is a placeholder for the structure
      this.logger.warn('WAVES relay not fully implemented - requires waves-transactions library');

      // TODO: Sign and broadcast using waves-transactions
      // const signedTx = await invoke(invokeParams, privateKey);
      // const result = await broadcast(signedTx, nodeUrl);

      return null;
    } catch (error) {
      this.logger.error(`Error relaying to WAVES:`, error);
      return null;
    }
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
