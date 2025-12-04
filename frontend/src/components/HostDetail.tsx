import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { bridgesApi, mirrorsApi, vmsApi, containersApi, hostsApi } from '../services/api';
import { Bridge, Mirror, VM, Container, HostStatus, Host } from '../types';
import BridgeVisualization from './BridgeVisualization';
import MirrorList from './MirrorList';
import EditHostModal from './EditHostModal';

const HostDetail: React.FC = () => {
  const { hostId } = useParams<{ hostId: string }>();
  const navigate = useNavigate();
  const [host, setHost] = useState<Host | null>(null);
  const [bridges, setBridges] = useState<Bridge[]>([]);
  const [mirrors, setMirrors] = useState<Mirror[]>([]);
  const [vms, setVms] = useState<VM[]>([]);
  const [containers, setContainers] = useState<Container[]>([]);
  const [hostStatus, setHostStatus] = useState<HostStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editingHost, setEditingHost] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hostId) {
      loadHostInfo();
      loadData();
      loadLastQueried();
    }
  }, [hostId]);

  const loadHostInfo = async () => {
    if (!hostId) return;
    try {
      const hostData = await hostsApi.get(hostId);
      setHost(hostData);
    } catch (error) {
      console.error('Failed to load host info:', error);
    }
  };

  const loadLastQueried = async () => {
    if (!hostId) return;
    try {
      const status = await hostsApi.getLastQueried(hostId);
      setHostStatus(status);
    } catch (error) {
      console.error('Failed to get last queried time:', error);
    }
  };

  const loadData = async () => {
    if (!hostId) return;
    setLoading(true);
    setError(null);
    try {
      const [bridgesData, mirrorsData, vmsData, containersData] = await Promise.all([
        bridgesApi.list(hostId),
        mirrorsApi.list(hostId),
        vmsApi.list(hostId),
        containersApi.list(hostId),
      ]);
      setBridges(bridgesData);
      setMirrors(mirrorsData);
      setVms(vmsData);
      setContainers(containersData);
    } catch (error: any) {
      setError(error.response?.data?.detail || 'Failed to load data');
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (!hostId) return;
    setRefreshing(true);
    setError(null);
    try {
      await hostsApi.refresh(hostId);
      await loadData();
      await loadLastQueried();
    } catch (error: any) {
      setError(error.response?.data?.detail || 'Failed to refresh data');
    } finally {
      setRefreshing(false);
    }
  };

  const handleDelete = async () => {
    if (!hostId) return;
    try {
      await hostsApi.delete(hostId);
      navigate('/');
    } catch (error: any) {
      setError(error.response?.data?.detail || 'Failed to delete host');
    }
    setShowDeleteDialog(false);
  };

  const handleMirrorDeleted = () => {
    loadData();
  };

  // Build VM port to bridge mapping
  const getVmPortMappings = (vmid: number) => {
    const mappings: { port: string; bridge: string; netid: string }[] = [];

    // Look for tap ports matching this VM (format: tap{vmid}i{interface_num})
    for (const bridge of bridges) {
      for (const port of bridge.ports) {
        const tapMatch = port.name.match(/^tap(\d+)i(\d+)$/);
        if (tapMatch && parseInt(tapMatch[1]) === vmid) {
          const interfaceNum = tapMatch[2];
          mappings.push({
            port: port.name,
            bridge: bridge.name,
            netid: `net${interfaceNum}`,
          });
        }
      }
    }

    return mappings;
  };

  // Build container port to bridge mapping
  const getContainerPortMappings = (ctid: number) => {
    const mappings: { port: string; bridge: string; netid: string }[] = [];

    // Look for veth ports matching this container (format: veth{ctid}i{interface_num})
    for (const bridge of bridges) {
      for (const port of bridge.ports) {
        const vethMatch = port.name.match(/^veth(\d+)i(\d+)$/);
        if (vethMatch && parseInt(vethMatch[1]) === ctid) {
          const interfaceNum = vethMatch[2];
          mappings.push({
            port: port.name,
            bridge: bridge.name,
            netid: `net${interfaceNum}`,
          });
        }
      }
    }

    return mappings;
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" component="h1" fontWeight={600}>
            Host: {hostId}
          </Typography>
          {hostStatus && (
            <Typography variant="body2" color="text.secondary" mt={1}>
              <strong>Last Queried:</strong>{' '}
              {hostStatus.last_checked
                ? new Date(hostStatus.last_checked).toLocaleString()
                : 'Never'}
            </Typography>
          )}
        </Box>
        <Box display="flex" gap={1}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
          <Button
            variant="outlined"
            startIcon={<EditIcon />}
            onClick={() => setEditingHost(true)}
          >
            Edit
          </Button>
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={() => setShowDeleteDialog(true)}
          >
            Delete
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Bridges Section */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Bridges ({bridges.length})
          </Typography>
          <BridgeVisualization
            hostId={hostId!}
            bridges={bridges}
            mirrors={mirrors}
            vms={vms}
            containers={containers}
            portMapping={null}
            onMirrorDeleted={handleMirrorDeleted}
          />
        </CardContent>
      </Card>

      {/* Mirrors Section */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Mirrors ({mirrors.length})
          </Typography>
          <MirrorList hostId={hostId!} mirrors={mirrors} onDelete={handleMirrorDeleted} />
        </CardContent>
      </Card>

      {/* Virtual Machines Section */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Virtual Machines ({vms.length})
          </Typography>
          {vms.length === 0 ? (
            <Typography color="text.secondary">No VMs found.</Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>VMID</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Bridges & Ports</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {vms.map((vm) => {
                    const portMappings = getVmPortMappings(vm.vmid);
                    const uniqueBridges = Array.from(new Set(portMappings.map(m => m.bridge)));

                    return (
                      <TableRow key={vm.vmid}>
                        <TableCell>{vm.vmid}</TableCell>
                        <TableCell>{vm.name}</TableCell>
                        <TableCell>
                          <Chip
                            label={vm.status}
                            color={vm.status === 'running' ? 'success' : 'default'}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          {portMappings.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">
                              No OVS connections
                            </Typography>
                          ) : (
                            <Box>
                              <Typography variant="body2" fontWeight={600} mb={1}>
                                Bridges: {uniqueBridges.join(', ')}
                              </Typography>
                              <Box component="ul" sx={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                {portMappings.map((mapping, idx) => (
                                  <Box component="li" key={idx} sx={{ mb: 0.5 }}>
                                    <Typography variant="body2" component="span">
                                      <Typography
                                        component="code"
                                        sx={{
                                          bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100',
                                          color: (theme) => theme.palette.text.primary,
                                          px: 0.5,
                                          py: 0.25,
                                          borderRadius: 0.5,
                                          fontSize: '0.875rem',
                                        }}
                                      >
                                        {mapping.port}
                                      </Typography>
                                      {' → '}
                                      <Chip label={mapping.bridge} size="small" sx={{ mx: 0.5 }} />
                                      <Typography component="span" color="text.secondary">
                                        ({mapping.netid})
                                      </Typography>
                                    </Typography>
                                  </Box>
                                ))}
                              </Box>
                            </Box>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {/* Linux Containers Section */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Linux Containers ({containers.length})
          </Typography>
          {containers.length === 0 ? (
            <Typography color="text.secondary">No containers found.</Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>CT ID</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Bridges & Ports</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {containers.map((container) => {
                    const portMappings = getContainerPortMappings(container.ctid);
                    const uniqueBridges = Array.from(new Set(portMappings.map(m => m.bridge)));

                    return (
                      <TableRow key={container.ctid}>
                        <TableCell>{container.ctid}</TableCell>
                        <TableCell>{container.name}</TableCell>
                        <TableCell>
                          <Chip
                            label={container.status}
                            color={container.status === 'running' ? 'success' : 'default'}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>
                          {portMappings.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">
                              No OVS connections
                            </Typography>
                          ) : (
                            <Box>
                              <Typography variant="body2" fontWeight={600} mb={1}>
                                Bridges: {uniqueBridges.join(', ')}
                              </Typography>
                              <Box component="ul" sx={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                {portMappings.map((mapping, idx) => (
                                  <Box component="li" key={idx} sx={{ mb: 0.5 }}>
                                    <Typography variant="body2" component="span">
                                      <Typography
                                        component="code"
                                        sx={{
                                          bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100',
                                          color: (theme) => theme.palette.text.primary,
                                          px: 0.5,
                                          py: 0.25,
                                          borderRadius: 0.5,
                                          fontSize: '0.875rem',
                                        }}
                                      >
                                        {mapping.port}
                                      </Typography>
                                      {' → '}
                                      <Chip label={mapping.bridge} size="small" sx={{ mx: 0.5 }} />
                                      <Typography component="span" color="text.secondary">
                                        ({mapping.netid})
                                      </Typography>
                                    </Typography>
                                  </Box>
                                ))}
                              </Box>
                            </Box>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      {/* Edit Host Modal */}
      {editingHost && host && (
        <EditHostModal
          host={host}
          onClose={() => setEditingHost(false)}
          onSuccess={() => {
            setEditingHost(false);
            loadHostInfo();
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onClose={() => setShowDeleteDialog(false)}>
        <DialogTitle>Delete Host</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete host <strong>{hostId}</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            This will remove the host configuration. Bridges and ports on the actual host will not
            be affected.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
          <Button onClick={handleDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default HostDetail;
