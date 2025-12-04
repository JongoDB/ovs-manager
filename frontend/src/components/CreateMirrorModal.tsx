import React, { useState, useEffect } from 'react';
import { mirrorsApi, PortMapping } from '../services/api';
import { Bridge, VM } from '../types';
import { getPortLabel, getPortVMInfo } from '../utils/vmMapping';
import './CreateMirrorModal.css';

interface CreateMirrorModalProps {
  hostId: string;
  bridges: Bridge[];
  vms: VM[];
  portMapping?: PortMapping | null;
  onClose: () => void;
  onSuccess: () => void;
}

type MirrorMode = 'manual' | 'dynamic';

const CreateMirrorModal: React.FC<CreateMirrorModalProps> = ({
  hostId,
  bridges,
  vms,
  portMapping,
  onClose,
  onSuccess,
}) => {
  const [mode, setMode] = useState<MirrorMode>('manual');
  const [bridgeName, setBridgeName] = useState('');
  const [mirrorName, setMirrorName] = useState('');
  const [sourcePorts, setSourcePorts] = useState<string[]>([]);
  const [outputPort, setOutputPort] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedBridge = bridges.find(b => b.name === bridgeName);
  const availablePorts = selectedBridge?.ports.map(p => p.name) || [];
  
  // For output port, only show ports from the same bridge (bug fix)
  const outputPorts = selectedBridge?.ports.map(p => p.name) || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validation
    if (mode === 'manual' && sourcePorts.length === 0) {
      setError('Please select at least one source/destination port');
      setLoading(false);
      return;
    }
    if (!outputPort) {
      setError('Please select an output port');
      setLoading(false);
      return;
    }

    try {
      await mirrorsApi.create(hostId, {
        bridge_name: bridgeName,
        mirror_name: mirrorName,
        mode: mode,
        source_ports: mode === 'manual' ? sourcePorts : undefined,
        output_port: outputPort,
      });
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create mirror');
    } finally {
      setLoading(false);
    }
  };

  const handlePortToggle = (port: string) => {
    setSourcePorts(prev => 
      prev.includes(port) 
        ? prev.filter(p => p !== port)
        : [...prev, port]
    );
  };

  // Auto-generate mirror name
  useEffect(() => {
    if (bridgeName) {
      if (mode === 'dynamic') {
        setMirrorName(`${bridgeName}-mirror`);
      } else if (sourcePorts.length > 0 && outputPort) {
        const sourceName = sourcePorts[0].replace('tap', '').replace('i', '-');
        const outputName = outputPort.replace('tap', '').replace('i', '-');
        setMirrorName(`${bridgeName}-mirror-${sourceName}-to-${outputName}`);
      } else {
        setMirrorName('');
      }
    }
  }, [bridgeName, sourcePorts, outputPort, mode]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create Mirror</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="error">{error}</div>}

          <div className="form-group">
            <label>Mirror Mode *</label>
            <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  value="manual"
                  checked={mode === 'manual'}
                  onChange={e => {
                    setMode(e.target.value as MirrorMode);
                    setSourcePorts([]);
                  }}
                />
                <span>Manual</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  value="dynamic"
                  checked={mode === 'dynamic'}
                  onChange={e => {
                    setMode(e.target.value as MirrorMode);
                    setSourcePorts([]);
                  }}
                />
                <span>Dynamic (select-all=true)</span>
              </label>
            </div>
            <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#666' }}>
              {mode === 'manual' 
                ? 'Manually select source/destination ports to mirror'
                : 'Monitor entire bridge automatically (fire and forget)'}
            </p>
          </div>

          <div className="form-group">
            <label>Bridge *</label>
            <select
              value={bridgeName}
              onChange={e => {
                setBridgeName(e.target.value);
                setSourcePorts([]);
                setOutputPort('');
              }}
              required
            >
              <option value="">Select a bridge</option>
              {bridges.map(bridge => (
                <option key={bridge.uuid} value={bridge.name}>
                  {bridge.name}
                </option>
              ))}
            </select>
          </div>

          {mode === 'manual' && (
            <div className="form-group">
              <label>Source/Destination Ports (SPAN) *</label>
              <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.5rem' }}>
                Select one or more ports to mirror (Ctrl/Cmd+Click for multiple)
              </p>
              <div style={{ 
                border: '1px solid #ddd', 
                borderRadius: '4px', 
                padding: '0.5rem',
                maxHeight: '200px',
                overflowY: 'auto',
                backgroundColor: '#fff'
              }}>
                {availablePorts.length === 0 ? (
                  <p style={{ color: '#999', fontSize: '0.9rem' }}>No ports available</p>
                ) : (
                  availablePorts
                    .filter(port => port !== outputPort)
                    .map(port => (
                      <label 
                        key={port} 
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '0.5rem', 
                          padding: '0.5rem',
                          cursor: 'pointer',
                          borderRadius: '4px',
                          backgroundColor: sourcePorts.includes(port) ? '#e7f3ff' : 'transparent'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={sourcePorts.includes(port)}
                          onChange={() => handlePortToggle(port)}
                        />
                        <span>{getPortLabel(port, vms, portMapping)}</span>
                        {getPortVMInfo(port, vms, portMapping) && (
                          <span style={{ fontSize: '0.8rem', color: '#666', marginLeft: 'auto' }}>
                            {getPortVMInfo(port, vms, portMapping)}
                          </span>
                        )}
                      </label>
                    ))
                )}
              </div>
              {sourcePorts.length > 0 && (
                <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#007bff' }}>
                  {sourcePorts.length} port{sourcePorts.length !== 1 ? 's' : ''} selected
                </p>
              )}
            </div>
          )}

          <div className="form-group">
            <label>Output Port (Monitor) *</label>
            <select
              value={outputPort}
              onChange={e => setOutputPort(e.target.value)}
              required
              disabled={!bridgeName}
            >
              <option value="">Select output port</option>
              {outputPorts
                .filter(port => mode === 'dynamic' || !sourcePorts.includes(port))
                .map(port => {
                  const portLabel = getPortLabel(port, vms, portMapping);
                  return (
                    <option key={port} value={port}>
                      {portLabel}
                    </option>
                  );
                })}
            </select>
            {outputPort && (
              <>
                {getPortVMInfo(outputPort, vms, portMapping) && (
                  <p className="info" style={{ marginTop: '0.5rem', color: '#666', fontSize: '0.9rem' }}>
                    {getPortVMInfo(outputPort, vms, portMapping)}
                  </p>
                )}
                {outputPort.endsWith('i0') && (
                  <p className="warning">Warning: This is typically a management interface</p>
                )}
              </>
            )}
          </div>

          <div className="form-group">
            <label>Mirror Name *</label>
            <input
              type="text"
              value={mirrorName}
              onChange={e => setMirrorName(e.target.value)}
              required
              placeholder="e.g., vmbr0-mirror"
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="button button-success" disabled={loading}>
              {loading ? 'Creating...' : 'Create Mirror'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateMirrorModal;

