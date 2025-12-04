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
  FormHelperText,
  OutlinedInput,
  Checkbox,
  ListItemText,
  useTheme,
  CircularProgress,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Info as InfoIcon,
  VerifiedUser as TestIcon,
} from '@mui/icons-material';
import { hostsApi, bridgesApi, mirrorsApi, portsApi, cacheApi } from '../services/api';
import { Host, Bridge, Mirror, Port } from '../types';

const MirrorManagement: React.FC = () => {
  const theme = useTheme();
  const [hosts, setHosts] = useState<Host[]>([]);
  const [selectedHost, setSelectedHost] = useState<string>('');
  const [bridges, setBridges] = useState<Bridge[]>([]);
  const [mirrors, setMirrors] = useState<Mirror[]>([]);
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [statsDialogOpen, setStatsDialogOpen] = useState(false);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [selectedMirror, setSelectedMirror] = useState<Mirror | null>(null);
  const [mirrorStats, setMirrorStats] = useState<any>(null);
  const [testResult, setTestResult] = useState<string>('');

  // Port selection
  const [availablePorts, setAvailablePorts] = useState<Port[]>([]);
  const [loadingPorts, setLoadingPorts] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    bridge_name: '',
    mirror_name: '',
    mode: 'dynamic' as 'dynamic' | 'manual',
    output_port: '',
    source_ports: [] as string[],
  });

  // Snackbar
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  useEffect(() => {
    loadHosts();
  }, []);

  useEffect(() => {
    if (selectedHost) {
      loadBridges();
      loadMirrors();
    }
  }, [selectedHost]);

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
    } catch (error) {
      showSnackbar('Failed to load bridges', 'error');
    }
  };

  const loadPortsForBridge = async (bridgeName: string) => {
    try {
      setLoadingPorts(true);
      const bridgeDetail = await bridgesApi.get(selectedHost, bridgeName);
      setAvailablePorts(bridgeDetail.ports || []);
    } catch (error) {
      showSnackbar('Failed to load ports for bridge', 'error');
    } finally {
      setLoadingPorts(false);
    }
  };

  const loadMirrors = async () => {
    try {
      setLoading(true);
      const mirrorList = await mirrorsApi.list(selectedHost);
      setMirrors(mirrorList);
    } catch (error) {
      showSnackbar('Failed to load mirrors', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      await cacheApi.refreshMirrors(selectedHost);
      await loadMirrors();
      showSnackbar('Mirrors refreshed successfully', 'success');
    } catch (error) {
      showSnackbar('Failed to refresh mirrors', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCreate = async () => {
    try {
      await mirrorsApi.create(selectedHost, {
        bridge_name: formData.bridge_name,
        mirror_name: formData.mirror_name,
        mode: formData.mode,
        source_ports: formData.mode === 'manual' ? formData.source_ports : undefined,
        output_port: formData.output_port,
      });
      showSnackbar('Mirror created successfully', 'success');
      setCreateDialogOpen(false);
      resetForm();
      loadMirrors();
    } catch (error) {
      showSnackbar('Failed to create mirror', 'error');
    }
  };

  const handleDelete = async () => {
    if (!selectedMirror) return;

    try {
      await mirrorsApi.delete(selectedHost, selectedMirror.uuid, selectedMirror.bridge);
      showSnackbar('Mirror deleted successfully', 'success');
      setDeleteDialogOpen(false);
      setSelectedMirror(null);
      loadMirrors();
    } catch (error) {
      showSnackbar('Failed to delete mirror', 'error');
    }
  };

  const handleClearBridgeMirrors = async (bridgeName: string) => {
    try {
      await mirrorsApi.clearBridgeMirrors(selectedHost, bridgeName);
      showSnackbar(`All mirrors cleared from bridge ${bridgeName}`, 'success');
      loadMirrors();
    } catch (error) {
      showSnackbar('Failed to clear bridge mirrors', 'error');
    }
  };

  const loadMirrorStats = async (mirror: Mirror) => {
    try {
      const stats = await mirrorsApi.getStatistics(selectedHost, mirror.name || mirror.uuid);
      setMirrorStats(stats);
      setSelectedMirror(mirror);
      setStatsDialogOpen(true);
    } catch (error) {
      showSnackbar('Failed to load mirror statistics', 'error');
    }
  };

  const openDeleteDialog = (mirror: Mirror) => {
    setSelectedMirror(mirror);
    setDeleteDialogOpen(true);
  };

  const openTestDialog = async (mirror: Mirror) => {
    setSelectedMirror(mirror);
    setTestResult('Testing mirror...');
    setTestDialogOpen(true);

    try {
      // Test the mirror by checking if it's properly configured
      const result = await mirrorsApi.testMirror(selectedHost, mirror.uuid, mirror.bridge);
      setTestResult(result.output || result.message || 'Test completed');
    } catch (error: any) {
      setTestResult(`Test failed: ${error.message || 'Unknown error'}`);
    }
  };

  const resetForm = () => {
    setFormData({
      bridge_name: '',
      mirror_name: '',
      mode: 'dynamic',
      output_port: '',
      source_ports: [],
    });
    setAvailablePorts([]);
  };

  const handleBridgeChange = async (bridgeName: string) => {
    setFormData({
      ...formData,
      bridge_name: bridgeName,
      output_port: '',
      source_ports: [],
    });
    await loadPortsForBridge(bridgeName);
  };

  const showSnackbar = (message: string, severity: 'success' | 'error') => {
    setSnackbar({ open: true, message, severity });
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box display="flex" alignItems="center" gap={2}>
          <Typography variant="h4" component="h1" fontWeight={600}>
            Mirror Management
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
            disabled={!selectedHost}
          >
            Create Mirror
          </Button>
        </Box>
      </Box>

      {/* Host Selection */}
      <Box mb={3}>
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
      </Box>

      {/* Mirrors Table */}
      <Card>
        <CardContent>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Bridge</TableCell>
                  <TableCell>UUID</TableCell>
                  <TableCell>Output Port</TableCell>
                  <TableCell>Source Ports</TableCell>
                  <TableCell>Destination Ports</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {mirrors.map((mirror) => (
                  <TableRow key={mirror.uuid}>
                    <TableCell>
                      <Typography fontWeight={600}>{mirror.name || 'Unnamed'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={mirror.bridge} size="small" color="primary" />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {mirror.uuid.substring(0, 8)}...
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {mirror.output_port ? (
                        <Chip label={mirror.output_port} size="small" color="secondary" />
                      ) : (
                        'N/A'
                      )}
                    </TableCell>
                    <TableCell>
                      {mirror.select_src_port && mirror.select_src_port.length > 0 ? (
                        <Box display="flex" gap={0.5} flexWrap="wrap">
                          {mirror.select_src_port.slice(0, 2).map((port, idx) => (
                            <Chip key={idx} label={port} size="small" />
                          ))}
                          {mirror.select_src_port.length > 2 && (
                            <Chip label={`+${mirror.select_src_port.length - 2}`} size="small" />
                          )}
                        </Box>
                      ) : mirror.select_all ? (
                        <Chip label="All" size="small" variant="outlined" />
                      ) : (
                        'N/A'
                      )}
                    </TableCell>
                    <TableCell>
                      {mirror.select_dst_port && mirror.select_dst_port.length > 0 ? (
                        <Box display="flex" gap={0.5} flexWrap="wrap">
                          {mirror.select_dst_port.slice(0, 2).map((port, idx) => (
                            <Chip key={idx} label={port} size="small" />
                          ))}
                          {mirror.select_dst_port.length > 2 && (
                            <Chip label={`+${mirror.select_dst_port.length - 2}`} size="small" />
                          )}
                        </Box>
                      ) : mirror.select_all ? (
                        <Chip label="All" size="small" variant="outlined" />
                      ) : (
                        'N/A'
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        onClick={() => loadMirrorStats(mirror)}
                        title="View Statistics"
                      >
                        <InfoIcon />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => openTestDialog(mirror)}
                        title="Test Mirror"
                        color="primary"
                      >
                        <TestIcon />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => openDeleteDialog(mirror)}
                        title="Delete"
                        color="error"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {mirrors.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      <Typography color="text.secondary">No mirrors found</Typography>
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
        <DialogTitle>Create Mirror</DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={2} pt={1}>
            <FormControl fullWidth required>
              <InputLabel>Bridge</InputLabel>
              <Select
                value={formData.bridge_name}
                label="Bridge"
                onChange={(e) => handleBridgeChange(e.target.value)}
              >
                {bridges.map((bridge) => (
                  <MenuItem key={bridge.name} value={bridge.name}>
                    {bridge.name}
                  </MenuItem>
                ))}
              </Select>
              <FormHelperText>
                Select a bridge to load available ports
              </FormHelperText>
            </FormControl>

            <TextField
              label="Mirror Name"
              value={formData.mirror_name}
              onChange={(e) => setFormData({ ...formData, mirror_name: e.target.value })}
              required
              fullWidth
            />

            <FormControl fullWidth>
              <InputLabel>Mode</InputLabel>
              <Select
                value={formData.mode}
                label="Mode"
                onChange={(e) => setFormData({ ...formData, mode: e.target.value as 'dynamic' | 'manual' })}
              >
                <MenuItem value="dynamic">Dynamic (Mirror All)</MenuItem>
                <MenuItem value="manual">Manual (Select Ports)</MenuItem>
              </Select>
              <FormHelperText>
                Dynamic mirrors all traffic, Manual requires specific source ports
              </FormHelperText>
            </FormControl>

            {formData.mode === 'manual' && (
              <FormControl fullWidth required>
                <InputLabel>Source Ports</InputLabel>
                <Select
                  multiple
                  value={formData.source_ports}
                  onChange={(e) => setFormData({ ...formData, source_ports: e.target.value as string[] })}
                  input={<OutlinedInput label="Source Ports" />}
                  renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {selected.map((value) => (
                        <Chip key={value} label={value} size="small" />
                      ))}
                    </Box>
                  )}
                  disabled={loadingPorts || availablePorts.length === 0}
                >
                  {availablePorts.map((port) => (
                    <MenuItem key={port.name} value={port.name}>
                      <Checkbox checked={formData.source_ports.includes(port.name)} />
                      <ListItemText primary={port.name} secondary={port.type} />
                    </MenuItem>
                  ))}
                </Select>
                <FormHelperText>
                  {loadingPorts ? 'Loading ports...' :
                   availablePorts.length === 0 ? 'Select a bridge to see available ports' :
                   'Select one or more ports to mirror'}
                </FormHelperText>
              </FormControl>
            )}

            <FormControl fullWidth required>
              <InputLabel>Output Port</InputLabel>
              <Select
                value={formData.output_port}
                label="Output Port"
                onChange={(e) => setFormData({ ...formData, output_port: e.target.value })}
                disabled={loadingPorts || availablePorts.length === 0}
              >
                {availablePorts.map((port) => (
                  <MenuItem key={port.name} value={port.name}>
                    {port.name} ({port.type})
                  </MenuItem>
                ))}
              </Select>
              <FormHelperText>
                {loadingPorts ? 'Loading ports...' :
                 availablePorts.length === 0 ? 'Select a bridge to see available ports' :
                 'Port to send mirrored traffic to'}
              </FormHelperText>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleCreate}
            variant="contained"
            disabled={!formData.bridge_name || !formData.mirror_name || !formData.output_port}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Statistics Dialog */}
      <Dialog open={statsDialogOpen} onClose={() => setStatsDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Mirror Statistics: {selectedMirror?.name}</DialogTitle>
        <DialogContent>
          {mirrorStats && (
            <Box pt={1}>
              {mirrorStats.statistics && Object.keys(mirrorStats.statistics).length > 0 ? (
                <Grid container spacing={2}>
                  {Object.entries(mirrorStats.statistics).map(([key, value]) => (
                    <Grid item xs={6} key={key}>
                      <Typography variant="caption" color="text.secondary">
                        {key}
                      </Typography>
                      <Typography>{String(value)}</Typography>
                    </Grid>
                  ))}
                </Grid>
              ) : (
                <Alert severity="info">No statistics available for this mirror</Alert>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStatsDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Test Mirror Dialog */}
      <Dialog open={testDialogOpen} onClose={() => setTestDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Test Mirror: {selectedMirror?.name}</DialogTitle>
        <DialogContent>
          <Box pt={1}>
            <Alert severity="info" sx={{ mb: 2 }}>
              This test verifies that the mirror is properly configured in OVS and shows the mirror configuration details.
            </Alert>
            <Paper sx={{
              p: 2,
              bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100',
              color: theme.palette.text.primary,
              fontFamily: 'monospace',
              fontSize: '0.875rem',
              whiteSpace: 'pre-wrap',
            }}>
              {testResult}
            </Paper>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTestDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Mirror</DialogTitle>
        <DialogContent>
          <Alert severity="warning">
            Are you sure you want to delete mirror <strong>{selectedMirror?.name}</strong>? This action cannot be undone.
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

export default MirrorManagement;
