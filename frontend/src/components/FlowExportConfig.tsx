import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Grid,
  Typography,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Chip,
  Alert,
  Snackbar,
  Tabs,
  Tab,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  useTheme,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Save as SaveIcon,
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { hostsApi, bridgesApi, flowExportApi } from '../services/api';
import { Host, Bridge } from '../types';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => {
  return (
    <div hidden={value !== index}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
};

const FlowExportConfig: React.FC = () => {
  const theme = useTheme();
  const [hosts, setHosts] = useState<Host[]>([]);
  const [selectedHost, setSelectedHost] = useState<string>('');
  const [bridges, setBridges] = useState<Bridge[]>([]);
  const [selectedBridge, setSelectedBridge] = useState<string>('');
  const [tabValue, setTabValue] = useState(0);

  // NetFlow state
  const [netflowConfig, setNetflowConfig] = useState<any>(null);
  const [netflowForm, setNetflowForm] = useState({
    targets: '',
    active_timeout: 60,
    engine_id: 1,
  });

  // sFlow state
  const [sflowConfig, setSflowConfig] = useState<any>(null);
  const [sflowForm, setSflowForm] = useState({
    targets: '',
    sampling: 64,
    polling: 10,
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
      loadConfigurations();
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

  const loadConfigurations = async () => {
    try {
      // Load NetFlow config
      try {
        const nfConfig = await flowExportApi.getNetflowConfig(selectedHost, selectedBridge);
        setNetflowConfig(nfConfig);
      } catch {
        setNetflowConfig(null);
      }

      // Load sFlow config
      try {
        const sfConfig = await flowExportApi.getSflowConfig(selectedHost, selectedBridge);
        setSflowConfig(sfConfig);
      } catch {
        setSflowConfig(null);
      }
    } catch (error) {
      console.error('Failed to load configurations:', error);
    }
  };

  const handleNetflowSave = async () => {
    try {
      const targets = netflowForm.targets.split(',').map((t) => t.trim()).filter((t) => t);
      await flowExportApi.configureNetflow(selectedHost, selectedBridge, {
        targets,
        active_timeout: netflowForm.active_timeout,
        engine_id: netflowForm.engine_id,
      });
      showSnackbar('NetFlow configured successfully', 'success');
      loadConfigurations();
    } catch (error) {
      showSnackbar('Failed to configure NetFlow', 'error');
    }
  };

  const handleNetflowDisable = async () => {
    try {
      await flowExportApi.disableNetflow(selectedHost, selectedBridge);
      showSnackbar('NetFlow disabled successfully', 'success');
      setNetflowConfig(null);
      loadConfigurations();
    } catch (error) {
      showSnackbar('Failed to disable NetFlow', 'error');
    }
  };

  const handleSflowSave = async () => {
    try {
      const targets = sflowForm.targets.split(',').map((t) => t.trim()).filter((t) => t);
      await flowExportApi.configureSflow(selectedHost, selectedBridge, {
        targets,
        sampling: sflowForm.sampling,
        polling: sflowForm.polling,
      });
      showSnackbar('sFlow configured successfully', 'success');
      loadConfigurations();
    } catch (error) {
      showSnackbar('Failed to configure sFlow', 'error');
    }
  };

  const handleSflowDisable = async () => {
    try {
      await flowExportApi.disableSflow(selectedHost, selectedBridge);
      showSnackbar('sFlow disabled successfully', 'success');
      setSflowConfig(null);
      loadConfigurations();
    } catch (error) {
      showSnackbar('Failed to disable sFlow', 'error');
    }
  };

  const showSnackbar = (message: string, severity: 'success' | 'error') => {
    setSnackbar({ open: true, message, severity });
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1" fontWeight={600}>
          Flow Export Configuration
        </Typography>
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={loadConfigurations}
          disabled={!selectedHost || !selectedBridge}
        >
          Refresh
        </Button>
      </Box>

      {/* Setup Instructions */}
      <Accordion sx={{ mb: 3 }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Box display="flex" alignItems="center" gap={1}>
            <InfoIcon color="primary" />
            <Typography variant="h6">Flow Export Setup Guide</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Box display="flex" flexDirection="column" gap={2}>
            <Alert severity="info">
              Flow export sends network traffic metadata (not packet contents) from OVS bridges to a collector for analysis and monitoring.
            </Alert>

            <Typography variant="subtitle1" fontWeight={600}>
              Prerequisites: You Need a Flow Collector
            </Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              A flow collector is a server/VM that receives and stores flow data. You'll send flows to this collector's IP address and port.
            </Typography>

            <Divider />

            <Typography variant="subtitle1" fontWeight={600}>
              Quick Setup Options:
            </Typography>

            <Box>
              <Typography variant="subtitle2" fontWeight={600} color="primary">
                Option 1: nfdump (NetFlow Collector)
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Simple command-line NetFlow collector. Can run on a VM, container, or separate server.
              </Typography>
              <Box
                component="pre"
                sx={{
                  bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100',
                  color: theme.palette.text.primary,
                  p: 2,
                  borderRadius: 1,
                  overflow: 'auto',
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                }}
              >
{`# Install on Ubuntu/Debian VM:
sudo apt update && sudo apt install -y nfdump

# Start collector on port 2055:
nfcapd -p 2055 -l /var/log/netflow

# View flows:
nfdump -R /var/log/netflow`}
              </Box>
              <Typography variant="caption" color="text.secondary">
                Target format: &lt;collector-vm-ip&gt;:2055 (e.g., 192.168.1.100:2055)
              </Typography>
            </Box>

            <Box>
              <Typography variant="subtitle2" fontWeight={600} color="primary">
                Option 2: sflowtool (sFlow Collector)
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Lightweight sFlow collector for testing and analysis.
              </Typography>
              <Box
                component="pre"
                sx={{
                  bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100',
                  color: theme.palette.text.primary,
                  p: 2,
                  borderRadius: 1,
                  overflow: 'auto',
                  fontFamily: 'monospace',
                  fontSize: '0.875rem',
                }}
              >
{`# Install on Ubuntu/Debian VM:
sudo apt update && sudo apt install -y sflowtool

# Start collector on port 6343 (print to console):
sflowtool -p 6343

# Or save to file:
sflowtool -p 6343 -l > sflow.log`}
              </Box>
              <Typography variant="caption" color="text.secondary">
                Target format: &lt;collector-vm-ip&gt;:6343 (e.g., 192.168.1.100:6343)
              </Typography>
            </Box>

            <Box>
              <Typography variant="subtitle2" fontWeight={600} color="primary">
                Option 3: Production Collectors
              </Typography>
              <List dense>
                <ListItem>
                  <ListItemText
                    primary="ElasticFlow / Logstash"
                    secondary="Full-featured flow analysis with Elasticsearch/Kibana visualization"
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="Grafana + InfluxDB"
                    secondary="Time-series flow data with Grafana dashboards"
                  />
                </ListItem>
                <ListItem>
                  <ListItemText
                    primary="ntopng"
                    secondary="Web-based network traffic analysis and monitoring"
                  />
                </ListItem>
              </List>
            </Box>

            <Divider />

            <Typography variant="subtitle1" fontWeight={600}>
              Configuration Steps:
            </Typography>
            <List dense>
              <ListItem>
                <ListItemText
                  primary="1. Set up collector on a VM or server"
                  secondary="Use one of the options above or your preferred collector"
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="2. Ensure network connectivity"
                  secondary="Collector must be reachable from your Proxmox host (check firewall rules)"
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="3. Select host and bridge below"
                  secondary="Choose which OVS bridge to export flows from"
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="4. Enter collector IP:port in Targets field"
                  secondary="Format: 192.168.1.100:2055 for NetFlow or 192.168.1.100:6343 for sFlow"
                />
              </ListItem>
              <ListItem>
                <ListItemText
                  primary="5. Click 'Configure' to start exporting flows"
                  secondary="OVS will immediately start sending flow data to your collector"
                />
              </ListItem>
            </List>

            <Alert severity="warning" sx={{ mt: 2 }}>
              <strong>Note:</strong> Flow export uses OVS's native capabilities - no additional packages need to be installed on the Proxmox host.
              The collector can be any reachable IP (VM, container, external server, etc.).
            </Alert>
          </Box>
        </AccordionDetails>
      </Accordion>

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
                  {bridge.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
      </Grid>

      {/* Configuration Tabs */}
      <Card>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)}>
            <Tab label="NetFlow" />
            <Tab label="sFlow" />
          </Tabs>
        </Box>

        {/* NetFlow Panel */}
        <TabPanel value={tabValue} index={0}>
          {netflowConfig ? (
            <Box mb={3}>
              <Alert severity="success" sx={{ mb: 2 }}>
                NetFlow is currently <strong>enabled</strong> on this bridge
              </Alert>
              <Typography variant="subtitle2" gutterBottom>
                Current Configuration
              </Typography>
              <Box display="flex" flexDirection="column" gap={1} mb={2}>
                <Typography variant="body2">
                  <strong>Protocol:</strong> {netflowConfig.protocol || 'netflow'}
                </Typography>
                <Typography variant="body2">
                  <strong>Targets:</strong>{' '}
                  {netflowConfig.targets?.join(', ') || 'N/A'}
                </Typography>
              </Box>
              <Button
                variant="outlined"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={handleNetflowDisable}
              >
                Disable NetFlow
              </Button>
              <Divider sx={{ my: 3 }} />
            </Box>
          ) : (
            <Alert severity="info" sx={{ mb: 2 }}>
              NetFlow is currently <strong>disabled</strong> on this bridge
            </Alert>
          )}

          <Typography variant="h6" gutterBottom>
            Configure NetFlow
          </Typography>
          <Box display="flex" flexDirection="column" gap={2}>
            <TextField
              label="Targets"
              value={netflowForm.targets}
              onChange={(e) => setNetflowForm({ ...netflowForm, targets: e.target.value })}
              fullWidth
              helperText="Comma-separated IP:port (e.g., 192.168.1.100:2055, 10.0.0.1:2055)"
            />
            <TextField
              label="Active Timeout (seconds)"
              type="number"
              value={netflowForm.active_timeout}
              onChange={(e) => setNetflowForm({ ...netflowForm, active_timeout: parseInt(e.target.value) || 60 })}
              fullWidth
              helperText="Flow timeout for active connections"
            />
            <TextField
              label="Engine ID"
              type="number"
              value={netflowForm.engine_id}
              onChange={(e) => setNetflowForm({ ...netflowForm, engine_id: parseInt(e.target.value) || 1 })}
              fullWidth
              helperText="NetFlow engine identifier"
            />
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={handleNetflowSave}
              disabled={!netflowForm.targets}
            >
              Configure NetFlow
            </Button>
          </Box>
        </TabPanel>

        {/* sFlow Panel */}
        <TabPanel value={tabValue} index={1}>
          {sflowConfig ? (
            <Box mb={3}>
              <Alert severity="success" sx={{ mb: 2 }}>
                sFlow is currently <strong>enabled</strong> on this bridge
              </Alert>
              <Typography variant="subtitle2" gutterBottom>
                Current Configuration
              </Typography>
              <Box display="flex" flexDirection="column" gap={1} mb={2}>
                <Typography variant="body2">
                  <strong>Protocol:</strong> {sflowConfig.protocol || 'sflow'}
                </Typography>
                <Typography variant="body2">
                  <strong>Targets:</strong>{' '}
                  {sflowConfig.targets?.join(', ') || 'N/A'}
                </Typography>
              </Box>
              <Button
                variant="outlined"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={handleSflowDisable}
              >
                Disable sFlow
              </Button>
              <Divider sx={{ my: 3 }} />
            </Box>
          ) : (
            <Alert severity="info" sx={{ mb: 2 }}>
              sFlow is currently <strong>disabled</strong> on this bridge
            </Alert>
          )}

          <Typography variant="h6" gutterBottom>
            Configure sFlow
          </Typography>
          <Box display="flex" flexDirection="column" gap={2}>
            <TextField
              label="Targets"
              value={sflowForm.targets}
              onChange={(e) => setSflowForm({ ...sflowForm, targets: e.target.value })}
              fullWidth
              helperText="Comma-separated IP:port (e.g., 192.168.1.100:6343)"
            />
            <TextField
              label="Sampling Rate"
              type="number"
              value={sflowForm.sampling}
              onChange={(e) => setSflowForm({ ...sflowForm, sampling: parseInt(e.target.value) || 64 })}
              fullWidth
              helperText="Sample 1 out of N packets (default: 64)"
            />
            <TextField
              label="Polling Interval (seconds)"
              type="number"
              value={sflowForm.polling}
              onChange={(e) => setSflowForm({ ...sflowForm, polling: parseInt(e.target.value) || 10 })}
              fullWidth
              helperText="Counter polling interval"
            />
            <Button
              variant="contained"
              startIcon={<SaveIcon />}
              onClick={handleSflowSave}
              disabled={!sflowForm.targets}
            >
              Configure sFlow
            </Button>
          </Box>
        </TabPanel>
      </Card>

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

export default FlowExportConfig;
