import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Grid,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Button,
  CircularProgress,
  Alert,
  Chip,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
} from '@mui/icons-material';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { hostsApi, statisticsApi, StatsDelta, vmsApi, portMappingsApi, PortMapping } from '../services/api';
import { Host, VM } from '../types';
import { getPortVMInfo } from '../utils/vmMapping';

interface InterfaceData {
  name: string;
  displayName: string;
  rx_bps: number;
  tx_bps: number;
  rx_pps: number;
  tx_pps: number;
  rx_mbps: number;
  tx_mbps: number;
  vmInfo: string | null;
}

const StatisticsDashboard: React.FC = () => {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [selectedHost, setSelectedHost] = useState<string>('');
  const [deltaStats, setDeltaStats] = useState<Record<string, StatsDelta>>({});
  const [interfaceData, setInterfaceData] = useState<InterfaceData[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [vms, setVms] = useState<VM[]>([]);
  const [portMapping, setPortMapping] = useState<PortMapping | null>(null);

  useEffect(() => {
    loadHosts();
  }, []);

  useEffect(() => {
    if (selectedHost) {
      loadVMsAndMapping().then(() => {
        loadStatistics();
      });
    }
  }, [selectedHost]);

  useEffect(() => {
    if (autoRefresh && selectedHost) {
      const interval = setInterval(() => {
        loadStatistics();
      }, 5000); // Refresh every 5 seconds

      return () => clearInterval(interval);
    }
  }, [autoRefresh, selectedHost]);

  const loadHosts = async () => {
    try {
      const hostList = await hostsApi.list();
      setHosts(hostList);
      if (hostList.length > 0 && !selectedHost) {
        setSelectedHost(hostList[0].name);
      }
    } catch (error) {
      console.error('Failed to load hosts:', error);
    }
  };

  const loadVMsAndMapping = async () => {
    if (!selectedHost) return;

    try {
      const [vmList, mapping] = await Promise.all([
        vmsApi.list(selectedHost),
        portMappingsApi.get(selectedHost).catch(() => null)
      ]);
      setVms(vmList);
      setPortMapping(mapping);
    } catch (error) {
      console.error('Failed to load VMs and port mapping:', error);
    }
  };

  const loadStatistics = async () => {
    if (!selectedHost) return;

    try {
      setLoading(true);
      const delta = await statisticsApi.getDelta(selectedHost);
      setDeltaStats(delta);

      // Transform data for charts
      const data: InterfaceData[] = Object.entries(delta)
        .filter(([_, stats]) => stats.rx_bps > 0 || stats.tx_bps > 0)
        .map(([name, stats]) => {
          const vmInfo = getPortVMInfo(name, vms, portMapping);
          // Create compact display name for chart (two lines)
          let displayName = name;
          if (vmInfo) {
            // Extract just the essential info (e.g., "VM 101 (ubuntu)" instead of full string)
            const shortInfo = vmInfo.replace(/\s+-\s+\w+$/, ''); // Remove interface suffix like "- eth0"
            displayName = `${name}|${shortInfo}`; // Use | as separator for two lines
          }
          return {
            name,
            displayName,
            rx_bps: stats.rx_bps,
            tx_bps: stats.tx_bps,
            rx_pps: stats.rx_pps,
            tx_pps: stats.tx_pps,
            rx_mbps: stats.rx_bps / 1_000_000,
            tx_mbps: stats.tx_bps / 1_000_000,
            vmInfo,
          };
        })
        .sort((a, b) => (b.rx_bps + b.tx_bps) - (a.rx_bps + a.tx_bps));

      setInterfaceData(data);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('Failed to load statistics:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleResetBaseline = async () => {
    if (!selectedHost) return;

    try {
      await statisticsApi.resetBaseline(selectedHost);
      setTimeout(() => loadStatistics(), 1000); // Reload after 1 second
    } catch (error) {
      console.error('Failed to reset baseline:', error);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatBps = (bps: number): string => {
    if (bps === 0) return '0 bps';
    const k = 1000;
    const sizes = ['bps', 'Kbps', 'Mbps', 'Gbps'];
    const i = Math.floor(Math.log(bps) / Math.log(k));
    return `${(bps / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  // Custom tick component for two-line labels in chart
  const CustomTick = (props: any) => {
    const { x, y, payload } = props;
    const lines = payload.value.split('|');

    return (
      <g transform={`translate(${x},${y})`}>
        <text
          x={0}
          y={0}
          dy={16}
          textAnchor="end"
          fill="#666"
          fontSize={11}
          transform="rotate(-45)"
        >
          <tspan x={0} dy="0">{lines[0]}</tspan>
          {lines[1] && <tspan x={0} dy="12">{lines[1]}</tspan>}
        </text>
      </g>
    );
  };

  const totalRxBps = interfaceData.reduce((sum, iface) => sum + iface.rx_bps, 0);
  const totalTxBps = interfaceData.reduce((sum, iface) => sum + iface.tx_bps, 0);
  const activeInterfaces = interfaceData.length;
  const totalInterfaces = Object.keys(deltaStats).length;

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1" fontWeight={600}>
          Network Statistics
        </Typography>
        <Box display="flex" gap={1} alignItems="center">
          {lastUpdate && (
            <Typography variant="caption" color="text.secondary">
              Last updated: {lastUpdate.toLocaleTimeString()}
            </Typography>
          )}
          <Button
            variant={autoRefresh ? 'contained' : 'outlined'}
            size="small"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? 'Auto-Refresh On' : 'Auto-Refresh Off'}
          </Button>
          <Button
            variant="outlined"
            size="small"
            onClick={handleResetBaseline}
            disabled={!selectedHost}
          >
            Reset Baseline
          </Button>
          <Button
            variant="contained"
            startIcon={loading ? <CircularProgress size={16} /> : <RefreshIcon />}
            onClick={loadStatistics}
            disabled={!selectedHost || loading}
          >
            Refresh
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

      {!selectedHost && (
        <Alert severity="info">Please select a host to view statistics.</Alert>
      )}

      {selectedHost && (
        <>
          {/* Summary Stats */}
          <Grid container spacing={3} mb={4}>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" justifyContent="space-between">
                    <Box>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Total RX Rate
                      </Typography>
                      <Typography variant="h5" fontWeight={600}>
                        {formatBps(totalRxBps)}
                      </Typography>
                    </Box>
                    <TrendingDownIcon color="primary" sx={{ fontSize: 40 }} />
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" justifyContent="space-between">
                    <Box>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Total TX Rate
                      </Typography>
                      <Typography variant="h5" fontWeight={600}>
                        {formatBps(totalTxBps)}
                      </Typography>
                    </Box>
                    <TrendingUpIcon color="secondary" sx={{ fontSize: 40 }} />
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Active Interfaces
                  </Typography>
                  <Typography variant="h5" fontWeight={600}>
                    {activeInterfaces} / {totalInterfaces}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    with traffic
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Total Bandwidth
                  </Typography>
                  <Typography variant="h5" fontWeight={600}>
                    {formatBps(totalRxBps + totalTxBps)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    combined
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Bandwidth Chart */}
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Interface Bandwidth (Mbps)
              </Typography>
              {interfaceData.length > 0 ? (
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={interfaceData.slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="displayName"
                      height={150}
                      interval={0}
                      tick={<CustomTick />}
                    />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="rx_mbps" fill="#1976d2" name="RX (Mbps)" />
                    <Bar dataKey="tx_mbps" fill="#dc004e" name="TX (Mbps)" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <Alert severity="info">No active traffic detected</Alert>
              )}
            </CardContent>
          </Card>

          {/* Detailed Interface List */}
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Interface Details
              </Typography>
              <Grid container spacing={2}>
                {interfaceData.map((iface) => (
                  <Grid item xs={12} sm={6} md={4} key={iface.name}>
                    <Card variant="outlined">
                      <CardContent>
                        <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                          {iface.name}
                        </Typography>
                        {iface.vmInfo && (
                          <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                            {iface.vmInfo}
                          </Typography>
                        )}
                        <Box display="flex" flexDirection="column" gap={0.5}>
                          <Box display="flex" justifyContent="space-between">
                            <Typography variant="caption" color="text.secondary">
                              RX:
                            </Typography>
                            <Chip
                              label={formatBps(iface.rx_bps)}
                              size="small"
                              color="primary"
                              variant="outlined"
                            />
                          </Box>
                          <Box display="flex" justifyContent="space-between">
                            <Typography variant="caption" color="text.secondary">
                              TX:
                            </Typography>
                            <Chip
                              label={formatBps(iface.tx_bps)}
                              size="small"
                              color="secondary"
                              variant="outlined"
                            />
                          </Box>
                          <Box display="flex" justifyContent="space-between">
                            <Typography variant="caption" color="text.secondary">
                              Packets:
                            </Typography>
                            <Typography variant="caption">
                              {iface.rx_pps.toFixed(0)} / {iface.tx_pps.toFixed(0)} pps
                            </Typography>
                          </Box>
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>
        </>
      )}
    </Box>
  );
};

export default StatisticsDashboard;
