import React, { useState } from 'react';
import { mirrorsApi } from '../services/api';
import { Mirror } from '../types';

interface MirrorListProps {
  hostId: string;
  mirrors: Mirror[];
  onDelete: () => void;
}

const MirrorList: React.FC<MirrorListProps> = ({ hostId, mirrors, onDelete }) => {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [loadingStats, setLoadingStats] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, Record<string, any>>>({});
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async (mirror: Mirror) => {
    if (!window.confirm(`Are you sure you want to delete mirror "${mirror.name || mirror.uuid}"?`)) {
      return;
    }

    setDeleting(mirror.uuid);
    setError(null);
    try {
      await mirrorsApi.delete(hostId, mirror.uuid, mirror.bridge);
      onDelete();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete mirror');
    } finally {
      setDeleting(null);
    }
  };

  const handleViewStatistics = async (mirror: Mirror) => {
    const mirrorName = mirror.name || mirror.uuid;
    if (stats[mirror.uuid]) {
      // Toggle off
      setStats(prev => {
        const newStats = { ...prev };
        delete newStats[mirror.uuid];
        return newStats;
      });
      return;
    }

    setLoadingStats(mirror.uuid);
    setError(null);
    try {
      const result = await mirrorsApi.getStatistics(hostId, mirrorName);
      setStats(prev => ({
        ...prev,
        [mirror.uuid]: result.statistics || result
      }));
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to get mirror statistics');
    } finally {
      setLoadingStats(null);
    }
  };

  if (mirrors.length === 0) {
    return <p>No mirrors configured.</p>;
  }

  return (
    <div>
      {error && <div className="error">{error}</div>}
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Bridge</th>
            <th>Source Port</th>
            <th>Output Port</th>
            <th>UUID</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {mirrors.map(mirror => (
            <React.Fragment key={mirror.uuid}>
              <tr>
                <td>{mirror.name || 'Unnamed'}</td>
                <td>{mirror.bridge}</td>
                <td>{mirror.select_src_port?.join(', ') || (mirror.select_src_port === null ? 'All (dynamic)' : '-')}</td>
                <td>{mirror.output_port || '-'}</td>
                <td>
                  <code style={{ fontSize: '0.85rem' }}>{mirror.uuid}</code>
                </td>
                <td>
                  <button
                    className="button"
                    onClick={() => handleViewStatistics(mirror)}
                    disabled={loadingStats === mirror.uuid}
                    style={{ marginRight: '0.5rem' }}
                  >
                    {loadingStats === mirror.uuid 
                      ? 'Loading...' 
                      : stats[mirror.uuid] 
                        ? 'Hide Stats' 
                        : 'View Stats'}
                  </button>
                  <button
                    className="button button-danger"
                    onClick={() => handleDelete(mirror)}
                    disabled={deleting === mirror.uuid}
                  >
                    {deleting === mirror.uuid ? 'Deleting...' : 'Delete'}
                  </button>
                </td>
              </tr>
              {stats[mirror.uuid] && (
                <tr>
                  <td colSpan={6} style={{ backgroundColor: '#f8f9fa', padding: '1rem' }}>
                    <div>
                      <strong>Statistics:</strong>
                      <pre style={{ 
                        marginTop: '0.5rem', 
                        padding: '0.5rem', 
                        backgroundColor: '#fff', 
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        fontSize: '0.85rem',
                        overflow: 'auto'
                      }}>
                        {JSON.stringify(stats[mirror.uuid], null, 2)}
                      </pre>
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default MirrorList;

