import { ethers, Wallet, Signer } from 'ethers';
import { TransferEvent, SignedAttestation, ChainType, TokenType } from '../types';
import { Logger } from 'winston';
import * as crypto from 'crypto';

/**
 * Signature engine for signing cross-chain transfer attestations
 *
 * This engine creates cryptographic signatures that prove a validator
 * has witnessed and approved a cross-chain transfer.
 */
export class SignatureEngine {
  private wallet: Wallet;
  private logger: Logger;

  constructor(privateKey: string, logger: Logger) {
    this.wallet = new ethers.Wallet(privateKey);
    this.logger = logger;

    this.logger.info(`Signature engine initialized for validator: ${this.wallet.address}`);
  }

  /**
   * Sign a transfer attestation for Unit0 (EVM signature)
   */
  async signTransferForUnit0(transfer: TransferEvent): Promise<SignedAttestation> {
    // Create the message hash that matches the smart contract's expected format
    const messageHash = this.createUnit0MessageHash(transfer);

    // Sign with EIP-191 prefix
    const signature = await this.wallet.signMessage(ethers.getBytes(messageHash));

    const attestation: SignedAttestation = {
      transferId: transfer.transferId,
      signature,
      validatorAddress: this.wallet.address,
      messageHash,
      timestamp: Date.now(),
      sourceChain: transfer.sourceChain,
      destinationChain: transfer.destinationChain,
    };

    this.logger.debug(`Signed attestation for Unit0: ${transfer.transferId}`);

    return attestation;
  }

  /**
   * Sign a transfer attestation for WAVES (Ed25519 compatible)
   */
  async signTransferForWaves(transfer: TransferEvent): Promise<SignedAttestation> {
    // Create the message that matches WAVES contract expected format
    const message = this.createWavesMessage(transfer);
    const messageHash = ethers.keccak256(message);

    // Sign with ECDSA (will need to be verified differently on WAVES)
    const signature = await this.wallet.signMessage(ethers.getBytes(messageHash));

    const attestation: SignedAttestation = {
      transferId: transfer.transferId,
      signature,
      validatorAddress: this.wallet.address,
      messageHash,
      timestamp: Date.now(),
      sourceChain: transfer.sourceChain,
      destinationChain: transfer.destinationChain,
    };

    this.logger.debug(`Signed attestation for WAVES: ${transfer.transferId}`);

    return attestation;
  }

  /**
   * Create message hash for Unit0 verification
   * This must match the format expected by the smart contract
   */
  private createUnit0MessageHash(transfer: TransferEvent): string {
    // Encode the transfer data in the same format as the smart contract
    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'address', 'uint256', 'address', 'uint8', 'uint256'],
      [
        transfer.transferId,
        transfer.token,
        transfer.amount,
        transfer.recipient,
        this.tokenTypeToNumber(transfer.tokenType),
        transfer.tokenId || 0,
      ]
    );

    return ethers.keccak256(encoded);
  }

  /**
   * Create message for WAVES verification
   */
  private createWavesMessage(transfer: TransferEvent): string {
    // Format: transferId + token + amount + recipient
    // Encoded as bytes for WAVES verification
    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
      ['string', 'string', 'uint256', 'string'],
      [
        transfer.transferId,
        transfer.token,
        transfer.amount,
        transfer.recipient,
      ]
    );

    return encoded;
  }

  /**
   * Convert token type enum to number
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
   * Verify a signature from another validator
   */
  verifySignature(
    attestation: SignedAttestation,
    expectedValidator: string
  ): boolean {
    try {
      const recoveredAddress = ethers.verifyMessage(
        ethers.getBytes(attestation.messageHash),
        attestation.signature
      );

      const isValid = recoveredAddress.toLowerCase() === expectedValidator.toLowerCase();

      if (!isValid) {
        this.logger.warn(
          `Invalid signature: expected ${expectedValidator}, got ${recoveredAddress}`
        );
      }

      return isValid;
    } catch (error) {
      this.logger.error('Error verifying signature:', error);
      return false;
    }
  }

  /**
   * Verify multiple signatures and return valid count
   */
  verifySignatures(
    attestations: SignedAttestation[],
    validatorAddresses: string[]
  ): { valid: number; signatures: string[] } {
    const validatorSet = new Set(validatorAddresses.map(a => a.toLowerCase()));
    const validSignatures: string[] = [];
    let validCount = 0;

    for (const attestation of attestations) {
      if (validatorSet.has(attestation.validatorAddress.toLowerCase())) {
        if (this.verifySignature(attestation, attestation.validatorAddress)) {
          validCount++;
          validSignatures.push(attestation.signature);
        }
      }
    }

    return { valid: validCount, signatures: validSignatures };
  }

  /**
   * Create a deterministic transfer ID from transfer details
   */
  static createTransferId(
    sourceChain: ChainType,
    sourceTxHash: string,
    logIndex: number
  ): string {
    const data = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint8', 'string', 'uint256'],
      [sourceChain, sourceTxHash, logIndex]
    );
    return ethers.keccak256(data);
  }

  /**
   * Get validator address
   */
  getValidatorAddress(): string {
    return this.wallet.address;
  }

  /**
   * Get wallet instance (for transaction signing)
   */
  getWallet(): Wallet {
    return this.wallet;
  }

  /**
   * Sign arbitrary message
   */
  async signMessage(message: string): Promise<string> {
    return this.wallet.signMessage(message);
  }

  /**
   * Sign typed data (EIP-712)
   */
  async signTypedData(
    domain: ethers.TypedDataDomain,
    types: Record<string, ethers.TypedDataField[]>,
    value: Record<string, unknown>
  ): Promise<string> {
    return this.wallet.signTypedData(domain, types, value);
  }
}

/**
 * Helper class for batch signature operations
 */
export class SignatureBatcher {
  private engine: SignatureEngine;
  private pendingSignatures: Map<string, SignedAttestation[]> = new Map();
  private logger: Logger;

  constructor(engine: SignatureEngine, logger: Logger) {
    this.engine = engine;
    this.logger = logger;
  }

  /**
   * Add a signature to the batch for a transfer
   */
  addSignature(transferId: string, attestation: SignedAttestation): void {
    if (!this.pendingSignatures.has(transferId)) {
      this.pendingSignatures.set(transferId, []);
    }
    this.pendingSignatures.get(transferId)!.push(attestation);
  }

  /**
   * Get all signatures for a transfer
   */
  getSignatures(transferId: string): SignedAttestation[] {
    return this.pendingSignatures.get(transferId) || [];
  }

  /**
   * Check if we have enough signatures
   */
  hasEnoughSignatures(transferId: string, threshold: number): boolean {
    const signatures = this.pendingSignatures.get(transferId) || [];
    return signatures.length >= threshold;
  }

  /**
   * Clear signatures for a completed transfer
   */
  clearSignatures(transferId: string): void {
    this.pendingSignatures.delete(transferId);
  }

  /**
   * Get all pending transfers
   */
  getPendingTransfers(): string[] {
    return Array.from(this.pendingSignatures.keys());
  }
}
