/**
 * Core types for the validator node
 */

export enum ChainType {
  WAVES = 'WAVES',
  UNIT0 = 'UNIT0',
}

export enum TokenType {
  ERC20 = 0,
  ERC721 = 1,
  ERC1155 = 2,
  NATIVE = 3,
}

// Transfer status as string union for database compatibility
export type TransferStatus =
  | 'pending'
  | 'attesting'
  | 'relaying'
  | 'completed'
  | 'failed';

export interface TransferEvent {
  transferId: string;
  sourceChain: ChainType;
  destinationChain: ChainType;
  token: string;
  amount: bigint;
  sender: string;
  recipient: string;
  tokenType: TokenType;
  tokenId?: bigint;
  sourceBlockNumber: number;
  sourceBlockHash: string;
  sourceTxHash: string;
  timestamp: number;
  status: TransferStatus | string;
}

export interface SignedAttestation {
  transferId: string;
  signature: string;
  validatorAddress: string;
  publicKey?: string; // Full public key (compressed or uncompressed) for WAVES verification
  messageHash: string;
  timestamp: number;
  sourceChain: ChainType;
  destinationChain: ChainType;
}

export interface AttestationMessage {
  transferId: string;
  token: string;
  amount: string;
  recipient: string;
  tokenType: TokenType;
  tokenId: number;
  destinationChainId: number;
}

export interface ValidatorConfig {
  // Network configuration
  wavesNodeUrl: string;
  wavesChainId: string;
  unit0RpcUrl: string;
  unit0ChainId: number;

  // Contract addresses
  wavesBridgeAddress: string;
  unit0BridgeAddress: string;

  // Validator credentials
  validatorPrivateKey: string;
  validatorAddress: string;
  wavesSeed?: string; // WAVES seed phrase for relaying to WAVES

  // P2P configuration
  p2pPort: number;
  p2pBootstrapPeers: string[];

  // Confirmation requirements
  wavesConfirmations: number;
  unit0Confirmations: number;

  // Database path
  dbPath: string;

  // API configuration
  apiPort: number;
  apiEnabled: boolean;

  // Logging
  logLevel: string;
}

export interface BridgeEvent {
  type: 'LOCK' | 'RELEASE';
  chain: ChainType;
  data: TransferEvent;
}

export interface PeerMessage {
  type: 'ATTESTATION' | 'ATTESTATION_REQUEST' | 'STATUS';
  payload: SignedAttestation | AttestationRequest | StatusMessage;
  sender: string;
  timestamp: number;
}

export interface AttestationRequest {
  transferId: string;
}

export interface StatusMessage {
  validatorAddress: string;
  pendingTransfers: number;
  lastProcessedBlock: {
    waves: number;
    unit0: number;
  };
}

export interface TokenMapping {
  wavesAssetId: string;
  unit0Address: string;
  name: string;
  symbol: string;
  wavesDecimals: number;
  unit0Decimals: number;
  isNative: boolean;
  isWrapped: boolean;
}
