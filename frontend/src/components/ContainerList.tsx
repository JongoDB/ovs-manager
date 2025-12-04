import React from 'react';
import { Container, Bridge } from '../types';

interface ContainerListProps {
  containers: Container[];
  bridges?: Bridge[];
}

const ContainerList: React.FC<ContainerListProps> = ({ containers, bridges = [] }) => {
  if (containers.length === 0) {
    return <p>No containers found.</p>;
  }

  // Create a set of OVS bridge names for filtering
  const ovsBridgeNames = new Set(bridges.map(b => b.name));

  return (
    <table className="table" style={{ width: '100%' }}>
      <thead>
        <tr>
          <th style={{ width: '80px' }}>CT ID</th>
          <th style={{ width: '200px' }}>Name</th>
          <th style={{ width: '100px' }}>Status</th>
          <th style={{ width: '150px' }}>Bridges</th>
          <th style={{ paddingLeft: '2rem' }}>Interfaces</th>
        </tr>
      </thead>
      <tbody>
        {containers.map(container => {
          // Get unique OVS bridges from interfaces (only show actual OVS bridges)
          const containerBridges = Array.from(
            new Set(
              container.interfaces
                .map(iface => iface.bridge)
                .filter(bridge => bridge && bridge !== 'unknown' && ovsBridgeNames.has(bridge))
            )
          ).sort();
          
          return (
            <tr key={container.ctid}>
              <td>{container.ctid}</td>
              <td>{container.name}</td>
              <td>
                <span className={`status-badge ${container.status === 'running' ? 'status-connected' : 'status-disconnected'}`}>
                  {container.status}
                </span>
              </td>
              <td>
                {containerBridges.length === 0 ? (
                  <span style={{ color: '#999' }}>None</span>
                ) : (
                  <span>{containerBridges.join(', ')}</span>
                )}
              </td>
              <td style={{ paddingLeft: '2rem' }}>
                {container.interfaces.length === 0 ? (
                  <span style={{ color: '#999' }}>No interfaces</span>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {container.interfaces.map((iface, idx) => {
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

export default ContainerList;

