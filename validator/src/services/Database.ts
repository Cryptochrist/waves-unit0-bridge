import { Level } from 'level';
import { TransferEvent, SignedAttestation, TransferStatus } from '../types/index.js';
import { Logger } from 'winston';
import path from 'path';

/**
 * Custom JSON serializer that handles BigInt
 */
function serialize(obj: unknown): string {
  return JSON.stringify(obj, (key, value) =>
    typeof value === 'bigint' ? { __bigint__: value.toString() } : value
  );
}

/**
 * Custom JSON deserializer that handles BigInt
 */
function deserialize<T>(json: string): T {
  return JSON.parse(json, (key, value) =>
    value && typeof value === 'object' && '__bigint__' in value
      ? BigInt(value.__bigint__)
      : value
  ) as T;
}

/**
 * Database keys structure:
 * - transfer:{transferId} -> TransferRecord
 * - attestation:{transferId}:{validatorAddress} -> SignedAttestation
 * - block:waves:last -> number
 * - block:unit0:last -> number
 * - validator:{address} -> ValidatorRecord
 */

export interface TransferRecord {
  transfer: TransferEvent;
  attestations: SignedAttestation[];
  status: TransferStatus;
  relayTxHash?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ValidatorRecord {
  address: string;
  isActive: boolean;
  totalAttestations: number;
  lastSeen: number;
}

/**
 * LevelDB-based persistence for validator node
 */
export class Database {
  private db: Level<string, string>;
  private logger: Logger;
  private isOpen: boolean = false;

  constructor(dbPath: string, logger: Logger) {
    this.db = new Level(dbPath, { valueEncoding: 'json' });
    this.logger = logger;
  }

  /**
   * Open the database
   */
  async open(): Promise<void> {
    if (this.isOpen) return;

    await this.db.open();
    this.isOpen = true;
    this.logger.info('Database opened');
  }

  /**
   * Close the database
   */
  async close(): Promise<void> {
    if (!this.isOpen) return;

    await this.db.close();
    this.isOpen = false;
    this.logger.info('Database closed');
  }

  // ==================== Transfer Operations ====================

  /**
   * Save a new transfer
   */
  async saveTransfer(transfer: TransferEvent): Promise<void> {
    const key = `transfer:${transfer.transferId}`;

    // Check if exists
    const existing = await this.getTransfer(transfer.transferId);
    if (existing) {
      this.logger.debug(`Transfer ${transfer.transferId} already exists`);
      return;
    }

    const record: TransferRecord = {
      transfer,
      attestations: [],
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await this.db.put(key, serialize(record));
    this.logger.debug(`Saved transfer ${transfer.transferId}`);
  }

  /**
   * Get a transfer by ID
   */
  async getTransfer(transferId: string): Promise<TransferRecord | null> {
    try {
      const key = `transfer:${transferId}`;
      const data = await this.db.get(key);
      return deserialize<TransferRecord>(data);
    } catch (error: any) {
      if (error.code === 'LEVEL_NOT_FOUND') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Update transfer status
   */
  async updateTransferStatus(
    transferId: string,
    status: TransferStatus,
    relayTxHash?: string
  ): Promise<void> {
    const record = await this.getTransfer(transferId);
    if (!record) {
      throw new Error(`Transfer ${transferId} not found`);
    }

    record.status = status;
    record.updatedAt = Date.now();
    if (relayTxHash) {
      record.relayTxHash = relayTxHash;
    }

    await this.db.put(`transfer:${transferId}`, serialize(record));
    this.logger.debug(`Updated transfer ${transferId} status to ${status}`);
  }

  /**
   * Get all pending transfers
   */
  async getPendingTransfers(): Promise<TransferRecord[]> {
    const transfers: TransferRecord[] = [];

    for await (const [key, value] of this.db.iterator({
      gte: 'transfer:',
      lte: 'transfer:\xFF',
    })) {
      const record = deserialize<TransferRecord>(value);
      if (record.status === 'pending' || record.status === 'attesting') {
        transfers.push(record);
      }
    }

    return transfers;
  }

  /**
   * Get transfers by status
   */
  async getTransfersByStatus(status: TransferStatus): Promise<TransferRecord[]> {
    const transfers: TransferRecord[] = [];

    for await (const [key, value] of this.db.iterator({
      gte: 'transfer:',
      lte: 'transfer:\xFF',
    })) {
      const record = deserialize<TransferRecord>(value);
      if (record.status === status) {
        transfers.push(record);
      }
    }

    return transfers;
  }

  // ==================== Attestation Operations ====================

  /**
   * Save an attestation
   */
  async saveAttestation(attestation: SignedAttestation): Promise<void> {
    const key = `attestation:${attestation.transferId}:${attestation.validatorAddress}`;

    await this.db.put(key, serialize(attestation));

    // Also add to transfer record
    const record = await this.getTransfer(attestation.transferId);
    if (record) {
      const existingIndex = record.attestations.findIndex(
        a => a.validatorAddress === attestation.validatorAddress
      );
      if (existingIndex >= 0) {
        record.attestations[existingIndex] = attestation;
      } else {
        record.attestations.push(attestation);
      }
      record.updatedAt = Date.now();
      await this.db.put(`transfer:${attestation.transferId}`, serialize(record));
    }

    this.logger.debug(
      `Saved attestation from ${attestation.validatorAddress} for ${attestation.transferId}`
    );
  }

  /**
   * Get attestations for a transfer
   */
  async getAttestations(transferId: string): Promise<SignedAttestation[]> {
    const attestations: SignedAttestation[] = [];

    for await (const [key, value] of this.db.iterator({
      gte: `attestation:${transferId}:`,
      lte: `attestation:${transferId}:\xFF`,
    })) {
      attestations.push(deserialize<SignedAttestation>(value));
    }

    return attestations;
  }

  /**
   * Check if validator has attested to a transfer
   */
  async hasAttestation(transferId: string, validatorAddress: string): Promise<boolean> {
    try {
      const key = `attestation:${transferId}:${validatorAddress}`;
      await this.db.get(key);
      return true;
    } catch (error: any) {
      if (error.code === 'LEVEL_NOT_FOUND') {
        return false;
      }
      throw error;
    }
  }

  // ==================== Block Height Operations ====================

  /**
   * Save last processed WAVES block
   */
  async saveWavesBlockHeight(height: number): Promise<void> {
    await this.db.put('block:waves:last', String(height));
  }

  /**
   * Get last processed WAVES block
   */
  async getWavesBlockHeight(): Promise<number | null> {
    try {
      const value = await this.db.get('block:waves:last');
      return parseInt(value, 10);
    } catch (error: any) {
      if (error.code === 'LEVEL_NOT_FOUND') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Save last processed Unit0 block
   */
  async saveUnit0BlockHeight(height: number): Promise<void> {
    await this.db.put('block:unit0:last', String(height));
  }

  /**
   * Get last processed Unit0 block
   */
  async getUnit0BlockHeight(): Promise<number | null> {
    try {
      const value = await this.db.get('block:unit0:last');
      return parseInt(value, 10);
    } catch (error: any) {
      if (error.code === 'LEVEL_NOT_FOUND') {
        return null;
      }
      throw error;
    }
  }

  // ==================== Validator Operations ====================

  /**
   * Save validator record
   */
  async saveValidator(validator: ValidatorRecord): Promise<void> {
    const key = `validator:${validator.address}`;
    await this.db.put(key, serialize(validator));
  }

  /**
   * Get validator record
   */
  async getValidator(address: string): Promise<ValidatorRecord | null> {
    try {
      const key = `validator:${address}`;
      const data = await this.db.get(key);
      return deserialize<ValidatorRecord>(data);
    } catch (error: any) {
      if (error.code === 'LEVEL_NOT_FOUND') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Get all validators
   */
  async getAllValidators(): Promise<ValidatorRecord[]> {
    const validators: ValidatorRecord[] = [];

    for await (const [key, value] of this.db.iterator({
      gte: 'validator:',
      lte: 'validator:\xFF',
    })) {
      validators.push(deserialize<ValidatorRecord>(value));
    }

    return validators;
  }

  // ==================== Statistics ====================

  /**
   * Get transfer statistics
   */
  async getStats(): Promise<{
    totalTransfers: number;
    pendingTransfers: number;
    completedTransfers: number;
    failedTransfers: number;
  }> {
    let total = 0;
    let pending = 0;
    let completed = 0;
    let failed = 0;

    for await (const [key, value] of this.db.iterator({
      gte: 'transfer:',
      lte: 'transfer:\xFF',
    })) {
      total++;
      const record = deserialize<TransferRecord>(value);
      switch (record.status) {
        case 'pending':
        case 'attesting':
          pending++;
          break;
        case 'completed':
          completed++;
          break;
        case 'failed':
          failed++;
          break;
      }
    }

    return { totalTransfers: total, pendingTransfers: pending, completedTransfers: completed, failedTransfers: failed };
  }
}
