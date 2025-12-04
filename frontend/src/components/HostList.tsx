import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { hostsApi } from '../services/api';
import { Host } from '../types';
import CreateHostModal from './CreateHostModal';
import EditHostModal from './EditHostModal';

const HostList: React.FC = () => {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingHost, setEditingHost] = useState<Host | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadHosts();
  }, []);

  const loadHosts = async () => {
    try {
      const hostList = await hostsApi.list();
      setHosts(hostList);
    } catch (error) {
      console.error('Failed to load hosts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (host: Host) => {
    if (!window.confirm(`Are you sure you want to delete host "${host.name}"? This will remove all configuration for this host.`)) {
      return;
    }

    setDeleting(host.name);
    try {
      await hostsApi.delete(host.name);
      await loadHosts();
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to delete host');
    } finally {
      setDeleting(null);
    }
  };

  const handleHostCreated = () => {
    setShowCreateModal(false);
    loadHosts();
  };

  const handleHostUpdated = () => {
    setEditingHost(null);
    loadHosts();
  };

  if (loading) {
    return <div className="loading">Loading hosts...</div>;
  }

  return (
    <div>
      <div className="card">
        <div className="flex-between">
          <h2>Configured Hosts</h2>
          <button className="button button-success" onClick={() => setShowCreateModal(true)}>
            Add Host
          </button>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Hostname</th>
              <th>Port</th>
              <th>Username</th>
              <th>Description</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {hosts.map(host => (
              <tr key={host.name}>
                <td>{host.name}</td>
                <td>{host.hostname}</td>
                <td>{host.port}</td>
                <td>{host.username}</td>
                <td>{host.description || '-'}</td>
                <td>
                  <div className="flex">
                    <Link to={`/hosts/${host.name}`} className="button">
                      View
                    </Link>
                    <button
                      className="button"
                      onClick={() => setEditingHost(host)}
                    >
                      Edit
                    </button>
                    <button
                      className="button button-danger"
                      onClick={() => handleDelete(host)}
                      disabled={deleting === host.name}
                    >
                      {deleting === host.name ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {hosts.length === 0 && !loading && (
          <p style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
            No hosts configured. Click "Add Host" to get started.
          </p>
        )}
      </div>

      {showCreateModal && (
        <CreateHostModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleHostCreated}
        />
      )}

      {editingHost && (
        <EditHostModal
          host={editingHost}
          onClose={() => setEditingHost(null)}
          onSuccess={handleHostUpdated}
        />
      )}
    </div>
  );
};

export default HostList;

