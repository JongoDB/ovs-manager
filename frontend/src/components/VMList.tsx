import React from 'react';
import { VM, Bridge } from '../types';

interface VMListProps {
  vms: VM[];
  bridges?: Bridge[];
}

const VMList: React.FC<VMListProps> = ({ vms, bridges = [] }) => {
  if (vms.length === 0) {
    return <p>No VMs found.</p>;
  }

  // Create a set of OVS bridge names for filtering
  const ovsBridgeNames = new Set(bridges.map(b => b.name));

  return (
    <table className="table" style={{ width: '100%' }}>
      <thead>
        <tr>
          <th style={{ width: '80px' }}>VMID</th>
          <th style={{ width: '200px' }}>Name</th>
          <th style={{ width: '100px' }}>Status</th>
          <th style={{ width: '150px' }}>Bridges</th>
          <th style={{ paddingLeft: '2rem' }}>Interfaces</th>
        </tr>
      </thead>
      <tbody>
        {vms.map(vm => {
          // Get unique OVS bridges from interfaces (only show actual OVS bridges)
          const vmBridges = Array.from(
            new Set(
              vm.interfaces
                .map(iface => iface.bridge)
                .filter(bridge => bridge && bridge !== 'unknown' && ovsBridgeNames.has(bridge))
            )
          ).sort();
          
          return (
            <tr key={vm.vmid}>
              <td>{vm.vmid}</td>
              <td>{vm.name}</td>
              <td>
                <span className={`status-badge ${vm.status === 'running' ? 'status-connected' : 'status-disconnected'}`}>
                  {vm.status}
                </span>
              </td>
              <td>
                {vmBridges.length === 0 ? (
                  <span style={{ color: '#999' }}>None</span>
                ) : (
                  <span>{vmBridges.join(', ')}</span>
                )}
              </td>
              <td style={{ paddingLeft: '2rem' }}>
                {vm.interfaces.length === 0 ? (
                  <span style={{ color: '#999' }}>No interfaces</span>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {vm.interfaces.map((iface, idx) => {
                      const bridgeName = iface.bridge && iface.bridge !== 'unknown' && ovsBridgeNames.has(iface.bridge) 
                        ? iface.bridge 
                        : null;
                      return (
                        <li key={idx} style={{ marginBottom: '0.25rem' }}>
                          <code>{iface.tap}</code> ({iface.netid})
                          {bridgeName && (
                            <span style={{ color: '#666', marginLeft: '0.5rem' }}>--&gt; {bridgeName}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

export default VMList;

