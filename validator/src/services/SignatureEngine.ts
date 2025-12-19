import { ethers, Wallet, Signer, SigningKey } from 'ethers';
import { TransferEvent, SignedAttestation, ChainType, TokenType } from '../types/index.js';
import { Logger } from 'winston';
import * as crypto from 'crypto';
import { publicKey as wavesPublicKey, signBytes } from '@waves/ts-lib-crypto';

/**
 * Signature engine for signing cross-chain transfer attestations
 *
 * This engine creates cryptographic signatures that prove a validator
 * has witnessed and approved a cross-chain transfer.
 */
export class SignatureEngine {
  private wallet: Wallet;
  private logger: Logger;
  private chainId: bigint;
  private wavesSeed?: string;
  private wavesPublicKeyStr?: string;

  constructor(privateKey: string, logger: Logger, chainId: number = 88811, wavesSeed?: string) {
    this.wallet = new ethers.Wallet(privateKey);
    this.logger = logger;
    this.chainId = BigInt(chainId);

    // Store WAVES seed for WAVES-bound signing
    if (wavesSeed) {
      this.wavesSeed = wavesSeed;
      this.wavesPublicKeyStr = wavesPublicKey(wavesSeed);
      this.logger.info(`WAVES signing enabled with public key: ${this.wavesPublicKeyStr}`);
    }

    this.logger.info(`Signature engine initialized for validator: ${this.wallet.address}`);
  }

  /**
   * Sign a transfer attestation for Unit0 (EVM signature)
   * @param transfer The transfer event
   * @param unit0TokenAddress The Unit0 token address (resolved from WAVES asset ID)
   */
  async signTransferForUnit0(transfer: TransferEvent, unit0TokenAddress?: string): Promise<SignedAttestation> {
    // Use provided token address or fall back to transfer.token
    // (transfer.token might be a WAVES asset ID that needs to be resolved first)
    const tokenAddress = unit0TokenAddress || transfer.token;

    // Create the message hash that matches the smart contract's expected format
    const messageHash = this.createUnit0MessageHash(transfer, tokenAddress);

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
   * Sign a transfer attestation for WAVES
   * Uses WAVES native ed25519 signing (via waves-transactions library)
   * This matches what WAVES sigVerify expects
   */
  async signTransferForWaves(transfer: TransferEvent, wavesAssetId: string): Promise<SignedAttestation> {
    if (!this.wavesSeed || !this.wavesPublicKeyStr) {
      throw new Error('WAVES seed not configured - cannot sign for WAVES');
    }

    // Create the message that matches WAVES contract expected format exactly
    // WAVES contract: let messageData = transferId + recipient + assetId + amount.toString() + UNIT0_CHAIN_ID.toString()
    // WAVES contract: let messageHash = sha256(messageData.toBytes())
    const UNIT0_CHAIN_ID = 88811;
    const messageData = transfer.transferId + transfer.recipient + wavesAssetId + transfer.amount.toString() + UNIT0_CHAIN_ID.toString();

    // Convert string to bytes
    const messageBytes = new TextEncoder().encode(messageData);

    // IMPORTANT: WAVES contract uses sha256(messageData.toBytes()) before sigVerify
    // So we must sign the SHA256 hash, not the raw message
    const messageHash = crypto.createHash('sha256').update(messageBytes).digest();

    // Sign the hash using WAVES native signing (ed25519 curve25519)
    // signBytes from @waves/ts-lib-crypto returns base58 string by default
    const signatureBase58 = signBytes(this.wavesSeed, messageHash);

    // Keep signature as base58 - the Relayer will convert to base64 for WAVES tx
    const signature = signatureBase58;

    const attestation: SignedAttestation = {
      transferId: transfer.transferId,
      signature: signature,
      validatorAddress: this.wallet.address,
      publicKey: this.wavesPublicKeyStr, // WAVES public key (base58)
      messageHash: '0x' + messageHash.toString('hex'), // For reference
      timestamp: Date.now(),
      sourceChain: transfer.sourceChain,
      destinationChain: transfer.destinationChain,
    };

    this.logger.debug(`Signed attestation for WAVES: ${transfer.transferId} with public key ${this.wavesPublicKeyStr}`);

    return attestation;
  }

  /**
   * Create message hash for Unit0 verification
   * This must match the format expected by the smart contract
   * @param transfer The transfer event
   * @param tokenAddress The Unit0 token address (EVM address)
   */
  private createUnit0MessageHash(transfer: TransferEvent, tokenAddress: string): string {
    // Convert WAVES transaction ID (base58 string) to bytes32
    // We hash the string to get a deterministic bytes32 value
    const transferIdBytes32 = ethers.keccak256(ethers.toUtf8Bytes(transfer.transferId));

    // Encode using solidityPacked to match abi.encodePacked in the contract
    // Contract uses: keccak256(abi.encodePacked(wavesTransferId, token, amount, recipient, tokenType, tokenId, block.chainid))
    const encoded = ethers.solidityPacked(
      ['bytes32', 'address', 'uint256', 'address', 'uint8', 'uint256', 'uint256'],
      [
        transferIdBytes32,
        tokenAddress,
        transfer.amount,
        transfer.recipient,
        this.tokenTypeToNumber(transfer.tokenType),
        transfer.tokenId || 0,
        this.chainId,
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
   * Get the uncompressed public key (65 bytes: 0x04 + x + y)
   */
  getPublicKeyUncompressed(): string {
    const signingKey = this.wallet.signingKey;
    return signingKey.publicKey; // Returns 0x04... (65 bytes)
  }

  /**
   * Get the compressed public key (33 bytes: 0x02/0x03 + x)
   */
  getPublicKeyCompressed(): string {
    const signingKey = this.wallet.signingKey;
    return signingKey.compressedPublicKey; // Returns 0x02/0x03... (33 bytes)
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
