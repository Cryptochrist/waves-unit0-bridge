import { useState, useEffect } from 'react';
import { ArrowDownUp, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import type { ChainType, Token } from '../types';
import { config } from '../config';

interface BridgeFormProps {
  evmConnected: boolean;
  wavesConnected: boolean;
  evmAddress: string | null;
  wavesAddress: string | null;
  isOnUnit0: boolean;
  onLockUnit0: (token: Token, amount: string, recipient: string) => Promise<string | null>;
  onLockWaves: (assetId: string, amount: number, recipient: string) => Promise<string | null>;
  loading: boolean;
  error: string | null;
  onClearError: () => void;
  getEvmTokenBalance: (tokenAddress: string, decimals?: number) => Promise<string>;
  getWavesBalance: (assetId?: string) => Promise<number>;
}

// Registered bridgeable tokens
const BRIDGEABLE_TOKENS: Token[] = [
  {
    address: '0x4025A8Ee89DAead315de690f0C250caB5309a115',
    name: 'Wrapped WAVES',
    symbol: 'wWAVES',
    decimals: 8,
    wavesAssetId: 'WAVES',
  },
  {
    address: '0x929aC5dF3bD6Ad4f01E44929edC4Bfa293fA5fC1',
    name: 'Wrapped ROME',
    symbol: 'wROME',
    decimals: 6,
    wavesAssetId: 'AP4Cb5xLYGH6ZigHreCZHoXpQTWDkPsG2BHqfDUx6taJ',
  },
];

// Get display symbol based on source chain
const getDisplaySymbol = (token: Token, sourceChain: ChainType): string => {
  if (sourceChain === 'waves') {
    // On WAVES, show native symbol (without 'w' prefix)
    return token.symbol.startsWith('w') ? token.symbol.slice(1) : token.symbol;
  }
  // On Unit0, show wrapped symbol
  return token.symbol;
};

export function BridgeForm({
  evmConnected,
  wavesConnected,
  evmAddress,
  wavesAddress,
  isOnUnit0: _isOnUnit0,
  onLockUnit0,
  onLockWaves,
  loading,
  error,
  onClearError,
  getEvmTokenBalance,
  getWavesBalance,
}: BridgeFormProps) {
  void _isOnUnit0; // Used for future validation
  const [sourceChain, setSourceChain] = useState<ChainType>('waves');
  const [amount, setAmount] = useState('');
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [balance, setBalance] = useState<string>('0');
  const [balanceLoading, setBalanceLoading] = useState(false);

  const destinationChain: ChainType = sourceChain === 'waves' ? 'unit0' : 'waves';

  // Swap chains
  const handleSwapChains = () => {
    setSourceChain(destinationChain);
    setAmount('');
    setTxHash(null);
    onClearError();
  };

  // Get recipient address based on destination
  const getRecipient = () => {
    return destinationChain === 'waves' ? wavesAddress : evmAddress;
  };

  // Check if form is valid
  const isValid = () => {
    if (!amount || parseFloat(amount) <= 0) return false;
    if (sourceChain === 'unit0' && !evmConnected) return false;
    if (sourceChain === 'waves' && !wavesConnected) return false;
    if (!getRecipient()) return false;
    return true;
  };

  // Handle bridge
  const handleBridge = async () => {
    const recipient = getRecipient();
    if (!recipient || !selectedToken) return;

    setTxHash(null);
    onClearError();

    let hash: string | null = null;

    if (sourceChain === 'unit0') {
      hash = await onLockUnit0(selectedToken, amount, recipient);
    } else {
      const amountInSmallestUnit = Math.floor(parseFloat(amount) * Math.pow(10, selectedToken.decimals));
      hash = await onLockWaves(selectedToken.wavesAssetId || '', amountInSmallestUnit, recipient);
    }

    if (hash) {
      setTxHash(hash);
      setAmount('');
    }
  };

  // Set default token
  useEffect(() => {
    if (BRIDGEABLE_TOKENS.length > 0 && !selectedToken) {
      setSelectedToken(BRIDGEABLE_TOKENS[0]);
    }
  }, [selectedToken]);

  // Fetch balance when token or chain changes
  useEffect(() => {
    const fetchBalance = async () => {
      if (!selectedToken) {
        setBalance('0');
        return;
      }

      setBalanceLoading(true);
      try {
        if (sourceChain === 'unit0') {
          if (evmConnected && evmAddress) {
            const bal = await getEvmTokenBalance(selectedToken.address, selectedToken.decimals);
            setBalance(bal);
          } else {
            setBalance('0');
          }
        } else {
          if (wavesConnected && wavesAddress) {
            const bal = await getWavesBalance(selectedToken.wavesAssetId);
            // Convert from smallest unit to display units
            const displayBal = bal / Math.pow(10, selectedToken.decimals);
            setBalance(displayBal.toString());
          } else {
            setBalance('0');
          }
        }
      } catch (err) {
        console.error('Failed to fetch balance:', err);
        setBalance('0');
      } finally {
        setBalanceLoading(false);
      }
    };

    fetchBalance();
  }, [selectedToken, sourceChain, evmConnected, wavesConnected, evmAddress, wavesAddress, getEvmTokenBalance, getWavesBalance]);

  // Handle MAX button click
  const handleMaxClick = () => {
    if (parseFloat(balance) > 0) {
      setAmount(balance);
    }
  };

  return (
    <div className="bridge-form">
      <h2>Bridge Tokens</h2>

      {/* Source Chain */}
      <div className="chain-section">
        <label>From</label>
        <div className="chain-box">
          <div className="chain-info">
            <span className="chain-name">{sourceChain === 'waves' ? 'WAVES' : 'Unit0'}</span>
            {sourceChain === 'waves' ? (
              wavesConnected ? (
                <span className="chain-address">{wavesAddress?.slice(0, 8)}...</span>
              ) : (
                <span className="chain-warning">Not connected</span>
              )
            ) : evmConnected ? (
              <span className="chain-address">{evmAddress?.slice(0, 8)}...</span>
            ) : (
              <span className="chain-warning">Not connected</span>
            )}
          </div>
        </div>

        {/* Token and Amount */}
        <div className="input-group">
          <div className="token-select">
            <select
              value={selectedToken?.symbol || ''}
              onChange={(e) => {
                const token = BRIDGEABLE_TOKENS.find((t) => t.symbol === e.target.value);
                setSelectedToken(token || null);
              }}
            >
              {BRIDGEABLE_TOKENS.map((token) => (
                <option key={token.symbol} value={token.symbol}>
                  {getDisplaySymbol(token, sourceChain)}
                </option>
              ))}
            </select>
          </div>
          <input
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="0"
            step="0.01"
          />
        </div>

        {/* Balance Display with MAX button */}
        <div className="balance-row">
          <div className="balance-display">
            <span>Balance: </span>
            {balanceLoading ? (
              <Loader2 size={14} className="spin" />
            ) : (
              <span className="balance-amount">
                {parseFloat(balance).toFixed(selectedToken?.decimals === 8 ? 8 : 6)}{' '}
                {selectedToken ? getDisplaySymbol(selectedToken, sourceChain) : ''}
              </span>
            )}
          </div>
          <button
            type="button"
            className="btn-max"
            onClick={handleMaxClick}
            disabled={balanceLoading || parseFloat(balance) <= 0}
          >
            MAX
          </button>
        </div>
      </div>

      {/* Swap Button */}
      <div className="swap-button-container">
        <button className="btn-swap" onClick={handleSwapChains}>
          <ArrowDownUp size={20} />
        </button>
      </div>

      {/* Destination Chain */}
      <div className="chain-section">
        <label>To</label>
        <div className="chain-box">
          <div className="chain-info">
            <span className="chain-name">{destinationChain === 'waves' ? 'WAVES' : 'Unit0'}</span>
            {destinationChain === 'waves' ? (
              wavesConnected ? (
                <span className="chain-address">{wavesAddress?.slice(0, 8)}...</span>
              ) : (
                <span className="chain-warning">Connect wallet to receive</span>
              )
            ) : evmConnected ? (
              <span className="chain-address">{evmAddress?.slice(0, 8)}...</span>
            ) : (
              <span className="chain-warning">Connect wallet to receive</span>
            )}
          </div>
        </div>

        {/* Receive Amount */}
        <div className="receive-amount">
          <span>You will receive</span>
          <span className="amount">
            {amount && selectedToken
              ? `~${amount} ${getDisplaySymbol(selectedToken, destinationChain)}`
              : '-'}
          </span>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="error-message">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Success Message */}
      {txHash && (
        <div className="success-message">
          <span>Transaction submitted!</span>
          <a
            href={
              sourceChain === 'waves'
                ? `${config.waves.explorer}/tx/${txHash}`
                : `${config.unit0.explorer}/tx/${txHash}`
            }
            target="_blank"
            rel="noopener noreferrer"
          >
            View on Explorer
          </a>
        </div>
      )}

      {/* Bridge Button */}
      <button
        className="btn-bridge"
        onClick={handleBridge}
        disabled={!isValid() || loading}
      >
        {loading ? (
          <>
            <Loader2 size={20} className="spin" />
            Processing...
          </>
        ) : (
          <>
            Bridge
            <ArrowRight size={20} />
          </>
        )}
      </button>

      {/* Info */}
      <div className="bridge-info">
        <p>Transfers typically complete in 2-5 minutes</p>
        <p>Validators: 1 required</p>
      </div>
    </div>
  );
}
