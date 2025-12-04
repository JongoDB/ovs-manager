import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Grid,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Alert,
  Snackbar,
  Tabs,
  Tab,
  CircularProgress,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { hostsApi, bridgesApi, portsApi, PortDetail, cacheApi } from '../services/api';
import { Host, Bridge } from '../types';

const PortManagement: React.FC = () => {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [selectedHost, setSelectedHost] = useState<string>('');
  const [bridges, setBridges] = useState<Bridge[]>([]);
  const [selectedBridge, setSelectedBridge] = useState<string>('');
  const [ports, setPorts] = useState<PortDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const getPortTypeLabel = (type?: string): string => {
    if (!type || type === 'unknown') return 'Unknown';

    const typeMap: Record<string, string> = {
      'tap': 'Virtual NIC',
      'veth': 'Container Tunnel',
      'internal': 'Internal',
      'system': 'Physical',
      'patch': 'Patch',
      'vxlan': 'VXLAN Tunnel',
      'gre': 'GRE Tunnel',
      'geneve': 'Geneve Tunnel',
      'lisp': 'LISP Tunnel',
      'stt': 'STT Tunnel',
      'dpdk': 'DPDK',
    };

    return typeMap[type.toLowerCase()] || type;
  };

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedPort, setSelectedPort] = useState<PortDetail | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    port_type: 'internal',
    vlan_mode: 'access',
    tag: 0,
    trunks: [] as number[],
    trunkInput: '',
  });

  // Snackbar
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  useEffect(() => {
    loadHosts();
  }, []);

  useEffect(() => {
    if (selectedHost) {
      loadBridges();
    }
  }, [selectedHost]);

  useEffect(() => {
    if (selectedHost && selectedBridge) {
      loadPorts();
    }
  }, [selectedHost, selectedBridge]);

  const loadHosts = async () => {
    try {
      const hostList = await hostsApi.list();
      setHosts(hostList);
      if (hostList.length > 0 && !selectedHost) {
        setSelectedHost(hostList[0].name);
      }
    } catch (error) {
      showSnackbar('Failed to load hosts', 'error');
    }
  };

  const loadBridges = async () => {
    try {
      const bridgeList = await bridgesApi.list(selectedHost);
      setBridges(bridgeList);
      if (bridgeList.length > 0 && !selectedBridge) {
        setSelectedBridge(bridgeList[0].name);
      }
    } catch (error) {
      showSnackbar('Failed to load bridges', 'error');
    }
  };

  const loadPorts = async () => {
    try {
      setLoading(true);
      const bridge = bridges.find((b) => b.name === selectedBridge);
      if (!bridge) return;

      const portDetails = await Promise.all(
        bridge.ports.map(async (port) => {
          try {
            return await portsApi.get(selectedHost, port.name);
          } catch {
            return null;
          }
        })
      );

      setPorts(portDetails.filter((p) => p !== null) as PortDetail[]);
    } catch (error) {
      showSnackbar('Failed to load ports', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      // Refresh only bridges cache
      await cacheApi.refreshBridges(selectedHost);
      // Then reload bridges and ports in parallel
      await Promise.all([
        loadBridges(),
        selectedBridge ? loadPorts() : Promise.resolve()
      ]);
      showSnackbar('Refreshed successfully', 'success');
    } catch (error) {
      showSnackbar('Failed to refresh', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCreate = async () => {
    try {
      await portsApi.create(selectedHost, selectedBridge, {
        name: formData.name,
        port_type: formData.port_type,
      });
      showSnackbar('Port created successfully', 'success');
      setCreateDialogOpen(false);
      resetForm();
      loadBridges();
    } catch (error) {
      showSnackbar('Failed to create port', 'error');
    }
  };

  const handleUpdate = async () => {
    if (!selectedPort) return;

    try {
      const trunks = formData.trunkInput
        ? formData.trunkInput.split(',').map((v) => parseInt(v.trim())).filter((v) => !isNaN(v))
        : [];

      await portsApi.update(selectedHost, selectedPort.name, {
        tag: formData.tag || undefined,
        trunks: trunks.length > 0 ? trunks : undefined,
        vlan_mode: formData.vlan_mode,
      });
      showSnackbar('Port updated successfully', 'success');
      setEditDialogOpen(false);
      loadPorts();
    } catch (error) {
      showSnackbar('Failed to update port', 'error');
    }
  };

  const handleDelete = async () => {
    if (!selectedPort) return;

    try {
      await portsApi.delete(selectedHost, selectedPort.name, selectedBridge);
      showSnackbar('Port deleted successfully', 'success');
      setDeleteDialogOpen(false);
      setSelectedPort(null);
      loadBridges();
    } catch (error) {
      showSnackbar('Failed to delete port', 'error');
    }
  };

  const openEditDialog = (port: PortDetail) => {
    setSelectedPort(port);
    setFormData({
      ...formData,
      vlan_mode: port.vlan_mode || 'access',
      tag: port.tag || 0,
      trunks: port.trunks || [],
      trunkInput: port.trunks ? port.trunks.join(', ') : '',
    });
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (port: PortDetail) => {
    setSelectedPort(port);
    setDeleteDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      port_type: 'internal',
      vlan_mode: 'access',
      tag: 0,
      trunks: [],
      trunkInput: '',
    });
  };

  const showSnackbar = (message: string, severity: 'success' | 'error') => {
    setSnackbar({ open: true, message, severity });
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box display="flex" alignItems="center" gap={2}>
          <Typography variant="h4" component="h1" fontWeight={600}>
            Port Management
          </Typography>
          {isRefreshing && (
            <Box display="flex" alignItems="center" gap={1}>
              <CircularProgress size={20} />
              <Typography variant="body2" color="text.secondary">
                Updating...
              </Typography>
            </Box>
          )}
        </Box>
        <Box display="flex" gap={1}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleRefresh}
            disabled={!selectedHost}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
            disabled={!selectedHost || !selectedBridge}
          >
            Create Port
          </Button>
        </Box>
      </Box>

      {/* Info Banner */}
      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="body2">
          <strong>Note:</strong> To add or remove VMs/containers to/from bridges, go to the <strong>Bridge Management</strong> section.
          Virtual NIC (tap) and Container Tunnel (veth) ports are automatically created when you add VMs/containers to a bridge.
          This section is for manually managing: <strong>Internal</strong>, <strong>Patch</strong>, and <strong>Tunnel</strong> ports (VXLAN, GRE, Geneve).
        </Typography>
      </Alert>

      {/* Host and Bridge Selection */}
      <Grid container spacing={2} mb={3}>
        <Grid item xs={12} md={6}>
          <FormControl fullWidth>
            <InputLabel>Select Host</InputLabel>
            <Select
              value={selectedHost}
              label="Select Host"
              onChange={(e) => setSelectedHost(e.target.value)}
            >
              {hosts.map((host) => (
                <MenuItem key={host.name} value={host.name}>
                  {host.name} ({host.hostname})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} md={6}>
          <FormControl fullWidth disabled={!selectedHost}>
            <InputLabel>Select Bridge</InputLabel>
            <Select
              value={selectedBridge}
              label="Select Bridge"
              onChange={(e) => setSelectedBridge(e.target.value)}
            >
              {bridges.map((bridge) => (
                <MenuItem key={bridge.name} value={bridge.name}>
                  {bridge.name} ({bridge.ports.length} ports)
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
      </Grid>

      {/* Ports Table */}
      <Card>
        <CardContent>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>VLAN Mode</TableCell>
                  <TableCell>VLAN Tag</TableCell>
                  <TableCell>Trunks</TableCell>
                  <TableCell>Interfaces</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {ports.map((port) => (
                  <TableRow key={port.uuid}>
                    <TableCell>
                      <Typography fontWeight={600}>{port.name}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={getPortTypeLabel(port.interfaces[0]?.type)}
                        size="small"
                        color="primary"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      {port.vlan_mode ? (
                        <Chip label={port.vlan_mode} size="small" color="secondary" />
                      ) : (
                        'N/A'
                      )}
                    </TableCell>
                    <TableCell>
                      {port.tag ? <Chip label={port.tag} size="small" /> : 'N/A'}
                    </TableCell>
                    <TableCell>
                      {port.trunks && port.trunks.length > 0 ? (
                        <Box display="flex" gap={0.5} flexWrap="wrap">
                          {port.trunks.slice(0, 3).map((vlan) => (
                            <Chip key={vlan} label={vlan} size="small" />
                          ))}
                          {port.trunks.length > 3 && (
                            <Chip label={`+${port.trunks.length - 3}`} size="small" />
                          )}
                        </Box>
                      ) : (
                        'N/A'
                      )}
                    </TableCell>
                    <TableCell>{port.interfaces.length}</TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        onClick={() => openEditDialog(port)}
                        title="Edit VLAN"
                      >
                        <EditIcon />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => openDeleteDialog(port)}
                        title={
                          port.interfaces[0]?.type === 'tap' || port.interfaces[0]?.type === 'veth'
                            ? 'Cannot delete VM/container ports'
                            : 'Delete'
                        }
                        color="error"
                        disabled={port.interfaces[0]?.type === 'tap' || port.interfaces[0]?.type === 'veth'}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {ports.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      <Typography color="text.secondary">No ports found</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create Port on {selectedBridge}</DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={2} pt={1}>
            <TextField
              label="Port Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel>Port Type</InputLabel>
              <Select
                value={formData.port_type}
                label="Port Type"
                onChange={(e) => setFormData({ ...formData, port_type: e.target.value })}
              >
                <MenuItem value="internal">Internal</MenuItem>
                <MenuItem value="patch">Patch</MenuItem>
                <MenuItem value="vxlan">VXLAN</MenuItem>
                <MenuItem value="gre">GRE</MenuItem>
                <MenuItem value="geneve">Geneve</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate} variant="contained" disabled={!formData.name}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit VLAN Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Configure VLAN: {selectedPort?.name}</DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={2} pt={1}>
            <FormControl fullWidth>
              <InputLabel>VLAN Mode</InputLabel>
              <Select
                value={formData.vlan_mode}
                label="VLAN Mode"
                onChange={(e) => setFormData({ ...formData, vlan_mode: e.target.value })}
              >
                <MenuItem value="access">Access</MenuItem>
                <MenuItem value="trunk">Trunk</MenuItem>
                <MenuItem value="native-tagged">Native Tagged</MenuItem>
                <MenuItem value="native-untagged">Native Untagged</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="VLAN Tag"
              type="number"
              value={formData.tag}
              onChange={(e) => setFormData({ ...formData, tag: parseInt(e.target.value) || 0 })}
              fullWidth
              helperText="VLAN ID (1-4094)"
            />
            <TextField
              label="Trunk VLANs"
              value={formData.trunkInput}
              onChange={(e) => setFormData({ ...formData, trunkInput: e.target.value })}
              fullWidth
              helperText="Comma-separated VLAN IDs (e.g., 10, 20, 30)"
              disabled={formData.vlan_mode === 'access'}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleUpdate} variant="contained">
            Update
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Port</DialogTitle>
        <DialogContent>
          <Alert severity="warning">
            Are you sure you want to delete port <strong>{selectedPort?.name}</strong>? This action cannot be undone.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDelete} variant="contained" color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default PortManagement;
