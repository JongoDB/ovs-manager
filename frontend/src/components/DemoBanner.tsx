import React from 'react';
import { Box, Alert, AlertTitle, Link } from '@mui/material';
import WarningIcon from '@mui/icons-material/Warning';

const DemoBanner: React.FC = () => {
  const isDemoMode = process.env.REACT_APP_DEMO_MODE === 'true';

  if (!isDemoMode) {
    return null;
  }

  return (
    <Box sx={{ width: '100%', position: 'relative', zIndex: 9999 }}>
      <Alert
        severity="warning"
        icon={<WarningIcon fontSize="inherit" />}
        sx={{
          borderRadius: 0,
          '& .MuiAlert-message': {
            width: '100%',
            textAlign: 'center'
          }
        }}
      >
        <AlertTitle sx={{ mb: 0 }}>
          <strong>Demo Mode</strong> - Limited functionality: This demo uses mock data and is not connected to a live Proxmox instance. Some operations may not function as intended.
          {' '}
          <Link
            href="https://github.com/jongodb/ovs-manager"
            target="_blank"
            rel="noopener noreferrer"
            sx={{ color: 'inherit', textDecoration: 'underline', fontWeight: 'bold' }}
          >
            Deploy your own instance →
          </Link>
        </AlertTitle>
      </Alert>
    </Box>
  );
};

export default DemoBanner;
