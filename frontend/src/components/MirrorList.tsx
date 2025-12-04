import React, { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  Typography,
  Box,
  Collapse,
  Alert,
  CircularProgress,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import BarChartIcon from '@mui/icons-material/BarChart';
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
    return (
      <Typography variant="body2" color="text.secondary">
        No mirrors configured.
      </Typography>
    );
  }

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Bridge</TableCell>
              <TableCell>Source Port</TableCell>
              <TableCell>Output Port</TableCell>
              <TableCell>UUID</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {mirrors.map(mirror => (
              <React.Fragment key={mirror.uuid}>
                <TableRow>
                  <TableCell>{mirror.name || 'Unnamed'}</TableCell>
                  <TableCell>{mirror.bridge}</TableCell>
                  <TableCell>
                    {mirror.select_src_port?.join(', ') || (mirror.select_src_port === null ? 'All (dynamic)' : '-')}
                  </TableCell>
                  <TableCell>{mirror.output_port || '-'}</TableCell>
                  <TableCell>
                    <Typography variant="body2" fontFamily="monospace" fontSize="0.85rem">
                      {mirror.uuid}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={loadingStats === mirror.uuid ? <CircularProgress size={16} /> : <BarChartIcon />}
                      onClick={() => handleViewStatistics(mirror)}
                      disabled={loadingStats === mirror.uuid}
                      sx={{ mr: 1 }}
                    >
                      {stats[mirror.uuid] ? 'Hide Stats' : 'View Stats'}
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      startIcon={deleting === mirror.uuid ? <CircularProgress size={16} /> : <DeleteIcon />}
                      onClick={() => handleDelete(mirror)}
                      disabled={deleting === mirror.uuid}
                    >
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
                {stats[mirror.uuid] && (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ py: 0 }}>
                      <Collapse in={true}>
                        <Box sx={{ p: 2, bgcolor: 'grey.50' }}>
                          <Typography variant="subtitle2" gutterBottom>
                            <strong>Statistics:</strong>
                          </Typography>
                          <Paper
                            variant="outlined"
                            sx={{
                              p: 1,
                              bgcolor: 'background.paper',
                              fontFamily: 'monospace',
                              fontSize: '0.85rem',
                              overflow: 'auto',
                              whiteSpace: 'pre',
                            }}
                          >
                            {JSON.stringify(stats[mirror.uuid], null, 2)}
                          </Paper>
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default MirrorList;
