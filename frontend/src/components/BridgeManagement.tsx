import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  Alert,
  FormControlLabel,
  Switch,
  Collapse,
  Tooltip,
  Tabs,
  Tab,
  Checkbox,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  CircularProgress,
  LinearProgress,
} from '@mui/material';
import {
  Add as AddIcon,
  Refresh as RefreshIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  KeyboardArrowDown as ExpandMoreIcon,
  KeyboardArrowUp as ExpandLessIcon,
  ContentCopy as CopyIcon,
  Computer as ComputerIcon,
  Storage as StorageIcon,
  RemoveCircle as RemoveCircleIcon,
} from '@mui/icons-material';
import { hostsApi, bridgesApi, vmsApi, containersApi, vmNetworkApi, cacheApi } from '../services/api';
import { Host, Bridge, BridgeDetail, VM, Container } from '../types';

interface BridgeRowProps {
  bridge: Bridge;
  vms: VM[];
  containers: Container[];
  onEdit: (bridgeName: string) => void;
  onDelete: (bridge: Bridge) => void;
  onClearMirrors: (bridge: Bridge) => void;
  onAddMachines: (bridge: Bridge) => void;
  onRefresh: () => Promise<void>;
  onShowMessage: (message: string, severity: 'success' | 'error') => void;
  selectedHost: string;
}

const BridgeRow: React.FC<BridgeRowProps> = ({ bridge, vms, containers, onEdit, onDelete, onClearMirrors, onAddMachines, onRefresh, onShowMessage, selectedHost }) => {
  const [expanded, setExpanded] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [selectedPorts, setSelectedPorts] = useState<string[]>([]);
  const [removingPorts, setRemovingPorts] = useState(false);

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const getPortTypeLabel = (type?: string): string => {
    if (!type || type === 'unknown') return 'Unknown';

    // Map technical types to user-friendly names
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

  // Build port to VM/Container mapping
  const getPortMapping = (portName: string) => {
    // Check if it's a VM tap port (format: tap{vmid}i{interface_num})
    const vmMatch = portName.match(/^tap(\d+)i(\d+)$/);
    if (vmMatch) {
      const vmid = parseInt(vmMatch[1]);
      const interfaceNum = vmMatch[2];
      const vm = vms.find(v => v.vmid === vmid);
      if (vm) {
        return { type: 'VM', id: vmid, name: vm.name, netid: `net${interfaceNum}` };
      }
    }

    // Check if it's a container veth port (format: veth{ctid}i{interface_num})
    const ctMatch = portName.match(/^veth(\d+)i(\d+)$/);
    if (ctMatch) {
      const ctid = parseInt(ctMatch[1]);
      const interfaceNum = ctMatch[2];
      const container = containers.find(c => c.ctid === ctid);
      if (container) {
        return { type: 'CT', id: ctid, name: container.name, netid: `net${interfaceNum}` };
      }
    }

    return null;
  };

  return (
    <>
      <TableRow>
        <TableCell>
          <IconButton size="small" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </TableCell>
        <TableCell>
          <Typography fontWeight={600}>{bridge.name}</Typography>
        </TableCell>
        <TableCell>
          <Chip label={bridge.ports.length} size="small" color="primary" />
        </TableCell>
        <TableCell>
          <Chip label={bridge.mirrors.length} size="small" color="secondary" />
        </TableCell>
        <TableCell>{bridge.cidr || 'N/A'}</TableCell>
        <TableCell align="right">
          <IconButton size="small" onClick={() => onEdit(bridge.name)} title="Edit">
            <EditIcon />
          </IconButton>
          {bridge.mirrors.length > 0 && (
            <Tooltip title="Clear All Mirrors (Failsafe)">
              <IconButton size="small" onClick={() => onClearMirrors(bridge)} color="warning">
                <RemoveCircleIcon />
              </IconButton>
            </Tooltip>
          )}
          <IconButton size="small" onClick={() => onDelete(bridge)} title="Delete" color="error">
            <DeleteIcon />
          </IconButton>
        </TableCell>
      </TableRow>
      <TableRow>
        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={6}>
          <Collapse in={expanded} timeout="auto" unmountOnExit>
            <Box sx={{ margin: 2 }}>
              {/* Bridge Details */}
              <Typography variant="h6" gutterBottom component="div">
                Bridge Details
              </Typography>
              <Box sx={{ mb: 3, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">
                    UUID
                  </Typography>
                  <Box display="flex" alignItems="center" gap={0.5}>
                    <Typography
                      variant="body2"
                      component="code"
                      sx={{
                        bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100',
                        color: (theme) => theme.palette.text.primary,
                        px: 1,
                        py: 0.5,
                        borderRadius: 0.5,
                        fontSize: '0.75rem',
                        fontFamily: 'monospace',
                      }}
                    >
                      {bridge.uuid}
                    </Typography>
                    <Tooltip title={copiedField === 'uuid' ? 'Copied!' : 'Copy UUID'}>
                      <IconButton
                        size="small"
                        onClick={() => handleCopy(bridge.uuid, 'uuid')}
                      >
                        <CopyIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Datapath ID
                  </Typography>
                  <Typography variant="body2">{bridge.datapath_id || 'N/A'}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Fail Mode
                  </Typography>
                  <Chip label={bridge.fail_mode || 'standalone'} size="small" />
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">
                    Datapath Type
                  </Typography>
                  <Chip label={bridge.datapath_type || 'system'} size="small" />
                </Box>
              </Box>

              {/* Configured Devices Table - Merged view of all VMs/Containers */}
              <Box>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                  <Typography variant="h6" component="div">
                    Configured Devices ({(() => {
                      const configuredVMs = vms.filter(vm =>
                        vm.interfaces.some(iface => iface.bridge === bridge.name)
                      );
                      const configuredContainers = containers.filter(ct =>
                        ct.interfaces.some(iface => iface.bridge === bridge.name)
                      );
                      return configuredVMs.length + configuredContainers.length;
                    })()})
                  </Typography>
                  <Box display="flex" gap={1}>
                    {selectedPorts.length > 0 && (
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        disabled={removingPorts}
                        startIcon={removingPorts ? <CircularProgress size={16} /> : undefined}
                        onClick={async () => {
                          setRemovingPorts(true);
                          let successCount = 0;
                          let errorCount = 0;

                          // Remove selected VM/Container network devices
                          for (const deviceKey of selectedPorts) {
                            // deviceKey format: "vm-{vmid}-{netid}" or "ct-{ctid}-{netid}"
                            const [type, id, netid] = deviceKey.split('-');
                            try {
                              if (type === 'vm') {
                                await vmNetworkApi.removeVMNetworkDevice(selectedHost, parseInt(id), netid);
                              } else if (type === 'ct') {
                                await vmNetworkApi.removeContainerNetworkDevice(selectedHost, parseInt(id), netid);
                              }
                              successCount++;
                            } catch (error) {
                              console.error(`Failed to remove ${netid}:`, error);
                              errorCount++;
                            }
                          }

                          setSelectedPorts([]);
                          setRemovingPorts(false);

                          // Show feedback immediately
                          if (errorCount === 0) {
                            onShowMessage(`Successfully removed ${successCount} device(s) from ${bridge.name}. Refreshing...`, 'success');
                          } else {
                            onShowMessage(`Removed ${successCount} device(s), ${errorCount} failed. Refreshing...`, 'error');
                          }

                          // Refresh in background (don't await - let it happen async)
                          onRefresh();
                        }}
                      >
                        {removingPorts ? 'Removing...' : `Remove Selected (${selectedPorts.length})`}
                      </Button>
                    )}
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<AddIcon />}
                      onClick={() => onAddMachines(bridge)}
                    >
                      Add VM/Container
                    </Button>
                  </Box>
                </Box>

                {(() => {
                  const configuredVMs = vms.filter(vm =>
                    vm.interfaces.some(iface => iface.bridge === bridge.name)
                  );
                  const configuredContainers = containers.filter(ct =>
                    ct.interfaces.some(iface => iface.bridge === bridge.name)
                  );
                  const totalConfigured = configuredVMs.length + configuredContainers.length;

                  if (totalConfigured === 0) {
                    return (
                      <Typography variant="body2" color="text.secondary">
                        No VMs or containers configured for this bridge
                      </Typography>
                    );
                  }

                  // Build list of all removable device keys for "select all"
                  const removableDeviceKeys: string[] = [];
                  configuredVMs.forEach(vm => {
                    vm.interfaces
                      .filter(iface => iface.bridge === bridge.name)
                      .forEach(iface => removableDeviceKeys.push(`vm-${vm.vmid}-${iface.netid}`));
                  });
                  configuredContainers.forEach(ct => {
                    ct.interfaces
                      .filter(iface => iface.bridge === bridge.name)
                      .forEach(iface => removableDeviceKeys.push(`ct-${ct.ctid}-${iface.netid}`));
                  });

                  return (
                    <TableContainer component={Paper} variant="outlined">
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell padding="checkbox">
                              {removableDeviceKeys.length > 0 && (
                                <input
                                  type="checkbox"
                                  checked={removableDeviceKeys.every(key => selectedPorts.includes(key))}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedPorts(removableDeviceKeys);
                                    } else {
                                      setSelectedPorts([]);
                                    }
                                  }}
                                />
                              )}
                            </TableCell>
                            <TableCell>Type</TableCell>
                            <TableCell>ID</TableCell>
                            <TableCell>Name</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell>Port Name</TableCell>
                            <TableCell>Port Type</TableCell>
                            <TableCell>Interface</TableCell>
                            <TableCell>VLAN</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {configuredVMs.map(vm => {
                            const vmInterfaces = vm.interfaces.filter(iface => iface.bridge === bridge.name);
                            return vmInterfaces.map((iface, idx) => {
                              const isRunning = vm.status === 'running';
                              const port = bridge.ports.find(p => p.name === iface.tap);
                              const hasActivePort = !!port;
                              const deviceKey = `vm-${vm.vmid}-${iface.netid}`;

                              return (
                                <TableRow key={`vm-${vm.vmid}-${idx}`}>
                                  <TableCell padding="checkbox">
                                    <input
                                      type="checkbox"
                                      checked={selectedPorts.includes(deviceKey)}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setSelectedPorts([...selectedPorts, deviceKey]);
                                        } else {
                                          setSelectedPorts(selectedPorts.filter(k => k !== deviceKey));
                                        }
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Chip label="VM" size="small" color="success" />
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="body2" fontWeight={600}>
                                      {vm.vmid}
                                    </Typography>
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="body2">
                                      {vm.name}
                                    </Typography>
                                  </TableCell>
                                  <TableCell>
                                    <Chip
                                      label={isRunning ? 'Running' : 'Stopped'}
                                      size="small"
                                      color={isRunning ? 'success' : 'default'}
                                      sx={{
                                        bgcolor: isRunning ? undefined : '#f8d7da',
                                        color: isRunning ? undefined : '#721c24'
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    {hasActivePort ? (
                                      <Typography
                                        component="code"
                                        sx={{
                                          bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100',
                                          px: 0.5,
                                          py: 0.25,
                                          borderRadius: 0.5,
                                          fontSize: '0.875rem',
                                        }}
                                      >
                                        {iface.tap}
                                      </Typography>
                                    ) : (
                                      <Typography variant="body2" color="text.secondary">
                                        —
                                      </Typography>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {hasActivePort && port ? (
                                      <Chip label={getPortTypeLabel(port.type)} size="small" variant="outlined" />
                                    ) : (
                                      <Typography variant="body2" color="text.secondary">
                                        —
                                      </Typography>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="body2" color="text.secondary">
                                      {iface.netid}
                                    </Typography>
                                  </TableCell>
                                  <TableCell>
                                    {hasActivePort && port ? (
                                      port.tag ? (
                                        <Chip label={`Access: ${port.tag}`} size="small" color="success" />
                                      ) : port.trunks && port.trunks.length > 0 ? (
                                        <Chip
                                          label={`Trunk: ${port.trunks.join(',')}`}
                                          size="small"
                                          color="warning"
                                        />
                                      ) : (
                                        <Typography variant="body2" color="text.secondary">
                                          No VLAN
                                        </Typography>
                                      )
                                    ) : (
                                      <Typography variant="body2" color="text.secondary">
                                        —
                                      </Typography>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            });
                          })}
                          {configuredContainers.map(ct => {
                            const ctInterfaces = ct.interfaces.filter(iface => iface.bridge === bridge.name);
                            return ctInterfaces.map((iface, idx) => {
                              const isRunning = ct.status === 'running';
                              const port = bridge.ports.find(p => p.name === iface.tap);
                              const hasActivePort = !!port;
                              const deviceKey = `ct-${ct.ctid}-${iface.netid}`;

                              return (
                                <TableRow key={`ct-${ct.ctid}-${idx}`}>
                                  <TableCell padding="checkbox">
                                    <input
                                      type="checkbox"
                                      checked={selectedPorts.includes(deviceKey)}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          setSelectedPorts([...selectedPorts, deviceKey]);
                                        } else {
                                          setSelectedPorts(selectedPorts.filter(k => k !== deviceKey));
                                        }
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Chip label="CT" size="small" color="warning" />
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="body2" fontWeight={600}>
                                      {ct.ctid}
                                    </Typography>
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="body2">
                                      {ct.name}
                                    </Typography>
                                  </TableCell>
                                  <TableCell>
                                    <Chip
                                      label={isRunning ? 'Running' : 'Stopped'}
                                      size="small"
                                      color={isRunning ? 'warning' : 'default'}
                                      sx={{
                                        bgcolor: isRunning ? undefined : '#f8d7da',
                                        color: isRunning ? undefined : '#721c24'
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    {hasActivePort ? (
                                      <Typography
                                        component="code"
                                        sx={{
                                          bgcolor: (theme) => theme.palette.mode === 'dark' ? 'grey.800' : 'grey.100',
                                          px: 0.5,
                                          py: 0.25,
                                          borderRadius: 0.5,
                                          fontSize: '0.875rem',
                                        }}
                                      >
                                        {iface.tap}
                                      </Typography>
                                    ) : (
                                      <Typography variant="body2" color="text.secondary">
                                        —
                                      </Typography>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    {hasActivePort && port ? (
                                      <Chip label={getPortTypeLabel(port.type)} size="small" variant="outlined" />
                                    ) : (
                                      <Typography variant="body2" color="text.secondary">
                                        —
                                      </Typography>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <Typography variant="body2" color="text.secondary">
                                      {iface.netid}
                                    </Typography>
                                  </TableCell>
                                  <TableCell>
                                    {hasActivePort && port ? (
                                      port.tag ? (
                                        <Chip label={`Access: ${port.tag}`} size="small" color="success" />
                                      ) : port.trunks && port.trunks.length > 0 ? (
                                        <Chip
                                          label={`Trunk: ${port.trunks.join(',')}`}
                                          size="small"
                                          color="warning"
                                        />
                                      ) : (
                                        <Typography variant="body2" color="text.secondary">
                                          No VLAN
                                        </Typography>
                                      )
                                    ) : (
                                      <Typography variant="body2" color="text.secondary">
                                        —
                                      </Typography>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            });
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  );
                })()}
              </Box>
            </Box>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
};

const BridgeManagement: React.FC = () => {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [selectedHost, setSelectedHost] = useState('');
  const [bridges, setBridges] = useState<Bridge[]>([]);
  const [vms, setVms] = useState<VM[]>([]);
  const [containers, setContainers] = useState<Container[]>([]);
  const [selectedBridge, setSelectedBridge] = useState<BridgeDetail | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [clearMirrorsDialogOpen, setClearMirrorsDialogOpen] = useState(false);
  const [addMachinesDialogOpen, setAddMachinesDialogOpen] = useState(false);
  const [targetBridge, setTargetBridge] = useState<Bridge | null>(null);
  const [selectedVMs, setSelectedVMs] = useState<number[]>([]);
  const [selectedContainers, setSelectedContainers] = useState<number[]>([]);
  const [machineType, setMachineType] = useState<'vm' | 'container'>('vm');
  const [networkConfig, setNetworkConfig] = useState({
    firewall: false,
    vlanTag: '',
    macaddr: '',
    model: 'virtio',
    ip: 'dhcp',
  });
  const [addingMachines, setAddingMachines] = useState(false);
  const [addProgress, setAddProgress] = useState({ current: 0, total: 0 });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  const [formData, setFormData] = useState({
    name: '',
    fail_mode: 'standalone',
    datapath_type: 'system',
    ipv4_cidr: '',
    ipv4_gateway: '',
    ipv6_cidr: '',
    ipv6_gateway: '',
    bridge_ports: '',
    autostart: true,
    ovs_options: '',
    comment: '',
    mtu: 1500,
    stp_enable: false,
    rstp_enable: false,
    mcast_snooping_enable: false,
  });

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    loadHosts();
  }, []);

  useEffect(() => {
    if (selectedHost) {
      loadBridges();
      loadVmsAndContainers();
    }
  }, [selectedHost]);

  // Validation helper functions
  const validateBridgeName = (name: string): string | null => {
    if (!name) return null;
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) {
      return 'Bridge name must start with a letter and contain only letters, numbers, and underscores (no hyphens)';
    }
    return null;
  };

  const validateIPv4CIDR = (cidr: string): string | null => {
    if (!cidr) return null;
    const cidrPattern = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
    if (!cidrPattern.test(cidr)) {
      return 'Invalid IPv4 CIDR format. Example: 192.168.1.1/24';
    }
    const [ip, prefix] = cidr.split('/');
    const octets = ip.split('.').map(Number);
    if (octets.some(o => o > 255)) {
      return 'Invalid IPv4 address. Octets must be 0-255';
    }
    const prefixNum = parseInt(prefix);
    if (prefixNum < 0 || prefixNum > 32) {
      return 'Invalid IPv4 prefix. Must be 0-32';
    }
    return null;
  };

  const validateIPv4Address = (ip: string): string | null => {
    if (!ip) return null;
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipPattern.test(ip)) {
      return 'Invalid IPv4 address format. Example: 192.168.1.254';
    }
    const octets = ip.split('.').map(Number);
    if (octets.some(o => o > 255)) {
      return 'Invalid IPv4 address. Octets must be 0-255';
    }
    return null;
  };

  const validateIPv6CIDR = (cidr: string): string | null => {
    if (!cidr) return null;
    const cidrPattern = /^([0-9a-fA-F:]+)\/(\d{1,3})$/;
    if (!cidrPattern.test(cidr)) {
      return 'Invalid IPv6 CIDR format. Example: fe80::1/64';
    }
    const [, prefix] = cidr.split('/');
    const prefixNum = parseInt(prefix);
    if (prefixNum < 0 || prefixNum > 128) {
      return 'Invalid IPv6 prefix. Must be 0-128';
    }
    return null;
  };

  const validateIPv6Address = (ip: string): string | null => {
    if (!ip) return null;
    const ipv6Pattern = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
    if (!ipv6Pattern.test(ip)) {
      return 'Invalid IPv6 address format. Example: fe80::1';
    }
    return null;
  };

  const validateMTU = (mtu: number): string | null => {
    if (mtu < 576 || mtu > 9000) {
      return 'MTU must be between 576 and 9000';
    }
    return null;
  };

  const validateField = (fieldName: string, value: any): string | null => {
    switch (fieldName) {
      case 'name':
        return validateBridgeName(value);
      case 'ipv4_cidr':
        return validateIPv4CIDR(value);
      case 'ipv4_gateway':
        return validateIPv4Address(value);
      case 'ipv6_cidr':
        return validateIPv6CIDR(value);
      case 'ipv6_gateway':
        return validateIPv6Address(value);
      case 'mtu':
        return validateMTU(value);
      default:
        return null;
    }
  };

  const handleFieldChange = (fieldName: string, value: any) => {
    setFormData({ ...formData, [fieldName]: value });

    // Validate the field
    const error = validateField(fieldName, value);
    setValidationErrors(prev => {
      const newErrors = { ...prev };
      if (error) {
        newErrors[fieldName] = error;
      } else {
        delete newErrors[fieldName];
      }
      return newErrors;
    });
  };

  const hasValidationErrors = (): boolean => {
    return Object.keys(validationErrors).length > 0;
  };

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

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      // Refresh only bridges, VMs, and containers cache
      await Promise.all([
        cacheApi.refreshBridges(selectedHost),
        cacheApi.refreshVMs(selectedHost),
        cacheApi.refreshContainers(selectedHost)
      ]);
      // Load data in parallel for faster refresh
      await Promise.all([
        loadBridges(),
        loadVmsAndContainers()
      ]);
      showSnackbar('Refreshed successfully', 'success');
    } catch (error) {
      showSnackbar('Failed to refresh', 'error');
    } finally {
      setIsRefreshing(false);
    }
  };

  const quickRefresh = async () => {
    try {
      setIsRefreshing(true);
      // Just reload data without invalidating cache (used after operations that already invalidate)
      await Promise.all([
        loadBridges(),
        loadVmsAndContainers()
      ]);
    } catch (error) {
      console.error('Failed to refresh data:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const loadVmsAndContainers = async () => {
    try {
      const [vmList, containerList] = await Promise.all([
        vmsApi.list(selectedHost),
        containersApi.list(selectedHost),
      ]);
      setVms(vmList);
      setContainers(containerList);
    } catch (error) {
      console.error('Failed to load VMs/containers:', error);
    }
  };

  const handleCreate = async () => {
    try {
      await bridgesApi.create(selectedHost, {
        name: formData.name,
        fail_mode: formData.fail_mode,
        datapath_type: formData.datapath_type,
        ipv4_cidr: formData.ipv4_cidr || undefined,
        ipv4_gateway: formData.ipv4_gateway || undefined,
        ipv6_cidr: formData.ipv6_cidr || undefined,
        ipv6_gateway: formData.ipv6_gateway || undefined,
        bridge_ports: formData.bridge_ports || undefined,
        autostart: formData.autostart,
        ovs_options: formData.ovs_options || undefined,
        comment: formData.comment || undefined,
        mtu: formData.mtu,
      });
      showSnackbar('Bridge created successfully and added to Proxmox', 'success');
      setCreateDialogOpen(false);
      resetForm();
      loadBridges();
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || 'Failed to create bridge';
      showSnackbar(errorMessage, 'error');
    }
  };

  const handleUpdate = async () => {
    if (!selectedBridge) return;

    try {
      await bridgesApi.update(selectedHost, selectedBridge.name, {
        fail_mode: formData.fail_mode,
        stp_enable: formData.stp_enable,
        rstp_enable: formData.rstp_enable,
        mcast_snooping_enable: formData.mcast_snooping_enable,
      });
      showSnackbar('Bridge updated successfully', 'success');
      setEditDialogOpen(false);
      loadBridges();
    } catch (error) {
      showSnackbar('Failed to update bridge', 'error');
    }
  };

  const handleDelete = async () => {
    if (!selectedBridge) return;

    try {
      await bridgesApi.delete(selectedHost, selectedBridge.name);
      showSnackbar('Bridge deleted successfully', 'success');
      setDeleteDialogOpen(false);
      setSelectedBridge(null);
      loadBridges();
    } catch (error) {
      showSnackbar('Failed to delete bridge', 'error');
    }
  };

  const openEditDialog = async (bridgeName: string) => {
    try {
      const details = await bridgesApi.get(selectedHost, bridgeName);
      setSelectedBridge(details);
      setFormData({
        ...formData,
        fail_mode: details.fail_mode || 'standalone',
        stp_enable: details.stp_enable,
        rstp_enable: details.rstp_enable,
        mcast_snooping_enable: details.mcast_snooping_enable,
      });
      setEditDialogOpen(true);
    } catch (error) {
      showSnackbar('Failed to load bridge details', 'error');
    }
  };

  const openDeleteDialog = (bridge: Bridge) => {
    setSelectedBridge(bridge as any);
    setDeleteDialogOpen(true);
  };

  const openClearMirrorsDialog = (bridge: Bridge) => {
    setSelectedBridge(bridge as any);
    setClearMirrorsDialogOpen(true);
  };

  const handleClearMirrors = async () => {
    if (!selectedBridge) return;

    try {
      await bridgesApi.clearMirrors(selectedHost, selectedBridge.name);
      showSnackbar(`All mirrors cleared from bridge ${selectedBridge.name}. Refreshing...`, 'success');
      setClearMirrorsDialogOpen(false);
      setSelectedBridge(null);

      // Refresh in background
      quickRefresh();
    } catch (error) {
      showSnackbar('Failed to clear mirrors', 'error');
    }
  };

  const openAddMachinesDialog = (bridge: Bridge) => {
    setTargetBridge(bridge);
    setSelectedVMs([]);
    setSelectedContainers([]);
    setMachineType('vm');
    setNetworkConfig({
      firewall: false,
      vlanTag: '',
      macaddr: '',
      model: 'virtio',
      ip: 'dhcp',
    });
    setAddMachinesDialogOpen(true);
  };

  const handleAddMachines = async () => {
    if (!targetBridge) return;

    const machinesToAdd = machineType === 'vm' ? selectedVMs : selectedContainers;
    if (machinesToAdd.length === 0) {
      showSnackbar('Please select at least one machine', 'error');
      return;
    }

    setAddingMachines(true);
    setAddProgress({ current: 0, total: machinesToAdd.length });

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < machinesToAdd.length; i++) {
      const machineId = machinesToAdd[i];
      setAddProgress({ current: i + 1, total: machinesToAdd.length });

      try {
        if (machineType === 'vm') {
          await vmNetworkApi.addVMNetworkDevice(selectedHost, machineId, {
            bridge: targetBridge.name,
            model: networkConfig.model,
            firewall: networkConfig.firewall,
            macaddr: networkConfig.macaddr || undefined,
            tag: networkConfig.vlanTag ? parseInt(networkConfig.vlanTag) : undefined,
          });
        } else {
          await vmNetworkApi.addContainerNetworkDevice(selectedHost, machineId, {
            bridge: targetBridge.name,
            firewall: networkConfig.firewall,
            hwaddr: networkConfig.macaddr || undefined,
            tag: networkConfig.vlanTag ? parseInt(networkConfig.vlanTag) : undefined,
            ip: networkConfig.ip || undefined,
          });
        }
        successCount++;
      } catch (error) {
        console.error(`Failed to add network device to ${machineType} ${machineId}:`, error);
        errorCount++;
      }
    }

    setAddingMachines(false);
    setAddMachinesDialogOpen(false);

    // Show feedback immediately
    if (errorCount === 0) {
      showSnackbar(`Successfully added ${successCount} ${machineType === 'vm' ? 'VM' : 'container'}(s) to ${targetBridge.name}. Refreshing...`, 'success');
    } else {
      showSnackbar(`Added ${successCount} machine(s), ${errorCount} failed. Refreshing...`, 'error');
    }

    // Refresh in background (don't await - let it happen async)
    quickRefresh();
  };

  const resetForm = () => {
    setFormData({
      name: '',
      fail_mode: 'standalone',
      datapath_type: 'system',
      ipv4_cidr: '',
      ipv4_gateway: '',
      ipv6_cidr: '',
      ipv6_gateway: '',
      bridge_ports: '',
      autostart: true,
      ovs_options: '',
      comment: '',
      mtu: 1500,
      stp_enable: false,
      rstp_enable: false,
      mcast_snooping_enable: false,
    });
    setValidationErrors({});
  };

  const showSnackbar = (message: string, severity: 'success' | 'error') => {
    setSnackbar({ open: true, message, severity });
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box display="flex" alignItems="center" gap={2}>
          <Typography variant="h4" component="h1" fontWeight={600}>
            Bridge Management
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
            Create Bridge
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

      {/* Bridges Table */}
      <Card>
        <CardContent>
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell width={60} />
                  <TableCell>Name</TableCell>
                  <TableCell>Ports</TableCell>
                  <TableCell>Mirrors</TableCell>
                  <TableCell>CIDR</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {bridges.map((bridge) => (
                  <BridgeRow
                    key={bridge.uuid}
                    bridge={bridge}
                    vms={vms}
                    containers={containers}
                    onEdit={openEditDialog}
                    onDelete={openDeleteDialog}
                    onClearMirrors={openClearMirrorsDialog}
                    onAddMachines={openAddMachinesDialog}
                    onRefresh={quickRefresh}
                    onShowMessage={showSnackbar}
                    selectedHost={selectedHost}
                  />
                ))}
                {bridges.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      <Typography color="text.secondary">No bridges found</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Create OVS Bridge</DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={2} pt={1}>
            <TextField
              label="Name"
              value={formData.name}
              onChange={(e) => handleFieldChange('name', e.target.value)}
              required
              fullWidth
              error={!!validationErrors.name}
              helperText={validationErrors.name || "Bridge name (e.g., vmbr1)"}
            />

            <Typography variant="subtitle2" color="text.secondary" mt={1}>
              IPv4 Configuration
            </Typography>
            <TextField
              label="IPv4/CIDR"
              value={formData.ipv4_cidr}
              onChange={(e) => handleFieldChange('ipv4_cidr', e.target.value)}
              fullWidth
              placeholder="10.0.0.1/24"
              error={!!validationErrors.ipv4_cidr}
              helperText={validationErrors.ipv4_cidr || "IP address with CIDR notation"}
            />
            <TextField
              label="Gateway (IPv4)"
              value={formData.ipv4_gateway}
              onChange={(e) => handleFieldChange('ipv4_gateway', e.target.value)}
              fullWidth
              placeholder="10.0.0.254"
              error={!!validationErrors.ipv4_gateway}
              helperText={validationErrors.ipv4_gateway || ""}
            />

            <Typography variant="subtitle2" color="text.secondary" mt={1}>
              IPv6 Configuration
            </Typography>
            <TextField
              label="IPv6/CIDR"
              value={formData.ipv6_cidr}
              onChange={(e) => handleFieldChange('ipv6_cidr', e.target.value)}
              fullWidth
              placeholder="fe80::1/64"
              error={!!validationErrors.ipv6_cidr}
              helperText={validationErrors.ipv6_cidr || ""}
            />
            <TextField
              label="Gateway (IPv6)"
              value={formData.ipv6_gateway}
              onChange={(e) => handleFieldChange('ipv6_gateway', e.target.value)}
              fullWidth
              error={!!validationErrors.ipv6_gateway}
              helperText={validationErrors.ipv6_gateway || ""}
            />

            <Typography variant="subtitle2" color="text.secondary" mt={1}>
              Bridge Configuration
            </Typography>
            <TextField
              label="Bridge Ports"
              value={formData.bridge_ports}
              onChange={(e) => setFormData({ ...formData, bridge_ports: e.target.value })}
              fullWidth
              placeholder="eth1 eth2"
              helperText="Space-separated physical ports to bridge (optional)"
            />
            <TextField
              label="OVS Options"
              value={formData.ovs_options}
              onChange={(e) => setFormData({ ...formData, ovs_options: e.target.value })}
              fullWidth
              placeholder="tag=100"
              helperText="Additional OVS options (optional)"
            />
            <TextField
              label="MTU"
              type="number"
              value={formData.mtu}
              onChange={(e) => handleFieldChange('mtu', parseInt(e.target.value) || 1500)}
              fullWidth
              inputProps={{ min: 576, max: 9000 }}
              error={!!validationErrors.mtu}
              helperText={validationErrors.mtu || "Standard: 1500, Jumbo: 9000"}
            />

            <FormControlLabel
              control={
                <Switch
                  checked={formData.autostart}
                  onChange={(e) => setFormData({ ...formData, autostart: e.target.checked })}
                />
              }
              label="Autostart"
            />

            <Typography variant="subtitle2" color="text.secondary" mt={1}>
              Advanced Options
            </Typography>
            <FormControl fullWidth>
              <InputLabel>Fail Mode</InputLabel>
              <Select
                value={formData.fail_mode}
                label="Fail Mode"
                onChange={(e) => setFormData({ ...formData, fail_mode: e.target.value })}
              >
                <MenuItem value="standalone">Standalone</MenuItem>
                <MenuItem value="secure">Secure</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Datapath Type</InputLabel>
              <Select
                value={formData.datapath_type}
                label="Datapath Type"
                onChange={(e) => setFormData({ ...formData, datapath_type: e.target.value })}
              >
                <MenuItem value="system">System</MenuItem>
                <MenuItem value="netdev">Netdev</MenuItem>
              </Select>
            </FormControl>

            <TextField
              label="Comment"
              value={formData.comment}
              onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
              fullWidth
              multiline
              rows={2}
              helperText="Optional comment for Proxmox UI"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleCreate}
            variant="contained"
            disabled={!formData.name || hasValidationErrors()}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Bridge: {selectedBridge?.name}</DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={2} pt={1}>
            <FormControl fullWidth>
              <InputLabel>Fail Mode</InputLabel>
              <Select
                value={formData.fail_mode}
                label="Fail Mode"
                onChange={(e) => setFormData({ ...formData, fail_mode: e.target.value })}
              >
                <MenuItem value="standalone">Standalone</MenuItem>
                <MenuItem value="secure">Secure</MenuItem>
              </Select>
            </FormControl>
            <FormControlLabel
              control={
                <Switch
                  checked={formData.stp_enable}
                  onChange={(e) => setFormData({ ...formData, stp_enable: e.target.checked })}
                />
              }
              label="Enable STP"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={formData.rstp_enable}
                  onChange={(e) => setFormData({ ...formData, rstp_enable: e.target.checked })}
                />
              }
              label="Enable RSTP"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={formData.mcast_snooping_enable}
                  onChange={(e) => setFormData({ ...formData, mcast_snooping_enable: e.target.checked })}
                />
              }
              label="Enable Multicast Snooping"
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

      {/* Clear Mirrors Confirmation Dialog */}
      <Dialog open={clearMirrorsDialogOpen} onClose={() => setClearMirrorsDialogOpen(false)}>
        <DialogTitle>Clear All Mirrors</DialogTitle>
        <DialogContent>
          <Alert severity="warning">
            This will force remove <strong>all mirrors</strong> from bridge <strong>{selectedBridge?.name}</strong> using <code>ovs-vsctl clear</code>.
            Use this as a failsafe when mirrors cannot be deleted normally. This action cannot be undone.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setClearMirrorsDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleClearMirrors} variant="contained" color="warning">
            Clear All Mirrors
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Delete Bridge</DialogTitle>
        <DialogContent>
          <Alert severity="warning">
            Are you sure you want to delete bridge <strong>{selectedBridge?.name}</strong>? This action cannot be undone.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleDelete} variant="contained" color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Machines Dialog */}
      <Dialog
        open={addMachinesDialogOpen}
        onClose={() => !addingMachines && setAddMachinesDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Add {machineType === 'vm' ? 'VMs' : 'Containers'} to Bridge: {targetBridge?.name}
        </DialogTitle>
        <DialogContent>
          {addingMachines ? (
            <Box display="flex" flexDirection="column" alignItems="center" gap={2} py={4}>
              <CircularProgress />
              <Typography variant="body2" color="text.secondary">
                Adding {machineType === 'vm' ? 'VMs' : 'containers'}... {addProgress.current} of {addProgress.total}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={(addProgress.current / addProgress.total) * 100}
                sx={{ width: '100%' }}
              />
            </Box>
          ) : (
            <Box display="flex" flexDirection="column" gap={2} pt={1}>
              {/* Machine Type Tabs */}
              <Tabs
                value={machineType}
                onChange={(e, newValue) => {
                  setMachineType(newValue);
                  setSelectedVMs([]);
                  setSelectedContainers([]);
                }}
              >
                <Tab icon={<ComputerIcon />} label="Virtual Machines" value="vm" />
                <Tab icon={<StorageIcon />} label="Containers" value="container" />
              </Tabs>

              {/* Machine Selection */}
              <Box>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                  <Typography variant="subtitle2">
                    Select {machineType === 'vm' ? 'VMs' : 'Containers'}
                  </Typography>
                  <Button
                    size="small"
                    onClick={() => {
                      if (machineType === 'vm') {
                        if (selectedVMs.length === vms.length) {
                          setSelectedVMs([]);
                        } else {
                          setSelectedVMs(vms.map(vm => vm.vmid));
                        }
                      } else {
                        if (selectedContainers.length === containers.length) {
                          setSelectedContainers([]);
                        } else {
                          setSelectedContainers(containers.map(ct => ct.ctid));
                        }
                      }
                    }}
                  >
                    {machineType === 'vm'
                      ? (selectedVMs.length === vms.length ? 'Deselect All' : 'Select All')
                      : (selectedContainers.length === containers.length ? 'Deselect All' : 'Select All')
                    }
                  </Button>
                </Box>
                <Paper variant="outlined" sx={{ maxHeight: 300, overflow: 'auto' }}>
                  {machineType === 'vm' ? (
                    <List dense>
                      {vms.length === 0 ? (
                        <ListItem>
                          <ListItemText
                            primary="No VMs available"
                            secondary="All VMs may already be on this bridge"
                          />
                        </ListItem>
                      ) : (
                        vms.map((vm) => (
                          <ListItemButton
                            key={vm.vmid}
                            onClick={() => {
                              if (selectedVMs.includes(vm.vmid)) {
                                setSelectedVMs(selectedVMs.filter(id => id !== vm.vmid));
                              } else {
                                setSelectedVMs([...selectedVMs, vm.vmid]);
                              }
                            }}
                          >
                            <ListItemIcon>
                              <Checkbox
                                edge="start"
                                checked={selectedVMs.includes(vm.vmid)}
                                tabIndex={-1}
                                disableRipple
                              />
                            </ListItemIcon>
                            <ListItemText
                              primary={`${vm.name} (ID: ${vm.vmid})`}
                              secondary={`Status: ${vm.status}`}
                            />
                          </ListItemButton>
                        ))
                      )}
                    </List>
                  ) : (
                    <List dense>
                      {containers.length === 0 ? (
                        <ListItem>
                          <ListItemText
                            primary="No containers available"
                            secondary="All containers may already be on this bridge"
                          />
                        </ListItem>
                      ) : (
                        containers.map((container) => (
                          <ListItemButton
                            key={container.ctid}
                            onClick={() => {
                              if (selectedContainers.includes(container.ctid)) {
                                setSelectedContainers(selectedContainers.filter(id => id !== container.ctid));
                              } else {
                                setSelectedContainers([...selectedContainers, container.ctid]);
                              }
                            }}
                          >
                            <ListItemIcon>
                              <Checkbox
                                edge="start"
                                checked={selectedContainers.includes(container.ctid)}
                                tabIndex={-1}
                                disableRipple
                              />
                            </ListItemIcon>
                            <ListItemText
                              primary={`${container.name} (ID: ${container.ctid})`}
                              secondary={`Status: ${container.status}`}
                            />
                          </ListItemButton>
                        ))
                      )}
                    </List>
                  )}
                </Paper>
              </Box>

              {/* Network Configuration */}
              <Typography variant="subtitle2" mt={1}>
                Network Configuration
              </Typography>

              <FormControlLabel
                control={
                  <Switch
                    checked={networkConfig.firewall}
                    onChange={(e) => setNetworkConfig({ ...networkConfig, firewall: e.target.checked })}
                  />
                }
                label="Enable Firewall"
              />

              <TextField
                label="VLAN Tag (Optional)"
                type="number"
                value={networkConfig.vlanTag}
                onChange={(e) => setNetworkConfig({ ...networkConfig, vlanTag: e.target.value })}
                fullWidth
                size="small"
                placeholder="e.g., 100"
                helperText="Leave empty for no VLAN tagging"
              />

              <TextField
                label="MAC Address (Optional)"
                value={networkConfig.macaddr}
                onChange={(e) => setNetworkConfig({ ...networkConfig, macaddr: e.target.value })}
                fullWidth
                size="small"
                placeholder="e.g., 02:00:00:00:00:01"
                helperText="Leave empty for auto-generated MAC"
              />

              {machineType === 'vm' ? (
                <FormControl fullWidth size="small">
                  <InputLabel>Network Model</InputLabel>
                  <Select
                    value={networkConfig.model}
                    label="Network Model"
                    onChange={(e) => setNetworkConfig({ ...networkConfig, model: e.target.value })}
                  >
                    <MenuItem value="virtio">VirtIO (Recommended)</MenuItem>
                    <MenuItem value="e1000">Intel E1000</MenuItem>
                    <MenuItem value="rtl8139">Realtek RTL8139</MenuItem>
                    <MenuItem value="vmxnet3">VMware vmxnet3</MenuItem>
                  </Select>
                </FormControl>
              ) : (
                <TextField
                  label="IP Configuration"
                  value={networkConfig.ip}
                  onChange={(e) => setNetworkConfig({ ...networkConfig, ip: e.target.value })}
                  fullWidth
                  size="small"
                  placeholder="dhcp or 10.0.0.2/24"
                  helperText="Use 'dhcp' for automatic, or specify IP with CIDR notation"
                />
              )}

              <Alert severity="info" sx={{ mt: 1 }}>
                {machineType === 'vm'
                  ? `${selectedVMs.length} VM(s) selected`
                  : `${selectedContainers.length} container(s) selected`
                }
              </Alert>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddMachinesDialogOpen(false)} disabled={addingMachines}>
            Cancel
          </Button>
          <Button
            onClick={handleAddMachines}
            variant="contained"
            disabled={addingMachines || (machineType === 'vm' ? selectedVMs.length === 0 : selectedContainers.length === 0)}
          >
            Add Selected
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

export default BridgeManagement;
