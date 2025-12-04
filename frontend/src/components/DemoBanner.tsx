import React from 'react';
import { Box, Alert, AlertTitle, Link } from '@mui/material';
import InfoIcon from '@mui/icons-material/Info';

const DemoBanner: React.FC = () => {
  const isDemoMode = process.env.REACT_APP_DEMO_MODE === 'true';

  if (!isDemoMode) {
    return null;
  }

  return (
    <Box sx={{ width: '100%', position: 'fixed', top: 0, left: 0, zIndex: 9999 }}>
      <Alert
        severity="info"
        icon={<InfoIcon fontSize="inherit" />}
        sx={{
          borderRadius: 0,
          '& .MuiAlert-message': {
            width: '100%',
            textAlign: 'center'
          }
        }}
      >
        <AlertTitle sx={{ mb: 0 }}>
          <strong>Live Demo</strong> - This is a demonstration with sample data showcasing OVS Manager functionality.
          {' '}
          <Link
            href="https://github.com/JongoDB/ovs-manager"
            target="_blank"
            rel="noopener noreferrer"
            sx={{ color: 'inherit', textDecoration: 'underline' }}
          >
            Deploy your own instance →
          </Link>
        </AlertTitle>
      </Alert>
    </Box>
  );
};

export default DemoBanner;
