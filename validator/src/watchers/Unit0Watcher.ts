import { EventEmitter } from 'events';
import { ethers, Contract, Provider, Log, EventLog } from 'ethers';
import { TransferEvent, ChainType, TokenType, ValidatorConfig } from '../types/index.js';
import { Logger } from 'winston';

// Bridge contract ABI (only the events we need)
// Must match WavesUnit0Bridge.sol event signatures exactly
const BRIDGE_ABI = [
  'event TokensLocked(bytes32 indexed lockId, address indexed token, uint256 amount, address indexed sender, string wavesDestination, uint256 nonce, uint8 tokenType, uint256 tokenId)',
  'event TokensReleased(bytes32 indexed wavesTransferId, address indexed token, uint256 amount, address indexed recipient, uint8 tokenType, uint256 tokenId)',
  'function processedTransfers(bytes32) view returns (bool)',
];

/**
 * Watches the Unit0 (EVM) blockchain for bridge lock events
 */
export class Unit0Watcher extends EventEmitter {
  private config: ValidatorConfig;
  private logger: Logger;
  private provider: Provider;
  private bridgeContract: Contract;
  private lastProcessedBlock: number = 0;
  private isRunning: boolean = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private readonly POLL_INTERVAL_MS = 2000; // 2 seconds
  private readonly BLOCKS_PER_QUERY = 1000; // Max blocks to query at once

  constructor(config: ValidatorConfig, logger: Logger) {
    super();
    this.config = config;
    this.logger = logger;

    // Initialize provider
    this.provider = new ethers.JsonRpcProvider(config.unit0RpcUrl);

    // Initialize bridge contract
    this.bridgeContract = new ethers.Contract(
      config.unit0BridgeAddress,
      BRIDGE_ABI,
      this.provider
    );
  }

  /**
   * Start watching for events
   */
  async start(fromBlock?: number): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Unit0 watcher already running');
      return;
    }

    this.isRunning = true;

    // Get current block if not specified
    if (fromBlock !== undefined) {
      this.lastProcessedBlock = fromBlock;
    } else {
      const currentBlock = await this.provider.getBlockNumber();
      this.lastProcessedBlock = currentBlock - this.config.unit0Confirmations;
    }

    this.logger.info(`Starting Unit0 watcher from block ${this.lastProcessedBlock}`);

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
    this.logger.info('Unit0 watcher stopped');
  }

  /**
   * Poll for new blocks
   */
  private async poll(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const currentBlock = await this.provider.getBlockNumber();
      const confirmedBlock = currentBlock - this.config.unit0Confirmations;

      // Process new confirmed blocks in batches
      while (this.lastProcessedBlock < confirmedBlock) {
        const fromBlock = this.lastProcessedBlock + 1;
        const toBlock = Math.min(
          fromBlock + this.BLOCKS_PER_QUERY - 1,
          confirmedBlock
        );

        await this.processBlockRange(fromBlock, toBlock);
        this.lastProcessedBlock = toBlock;
      }
    } catch (error) {
      this.logger.error('Error polling Unit0 blockchain:', error);
      this.emit('error', error);
    }

    // Schedule next poll
    if (this.isRunning) {
      this.pollInterval = setTimeout(() => this.poll(), this.POLL_INTERVAL_MS);
    }
  }

  /**
   * Process a range of blocks
   */
  private async processBlockRange(fromBlock: number, toBlock: number): Promise<void> {
    try {
      // Query TokensLocked events
      const tokensLockedFilter = this.bridgeContract.filters.TokensLocked();
      const tokensLockedEvents = await this.bridgeContract.queryFilter(
        tokensLockedFilter,
        fromBlock,
        toBlock
      );

      // Process all events
      for (const event of tokensLockedEvents) {
        await this.handleTokensLocked(event as EventLog);
      }

      if (tokensLockedEvents.length > 0) {
        this.logger.info(
          `Processed blocks ${fromBlock}-${toBlock}: ${tokensLockedEvents.length} token locks`
        );
      }

      this.emit('blocks', { fromBlock, toBlock });
    } catch (error) {
      this.logger.error(`Error processing Unit0 blocks ${fromBlock}-${toBlock}:`, error);
      throw error;
    }
  }

  /**
   * Handle TokensLocked event
   * Event signature: TokensLocked(bytes32 indexed lockId, address indexed token, uint256 amount, address indexed sender, string wavesDestination, uint256 nonce, uint8 tokenType, uint256 tokenId)
   */
  private async handleTokensLocked(event: EventLog): Promise<void> {
    try {
      const block = await event.getBlock();
      // Args order matches event: lockId, token, amount, sender, wavesDestination, nonce, tokenType, tokenId
      const [lockId, token, amount, sender, wavesDestination, nonce, tokenType, tokenId] = event.args || [];

      // Map tokenType number to our enum
      let mappedTokenType: TokenType;
      switch (Number(tokenType)) {
        case 0:
          mappedTokenType = TokenType.ERC20;
          break;
        case 1:
          mappedTokenType = TokenType.ERC721;
          break;
        case 2:
          mappedTokenType = TokenType.ERC1155;
          break;
        default:
          mappedTokenType = TokenType.ERC20;
      }

      const transferEvent: TransferEvent = {
        transferId: lockId, // Use the lockId as the transfer ID
        sourceChain: ChainType.UNIT0,
        destinationChain: ChainType.WAVES,
        token: token,
        amount: BigInt(amount),
        sender: sender,
        recipient: wavesDestination, // WAVES address string
        tokenType: mappedTokenType,
        tokenId: tokenId ? BigInt(tokenId) : undefined,
        sourceBlockNumber: event.blockNumber,
        sourceBlockHash: event.blockHash,
        sourceTxHash: event.transactionHash,
        timestamp: block.timestamp * 1000,
        status: 'pending',
      };

      this.logger.info(`Detected Unit0 lock: ${transferEvent.transferId}`, {
        token: transferEvent.token,
        amount: transferEvent.amount.toString(),
        recipient: transferEvent.recipient,
        nonce: nonce.toString(),
      });

      this.emit('transfer', transferEvent);
    } catch (error) {
      this.logger.error(`Error processing TokensLocked event:`, error);
    }
  }

  /**
   * Check if a transfer has been processed
   */
  async isTransferProcessed(transferId: string): Promise<boolean> {
    return this.bridgeContract.processedTransfers(transferId);
  }

  /**
   * Get current block number
   */
  async getCurrentBlock(): Promise<number> {
    return this.provider.getBlockNumber();
  }

  /**
   * Get block details
   */
  async getBlock(blockNumber: number) {
    return this.provider.getBlock(blockNumber);
  }

  /**
   * Get transaction receipt
   */
  async getTransactionReceipt(txHash: string) {
    return this.provider.getTransactionReceipt(txHash);
  }

  /**
   * Check if a block is finalized (has enough confirmations)
   */
  async isBlockFinalized(blockNumber: number): Promise<boolean> {
    const currentBlock = await this.provider.getBlockNumber();
    return currentBlock - blockNumber >= this.config.unit0Confirmations;
  }

  /**
   * Get current processed block
   */
  getLastProcessedBlock(): number {
    return this.lastProcessedBlock;
  }

  /**
   * Get provider instance
   */
  getProvider(): Provider {
    return this.provider;
  }

  /**
   * Get bridge contract instance
   */
  getBridgeContract(): Contract {
    return this.bridgeContract;
  }
}
