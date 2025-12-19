export type ChainType = 'waves' | 'unit0';

export interface Token {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  balance?: string;
  wavesAssetId?: string;
}

export interface TransferRequest {
  sourceChain: ChainType;
  destinationChain: ChainType;
  token: Token;
  amount: string;
  recipient: string;
}

export interface Transfer {
  transferId: string;
  sourceChain: ChainType;
  destinationChain: ChainType;
  token: string;
  amount: string;
  sender: string;
  recipient: string;
  status: 'pending' | 'attesting' | 'completed' | 'failed';
  sourceTxHash: string;
  destinationTxHash?: string;
  timestamp: number;
}

export interface WalletState {
  connected: boolean;
  address: string | null;
  chainId: number | null;
}

export interface WavesWalletState {
  connected: boolean;
  address: string | null;
  publicKey: string | null;
}

export interface BridgeStats {
  totalTransfers: number;
  pendingTransfers: number;
  completedTransfers: number;
  failedTransfers: number;
}
