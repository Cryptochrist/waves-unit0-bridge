import { useEffect, useState } from 'react';
import { Activity, CheckCircle, Clock, XCircle } from 'lucide-react';
import type { BridgeStats } from '../types';

interface StatsProps {
  getBridgeStats: () => Promise<BridgeStats | null>;
}

export function Stats({ getBridgeStats }: StatsProps) {
  const [stats, setStats] = useState<BridgeStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      const data = await getBridgeStats();
      setStats(data);
      setLoading(false);
    };

    fetchStats();
    const interval = setInterval(fetchStats, 30000); // Refresh every 30s

    return () => clearInterval(interval);
  }, [getBridgeStats]);

  if (loading || !stats) {
    return (
      <div className="stats-container loading">
        <Activity size={24} className="spin" />
        <span>Loading stats...</span>
      </div>
    );
  }

  return (
    <div className="stats-container">
      <div className="stat-item">
        <div className="stat-icon total">
          <Activity size={20} />
        </div>
        <div className="stat-content">
          <span className="stat-value">{stats.totalTransfers}</span>
          <span className="stat-label">Total Transfers</span>
        </div>
      </div>

      <div className="stat-item">
        <div className="stat-icon pending">
          <Clock size={20} />
        </div>
        <div className="stat-content">
          <span className="stat-value">{stats.pendingTransfers}</span>
          <span className="stat-label">Pending</span>
        </div>
      </div>

      <div className="stat-item">
        <div className="stat-icon completed">
          <CheckCircle size={20} />
        </div>
        <div className="stat-content">
          <span className="stat-value">{stats.completedTransfers}</span>
          <span className="stat-label">Completed</span>
        </div>
      </div>

      <div className="stat-item">
        <div className="stat-icon failed">
          <XCircle size={20} />
        </div>
        <div className="stat-content">
          <span className="stat-value">{stats.failedTransfers}</span>
          <span className="stat-label">Failed</span>
        </div>
      </div>
    </div>
  );
}
