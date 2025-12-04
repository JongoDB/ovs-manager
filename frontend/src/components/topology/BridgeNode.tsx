import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { Box, Typography } from '@mui/material';

interface BridgeNodeProps {
  data: {
    label: string;
    ports: Array<{ name: string; uuid: string; status?: 'running' | 'stopped' | 'none' }>;
  };
}

const BridgeNode: React.FC<BridgeNodeProps> = ({ data }) => {
  return (
    <Box
      sx={{
        background: '#1976d2',
        color: 'white',
        border: '2px solid #1565c0',
        borderRadius: '8px',
        padding: '12px',
        minWidth: 180,
      }}
    >
      <Typography variant="subtitle1" fontWeight={600} textAlign="center" mb={1}>
        {data.label}
      </Typography>

      {/* Ports list */}
      <Box sx={{ fontSize: '10px' }}>
        {data.ports.map((port, idx) => (
          <Box
            key={port.uuid || `port-${idx}-${port.name}`}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              py: 0.3,
              px: 0.5,
              my: 0.3,
              background: 'rgba(255,255,255,0.1)',
              borderRadius: '3px',
              position: 'relative',
            }}
          >
            {/* Left handle (for incoming connections) */}
            <Handle
              type="target"
              position={Position.Left}
              id={`${port.name}-in`}
              style={{
                left: -8,
                top: '50%',
                width: 8,
                height: 8,
                background: port.status === 'running' ? '#4caf50' : port.status === 'stopped' ? '#f44336' : '#9e9e9e',
                border: '1px solid white',
              }}
            />

            <Typography sx={{ fontSize: '10px', flex: 1, textAlign: 'center' }}>
              {port.name}
            </Typography>
          </Box>
        ))}
      </Box>

      <Typography variant="caption" display="block" textAlign="center" mt={1}>
        {data.ports.length} ports
      </Typography>
    </Box>
  );
};

export default memo(BridgeNode);
