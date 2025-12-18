import { ethers } from 'ethers';
import winston from 'winston';
import { loadConfig } from './config';
import { ValidatorConfig, TransferEvent, SignedAttestation, ChainType } from './types';
import { WavesWatcher } from './watchers/WavesWatcher';
import { Unit0Watcher } from './watchers/Unit0Watcher';
import { SignatureEngine, SignatureBatcher } from './services/SignatureEngine';
import { P2PNetwork } from './p2p/P2PNetwork';
import { Relayer } from './services/Relayer';
import { Database, TransferRecord } from './services/Database';

/**
 * Main Validator Node class
 *
 * Coordinates all components:
 * - Chain watchers for detecting lock events
 * - Signature engine for signing attestations
 * - P2P network for sharing attestations
 * - Relayer for submitting transactions
 * - Database for persistence
 */
export class ValidatorNode {
  private config: ValidatorConfig;
  private logger: winston.Logger;
  private wavesWatcher: WavesWatcher;
  private unit0Watcher: Unit0Watcher;
  private signatureEngine: SignatureEngine;
  private signatureBatcher: SignatureBatcher;
  private p2pNetwork: P2PNetwork;
  private relayer: Relayer;
  private database: Database;
  private isRunning: boolean = false;

  // Processing intervals
  private processInterval: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly PROCESS_INTERVAL_MS = 5000;
  private readonly HEARTBEAT_INTERVAL_MS = 30000;

  constructor(config: ValidatorConfig) {
    this.config = config;

    // Initialize logger
    this.logger = winston.createLogger({
      level: config.logLevel,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
          return `${timestamp} [${level}]: ${message} ${metaStr}`;
        })
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({
          filename: 'validator.log',
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
        }),
      ],
    });

    // Initialize signature engine
    this.signatureEngine = new SignatureEngine(config.validatorPrivateKey, this.logger);
    this.signatureBatcher = new SignatureBatcher(this.signatureEngine, this.logger);

    // Initialize database
    this.database = new Database(config.dbPath, this.logger);

    // Initialize watchers
    this.wavesWatcher = new WavesWatcher(config, this.logger);
    this.unit0Watcher = new Unit0Watcher(config, this.logger);

    // Initialize P2P network
    this.p2pNetwork = new P2PNetwork(
      config,
      this.signatureEngine.getValidatorAddress(),
      this.logger
    );

    // Initialize relayer
    this.relayer = new Relayer(
      config,
      this.signatureEngine.getWallet(),
      this.logger
    );
  }

  /**
   * Start the validator node
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Validator node already running');
      return;
    }

    this.logger.info('Starting validator node...');
    this.logger.info(`Validator address: ${this.signatureEngine.getValidatorAddress()}`);

    try {
      // Open database
      await this.database.open();

      // Get last processed heights
      const wavesHeight = await this.database.getWavesBlockHeight();
      const unit0Height = await this.database.getUnit0BlockHeight();

      // Set up event handlers
      this.setupEventHandlers();

      // Start P2P network
      await this.p2pNetwork.start();

      // Start watchers
      await this.wavesWatcher.start(wavesHeight || undefined);
      await this.unit0Watcher.start(unit0Height || undefined);

      this.isRunning = true;

      // Start processing loop
      this.startProcessingLoop();

      // Start heartbeat
      this.startHeartbeat();

      this.logger.info('Validator node started successfully');
    } catch (error) {
      this.logger.error('Failed to start validator node:', error);
      await this.stop();
      throw error;
    }
  }

  /**
   * Stop the validator node
   */
  async stop(): Promise<void> {
    this.logger.info('Stopping validator node...');
    this.isRunning = false;

    // Stop intervals
    if (this.processInterval) {
      clearInterval(this.processInterval);
      this.processInterval = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    // Stop components
    await this.wavesWatcher.stop();
    await this.unit0Watcher.stop();
    await this.p2pNetwork.stop();

    // Save final block heights
    await this.database.saveWavesBlockHeight(this.wavesWatcher.getLastProcessedHeight());
    await this.database.saveUnit0BlockHeight(this.unit0Watcher.getLastProcessedBlock());

    // Close database
    await this.database.close();

    this.logger.info('Validator node stopped');
  }

  /**
   * Set up event handlers for all components
   */
  private setupEventHandlers(): void {
    // WAVES watcher events
    this.wavesWatcher.on('transfer', (transfer: TransferEvent) => {
      this.handleNewTransfer(transfer);
    });

    this.wavesWatcher.on('block', ({ height }: { height: number }) => {
      this.database.saveWavesBlockHeight(height);
    });

    this.wavesWatcher.on('error', (error: Error) => {
      this.logger.error('WAVES watcher error:', error);
    });

    // Unit0 watcher events
    this.unit0Watcher.on('transfer', (transfer: TransferEvent) => {
      this.handleNewTransfer(transfer);
    });

    this.unit0Watcher.on('blocks', ({ toBlock }: { toBlock: number }) => {
      this.database.saveUnit0BlockHeight(toBlock);
    });

    this.unit0Watcher.on('error', (error: Error) => {
      this.logger.error('Unit0 watcher error:', error);
    });

    // P2P network events
    this.p2pNetwork.on('attestation', (attestation: SignedAttestation) => {
      this.handleReceivedAttestation(attestation);
    });

    this.p2pNetwork.on('transfer', (transfer: TransferEvent) => {
      // Transfer detected by another validator
      this.handleNewTransfer(transfer);
    });

    this.p2pNetwork.on('peer:connect', (peerId: string) => {
      this.logger.info(`Peer connected: ${peerId}`);
    });

    this.p2pNetwork.on('peer:disconnect', (peerId: string) => {
      this.logger.info(`Peer disconnected: ${peerId}`);
    });
  }

  /**
   * Handle a new transfer detected from chain watchers
   */
  private async handleNewTransfer(transfer: TransferEvent): Promise<void> {
    try {
      this.logger.info(`New transfer detected: ${transfer.transferId}`, {
        source: transfer.sourceChain,
        destination: transfer.destinationChain,
        token: transfer.token,
        amount: transfer.amount.toString(),
      });

      // Save to database
      await this.database.saveTransfer(transfer);

      // Sign attestation
      const attestation =
        transfer.destinationChain === ChainType.UNIT0
          ? await this.signatureEngine.signTransferForUnit0(transfer)
          : await this.signatureEngine.signTransferForWaves(transfer);

      // Save our attestation
      await this.database.saveAttestation(attestation);
      this.signatureBatcher.addSignature(transfer.transferId, attestation);

      // Broadcast to network
      await this.p2pNetwork.broadcastAttestation(attestation);
      await this.p2pNetwork.broadcastTransfer(transfer);

      // Update status
      await this.database.updateTransferStatus(transfer.transferId, 'attesting');
    } catch (error) {
      this.logger.error(`Error handling new transfer ${transfer.transferId}:`, error);
    }
  }

  /**
   * Handle attestation received from P2P network
   */
  private async handleReceivedAttestation(attestation: SignedAttestation): Promise<void> {
    try {
      // Check if we already have this attestation
      const exists = await this.database.hasAttestation(
        attestation.transferId,
        attestation.validatorAddress
      );
      if (exists) {
        return;
      }

      // Verify signature (basic check - full verification needs validator list)
      const isValid = this.signatureEngine.verifySignature(
        attestation,
        attestation.validatorAddress
      );

      if (!isValid) {
        this.logger.warn(
          `Invalid attestation from ${attestation.validatorAddress} for ${attestation.transferId}`
        );
        return;
      }

      // Save attestation
      await this.database.saveAttestation(attestation);
      this.signatureBatcher.addSignature(attestation.transferId, attestation);

      this.logger.debug(
        `Received valid attestation from ${attestation.validatorAddress} for ${attestation.transferId}`
      );
    } catch (error) {
      this.logger.error('Error handling received attestation:', error);
    }
  }

  /**
   * Start the main processing loop
   */
  private startProcessingLoop(): void {
    this.processInterval = setInterval(async () => {
      await this.processPendingTransfers();
    }, this.PROCESS_INTERVAL_MS);
  }

  /**
   * Process pending transfers that may be ready for relay
   */
  private async processPendingTransfers(): Promise<void> {
    try {
      const pendingTransfers = await this.database.getPendingTransfers();
      const threshold = await this.relayer.getValidatorThreshold();

      for (const record of pendingTransfers) {
        const signatures = record.attestations.map((a) => a.signature);

        // Check if we have enough signatures
        if (signatures.length >= threshold) {
          await this.relayTransfer(record, signatures);
        }
      }
    } catch (error) {
      this.logger.error('Error processing pending transfers:', error);
    }
  }

  /**
   * Relay a transfer with collected signatures
   */
  private async relayTransfer(record: TransferRecord, signatures: string[]): Promise<void> {
    const { transfer } = record;

    this.logger.info(`Relaying transfer ${transfer.transferId} with ${signatures.length} signatures`);

    try {
      let txHash: string | null = null;

      if (transfer.destinationChain === ChainType.UNIT0) {
        txHash = await this.relayer.relayToUnit0(transfer, signatures);
      } else {
        const publicKeys = record.attestations.map((a) => a.validatorAddress);
        txHash = await this.relayer.relayToWaves(transfer, signatures, publicKeys);
      }

      if (txHash) {
        await this.database.updateTransferStatus(transfer.transferId, 'completed', txHash);
        this.signatureBatcher.clearSignatures(transfer.transferId);
        this.logger.info(`Transfer ${transfer.transferId} completed: ${txHash}`);
      }
    } catch (error) {
      this.logger.error(`Error relaying transfer ${transfer.transferId}:`, error);
    }
  }

  /**
   * Start heartbeat for P2P network
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(async () => {
      await this.p2pNetwork.sendHeartbeat();
    }, this.HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Get node status
   */
  async getStatus(): Promise<{
    isRunning: boolean;
    validatorAddress: string;
    wavesHeight: number;
    unit0Height: number;
    connectedPeers: number;
    pendingTransfers: number;
  }> {
    const stats = await this.database.getStats();

    return {
      isRunning: this.isRunning,
      validatorAddress: this.signatureEngine.getValidatorAddress(),
      wavesHeight: this.wavesWatcher.getLastProcessedHeight(),
      unit0Height: this.unit0Watcher.getLastProcessedBlock(),
      connectedPeers: this.p2pNetwork.getConnectedPeerCount(),
      pendingTransfers: stats.pendingTransfers,
    };
  }
}

// Main entry point
async function main() {
  console.log('===========================================');
  console.log('    WAVES-Unit0 Bridge Validator Node');
  console.log('===========================================');

  try {
    const config = loadConfig();
    const validator = new ValidatorNode(config);

    // Handle shutdown signals
    const shutdown = async () => {
      console.log('\nShutting down...');
      await validator.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Start the validator
    await validator.start();

    // Keep running
    console.log('\nValidator is running. Press Ctrl+C to stop.\n');
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Run if executed directly
main().catch(console.error);
