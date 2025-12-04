import axios from 'axios';
import { Host, HostStatus, Bridge, BridgeDetail, Mirror, VM, Container } from '../types';

// Demo mode check
const IS_DEMO_MODE = process.env.REACT_APP_DEMO_MODE === 'true';

// Dynamically determine API URL based on current origin
// If accessing from host IP, use host IP for backend too
// If accessing from localhost, use localhost for backend
const getApiUrl = () => {
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }
  
  // Get current origin (e.g., http://10.10.10.102:3000 or http://localhost:3000)
  const origin = window.location.origin;
  
  // Replace port 3000 with 8000 for backend
  if (origin.includes(':3000')) {
    return origin.replace(':3000', ':8000');
  }
  
  // Fallback to localhost
  return 'http://localhost:8000';
};

const API_URL = getApiUrl();

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export interface CreateHostRequest {
  name: string;
  hostname: string;
  port: number;
  username: string;
  ssh_key_path?: string;
  password?: string;
  description?: string;
}

export interface UpdateHostRequest {
  hostname?: string;
  port?: number;
  username?: string;
  ssh_key_path?: string;
  password?: string;
  description?: string;
}

export const hostsApi = {
  list: async (): Promise<Host[]> => {
    const response = await api.get<Host[]>('/api/hosts');
    return response.data;
  },
  
  get: async (hostId: string): Promise<Host> => {
    const response = await api.get<Host>(`/api/hosts/${hostId}`);
    return response.data;
  },
  
  create: async (data: CreateHostRequest): Promise<Host> => {
    const response = await api.post<Host>('/api/hosts', data);
    return response.data;
  },
  
  update: async (hostId: string, data: UpdateHostRequest): Promise<Host> => {
    const response = await api.put<Host>(`/api/hosts/${hostId}`, data);
    return response.data;
  },
  
  delete: async (hostId: string): Promise<{ status: string; message: string }> => {
    const response = await api.delete(`/api/hosts/${hostId}`);
    return response.data;
  },
  
  getLastQueried: async (hostId: string): Promise<HostStatus> => {
    const response = await api.get<HostStatus>(`/api/hosts/${hostId}/last-queried`);
    return response.data;
  },

  refresh: async (hostId: string): Promise<{ status: string; message: string }> => {
    const response = await api.post(`/api/hosts/${hostId}/refresh`);
    return response.data;
  },
};

export const bridgesApi = {
  list: async (hostId: string): Promise<Bridge[]> => {
    const response = await api.get<Bridge[]>(`/api/hosts/${hostId}/bridges`);
    return response.data;
  },

  get: async (hostId: string, bridgeName: string): Promise<BridgeDetail> => {
    const response = await api.get<BridgeDetail>(`/api/hosts/${hostId}/bridges/${bridgeName}/details`);
    return response.data;
  },

  create: async (hostId: string, data: {
    name: string;
    fail_mode?: string;
    datapath_type?: string;
    ipv4_cidr?: string;
    ipv4_gateway?: string;
    ipv6_cidr?: string;
    ipv6_gateway?: string;
    bridge_ports?: string;
    autostart?: boolean;
    ovs_options?: string;
    comment?: string;
    mtu?: number;
  }): Promise<{ message: string }> => {
    const response = await api.post(`/api/hosts/${hostId}/bridges`, data);
    return response.data;
  },

  update: async (hostId: string, bridgeName: string, data: {
    fail_mode?: string;
    stp_enable?: boolean;
    rstp_enable?: boolean;
    mcast_snooping_enable?: boolean;
  }): Promise<{ message: string }> => {
    const response = await api.put(`/api/hosts/${hostId}/bridges/${bridgeName}`, data);
    return response.data;
  },

  delete: async (hostId: string, bridgeName: string): Promise<{ message: string }> => {
    const response = await api.delete(`/api/hosts/${hostId}/bridges/${bridgeName}`);
    return response.data;
  },

  flushFdb: async (hostId: string, bridgeName: string): Promise<{ message: string }> => {
    const response = await api.post(`/api/hosts/${hostId}/bridges/${bridgeName}/flush-fdb`);
    return response.data;
  },

  clearMirrors: async (hostId: string, bridgeName: string): Promise<{ message: string }> => {
    const response = await api.post(`/api/hosts/${hostId}/bridges/${bridgeName}/clear-mirrors`);
    return response.data;
  },
};

export const mirrorsApi = {
  list: async (hostId: string): Promise<Mirror[]> => {
    const response = await api.get<Mirror[]>(`/api/hosts/${hostId}/mirrors`);
    return response.data;
  },
  
  create: async (hostId: string, data: {
    bridge_name: string;
    mirror_name: string;
    mode: 'manual' | 'dynamic';
    source_ports?: string[];
    output_port: string;
  }): Promise<{ status: string; message: string }> => {
    const response = await api.post(`/api/hosts/${hostId}/mirrors`, data);
    return response.data;
  },
  
  clearBridgeMirrors: async (hostId: string, bridgeName: string): Promise<{ status: string; message: string }> => {
    const response = await api.post(`/api/hosts/${hostId}/mirrors/clear-bridge`, { bridge_name: bridgeName });
    return response.data;
  },
  
  getStatistics: async (hostId: string, mirrorName: string): Promise<Record<string, any>> => {
    const response = await api.get(`/api/hosts/${hostId}/mirrors/${encodeURIComponent(mirrorName)}/statistics`);
    return response.data;
  },
  
  delete: async (hostId: string, mirrorUuid: string, bridgeName: string): Promise<{ status: string; message: string }> => {
    const response = await api.delete(`/api/hosts/${hostId}/mirrors/${mirrorUuid}?bridge_name=${bridgeName}`);
    return response.data;
  },

  testMirror: async (hostId: string, mirrorUuid: string, bridgeName: string): Promise<{ status: string; message?: string; output?: string }> => {
    const response = await api.get(`/api/hosts/${hostId}/mirrors/${mirrorUuid}/test?bridge_name=${bridgeName}`);
    return response.data;
  },
};

export const vmsApi = {
  list: async (hostId: string): Promise<VM[]> => {
    const response = await api.get<VM[]>(`/api/hosts/${hostId}/vms`);
    return response.data;
  },
};

export const containersApi = {
  list: async (hostId: string): Promise<Container[]> => {
    const response = await api.get<Container[]>(`/api/hosts/${hostId}/containers`);
    return response.data;
  },
};

export const refreshApi = {
  refresh: async (hostId: string): Promise<{
    status: string;
    message: string;
    bridges_count: number;
    mirrors_count: number;
    vms_count: number;
    containers_count?: number;
    ports_mapped?: number;
  }> => {
    const response = await api.post(`/api/hosts/${hostId}/refresh`);
    return response.data;
  },
};

export const cacheApi = {
  refreshBridges: async (hostId: string): Promise<{ status: string; message: string; count: number }> => {
    const response = await api.post(`/api/hosts/${hostId}/cache/bridges/refresh`);
    return response.data;
  },

  refreshMirrors: async (hostId: string): Promise<{ status: string; message: string; count: number }> => {
    const response = await api.post(`/api/hosts/${hostId}/cache/mirrors/refresh`);
    return response.data;
  },

  refreshVMs: async (hostId: string): Promise<{ status: string; message: string; count: number }> => {
    const response = await api.post(`/api/hosts/${hostId}/cache/vms/refresh`);
    return response.data;
  },

  refreshContainers: async (hostId: string): Promise<{ status: string; message: string; count: number }> => {
    const response = await api.post(`/api/hosts/${hostId}/cache/containers/refresh`);
    return response.data;
  },

  invalidate: async (hostId: string, cacheType: 'bridges' | 'mirrors' | 'vms' | 'containers'): Promise<{ status: string; message: string; deleted: boolean }> => {
    const response = await api.delete(`/api/hosts/${hostId}/cache/${cacheType}`);
    return response.data;
  },
};

export interface PortMapping {
  host_id: string;
  hostname: string;
  last_updated: string;
  ports: Array<{
    port_name: string;
    port_uuid: string;
    bridge_name: string;
    bridge_uuid: string | null;
    vm_id: number | null;
    vm_name: string | null;
    container_id: number | null;
    container_name: string | null;
    is_container: boolean;
    interface_id: number | null;
    interface_netid: string | null;
    interface_mac: string | null;
  }>;
}

export const portMappingsApi = {
  get: async (hostId: string): Promise<PortMapping> => {
    const response = await api.get<PortMapping>(`/api/hosts/${hostId}/port-mappings`);
    return response.data;
  },

  refresh: async (hostId: string): Promise<PortMapping> => {
    const response = await api.post<PortMapping>(`/api/hosts/${hostId}/port-mappings/refresh`);
    return response.data;
  },
};

export interface InterfaceStats {
  rx_packets: number;
  rx_bytes: number;
  rx_dropped: number;
  rx_errors: number;
  tx_packets: number;
  tx_bytes: number;
  tx_dropped: number;
  tx_errors: number;
  timestamp: string;
}

export interface StatsDelta {
  rx_bps: number;
  tx_bps: number;
  rx_pps: number;
  tx_pps: number;
  rx_dropped_ps: number;
  tx_dropped_ps: number;
  rx_errors_ps: number;
  tx_errors_ps: number;
}

export const statisticsApi = {
  getAll: async (hostId: string): Promise<Record<string, InterfaceStats>> => {
    const response = await api.get(`/api/hosts/${hostId}/statistics/interfaces`);
    return response.data;
  },

  getInterface: async (hostId: string, interfaceName: string): Promise<InterfaceStats> => {
    const response = await api.get(`/api/hosts/${hostId}/statistics/interfaces/${interfaceName}`);
    return response.data;
  },

  getDelta: async (hostId: string): Promise<Record<string, StatsDelta>> => {
    const response = await api.get(`/api/hosts/${hostId}/statistics/delta`);
    return response.data;
  },

  resetBaseline: async (hostId: string): Promise<{ message: string; interfaces: string[] }> => {
    const response = await api.post(`/api/hosts/${hostId}/statistics/reset-baseline`);
    return response.data;
  },
};

export interface PortDetail {
  uuid: string;
  name: string;
  bridge: string;
  tag: number | null;
  trunks: number[] | null;
  vlan_mode: string | null;
  bond_mode: string | null;
  lacp: string | null;
  interfaces: Array<{
    name: string;
    type: string;
    mac_address?: string;
    mtu?: number;
    admin_state?: string;
    link_state?: string;
  }>;
}

export const portsApi = {
  create: async (hostId: string, bridgeName: string, data: {
    name: string;
    port_type: string;
    options?: Record<string, string>;
  }): Promise<{ message: string }> => {
    const response = await api.post(`/api/hosts/${hostId}/bridges/${bridgeName}/ports`, data);
    return response.data;
  },

  get: async (hostId: string, portName: string): Promise<PortDetail> => {
    const response = await api.get(`/api/hosts/${hostId}/ports/${portName}`);
    return response.data;
  },

  update: async (hostId: string, portName: string, data: {
    tag?: number;
    trunks?: number[];
    vlan_mode?: string;
  }): Promise<{ message: string }> => {
    const response = await api.put(`/api/hosts/${hostId}/ports/${portName}`, data);
    return response.data;
  },

  delete: async (hostId: string, portName: string, bridgeName: string): Promise<{ message: string }> => {
    const response = await api.delete(`/api/hosts/${hostId}/ports/${portName}?bridge_name=${bridgeName}`);
    return response.data;
  },

  setVlan: async (hostId: string, portName: string, vlanId: number, mode: string): Promise<{ message: string }> => {
    const response = await api.put(`/api/hosts/${hostId}/ports/${portName}/vlan?vlan_id=${vlanId}&mode=${mode}`);
    return response.data;
  },

  listAvailable: async (hostId: string): Promise<string[]> => {
    const response = await api.get(`/api/hosts/${hostId}/ports/available`);
    return response.data;
  },
};

export const flowExportApi = {
  // NetFlow
  configureNetflow: async (hostId: string, bridgeName: string, data: {
    targets: string[];
    active_timeout?: number;
    engine_id?: number;
  }): Promise<{ message: string }> => {
    const response = await api.post(`/api/hosts/${hostId}/bridges/${bridgeName}/netflow`, data);
    return response.data;
  },

  getNetflowConfig: async (hostId: string, bridgeName: string): Promise<any> => {
    const response = await api.get(`/api/hosts/${hostId}/bridges/${bridgeName}/netflow`);
    return response.data;
  },

  disableNetflow: async (hostId: string, bridgeName: string): Promise<{ message: string }> => {
    const response = await api.delete(`/api/hosts/${hostId}/bridges/${bridgeName}/netflow`);
    return response.data;
  },

  // sFlow
  configureSflow: async (hostId: string, bridgeName: string, data: {
    targets: string[];
    sampling?: number;
    polling?: number;
  }): Promise<{ message: string }> => {
    const response = await api.post(`/api/hosts/${hostId}/bridges/${bridgeName}/sflow`, data);
    return response.data;
  },

  getSflowConfig: async (hostId: string, bridgeName: string): Promise<any> => {
    const response = await api.get(`/api/hosts/${hostId}/bridges/${bridgeName}/sflow`);
    return response.data;
  },

  disableSflow: async (hostId: string, bridgeName: string): Promise<{ message: string }> => {
    const response = await api.delete(`/api/hosts/${hostId}/bridges/${bridgeName}/sflow`);
    return response.data;
  },
};

// Diagnostics API
export interface DiagnosticResponse {
  success: boolean;
  output: string;
  error?: string;
}

export interface PingRequest {
  target: string;
  source_ip?: string;
  interface?: string;
  count?: number;
  timeout?: number;
}

export interface PacketTraceRequest {
  bridge: string;
  in_port: string;
  dl_src?: string;
  dl_dst?: string;
  dl_type?: string;
  nw_src?: string;
  nw_dst?: string;
  nw_proto?: string;
}

export const diagnosticsApi = {
  // Bridge Inspection
  getOvsTopology: async (hostId: string): Promise<DiagnosticResponse> => {
    const response = await api.get(`/api/hosts/${hostId}/diagnostics/ovs-topology`);
    return response.data;
  },

  getOpenFlowPorts: async (hostId: string, bridgeName: string): Promise<DiagnosticResponse> => {
    const response = await api.get(`/api/hosts/${hostId}/diagnostics/openflow-ports/${bridgeName}`);
    return response.data;
  },

  // MAC Learning
  getMacTable: async (hostId: string, bridgeName: string): Promise<DiagnosticResponse> => {
    const response = await api.get(`/api/hosts/${hostId}/diagnostics/mac-table/${bridgeName}`);
    return response.data;
  },

  // Flows & Tracing
  getFlows: async (hostId: string, bridgeName: string): Promise<DiagnosticResponse> => {
    const response = await api.get(`/api/hosts/${hostId}/diagnostics/flows/${bridgeName}`);
    return response.data;
  },

  tracePacket: async (hostId: string, request: PacketTraceRequest): Promise<DiagnosticResponse> => {
    const response = await api.post(`/api/hosts/${hostId}/diagnostics/packet-trace`, request);
    return response.data;
  },

  // Port Statistics
  getPortStats: async (hostId: string, bridgeName: string, portName?: string): Promise<DiagnosticResponse> => {
    const url = `/api/hosts/${hostId}/diagnostics/port-stats/${bridgeName}`;
    const response = await api.get(url, { params: portName ? { port_name: portName } : {} });
    return response.data;
  },

  getInterfaceStats: async (hostId: string, interfaceName: string): Promise<DiagnosticResponse> => {
    const response = await api.get(`/api/hosts/${hostId}/diagnostics/interface-stats/${interfaceName}`);
    return response.data;
  },

  // Network Testing
  getInterfacesWithIps: async (hostId: string): Promise<DiagnosticResponse> => {
    const response = await api.get(`/api/hosts/${hostId}/diagnostics/interfaces-with-ips`);
    return response.data;
  },

  ping: async (hostId: string, request: PingRequest): Promise<DiagnosticResponse> => {
    const response = await api.post(`/api/hosts/${hostId}/diagnostics/ping`, request);
    return response.data;
  },

  getArpTable: async (hostId: string, interfaceName?: string): Promise<DiagnosticResponse> => {
    const url = `/api/hosts/${hostId}/diagnostics/arp-table`;
    const response = await api.get(url, { params: interfaceName ? { interface: interfaceName } : {} });
    return response.data;
  },

  getInterfaceConfig: async (hostId: string, interfaceName: string): Promise<DiagnosticResponse> => {
    const response = await api.get(`/api/hosts/${hostId}/diagnostics/interface-config/${interfaceName}`);
    return response.data;
  },

  // Datapath
  getDatapathFlows: async (hostId: string): Promise<DiagnosticResponse> => {
    const response = await api.get(`/api/hosts/${hostId}/diagnostics/datapath-flows`);
    return response.data;
  },

  getBridgeProtocols: async (hostId: string, bridgeName: string): Promise<DiagnosticResponse> => {
    const response = await api.get(`/api/hosts/${hostId}/diagnostics/bridge-protocols/${bridgeName}`);
    return response.data;
  },

  getConnectivityMatrix: async (hostId: string, bridgeName: string): Promise<any> => {
    const response = await api.get(`/api/hosts/${hostId}/diagnostics/connectivity-matrix`, {
      params: { bridge_name: bridgeName }
    });
    return response.data;
  },

  // OVS Command Console
  executeOvsVsctl: async (hostId: string, command: string): Promise<DiagnosticResponse> => {
    const response = await api.post(`/api/hosts/${hostId}/diagnostics/ovs-vsctl`, { command });
    return response.data;
  },

  executeOvsOfctl: async (hostId: string, bridgeName: string, command: string): Promise<DiagnosticResponse> => {
    const response = await api.get(`/api/hosts/${hostId}/diagnostics/ovs-ofctl/${bridgeName}/${command}`);
    return response.data;
  },
};


// VM/Container Network Device Management
export const vmNetworkApi = {
  addVMNetworkDevice: async (hostId: string, vmid: number, request: {
    bridge: string;
    model?: string;
    firewall?: boolean;
    macaddr?: string;
    tag?: number;
    rate?: number;
  }): Promise<any> => {
    const response = await api.post(`/api/hosts/${hostId}/vms/${vmid}/network-devices`, {
      vmid,
      ...request
    });
    return response.data;
  },

  removeVMNetworkDevice: async (hostId: string, vmid: number, deviceId: string): Promise<any> => {
    const response = await api.delete(`/api/hosts/${hostId}/vms/${vmid}/network-devices/${deviceId}`);
    return response.data;
  },

  addContainerNetworkDevice: async (hostId: string, ctid: number, request: {
    bridge: string;
    name?: string;
    firewall?: boolean;
    hwaddr?: string;
    tag?: number;
    ip?: string;
    ip6?: string;
    rate?: number;
  }): Promise<any> => {
    const response = await api.post(`/api/hosts/${hostId}/containers/${ctid}/network-devices`, {
      ctid,
      ...request
    });
    return response.data;
  },

  removeContainerNetworkDevice: async (hostId: string, ctid: number, deviceId: string): Promise<any> => {
    const response = await api.delete(`/api/hosts/${hostId}/containers/${ctid}/network-devices/${deviceId}`);
    return response.data;
  },
};

// Demo mode wrapper - conditionally export demo APIs if in demo mode
if (IS_DEMO_MODE) {
  const {
    demoHostsApi,
    demoBridgesApi,
    demoMirrorsApi,
    demoVmsApi,
    demoContainersApi,
    demoPortsApi,
    demoStatisticsApi,
    demoDiagnosticsApi,
    demoFlowExportApi,
  } = require('../demo/demoApi');

  // Override exports with demo APIs
  Object.assign(module.exports, {
    hostsApi: demoHostsApi,
    bridgesApi: demoBridgesApi,
    mirrorsApi: demoMirrorsApi,
    vmsApi: demoVmsApi,
    containersApi: demoContainersApi,
    portsApi: { ...portsApi, ...demoPortsApi },
    statisticsApi: demoStatisticsApi,
    diagnosticsApi: demoDiagnosticsApi,
    flowExportApi: demoFlowExportApi,
    // Keep these as stubs that return demo data
    refreshApi: {
      refresh: async () => ({ status: 'success', message: 'Demo mode', bridges_count: 2, mirrors_count: 1, vms_count: 5 }),
    },
    cacheApi: {
      refreshBridges: async () => ({ status: 'success', message: 'Demo mode', count: 2 }),
      refreshMirrors: async () => ({ status: 'success', message: 'Demo mode', count: 1 }),
      refreshVMs: async () => ({ status: 'success', message: 'Demo mode', count: 5 }),
      refreshContainers: async () => ({ status: 'success', message: 'Demo mode', count: 2 }),
      invalidate: async () => ({ status: 'success', message: 'Demo mode', deleted: true }),
    },
    portMappingsApi: {
      get: async () => ({ host_id: 'proxmox-demo', hostname: '10.0.1.100', last_updated: new Date().toISOString(), ports: [] }),
      refresh: async () => ({ host_id: 'proxmox-demo', hostname: '10.0.1.100', last_updated: new Date().toISOString(), ports: [] }),
    },
    vmNetworkApi: {
      addVMNetworkDevice: async () => { throw new Error('Cannot modify VMs in demo mode'); },
      removeVMNetworkDevice: async () => { throw new Error('Cannot modify VMs in demo mode'); },
      addContainerNetworkDevice: async () => { throw new Error('Cannot modify containers in demo mode'); },
      removeContainerNetworkDevice: async () => { throw new Error('Cannot modify containers in demo mode'); },
    },
  });
}
