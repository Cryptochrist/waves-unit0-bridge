import { EventEmitter } from 'events';
import { createLibp2p, Libp2p } from 'libp2p';
import { tcp } from '@libp2p/tcp';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { gossipsub, GossipSub } from '@chainsafe/libp2p-gossipsub';
import { identify } from '@libp2p/identify';
import { bootstrap } from '@libp2p/bootstrap';
import { kadDHT } from '@libp2p/kad-dht';
import { multiaddr } from '@multiformats/multiaddr';
import { SignedAttestation, TransferEvent, ValidatorConfig } from '../types';
import { Logger } from 'winston';

// Message types for P2P communication
export enum P2PMessageType {
  ATTESTATION = 'attestation',
  TRANSFER_REQUEST = 'transfer_request',
  VALIDATOR_ANNOUNCE = 'validator_announce',
  HEARTBEAT = 'heartbeat',
}

export interface P2PMessage {
  type: P2PMessageType;
  payload: unknown;
  sender: string;
  timestamp: number;
  signature?: string;
}

/**
 * P2P network for validator communication using libp2p
 */
export class P2PNetwork extends EventEmitter {
  private config: ValidatorConfig;
  private logger: Logger;
  private node: Libp2p | null = null;
  private validatorAddress: string;
  private isRunning: boolean = false;

  // Topic names for gossipsub
  private readonly ATTESTATION_TOPIC = '/waves-unit0-bridge/attestations/1.0.0';
  private readonly TRANSFER_TOPIC = '/waves-unit0-bridge/transfers/1.0.0';
  private readonly VALIDATOR_TOPIC = '/waves-unit0-bridge/validators/1.0.0';

  // Connected peers
  private connectedPeers: Set<string> = new Set();
  private knownValidators: Map<string, { peerId: string; lastSeen: number }> = new Map();

  constructor(config: ValidatorConfig, validatorAddress: string, logger: Logger) {
    super();
    this.config = config;
    this.validatorAddress = validatorAddress;
    this.logger = logger;
  }

  /**
   * Start the P2P network
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('P2P network already running');
      return;
    }

    this.logger.info('Starting P2P network...');

    // Create libp2p node
    const bootstrapList = this.config.p2pBootstrapPeers.filter(p => p.length > 0);

    this.node = await createLibp2p({
      addresses: {
        listen: [`/ip4/0.0.0.0/tcp/${this.config.p2pPort}`],
      },
      transports: [tcp()],
      connectionEncrypters: [noise()],
      streamMuxers: [yamux()],
      services: {
        identify: identify(),
        pubsub: gossipsub({
          allowPublishToZeroTopicPeers: true,
          emitSelf: false,
        }),
        dht: kadDHT({
          clientMode: false,
        }),
      },
      ...(bootstrapList.length > 0 && {
        peerDiscovery: [
          bootstrap({
            list: bootstrapList,
          }),
        ],
      }),
    });

    // Set up event handlers
    this.setupEventHandlers();

    // Start the node
    await this.node.start();
    this.isRunning = true;

    // Subscribe to topics
    await this.subscribeToTopics();

    // Announce ourselves
    await this.announceValidator();

    this.logger.info(`P2P network started. PeerId: ${this.node.peerId.toString()}`);
    this.logger.info(`Listening on: ${this.node.getMultiaddrs().map(a => a.toString()).join(', ')}`);
  }

  /**
   * Stop the P2P network
   */
  async stop(): Promise<void> {
    if (!this.isRunning || !this.node) {
      return;
    }

    this.isRunning = false;
    await this.node.stop();
    this.node = null;
    this.connectedPeers.clear();
    this.logger.info('P2P network stopped');
  }

  /**
   * Set up libp2p event handlers
   */
  private setupEventHandlers(): void {
    if (!this.node) return;

    // Peer connection events
    this.node.addEventListener('peer:connect', (event) => {
      const peerId = event.detail.toString();
      this.connectedPeers.add(peerId);
      this.logger.info(`Peer connected: ${peerId}`);
      this.emit('peer:connect', peerId);
    });

    this.node.addEventListener('peer:disconnect', (event) => {
      const peerId = event.detail.toString();
      this.connectedPeers.delete(peerId);
      this.logger.info(`Peer disconnected: ${peerId}`);
      this.emit('peer:disconnect', peerId);
    });

    // Pubsub message handler
    const pubsub = this.node.services.pubsub as GossipSub;
    pubsub.addEventListener('message', (event) => {
      this.handlePubsubMessage(event.detail.topic, event.detail.data);
    });
  }

  /**
   * Subscribe to gossipsub topics
   */
  private async subscribeToTopics(): Promise<void> {
    if (!this.node) return;

    const pubsub = this.node.services.pubsub as GossipSub;

    pubsub.subscribe(this.ATTESTATION_TOPIC);
    pubsub.subscribe(this.TRANSFER_TOPIC);
    pubsub.subscribe(this.VALIDATOR_TOPIC);

    this.logger.info('Subscribed to P2P topics');
  }

  /**
   * Handle incoming pubsub message
   */
  private handlePubsubMessage(topic: string, data: Uint8Array): void {
    try {
      const message: P2PMessage = JSON.parse(new TextDecoder().decode(data));

      // Ignore our own messages
      if (message.sender === this.validatorAddress) {
        return;
      }

      this.logger.debug(`Received ${message.type} from ${message.sender}`);

      switch (message.type) {
        case P2PMessageType.ATTESTATION:
          this.handleAttestation(message.payload as SignedAttestation);
          break;
        case P2PMessageType.TRANSFER_REQUEST:
          this.handleTransferRequest(message.payload as TransferEvent);
          break;
        case P2PMessageType.VALIDATOR_ANNOUNCE:
          this.handleValidatorAnnounce(message);
          break;
        case P2PMessageType.HEARTBEAT:
          this.handleHeartbeat(message);
          break;
      }
    } catch (error) {
      this.logger.error('Error handling pubsub message:', error);
    }
  }

  /**
   * Handle received attestation
   */
  private handleAttestation(attestation: SignedAttestation): void {
    this.logger.debug(`Received attestation for ${attestation.transferId} from ${attestation.validatorAddress}`);
    this.emit('attestation', attestation);
  }

  /**
   * Handle transfer request (for new transfers detected by other validators)
   */
  private handleTransferRequest(transfer: TransferEvent): void {
    this.logger.debug(`Received transfer request: ${transfer.transferId}`);
    this.emit('transfer', transfer);
  }

  /**
   * Handle validator announcement
   */
  private handleValidatorAnnounce(message: P2PMessage): void {
    const { validatorAddress, peerId } = message.payload as { validatorAddress: string; peerId: string };
    this.knownValidators.set(validatorAddress, {
      peerId,
      lastSeen: Date.now(),
    });
    this.logger.debug(`Validator announced: ${validatorAddress}`);
    this.emit('validator:announce', { validatorAddress, peerId });
  }

  /**
   * Handle heartbeat from other validators
   */
  private handleHeartbeat(message: P2PMessage): void {
    const validatorAddress = message.sender;
    const existing = this.knownValidators.get(validatorAddress);
    if (existing) {
      existing.lastSeen = Date.now();
    }
  }

  /**
   * Broadcast an attestation to the network
   */
  async broadcastAttestation(attestation: SignedAttestation): Promise<void> {
    const message: P2PMessage = {
      type: P2PMessageType.ATTESTATION,
      payload: attestation,
      sender: this.validatorAddress,
      timestamp: Date.now(),
    };

    await this.publish(this.ATTESTATION_TOPIC, message);
    this.logger.debug(`Broadcast attestation for ${attestation.transferId}`);
  }

  /**
   * Broadcast a transfer event to the network
   */
  async broadcastTransfer(transfer: TransferEvent): Promise<void> {
    const message: P2PMessage = {
      type: P2PMessageType.TRANSFER_REQUEST,
      payload: transfer,
      sender: this.validatorAddress,
      timestamp: Date.now(),
    };

    await this.publish(this.TRANSFER_TOPIC, message);
    this.logger.debug(`Broadcast transfer ${transfer.transferId}`);
  }

  /**
   * Announce ourselves as a validator
   */
  async announceValidator(): Promise<void> {
    if (!this.node) return;

    const message: P2PMessage = {
      type: P2PMessageType.VALIDATOR_ANNOUNCE,
      payload: {
        validatorAddress: this.validatorAddress,
        peerId: this.node.peerId.toString(),
      },
      sender: this.validatorAddress,
      timestamp: Date.now(),
    };

    await this.publish(this.VALIDATOR_TOPIC, message);
    this.logger.info('Announced validator presence');
  }

  /**
   * Send heartbeat to keep connections alive
   */
  async sendHeartbeat(): Promise<void> {
    const message: P2PMessage = {
      type: P2PMessageType.HEARTBEAT,
      payload: { status: 'alive' },
      sender: this.validatorAddress,
      timestamp: Date.now(),
    };

    await this.publish(this.VALIDATOR_TOPIC, message);
  }

  /**
   * Publish message to a topic
   */
  private async publish(topic: string, message: P2PMessage): Promise<void> {
    if (!this.node || !this.isRunning) {
      this.logger.warn('Cannot publish: P2P network not running');
      return;
    }

    const pubsub = this.node.services.pubsub as GossipSub;
    const data = new TextEncoder().encode(JSON.stringify(message));
    await pubsub.publish(topic, data);
  }

  /**
   * Connect to a specific peer
   */
  async connectToPeer(multiaddress: string): Promise<boolean> {
    if (!this.node) return false;

    try {
      const ma = multiaddr(multiaddress);
      await this.node.dial(ma);
      this.logger.info(`Connected to peer: ${multiaddress}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to connect to peer ${multiaddress}:`, error);
      return false;
    }
  }

  /**
   * Get connected peer count
   */
  getConnectedPeerCount(): number {
    return this.connectedPeers.size;
  }

  /**
   * Get list of connected peers
   */
  getConnectedPeers(): string[] {
    return Array.from(this.connectedPeers);
  }

  /**
   * Get known validators
   */
  getKnownValidators(): Map<string, { peerId: string; lastSeen: number }> {
    return this.knownValidators;
  }

  /**
   * Get our peer ID
   */
  getPeerId(): string | null {
    return this.node?.peerId.toString() || null;
  }

  /**
   * Get multiaddresses
   */
  getMultiaddrs(): string[] {
    return this.node?.getMultiaddrs().map(a => a.toString()) || [];
  }

  /**
   * Check if network is running
   */
  isNetworkRunning(): boolean {
    return this.isRunning;
  }
}
