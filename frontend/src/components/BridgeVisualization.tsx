import React, { useState } from 'react';
import { Bridge, Mirror, VM, Container } from '../types';
import { PortMapping, mirrorsApi } from '../services/api';
import { findVMForPort } from '../utils/vmMapping';
import './BridgeVisualization.css';

interface BridgeVisualizationProps {
  hostId: string;
  bridges: Bridge[];
  mirrors: Mirror[];
  vms?: VM[];
  containers?: Container[];
  portMapping?: PortMapping | null;
  onMirrorDeleted?: () => void;
}

const BridgeVisualization: React.FC<BridgeVisualizationProps> = ({
  hostId,
  bridges,
  mirrors,
  vms = [],
  containers = [],
  portMapping,
  onMirrorDeleted
}) => {
  const [clearing, setClearing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (bridges.length === 0) {
    return <p>No bridges found.</p>;
  }

  // Create a map of port name -> port mapping info
  const portInfoMap = new Map();
  if (portMapping?.ports) {
    portMapping.ports.forEach(port => {
      portInfoMap.set(port.port_name, port);
    });
  }

  const handleClearMirrors = async (bridgeName: string) => {
    if (!window.confirm(`Are you sure you want to clear all mirrors from bridge "${bridgeName}"?`)) {
      return;
    }

    setClearing(bridgeName);
    setError(null);
    try {
      await mirrorsApi.clearBridgeMirrors(hostId, bridgeName);
      if (onMirrorDeleted) {
        onMirrorDeleted();
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to clear bridge mirrors');
    } finally {
      setClearing(null);
    }
  };

  return (
    <div className="bridge-visualization">
      {bridges.map(bridge => {
        const bridgeMirrors = mirrors.filter(m => m.bridge === bridge.name);

        // Find all VMs configured to use this bridge
        const configuredVMs = vms.filter(vm =>
          vm.interfaces.some(iface => iface.bridge === bridge.name)
        );

        // Find all containers configured to use this bridge
        const configuredContainers = containers.filter(ct =>
          ct.interfaces.some(iface => iface.bridge === bridge.name)
        );

        // Separate into running (with ports in OVS) and stopped (no ports)
        const runningVMs = configuredVMs.filter(vm =>
          vm.interfaces.some(iface =>
            iface.bridge === bridge.name &&
            bridge.ports.some(port => port.name === iface.tap)
          )
        );

        const stoppedVMs = configuredVMs.filter(vm =>
          !runningVMs.includes(vm) &&
          vm.interfaces.some(iface => iface.bridge === bridge.name)
        );

        const runningContainers = configuredContainers.filter(ct =>
          ct.interfaces.some(iface =>
            iface.bridge === bridge.name &&
            bridge.ports.some(port => port.name === iface.tap)
          )
        );

        const stoppedContainers = configuredContainers.filter(ct =>
          !runningContainers.includes(ct) &&
          ct.interfaces.some(iface => iface.bridge === bridge.name)
        );

        const totalConfigured = configuredVMs.length + configuredContainers.length;
        const totalRunning = runningVMs.length + runningContainers.length;
        const totalStopped = stoppedVMs.length + stoppedContainers.length;

        return (
          <div key={bridge.uuid} className="bridge-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>{bridge.name}</h3>
              {bridgeMirrors.length > 0 && (
                <button
                  className="button button-danger"
                  onClick={() => handleClearMirrors(bridge.name)}
                  disabled={clearing === bridge.name}
                  style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
                >
                  {clearing === bridge.name ? 'Clearing...' : 'Clear All Mirrors'}
                </button>
              )}
            </div>
            {error && <div className="error" style={{ marginBottom: '1rem' }}>{error}</div>}
            <div className="bridge-info">
              <div className="info-item">
                <strong>UUID:</strong> {bridge.uuid}
              </div>
              {bridge.cidr && (
                <div className="info-item">
                  <strong>CIDR:</strong> {bridge.cidr}
                </div>
              )}
              <div className="info-item">
                <strong>Ports:</strong> {bridge.ports.length}
              </div>
              <div className="info-item">
                <strong>Configured Devices:</strong> {totalConfigured} ({totalRunning} running, {totalStopped} stopped)
              </div>
              <div className="info-item">
                <strong>Mirrors:</strong> {bridgeMirrors.length}
              </div>
            </div>
            
            <div className="ports-section">
              <h4>Ports:</h4>
              {bridge.ports.length === 0 ? (
                <p className="no-data">No ports</p>
              ) : (
                <ul className="port-list">
                  {bridge.ports.map(port => {
                    const vmInfo = vms.length > 0 ? findVMForPort(port.name, vms) : null;
                    const portInfo = portInfoMap.get(port.name);
                    const containerInfo = portInfo?.is_container && portInfo.container_id 
                      ? { id: portInfo.container_id, name: portInfo.container_name, netid: portInfo.interface_netid }
                      : null;
                    
                    return (
                      <li key={port.uuid} className="port-item">
                        <div className="port-header">
                          <span className="port-name">{port.name}</span>
                          {vmInfo && (
                            <span className="port-vm-info" title={`VM ${vmInfo.vm.vmid}: ${vmInfo.vm.name}`}>
                              VM {vmInfo.vm.vmid} ({vmInfo.vm.name}) - {vmInfo.interface.netid}
                            </span>
                          )}
                          {containerInfo && (
                            <span className="port-vm-info" title={`CT ${containerInfo.id}: ${containerInfo.name}`} style={{ backgroundColor: '#fff3cd', color: '#856404' }}>
                              CT {containerInfo.id} ({containerInfo.name}) - {containerInfo.netid || 'unknown'}
                            </span>
                          )}
                        </div>
                        {port.interfaces.length > 0 && (
                          <span className="port-interfaces">
                            Interfaces: {port.interfaces.map(i => i.name).join(', ')}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {(configuredVMs.length > 0 || configuredContainers.length > 0) && (
              <div className="devices-section" style={{ marginTop: '1rem' }}>
                <h4>Configured Devices:</h4>
                <ul className="device-list" style={{ listStyle: 'none', padding: 0 }}>
                  {configuredVMs.map(vm => {
                    const vmInterfaces = vm.interfaces.filter(iface => iface.bridge === bridge.name);
                    const isRunning = vm.status === 'running';
                    const hasActivePorts = vmInterfaces.some(iface =>
                      bridge.ports.some(port => port.name === iface.tap)
                    );

                    return (
                      <li
                        key={`vm-${vm.vmid}`}
                        style={{
                          padding: '0.5rem',
                          marginBottom: '0.5rem',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          backgroundColor: isRunning ? '#d4edda' : '#f8d7da',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              backgroundColor: isRunning ? '#28a745' : '#dc3545',
                            }}
                          />
                          <strong>VM {vm.vmid}</strong>
                          <span>({vm.name})</span>
                          <span style={{
                            fontSize: '0.85rem',
                            color: '#666',
                            marginLeft: 'auto'
                          }}>
                            {isRunning ? 'Running' : 'Stopped'}
                            {!hasActivePorts && isRunning && ' - No active ports'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem', marginLeft: '1.3rem' }}>
                          Interfaces: {vmInterfaces.map(iface => iface.tap).join(', ')}
                        </div>
                      </li>
                    );
                  })}
                  {configuredContainers.map(ct => {
                    const ctInterfaces = ct.interfaces.filter(iface => iface.bridge === bridge.name);
                    const isRunning = ct.status === 'running';
                    const hasActivePorts = ctInterfaces.some(iface =>
                      bridge.ports.some(port => port.name === iface.tap)
                    );

                    return (
                      <li
                        key={`ct-${ct.ctid}`}
                        style={{
                          padding: '0.5rem',
                          marginBottom: '0.5rem',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          backgroundColor: isRunning ? '#fff3cd' : '#f8d7da',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              backgroundColor: isRunning ? '#ff9800' : '#dc3545',
                            }}
                          />
                          <strong>CT {ct.ctid}</strong>
                          <span>({ct.name})</span>
                          <span style={{
                            fontSize: '0.85rem',
                            color: '#666',
                            marginLeft: 'auto'
                          }}>
                            {isRunning ? 'Running' : 'Stopped'}
                            {!hasActivePorts && isRunning && ' - No active ports'}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem', marginLeft: '1.3rem' }}>
                          Interfaces: {ctInterfaces.map(iface => iface.tap).join(', ')}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {bridgeMirrors.length > 0 && (
              <div className="mirrors-section">
                <h4>Mirrors:</h4>
                <ul className="mirror-list">
                  {bridgeMirrors.map(mirror => (
                    <li key={mirror.uuid} className="mirror-item">
                      <span className="mirror-name">{mirror.name || 'Unnamed'}</span>
                      {mirror.select_src_port && (
                        <span className="mirror-info">
                          Source: {mirror.select_src_port.join(', ')}
                        </span>
                      )}
                      {mirror.output_port && (
                        <span className="mirror-info">
                          Output: {mirror.output_port}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default BridgeVisualization;

