import { useState } from 'react';
import { config } from '../config';

interface RegisterTokenProps {
  evmConnected: boolean;
  wavesConnected: boolean;
  onRegisterUnit0: (
    wavesAssetId: string,
    name: string,
    symbol: string,
    wavesDecimals: number,
    unit0Decimals: number
  ) => Promise<{ unit0Token: string } | null>;
  onRegisterWaves: (
    wavesAssetId: string,
    unit0Address: string,
    decimals: number,
    name: string,
    symbol: string
  ) => Promise<string | null>;
  loading: boolean;
  error: string | null;
}

interface AssetInfo {
  name: string;
  decimals: number;
  description?: string;
  quantity?: string;
  issuer?: string;
  reissuable?: boolean;
  scripted?: boolean;
  issueTimestamp?: number;
}

export function RegisterToken({
  evmConnected,
  wavesConnected,
  onRegisterUnit0,
  onRegisterWaves,
  loading,
  error,
}: RegisterTokenProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<'input' | 'confirm' | 'success'>('input');
  const [assetId, setAssetId] = useState('');
  const [assetInfo, setAssetInfo] = useState<AssetInfo | null>(null);
  const [customName, setCustomName] = useState('');
  const [customSymbol, setCustomSymbol] = useState('');
  const [unit0Decimals, setUnit0Decimals] = useState(8);
  const [fetchingInfo, setFetchingInfo] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [registeredToken, setRegisteredToken] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const fetchAssetInfo = async () => {
    if (!assetId.trim()) {
      setFetchError('Please enter an asset ID');
      return;
    }

    setFetchingInfo(true);
    setFetchError(null);
    setAssetInfo(null);

    try {
      if (assetId.toUpperCase() === 'WAVES') {
        setAssetInfo({
          name: 'WAVES',
          decimals: 8,
          description: 'Native WAVES token',
        });
        setCustomName('WAVES');
        setCustomSymbol('WAVES');
        setUnit0Decimals(8);
      } else {
        const response = await fetch(
          `${config.waves.nodeUrl}/assets/details/${assetId}`
        );
        if (!response.ok) {
          throw new Error('Asset not found');
        }
        const data = await response.json();
        setAssetInfo({
          name: data.name,
          decimals: data.decimals,
          description: data.description,
          quantity: data.quantity,
          issuer: data.issuer,
          reissuable: data.reissuable,
          scripted: data.scripted,
          issueTimestamp: data.issueTimestamp,
        });
        setCustomName(data.name);
        const defaultSymbol = data.name
          .replace(/[^a-zA-Z0-9]/g, '')
          .slice(0, 6)
          .toUpperCase();
        setCustomSymbol(defaultSymbol);
        setUnit0Decimals(data.decimals);
      }
      setStep('confirm');
    } catch (err) {
      setFetchError(
        err instanceof Error ? err.message : 'Failed to fetch asset info'
      );
    } finally {
      setFetchingInfo(false);
    }
  };

  const handleRegister = async () => {
    if (!assetInfo) return;

    // Step 1: Register on Unit0
    const unit0Result = await onRegisterUnit0(
      assetId,
      `Wrapped ${customName}`,
      `w${customSymbol}`,
      assetInfo.decimals,
      unit0Decimals
    );

    if (!unit0Result) return;

    setRegisteredToken(unit0Result.unit0Token);

    // Step 2: Register on WAVES
    const wavesTxId = await onRegisterWaves(
      assetId,
      unit0Result.unit0Token,
      assetInfo.decimals,
      customName,
      customSymbol
    );

    if (wavesTxId) {
      setTxHash(wavesTxId);
      setStep('success');
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setStep('input');
    setAssetId('');
    setAssetInfo(null);
    setCustomName('');
    setCustomSymbol('');
    setFetchError(null);
    setRegisteredToken(null);
    setTxHash(null);
  };

  const canRegister = evmConnected && wavesConnected;

  return (
    <>
      <button className="btn-add-token" onClick={() => setIsOpen(true)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Add Token
      </button>

      {isOpen && (
        <div className="modal-overlay" onClick={handleClose}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Register Token for Bridging</h3>
              <button className="btn-close" onClick={handleClose}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="modal-body">
              {!canRegister && (
                <div className="warning-box">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <span>Connect both wallets to register tokens</span>
                </div>
              )}

              {step === 'input' && (
                <div className="register-step">
                  <p className="step-description">
                    Enter the WAVES asset ID you want to bridge. Anyone can register
                    tokens - no special permissions needed.
                  </p>

                  <div className="form-group">
                    <label>WAVES Asset ID</label>
                    <input
                      type="text"
                      value={assetId}
                      onChange={(e) => setAssetId(e.target.value)}
                      placeholder="e.g. WAVES or 34N9YcEETLWn93qYQ64EsP1x89tSruJU44RrEMSXXEPJ"
                      disabled={!canRegister || fetchingInfo}
                    />
                  </div>

                  {fetchError && (
                    <div className="error-box">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      {fetchError}
                    </div>
                  )}

                  <button
                    className="btn-primary"
                    onClick={fetchAssetInfo}
                    disabled={!canRegister || fetchingInfo || !assetId.trim()}
                  >
                    {fetchingInfo ? (
                      <>
                        <span className="spinner" /> Fetching...
                      </>
                    ) : (
                      'Continue'
                    )}
                  </button>
                </div>
              )}

              {step === 'confirm' && assetInfo && (
                <div className="register-step">
                  <div className="asset-preview">
                    <div className="asset-header">
                      <div className="asset-icon">
                        {customSymbol.slice(0, 2)}
                      </div>
                      <div className="asset-info">
                        <span className="asset-name">{assetInfo.name}</span>
                        <span className="asset-id">{assetId}</span>
                      </div>
                    </div>
                    {assetInfo.description && (
                      <p className="asset-description">{assetInfo.description}</p>
                    )}

                    <div className="asset-metadata">
                      {assetInfo.quantity && (
                        <div className="metadata-item">
                          <span className="metadata-label">Total Supply</span>
                          <span className="metadata-value">
                            {(Number(assetInfo.quantity) / Math.pow(10, assetInfo.decimals)).toLocaleString()}
                          </span>
                        </div>
                      )}
                      {assetInfo.issuer && (
                        <div className="metadata-item">
                          <span className="metadata-label">Issuer</span>
                          <a
                            href={`${config.waves.explorer}/address/${assetInfo.issuer}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="metadata-value link"
                          >
                            {assetInfo.issuer.slice(0, 8)}...{assetInfo.issuer.slice(-6)}
                          </a>
                        </div>
                      )}
                      {assetInfo.issueTimestamp && (
                        <div className="metadata-item">
                          <span className="metadata-label">Created</span>
                          <span className="metadata-value">
                            {new Date(assetInfo.issueTimestamp).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                      <div className="metadata-badges">
                        {assetInfo.reissuable && (
                          <span className="badge badge-info">Reissuable</span>
                        )}
                        {assetInfo.scripted && (
                          <span className="badge badge-warning">Smart Asset</span>
                        )}
                        {!assetInfo.reissuable && assetInfo.quantity && (
                          <span className="badge badge-success">Fixed Supply</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Token Name (on Unit0)</label>
                    <input
                      type="text"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder="Token name"
                    />
                    <span className="input-hint">Will be prefixed with "Wrapped"</span>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>Symbol</label>
                      <input
                        type="text"
                        value={customSymbol}
                        onChange={(e) => setCustomSymbol(e.target.value.toUpperCase())}
                        placeholder="Symbol"
                        maxLength={6}
                      />
                      <span className="input-hint">Will be prefixed with "w"</span>
                    </div>

                    <div className="form-group">
                      <label>Decimals</label>
                      <input
                        type="number"
                        value={unit0Decimals}
                        onChange={(e) => setUnit0Decimals(Number(e.target.value))}
                        min={0}
                        max={18}
                      />
                    </div>
                  </div>

                  <div className="registration-summary">
                    <h4>Registration Summary</h4>
                    <div className="summary-row">
                      <span>WAVES Asset</span>
                      <span>{assetId}</span>
                    </div>
                    <div className="summary-row">
                      <span>Unit0 Token Name</span>
                      <span>Wrapped {customName}</span>
                    </div>
                    <div className="summary-row">
                      <span>Unit0 Symbol</span>
                      <span>w{customSymbol}</span>
                    </div>
                    <div className="summary-row">
                      <span>WAVES Decimals</span>
                      <span>{assetInfo.decimals}</span>
                    </div>
                    <div className="summary-row">
                      <span>Unit0 Decimals</span>
                      <span>{unit0Decimals}</span>
                    </div>
                  </div>

                  {error && (
                    <div className="error-box">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      {error}
                    </div>
                  )}

                  <div className="button-row">
                    <button
                      className="btn-secondary"
                      onClick={() => setStep('input')}
                      disabled={loading}
                    >
                      Back
                    </button>
                    <button
                      className="btn-primary"
                      onClick={handleRegister}
                      disabled={loading || !customName || !customSymbol}
                    >
                      {loading ? (
                        <>
                          <span className="spinner" /> Registering...
                        </>
                      ) : (
                        'Register Token'
                      )}
                    </button>
                  </div>
                </div>
              )}

              {step === 'success' && (
                <div className="register-step success-step">
                  <div className="success-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                  </div>
                  <h4>Token Registered Successfully!</h4>
                  <p>Your token is now available for bridging between WAVES and Unit0.</p>

                  <div className="registration-summary">
                    <div className="summary-row">
                      <span>WAVES Asset ID</span>
                      <span className="mono">{assetId}</span>
                    </div>
                    <div className="summary-row">
                      <span>Unit0 Token</span>
                      <a
                        href={`${config.unit0.explorer}/address/${registeredToken}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mono link"
                      >
                        {registeredToken?.slice(0, 10)}...{registeredToken?.slice(-8)}
                      </a>
                    </div>
                    {txHash && (
                      <div className="summary-row">
                        <span>WAVES TX</span>
                        <a
                          href={`${config.waves.explorer}/tx/${txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mono link"
                        >
                          {txHash.slice(0, 10)}...{txHash.slice(-8)}
                        </a>
                      </div>
                    )}
                  </div>

                  <button className="btn-primary" onClick={handleClose}>
                    Done
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
