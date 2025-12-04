import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Box,
  Card,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  CircularProgress,
  Alert,
} from '@mui/material';
import { Refresh as RefreshIcon, Fullscreen as FullscreenIcon, FullscreenExit as FullscreenExitIcon } from '@mui/icons-material';
import { hostsApi, bridgesApi, vmsApi, containersApi, portMappingsApi, cacheApi } from '../services/api';
import { Host, Bridge, VM, Container } from '../types';
import BridgeNode from './topology/BridgeNode';
import VMNode from './topology/VMNode';
import ContainerNode from './topology/ContainerNode';

const NetworkTopology: React.FC = () => {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [selectedHost, setSelectedHost] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const topologyContainerRef = React.useRef<HTMLDivElement>(null);

  // Define custom node types
  const nodeTypes = useMemo(
    () => ({
      bridgeNode: BridgeNode,
      vmNode: VMNode,
      containerNode: ContainerNode,
    }),
    []
  );

  useEffect(() => {
    loadHosts();
  }, []);

  useEffect(() => {
    if (selectedHost) {
      loadTopology();
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
      console.error('Failed to load hosts:', error);
    }
  };

  const loadTopology = async () => {
    if (!selectedHost) return;

    try {
      setLoading(true);

      // Load data in parallel
      const [bridges, vms, containers] = await Promise.all([
        bridgesApi.list(selectedHost),
        vmsApi.list(selectedHost),
        containersApi.list(selectedHost),
      ]);

      // Create nodes and edges
      const newNodes: Node[] = [];
      const newEdges: Edge[] = [];

      // Layout parameters
      const bridgeSpacing = 400;
      const vmContainerSpacing = 200;
      const bridgeY = 300;

      // Build maps for quick lookup
      const vmMap = new Map<number, VM>();
      vms.forEach((vm) => vmMap.set(vm.vmid, vm));

      const ctMap = new Map<number, Container>();
      containers.forEach((ct) => {
        ctMap.set(ct.ctid, ct);
      });

      // Track which VMs and containers we've already placed
      const placedVMs = new Set<number>();
      const placedCTs = new Set<number>();

      // Build a set of all configured ports (both active and inactive)
      const allConfiguredPorts = new Map<string, Array<{ name: string; uuid: string; status?: 'running' | 'stopped' | 'none' }>>();

      bridges.forEach((bridge) => {
        const portsList: Array<{ name: string; uuid: string; status?: 'running' | 'stopped' | 'none' }> = [];

        // Add active ports from bridge
        bridge.ports.forEach(p => portsList.push({ name: p.name, uuid: p.uuid }));

        // Add configured but inactive ports from stopped VMs
        vms.forEach(vm => {
          if (vm.status === 'stopped' || vm.status === 'unknown') {
            vm.interfaces.forEach(iface => {
              if (iface.bridge === bridge.name) {
                // Check if this port is already in the list
                if (!portsList.some(p => p.name === iface.tap)) {
                  portsList.push({ name: iface.tap, uuid: `stopped-${iface.tap}`, status: 'stopped' });
                }
              }
            });
          }
        });

        // Add configured but inactive ports from stopped containers
        containers.forEach(ct => {
          if (ct.status === 'stopped' || ct.status === 'unknown') {
            ct.interfaces.forEach(iface => {
              if (iface.bridge === bridge.name) {
                if (!portsList.some(p => p.name === iface.tap)) {
                  portsList.push({ name: iface.tap, uuid: `stopped-${iface.tap}`, status: 'stopped' });
                }
              }
            });
          }
        });

        allConfiguredPorts.set(bridge.name, portsList);
      });

      // Process bridges
      bridges.forEach((bridge, bridgeIdx) => {
        const bridgeX = bridgeIdx * bridgeSpacing + 200;

        // Add bridge node with custom type, including configured but inactive ports
        newNodes.push({
          id: `bridge-${bridge.name}`,
          type: 'bridgeNode',
          position: { x: bridgeX, y: bridgeY },
          data: {
            label: bridge.name,
            ports: allConfiguredPorts.get(bridge.name) || bridge.ports.map(p => ({ name: p.name, uuid: p.uuid })),
          },
        });

        let vmYOffset = 0;
        let ctYOffset = 0;

        // Process each port on this bridge
        bridge.ports.forEach((port) => {
          const portName = port.name;

          // Check if this is a VM tap interface
          const vmTapMatch = portName.match(/^tap(\d+)i\d+$/);
          if (vmTapMatch) {
            const vmid = parseInt(vmTapMatch[1]);
            const vm = vmMap.get(vmid);

            if (vm && !placedVMs.has(vmid)) {
              placedVMs.add(vmid);

              // Add VM node with custom type
              newNodes.push({
                id: `vm-${vm.vmid}`,
                type: 'vmNode',
                position: { x: bridgeX - 250, y: vmYOffset },
                data: {
                  vmid: vm.vmid,
                  name: vm.name,
                  status: vm.status,
                  interfaces: vm.interfaces,
                },
              });

              vmYOffset += vmContainerSpacing;
            }
          }

          // Check if this is a container veth interface
          const ctVethMatch = portName.match(/^veth(\d+)i\d+$/);
          if (ctVethMatch) {
            const ctid = parseInt(ctVethMatch[1]);
            const ct = ctMap.get(ctid);

            if (ct && !placedCTs.has(ctid)) {
              placedCTs.add(ctid);

              // Add container node with custom type
              newNodes.push({
                id: `ct-${ct.ctid}`,
                type: 'containerNode',
                position: { x: bridgeX + 250, y: ctYOffset },
                data: {
                  ctid: ct.ctid,
                  name: ct.name,
                  status: ct.status,
                  interfaces: ct.interfaces,
                },
              });

              ctYOffset += vmContainerSpacing;
            }
          }
        });
      });

      // Create edges connecting VM/Container interfaces to bridge ports
      bridges.forEach((bridge) => {
        bridge.ports.forEach((port) => {
          const portName = port.name;

          // VM connections
          const vmTapMatch = portName.match(/^tap(\d+)i\d+$/);
          if (vmTapMatch) {
            const vmid = parseInt(vmTapMatch[1]);
            const vm = vmMap.get(vmid);
            if (vm && placedVMs.has(vmid)) {
              newEdges.push({
                id: `edge-${portName}`,
                source: `vm-${vmid}`,
                sourceHandle: portName,
                target: `bridge-${bridge.name}`,
                targetHandle: `${portName}-in`,
                type: 'smoothstep',
                animated: false,
                style: {
                  stroke: '#4caf50',
                  strokeWidth: 2,
                },
                markerEnd: {
                  type: MarkerType.ArrowClosed,
                  color: '#4caf50',
                },
              });
            }
          }

          // Container connections
          const ctVethMatch = portName.match(/^veth(\d+)i\d+$/);
          if (ctVethMatch) {
            const ctid = parseInt(ctVethMatch[1]);
            const ct = ctMap.get(ctid);
            if (ct && placedCTs.has(ctid)) {
              newEdges.push({
                id: `edge-${portName}`,
                source: `ct-${ctid}`,
                sourceHandle: portName,
                target: `bridge-${bridge.name}`,
                targetHandle: `${portName}-in`,
                type: 'smoothstep',
                animated: false,
                style: {
                  stroke: '#ff9800',
                  strokeWidth: 2,
                },
                markerEnd: {
                  type: MarkerType.ArrowClosed,
                  color: '#ff9800',
                },
              });
            }
          }
        });

        // Add mirror edges - show device-to-device connections
        bridge.mirrors.forEach((mirror, mirrorIdx) => {
          if (!mirror.output_port) {
            return;
          }

          // Find the monitoring device (connected to output_port)
          let monitoringDeviceId: string | null = null;
          const vmTapMatch = mirror.output_port.match(/^tap(\d+)i\d+$/);
          const ctVethMatch = mirror.output_port.match(/^veth(\d+)i\d+$/);

          if (vmTapMatch) {
            const vmid = parseInt(vmTapMatch[1]);
            if (placedVMs.has(vmid)) {
              monitoringDeviceId = `vm-${vmid}`;
            }
          } else if (ctVethMatch) {
            const ctid = parseInt(ctVethMatch[1]);
            if (placedCTs.has(ctid)) {
              monitoringDeviceId = `ct-${ctid}`;
            }
          }

          if (!monitoringDeviceId) {
            return;
          }

          // Get source devices with their port names
          const sourcePorts: Array<{ deviceId: string; portName: string }> = [];

          if (mirror.select_all) {
            // Mirror all devices on this bridge
            bridge.ports.forEach((port) => {
              const portVmMatch = port.name.match(/^tap(\d+)i\d+$/);
              const portCtMatch = port.name.match(/^veth(\d+)i\d+$/);

              if (portVmMatch) {
                const vmid = parseInt(portVmMatch[1]);
                const deviceId = `vm-${vmid}`;
                if (placedVMs.has(vmid) && deviceId !== monitoringDeviceId && !sourcePorts.find(sp => sp.deviceId === deviceId && sp.portName === port.name)) {
                  sourcePorts.push({ deviceId, portName: port.name });
                }
              } else if (portCtMatch) {
                const ctid = parseInt(portCtMatch[1]);
                const deviceId = `ct-${ctid}`;
                if (placedCTs.has(ctid) && deviceId !== monitoringDeviceId && !sourcePorts.find(sp => sp.deviceId === deviceId && sp.portName === port.name)) {
                  sourcePorts.push({ deviceId, portName: port.name });
                }
              }
            });
          } else {
            // Get specific source ports
            const sourcePortNames = [
              ...(mirror.select_src_port || []),
              ...(mirror.select_dst_port || []),
            ];

            sourcePortNames.forEach((sourcePort) => {
              const sourceVmMatch = sourcePort.match(/^tap(\d+)i\d+$/);
              const sourceCtMatch = sourcePort.match(/^veth(\d+)i\d+$/);

              if (sourceVmMatch) {
                const vmid = parseInt(sourceVmMatch[1]);
                const deviceId = `vm-${vmid}`;
                if (placedVMs.has(vmid) && deviceId !== monitoringDeviceId && !sourcePorts.find(sp => sp.deviceId === deviceId && sp.portName === sourcePort)) {
                  sourcePorts.push({ deviceId, portName: sourcePort });
                }
              } else if (sourceCtMatch) {
                const ctid = parseInt(sourceCtMatch[1]);
                const deviceId = `ct-${ctid}`;
                if (placedCTs.has(ctid) && deviceId !== monitoringDeviceId && !sourcePorts.find(sp => sp.deviceId === deviceId && sp.portName === sourcePort)) {
                  sourcePorts.push({ deviceId, portName: sourcePort });
                }
              }
            });
          }

          // Create edges from source devices to monitoring device
          if (sourcePorts.length > 0) {
            sourcePorts.forEach(({ deviceId, portName }) => {
              newEdges.push({
                id: `mirror-${mirror.uuid}-${deviceId}`,
                source: deviceId,
                sourceHandle: portName,
                target: monitoringDeviceId!,
                targetHandle: mirror.output_port,
                type: 'smoothstep',
                animated: true,
                label: mirror.select_all ? `Mirror All: ${mirror.name || 'Unnamed'}` : `Mirror: ${mirror.name || 'Unnamed'}`,
                style: {
                  stroke: '#dc004e',
                  strokeWidth: 3,
                  strokeDasharray: '10,5',
                },
                markerEnd: {
                  type: MarkerType.ArrowClosed,
                  color: '#dc004e',
                },
                labelStyle: {
                  fill: '#dc004e',
                  fontWeight: 600,
                  fontSize: 10,
                },
                labelBgStyle: {
                  fill: 'white',
                  fillOpacity: 0.8,
                },
              });
            });
          }
        });
      });

      // After processing all active ports, add stopped VMs that have interfaces configured
      const bridgeMap = new Map<string, { bridge: Bridge; x: number; y: number }>();
      bridges.forEach((bridge, bridgeIdx) => {
        const bridgeX = bridgeIdx * bridgeSpacing + 200;
        const bridgeY = 250;
        bridgeMap.set(bridge.name, { bridge, x: bridgeX, y: bridgeY });
      });

      // Add stopped VMs that haven't been placed yet
      vms.forEach((vm) => {
        if (!placedVMs.has(vm.vmid) && vm.interfaces.length > 0) {
          // This VM wasn't placed (probably stopped), but has interfaces configured
          placedVMs.add(vm.vmid);

          // Place it near the first configured bridge
          const firstInterface = vm.interfaces[0];
          const bridgeName = firstInterface?.bridge;
          const bridgeInfo = bridgeMap.get(bridgeName || '');

          if (bridgeInfo) {
            const vmX = bridgeInfo.x - 250;
            const vmY = bridgeInfo.y + (placedVMs.size * 50);

            // Add the stopped VM node with red styling
            newNodes.push({
              id: `vm-${vm.vmid}`,
              type: 'vmNode',
              position: { x: vmX, y: vmY },
              data: {
                vmid: vm.vmid,
                name: vm.name || `VM ${vm.vmid}`,
                status: vm.status,
                interfaces: vm.interfaces,
              },
            });

            // Add dashed red edges for ALL stopped VM interfaces (all bridges)
            vm.interfaces.forEach((iface) => {
              // Connect to whichever bridge this interface is configured for
              newEdges.push({
                id: `edge-stopped-${iface.tap}`,
                source: `vm-${vm.vmid}`,
                sourceHandle: iface.tap,
                target: `bridge-${iface.bridge}`,
                targetHandle: `${iface.tap}-in`,
                type: 'smoothstep',
                animated: false,
                label: `Stopped (${iface.netid})`,
                style: {
                  stroke: '#f44336',
                  strokeWidth: 2,
                  strokeDasharray: '5,5',
                },
                markerEnd: {
                  type: MarkerType.ArrowClosed,
                  color: '#f44336',
                },
                labelStyle: {
                  fill: '#f44336',
                  fontWeight: 500,
                  fontSize: 10,
                },
                labelBgStyle: {
                  fill: 'white',
                  fillOpacity: 0.8,
                },
              });
            });
          }
        }
      });

      // Add stopped containers that haven't been placed yet
      containers.forEach((ct) => {
        if (!placedCTs.has(ct.ctid) && ct.interfaces.length > 0) {
          placedCTs.add(ct.ctid);

          const firstInterface = ct.interfaces[0];
          const bridgeName = firstInterface?.bridge;
          const bridgeInfo = bridgeMap.get(bridgeName || '');

          if (bridgeInfo) {
            const ctX = bridgeInfo.x - 250;
            const ctY = bridgeInfo.y + (placedCTs.size * 50) + 200;

            newNodes.push({
              id: `ct-${ct.ctid}`,
              type: 'containerNode',
              position: { x: ctX, y: ctY },
              data: {
                ctid: ct.ctid,
                name: ct.name || `CT ${ct.ctid}`,
                status: ct.status,
                interfaces: ct.interfaces,
              },
            });

            // Add dashed red edges for ALL stopped container interfaces (all bridges)
            ct.interfaces.forEach((iface) => {
              // Connect to whichever bridge this interface is configured for
              newEdges.push({
                id: `edge-stopped-${iface.tap}`,
                source: `ct-${ct.ctid}`,
                sourceHandle: iface.tap,
                target: `bridge-${iface.bridge}`,
                targetHandle: `${iface.tap}-in`,
                type: 'smoothstep',
                animated: false,
                label: `Stopped (${iface.netid})`,
                style: {
                  stroke: '#f44336',
                  strokeWidth: 2,
                  strokeDasharray: '5,5',
                },
                markerEnd: {
                  type: MarkerType.ArrowClosed,
                  color: '#f44336',
                },
                labelStyle: {
                  fill: '#f44336',
                  fontWeight: 500,
                  fontSize: 10,
                },
                labelBgStyle: {
                  fill: 'white',
                  fillOpacity: 0.8,
                },
              });
            });
          }
        }
      });

      // Build a map of port names to device status for bridge handles
      const portStatusMap = new Map<string, 'running' | 'stopped'>();
      bridges.forEach((bridge) => {
        bridge.ports.forEach((port) => {
          const portName = port.name;
          const vmMatch = portName.match(/^tap(\d+)i\d+$/);
          const ctMatch = portName.match(/^veth(\d+)i\d+$/);

          if (vmMatch) {
            const vmid = parseInt(vmMatch[1]);
            const vm = vmMap.get(vmid);
            if (vm) {
              portStatusMap.set(portName, vm.status === 'running' ? 'running' : 'stopped');
            }
          } else if (ctMatch) {
            const ctid = parseInt(ctMatch[1]);
            const ct = ctMap.get(ctid);
            if (ct) {
              portStatusMap.set(portName, ct.status === 'running' ? 'running' : 'stopped');
            }
          }
        });
      });

      // Add stopped devices to port status map for bridge handle colors
      vms.forEach((vm) => {
        if (vm.status === 'stopped') {
          vm.interfaces.forEach((iface) => {
            portStatusMap.set(iface.tap, 'stopped');
          });
        }
      });

      containers.forEach((ct) => {
        if (ct.status === 'stopped') {
          ct.interfaces.forEach((iface) => {
            portStatusMap.set(iface.tap, 'stopped');
          });
        }
      });

      // Update bridge nodes with port status
      newNodes.forEach((node) => {
        if (node.type === 'bridgeNode') {
          node.data = {
            ...node.data,
            ports: node.data.ports.map((port: any) => ({
              ...port,
              status: portStatusMap.get(port.name) || 'none',
            })),
          };
        }
      });

      setNodes(newNodes);
      setEdges(newEdges);
    } catch (error) {
      console.error('Failed to load topology:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    if (!selectedHost) return;

    try {
      setIsRefreshing(true);
      // Refresh bridges, VMs, and containers cache
      await Promise.all([
        cacheApi.refreshBridges(selectedHost),
        cacheApi.refreshVMs(selectedHost),
        cacheApi.refreshContainers(selectedHost)
      ]);
      await loadTopology();
    } catch (error) {
      console.error('Failed to refresh topology:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Fullscreen functionality
  const toggleFullscreen = async () => {
    if (!topologyContainerRef.current) return;

    try {
      if (!isFullscreen) {
        // Enter fullscreen
        if (topologyContainerRef.current.requestFullscreen) {
          await topologyContainerRef.current.requestFullscreen();
        }
        setIsFullscreen(true);
      } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
        setIsFullscreen(false);
      }
    } catch (error) {
      console.error('Error toggling fullscreen:', error);
    }
  };

  // Listen for fullscreen changes (e.g., user pressing ESC)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box display="flex" alignItems="center" gap={2}>
          <Typography variant="h4" component="h1" fontWeight={600}>
            Network Topology
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
            disabled={!selectedHost || loading}
          >
            Refresh
          </Button>
          <Button
            variant="outlined"
            startIcon={isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
            onClick={toggleFullscreen}
            disabled={!selectedHost || nodes.length === 0}
          >
            {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          </Button>
        </Box>
      </Box>

      {/* Host Selection */}
      <Box mb={3}>
        <FormControl fullWidth sx={{ maxWidth: 400 }}>
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

      {/* Legend */}
      <Card sx={{ mb: 2, p: 2 }}>
        <Box display="flex" flexDirection="column" gap={2}>
          <Box display="flex" gap={3} alignItems="center" flexWrap="wrap">
            <Typography variant="body2" fontWeight={600}>
              Legend:
            </Typography>
            <Box display="flex" alignItems="center" gap={1}>
              <Box
                sx={{
                  width: 20,
                  height: 20,
                  background: '#1976d2',
                  border: '2px solid #1565c0',
                  borderRadius: 1,
                }}
              />
              <Typography variant="body2">Bridge (with ports list)</Typography>
            </Box>
            <Box display="flex" alignItems="center" gap={1}>
              <Box
                sx={{
                  width: 20,
                  height: 20,
                  background: '#4caf50',
                  border: '2px solid #388e3c',
                  borderRadius: 1,
                }}
              />
              <Typography variant="body2">VM (with interfaces)</Typography>
            </Box>
            <Box display="flex" alignItems="center" gap={1}>
              <Box
                sx={{
                  width: 20,
                  height: 20,
                  background: '#ff9800',
                  border: '2px solid #f57c00',
                  borderRadius: 1,
                }}
              />
              <Typography variant="body2">Container (with interfaces)</Typography>
            </Box>
          </Box>
          <Box display="flex" gap={3} alignItems="center" flexWrap="wrap">
            <Typography variant="body2" fontWeight={600}>
              Bridge Ports:
            </Typography>
            <Box display="flex" alignItems="center" gap={1}>
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  background: '#4caf50',
                  borderRadius: '50%',
                  border: '1px solid white',
                }}
              />
              <Typography variant="body2">Running device connected</Typography>
            </Box>
            <Box display="flex" alignItems="center" gap={1}>
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  background: '#f44336',
                  borderRadius: '50%',
                  border: '1px solid white',
                }}
              />
              <Typography variant="body2">Stopped device connected</Typography>
            </Box>
            <Box display="flex" alignItems="center" gap={1}>
              <Box
                sx={{
                  width: 10,
                  height: 10,
                  background: '#9e9e9e',
                  borderRadius: '50%',
                  border: '1px solid white',
                }}
              />
              <Typography variant="body2">No device</Typography>
            </Box>
          </Box>
          <Box display="flex" gap={3} alignItems="center" flexWrap="wrap">
            <Typography variant="body2" fontWeight={600}>
              Connections:
            </Typography>
            <Box display="flex" alignItems="center" gap={1}>
              <Box
                sx={{
                  width: 30,
                  height: 2,
                  background: '#4caf50',
                }}
              />
              <Typography variant="body2">Running VM/Container ↔ Bridge</Typography>
            </Box>
            <Box display="flex" alignItems="center" gap={1}>
              <Box
                sx={{
                  width: 30,
                  height: 2,
                  background: '#f44336',
                  borderTop: '2px dashed #f44336',
                }}
              />
              <Typography variant="body2">Stopped VM/Container ↔ Bridge (configured)</Typography>
            </Box>
            <Box display="flex" alignItems="center" gap={1}>
              <Box
                sx={{
                  width: 30,
                  height: 3,
                  background: '#dc004e',
                  borderTop: '3px dashed #dc004e',
                }}
              />
              <Typography variant="body2">Mirror (source device → monitoring device)</Typography>
            </Box>
          </Box>
          <Typography variant="caption" color="text.secondary">
            Each node shows its ports/interfaces. Bridge ports display green dots for running devices, red dots for stopped devices. Solid green lines show running VM/container connections, dashed red lines show stopped device configurations. Magenta dashed lines show traffic mirroring.
          </Typography>
        </Box>
      </Card>

      {/* Topology Visualization */}
      <Card ref={topologyContainerRef} sx={{ height: isFullscreen ? '100vh' : 800, bgcolor: isFullscreen ? '#fafafa' : 'inherit' }}>
        {loading ? (
          <Box display="flex" justifyContent="center" alignItems="center" height="100%">
            <CircularProgress />
          </Box>
        ) : nodes.length === 0 ? (
          <Box display="flex" justifyContent="center" alignItems="center" height="100%">
            <Alert severity="info">
              No network topology data available. Select a host to view topology.
            </Alert>
          </Box>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
          >
            <Background />
            <Controls />
          </ReactFlow>
        )}
      </Card>
    </Box>
  );
};

export default NetworkTopology;
