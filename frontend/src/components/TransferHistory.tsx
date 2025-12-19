import { useState } from 'react';
import { Clock, CheckCircle, XCircle, Loader2, ExternalLink, RefreshCw } from 'lucide-react';
import type { Transfer } from '../types';
import { config } from '../config';

interface TransferHistoryProps {
  pendingTransfers: Transfer[];
  onRefresh: () => Promise<void>;
}

export function TransferHistory({ pendingTransfers, onRefresh }: TransferHistoryProps) {
  const [loading, setLoading] = useState(false);

  const handleRefresh = async () => {
    setLoading(true);
    await onRefresh();
    setLoading(false);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={16} className="status-completed" />;
      case 'failed':
        return <XCircle size={16} className="status-failed" />;
      case 'pending':
      case 'attesting':
        return <Loader2 size={16} className="status-pending spin" />;
      default:
        return <Clock size={16} />;
    }
  };

  const getExplorerLink = (transfer: Transfer) => {
    if (transfer.sourceChain === 'waves') {
      return `${config.waves.explorer}/tx/${transfer.sourceTxHash}`;
    }
    return `${config.unit0.explorer}/tx/${transfer.sourceTxHash}`;
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const formatAmount = (amount: string) => {
    const num = parseFloat(amount);
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(2)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(2)}K`;
    }
    return num.toFixed(4);
  };

  return (
    <div className="transfer-history">
      <div className="history-header">
        <h3>Recent Transfers</h3>
        <button className="btn-refresh" onClick={handleRefresh} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
        </button>
      </div>

      {pendingTransfers.length === 0 ? (
        <div className="no-transfers">
          <Clock size={32} />
          <p>No pending transfers</p>
        </div>
      ) : (
        <div className="transfer-list">
          {pendingTransfers.map((transfer) => (
            <div key={transfer.transferId} className="transfer-item">
              <div className="transfer-status">{getStatusIcon(transfer.status)}</div>

              <div className="transfer-details">
                <div className="transfer-route">
                  <span className="chain">{transfer.sourceChain.toUpperCase()}</span>
                  <span className="arrow">→</span>
                  <span className="chain">{transfer.destinationChain.toUpperCase()}</span>
                </div>
                <div className="transfer-amount">
                  {formatAmount(transfer.amount)} {transfer.token.slice(0, 8)}...
                </div>
                <div className="transfer-time">{formatTime(transfer.timestamp)}</div>
              </div>

              <a
                href={getExplorerLink(transfer)}
                target="_blank"
                rel="noopener noreferrer"
                className="transfer-link"
              >
                <ExternalLink size={14} />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
