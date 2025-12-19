import { Wallet, Link2, Link2Off, AlertCircle } from 'lucide-react';

interface WalletConnectProps {
  // EVM wallet
  evmConnected: boolean;
  evmAddress: string | null;
  evmChainId: number | null;
  onEvmConnect: () => void;
  onEvmDisconnect: () => void;
  onSwitchToUnit0: () => void;
  isMetaMaskInstalled: boolean;
  isOnUnit0: boolean;

  // WAVES wallet
  wavesConnected: boolean;
  wavesAddress: string | null;
  onWavesConnect: () => void;
  onWavesDisconnect: () => void;
  isKeeperInstalled: boolean;

  // Errors
  evmError: string | null;
  wavesError: string | null;
}

export function WalletConnect({
  evmConnected,
  evmAddress,
  evmChainId: _evmChainId,
  onEvmConnect,
  onEvmDisconnect,
  onSwitchToUnit0,
  isMetaMaskInstalled,
  isOnUnit0,
  wavesConnected,
  wavesAddress,
  onWavesConnect,
  onWavesDisconnect,
  isKeeperInstalled,
  evmError,
  wavesError,
}: WalletConnectProps) {
  void _evmChainId; // Used for future display
  const truncateAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  return (
    <div className="wallet-connect">
      {/* Unit0 (EVM) Wallet */}
      <div className="wallet-card">
        <div className="wallet-header">
          <img src="/unit0-logo.svg" alt="Unit0" className="chain-logo" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          <span>Unit0 (EVM)</span>
        </div>

        {!isMetaMaskInstalled ? (
          <div className="wallet-install">
            <AlertCircle size={16} />
            <span>Install MetaMask</span>
            <a href="https://metamask.io" target="_blank" rel="noopener noreferrer">
              Download
            </a>
          </div>
        ) : evmConnected ? (
          <div className="wallet-connected">
            <div className="wallet-address">
              <Wallet size={16} />
              <span>{truncateAddress(evmAddress!)}</span>
            </div>
            {!isOnUnit0 && (
              <button className="btn-switch" onClick={onSwitchToUnit0}>
                Switch to Unit0
              </button>
            )}
            {isOnUnit0 && (
              <span className="chain-badge">Unit0</span>
            )}
            <button className="btn-disconnect" onClick={onEvmDisconnect}>
              <Link2Off size={14} />
            </button>
          </div>
        ) : (
          <button className="btn-connect" onClick={onEvmConnect}>
            <Link2 size={16} />
            Connect MetaMask
          </button>
        )}

        {evmError && <div className="wallet-error">{evmError}</div>}
      </div>

      {/* WAVES Wallet */}
      <div className="wallet-card">
        <div className="wallet-header">
          <img src="/waves-logo.svg" alt="WAVES" className="chain-logo" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          <span>WAVES</span>
        </div>

        {!isKeeperInstalled ? (
          <div className="wallet-install">
            <AlertCircle size={16} />
            <span>Install Keeper</span>
            <a href="https://keeper-wallet.app" target="_blank" rel="noopener noreferrer">
              Download
            </a>
          </div>
        ) : wavesConnected ? (
          <div className="wallet-connected">
            <div className="wallet-address">
              <Wallet size={16} />
              <span>{truncateAddress(wavesAddress!)}</span>
            </div>
            <span className="chain-badge">Mainnet</span>
            <button className="btn-disconnect" onClick={onWavesDisconnect}>
              <Link2Off size={14} />
            </button>
          </div>
        ) : (
          <button className="btn-connect" onClick={onWavesConnect}>
            <Link2 size={16} />
            Connect Keeper
          </button>
        )}

        {wavesError && <div className="wallet-error">{wavesError}</div>}
      </div>
    </div>
  );
}
