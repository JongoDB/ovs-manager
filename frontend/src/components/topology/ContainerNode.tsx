import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { Box, Typography } from '@mui/material';

interface ContainerNodeProps {
  data: {
    ctid: number;
    name: string;
    status: string;
    interfaces: Array<{ tap: string; netid: string }>; // tap field contains veth interface name for containers
  };
}

const ContainerNode: React.FC<ContainerNodeProps> = ({ data }) => {
  const isRunning = data.status === 'running';

  return (
    <Box
      sx={{
        background: '#ff9800',
        color: 'white',
        border: '2px solid #f57c00',
        borderRadius: '8px',
        padding: '12px',
        minWidth: 150,
        opacity: isRunning ? 1 : 0.6,
      }}
    >
      <Typography variant="subtitle1" fontWeight={600} textAlign="center">
        CT {data.ctid}
      </Typography>
      <Typography variant="caption" display="block" textAlign="center" mb={1}>
        {data.name}
      </Typography>
      <Typography
        variant="caption"
        display="block"
        textAlign="center"
        fontWeight={600}
        mb={1}
        sx={{ fontSize: '9px' }}
      >
        {isRunning ? '● Running' : '○ Stopped'}
      </Typography>

      {/* Interfaces list */}
      <Box sx={{ fontSize: '10px' }}>
        {data.interfaces.map((iface) => (
          <Box
            key={iface.tap}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              py: 0.3,
              px: 0.5,
              my: 0.3,
              background: 'rgba(255,255,255,0.15)',
              borderRadius: '3px',
              position: 'relative',
            }}
          >
            <Typography sx={{ fontSize: '9px', flex: 1 }}>
              {iface.netid}
            </Typography>

            {/* Right handle (connects to bridge) */}
            <Handle
              type="source"
              position={Position.Right}
              id={iface.tap}
              style={{
                right: -8,
                top: '50%',
                width: 8,
                height: 8,
                background: '#ff9800',
                border: '1px solid white',
              }}
            />
            {/* Target handle for receiving mirror connections */}
            <Handle
              type="target"
              position={Position.Right}
              id={iface.tap}
              style={{
                right: -8,
                top: '50%',
                width: 8,
                height: 8,
                background: '#ff9800',
                border: '1px solid white',
              }}
            />
          </Box>
        ))}
      </Box>
    </Box>
  );
};

export default memo(ContainerNode);
