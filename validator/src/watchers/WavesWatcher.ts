import { EventEmitter } from 'events';
import { TransferEvent, ChainType, TokenType, ValidatorConfig } from '../types/index.js';
import { Logger } from 'winston';

interface WavesTransaction {
  id: string;
  type: number;
  sender: string;
  senderPublicKey: string;
  timestamp: number;
  height: number;
  dApp?: string;  // Address of the dApp being called
  call?: {
    function: string;
    args: Array<{ type: string; value: string | number }>;
  };
  payment?: Array<{ assetId: string | null; amount: number }>;
  stateChanges?: {
    data: Array<{ key: string; type: string; value: string | number }>;
    transfers: Array<{ address: string; asset: string | null; amount: number }>;
    invokes: Array<unknown>;
  };
}

interface WavesBlock {
  height: number;
  timestamp: number;
  transactions: WavesTransaction[];
}

/**
 * Watches the WAVES blockchain for bridge lock events
 */
export class WavesWatcher extends EventEmitter {
  private config: ValidatorConfig;
  private logger: Logger;
  private lastProcessedHeight: number = 0;
  private isRunning: boolean = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private readonly POLL_INTERVAL_MS = 3000; // 3 seconds
  private readonly BLOCK_DELAY_MS = 1500; // Delay between block fetches to avoid rate limiting
  private readonly MAX_RETRIES = 5;
  private readonly RETRY_DELAY_MS = 3000;

  constructor(config: ValidatorConfig, logger: Logger) {
    super();
    this.config = config;
    this.logger = logger;
  }

  /**
   * Start watching for events
   */
  async start(fromHeight?: number): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('WAVES watcher already running');
      return;
    }

    this.isRunning = true;

    // Get current height if not specified
    if (fromHeight !== undefined) {
      this.lastProcessedHeight = fromHeight;
    } else {
      this.lastProcessedHeight = await this.getCurrentHeight() - this.config.wavesConfirmations;
    }

    this.logger.info(`Starting WAVES watcher from height ${this.lastProcessedHeight}`);

    // Start polling
    this.poll();
  }

  /**
   * Stop watching for events
   */
  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.pollInterval) {
      clearTimeout(this.pollInterval);
      this.pollInterval = null;
    }
    this.logger.info('WAVES watcher stopped');
  }

  /**
   * Get current blockchain height with retry logic
   */
  async getCurrentHeight(): Promise<number> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(`${this.config.wavesNodeUrl}/blocks/height`);

        if (response.status === 429) {
          const waitTime = this.RETRY_DELAY_MS * attempt;
          this.logger.warn(`Rate limited fetching height, waiting ${waitTime}ms (attempt ${attempt}/${this.MAX_RETRIES})`);
          await this.sleep(waitTime);
          continue;
        }

        if (!response.ok) {
          throw new Error(`Failed to get WAVES height: ${response.statusText}`);
        }

        const data = await response.json() as { height: number };
        return data.height;
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.MAX_RETRIES) {
          const waitTime = this.RETRY_DELAY_MS * attempt;
          await this.sleep(waitTime);
        }
      }
    }

    throw lastError || new Error(`Failed to get WAVES height after ${this.MAX_RETRIES} retries`);
  }

  /**
   * Poll for new blocks
   */
  private async poll(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const currentHeight = await this.getCurrentHeight();
      const confirmedHeight = currentHeight - this.config.wavesConfirmations;

      // Process new confirmed blocks with rate limiting
      while (this.lastProcessedHeight < confirmedHeight) {
        const targetHeight = this.lastProcessedHeight + 1;
        await this.processBlock(targetHeight);
        this.lastProcessedHeight = targetHeight;

        // Add delay between blocks to avoid rate limiting
        if (this.lastProcessedHeight < confirmedHeight) {
          await this.sleep(this.BLOCK_DELAY_MS);
        }
      }
    } catch (error) {
      this.logger.error('Error polling WAVES blockchain:', error);
      this.emit('error', error);
    }

    // Schedule next poll
    if (this.isRunning) {
      this.pollInterval = setTimeout(() => this.poll(), this.POLL_INTERVAL_MS);
    }
  }

  /**
   * Process a single block
   */
  private async processBlock(height: number): Promise<void> {
    try {
      const block = await this.getBlock(height);

      let bridgeTxCount = 0;
      for (const tx of block.transactions) {
        // Only process invoke script transactions to the bridge
        if (tx.type === 16 && this.isBridgeTransaction(tx)) {
          this.logger.debug(`Found bridge transaction ${tx.id} in block ${height}`);
          await this.processTransaction(tx, height);
          bridgeTxCount++;
        }
      }

      if (bridgeTxCount > 0) {
        this.logger.info(`Processed ${bridgeTxCount} bridge transaction(s) in block ${height}`);
      } else {
        this.logger.debug(`Processed block ${height} (no bridge txs)`);
      }

      this.emit('block', { height, timestamp: block.timestamp });
    } catch (error) {
      this.logger.error(`Error processing WAVES block ${height}:`, error);
      throw error;
    }
  }

  /**
   * Get block by height with retry logic
   */
  private async getBlock(height: number): Promise<WavesBlock> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const response = await fetch(`${this.config.wavesNodeUrl}/blocks/at/${height}`);

        if (response.status === 429) {
          // Rate limited - wait and retry
          const waitTime = this.RETRY_DELAY_MS * attempt;
          this.logger.warn(`Rate limited fetching block ${height}, waiting ${waitTime}ms (attempt ${attempt}/${this.MAX_RETRIES})`);
          await this.sleep(waitTime);
          continue;
        }

        if (!response.ok) {
          throw new Error(`Failed to get WAVES block ${height}: ${response.statusText}`);
        }

        return response.json() as Promise<WavesBlock>;
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.MAX_RETRIES) {
          const waitTime = this.RETRY_DELAY_MS * attempt;
          this.logger.warn(`Error fetching block ${height}, retrying in ${waitTime}ms (attempt ${attempt}/${this.MAX_RETRIES})`);
          await this.sleep(waitTime);
        }
      }
    }

    throw lastError || new Error(`Failed to get WAVES block ${height} after ${this.MAX_RETRIES} retries`);
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if transaction is to the bridge contract
   */
  private isBridgeTransaction(tx: WavesTransaction): boolean {
    // Check if it's an invoke to the bridge dApp address
    return tx.dApp === this.config.wavesBridgeAddress;
  }

  /**
   * Process a bridge transaction
   */
  private async processTransaction(tx: WavesTransaction, height: number): Promise<void> {
    if (!tx.call) return;

    const functionName = tx.call.function;

    if (functionName === 'lockTokens') {
      await this.handleLockTokens(tx, height);
    } else if (functionName === 'lockNFT') {
      await this.handleLockNFT(tx, height);
    }
  }

  /**
   * Handle lockTokens event
   */
  private async handleLockTokens(tx: WavesTransaction, height: number): Promise<void> {
    try {
      const args = tx.call?.args || [];
      const payment = tx.payment?.[0];

      if (!payment) {
        this.logger.warn(`Lock transaction ${tx.id} has no payment`);
        return;
      }

      // Extract destination address from args
      const destinationAddress = args[0]?.value as string;
      const destinationChainId = args[1]?.value as number;

      if (!destinationAddress || destinationChainId !== this.config.unit0ChainId) {
        return;
      }

      // Get transfer ID from state changes
      const transferIdData = tx.stateChanges?.data.find(
        d => d.key.startsWith('transfer_') && d.key.endsWith('_id')
      );

      const transferId = transferIdData?.value as string || tx.id;

      const event: TransferEvent = {
        transferId,
        sourceChain: ChainType.WAVES,
        destinationChain: ChainType.UNIT0,
        token: payment.assetId || 'WAVES',
        amount: BigInt(payment.amount),
        sender: tx.sender,
        recipient: destinationAddress,
        tokenType: TokenType.ERC20, // WAVES assets map to ERC20
        tokenId: undefined,
        sourceBlockNumber: height,
        sourceBlockHash: '', // WAVES doesn't use block hashes the same way
        sourceTxHash: tx.id,
        timestamp: tx.timestamp,
        status: 'pending',
      };

      this.logger.info(`Detected WAVES lock: ${event.transferId}`, {
        token: event.token,
        amount: event.amount.toString(),
        recipient: event.recipient,
      });

      this.emit('transfer', event);
    } catch (error) {
      this.logger.error(`Error processing lock transaction ${tx.id}:`, error);
    }
  }

  /**
   * Handle lockNFT event
   */
  private async handleLockNFT(tx: WavesTransaction, height: number): Promise<void> {
    try {
      const args = tx.call?.args || [];
      const payment = tx.payment?.[0];

      if (!payment) {
        this.logger.warn(`NFT lock transaction ${tx.id} has no payment`);
        return;
      }

      const destinationAddress = args[0]?.value as string;
      const destinationChainId = args[1]?.value as number;

      if (!destinationAddress || destinationChainId !== this.config.unit0ChainId) {
        return;
      }

      const transferId = tx.id;

      const event: TransferEvent = {
        transferId,
        sourceChain: ChainType.WAVES,
        destinationChain: ChainType.UNIT0,
        token: payment.assetId || '',
        amount: BigInt(1),
        sender: tx.sender,
        recipient: destinationAddress,
        tokenType: TokenType.ERC721,
        tokenId: undefined, // NFTs on WAVES are just unique assets
        sourceBlockNumber: height,
        sourceBlockHash: '',
        sourceTxHash: tx.id,
        timestamp: tx.timestamp,
        status: 'pending',
      };

      this.logger.info(`Detected WAVES NFT lock: ${event.transferId}`);

      this.emit('transfer', event);
    } catch (error) {
      this.logger.error(`Error processing NFT lock transaction ${tx.id}:`, error);
    }
  }

  /**
   * Get transactions for a specific address
   */
  async getAddressTransactions(address: string, limit: number = 100): Promise<WavesTransaction[]> {
    const response = await fetch(
      `${this.config.wavesNodeUrl}/transactions/address/${address}/limit/${limit}`
    );
    if (!response.ok) {
      throw new Error(`Failed to get transactions: ${response.statusText}`);
    }
    const data = await response.json() as WavesTransaction[][];
    return data[0] || [];
  }

  /**
   * Get asset info
   */
  async getAssetInfo(assetId: string): Promise<{
    name: string;
    decimals: number;
    description: string;
    quantity: bigint;
    reissuable: boolean;
  }> {
    const response = await fetch(`${this.config.wavesNodeUrl}/assets/details/${assetId}`);
    if (!response.ok) {
      throw new Error(`Failed to get asset info: ${response.statusText}`);
    }
    const data = await response.json() as {
      name: string;
      decimals: number;
      description: string;
      quantity: string;
      reissuable: boolean;
    };
    return {
      name: data.name,
      decimals: data.decimals,
      description: data.description,
      quantity: BigInt(data.quantity),
      reissuable: data.reissuable,
    };
  }

  /**
   * Get current processed height
   */
  getLastProcessedHeight(): number {
    return this.lastProcessedHeight;
  }
}
