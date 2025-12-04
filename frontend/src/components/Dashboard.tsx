import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Grid,
  Typography,
  Button,
  CircularProgress,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import {
  Storage as StorageIcon,
  AccountTree as BridgeIcon,
  Cable as CableIcon,
  FlipToFront as MirrorIcon,
  Refresh as RefreshIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { hostsApi, bridgesApi, mirrorsApi } from '../services/api';
import { Host, HostStatus } from '../types';
import CreateHostModal from './CreateHostModal';
import EditHostModal from './EditHostModal';

interface DashboardStats {
  totalHosts: number;
  hostsWithData: number;
  totalBridges: number;
  totalPorts: number;
  totalMirrors: number;
}

const Dashboard: React.FC = () => {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [hostStatuses, setHostStatuses] = useState<Record<string, HostStatus>>({});
  const [stats, setStats] = useState<DashboardStats>({
    totalHosts: 0,
    hostsWithData: 0,
    totalBridges: 0,
    totalPorts: 0,
    totalMirrors: 0,
  });
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingHost, setEditingHost] = useState<Host | null>(null);
  const [deletingHost, setDeletingHost] = useState<Host | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadHosts();
  }, []);

  const loadHosts = async () => {
    try {
      setLoading(true);
      const hostList = await hostsApi.list();
      setHosts(hostList);

      // Load last queried time for each host (no SSH connection)
      const statuses: Record<string, HostStatus> = {};
      let hostsWithData = 0;

      for (const host of hostList) {
        try {
          const status = await hostsApi.getLastQueried(host.name);
          statuses[host.name] = status;
          if (status.last_checked) hostsWithData++;
        } catch (error) {
          statuses[host.name] = {
            host_id: host.name,
            name: host.name,
            connected: false,
            last_checked: undefined,
            error: undefined
          };
        }
      }

      setHostStatuses(statuses);

      // Aggregate bridges, ports, and mirrors across all hosts
      let totalBridges = 0;
      let totalPorts = 0;
      let totalMirrors = 0;

      for (const host of hostList) {
        try {
          const bridges = await bridgesApi.list(host.name);
          totalBridges += bridges.length;
          totalPorts += bridges.reduce((sum, bridge) => sum + bridge.ports.length, 0);

          const mirrors = await mirrorsApi.list(host.name);
          totalMirrors += mirrors.length;
        } catch (error) {
          // Host might be unreachable, skip
        }
      }

      setStats({
        totalHosts: hostList.length,
        hostsWithData,
        totalBridges,
        totalPorts,
        totalMirrors,
      });
    } catch (error) {
      console.error('Failed to load hosts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleHostCreated = () => {
    setShowCreateModal(false);
    loadHosts();
  };

  const handleDeleteHost = async (host: Host) => {
    try {
      await hostsApi.delete(host.name);
      setDeletingHost(null);
      await loadHosts();
    } catch (error) {
      console.error(`Failed to delete host ${host.name}:`, error);
    }
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
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h1" fontWeight={600}>
          Dashboard
        </Typography>
        <Box>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={loadHosts}
            sx={{ mr: 1 }}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setShowCreateModal(true)}
          >
            Add Host
          </Button>
        </Box>
      </Box>

      {/* Stats Overview */}
      <Grid container spacing={3} mb={4}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={1}>
                <StorageIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6" component="div">
                  Hosts
                </Typography>
              </Box>
              <Typography variant="h3" component="div" fontWeight={600}>
                {stats.totalHosts}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {stats.hostsWithData} with data
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={1}>
                <BridgeIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6" component="div">
                  Bridges
                </Typography>
              </Box>
              <Typography variant="h3" component="div" fontWeight={600}>
                {stats.totalBridges}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Across all hosts
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={1}>
                <CableIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6" component="div">
                  Ports
                </Typography>
              </Box>
              <Typography variant="h3" component="div" fontWeight={600}>
                {stats.totalPorts}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total configured
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" mb={1}>
                <MirrorIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6" component="div">
                  Mirrors
                </Typography>
              </Box>
              <Typography variant="h3" component="div" fontWeight={600}>
                {stats.totalMirrors}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Active mirrors
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Host Cards */}
      <Grid container spacing={3}>
        {hosts.map(host => {
          const status = hostStatuses[host.name];
          const lastQueried = status?.last_checked
            ? new Date(status.last_checked).toLocaleString()
            : 'Never';
          const hasData = !!status?.last_checked;

          return (
            <Grid item xs={12} sm={6} md={4} key={host.name}>
              <Card>
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="start" mb={2}>
                    <Box>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Name
                      </Typography>
                      <Typography variant="h6" component="h3">
                        {host.name}
                      </Typography>
                    </Box>
                    <Chip
                      label={hasData ? 'Has Data' : 'No Data'}
                      color={hasData ? 'success' : 'default'}
                      size="small"
                    />
                  </Box>
                  <Box mb={1}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Address
                    </Typography>
                    <Typography variant="body2" color="text.primary">
                      {host.hostname}:{host.port}
                    </Typography>
                  </Box>
                  {host.description && (
                    <Box mb={1}>
                      <Typography variant="caption" color="text.secondary" display="block">
                        Description
                      </Typography>
                      <Typography variant="body2" color="text.primary">
                        {host.description}
                      </Typography>
                    </Box>
                  )}
                  <Box mb={2}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Last Queried
                    </Typography>
                    <Typography variant="body2" color="text.primary">
                      {lastQueried}
                    </Typography>
                  </Box>
                  <Grid container spacing={1}>
                    <Grid item xs={12}>
                      <Button
                        variant="contained"
                        size="small"
                        fullWidth
                        onClick={() => navigate(`/hosts/${host.name}`)}
                      >
                        View Details
                      </Button>
                    </Grid>
                    <Grid item xs={6}>
                      <Button
                        variant="outlined"
                        size="small"
                        fullWidth
                        startIcon={<EditIcon />}
                        onClick={() => setEditingHost(host)}
                      >
                        Edit
                      </Button>
                    </Grid>
                    <Grid item xs={6}>
                      <Button
                        variant="outlined"
                        size="small"
                        fullWidth
                        color="error"
                        startIcon={<DeleteIcon />}
                        onClick={() => setDeletingHost(host)}
                      >
                        Delete
                      </Button>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      {showCreateModal && (
        <CreateHostModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleHostCreated}
        />
      )}

      {editingHost && (
        <EditHostModal
          host={editingHost}
          onClose={() => setEditingHost(null)}
          onSuccess={() => {
            setEditingHost(null);
            loadHosts();
          }}
        />
      )}

      {deletingHost && (
        <Dialog open={true} onClose={() => setDeletingHost(null)}>
          <DialogTitle>Delete Host</DialogTitle>
          <DialogContent>
            <Typography>
              Are you sure you want to delete host <strong>{deletingHost.name}</strong>?
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              This will remove the host configuration. Bridges and ports on the actual host will not be affected.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeletingHost(null)}>Cancel</Button>
            <Button onClick={() => handleDeleteHost(deletingHost)} color="error" variant="contained">
              Delete
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  );
};

export default Dashboard;

