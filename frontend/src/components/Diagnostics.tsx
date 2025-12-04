import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Grid,
  Typography,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tabs,
  Tab,
  Alert,
  CircularProgress,
  Snackbar,
  Paper,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  useTheme,
} from '@mui/material';
import {
  PlayArrow as RunIcon,
  Refresh as RefreshIcon,
  BugReport as DiagnosticIcon,
} from '@mui/icons-material';
import { hostsApi, bridgesApi, diagnosticsApi, DiagnosticResponse, PingRequest, PacketTraceRequest } from '../services/api';
import { Host, Bridge } from '../types';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => {
  return (
    <div role="tabpanel" hidden={value !== index}>
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
};

const Diagnostics: React.FC = () => {
  const theme = useTheme();
  const [hosts, setHosts] = useState<Host[]>([]);
  const [selectedHost, setSelectedHost] = useState<string>('');
  const [bridges, setBridges] = useState<Bridge[]>([]);
  const [selectedBridge, setSelectedBridge] = useState<string>('');
  const [tabValue, setTabValue] = useState(0);

  // Result states
  const [result, setResult] = useState<DiagnosticResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });

  // Ping form
  const [pingForm, setPingForm] = useState<PingRequest>({
    target: '',
    source_ip: '',
    interface: '',
    count: 4,
    timeout: 2,
  });

  // Interface list for Network Testing
  const [interfaceList, setInterfaceList] = useState<string>('');

  // Port list for Packet Trace
  const [portList, setPortList] = useState<string>('');

  // Packet trace form
  const [traceForm, setTraceForm] = useState<PacketTraceRequest>({
    bridge: '',
    in_port: '',
    dl_src: '',
    dl_dst: '',
    dl_type: '0x0800',
    nw_src: '',
    nw_dst: '',
  });

  // Interface lookup
  const [interfaceName, setInterfaceName] = useState('');
  const [portName, setPortName] = useState('');

  useEffect(() => {
    loadHosts();
  }, []);

  useEffect(() => {
    if (selectedHost) {
      loadBridges();
    }
  }, [selectedHost]);

  useEffect(() => {
    if (selectedBridge) {
      setTraceForm({ ...traceForm, bridge: selectedBridge });
    }
  }, [selectedBridge]);

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

  const showSnackbar = (message: string, severity: 'success' | 'error') => {
    setSnackbar({ open: true, message, severity });
  };

  const runDiagnostic = async (fn: () => Promise<DiagnosticResponse>) => {
    try {
      setLoading(true);
      const response = await fn();
      setResult(response);
      if (!response.success && response.error) {
        showSnackbar('Command failed. See output below.', 'error');
      }
    } catch (error: any) {
      setResult({
        success: false,
        output: '',
        error: error.message || 'Unknown error occurred',
      });
      showSnackbar('Failed to run diagnostic', 'error');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        // Modern clipboard API
        await navigator.clipboard.writeText(text);
        showSnackbar('Copied to clipboard', 'success');
      } else {
        // Fallback for older browsers or HTTP contexts
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand('copy');
          showSnackbar('Copied to clipboard', 'success');
        } catch (err) {
          showSnackbar('Failed to copy to clipboard', 'error');
        }
        document.body.removeChild(textArea);
      }
    } catch (err) {
      showSnackbar('Failed to copy to clipboard', 'error');
    }
  };

  const ResultDisplay: React.FC<{ result: DiagnosticResponse }> = ({ result }) => (
    <Paper sx={{
      p: 2,
      mt: 2,
      bgcolor: result.success
        ? (theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100')
        : (theme.palette.mode === 'dark' ? '#5f2120' : '#ffebee'),
      color: theme.palette.text.primary,
    }}>
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
        <Chip
          label={result.success ? 'Success' : 'Failed'}
          color={result.success ? 'success' : 'error'}
          size="small"
        />
        <Button
          size="small"
          onClick={() => copyToClipboard(result.output + (result.error || ''))}
        >
          Copy to Clipboard
        </Button>
      </Box>
      <pre style={{
        fontFamily: 'monospace',
        fontSize: '12px',
        whiteSpace: 'pre-wrap',
        wordWrap: 'break-word',
        color: 'inherit',
        margin: 0,
        maxHeight: '400px',
        overflow: 'auto',
      }}>
        {result.output}
        {result.error && <div style={{ color: 'red' }}>{result.error}</div>}
      </pre>
    </Paper>
  );

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box display="flex" alignItems="center" gap={1}>
          <DiagnosticIcon fontSize="large" color="primary" />
          <Typography variant="h4" component="h1" fontWeight={600}>
            Network Diagnostics
          </Typography>
        </Box>
      </Box>

      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="body2">
          <strong>Troubleshooting Tools:</strong> Use these diagnostic tools to inspect OVS configuration,
          test connectivity, trace packets, and debug network issues. All tools used during patch port testing are available here.
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
            <InputLabel>Select Bridge (Optional)</InputLabel>
            <Select
              value={selectedBridge}
              label="Select Bridge (Optional)"
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

      <Card>
        <Tabs value={tabValue} onChange={(_, newValue) => setTabValue(newValue)} variant="scrollable" scrollButtons="auto">
          <Tab label="OVS Topology" />
          <Tab label="MAC Tables" />
          <Tab label="OpenFlow Rules" />
          <Tab label="Packet Trace" />
          <Tab label="Port Statistics" />
          <Tab label="Network Testing" />
          <Tab label="Interface Info" />
          <Tab label="OVS Command Console" />
        </Tabs>

        <CardContent>
          {/* Tab 0: OVS Topology */}
          <TabPanel value={tabValue} index={0}>
            <Typography variant="h6" gutterBottom>OVS Topology</Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              View complete OVS configuration including all bridges, ports, and interfaces
            </Typography>
            <Box display="flex" gap={2}>
              <Button
                variant="contained"
                startIcon={loading ? <CircularProgress size={20} /> : <RunIcon />}
                onClick={() => runDiagnostic(() => diagnosticsApi.getOvsTopology(selectedHost))}
                disabled={!selectedHost || loading}
              >
                Run ovs-vsctl show
              </Button>
            </Box>
            {result && <ResultDisplay result={result} />}
          </TabPanel>

          {/* Tab 1: MAC Tables */}
          <TabPanel value={tabValue} index={1}>
            <Typography variant="h6" gutterBottom>MAC Learning Tables (FDB)</Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              View MAC address learning table for a bridge to see which MACs are associated with which ports
            </Typography>
            <Box display="flex" gap={2} alignItems="flex-end">
              <Button
                variant="contained"
                startIcon={loading ? <CircularProgress size={20} /> : <RunIcon />}
                onClick={() => runDiagnostic(() => diagnosticsApi.getMacTable(selectedHost, selectedBridge))}
                disabled={!selectedHost || !selectedBridge || loading}
              >
                Get MAC Table for {selectedBridge || 'Selected Bridge'}
              </Button>
            </Box>
            {result && <ResultDisplay result={result} />}
          </TabPanel>

          {/* Tab 2: OpenFlow Rules */}
          <TabPanel value={tabValue} index={2}>
            <Typography variant="h6" gutterBottom>OpenFlow Flow Rules</Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              View OpenFlow rules and flow statistics for a bridge
            </Typography>
            <Box display="flex" gap={2} flexDirection="column">
              <Box display="flex" gap={2}>
                <Button
                  variant="contained"
                  startIcon={loading ? <CircularProgress size={20} /> : <RunIcon />}
                  onClick={() => runDiagnostic(() => diagnosticsApi.getFlows(selectedHost, selectedBridge))}
                  disabled={!selectedHost || !selectedBridge || loading}
                >
                  Dump Flows for {selectedBridge || 'Selected Bridge'}
                </Button>
                <Button
                  variant="outlined"
                  startIcon={loading ? <CircularProgress size={20} /> : <RunIcon />}
                  onClick={() => runDiagnostic(() => diagnosticsApi.getOpenFlowPorts(selectedHost, selectedBridge))}
                  disabled={!selectedHost || !selectedBridge || loading}
                >
                  OpenFlow Port Status
                </Button>
              </Box>
              <Button
                variant="outlined"
                startIcon={loading ? <CircularProgress size={20} /> : <RunIcon />}
                onClick={() => runDiagnostic(() => diagnosticsApi.getDatapathFlows(selectedHost))}
                disabled={!selectedHost || loading}
              >
                Kernel Datapath Flows
              </Button>
            </Box>
            {result && <ResultDisplay result={result} />}
          </TabPanel>

          {/* Tab 3: Packet Trace */}
          <TabPanel value={tabValue} index={3}>
            <Typography variant="h6" gutterBottom>Packet Trace Simulator</Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Simulate how a packet flows through OVS bridges - see which ports it enters, which it exits, and how flow rules process it.
            </Typography>

            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                <strong>How it works:</strong> Simulates a packet entering at "In Port" and shows the complete path through OVS.
              </Typography>
              <Typography variant="body2" component="div">
                <strong>Common scenarios:</strong>
                <ul style={{ marginTop: '4px', marginBottom: '0', paddingLeft: '20px' }}>
                  <li><strong>VM to VM on same bridge:</strong> In Port = tap100i0, Dest IP = VM2's IP</li>
                  <li><strong>VM to external network:</strong> In Port = tap100i0, Dest IP = gateway IP</li>
                  <li><strong>Across patch port:</strong> In Port = port on bridge1, check if it forwards to patch port</li>
                </ul>
              </Typography>
            </Alert>

            <Box mb={2}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={async () => {
                  if (traceForm.bridge || selectedBridge) {
                    const bridge = traceForm.bridge || selectedBridge;
                    const response = await diagnosticsApi.executeOvsVsctl(selectedHost, `list-ports ${bridge}`);
                    if (response.success) {
                      setPortList(response.output);
                    }
                  }
                }}
                disabled={!selectedHost || (!traceForm.bridge && !selectedBridge)}
              >
                Show Ports on Bridge
              </Button>
              {portList && (
                <Paper sx={{
                  p: 2,
                  mt: 1,
                  bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100',
                  color: theme.palette.text.primary,
                }}>
                  <Typography variant="caption" fontWeight={600} gutterBottom display="block">
                    Available Ports on {traceForm.bridge || selectedBridge}:
                  </Typography>
                  <pre style={{ fontFamily: 'monospace', fontSize: '11px', margin: 0, whiteSpace: 'pre-wrap', color: 'inherit' }}>
                    {portList}
                  </pre>
                  <Typography variant="caption" color="text.secondary" display="block" mt={1}>
                    Copy any port name to use as "In Port" below
                  </Typography>
                </Paper>
              )}
            </Box>

            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Bridge"
                  value={traceForm.bridge}
                  onChange={(e) => setTraceForm({ ...traceForm, bridge: e.target.value })}
                  helperText="Bridge where packet enters"
                  placeholder={selectedBridge || 'e.g., ovsbr0'}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="In Port *"
                  value={traceForm.in_port}
                  onChange={(e) => setTraceForm({ ...traceForm, in_port: e.target.value })}
                  helperText="Port where packet arrives (tap100i0, veth101i0, patch_port, etc.)"
                  required
                />
              </Grid>
              <Grid item xs={12}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Optional: Add packet details for more specific trace (IPs help show routing decisions)
                </Typography>
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Source IP (Optional)"
                  value={traceForm.nw_src}
                  onChange={(e) => setTraceForm({ ...traceForm, nw_src: e.target.value })}
                  helperText="Source IP of the simulated packet"
                  placeholder="e.g., 10.10.10.100"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Dest IP (Optional)"
                  value={traceForm.nw_dst}
                  onChange={(e) => setTraceForm({ ...traceForm, nw_dst: e.target.value })}
                  helperText="Destination IP of the simulated packet"
                  placeholder="e.g., 10.10.10.101"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Source MAC (Optional)"
                  value={traceForm.dl_src}
                  onChange={(e) => setTraceForm({ ...traceForm, dl_src: e.target.value })}
                  helperText="Source MAC address"
                  placeholder="e.g., aa:bb:cc:dd:ee:ff"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Dest MAC (Optional)"
                  value={traceForm.dl_dst}
                  onChange={(e) => setTraceForm({ ...traceForm, dl_dst: e.target.value })}
                  helperText="Dest MAC (use broadcast ff:ff:ff:ff:ff:ff to see flooding)"
                  placeholder="e.g., ff:ff:ff:ff:ff:ff"
                />
              </Grid>
            </Grid>
            <Box mt={2}>
              <Button
                variant="contained"
                startIcon={loading ? <CircularProgress size={20} /> : <RunIcon />}
                onClick={() => runDiagnostic(() => diagnosticsApi.tracePacket(selectedHost, traceForm))}
                disabled={!selectedHost || !traceForm.bridge || !traceForm.in_port || loading}
              >
                Trace Packet
              </Button>
            </Box>
            {result && <ResultDisplay result={result} />}
          </TabPanel>

          {/* Tab 4: Port Statistics */}
          <TabPanel value={tabValue} index={4}>
            <Typography variant="h6" gutterBottom>Port & Interface Statistics</Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              View packet counters and statistics for ports
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Port Name (Optional)"
                  value={portName}
                  onChange={(e) => setPortName(e.target.value)}
                  helperText="Leave empty for all ports"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Interface Name"
                  value={interfaceName}
                  onChange={(e) => setInterfaceName(e.target.value)}
                  helperText="For interface statistics lookup"
                />
              </Grid>
            </Grid>
            <Box display="flex" gap={2} mt={2}>
              <Button
                variant="contained"
                startIcon={loading ? <CircularProgress size={20} /> : <RunIcon />}
                onClick={() => runDiagnostic(() => diagnosticsApi.getPortStats(selectedHost, selectedBridge, portName || undefined))}
                disabled={!selectedHost || !selectedBridge || loading}
              >
                Port Stats (OpenFlow)
              </Button>
              <Button
                variant="outlined"
                startIcon={loading ? <CircularProgress size={20} /> : <RunIcon />}
                onClick={() => runDiagnostic(() => diagnosticsApi.getInterfaceStats(selectedHost, interfaceName))}
                disabled={!selectedHost || !interfaceName || loading}
              >
                Interface Stats (OVS)
              </Button>
            </Box>
            {result && <ResultDisplay result={result} />}
          </TabPanel>

          {/* Tab 5: Network Testing */}
          <TabPanel value={tabValue} index={5}>
            <Typography variant="h6" gutterBottom>Network Testing</Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Test connectivity and view ARP tables. Use Source IP for precise control.
            </Typography>

            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="body2" gutterBottom>
                <strong>Ping from Host Perspective:</strong> This ping runs on the Proxmox host, not inside VMs.
              </Typography>
              <Typography variant="body2" component="div">
                <strong>Source IP requirements:</strong>
                <ul style={{ marginTop: '4px', marginBottom: '4px', paddingLeft: '20px' }}>
                  <li>IP must be assigned to the host (not a VM)</li>
                  <li>Works: OVS bridge IPs, physical interface IPs (see list below)</li>
                  <li>Won't work: VM/container IPs (they exist inside the VM, not on host)</li>
                  <li>Tap/veth interfaces: No IPs on host side</li>
                </ul>
              </Typography>
              <Typography variant="body2" sx={{ mt: 1 }}>
                <strong>To test VM-to-VM or port-to-port connectivity:</strong> Use the "Packet Trace" tab to simulate
                how packets flow between interfaces through OVS, or execute ping from inside the VM using SSH/console.
              </Typography>
            </Alert>

            <Box mb={2}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<RefreshIcon />}
                onClick={async () => {
                  const response = await diagnosticsApi.getInterfacesWithIps(selectedHost);
                  if (response.success) {
                    setInterfaceList(response.output);
                  }
                }}
                disabled={!selectedHost}
              >
                Show Available Interfaces with IPs
              </Button>
              {interfaceList && (
                <Paper sx={{
                  p: 2,
                  mt: 1,
                  bgcolor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100',
                  color: theme.palette.text.primary,
                }}>
                  <Typography variant="caption" fontWeight={600} gutterBottom display="block">
                    Available Interfaces:
                  </Typography>
                  <pre style={{ fontFamily: 'monospace', fontSize: '11px', margin: 0, whiteSpace: 'pre-wrap', color: 'inherit' }}>
                    {interfaceList}
                  </pre>
                </Paper>
              )}
            </Box>

            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Ping Target"
                  value={pingForm.target}
                  onChange={(e) => setPingForm({ ...pingForm, target: e.target.value })}
                  helperText="IP address or hostname to ping"
                  required
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Source IP (Recommended)"
                  value={pingForm.source_ip}
                  onChange={(e) => setPingForm({ ...pingForm, source_ip: e.target.value })}
                  helperText="e.g., 10.10.1.1, 192.168.2.200 (takes priority over interface)"
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="Source Interface (Optional)"
                  value={pingForm.interface}
                  onChange={(e) => setPingForm({ ...pingForm, interface: e.target.value })}
                  helperText="e.g., vmbr0, int_br1 (must have IP assigned)"
                />
              </Grid>
              <Grid item xs={6} md={3}>
                <TextField
                  fullWidth
                  type="number"
                  label="Count"
                  value={pingForm.count}
                  onChange={(e) => setPingForm({ ...pingForm, count: parseInt(e.target.value) || 4 })}
                />
              </Grid>
              <Grid item xs={6} md={3}>
                <TextField
                  fullWidth
                  type="number"
                  label="Timeout (s)"
                  value={pingForm.timeout}
                  onChange={(e) => setPingForm({ ...pingForm, timeout: parseInt(e.target.value) || 2 })}
                />
              </Grid>
            </Grid>
            <Box display="flex" gap={2} mt={2}>
              <Button
                variant="contained"
                startIcon={loading ? <CircularProgress size={20} /> : <RunIcon />}
                onClick={() => runDiagnostic(() => diagnosticsApi.ping(selectedHost, pingForm))}
                disabled={!selectedHost || !pingForm.target || loading}
              >
                Run Ping
              </Button>
              <Button
                variant="outlined"
                startIcon={loading ? <CircularProgress size={20} /> : <RunIcon />}
                onClick={() => runDiagnostic(() => diagnosticsApi.getArpTable(selectedHost, pingForm.interface || undefined))}
                disabled={!selectedHost || loading}
              >
                View ARP Table
              </Button>
            </Box>
            {result && <ResultDisplay result={result} />}
          </TabPanel>

          {/* Tab 6: Interface Info */}
          <TabPanel value={tabValue} index={6}>
            <Typography variant="h6" gutterBottom>Interface Configuration</Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              View IP configuration and status of network interfaces
            </Typography>
            <TextField
              fullWidth
              label="Interface Name"
              value={interfaceName}
              onChange={(e) => setInterfaceName(e.target.value)}
              helperText="e.g., vmbr0, int_br1, tap100i0"
              sx={{ mb: 2 }}
            />
            <Button
              variant="contained"
              startIcon={loading ? <CircularProgress size={20} /> : <RunIcon />}
              onClick={() => runDiagnostic(() => diagnosticsApi.getInterfaceConfig(selectedHost, interfaceName))}
              disabled={!selectedHost || !interfaceName || loading}
            >
              Get Interface Config
            </Button>
            {result && <ResultDisplay result={result} />}
          </TabPanel>

          {/* Tab 7: OVS Command Console */}
          <TabPanel value={tabValue} index={7}>
            <Typography variant="h6" gutterBottom>OVS Command Console</Typography>
            <Typography variant="body2" color="text.secondary" mb={3}>
              Quick access to common ovs-vsctl and ovs-ofctl commands
            </Typography>

            {/* ovs-vsctl commands */}
            <Box mb={4}>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Chip label="ovs-vsctl" color="primary" size="small" />
                Bridge & Topology Commands
              </Typography>
              <Box display="flex" flexWrap="wrap" gap={1} mt={2}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={loading ? <CircularProgress size={16} /> : <RunIcon />}
                  onClick={() => runDiagnostic(() => diagnosticsApi.executeOvsVsctl(selectedHost, 'show'))}
                  disabled={!selectedHost || loading}
                >
                  show
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={loading ? <CircularProgress size={16} /> : <RunIcon />}
                  onClick={() => runDiagnostic(() => diagnosticsApi.executeOvsVsctl(selectedHost, 'list-br'))}
                  disabled={!selectedHost || loading}
                >
                  list-br
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={loading ? <CircularProgress size={16} /> : <RunIcon />}
                  onClick={() => runDiagnostic(() => diagnosticsApi.executeOvsVsctl(selectedHost, `list-ports ${selectedBridge}`))}
                  disabled={!selectedHost || !selectedBridge || loading}
                >
                  list-ports {selectedBridge || '[bridge]'}
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={loading ? <CircularProgress size={16} /> : <RunIcon />}
                  onClick={() => runDiagnostic(() => diagnosticsApi.executeOvsVsctl(selectedHost, `list-ifaces ${selectedBridge}`))}
                  disabled={!selectedHost || !selectedBridge || loading}
                >
                  list-ifaces {selectedBridge || '[bridge]'}
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={loading ? <CircularProgress size={16} /> : <RunIcon />}
                  onClick={() => runDiagnostic(() => diagnosticsApi.executeOvsVsctl(selectedHost, '--version'))}
                  disabled={!selectedHost || loading}
                >
                  --version
                </Button>
              </Box>
            </Box>

            <Box mb={4}>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Chip label="ovs-vsctl" color="primary" size="small" />
                Bridge Configuration
              </Typography>
              <Box display="flex" flexWrap="wrap" gap={1} mt={2}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={loading ? <CircularProgress size={16} /> : <RunIcon />}
                  onClick={() => runDiagnostic(() => diagnosticsApi.executeOvsVsctl(selectedHost, `get bridge ${selectedBridge} protocols`))}
                  disabled={!selectedHost || !selectedBridge || loading}
                >
                  get bridge protocols
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={loading ? <CircularProgress size={16} /> : <RunIcon />}
                  onClick={() => runDiagnostic(() => diagnosticsApi.executeOvsVsctl(selectedHost, `get bridge ${selectedBridge} datapath_type`))}
                  disabled={!selectedHost || !selectedBridge || loading}
                >
                  get bridge datapath_type
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={loading ? <CircularProgress size={16} /> : <RunIcon />}
                  onClick={() => runDiagnostic(() => diagnosticsApi.executeOvsVsctl(selectedHost, `get bridge ${selectedBridge} fail_mode`))}
                  disabled={!selectedHost || !selectedBridge || loading}
                >
                  get bridge fail_mode
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={loading ? <CircularProgress size={16} /> : <RunIcon />}
                  onClick={() => runDiagnostic(() => diagnosticsApi.executeOvsVsctl(selectedHost, `get bridge ${selectedBridge} datapath_id`))}
                  disabled={!selectedHost || !selectedBridge || loading}
                >
                  get bridge datapath_id
                </Button>
              </Box>
            </Box>

            <Box mb={4}>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Chip label="ovs-vsctl" color="primary" size="small" />
                Interface Details
              </Typography>
              <Box display="flex" flexWrap="wrap" gap={1} mt={2}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={loading ? <CircularProgress size={16} /> : <RunIcon />}
                  onClick={() => runDiagnostic(() => diagnosticsApi.executeOvsVsctl(selectedHost, 'list interface'))}
                  disabled={!selectedHost || loading}
                >
                  list interface
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={loading ? <CircularProgress size={16} /> : <RunIcon />}
                  onClick={() => runDiagnostic(() => diagnosticsApi.executeOvsVsctl(selectedHost, 'list port'))}
                  disabled={!selectedHost || loading}
                >
                  list port
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={loading ? <CircularProgress size={16} /> : <RunIcon />}
                  onClick={() => runDiagnostic(() => diagnosticsApi.executeOvsVsctl(selectedHost, 'list bridge'))}
                  disabled={!selectedHost || loading}
                >
                  list bridge
                </Button>
              </Box>
            </Box>

            <Box mb={4}>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Chip label="ovs-ofctl" color="secondary" size="small" />
                OpenFlow Commands
              </Typography>
              <Box display="flex" flexWrap="wrap" gap={1} mt={2}>
                <Button
                  variant="outlined"
                  size="small"
                  color="secondary"
                  startIcon={loading ? <CircularProgress size={16} /> : <RunIcon />}
                  onClick={() => runDiagnostic(() => diagnosticsApi.executeOvsOfctl(selectedHost, selectedBridge, 'show'))}
                  disabled={!selectedHost || !selectedBridge || loading}
                >
                  show {selectedBridge || '[bridge]'}
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  color="secondary"
                  startIcon={loading ? <CircularProgress size={16} /> : <RunIcon />}
                  onClick={() => runDiagnostic(() => diagnosticsApi.executeOvsOfctl(selectedHost, selectedBridge, 'dump-flows'))}
                  disabled={!selectedHost || !selectedBridge || loading}
                >
                  dump-flows
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  color="secondary"
                  startIcon={loading ? <CircularProgress size={16} /> : <RunIcon />}
                  onClick={() => runDiagnostic(() => diagnosticsApi.executeOvsOfctl(selectedHost, selectedBridge, 'dump-ports'))}
                  disabled={!selectedHost || !selectedBridge || loading}
                >
                  dump-ports
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  color="secondary"
                  startIcon={loading ? <CircularProgress size={16} /> : <RunIcon />}
                  onClick={() => runDiagnostic(() => diagnosticsApi.executeOvsOfctl(selectedHost, selectedBridge, 'dump-ports-desc'))}
                  disabled={!selectedHost || !selectedBridge || loading}
                >
                  dump-ports-desc
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  color="secondary"
                  startIcon={loading ? <CircularProgress size={16} /> : <RunIcon />}
                  onClick={() => runDiagnostic(() => diagnosticsApi.executeOvsOfctl(selectedHost, selectedBridge, 'dump-tables'))}
                  disabled={!selectedHost || !selectedBridge || loading}
                >
                  dump-tables
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  color="secondary"
                  startIcon={loading ? <CircularProgress size={16} /> : <RunIcon />}
                  onClick={() => runDiagnostic(() => diagnosticsApi.executeOvsOfctl(selectedHost, selectedBridge, 'dump-groups'))}
                  disabled={!selectedHost || !selectedBridge || loading}
                >
                  dump-groups
                </Button>
              </Box>
            </Box>

            {result && <ResultDisplay result={result} />}
          </TabPanel>
        </CardContent>
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

export default Diagnostics;
