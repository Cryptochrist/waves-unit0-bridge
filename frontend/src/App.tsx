import { useEffect } from 'react';
import { WalletConnect } from './components/WalletConnect';
import { BridgeForm } from './components/BridgeForm';
import { TransferHistory } from './components/TransferHistory';
import { Stats } from './components/Stats';
import { RegisterToken } from './components/RegisterToken';
import { useEvmWallet } from './hooks/useEvmWallet';
import { useWavesWallet } from './hooks/useWavesWallet';
import { useBridge } from './hooks/useBridge';
import './App.css';

function App() {
  const evmWallet = useEvmWallet();
  const wavesWallet = useWavesWallet();

  const bridge = useBridge({
    evmSigner: evmWallet.signer,
    wavesInvokeScript: wavesWallet.invokeScript,
    evmAddress: evmWallet.address,
    wavesAddress: wavesWallet.address,
  });

  // Fetch pending transfers on mount
  useEffect(() => {
    bridge.fetchPendingTransfers();
    const interval = setInterval(() => {
      bridge.fetchPendingTransfers();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="logo">
          <h1>WAVES-Unit0 Bridge</h1>
          <span className="badge">Mainnet</span>
        </div>
        <WalletConnect
          // EVM
          evmConnected={evmWallet.connected}
          evmAddress={evmWallet.address}
          evmChainId={evmWallet.chainId}
          onEvmConnect={evmWallet.connect}
          onEvmDisconnect={evmWallet.disconnect}
          onSwitchToUnit0={evmWallet.switchToUnit0}
          isMetaMaskInstalled={evmWallet.isMetaMaskInstalled}
          isOnUnit0={evmWallet.isOnUnit0}
          evmError={evmWallet.error}
          // WAVES
          wavesConnected={wavesWallet.connected}
          wavesAddress={wavesWallet.address}
          onWavesConnect={wavesWallet.connect}
          onWavesDisconnect={wavesWallet.disconnect}
          isKeeperInstalled={wavesWallet.isKeeperInstalled}
          wavesError={wavesWallet.error}
        />
      </header>

      {/* Main Content */}
      <main className="main">
        {/* Stats */}
        <Stats getBridgeStats={bridge.getBridgeStats} />

        {/* Actions Bar */}
        <div className="actions-bar">
          <RegisterToken
            evmConnected={evmWallet.connected}
            wavesConnected={wavesWallet.connected}
            onRegisterUnit0={bridge.registerTokenOnUnit0}
            onRegisterWaves={bridge.registerTokenOnWaves}
            loading={bridge.loading}
            error={bridge.error}
          />
        </div>

        {/* Bridge Form */}
        <div className="bridge-container">
          <BridgeForm
            evmConnected={evmWallet.connected}
            wavesConnected={wavesWallet.connected}
            evmAddress={evmWallet.address}
            wavesAddress={wavesWallet.address}
            isOnUnit0={evmWallet.isOnUnit0}
            onLockUnit0={bridge.lockOnUnit0}
            onLockWaves={bridge.lockOnWaves}
            loading={bridge.loading}
            error={bridge.error}
            onClearError={bridge.clearError}
            getEvmTokenBalance={evmWallet.getTokenBalance}
            getWavesBalance={wavesWallet.getBalance}
          />

          {/* Transfer History */}
          <TransferHistory
            pendingTransfers={bridge.pendingTransfers}
            onRefresh={bridge.fetchPendingTransfers}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="footer">
        <p>WAVES-Unit0 Bridge - Decentralized Cross-Chain Bridge</p>
        <div className="footer-links">
          <a href="https://github.com" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
          <a href="https://docs.unit0.dev" target="_blank" rel="noopener noreferrer">
            Docs
          </a>
        </div>
      </footer>
    </div>
  );
}

export default App;
